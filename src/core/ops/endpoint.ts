// Operationen auf simulierten Windows-Clients: Dienste, Prozesse, Dateisystem,
// Registry, Drucker, Laufwerke, Gruppenrichtlinien, Neustart.

import type { Endpoint, FsNode, LocalPrinter, RegKey, RegValue, WinEvent, WinService, World } from '../types'
import { daysAgo, nowIso, uid } from '../util'
import { buildEndpoint } from '../seed/endpoints'
import { nextFreeIp } from '../seed/infra'
import { effectiveGroupsOf, findComputer, findUser } from './ad'

// ─────────────── Endpunkt materialisieren ───────────────

/** Liefert den (ggf. neu erzeugten) Endpunkt. Muss innerhalb von updateWorld aufgerufen werden, wenn er neu ist. */
export function ensureEndpoint(w: World, hostname: string): Endpoint | undefined {
  const key = Object.keys(w.endpoints).find((k) => k.toLowerCase() === hostname.toLowerCase())
  if (key) return w.endpoints[key]
  const c = findComputer(w, hostname)
  if (!c || c.ou.includes('Domain Controllers') || c.ou.includes('OU=Server')) return undefined
  const user = c.managedBy ? findUser(w, c.managedBy) : undefined
  // IP aus bestehender DHCP-Lease ermitteln oder neue vergeben
  let ip = ''
  let network = '10.10.10.0'
  for (const s of w.infra.dhcpScopes) {
    const lease = s.leases.find((l) => l.hostname.startsWith(c.name.toLowerCase() + '.'))
    if (lease) {
      ip = lease.ip
      network = s.id
      break
    }
  }
  if (!ip) {
    const scope = w.infra.dhcpScopes.find((s) => s.id === '10.10.10.0')!
    ip = nextFreeIp(scope) ?? '10.10.10.250'
    network = scope.id
  }
  const gw = network.replace(/0$/, '1')
  const ep = buildEndpoint({ computer: c, user, ip, network: network === '10.10.60.0' ? '10.10.20.0' : network, gateway: network === '10.10.60.0' ? '10.10.20.1' : gw })
  // Notebook im Büro: per WLAN verbunden (Lease aus WLAN-Scope), Ethernet nicht gesteckt
  if (ep.kind === 'Notebook' && !user?.homeOffice) {
    const wlan = ep.adapters.find((a) => a.kind === 'WLAN')!
    wlan.ip = network === '10.10.60.0' ? ip : wlan.ip
    wlan.gateway = '10.10.60.1'
    wlan.network = '10.10.60.0'
  }
  if (user) {
    ep.tokenGroups = effectiveGroupsOf(w, user.sam)
    applyGpoMappings(w, ep, true)
    // Homeoffice-Notebooks: VPN verbunden, wenn berechtigt
    if (user.homeOffice && ep.vpn.installed && ep.tokenGroups.includes(w.infra.vpnGateway.allowedGroup)) connectVpn(w, ep)
  }
  // MAC in DHCP-Lease eintragen
  for (const s of w.infra.dhcpScopes) {
    const lease = s.leases.find((l) => l.hostname.startsWith(c.name.toLowerCase() + '.'))
    if (lease) lease.mac = (ep.adapters.find((a) => a.ip === lease.ip) ?? ep.adapters[0]).mac
  }
  const asset = w.assets.find((a) => a.hostname === c.name)
  if (asset) {
    ep.assetTag = asset.tag
    ep.serial = asset.serial
    setRegValue(ep, 'HKLM\\SOFTWARE\\Musterwerk', 'Inventarnummer', 'REG_SZ', asset.tag)
  }
  w.endpoints[c.name] = ep
  return ep
}

export const getEndpoint = (w: World, hostname: string): Endpoint | undefined => {
  const key = Object.keys(w.endpoints).find((k) => k.toLowerCase() === hostname.toLowerCase())
  return key ? w.endpoints[key] : undefined
}

// ─────────────── Ereignisse ───────────────

export function addEvent(ep: Endpoint, e: Omit<WinEvent, 'id' | 'time' | 'computer'> & { time?: string }) {
  ep.events.unshift({ id: uid('ev'), time: e.time ?? nowIso(), computer: `${ep.hostname}.musterwerk.local`, ...e })
  if (ep.events.length > 300) ep.events.length = 300
}

// ─────────────── Dienste ───────────────

export const findService = (services: WinService[], name: string) => {
  const s = name.toLowerCase()
  return services.find((x) => x.name.toLowerCase() === s || x.displayName.toLowerCase() === s)
}

/** Startet einen Dienst inkl. Abhängigkeiten. Liefert Fehlermeldung oder null. */
export function startService(ep: Endpoint, name: string): string | null {
  const s = findService(ep.services, name)
  if (!s) return `Der Dienstname ist ungültig. (${name})`
  if (s.status === 'Wird ausgeführt') return null
  if (s.startType === 'Deaktiviert') return `Der Dienst "${s.displayName}" kann nicht gestartet werden, da er deaktiviert ist oder ihm keine aktivierten Geräte zugeordnet sind. (Systemfehler 1058)`
  for (const dep of s.dependsOn ?? []) {
    const err = startService(ep, dep)
    if (err) return `Der abhängige Dienst konnte nicht gestartet werden: ${err} (Systemfehler 1068)`
  }
  if (s.startError) {
    addEvent(ep, { log: 'System', eventId: 7000, level: 'Fehler', source: 'Service Control Manager', message: `Der Dienst "${s.displayName}" wurde aufgrund folgenden Fehlers nicht gestartet: ${s.startError}` })
    return s.startError
  }
  s.status = 'Wird ausgeführt'
  addEvent(ep, { log: 'System', eventId: 7036, level: 'Informationen', source: 'Service Control Manager', message: `Der Dienst "${s.displayName}" befindet sich jetzt im Status "Wird ausgeführt".` })
  if (s.name === 'Spooler' && !ep.processes.some((p) => p.name === 'spoolsv.exe')) ep.processes.push({ pid: nextPid(ep), name: 'spoolsv.exe', description: 'Spoolersubsystem-App', user: 'SYSTEM', cpu: 0, memMb: 12, service: 'Spooler' })
  return null
}

export function stopService(ep: Endpoint, name: string): string | null {
  const s = findService(ep.services, name)
  if (!s) return `Der Dienstname ist ungültig. (${name})`
  if (s.status === 'Beendet') return null
  // abhängige Dienste mit beenden
  for (const other of ep.services) if (other.dependsOn?.some((d) => d.toLowerCase() === s.name.toLowerCase()) && other.status !== 'Beendet') stopService(ep, other.name)
  s.status = 'Beendet'
  ep.processes = ep.processes.filter((p) => p.service?.toLowerCase() !== s.name.toLowerCase())
  addEvent(ep, { log: 'System', eventId: 7036, level: 'Informationen', source: 'Service Control Manager', message: `Der Dienst "${s.displayName}" befindet sich jetzt im Status "Beendet".` })
  return null
}

export function setServiceStartType(ep: Endpoint, name: string, startType: WinService['startType']): string | null {
  const s = findService(ep.services, name)
  if (!s) return `Der Dienstname ist ungültig. (${name})`
  s.startType = startType
  addEvent(ep, { log: 'System', eventId: 7040, level: 'Informationen', source: 'Service Control Manager', message: `Der Starttyp des Diensts "${s.displayName}" wurde in "${startType}" geändert.` })
  return null
}

export const isServiceRunning = (ep: Endpoint, name: string) => findService(ep.services, name)?.status === 'Wird ausgeführt'

// ─────────────── Prozesse ───────────────

export const nextPid = (ep: Endpoint) => Math.max(1000, ...ep.processes.map((p) => p.pid)) + 4 + Math.floor(Math.random() * 40)

export function killProcess(ep: Endpoint, nameOrPid: string): string | null {
  const q = nameOrPid.toLowerCase()
  const matches = ep.processes.filter((p) => String(p.pid) === q || p.name.toLowerCase() === q || p.name.toLowerCase() === `${q}.exe`)
  if (!matches.length) return `FEHLER: Der Prozess "${nameOrPid}" wurde nicht gefunden.`
  if (matches.some((p) => ['System', 'csrss.exe', 'wininit.exe', 'lsass.exe', 'smss.exe', 'services.exe'].includes(p.name))) return 'FEHLER: Zugriff verweigert – kritischer Systemprozess.'
  ep.processes = ep.processes.filter((p) => !matches.includes(p))
  for (const m of matches) {
    if (m.respawn) ep.processes.push({ ...m, pid: nextPid(ep) })
  }
  return null
}

export const cpuTotal = (ep: Endpoint) => Math.min(100, Math.round(ep.processes.reduce((s, p) => s + p.cpu, 0) + 2))
export const memUsedGb = (ep: Endpoint) => Math.round((ep.processes.reduce((s, p) => s + p.memMb, 0) / 1024 + 2.1) * 10) / 10

// ─────────────── Dateisystem ───────────────

export function splitPath(path: string): { drive: string; parts: string[] } {
  const p = path.replace(/\//g, '\\').replace(/\\+$/, '')
  const m = p.match(/^([A-Za-z]:)(.*)$/)
  if (!m) return { drive: 'C:', parts: p.split('\\').filter(Boolean) }
  return { drive: m[1].toUpperCase(), parts: m[2].split('\\').filter(Boolean) }
}

export function resolveFs(ep: Endpoint, path: string): FsNode | undefined {
  const { drive, parts } = splitPath(expandEnv(ep, path))
  let node: FsNode | undefined = ep.fs[drive]
  for (const part of parts) {
    if (!node || node.type !== 'dir') return undefined
    if (part === '.') continue
    node = node.children?.find((c) => c.name.toLowerCase() === part.toLowerCase())
  }
  return node
}

export function parentAndName(ep: Endpoint, path: string): { parent?: FsNode; name: string } {
  const { drive, parts } = splitPath(expandEnv(ep, path))
  const name = parts.pop() ?? ''
  const parent = resolveFs(ep, `${drive}\\${parts.join('\\')}`)
  return { parent, name }
}

export function expandEnv(ep: Endpoint, path: string) {
  const user = ep.loggedOnUser ?? 'administrator'
  return path
    .replace(/%userprofile%|\$env:userprofile/gi, `C:\\Users\\${user}`)
    .replace(/%temp%|%tmp%|\$env:temp|\$env:tmp/gi, `C:\\Users\\${user}\\AppData\\Local\\Temp`)
    .replace(/%windir%|%systemroot%|\$env:windir|\$env:systemroot/gi, 'C:\\Windows')
    .replace(/%systemdrive%|\$env:systemdrive/gi, 'C:')
    .replace(/%programdata%|\$env:programdata/gi, 'C:\\ProgramData')
    .replace(/%username%|\$env:username/gi, user)
    .replace(/^~/, `C:\\Users\\${user}`)
}

export const nodeSizeMb = (n: FsNode): number => (n.type === 'file' ? (n.sizeMb ?? 0) : (n.children ?? []).reduce((s, c) => s + nodeSizeMb(c), 0))

function partitionForDrive(ep: Endpoint, drive: string) {
  const letter = drive.replace(':', '').toUpperCase()
  for (const d of ep.disks) for (const p of d.partitions) if (p.letter === letter) return p
  return undefined
}

export const freeGb = (ep: Endpoint, drive = 'C:') => {
  const p = partitionForDrive(ep, drive)
  return p ? Math.max(0, Math.round((p.sizeGb - p.usedGb) * 10) / 10) : 0
}

/** Löscht Datei/Ordner, aktualisiert die Belegung. Liefert Fehler oder null. */
export function deleteFs(ep: Endpoint, path: string): string | null {
  const { parent, name } = parentAndName(ep, path)
  if (!parent?.children) return `Der Pfad "${path}" wurde nicht gefunden.`
  const idx = parent.children.findIndex((c) => c.name.toLowerCase() === name.toLowerCase())
  if (idx < 0) return `Der Pfad "${path}" wurde nicht gefunden.`
  const node = parent.children[idx]
  if (node.system) return `Zugriff verweigert: "${path}" ist eine Systemdatei.`
  parent.children.splice(idx, 1)
  const p = partitionForDrive(ep, splitPath(expandEnv(ep, path)).drive)
  if (p) p.usedGb = Math.max(1, p.usedGb - nodeSizeMb(node) / 1024)
  return null
}

/** Leert einen Ordner (Inhalt löschen, Ordner bleibt). Gibt freigegebene MB zurück. */
export function emptyDir(ep: Endpoint, path: string): number {
  const dir = resolveFs(ep, path)
  if (!dir?.children) return 0
  let freed = 0
  dir.children = dir.children.filter((c) => {
    if (c.system) return true
    freed += nodeSizeMb(c)
    return false
  })
  const p = partitionForDrive(ep, splitPath(expandEnv(ep, path)).drive)
  if (p) p.usedGb = Math.max(1, p.usedGb - freed / 1024)
  return freed
}

export function writeFile(ep: Endpoint, path: string, content: string): string | null {
  const { parent, name } = parentAndName(ep, path)
  if (!parent || parent.type !== 'dir') return `Der Pfad "${path}" wurde nicht gefunden.`
  parent.children ??= []
  const existing = parent.children.find((c) => c.name.toLowerCase() === name.toLowerCase())
  if (existing) {
    if (existing.type !== 'file') return 'Ziel ist ein Ordner.'
    if (existing.readOnly) return 'Zugriff verweigert (schreibgeschützt).'
    existing.content = content
    existing.modified = nowIso()
    existing.sizeMb = Math.max(0.001, content.length / 1_000_000)
  } else {
    parent.children.push({ name, type: 'file', content, sizeMb: Math.max(0.001, content.length / 1_000_000), modified: nowIso() })
  }
  return null
}

export function makeDir(ep: Endpoint, path: string): string | null {
  const { parent, name } = parentAndName(ep, path)
  if (!parent || parent.type !== 'dir') return `Der Pfad "${path}" wurde nicht gefunden.`
  parent.children ??= []
  if (parent.children.some((c) => c.name.toLowerCase() === name.toLowerCase())) return `Ein Unterverzeichnis oder eine Datei mit dem Namen "${name}" existiert bereits.`
  parent.children.push({ name, type: 'dir', children: [], modified: nowIso() })
  return null
}

export const readFile = (ep: Endpoint, path: string) => {
  const n = resolveFs(ep, path)
  return n?.type === 'file' ? (n.content ?? '') : undefined
}

export const HOSTS_PATH = 'C:\\Windows\\System32\\drivers\\etc\\hosts'

/** Aktive Einträge der hosts-Datei: hostname(lower) -> ip */
export function readHosts(ep: Endpoint): Record<string, string> {
  const out: Record<string, string> = {}
  for (const raw of (readFile(ep, HOSTS_PATH) ?? '').split('\n')) {
    const line = raw.split('#')[0].trim()
    if (!line) continue
    const [ip, ...names] = line.split(/\s+/)
    for (const n of names) out[n.toLowerCase()] = ip
  }
  return out
}

// ─────────────── Registry ───────────────

const HIVE_ALIASES: Record<string, string> = {
  HKLM: 'HKEY_LOCAL_MACHINE',
  'HKLM:': 'HKEY_LOCAL_MACHINE',
  HKCU: 'HKEY_CURRENT_USER',
  'HKCU:': 'HKEY_CURRENT_USER',
  HKCR: 'HKEY_CLASSES_ROOT',
  HKU: 'HKEY_USERS',
  HKCC: 'HKEY_CURRENT_CONFIG',
}

export function regPathParts(path: string): string[] {
  const parts = path.replace(/\//g, '\\').replace(/^Computer\\/i, '').replace(/^Registry::/i, '').split('\\').filter(Boolean)
  if (parts.length) parts[0] = HIVE_ALIASES[parts[0].toUpperCase()] ?? parts[0].toUpperCase()
  return parts
}

export function getRegKey(ep: Endpoint, path: string): RegKey | undefined {
  let key: RegKey | undefined = ep.registry
  for (const p of regPathParts(path)) {
    key = key?.subkeys.find((k) => k.name.toLowerCase() === p.toLowerCase())
    if (!key) return undefined
  }
  return key
}

export function ensureRegKey(ep: Endpoint, path: string): RegKey {
  let key: RegKey = ep.registry
  for (const p of regPathParts(path)) {
    let next = key.subkeys.find((k) => k.name.toLowerCase() === p.toLowerCase())
    if (!next) {
      next = { name: p, values: [], subkeys: [] }
      key.subkeys.push(next)
    }
    key = next
  }
  return key
}

export function getRegValue(ep: Endpoint, path: string, name: string): RegValue | undefined {
  return getRegKey(ep, path)?.values.find((v) => v.name.toLowerCase() === name.toLowerCase())
}

export function setRegValue(ep: Endpoint, path: string, name: string, type: RegValue['type'], data: string | number) {
  const key = ensureRegKey(ep, path)
  const v = key.values.find((x) => x.name.toLowerCase() === name.toLowerCase())
  if (v) {
    v.type = type
    v.data = data
  } else key.values.push({ name, type, data })
}

export function deleteRegValue(ep: Endpoint, path: string, name: string): boolean {
  const key = getRegKey(ep, path)
  if (!key) return false
  const before = key.values.length
  key.values = key.values.filter((v) => v.name.toLowerCase() !== name.toLowerCase())
  return key.values.length < before
}

export function deleteRegKey(ep: Endpoint, path: string): boolean {
  const parts = regPathParts(path)
  const name = parts.pop()
  if (!name || parts.length === 0) return false
  const parent = getRegKey(ep, parts.join('\\'))
  if (!parent) return false
  const before = parent.subkeys.length
  parent.subkeys = parent.subkeys.filter((k) => k.name.toLowerCase() !== name.toLowerCase())
  return parent.subkeys.length < before
}

export const INET_SETTINGS = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'

export function getProxySettings(ep: Endpoint) {
  return {
    enabled: Number(getRegValue(ep, INET_SETTINGS, 'ProxyEnable')?.data ?? 0) === 1,
    server: String(getRegValue(ep, INET_SETTINGS, 'ProxyServer')?.data ?? ''),
    bypass: String(getRegValue(ep, INET_SETTINGS, 'ProxyOverride')?.data ?? ''),
    autoConfigUrl: String(getRegValue(ep, INET_SETTINGS, 'AutoConfigURL')?.data ?? ''),
  }
}

export function setProxySettings(ep: Endpoint, s: { enabled: boolean; server?: string; bypass?: string }) {
  setRegValue(ep, INET_SETTINGS, 'ProxyEnable', 'REG_DWORD', s.enabled ? 1 : 0)
  if (s.server !== undefined) setRegValue(ep, INET_SETTINGS, 'ProxyServer', 'REG_SZ', s.server)
  if (s.bypass !== undefined) setRegValue(ep, INET_SETTINGS, 'ProxyOverride', 'REG_SZ', s.bypass)
}

/** Autostart ist aktiv, wenn Eintrag im Task-Manager aktiviert UND Run-Wert (HKCU/HKLM) noch vorhanden ist */
export function isStartupActive(ep: Endpoint, name: string) {
  const item = ep.startupApps.find((s) => s.name.toLowerCase() === name.toLowerCase())
  const inRun =
    !!getRegValue(ep, 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', name) || !!getRegValue(ep, 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run', name)
  return !!item?.enabled && inRun
}

// ─────────────── Drucker ───────────────

export function printServerOk(w: World) {
  const ps = w.infra.servers.find((s) => s.name === 'PRINT01')
  return !!ps?.online && ps.services.find((s) => s.name === 'Spooler')?.status === 'Wird ausgeführt'
}

export function connectPrinter(w: World, ep: Endpoint, unc: string, setDefault = false): string | null {
  const m = unc.match(/^\\\\([^\\]+)\\(.+)$/)
  if (!m) return 'Ungültiger Druckerpfad. Format: \\\\SERVER\\Freigabename'
  const [, server, share] = m
  if (!isServiceRunning(ep, 'Spooler')) return 'Der lokale Druckspoolerdienst wird nicht ausgeführt. (0x000006ba)'
  if (server.toUpperCase().replace(/\.MUSTERWERK\.LOCAL$/, '') !== 'PRINT01') return `Windows kann keine Verbindung mit dem Drucker herstellen. Der Server "${server}" wurde nicht gefunden. (0x00000709)`
  if (!printServerOk(w)) return 'Windows kann keine Verbindung mit dem Drucker herstellen. Der Druckserver antwortet nicht. (0x0000007c)'
  const q = w.infra.printQueues.find((x) => x.name.toLowerCase() === share.toLowerCase())
  if (!q || !q.shared) return `Windows kann keine Verbindung mit dem Drucker herstellen. Der Druckername ist ungültig. (0x00000709)`
  const name = `\\\\PRINT01\\${q.name}`
  let p = ep.printers.find((x) => x.name.toLowerCase() === name.toLowerCase())
  if (!p) {
    p = { name, driver: q.driver, port: name, serverQueue: q.name, isDefault: false, status: 'Bereit', jobs: [] }
    ep.printers.push(p)
  }
  if (setDefault || !ep.printers.some((x) => x.isDefault)) setDefaultPrinter(ep, name)
  return null
}

export function removePrinter(ep: Endpoint, name: string): string | null {
  const before = ep.printers.length
  ep.printers = ep.printers.filter((p) => p.name.toLowerCase() !== name.toLowerCase())
  return ep.printers.length < before ? null : 'Drucker nicht gefunden.'
}

export function setDefaultPrinter(ep: Endpoint, name: string): string | null {
  const p = ep.printers.find((x) => x.name.toLowerCase() === name.toLowerCase())
  if (!p) return 'Drucker nicht gefunden.'
  ep.printers.forEach((x) => (x.isDefault = x === p))
  setRegValue(ep, 'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Windows', 'Device', 'REG_SZ', `${p.name},winspool,Ne01:`)
  return null
}

/** Effektiver Status eines lokalen Druckers unter Berücksichtigung von Spooler, Server, Queue und Gerät */
export function printerEffectiveStatus(w: World, ep: Endpoint, p: LocalPrinter): { ok: boolean; status: string; reason?: string } {
  if (!isServiceRunning(ep, 'Spooler')) return { ok: false, status: 'Nicht verfügbar', reason: 'Druckwarteschlange (Spooler) auf dem Client beendet' }
  if (p.status === 'Angehalten') return { ok: false, status: 'Angehalten', reason: 'Drucker lokal angehalten' }
  if (!p.serverQueue) return { ok: p.status === 'Bereit', status: p.status }
  if (!printServerOk(w)) return { ok: false, status: 'Offline', reason: 'Druckserver PRINT01 bzw. dessen Spooler nicht verfügbar' }
  const q = w.infra.printQueues.find((x) => x.name === p.serverQueue)
  if (!q) return { ok: false, status: 'Fehler', reason: 'Warteschlange existiert nicht mehr auf PRINT01' }
  if (q.status === 'Angehalten') return { ok: false, status: 'Angehalten (Server)', reason: 'Warteschlange auf PRINT01 angehalten' }
  if (q.jobs.some((j) => j.status === 'Fehler')) return { ok: false, status: 'Fehler – Druckauftrag hängt', reason: 'Fehlerhafter Auftrag blockiert die Warteschlange auf PRINT01' }
  const dev = w.infra.printers.find((d) => d.id === q.deviceId)
  if (!dev) return { ok: false, status: 'Fehler' }
  if (dev.status !== 'Bereit' && dev.status !== 'Energiesparmodus') return { ok: false, status: dev.status, reason: `Gerät meldet: ${dev.status}${dev.statusDetail ? ' – ' + dev.statusDetail : ''}` }
  return { ok: true, status: 'Bereit' }
}

/** Testseite / Dokument drucken. Bei Fehler bleibt der Auftrag in der Warteschlange hängen. */
export function printDocument(w: World, ep: Endpoint, printerName: string, document = 'Testseite'): { ok: boolean; message: string } {
  const p = ep.printers.find((x) => x.name.toLowerCase() === printerName.toLowerCase())
  if (!p) return { ok: false, message: 'Drucker nicht gefunden.' }
  const st = printerEffectiveStatus(w, ep, p)
  const job = { id: Math.floor(Math.random() * 900) + 100, document, owner: ep.loggedOnUser ?? 'azubi', pages: 1, sizeKb: 220, status: 'In Warteschlange' as const, submitted: nowIso() }
  if (!st.ok) {
    if (isServiceRunning(ep, 'Spooler')) p.jobs.push({ ...job, status: 'Fehler' })
    return { ok: false, message: `Druck fehlgeschlagen: ${st.reason ?? st.status}` }
  }
  if (p.serverQueue) {
    const q = w.infra.printQueues.find((x) => x.name === p.serverQueue)!
    const dev = w.infra.printers.find((d) => d.id === q.deviceId)!
    dev.pageCount += 1
    dev.log.unshift({ time: nowIso(), message: `Auftrag "${document}" von ${job.owner} gedruckt (1 Seite).` })
  }
  return { ok: true, message: `"${document}" wurde an ${p.name} gesendet und gedruckt.` }
}

// ─────────────── Netzlaufwerke & Gruppenrichtlinien ───────────────

export function parseUnc(path: string): { server: string; share: string; sub: string } | null {
  const m = path.match(/^\\\\([^\\]+)\\([^\\]+)(\\.*)?$/)
  if (!m) return null
  return { server: m[1].toUpperCase().replace(/\.MUSTERWERK\.LOCAL$/, ''), share: m[2], sub: m[3] ?? '' }
}

/** Prüft Freigabe-Zugriff anhand des Anmelde-Tokens des Clients */
export function shareAccess(w: World, ep: Endpoint, uncPath: string): { ok: boolean; access?: string; error?: string } {
  const u = parseUnc(uncPath)
  if (!u) return { ok: false, error: 'Systemfehler 67: Der Netzwerkname wurde nicht gefunden.' }
  if (!isServiceRunning(ep, 'LanmanWorkstation')) return { ok: false, error: 'Systemfehler 2138: Das Netzwerk ist nicht vorhanden oder wurde nicht gestartet. (Arbeitsstationsdienst beendet)' }
  const server = w.infra.servers.find((s) => s.name === u.server)
  if (!server || !server.online) return { ok: false, error: 'Systemfehler 53: Der Netzwerkpfad wurde nicht gefunden.' }
  const share = w.infra.shares.find((s) => s.server === u.server && s.name.toLowerCase() === u.share.toLowerCase())
  if (!share) return { ok: false, error: 'Systemfehler 67: Der Netzwerkname wurde nicht gefunden.' }
  const user = ep.loggedOnUser
  if (!user) return { ok: false, error: 'Systemfehler 1244: Der Vorgang wurde nicht ausgeführt, da der Benutzer nicht authentifiziert wurde.' }
  const token = new Set([...ep.tokenGroups.map((g) => g.toLowerCase()), user.toLowerCase()])
  const perms = share.permissions.filter((p) => token.has(p.principal.toLowerCase()))
  if (perms.some((p) => p.access === 'Verweigern') || perms.length === 0) return { ok: false, error: 'Systemfehler 5: Zugriff verweigert.' }
  const rank = { Lesen: 1, Ändern: 2, Vollzugriff: 3, Verweigern: 0 }
  const best = perms.sort((a, b) => rank[b.access] - rank[a.access])[0]
  return { ok: true, access: best.access }
}

export function mapDrive(w: World, ep: Endpoint, letter: string, path: string, persistent = true, viaGpo = false): string | null {
  const L = letter.toUpperCase().replace(/:?$/, ':')
  const acc = shareAccess(w, ep, path)
  if (!acc.ok) return acc.error ?? 'Fehler'
  if (ep.mappedDrives.some((d) => d.letter === L && d.path.toLowerCase() !== path.toLowerCase()) || ep.fs[L]) return `Systemfehler 85: Der lokale Gerätename wird bereits verwendet.`
  ep.mappedDrives = ep.mappedDrives.filter((d) => d.letter !== L)
  ep.mappedDrives.push({ letter: L, path, persistent, viaGpo })
  if (persistent) setRegValue(ep, `HKCU\\Network\\${L[0]}`, 'RemotePath', 'REG_SZ', path)
  return null
}

export function unmapDrive(ep: Endpoint, letter: string): string | null {
  const L = letter.toUpperCase().replace(/:?$/, ':')
  const before = ep.mappedDrives.length
  ep.mappedDrives = ep.mappedDrives.filter((d) => d.letter !== L)
  deleteRegKey(ep, `HKCU\\Network\\${L[0]}`)
  return ep.mappedDrives.length < before ? null : 'Die Netzwerkverbindung wurde nicht gefunden.'
}

/**
 * Wendet Laufwerks- und Druckerzuordnungen aus den GPOs an.
 * Zielgruppen werden (wie bei Item-Level-Targeting) gegen die AKTUELLEN AD-Gruppen geprüft,
 * der Zugriff auf die Freigabe selbst aber über das Anmelde-Token → nach Gruppenänderung ggf. "Zugriff verweigert",
 * bis klist purge / Ab- und Anmelden.
 */
export function applyGpoMappings(w: World, ep: Endpoint, silent = false): string[] {
  const msgs: string[] = []
  const user = ep.loggedOnUser
  if (!user) return msgs
  const groups = effectiveGroupsOf(w, user).map((g) => g.toLowerCase())
  for (const m of w.infra.gpo.driveMaps) {
    if (!groups.includes(m.group.toLowerCase())) continue
    if (ep.mappedDrives.some((d) => d.letter === m.letter && d.path.toLowerCase() === m.path.toLowerCase())) continue
    if (ep.mappedDrives.some((d) => d.letter === m.letter)) continue
    const err = mapDrive(w, ep, m.letter, m.path, true, true)
    if (err) msgs.push(`Laufwerkszuordnung ${m.letter} → ${m.path} fehlgeschlagen: ${err}`)
    else msgs.push(`Laufwerk ${m.letter} → ${m.path} verbunden.`)
  }
  for (const m of w.infra.gpo.printerMaps) {
    if (!groups.includes(m.group.toLowerCase())) continue
    const name = `\\\\PRINT01\\${m.queue}`
    if (ep.printers.some((p) => p.name.toLowerCase() === name.toLowerCase())) continue
    const err = connectPrinter(w, ep, name, m.setDefault)
    if (err) msgs.push(`Druckerzuordnung ${name} fehlgeschlagen: ${err}`)
    else msgs.push(`Drucker ${name} verbunden.`)
  }
  ep.gpo = { lastApplied: nowIso(), pending: false }
  if (!silent) addEvent(ep, { log: 'System', eventId: 1502, level: 'Informationen', source: 'Microsoft-Windows-GroupPolicy', message: 'Die Gruppenrichtlinieneinstellungen für den Benutzer wurden erfolgreich verarbeitet. Es wurden Änderungen erkannt.' })
  return msgs
}

/** Token aktualisieren (klist purge + erneuter Zugriff / Neuanmeldung) */
export function refreshToken(w: World, ep: Endpoint) {
  if (ep.loggedOnUser) ep.tokenGroups = effectiveGroupsOf(w, ep.loggedOnUser)
}

export const tokenIsStale = (w: World, ep: Endpoint) => {
  if (!ep.loggedOnUser) return false
  const cur = new Set(effectiveGroupsOf(w, ep.loggedOnUser))
  return cur.size !== ep.tokenGroups.length || ep.tokenGroups.some((g) => !cur.has(g))
}

// ─────────────── VPN ───────────────

export function connectVpn(w: World, ep: Endpoint): string | null {
  if (!ep.vpn.installed) return 'Kein VPN-Client installiert.'
  const user = ep.loggedOnUser ? findUser(w, ep.loggedOnUser) : undefined
  const inet = ep.adapters.some((a) => a.enabled && a.mediaConnected && a.kind !== 'VPN' && a.ip && !a.ip.startsWith('169.254'))
  if (!inet) {
    ep.vpn.lastError = 'Keine Internetverbindung.'
    return ep.vpn.lastError
  }
  if (!w.infra.vpnGateway.online) {
    ep.vpn.lastError = 'Gateway vpn.musterwerk.example antwortet nicht (Timeout).'
    return ep.vpn.lastError
  }
  if (!user || !user.enabled || user.lockedOut) {
    ep.vpn.lastError = 'Authentifizierung fehlgeschlagen (Konto gesperrt oder deaktiviert).'
    return ep.vpn.lastError
  }
  if (user.passwordExpired || user.mustChangePassword) {
    ep.vpn.lastError = 'Authentifizierung fehlgeschlagen: Das Kennwort ist abgelaufen.'
    return ep.vpn.lastError
  }
  if (!effectiveGroupsOf(w, user.sam).includes(w.infra.vpnGateway.allowedGroup)) {
    ep.vpn.lastError = 'Zugriff verweigert: Benutzer ist nicht für den VPN-Zugang berechtigt (Fehler 691/Policy "MW-VPN").'
    return ep.vpn.lastError
  }
  if (Math.abs(ep.timeOffsetMin) > 5) {
    ep.vpn.lastError = 'Zertifikatsprüfung fehlgeschlagen: Systemzeit weicht ab.'
    return ep.vpn.lastError
  }
  const vpn = ep.adapters.find((a) => a.kind === 'VPN')
  if (vpn) {
    const scope = w.infra.dhcpScopes.find((s) => s.id === '10.10.99.0')
    vpn.mediaConnected = true
    vpn.enabled = true
    vpn.ip = (scope && nextFreeIp(scope)) || '10.10.99.77'
    vpn.gateway = ''
    vpn.dnsServers = ['10.10.0.10', '10.10.0.11']
    if (scope) scope.leases.push({ ip: vpn.ip, mac: vpn.mac, hostname: `${ep.hostname.toLowerCase()}.musterwerk.local`, expires: daysAgo(-1), state: 'Aktiv' })
  }
  ep.vpn.connected = true
  ep.vpn.lastError = undefined
  if (!w.infra.vpnGateway.activeSessions.includes(user.sam)) w.infra.vpnGateway.activeSessions.push(user.sam)
  return null
}

export function disconnectVpn(w: World, ep: Endpoint) {
  const vpn = ep.adapters.find((a) => a.kind === 'VPN')
  if (vpn) {
    vpn.mediaConnected = false
    vpn.ip = ''
  }
  ep.vpn.connected = false
  w.infra.vpnGateway.activeSessions = w.infra.vpnGateway.activeSessions.filter((s) => s !== ep.loggedOnUser)
}

// ─────────────── Neustart / Anmeldung ───────────────

export function rebootEndpoint(w: World, ep: Endpoint) {
  addEvent(ep, { log: 'System', eventId: 1074, level: 'Informationen', source: 'User32', message: `Der Prozess "C:\\Windows\\system32\\shutdown.exe" hat den Neustart des Computers ${ep.hostname} im Auftrag des Benutzers MUSTERWERK\\${w.tech.sam} initiiert.` })
  ep.dnsCache = {}
  ep.pendingReboot = false
  ep.lastBoot = nowIso()
  ep.locked = false
  // Dienste mit Autostart starten
  for (const s of ep.services) {
    if (s.startType.startsWith('Automatisch')) {
      if (s.startError) s.status = 'Beendet'
      else s.status = 'Wird ausgeführt'
    } else if (s.startType === 'Deaktiviert') s.status = 'Beendet'
  }
  // Prozesse: Benutzerprozesse neu, respawn-Prozesse bleiben, Autostart-Programme
  ep.processes = ep.processes.filter((p) => p.respawn || p.user === 'SYSTEM' || p.user === 'NETZWERKDIENST')
  for (const s of ep.services) if (s.status === 'Beendet') ep.processes = ep.processes.filter((p) => p.service?.toLowerCase() !== s.name.toLowerCase())
  if (isServiceRunning(ep, 'Spooler') && !ep.processes.some((p) => p.name === 'spoolsv.exe')) ep.processes.push({ pid: nextPid(ep), name: 'spoolsv.exe', description: 'Spoolersubsystem-App', user: 'SYSTEM', cpu: 0, memMb: 12, service: 'Spooler' })
  const user = ep.loggedOnUser
  if (user) {
    for (const [name, desc, mem] of [
      ['explorer.exe', 'Windows-Explorer', 140],
      ['msedge.exe', 'Webbrowser', 380],
      ['OUTLOOK.EXE', 'E-Mail-Client', 300],
    ] as const)
      if (!ep.processes.some((p) => p.name === name)) ep.processes.push({ pid: nextPid(ep), name, description: desc, user, cpu: 0.4, memMb: mem })
    for (const st of ep.startupApps.filter((s) => isStartupActive(ep, s.name))) {
      const exe = st.command.match(/([^\\"]+\.exe)/i)?.[1]
      if (exe && !ep.processes.some((p) => p.name.toLowerCase() === exe.toLowerCase()))
        ep.processes.push({ pid: nextPid(ep), name: exe, description: st.name, user, cpu: Number(ep.flags[`cpu:${exe.toLowerCase()}`] ?? 0.3), memMb: 80 })
    }
    refreshToken(w, ep)
    // Nicht-persistente, nicht per GPO verbundene Laufwerke entfallen
    ep.mappedDrives = ep.mappedDrives.filter((d) => d.persistent)
    applyGpoMappings(w, ep, true)
  }
  // DHCP-Renew beim Start
  addEvent(ep, { log: 'System', eventId: 6005, level: 'Informationen', source: 'EventLog', message: 'Der Ereignisprotokolldienst wurde gestartet.' })
}
