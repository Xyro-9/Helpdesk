// Szenario-Engine: Tickets erzeugen, Szenarien starten, Fortschritt prüfen und bewerten.
// Alle Funktionen arbeiten auf einem World-Draft (innerhalb von updateWorld).

import { SCENARIOS } from '@/content/scenarios'
import { compileCustomScenario } from '@/content/faults'
import { A } from '../actions'
import { ensureEndpoint } from '../ops/endpoint'
import { findUser, primaryComputerOf } from '../ops/ad'
import type { ActionEntry, Channel, MailMessage, Priority, ScenarioCtx, ScoreItem, ScoreResult, ScoreSection, Ticket, TicketCategory, TicketKind, World } from '../types'
import { containsAny, minutesFromNow, nowIso, uid } from '../util'
import type { CustomScenarioDef, Scenario } from './types'

// ─────────────── Katalog ───────────────

export function allScenarios(custom: CustomScenarioDef[] = []): Scenario[] {
  const compiled: Scenario[] = []
  for (const c of custom) {
    try {
      compiled.push(compileCustomScenario(c))
    } catch (e) {
      console.warn('Benutzerdefiniertes Szenario konnte nicht geladen werden', c.id, e)
    }
  }
  return [...SCENARIOS, ...compiled]
}

export const getScenario = (id: string | undefined, custom: CustomScenarioDef[] = []) => (id ? allScenarios(custom).find((s) => s.id === id) : undefined)

// ─────────────── Priorität & SLA ───────────────

/** ITIL-Prioritätsmatrix: Auswirkung × Dringlichkeit (1 = hoch) */
export function priorityFrom(impact: 1 | 2 | 3, urgency: 1 | 2 | 3): Priority {
  const s = impact + urgency
  if (s <= 2) return 'P1 – Kritisch'
  if (s === 3) return 'P2 – Hoch'
  if (s === 4) return 'P3 – Mittel'
  return 'P4 – Niedrig'
}

export function impactUrgencyFor(p: Priority): { impact: 1 | 2 | 3; urgency: 1 | 2 | 3 } {
  switch (p) {
    case 'P1 – Kritisch':
      return { impact: 1, urgency: 1 }
    case 'P2 – Hoch':
      return { impact: 2, urgency: 1 }
    case 'P3 – Mittel':
      return { impact: 2, urgency: 2 }
    default:
      return { impact: 3, urgency: 2 }
  }
}

/** SLA in Minuten (Trainingszeit – bewusst kurz) */
export const SLA: Record<Priority, { response: number; resolve: number }> = {
  'P1 – Kritisch': { response: 5, resolve: 30 },
  'P2 – Hoch': { response: 10, resolve: 45 },
  'P3 – Mittel': { response: 15, resolve: 60 },
  'P4 – Niedrig': { response: 30, resolve: 120 },
}

export const PRIORITIES: Priority[] = ['P1 – Kritisch', 'P2 – Hoch', 'P3 – Mittel', 'P4 – Niedrig']
export const CATEGORIES: TicketCategory[] = ['Konto & Zugriff', 'Hardware', 'Netzwerk', 'Drucker', 'Software', 'E-Mail & Cloud', 'Sicherheit', 'Onboarding/Offboarding', 'Sonstiges']

// ─────────────── Protokoll ───────────────

export function logAction(w: World, entry: Omit<ActionEntry, 'id' | 'time'>) {
  w.actionLog.push({ id: uid('act'), time: nowIso(), ...entry })
  if (w.actionLog.length > 3000) w.actionLog.splice(0, w.actionLog.length - 3000)
}

// ─────────────── Tickets ───────────────

export interface NewTicketInput {
  title: string
  description: string
  requester: string
  channel: Channel
  category?: TicketCategory
  kind?: TicketKind
  priority?: Priority
  scenarioId?: string
  assignee?: string
  status?: Ticket['status']
  attachments?: { name: string; content: string }[]
  tags?: string[]
}

export function createTicket(w: World, input: NewTicketInput): Ticket {
  const id = `T-${++w.counters.ticket}`
  const priority = input.priority ?? 'P3 – Mittel'
  const { impact, urgency } = impactUrgencyFor(priority)
  const sla = SLA[priority]
  const now = new Date()
  const t: Ticket = {
    id,
    kind: input.kind ?? 'Störung',
    title: input.title,
    description: input.description,
    requester: input.requester,
    channel: input.channel,
    category: input.category ?? 'Sonstiges',
    impact,
    urgency,
    priority,
    status: input.status ?? 'Neu',
    assignee: input.assignee,
    assignmentGroup: '1st Level Support',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    slaResponseDue: minutesFromNow(sla.response, now),
    slaResolveDue: minutesFromNow(sla.resolve, now),
    workNotes: [],
    comments: [],
    attachments: input.attachments ?? [],
    linkedAssets: [],
    linkedKb: [],
    scenarioId: input.scenarioId,
    timeSpentMin: 0,
    tags: input.tags ?? [],
  }
  w.tickets.unshift(t)
  logAction(w, { type: A.ticketCreated, ticketId: id, target: input.requester, detail: input.channel })
  return t
}

export const findTicket = (w: World, id: string) => w.tickets.find((t) => t.id === id)

/** SLA neu berechnen, wenn sich die Priorität ändert (ab Erstellung) */
export function recalcSla(t: Ticket) {
  const sla = SLA[t.priority]
  const created = new Date(t.createdAt)
  t.slaResponseDue = minutesFromNow(sla.response, created)
  t.slaResolveDue = minutesFromNow(sla.resolve, created)
}

export function addMail(w: World, m: Omit<MailMessage, 'id' | 'date' | 'read' | 'flagged' | 'cc' | 'attachments' | 'folder'> & Partial<Pick<MailMessage, 'cc' | 'attachments' | 'folder' | 'date' | 'read'>>): MailMessage {
  const mail: MailMessage = { id: uid('mail'), date: nowIso(), read: false, flagged: false, cc: [], attachments: [], folder: 'Posteingang', ...m }
  w.mails.unshift(mail)
  return mail
}

// ─────────────── Szenario starten ───────────────

export function spawnScenario(w: World, s: Scenario): Ticket {
  const requester = findUser(w, s.requester)
  // Endpunkt des Benutzers materialisieren, damit das Setup ihn verändern kann
  const pc = requester ? primaryComputerOf(w, requester.sam) : undefined
  if (pc) ensureEndpoint(w, pc.name)

  const pending = s.channel === 'Telefon'
  const ticket = createTicket(w, {
    title: s.ticket.title,
    description: pending ? `Telefonischer Anruf von ${requester?.displayName ?? s.requester}.\n\n(Problembeschreibung bitte während des Gesprächs in den Arbeitsnotizen dokumentieren.)` : s.ticket.description,
    requester: s.requester,
    channel: s.channel,
    kind: s.ticket.kind ?? 'Störung',
    category: s.channel === 'Portal' ? s.category : 'Sonstiges',
    priority: 'P3 – Mittel',
    scenarioId: s.id,
    attachments: s.ticket.attachments,
    tags: pending ? ['anruf-ausstehend'] : [],
  })
  if (pending) ticket.title = `Anruf: ${requester?.displayName ?? s.requester}`
  const ctx: ScenarioCtx = { ticketId: ticket.id, startedAt: nowIso(), requester: s.requester, vars: {}, hintsUsed: 0 }
  ticket.scenarioCtx = ctx
  s.setup(w, ctx)

  const who = requester ? { name: requester.displayName, address: requester.mail } : { name: s.requester, address: `${s.requester}@musterwerk.example` }
  switch (s.channel) {
    case 'E-Mail':
      addMail(w, { from: who, to: [w.company.helpdeskMail], subject: s.ticket.title, body: s.ticket.description, ticketId: ticket.id })
      break
    case 'Chat':
      w.chats.unshift({
        id: uid('chat'),
        with: s.requester,
        ticketId: ticket.id,
        scenarioId: s.id,
        open: true,
        unread: 1,
        messages: [{ id: uid('m'), from: 'user', text: s.caller.intro, time: nowIso() }],
      })
      break
    case 'Telefon':
      w.calls.unshift({
        id: uid('call'),
        from: s.requester,
        number: requester?.phone ?? 'unbekannt',
        ticketId: ticket.id,
        scenarioId: s.id,
        state: 'klingelt',
        ringingSince: nowIso(),
        transcript: [],
        direction: 'eingehend',
      })
      break
    default:
      break
  }
  for (const m of s.extraMails?.(w, ctx) ?? []) {
    const u = findUser(w, m.fromSam)
    addMail(w, {
      from: m.fromOverride ?? { name: u?.displayName ?? m.fromSam, address: u?.mail ?? m.fromSam },
      to: [w.company.helpdeskMail],
      subject: m.subject,
      body: m.body,
      attachments: m.attachments ?? [],
      malicious: m.malicious,
      ticketId: ticket.id,
    })
  }
  return ticket
}

// ─────────────── Fortschritt / Bewertung ───────────────

export function technicalStatus(w: World, t: Ticket, s: Scenario) {
  const ctx = t.scenarioCtx!
  const items = s.checks.map((c) => {
    let ok = false
    try {
      ok = c.test(w, ctx)
    } catch {
      ok = false
    }
    return { id: c.id, label: c.label, ok, points: c.points, hint: c.hint }
  })
  return { items, passed: items.every((i) => i.ok), earned: items.filter((i) => i.ok).reduce((a, i) => a + i.points, 0), max: items.reduce((a, i) => a + i.points, 0) }
}

const SENSITIVE = new Set<string>([A.adPasswordReset, A.cloudMfaReset, A.adBitlockerViewed, A.cloudPasswordReset, A.adLapsViewed])

function gradeFor(p: number): ScoreResult['grade'] {
  if (p >= 92) return 'Sehr gut'
  if (p >= 81) return 'Gut'
  if (p >= 67) return 'Befriedigend'
  if (p >= 50) return 'Ausreichend'
  if (p >= 30) return 'Mangelhaft'
  return 'Ungenügend'
}

const asArray = <T,>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v])

export function evaluateTicket(w: World, t: Ticket, s: Scenario): ScoreResult {
  const ctx = t.scenarioCtx!
  const log = w.actionLog.filter((a) => a.ticketId === t.id || (a.target === t.requester && a.time >= ctx.startedAt))
  const sections: ScoreSection[] = []
  const feedback: string[] = []

  // 1) Technik (50)
  const tech = technicalStatus(w, t, s)
  const techMax = 50
  const techItems: ScoreItem[] = tech.items.map((i) => ({ label: i.label, ok: i.ok, points: i.ok ? Math.round((i.points / Math.max(1, tech.max)) * techMax) : 0, max: Math.round((i.points / Math.max(1, tech.max)) * techMax), hint: i.ok ? undefined : i.hint }))
  sections.push({ key: 'technik', label: 'Technische Lösung', earned: techItems.reduce((a, i) => a + i.points, 0), max: techItems.reduce((a, i) => a + i.max, 0), items: techItems })
  if (!tech.passed) feedback.push('Das eigentliche Problem ist noch nicht vollständig behoben – prüfe die offenen Punkte im Bereich "Technische Lösung".')

  // 2) Dokumentation (20)
  const notes = [...t.workNotes.map((n) => n.text), t.resolutionNote ?? ''].join('\n')
  const docItems: ScoreItem[] = []
  const kwCount = Math.max(1, s.workNoteKeywords.length)
  const kwPoints = Math.floor(14 / kwCount)
  for (const k of s.workNoteKeywords) {
    const ok = containsAny(notes, k.any)
    docItems.push({ label: `Arbeitsnotiz: ${k.label}`, ok, points: ok ? kwPoints : 0, max: kwPoints, hint: ok ? undefined : `Erwähne z. B.: ${k.any.slice(0, 3).join(', ')}` })
  }
  const lenOk = notes.replace(/\s+/g, ' ').trim().length >= 120
  docItems.push({ label: 'Nachvollziehbare Dokumentation (mind. 120 Zeichen)', ok: lenOk, points: lenOk ? 3 : 0, max: 3 })
  const resOk = (t.resolutionNote ?? '').trim().length >= 20
  docItems.push({ label: 'Lösungsbeschreibung beim Abschluss', ok: resOk, points: resOk ? 3 : 0, max: 3 })
  sections.push({ key: 'dokumentation', label: 'Dokumentation', earned: docItems.reduce((a, i) => a + i.points, 0), max: docItems.reduce((a, i) => a + i.max, 0), items: docItems })

  // 3) Kommunikation (15)
  const commItems: ScoreItem[] = []
  const informed = t.comments.length > 0 || log.some((a) => [A.mailSent, A.chatSent, A.userInformed].includes(a.type as never)) || log.some((a) => a.type === A.callAccepted)
  commItems.push({ label: 'Benutzer informiert / Kontakt aufgenommen', ok: informed, points: informed ? 5 : 0, max: 5, hint: 'Antworte dem Benutzer (Ticket-Kommentar, Mail, Chat oder Anruf).' })
  const confirmed = log.some((a) => a.type === A.confirmAsked)
  commItems.push({ label: 'Lösung beim Benutzer bestätigen lassen', ok: confirmed, points: confirmed ? 5 : 0, max: 5, hint: 'Frage nach: "Funktioniert es jetzt wieder?"' })
  if (s.identityRequired) {
    const firstSensitive = log.find((a) => SENSITIVE.has(a.type))
    const idAsk = log.find((a) => a.type === A.identityAsked)
    const ok = !!idAsk && (!firstSensitive || idAsk.time <= firstSensitive.time)
    commItems.push({ label: 'Identität vor sensibler Aktion geprüft', ok, points: ok ? 5 : 0, max: 5, hint: 'Vor Kennwort-/MFA-/BitLocker-Aktionen Personalnummer und Geburtsdatum abfragen und mit dem AD vergleichen.' })
    if (!ok) feedback.push('Wichtig: Ohne Identitätsprüfung dürfen keine Kennwörter, MFA-Methoden oder Wiederherstellungsschlüssel herausgegeben werden (Social Engineering!).')
  } else {
    const consent = log.some((a) => a.type === A.remoteConsent) || !log.some((a) => a.type === A.rdpConnected)
    commItems.push({ label: 'Einverständnis für Fernzugriff eingeholt (falls verbunden)', ok: consent, points: consent ? 5 : 0, max: 5, hint: 'Vor einer Remote-Sitzung fragen: "Darf ich mich auf Ihren PC aufschalten?"' })
  }
  sections.push({ key: 'kommunikation', label: 'Kommunikation', earned: commItems.reduce((a, i) => a + i.points, 0), max: commItems.reduce((a, i) => a + i.max, 0), items: commItems })

  // 4) Prozess (15)
  const procItems: ScoreItem[] = []
  const claimed = log.some((a) => a.type === A.ticketClaimed) || t.assignee === 'trainee'
  procItems.push({ label: 'Ticket übernommen', ok: claimed, points: claimed ? 3 : 0, max: 3 })
  const expCat = asArray(s.expected?.category ?? s.category)
  const catOk = expCat.includes(t.category)
  procItems.push({ label: `Kategorie korrekt (${expCat.join(' / ')})`, ok: catOk, points: catOk ? 3 : 0, max: 3, hint: catOk ? undefined : `Gewählt: ${t.category}` })
  const expPrio = asArray(s.expected?.priority)
  if (expPrio.length) {
    const ok = expPrio.includes(t.priority)
    procItems.push({ label: `Priorität angemessen (${expPrio.join(' / ')})`, ok, points: ok ? 3 : 0, max: 3, hint: ok ? undefined : `Gewählt: ${t.priority} – Auswirkung × Dringlichkeit beachten.` })
  }
  const slaOk = !t.resolvedAt || t.resolvedAt <= t.slaResolveDue
  procItems.push({ label: 'Lösungszeit (SLA) eingehalten', ok: slaOk, points: slaOk ? 3 : 0, max: 3 })
  const expCodes = s.expected?.resolutionCodes
  if (expCodes?.length) {
    const ok = !!t.resolutionCode && expCodes.includes(t.resolutionCode)
    procItems.push({ label: `Passender Abschlusscode (${expCodes.join(' / ')})`, ok, points: ok ? 3 : 0, max: 3 })
  } else {
    const ok = !!t.resolutionCode
    procItems.push({ label: 'Abschlusscode gesetzt', ok, points: ok ? 3 : 0, max: 3 })
  }
  sections.push({ key: 'prozess', label: 'Prozess & Triage', earned: procItems.reduce((a, i) => a + i.points, 0), max: procItems.reduce((a, i) => a + i.max, 0), items: procItems })

  // 5) Abzüge
  const penItems: ScoreItem[] = []
  for (const p of s.penalties ?? []) {
    let hit = false
    try {
      hit = p.test(w, ctx)
    } catch {
      hit = false
    }
    if (hit) penItems.push({ label: p.label, ok: false, points: -p.points, max: 0 })
  }
  const req = findUser(w, t.requester)
  if (req && req.password.length >= 6 && notes.includes(req.password)) penItems.push({ label: 'Kennwort im Klartext im Ticket dokumentiert', ok: false, points: -5, max: 0 })
  const leaked = log.filter((a) => a.type === A.secretShared && a.detail && a.detail !== 'Telefon')
  if (leaked.length) penItems.push({ label: `Vertrauliche Daten per ${[...new Set(leaked.map((l) => l.detail))].join('/')} übermittelt (nur telefonisch nach Identitätsprüfung!)`, ok: false, points: -8, max: 0 })
  if (ctx.hintsUsed) penItems.push({ label: `${ctx.hintsUsed} Tipp(s) verwendet`, ok: false, points: -2 * ctx.hintsUsed, max: 0 })
  sections.push({ key: 'abzuege', label: 'Abzüge', earned: penItems.reduce((a, i) => a + i.points, 0), max: 0, items: penItems })

  const max = sections.reduce((a, s2) => a + s2.max, 0)
  const earned = Math.max(0, sections.reduce((a, s2) => a + s2.earned, 0))
  const percent = Math.round((earned / Math.max(1, max)) * 100)
  if (sections[1].earned < sections[1].max * 0.6) feedback.push('Dokumentiere ausführlicher: Symptom, Ursache, durchgeführte Schritte und Ergebnis.')
  if (penItems.length) feedback.push('Achte auf die Abzüge – sie zeigen typische Fehler im Helpdesk-Alltag.')
  if (percent >= 92) feedback.push('Hervorragend – so würde es auch ein erfahrener Kollege lösen!')

  return {
    ticketId: t.id,
    scenarioId: s.id,
    scenarioTitle: s.title,
    earned,
    max,
    percent,
    grade: gradeFor(percent),
    passed: percent >= 50 && tech.passed,
    sections,
    feedback,
    durationMin: Math.round((Date.now() - new Date(ctx.startedAt).getTime()) / 60000),
    hintsUsed: ctx.hintsUsed,
    evaluatedAt: nowIso(),
    solution: s.solution,
  }
}

/** Nächsten Tipp holen (zählt als Abzug) */
export function takeHint(w: World, t: Ticket, s: Scenario): string | undefined {
  const ctx = t.scenarioCtx
  if (!ctx) return undefined
  const hint = s.hints[ctx.hintsUsed]
  if (!hint) return undefined
  ctx.hintsUsed += 1
  logAction(w, { type: A.hintUsed, ticketId: t.id, detail: hint })
  return hint
}

// ─────────────── Schichtbetrieb / Ticker ───────────────

export function pickNextScenario(w: World, list: Scenario[]): Scenario | undefined {
  const diff = w.shift.difficulty
  const candidates = list.filter((s) => (diff === 0 || s.difficulty === diff) && !w.shift.spawned.includes(s.id) && !w.tickets.some((t) => t.scenarioId === s.id && !['Gelöst', 'Geschlossen'].includes(t.status)))
  if (!candidates.length) return undefined
  return candidates[Math.floor(Math.random() * candidates.length)]
}

/** Wird ca. alle 5 Sekunden aufgerufen */
export function tickWorld(w: World, custom: CustomScenarioDef[]): { spawned?: Ticket; missedCalls: string[] } {
  const res: { spawned?: Ticket; missedCalls: string[] } = { missedCalls: [] }
  const now = Date.now()
  // Schicht: neue Tickets
  if (w.shift.active && w.shift.nextArrivalAt && new Date(w.shift.nextArrivalAt).getTime() <= now) {
    if (w.shift.spawned.length < w.shift.maxTickets) {
      const s = pickNextScenario(w, allScenarios(custom))
      if (s) {
        res.spawned = spawnScenario(w, s)
        w.shift.spawned.push(s.id)
      }
    }
    const jitter = 0.6 + Math.random() * 0.8
    w.shift.nextArrivalAt = minutesFromNow(w.shift.intervalMin * jitter)
    if (w.shift.spawned.length >= w.shift.maxTickets) w.shift.nextArrivalAt = undefined
  }
  // Verpasste Anrufe (nach 90 Sekunden)
  for (const c of w.calls) {
    if (c.state === 'klingelt' && now - new Date(c.ringingSince).getTime() > 90_000) {
      c.state = 'verpasst'
      res.missedCalls.push(c.id)
      const t = c.ticketId ? findTicket(w, c.ticketId) : undefined
      const u = findUser(w, c.from)
      if (t) {
        t.tags = t.tags.filter((x) => x !== 'anruf-ausstehend')
        t.title = `Rückruf erbeten: ${u?.displayName ?? c.from}`
        t.description = `Verpasster Anruf von ${u?.displayName ?? c.from} (${c.number}). Bitte zurückrufen.`
        t.workNotes.push({ id: uid('n'), author: 'System', text: 'Anruf nicht angenommen – Mailbox-Nachricht: "Hallo, hier ist ' + (u?.givenName ?? '') + ', bitte rufen Sie mich zurück, es ist dringend."', time: nowIso() })
      }
    }
  }
  // Szenario-Ticks
  for (const t of w.tickets) {
    if (!t.scenarioId || ['Gelöst', 'Geschlossen'].includes(t.status) || !t.scenarioCtx) continue
    const s = getScenario(t.scenarioId, custom)
    try {
      s?.tick?.(w, t.scenarioCtx)
    } catch (e) {
      console.warn('Szenario-Tick fehlgeschlagen', s?.id, e)
    }
  }
  return res
}
