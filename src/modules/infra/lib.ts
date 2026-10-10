// Reine Hilfsfunktionen der Infrastruktur-Konsole (DHCP, DNS, Dienste, Freigaben, Druck) – testbar mit Vitest.
// Funktionen mit World-Parameter, die schreiben, nur innerhalb von updateWorld aufrufen.

import { effectiveGroupsOf, findGroup, findUser } from '@/core/ops/ad'
import type { DhcpLease, DhcpScope, DnsRecord, EventLevel, FileShare, PrintQueue, Server, SharePermission, WinEvent, World } from '@/core/types'
import { intToIp, ipToInt, isValidIp, nowIso, sameSubnet, uid } from '@/core/util'

// ─────────────── Allgemein ───────────────

export const pctTone = (pct: number): 'green' | 'amber' | 'red' => (pct >= 90 ? 'red' : pct >= 75 ? 'amber' : 'green')

export function fmtGb(gb: number): string {
  return gb >= 1000 ? `${(gb / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} TB` : `${Math.round(gb).toLocaleString('de-DE')} GB`
}

// ─────────────── Server-Dienste ───────────────

export type SvcAction = 'start' | 'stop' | 'restart'
export const SVC_ACTION_LABEL: Record<SvcAction, string> = { start: 'Start', stop: 'Stopp', restart: 'Neustart' }

export function serverEvent(srv: Server, e: { eventId: number; level: EventLevel; source: string; message: string; log?: WinEvent['log']; task?: string }) {
  srv.events.unshift({ id: uid('ev'), log: e.log ?? 'System', eventId: e.eventId, level: e.level, source: e.source, message: e.message, time: nowIso(), computer: `${srv.name}.musterwerk.local`, task: e.task })
  if (srv.events.length > 400) srv.events.length = 400
}

/** Entfernt hängende Druckaufträge (Status „Fehler“/„Wird gelöscht“) aus allen Warteschlangen eines Druckservers */
export function purgeStuckJobs(w: World, server = 'PRINT01'): number {
  let n = 0
  for (const q of w.infra.printQueues) {
    if (q.server !== server) continue
    const before = q.jobs.length
    q.jobs = q.jobs.filter((j) => j.status !== 'Fehler' && j.status !== 'Wird gelöscht')
    n += before - q.jobs.length
  }
  return n
}

export interface SvcResult {
  ok: boolean
  message: string
}

/**
 * Startet/stoppt/startet einen Serverdienst neu (schreibt Ereignis 7036/7000 ins Systemprotokoll).
 * Sonderfall: Start/Neustart der Druckwarteschlange auf PRINT01 verwirft hängende Aufträge.
 */
export function controlServerService(w: World, serverName: string, svcName: string, action: SvcAction): SvcResult {
  const srv = w.infra.servers.find((s) => s.name.toLowerCase() === serverName.toLowerCase())
  if (!srv) return { ok: false, message: `Server „${serverName}“ nicht gefunden.` }
  if (!srv.online) return { ok: false, message: `Der Server ${srv.name} ist nicht erreichbar (offline). Dienste können nicht gesteuert werden.` }
  const svc = srv.services.find((s) => s.name.toLowerCase() === svcName.toLowerCase())
  if (!svc) return { ok: false, message: `Der Dienst „${svcName}“ ist auf ${srv.name} nicht installiert.` }
  const scm = (state: string) => serverEvent(srv, { eventId: 7036, level: 'Informationen', source: 'Service Control Manager', message: `Der Dienst "${svc.displayName}" befindet sich jetzt im Status "${state}".` })

  if (action === 'stop') {
    if (svc.status === 'Beendet') return { ok: false, message: `Der Dienst „${svc.displayName}“ wurde nicht gestartet.` }
    svc.status = 'Beendet'
    scm('Beendet')
    return { ok: true, message: `Der Dienst „${svc.displayName}“ auf ${srv.name} wurde beendet.` }
  }
  if (action === 'start' && svc.status === 'Wird ausgeführt') return { ok: false, message: `Der Dienst „${svc.displayName}“ wird bereits ausgeführt.` }
  if (svc.startType === 'Deaktiviert') return { ok: false, message: `Der Dienst „${svc.displayName}“ kann nicht gestartet werden, da er deaktiviert ist oder ihm keine aktivierten Geräte zugeordnet sind.` }
  if (action === 'restart' && svc.status !== 'Beendet') {
    svc.status = 'Beendet'
    scm('Beendet')
  }
  if (svc.startError) {
    serverEvent(srv, { eventId: 7000, level: 'Fehler', source: 'Service Control Manager', message: `Der Dienst "${svc.displayName}" wurde aufgrund folgenden Fehlers nicht gestartet:\n${svc.startError}` })
    return { ok: false, message: `Fehler beim Starten von „${svc.displayName}“: ${svc.startError}` }
  }
  svc.status = 'Wird ausgeführt'
  scm('Wird ausgeführt')
  let extra = ''
  if (srv.name === 'PRINT01' && svc.name.toLowerCase() === 'spooler') {
    const n = purgeStuckJobs(w, 'PRINT01')
    if (n) {
      extra = ` ${n} hängende(r) Druckauftrag/-aufträge wurde(n) verworfen.`
      serverEvent(srv, { eventId: 372, level: 'Warnung', source: 'Microsoft-Windows-PrintService', log: 'Anwendung', message: `Beim Start der Druckwarteschlange wurden ${n} beschädigte Druckaufträge aus dem Spoolordner C:\\Windows\\System32\\spool\\PRINTERS entfernt.` })
    }
  }
  return { ok: true, message: `Der Dienst „${svc.displayName}“ auf ${srv.name} wurde ${action === 'restart' ? 'neu gestartet' : 'gestartet'}.${extra}` }
}

export const isSvcRunning = (srv: Server | undefined, name: string) => !!srv?.online && srv.services.find((s) => s.name.toLowerCase() === name.toLowerCase())?.status === 'Wird ausgeführt'

// ─────────────── Ereignisse ───────────────

export interface EventFilter {
  log?: WinEvent['log'] | 'Alle'
  ids?: number[]
  levels?: EventLevel[]
  query?: string
}

export function filterEvents(events: readonly WinEvent[], f: EventFilter): WinEvent[] {
  const q = f.query?.trim().toLowerCase()
  return events
    .filter((e) => (!f.log || f.log === 'Alle' || e.log === f.log) && (!f.ids?.length || f.ids.includes(e.eventId)) && (!f.levels?.length || f.levels.includes(e.level)) && (!q || e.message.toLowerCase().includes(q) || (e.user ?? '').toLowerCase().includes(q) || String(e.eventId) === q))
    .sort((a, b) => b.time.localeCompare(a.time))
}

/** "Schlüssel: Wert"-Zeilen aus einem Ereignistext (für die Detailansicht) */
export function eventFields(message: string): [string, string][] {
  const out: [string, string][] = []
  for (const line of message.split('\n')) {
    const m = line.match(/^\s*([^:]{2,40}):\s*(.+)$/)
    if (m) out.push([m[1].trim(), m[2].trim()])
  }
  return out
}

/** Liest Ziffernfolgen "4740, 4625 4767" als Ereignis-IDs */
export const parseIdList = (s: string): number[] =>
  s
    .split(/[\s,;]+/)
    .map((x) => parseInt(x, 10))
    .filter((n) => Number.isFinite(n) && n > 0)

// ─────────────── DHCP ───────────────

/** Anzahl Adressen im Bereich start..end, die von Ausschlüssen überdeckt werden (überlappende Ausschlüsse zusammengeführt) */
function excludedCount(start: number, end: number, exclusions: { start: string; end: string }[]): number {
  const iv = exclusions
    .filter((e) => isValidIp(e.start) && isValidIp(e.end))
    .map((e) => [Math.max(start, ipToInt(e.start)), Math.min(end, ipToInt(e.end))] as [number, number])
    .filter(([a, b]) => a <= b)
    .sort((a, b) => a[0] - b[0])
  let n = 0
  let curA = -1
  let curB = -2
  for (const [a, b] of iv) {
    if (a > curB + 1) {
      if (curB >= curA && curA >= 0) n += curB - curA + 1
      curA = a
      curB = b
    } else curB = Math.max(curB, b)
  }
  if (curA >= 0 && curB >= curA) n += curB - curA + 1
  return n
}

export const isExcluded = (scope: DhcpScope, ip: string) => scope.exclusions.some((e) => ipToInt(ip) >= ipToInt(e.start) && ipToInt(ip) <= ipToInt(e.end))
export const inRange = (scope: DhcpScope, ip: string) => ipToInt(ip) >= ipToInt(scope.rangeStart) && ipToInt(ip) <= ipToInt(scope.rangeEnd)

/** Lease gilt als abgelaufen (Status oder Ablaufzeit) */
export const leaseExpired = (l: DhcpLease, now = Date.now()) => l.state === 'Abgelaufen' || (l.state === 'Aktiv' && new Date(l.expires).getTime() < now)

export interface ScopeStats {
  total: number
  excluded: number
  pool: number
  used: number
  free: number
  pct: number
  reservations: number
  bad: number
  expired: number
}

/** Auslastung: belegte Adressen (Leases ≠ abgelaufen, inkl. BAD_ADDRESS, + Reservierungen) im Pool (Bereich minus Ausschlüsse) */
export function scopeStats(scope: DhcpScope): ScopeStats {
  const start = ipToInt(scope.rangeStart)
  const end = ipToInt(scope.rangeEnd)
  const total = isValidIp(scope.rangeStart) && isValidIp(scope.rangeEnd) && end >= start ? end - start + 1 : 0
  const excluded = total ? excludedCount(start, end, scope.exclusions) : 0
  const pool = Math.max(0, total - excluded)
  const used = new Set<string>()
  for (const l of scope.leases) if (l.state !== 'Abgelaufen') used.add(l.ip)
  for (const r of scope.reservations) used.add(r.ip)
  let inPool = 0
  for (const ip of used) if (isValidIp(ip) && inRange(scope, ip) && !isExcluded(scope, ip)) inPool++
  const usedN = Math.min(pool, inPool)
  return {
    total,
    excluded,
    pool,
    used: usedN,
    free: Math.max(0, pool - usedN),
    pct: pool ? Math.round((usedN / pool) * 100) : 100,
    reservations: scope.reservations.length,
    bad: scope.leases.filter((l) => l.state === 'BAD_ADDRESS').length,
    expired: scope.leases.filter((l) => leaseExpired(l)).length,
  }
}

const subnetCheck = (scope: Pick<DhcpScope, 'id' | 'mask'>, ip: string) => isValidIp(ip) && sameSubnet(ip, scope.id, scope.mask)

export interface ScopeEdit {
  name: string
  rangeStart: string
  rangeEnd: string
  router: string
  dnsServers: string[]
  domainName: string
  leaseHours: number
}

export function validateScopeEdit(scope: DhcpScope, e: ScopeEdit): string | null {
  if (!e.name.trim()) return 'Bitte einen Bereichsnamen angeben.'
  if (!isValidIp(e.rangeStart) || !isValidIp(e.rangeEnd)) return 'Start- und Endadresse müssen gültige IPv4-Adressen sein.'
  if (!subnetCheck(scope, e.rangeStart) || !subnetCheck(scope, e.rangeEnd)) return `Start- und Endadresse müssen im Subnetz ${scope.id}/${scope.mask} liegen.`
  if (ipToInt(e.rangeStart) > ipToInt(e.rangeEnd)) return 'Die Startadresse muss kleiner oder gleich der Endadresse sein.'
  const net = ipToInt(scope.id) & ipToInt(scope.mask)
  const bcast = (net | (~ipToInt(scope.mask) >>> 0)) >>> 0
  if (ipToInt(e.rangeStart) === net || ipToInt(e.rangeEnd) === bcast) return 'Netz- und Broadcastadresse dürfen nicht im Bereich liegen.'
  if (e.router && !subnetCheck(scope, e.router)) return `Der Router (Standardgateway) muss im Subnetz ${scope.id} liegen.`
  if (e.router && ipToInt(e.router) >= ipToInt(e.rangeStart) && ipToInt(e.router) <= ipToInt(e.rangeEnd) && !scope.exclusions.some((x) => ipToInt(e.router) >= ipToInt(x.start) && ipToInt(e.router) <= ipToInt(x.end)))
    return 'Die Router-Adresse liegt im verteilten Bereich und ist nicht ausgeschlossen – das führt zu Adresskonflikten.'
  if (!e.dnsServers.length) return 'Mindestens ein DNS-Server ist erforderlich.'
  const badDns = e.dnsServers.find((d) => !isValidIp(d))
  if (badDns) return `„${badDns}“ ist keine gültige IP-Adresse (DNS-Server).`
  if (!Number.isFinite(e.leaseHours) || e.leaseHours < 1 || e.leaseHours > 24 * 999) return 'Die Leasedauer muss zwischen 1 Stunde und 999 Tagen liegen.'
  return null
}

export function validateExclusion(scope: DhcpScope, start: string, end: string): string | null {
  if (!isValidIp(start) || !isValidIp(end || start)) return 'Bitte gültige IPv4-Adressen angeben.'
  const e = end || start
  if (!subnetCheck(scope, start) || !subnetCheck(scope, e)) return `Die Adressen müssen im Subnetz ${scope.id} liegen.`
  if (ipToInt(start) > ipToInt(e)) return 'Die Startadresse muss kleiner oder gleich der Endadresse sein.'
  if (scope.exclusions.some((x) => x.start === start && x.end === e)) return 'Dieser Ausschluss existiert bereits.'
  return null
}

/** MAC normalisieren auf "AA-BB-CC-DD-EE-FF" (Format der Clients) */
export function normalizeMac(mac: string): string | null {
  const hex = mac.replace(/[^0-9a-f]/gi, '').toUpperCase()
  if (hex.length !== 12) return null
  return hex.match(/.{2}/g)!.join('-')
}

export function validateReservation(scope: DhcpScope, ip: string, mac: string, name: string): string | null {
  if (!name.trim()) return 'Bitte einen Reservierungsnamen angeben.'
  if (!subnetCheck(scope, ip)) return `Die IP-Adresse muss im Subnetz ${scope.id} liegen.`
  if (!inRange(scope, ip)) return `Die Adresse muss im Bereich ${scope.rangeStart} – ${scope.rangeEnd} liegen.`
  const m = normalizeMac(mac)
  if (!m) return 'Ungültige MAC-Adresse (12 Hexadezimalzeichen, z. B. 3C-52-82-1A-2B-3C).'
  if (scope.reservations.some((r) => r.ip === ip)) return `Für ${ip} existiert bereits eine Reservierung.`
  if (scope.reservations.some((r) => normalizeMac(r.mac) === m)) return `Für die MAC-Adresse ${m} existiert bereits eine Reservierung.`
  const lease = scope.leases.find((l) => l.ip === ip && !leaseExpired(l) && l.state !== 'Reservierung')
  if (lease && normalizeMac(lease.mac) !== m) return `Die Adresse ${ip} ist bereits an ${lease.hostname || lease.mac || 'einen anderen Client'} vergeben. Lease zuerst löschen.`
  return null
}

/** Entfernt abgelaufene und BAD_ADDRESS-Leases (schreibt in den Scope) */
export function cleanupLeases(scope: DhcpScope, now = Date.now()): { expired: number; bad: number } {
  let expired = 0
  let bad = 0
  scope.leases = scope.leases.filter((l) => {
    if (l.state === 'BAD_ADDRESS') {
      bad++
      return false
    }
    if (leaseExpired(l, now)) {
      expired++
      return false
    }
    return true
  })
  return { expired, bad }
}

export const scopeNetworkLabel = (s: DhcpScope) => {
  const prefix = ipToInt(s.mask).toString(2).replace(/0/g, '').length
  return `${s.id}/${prefix}`
}

export const nextIp = (ip: string) => intToIp(ipToInt(ip) + 1)

// ─────────────── DNS ───────────────

export const DNS_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'SRV', 'PTR', 'TXT', 'NS'] as const

/** Name relativ zur Zone, klein ("PC-VT-001.musterwerk.local." → "pc-vt-001", Zone selbst → "@") */
export function relativeName(name: string, zone: string): string {
  let n = name.trim().toLowerCase().replace(/\.$/, '')
  const z = zone.toLowerCase()
  if (!n || n === '@' || n === z) return '@'
  if (n.endsWith('.' + z)) n = n.slice(0, -(z.length + 1))
  return n
}

const HOST_RE = /^(?=.{1,253}\.?$)([a-z0-9_]([a-z0-9_-]{0,61}[a-z0-9_])?)(\.[a-z0-9_]([a-z0-9_-]{0,61}[a-z0-9_])?)*\.?$/i

export function validateDnsRecord(zone: string, rec: DnsRecord, existing: readonly DnsRecord[], ignoreIndex = -1): string | null {
  const name = relativeName(rec.name, zone)
  if (name !== '@' && !HOST_RE.test(name)) return 'Ungültiger Name. Erlaubt sind Buchstaben, Ziffern, Bindestrich, Unterstrich und Punkte.'
  const v = rec.value.trim()
  if (!v) return 'Bitte einen Wert angeben.'
  if (!Number.isInteger(rec.ttl) || rec.ttl < 0 || rec.ttl > 604800) return 'TTL muss eine ganze Zahl zwischen 0 und 604800 Sekunden sein.'
  switch (rec.type) {
    case 'A':
      if (!isValidIp(v)) return 'Ein A-Eintrag benötigt eine gültige IPv4-Adresse.'
      break
    case 'AAAA':
      if (!/^[0-9a-f:]+$/i.test(v) || !v.includes(':')) return 'Ein AAAA-Eintrag benötigt eine gültige IPv6-Adresse.'
      break
    case 'CNAME':
    case 'PTR':
    case 'NS':
      if (!HOST_RE.test(v) || isValidIp(v)) return `Ein ${rec.type}-Eintrag benötigt einen vollqualifizierten Hostnamen (kein IP-Adresse).`
      break
    case 'MX':
      if (!/^\d{1,5}\s+\S+$/.test(v)) return 'MX-Format: "<Priorität> <Mailserver>", z. B. "10 mail.musterwerk.example."'
      break
    case 'SRV':
      if (!/^\d{1,5}\s+\d{1,5}\s+\d{1,5}\s+\S+$/.test(v)) return 'SRV-Format: "<Priorität> <Gewichtung> <Port> <Ziel>", z. B. "0 100 389 dc01.musterwerk.local."'
      break
  }
  const others = existing.filter((_, i) => i !== ignoreIndex)
  if (rec.type === 'CNAME' && others.some((r) => r.name === name)) return `Für „${name}“ existieren bereits andere Einträge – ein CNAME darf nicht neben anderen Einträgen stehen.`
  if (rec.type !== 'CNAME' && others.some((r) => r.name === name && r.type === 'CNAME')) return `„${name}“ ist bereits ein Alias (CNAME). Zuerst den CNAME-Eintrag löschen.`
  if (others.some((r) => r.name === name && r.type === rec.type && r.value.trim().toLowerCase() === v.toLowerCase())) return 'Ein identischer Eintrag existiert bereits.'
  return null
}

// ─────────────── Dateifreigaben ───────────────

export const ACCESS_RANK: Record<SharePermission['access'], number> = { Verweigern: 0, Lesen: 1, Ändern: 2, Vollzugriff: 3 }

/** Kette der Gruppenverschachtelung von einem Mitglied bis zur Zielgruppe (BFS), z. B. [l.schulz, GG_Vertrieb, FS_Vertrieb_RW] */
export function membershipPath(w: World, member: string, target: string): string[] | null {
  const t = target.toLowerCase()
  if (member.toLowerCase() === t) return [member]
  const prev = new Map<string, string>()
  const queue = [member]
  const seen = new Set([member.toLowerCase()])
  while (queue.length) {
    const m = queue.shift()!
    for (const g of w.groups) {
      if (!g.members.some((x) => x.toLowerCase() === m.toLowerCase())) continue
      const k = g.name.toLowerCase()
      if (seen.has(k)) continue
      seen.add(k)
      prev.set(g.name, m)
      if (k === t) {
        const path = [g.name]
        let cur = g.name
        while (prev.has(cur)) {
          cur = prev.get(cur)!
          path.unshift(cur)
        }
        return path
      }
      queue.push(g.name)
    }
  }
  return null
}

export type EffectiveAccess = SharePermission['access'] | 'Kein Zugriff' | 'Verweigert'

export interface AccessCheck {
  access: EffectiveAccess
  matches: { perm: SharePermission; path: string[] }[]
  groups: string[]
  userFound: boolean
  disabled: boolean
}

/** Effektiver Freigabezugriff eines Benutzers laut AD (verschachtelte Gruppen) – unabhängig vom Anmeldetoken des Clients */
export function effectiveShareAccess(w: World, sam: string, share: FileShare): AccessCheck {
  const user = findUser(w, sam)
  const id = user?.sam ?? sam
  const groups = effectiveGroupsOf(w, id)
  const principals = new Set([id.toLowerCase(), ...groups.map((g) => g.toLowerCase()), 'jeder', 'authentifizierte benutzer'])
  const matches = share.permissions.filter((p) => principals.has(p.principal.toLowerCase())).map((perm) => ({ perm, path: membershipPath(w, id, perm.principal) ?? [id, perm.principal] }))
  let access: EffectiveAccess = 'Kein Zugriff'
  if (matches.some((m) => m.perm.access === 'Verweigern')) access = 'Verweigert'
  else if (matches.length) access = matches.reduce((best, m) => (ACCESS_RANK[m.perm.access] > ACCESS_RANK[best] ? m.perm.access : best), matches[0].perm.access)
  return { access, matches, groups, userFound: !!user, disabled: !!user && !user.enabled }
}

export const principalKind = (w: World, principal: string): 'user' | 'group' | 'unknown' => (findGroup(w, principal) ? 'group' : findUser(w, principal) ? 'user' : ['jeder', 'authentifizierte benutzer'].includes(principal.toLowerCase()) ? 'group' : 'unknown')

// ─────────────── Druck ───────────────

/** Auftrag abbrechen: hängende (Fehler-)Aufträge lassen sich nicht löschen, bis der Spooler neu gestartet wurde */
export function cancelJob(q: PrintQueue, jobId: number): 'deleted' | 'stuck' | 'notfound' {
  const j = q.jobs.find((x) => x.id === jobId)
  if (!j) return 'notfound'
  if (j.status === 'Fehler' || j.status === 'Wird gelöscht') return 'stuck'
  q.jobs = q.jobs.filter((x) => x.id !== jobId)
  return 'deleted'
}

export function clearQueue(q: PrintQueue): { removed: number; stuck: number } {
  const stuck = q.jobs.filter((j) => j.status === 'Fehler' || j.status === 'Wird gelöscht').length
  const removed = q.jobs.length - stuck
  q.jobs = q.jobs.filter((j) => j.status === 'Fehler' || j.status === 'Wird gelöscht')
  return { removed, stuck }
}

export const KNOWN_DRIVERS = ['Lumatec Universal PCL6', 'Lumatec Universal PS', 'Lumatec Universal PCL5e', 'Labelix ZPL', 'Generic / Text Only']

// ─────────────── Cloud-Sync ───────────────

/** Gleiche Bedingungen wie syncCloud: SYNC01 online, Dienst CloudSync läuft, Synchronisierung aktiviert */
export function syncReadiness(w: World): { ok: boolean; reason?: string } {
  const srv = w.infra.servers.find((s) => s.name === 'SYNC01')
  if (!srv) return { ok: false, reason: 'Server SYNC01 nicht gefunden.' }
  if (!srv.online) return { ok: false, reason: 'SYNC01 ist offline.' }
  if (srv.services.find((s) => s.name === 'CloudSync')?.status !== 'Wird ausgeführt') return { ok: false, reason: 'Der Dienst „MW Cloud Sync Service“ (CloudSync) auf SYNC01 wird nicht ausgeführt.' }
  if (!w.infra.sync.enabled) return { ok: false, reason: 'Die geplante Synchronisierung ist deaktiviert.' }
  return { ok: true }
}
