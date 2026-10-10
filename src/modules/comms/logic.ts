// Kommunikationslogik ohne React: Telefonate, Chats und E-Mails mit simulierten Benutzern.
// Alle Funktionen lesen den aktuellen Zustand über useStore.getState() (keine veralteten Closures)
// und laufen unabhängig vom Lebenszyklus der Komponenten (StrictMode-sicher).

import { A } from '@/core/actions'
import { findUser } from '@/core/ops/ad'
import { callerReply, callerSystemPrompt, type CallerReply } from '@/core/scenarios/caller'
import { addMail, findTicket, getScenario, logAction, technicalStatus } from '@/core/scenarios/engine'
import type { Scenario } from '@/core/scenarios/types'
import { useStore } from '@/core/store'
import type { AdUser, Call, ChatMessage, MailMessage, Ticket, World } from '@/core/types'
import { fmtDateTime, nowIso, uid } from '@/core/util'
import { aiCallerReply, type AiTurn } from './ai'
import { speak, stopSpeaking } from './speech'
import { useCommsUi } from './store'

/** Eigener Aktionstyp: eingehender Anruf abgelehnt (nicht in core/actions.ts) */
export const CALL_DECLINED = 'comm.callDeclined'
/** Eigener Aktionstyp laut Vorgabe: Mail als Phishing gemeldet */
export const MAIL_REPORTED_PHISHING = 'mail.reportedPhishing'

const st = () => useStore.getState()
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// ─────────────── Hilfsfunktionen ───────────────

export const isOpenTicket = (t: Ticket) => !t.historical && t.status !== 'Gelöst' && t.status !== 'Geschlossen'

/** Offenes Ticket eines Benutzers: bevorzugt das aktive Ticket, dann ein Szenario-Ticket, dann das neueste */
export function openTicketOf(w: World, sam: string, activeId?: string): Ticket | undefined {
  const mine = w.tickets.filter((t) => t.requester === sam && isOpenTicket(t))
  return mine.find((t) => t.id === activeId) ?? mine.find((t) => !!t.scenarioId && !!t.scenarioCtx) ?? mine[0]
}

/** Ticket + Szenario zu einer Ticket-ID (Szenario nur bei Trainings-Tickets) */
export function scenarioContext(ticketId?: string): { ticket?: Ticket; scenario?: Scenario } {
  const s = st()
  const ticket = ticketId ? findTicket(s.world, ticketId) : undefined
  const scenario = ticket?.scenarioId && ticket.scenarioCtx ? getScenario(ticket.scenarioId, s.customScenarios) : undefined
  return { ticket, scenario }
}

/** Gesprächsdauer "m:ss" bzw. "h:mm:ss" */
export function fmtDuration(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const sec = String(total % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

export const callDurationMs = (c: Call) => (c.startedAt ? (c.endedAt ? new Date(c.endedAt).getTime() : Date.now()) - new Date(c.startedAt).getTime() : 0)

function logCallerActions(w: World, actions: CallerReply['actions'], ticketId: string | undefined, target: string) {
  for (const a of actions) logAction(w, { type: a.type, detail: a.detail, ticketId, target })
}

/** Benutzer hat geantwortet: "Wartet auf Benutzer" → "In Bearbeitung" */
function userResponded(w: World, ticketId: string | undefined) {
  const t = ticketId ? findTicket(w, ticketId) : undefined
  if (!t || t.status !== 'Wartet auf Benutzer') return
  t.status = 'In Bearbeitung'
  t.updatedAt = nowIso()
  logAction(w, { type: A.ticketStatus, ticketId: t.id, detail: 'In Bearbeitung (Antwort des Benutzers)' })
}

function replyDelay(text: string) {
  const base = Math.max(0, st().settings.replyDelayMs)
  return Math.round(base + Math.random() * base * 0.6 + Math.min(2000, text.length * 12))
}

const REPEATED_INTRO = 'Ja, hallo! Wie gesagt, es geht um das, was ich eben geschildert habe – können Sie mir da helfen?'

/** Verhindert, dass der Benutzer sein Anliegen wortgleich wiederholt (z. B. nach der Begrüßung) */
function avoidRepeatedIntro(text: string, intro: string | undefined, history: ChatMessage[]) {
  if (!intro || !text.includes(intro)) return text
  if (!history.some((m) => m.from === 'user' && m.text.includes(intro))) return text
  return text.replace(intro, REPEATED_INTRO)
}

// ─────────────── Antworten (regelbasiert + optional KI) ───────────────

interface ReplyJob {
  kind: 'call' | 'chat'
  id: string
  requester: string
  ticketId?: string
  scenario?: Scenario
  /** Verlauf inklusive der neuen Nachricht des Azubis */
  history: ChatMessage[]
  rule: CallerReply
}

let lastAiErrorAt = 0

function systemPromptFor(job: ReplyJob) {
  const w = st().world
  const parts = [callerSystemPrompt(w, job.requester, job.scenario)]
  parts.push(
    job.kind === 'call'
      ? 'Kanal: Du telefonierst gerade mit dem IT-Service-Desk. Antworte so, wie man am Telefon spricht – ohne Emojis, ohne Aufzählungen, ohne Regieanweisungen in Klammern.'
      : 'Kanal: Du chattest gerade im Firmen-Chat mit dem IT-Service-Desk. Schreibe kurze, natürliche Chatnachrichten.',
  )
  const ticket = job.ticketId ? findTicket(w, job.ticketId) : undefined
  if (job.scenario && ticket?.scenarioCtx) {
    const passed = technicalStatus(w, ticket, job.scenario).passed
    parts.push(passed ? 'Aktueller Stand: Das Problem ist inzwischen behoben – wenn du es ausprobierst, funktioniert alles wieder.' : 'Aktueller Stand: Das Problem besteht weiterhin.')
  }
  parts.push(
    `Inhaltliche Vorgabe der Simulation für deine nächste Antwort: "${job.rule.text}"\nÜbernimm Fakten daraus verbindlich (z. B. Personalnummer, Geburtsdatum, Rechnername, ob es jetzt funktioniert), formuliere aber frei und passend zur letzten Nachricht. Ist die Vorgabe nur ausweichend, antworte frei im Rahmen deiner Rolle.`,
  )
  return parts.join('\n\n')
}

function toTurns(history: ChatMessage[]): AiTurn[] {
  return history.filter((m) => m.from !== 'system').map((m) => ({ role: m.from === 'tech' ? 'user' : 'assistant', content: m.text }))
}

async function deliverReply(job: ReplyJob) {
  const ui = useCommsUi.getState()
  ui.beginTyping(job.id)
  try {
    let text = avoidRepeatedIntro(job.rule.text, job.scenario?.caller.intro, job.history.slice(0, -1))
    const wait = sleep(replyDelay(text))
    const { ai } = st().settings
    if (ai.enabled && ai.apiKey.trim()) {
      try {
        text = await aiCallerReply({
          apiKey: ai.apiKey,
          model: ai.model,
          system: systemPromptFor(job),
          turns: toTurns(job.history),
          opener: job.kind === 'call' ? '(Das Telefonat mit dem Service Desk beginnt.)' : '(Der Chat mit dem Service Desk beginnt.)',
        })
      } catch (e) {
        if (Date.now() - lastAiErrorAt > 20_000) {
          lastAiErrorAt = Date.now()
          st().toast(`KI-Anrufer nicht verfügbar (${(e as Error).message}) – regelbasierte Antwort wird verwendet.`, 'warning')
        }
      }
    }
    await wait
    const s = st()
    if (job.kind === 'call') {
      const call = s.world.calls.find((c) => c.id === job.id)
      if (!call || call.state === 'beendet' || call.state === 'verpasst') return
      s.updateWorld((w) => {
        const c = w.calls.find((x) => x.id === job.id)
        if (!c) return
        c.transcript.push({ id: uid('m'), from: 'user', text, time: nowIso() })
        if (job.rule.goodbye) c.transcript.push({ id: uid('m'), from: 'system', text: 'Der Anrufer verabschiedet sich – Sie können das Gespräch beenden.', time: nowIso() })
        userResponded(w, c.ticketId)
      })
      if (s.settings.tts) speak(text, job.requester)
    } else {
      if (!s.world.chats.some((c) => c.id === job.id)) return
      s.updateWorld((w) => {
        const t = w.chats.find((x) => x.id === job.id)
        if (!t) return
        t.messages.push({ id: uid('m'), from: 'user', text, time: nowIso() })
        t.unread += 1
        userResponded(w, t.ticketId)
      })
    }
  } finally {
    useCommsUi.getState().endTyping(job.id)
  }
}

// ─────────────── Telefon ───────────────

/** Eingehenden Anruf annehmen: Ticket sichtbar machen, übernehmen, aktiv setzen; Anrufer schildert sein Anliegen */
export function acceptCall(callId: string) {
  const s = st()
  const call = s.world.calls.find((c) => c.id === callId)
  if (!call || call.state !== 'klingelt') return
  const { scenario } = scenarioContext(call.ticketId)
  const u = findUser(s.world, call.from)
  const intro = scenario?.caller.intro ?? `Hallo, hier ist ${u?.displayName ?? 'ein Kollege'}${u?.department ? ` aus der Abteilung ${u.department}` : ''}. Ich hätte da eine Frage.`
  s.updateWorld((w) => {
    for (const c of w.calls) if (c.id !== callId && c.state === 'aktiv') c.state = 'gehalten'
    const c = w.calls.find((x) => x.id === callId)
    if (!c) return
    c.state = 'aktiv'
    c.startedAt = nowIso()
    c.transcript.push({ id: uid('m'), from: 'user', text: intro, time: nowIso() })
    const t = c.ticketId ? findTicket(w, c.ticketId) : undefined
    if (t) {
      t.tags = t.tags.filter((x) => x !== 'anruf-ausstehend')
      t.updatedAt = nowIso()
    }
  })
  if (call.ticketId) {
    s.claimTicket(call.ticketId)
    s.setActiveTicket(call.ticketId)
  }
  s.updateWorld((w) => logAction(w, { type: A.callAccepted, ticketId: call.ticketId, target: call.from }))
  useCommsUi.getState().setOverlayCollapsed(false)
  if (s.settings.tts) speak(intro, call.from)
}

/** Eingehenden Anruf ablehnen – wie ein verpasster Anruf (Rückruf-Ticket) */
export function declineCall(callId: string) {
  const s = st()
  const call = s.world.calls.find((c) => c.id === callId)
  if (!call || call.state !== 'klingelt') return
  s.updateWorld((w) => {
    const c = w.calls.find((x) => x.id === callId)
    if (!c) return
    c.state = 'verpasst'
    c.endedAt = nowIso()
    const t = c.ticketId ? findTicket(w, c.ticketId) : undefined
    const u = findUser(w, c.from)
    if (t) {
      t.tags = t.tags.filter((x) => x !== 'anruf-ausstehend')
      t.title = `Rückruf erbeten: ${u?.displayName ?? c.from}`
      t.description = `Verpasster Anruf von ${u?.displayName ?? c.from} (${c.number}). Bitte zurückrufen.`
      t.workNotes.push({ id: uid('n'), author: 'System', text: 'Anruf nicht angenommen – Mailbox-Nachricht: "Hallo, hier ist ' + (u?.givenName ?? '') + ', bitte rufen Sie mich zurück, es ist dringend."', time: nowIso() })
      t.updatedAt = nowIso()
    }
    logAction(w, { type: CALL_DECLINED, ticketId: c.ticketId, target: c.from })
  })
  s.toast('Anruf abgelehnt – Rückruf-Ticket wurde angelegt.', 'warning')
}

export function holdCall(callId: string) {
  st().updateWorld((w) => {
    const c = w.calls.find((x) => x.id === callId)
    if (!c || c.state !== 'aktiv') return
    c.state = 'gehalten'
    c.transcript.push({ id: uid('m'), from: 'system', text: 'Gespräch wird gehalten (Wartemusik).', time: nowIso() })
  })
  stopSpeaking()
}

export function resumeCall(callId: string) {
  st().updateWorld((w) => {
    const c = w.calls.find((x) => x.id === callId)
    if (!c || c.state !== 'gehalten') return
    for (const o of w.calls) if (o.id !== callId && o.state === 'aktiv') o.state = 'gehalten'
    c.state = 'aktiv'
    c.transcript.push({ id: uid('m'), from: 'system', text: 'Gespräch fortgesetzt.', time: nowIso() })
  })
}

/** Auflegen */
export function hangUp(callId: string) {
  const s = st()
  const call = s.world.calls.find((c) => c.id === callId)
  if (!call || (call.state !== 'aktiv' && call.state !== 'gehalten')) return
  const duration = fmtDuration(callDurationMs(call))
  s.updateWorld((w) => {
    const c = w.calls.find((x) => x.id === callId)
    if (!c) return
    c.state = 'beendet'
    c.endedAt = nowIso()
    logAction(w, { type: A.callEnded, ticketId: c.ticketId, target: c.from, detail: `Dauer ${duration}` })
  })
  stopSpeaking()
}

export function linkCallTicket(callId: string, ticketId: string) {
  st().updateWorld((w) => {
    const c = w.calls.find((x) => x.id === callId)
    if (!c) return
    c.ticketId = ticketId
    c.scenarioId = findTicket(w, ticketId)?.scenarioId
  })
}

/** Etwas im Telefonat sagen (Azubi → Anrufer) */
export function sayOnCall(callId: string, raw: string) {
  const text = raw.trim()
  if (!text) return
  const s = st()
  const call = s.world.calls.find((c) => c.id === callId)
  if (!call || call.state !== 'aktiv') return
  const { ticket, scenario } = scenarioContext(call.ticketId)
  const turn = call.transcript.filter((m) => m.from === 'tech').length
  const rule = callerReply(s.world, { requester: call.from, message: text, channel: 'Telefon', ticket, scenario, turn })
  const msg: ChatMessage = { id: uid('m'), from: 'tech', text, time: nowIso() }
  s.updateWorld((w) => {
    const c = w.calls.find((x) => x.id === callId)
    if (!c) return
    c.transcript.push(msg)
    logCallerActions(w, rule.actions, c.ticketId, c.from)
  })
  void deliverReply({ kind: 'call', id: callId, requester: call.from, ticketId: call.ticketId, scenario, history: [...call.transcript, msg], rule })
}

/**
 * Ausgehenden Anruf starten (für Telefon-Modul und Ticket-Modul).
 * target: sam, Anzeigename, Mailadresse oder Rufnummer. Gibt die Call-ID zurück.
 */
export function startOutgoingCall(target: string, ticketId?: string): string | undefined {
  const s = st()
  const q = target.trim()
  const norm = (n: string) => n.replace(/[^\d+]/g, '')
  const u = findUser(s.world, q) ?? (norm(q).length >= 3 ? s.world.users.find((x) => norm(x.phone) === norm(q) || (x.mobile && norm(x.mobile) === norm(q)) || norm(x.phone).endsWith(norm(q))) : undefined)
  if (!u) {
    s.toast('Kein Benutzer mit diesem Namen bzw. dieser Rufnummer gefunden.', 'error')
    return undefined
  }
  if (u.sam === s.world.tech.sam) {
    s.toast('Sie können sich nicht selbst anrufen.', 'warning')
    return undefined
  }
  const existing = s.world.calls.find((c) => c.from === u.sam && (c.state === 'aktiv' || c.state === 'gehalten'))
  if (existing) {
    if (existing.state === 'gehalten') resumeCall(existing.id)
    s.toast(`Mit ${u.displayName} besteht bereits ein Gespräch.`, 'info')
    return existing.id
  }
  const t = (ticketId ? findTicket(s.world, ticketId) : undefined) ?? openTicketOf(s.world, u.sam, s.activeTicketId)
  const id = uid('call')
  const number = u.phone || u.mobile || 'unbekannt'
  s.updateWorld((w) => {
    for (const c of w.calls) if (c.state === 'aktiv') c.state = 'gehalten'
    w.calls.unshift({ id, from: u.sam, number, ticketId: t?.id, scenarioId: t?.scenarioId, state: 'aktiv', ringingSince: nowIso(), startedAt: nowIso(), transcript: [], direction: 'ausgehend' })
    logAction(w, { type: A.callOutgoing, ticketId: t?.id, target: u.sam, detail: number })
  })
  useCommsUi.getState().setOverlayCollapsed(false)
  // Benutzer nimmt nach kurzem Klingeln ab
  useCommsUi.getState().beginTyping(id)
  setTimeout(
    () => {
      useCommsUi.getState().endTyping(id)
      const s2 = st()
      const c = s2.world.calls.find((x) => x.id === id)
      if (!c || c.state === 'beendet' || c.state === 'verpasst') return
      const text = `${u.displayName}, hallo?`
      s2.updateWorld((w) => {
        w.calls.find((x) => x.id === id)?.transcript.push({ id: uid('m'), from: 'user', text, time: nowIso() })
      })
      if (s2.settings.tts) speak(text, u.sam)
    },
    1400 + Math.random() * 1200,
  )
  return id
}

// ─────────────── Chat ───────────────

/** Chat mit einem Benutzer öffnen (bestehenden offenen Thread wiederverwenden) */
export function startChat(target: string, ticketId?: string): string | undefined {
  const s = st()
  const u = findUser(s.world, target)
  if (!u) {
    s.toast('Benutzer nicht gefunden.', 'error')
    return undefined
  }
  const existing = s.world.chats.find((c) => c.with === u.sam && c.open)
  if (existing) {
    if (ticketId && !existing.ticketId) linkChatTicket(existing.id, ticketId)
    return existing.id
  }
  const t = (ticketId ? findTicket(s.world, ticketId) : undefined) ?? openTicketOf(s.world, u.sam, s.activeTicketId)
  const id = uid('chat')
  s.updateWorld((w) => {
    w.chats.unshift({ id, with: u.sam, ticketId: t?.id, scenarioId: t?.scenarioId, messages: [{ id: uid('m'), from: 'system', text: `Chat mit ${u.displayName} gestartet.`, time: nowIso() }], unread: 0, open: true })
  })
  return id
}

/** Chatnachricht des Azubis senden */
export function sendChat(threadId: string, raw: string) {
  const text = raw.trim()
  if (!text) return
  const s = st()
  const thread = s.world.chats.find((c) => c.id === threadId)
  if (!thread || !thread.open) return
  const { ticket, scenario } = scenarioContext(thread.ticketId)
  const turn = thread.messages.filter((m) => m.from === 'tech').length
  const rule = callerReply(s.world, { requester: thread.with, message: text, channel: 'Chat', ticket, scenario, turn })
  const msg: ChatMessage = { id: uid('m'), from: 'tech', text, time: nowIso() }
  s.updateWorld((w) => {
    const t = w.chats.find((x) => x.id === threadId)
    if (!t) return
    t.messages.push(msg)
    t.unread = 0
    logAction(w, { type: A.chatSent, ticketId: t.ticketId, target: t.with, detail: text.slice(0, 200) })
    logCallerActions(w, rule.actions, t.ticketId, t.with)
  })
  void deliverReply({ kind: 'chat', id: threadId, requester: thread.with, ticketId: thread.ticketId, scenario, history: [...thread.messages, msg], rule })
}

export function markChatRead(threadId: string) {
  const s = st()
  const t = s.world.chats.find((c) => c.id === threadId)
  if (!t || t.unread === 0) return
  s.updateWorld((w) => {
    const x = w.chats.find((c) => c.id === threadId)
    if (x) x.unread = 0
  })
}

export function closeChat(threadId: string) {
  st().updateWorld((w) => {
    const t = w.chats.find((c) => c.id === threadId)
    if (!t || !t.open) return
    t.open = false
    t.unread = 0
    t.messages.push({ id: uid('m'), from: 'system', text: 'Der Chat wurde beendet.', time: nowIso() })
  })
}

export function reopenChat(threadId: string) {
  st().updateWorld((w) => {
    const t = w.chats.find((c) => c.id === threadId)
    if (!t || t.open) return
    t.open = true
    t.messages.push({ id: uid('m'), from: 'system', text: 'Der Chat wurde wieder geöffnet.', time: nowIso() })
  })
}

export function linkChatTicket(threadId: string, ticketId: string) {
  st().updateWorld((w) => {
    const t = w.chats.find((c) => c.id === threadId)
    const tk = findTicket(w, ticketId)
    if (!t) return
    t.ticketId = ticketId
    t.scenarioId = tk?.scenarioId
  })
}

// ─────────────── E-Mail ───────────────

export interface OutgoingMail {
  /** Mailadressen, sAMAccountNames oder Anzeigenamen */
  to: string[]
  cc?: string[]
  subject: string
  body: string
  /** Verknüpftes Ticket; sonst offenes Ticket des (ersten) Empfängers */
  ticketId?: string
  attachments?: MailMessage['attachments']
  /** Text, auf den der Benutzer reagiert (Standard: neuer Teil des Mailtexts ohne Zitat) */
  probe?: string
  /** Simulierte Antwortmail des Benutzers (Standard: an) */
  simulateReply?: boolean
}

/** Liste aus Eingabefeld ("a@b.example; Lea Schulz, m.becker") in Adressen auflösen */
export function resolveAddresses(w: World, list: string[]): string[] {
  const out: string[] = []
  for (const raw of list.flatMap((x) => x.split(/[;,]/))) {
    const token = raw.trim().replace(/^.*<([^>]+)>\s*$/, '$1')
    if (!token) continue
    const u = findUser(w, token)
    const addr = u?.mail || token
    if (!out.some((a) => a.toLowerCase() === addr.toLowerCase())) out.push(addr)
  }
  return out
}

/** Neuen Teil einer Mail ermitteln (ohne Zitat / ursprüngliche Nachricht) */
export function stripQuoted(body: string): string {
  const lines = body.split('\n')
  const cut = lines.findIndex((l) => /^\s*-{3,}\s*(Ursprüngliche Nachricht|Weitergeleitete Nachricht)/i.test(l) || /^\s*Am .+ schrieb .+:\s*$/.test(l))
  return (cut >= 0 ? lines.slice(0, cut) : lines)
    .filter((l) => !l.trim().startsWith('>'))
    .join('\n')
    .trim()
}

export const replySubject = (subject: string, prefix: 'AW' | 'WG' = 'AW') => (new RegExp(`^${prefix}:`, 'i').test(subject.trim()) ? subject.trim() : `${prefix}: ${subject.trim()}`)

export const quoteMail = (m: Pick<MailMessage, 'from' | 'date' | 'to' | 'subject' | 'body'>) =>
  `-----Ursprüngliche Nachricht-----\nVon: ${m.from.name} <${m.from.address}>\nGesendet: ${fmtDateTime(m.date)}\nAn: ${m.to.join('; ')}\nBetreff: ${m.subject}\n\n${m.body
    .split('\n')
    .map((l) => `> ${l}`)
    .join('\n')}`

const helpdeskSender = (w: World) => ({ name: `IT-Service-Desk (${w.tech.name})`, address: w.company.helpdeskMail })

/** Ist die Adresse ein (echter) Benutzer, der antworten kann? */
function replyingUser(w: World, address: string): AdUser | undefined {
  const u = findUser(w, address)
  return u && u.sam !== w.tech.sam && !u.isServiceAccount && u.enabled ? u : undefined
}

/**
 * Mail aus dem Helpdesk-Postfach senden: legt sie in "Gesendet" ab, loggt A.mailSent und die
 * erkannten Aktionen (z. B. Kennwort im Klartext) und plant eine Antwort des Benutzers.
 * Gibt die ID der gesendeten Mail zurück.
 */
export function sendMail(m: OutgoingMail): string {
  const s = st()
  const w = s.world
  const to = resolveAddresses(w, m.to)
  const cc = resolveAddresses(w, m.cc ?? [])
  const primary = to.map((a) => replyingUser(w, a)).find((u): u is AdUser => !!u)
  const ticket = (m.ticketId ? findTicket(w, m.ticketId) : undefined) ?? (primary ? openTicketOf(w, primary.sam, s.activeTicketId) : undefined)
  const { scenario } = scenarioContext(ticket?.id)
  const probe = (m.probe ?? stripQuoted(m.body)).trim()
  const earlier = ticket ? w.mails.filter((x) => x.folder === 'Gesendet' && x.ticketId === ticket.id).length : 0
  const rule = primary ? callerReply(w, { requester: primary.sam, message: probe, channel: 'E-Mail', ticket, scenario, turn: 2 + earlier }) : undefined
  let mailId = ''
  s.updateWorld((d) => {
    const mail = addMail(d, { from: helpdeskSender(d), to, cc, subject: m.subject, body: m.body, ticketId: ticket?.id, folder: 'Gesendet', read: true, attachments: m.attachments ?? [] })
    mailId = mail.id
    logAction(d, { type: A.mailSent, ticketId: ticket?.id, target: primary?.sam ?? to.join(', '), detail: m.subject })
    if (rule && primary) logCallerActions(d, rule.actions, ticket?.id, primary.sam)
  })
  if (rule && primary && m.simulateReply !== false) {
    const sent = st().world.mails.find((x) => x.id === mailId)
    if (sent) scheduleMailReply(primary.sam, rule.text, sent)
  }
  return mailId
}

/** Benachrichtigungsmail nur ablegen (ohne erneutes Protokoll, z. B. nach resolveTicket mit Benachrichtigung) */
export function fileSentMail(m: { to: string[]; subject: string; body: string; ticketId?: string }) {
  st().updateWorld((w) => {
    addMail(w, { from: helpdeskSender(w), to: resolveAddresses(w, m.to), subject: m.subject, body: m.body, ticketId: m.ticketId, folder: 'Gesendet', read: true })
  })
}

function scheduleMailReply(sam: string, text: string, sent: MailMessage) {
  const delay = Math.max(4000, st().settings.replyDelayMs * 3) + Math.random() * 4000
  setTimeout(() => {
    const s = st()
    const u = findUser(s.world, sam)
    if (!u) return
    const ticketId = sent.ticketId && findTicket(s.world, sent.ticketId) ? sent.ticketId : undefined
    const sig = [u.displayName, [u.title, u.department].filter(Boolean).join(' · '), u.phone ? `Tel. ${u.phone}` : ''].filter(Boolean).join('\n')
    const body = `Hallo,\n\n${text}\n\nViele Grüße\n${sig}\n\n${quoteMail(sent)}`
    s.updateWorld((w) => {
      addMail(w, { from: { name: u.displayName, address: u.mail }, to: [w.company.helpdeskMail], subject: replySubject(sent.subject), body, ticketId })
      userResponded(w, ticketId)
    })
    s.toast(`Neue E-Mail von ${u.displayName}: ${replySubject(sent.subject)}`, 'info')
  }, delay)
}
