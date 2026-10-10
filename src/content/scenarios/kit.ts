// Gemeinsame Hilfsfunktionen für Trainingsszenarien (nur Content-Ebene, keine Core-Änderungen).
// Prüfungen (checks/penalties) dürfen ausschließlich LESEN – Setup/Tick dürfen schreiben.

import { A } from '@/core/actions'
import { effectiveGroupsOf, findUser, primaryComputerOf } from '@/core/ops/ad'
import { ensureEndpoint, getEndpoint, printServerOk, splitPath } from '@/core/ops/endpoint'
import type { ActionEntry, Asset, ScenarioCtx, Endpoint, FsNode, Server, Ticket, WinEvent, World } from '@/core/types'
import { daysAgo, hashString, minutesFromNow, nowIso, uid } from '@/core/util'

/** Hostname des primären Computers eines Benutzers */
export const pcOf = (w: World, sam: string) => primaryComputerOf(w, sam)?.name ?? ''

/** Endpunkt für Setup/Tick (erzeugt ihn bei Bedarf) */
export const setupEndpoint = (w: World, host: string): Endpoint | undefined => (host ? (getEndpoint(w, host) ?? ensureEndpoint(w, host)) : undefined)

/** Endpunkt für Prüfungen (nur lesen) */
export const epOf = (w: World, ctx: ScenarioCtx, key = 'computer') => getEndpoint(w, ctx.vars[key] ?? '')

export const ticketOf = (w: World, ctx: ScenarioCtx): Ticket | undefined => w.tickets.find((t) => t.id === ctx.ticketId)

export const ticketLog = (w: World, ctx: ScenarioCtx): ActionEntry[] => w.actionLog.filter((a) => a.ticketId === ctx.ticketId)

export const logged = (w: World, ctx: ScenarioCtx, type: string, pred?: (a: ActionEntry) => boolean) => ticketLog(w, ctx).some((a) => a.type === type && (!pred || pred(a)))

export const escalatedTo = (w: World, ctx: ScenarioCtx, group: Ticket['assignmentGroup']) => ticketOf(w, ctx)?.assignmentGroup === group

/** Zeitpunkt liegt (echt) nach einem Referenzzeitpunkt */
export const isAfter = (iso: string | undefined, ref: string | undefined) => !!iso && !!ref && new Date(iso).getTime() > new Date(ref).getTime()

/** Zeitpunkt liegt nach dem Szenariostart (inklusive) */
export const sinceStart = (iso: string | undefined, ctx: ScenarioCtx) => !!iso && new Date(iso).getTime() >= new Date(ctx.startedAt).getTime()

export const minutesAgo = (min: number) => minutesFromNow(-min)

export const splitList = (s: string | undefined) => (s ? s.split(',').filter(Boolean) : [])

/** Kompletter Tickettext (Arbeitsnotizen, Kommentare, Lösung) – z. B. um Geheimnisse im Ticket zu finden */
export function ticketText(w: World, ctx: ScenarioCtx) {
  const t = ticketOf(w, ctx)
  if (!t) return ''
  return [...t.workNotes.map((n) => n.text), ...t.comments.map((n) => n.text), t.resolutionNote ?? ''].join('\n')
}

/** Wurde (nach Szenariostart) eine Mail an eine Adresse gesendet, die `needle` enthält? */
export function mailSentTo(w: World, ctx: ScenarioCtx, needle: string) {
  const n = needle.toLowerCase()
  const inMails = w.mails.some((m) => m.folder === 'Gesendet' && sinceStart(m.date, ctx) && m.to.some((t) => t.toLowerCase().includes(n)))
  const inLog = ticketLog(w, ctx).some((a) => a.type === A.mailSent && `${a.target ?? ''} ${a.detail ?? ''}`.toLowerCase().includes(n))
  return inMails || inLog
}

/** Texte des Technikers in Telefonaten zu diesem Ticket (Transkript) */
export function techTranscript(w: World, ctx: ScenarioCtx) {
  return w.calls
    .filter((c) => c.ticketId === ctx.ticketId)
    .flatMap((c) => c.transcript.filter((m) => m.from === 'tech').map((m) => m.text))
    .join('\n')
}

/** Kann sich der Benutzer (aus AD-Sicht) am VPN anmelden? (spiegelt connectVpn ohne Client-Anteil) */
export function vpnLoginPossible(w: World, sam: string) {
  const u = findUser(w, sam)
  if (!u) return false
  return u.enabled && !u.lockedOut && !u.passwordExpired && !u.mustChangePassword && w.infra.vpnGateway.online && effectiveGroupsOf(w, sam).includes(w.infra.vpnGateway.allowedGroup)
}

/** Ereignis im Protokoll eines Servers (Infrastruktur-Ansicht) */
export function serverEvent(w: World, server: string, e: Omit<WinEvent, 'id' | 'time' | 'computer'> & { time?: string }) {
  const s: Server | undefined = w.infra.servers.find((x) => x.name === server)
  if (!s) return
  s.events.unshift({ id: uid('ev'), time: e.time ?? nowIso(), computer: `${server}.musterwerk.local`, ...e })
  if (s.events.length > 400) s.events.length = 400
}

/** Zufällig wirkende, aber deterministische MAC (lokal administriert = typisch für MAC-Randomisierung) */
export function fakeMac(seed: string) {
  const h = hashString(seed)
  const first = ['DA', '6E', 'A2', 'F6', '1E', '3A'][h % 6]
  const b = (n: number) => ((hashString(seed + n) >>> 3) % 256).toString(16).padStart(2, '0').toUpperCase()
  return [first, b(1), b(2), b(3), b(4), b(5)].join('-')
}

// ─────────────── Dateisystem ───────────────

export function ensureDir(ep: Endpoint, path: string): FsNode | undefined {
  const { drive, parts } = splitPath(path)
  let node: FsNode | undefined = ep.fs[drive]
  if (!node) return undefined
  for (const part of parts) {
    node.children ??= []
    let next: FsNode | undefined = node.children.find((c) => c.name.toLowerCase() === part.toLowerCase())
    if (!next) {
      next = { name: part, type: 'dir', children: [], modified: nowIso() }
      node.children.push(next)
    }
    if (next.type !== 'dir') return undefined
    node = next
  }
  return node
}

export function putFile(ep: Endpoint, dir: string, name: string, sizeMb: number, extra: Partial<FsNode> = {}) {
  const d = ensureDir(ep, dir)
  if (!d) return
  d.children = (d.children ?? []).filter((c) => c.name.toLowerCase() !== name.toLowerCase())
  d.children.push({ name, type: 'file', sizeMb, modified: daysAgo(1), ...extra })
}

// ─────────────── Druck ───────────────

/** Wartende Aufträge einer Server-Warteschlange "drucken" (wenn Server, Queue und Gerät bereit sind). Merkt sich gedruckte IDs. */
export function printWaitingJobs(w: World, ctx: ScenarioCtx, queueName: string) {
  if (!printServerOk(w)) return
  const q = w.infra.printQueues.find((x) => x.name === queueName)
  if (!q || q.status !== 'Bereit' || q.jobs.some((j) => j.status === 'Fehler')) return
  const dev = w.infra.printers.find((d) => d.id === q.deviceId)
  if (!dev || (dev.status !== 'Bereit' && dev.status !== 'Energiesparmodus')) return
  const done = q.jobs.filter((j) => j.status === 'In Warteschlange' || j.status === 'Wird gedruckt')
  if (!done.length) return
  const ids = new Set(done.map((j) => j.id))
  q.jobs = q.jobs.filter((j) => !ids.has(j.id))
  const printed = new Set(splitList(ctx.vars.printedJobs))
  for (const j of done) {
    printed.add(String(j.id))
    dev.pageCount += j.pages
    dev.log.unshift({ time: nowIso(), message: `Auftrag "${j.document}" von ${j.owner} gedruckt (${j.pages} Seiten).` })
  }
  ctx.vars.printedJobs = [...printed].join(',')
}

/** Hat der Azubi Aufträge von Kollegen gelöscht (weder gedruckt noch noch in der Queue)? */
export function jobsRemovedByTrainee(w: World, ctx: ScenarioCtx, queueName: string, varName = 'queuedJobs') {
  const q = w.infra.printQueues.find((x) => x.name === queueName)
  if (!q) return false
  const printed = new Set(splitList(ctx.vars.printedJobs))
  return splitList(ctx.vars[varName]).some((id) => !printed.has(id) && !q.jobs.some((j) => String(j.id) === id))
}

// ─────────────── Inventar ───────────────

/** Stellt sicher, dass mindestens ein Notebook im Lager liegt (für Ersatz/Onboarding) */
export function ensureStockNotebook(w: World) {
  if (w.assets.some((a) => a.type === 'Notebook' && a.status === 'Lager')) return
  const n = ++w.counters.asset
  const asset: Asset = {
    tag: `MW-NB-${String(n).padStart(4, '0')}`,
    type: 'Notebook',
    manufacturer: 'Nordtec Computer',
    model: 'ProBook 14 G10',
    serial: `NB${(hashString('stock' + n) % 9_000_000) + 1_000_000}`,
    status: 'Lager',
    location: 'IT-Lager EG',
    purchaseDate: daysAgo(30).slice(0, 10),
    warrantyUntil: daysAgo(-1065).slice(0, 10),
    costEur: 1349,
    notes: 'Nachbestellung – vorinstalliert mit Image MW-Win11-2026.03',
    history: [{ time: daysAgo(30), text: 'Wareneingang' }],
  }
  w.assets.push(asset)
}

export const ACTIVE_SHIPMENT = (status: string) => status !== 'Entwurf' && status !== 'Storniert'
