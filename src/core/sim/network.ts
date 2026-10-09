// Netzwerk-Simulation: IP-Konfiguration, DHCP, Namensauflösung, Erreichbarkeit, HTTP.
// Wird von Terminal (ipconfig/ping/nslookup/tracert), Browser und Szenario-Prüfungen genutzt.

import type { Endpoint, NetAdapter, World } from '../types'
import { daysAgo, hashString, isApipa, isValidIp, sameSubnet } from '../util'
import { nextFreeIp } from '../seed/infra'
import { findService, getProxySettings, isServiceRunning, readHosts } from '../ops/endpoint'

/** Fiktives "Internet": Hostname -> IP. Alle Domains unter .example sind reserviert/fiktiv. */
export const INTERNET_HOSTS: Record<string, string> = {
  'www.suche.example': '198.51.100.10',
  'suche.example': '198.51.100.10',
  'portal.cloudadmin.example': '198.51.100.20',
  'admin.cloudadmin.example': '198.51.100.20',
  'login.cloudadmin.example': '198.51.100.21',
  'mail.cloudadmin.example': '198.51.100.22',
  'outlook.cloudadmin.example': '198.51.100.22',
  'konto.musterwerk.example': '198.51.100.30',
  'www.musterwerk.example': '198.51.100.31',
  'musterwerk.example': '198.51.100.31',
  'vpn.musterwerk.example': '198.51.100.40',
  'status.cloudadmin.example': '198.51.100.23',
  'www.paketdienst.example': '198.51.100.50',
  'tracking.versand.example': '198.51.100.51',
  'docs.techwissen.example': '198.51.100.60',
  'forum.adminhilfe.example': '198.51.100.61',
  'www.nachrichten.example': '198.51.100.70',
  // Phishing-Domain für Sicherheits-Szenarien
  'cloudadmin-login.secure-verify.example': '203.0.113.66',
  'paket-zustellung-info.example': '203.0.113.67',
}

export const PUBLIC_DNS = ['8.8.8.8', '8.8.4.4', '1.1.1.1', '9.9.9.9']
const INTERNAL_DNS = ['10.10.0.10', '10.10.0.11']

export interface IpConfig {
  adapter: NetAdapter
  ip: string
  mask: string
  gateway: string
  dns: string[]
  apipa: boolean
}

/** Aktive Adapter (aktiviert + Medium verbunden + IP) */
export function activeConfigs(ep: Endpoint): IpConfig[] {
  return ep.adapters
    .filter((a) => a.enabled && a.mediaConnected && a.ip)
    .map((a) => ({ adapter: a, ip: a.ip, mask: a.mask, gateway: a.gateway, dns: a.dnsServers, apipa: isApipa(a.ip) }))
}

/** Bevorzugte Konfiguration: VPN > Ethernet > WLAN */
export function primaryConfig(ep: Endpoint): IpConfig | undefined {
  const list = activeConfigs(ep)
  return list.find((c) => c.adapter.kind === 'VPN') ?? list.find((c) => c.adapter.kind === 'Ethernet' && !c.apipa) ?? list.find((c) => c.adapter.kind === 'WLAN' && !c.apipa) ?? list[0]
}

/** Physische Uplink-Konfiguration (ohne VPN) */
export function uplinkConfig(ep: Endpoint): IpConfig | undefined {
  const list = activeConfigs(ep).filter((c) => c.adapter.kind !== 'VPN')
  return list.find((c) => !c.apipa) ?? list[0]
}

function siteGateway(network: string) {
  if (network === 'home') return '192.168.178.1'
  return network.replace(/\.0$/, '.1')
}

export function dhcpServerOk(w: World) {
  const dc = w.infra.servers.find((s) => s.name === 'DC01')
  return !!dc?.online && dc.services.find((s) => s.name === 'DHCPServer')?.status === 'Wird ausgeführt'
}

/** ipconfig /renew für einen Adapter. Liefert Meldung. */
export function renewDhcp(w: World, ep: Endpoint, adapter: NetAdapter): { ok: boolean; message: string } {
  if (!adapter.dhcp) return { ok: false, message: `Für den Adapter "${adapter.name}" ist DHCP nicht aktiviert.` }
  if (!adapter.enabled) return { ok: false, message: `Der Adapter "${adapter.name}" ist deaktiviert.` }
  if (!adapter.mediaConnected) return { ok: false, message: `Für "${adapter.name}" kann kein Vorgang durchgeführt werden, da das Medium getrennt ist.` }
  if (!isServiceRunning(ep, 'Dhcp')) return { ok: false, message: 'Fehler beim Erneuern der Schnittstelle: Der DHCP-Clientdienst wird nicht ausgeführt.' }
  if (adapter.kind === 'VPN') return { ok: true, message: 'VPN-Adapter wird vom VPN-Client verwaltet.' }
  if (adapter.network === 'home') {
    adapter.ip = adapter.ip && adapter.ip.startsWith('192.168.178.') ? adapter.ip : '192.168.178.' + (20 + Math.floor(Math.random() * 30))
    adapter.mask = '255.255.255.0'
    adapter.gateway = '192.168.178.1'
    if (adapter.dnsFromDhcp) adapter.dnsServers = ['192.168.178.1']
    return { ok: true, message: 'ok' }
  }
  if (adapter.network === 'none') return { ok: false, message: 'Medium getrennt.' }
  const scope = w.infra.dhcpScopes.find((s) => s.id === adapter.network)
  const fail = (why: string) => {
    const h = hashString(adapter.mac)
    adapter.ip = `169.254.${(h % 250) + 1}.${((h >>> 8) % 250) + 1}`
    adapter.mask = '255.255.0.0'
    adapter.gateway = ''
    if (adapter.dnsFromDhcp) adapter.dnsServers = []
    return { ok: false, message: `Fehler beim Erneuern der Schnittstelle ${adapter.name}: ${why}` }
  }
  if (!scope || !scope.active || !dhcpServerOk(w)) return fail('Zeitüberschreitung bei der Kontaktaufnahme mit dem DHCP-Server.')
  const host = `${ep.hostname.toLowerCase()}.musterwerk.local`
  const existing = scope.leases.find((l) => (l.mac === adapter.mac || l.hostname === host) && l.state !== 'Abgelaufen' && l.state !== 'BAD_ADDRESS')
  const reservation = scope.reservations.find((r) => r.mac === adapter.mac)
  const ip = reservation?.ip ?? existing?.ip ?? nextFreeIp(scope)
  if (!ip) return fail('Zeitüberschreitung bei der Kontaktaufnahme mit dem DHCP-Server. (Bereich erschöpft – keine freien Adressen)')
  if (existing) existing.expires = daysAgo(-scope.leaseHours / 24)
  else scope.leases.push({ ip, mac: adapter.mac, hostname: host, expires: daysAgo(-scope.leaseHours / 24), state: reservation ? 'Reservierung' : 'Aktiv' })
  adapter.ip = ip
  adapter.mask = scope.mask
  adapter.gateway = scope.router
  if (adapter.dnsFromDhcp) adapter.dnsServers = [...scope.dnsServers]
  // DNS-Registrierung (dynamisches Update)
  const zone = w.infra.dnsZones.find((z) => z.name === 'musterwerk.local')
  if (zone) {
    const rec = zone.records.find((r) => r.type === 'A' && r.name === ep.hostname.toLowerCase())
    if (rec) rec.value = ip
    else zone.records.push({ name: ep.hostname.toLowerCase(), type: 'A', value: ip, ttl: 1200, dynamic: true })
  }
  return { ok: true, message: 'ok' }
}

export function releaseDhcp(w: World, _ep: Endpoint, adapter: NetAdapter) {
  if (!adapter.dhcp) return
  const scope = w.infra.dhcpScopes.find((s) => s.id === adapter.network)
  if (scope) scope.leases = scope.leases.filter((l) => l.mac !== adapter.mac)
  adapter.ip = '0.0.0.0'
  adapter.gateway = ''
  if (adapter.dnsFromDhcp) adapter.dnsServers = []
}

// ─────────────── Erreichbarkeit ───────────────

export type ReachError = 'no-network' | 'apipa' | 'no-gateway' | 'host-down' | 'timeout' | 'internet-down' | 'unknown-host'

export interface ReachResult {
  ok: boolean
  ms?: number
  ttl?: number
  error?: ReachError
  message?: string
  via?: string
}

/** Wem gehört eine interne IP? */
export function ownerOfIp(w: World, ip: string): { kind: 'server' | 'printer' | 'endpoint' | 'gateway' | 'dns' | 'proxy' | 'internet' | 'none'; name?: string; up: boolean } {
  if (ip === '127.0.0.1') return { kind: 'endpoint', name: 'localhost', up: true }
  const srv = w.infra.servers.find((s) => s.ip === ip)
  if (srv) return { kind: 'server', name: srv.name, up: srv.online }
  if (ip === '10.10.0.60') return { kind: 'proxy', name: 'PROXY', up: w.infra.proxy.online }
  if (ip === '10.10.0.5') return { kind: 'server', name: 'VPN-GW', up: w.infra.vpnGateway.online }
  const prn = w.infra.printers.find((p) => p.ip === ip)
  if (prn) return { kind: 'printer', name: prn.id, up: prn.status !== 'Offline' }
  if (w.infra.networks.some((n) => n.gateway === ip) || ip === '192.168.178.1') return { kind: 'gateway', name: 'Router', up: true }
  if (PUBLIC_DNS.includes(ip)) return { kind: 'dns', name: 'Öffentlicher DNS', up: w.infra.internetUp }
  if (Object.values(INTERNET_HOSTS).includes(ip) || (!ip.startsWith('10.') && !ip.startsWith('192.168.') && !ip.startsWith('169.254.'))) return { kind: 'internet', up: w.infra.internetUp }
  for (const ep of Object.values(w.endpoints)) if (ep.adapters.some((a) => a.ip === ip && a.enabled && a.mediaConnected)) return { kind: 'endpoint', name: ep.hostname, up: ep.online }
  for (const s of w.infra.dhcpScopes) {
    const l = s.leases.find((x) => x.ip === ip && x.state !== 'Abgelaufen')
    if (l) return { kind: 'endpoint', name: l.hostname.split('.')[0].toUpperCase(), up: true }
  }
  return { kind: 'none', up: false }
}

const isInternal = (ip: string) => ip.startsWith('10.')

export function reach(w: World, ep: Endpoint, ip: string): ReachResult {
  if (!isValidIp(ip)) return { ok: false, error: 'unknown-host', message: 'Ungültige Adresse' }
  if (ip === '127.0.0.1') return { ok: true, ms: 0, ttl: 128 }
  const vpn = activeConfigs(ep).find((c) => c.adapter.kind === 'VPN')
  const up = uplinkConfig(ep)
  if (!up && !vpn) return { ok: false, error: 'no-network', message: 'Allgemeiner Fehler. (Keine Netzwerkverbindung)' }
  const owner = ownerOfIp(w, ip)
  const target = { ...owner }

  // Interne Ziele aus dem Homeoffice nur per VPN
  if (isInternal(ip)) {
    if (vpn && up && !up.apipa) return target.up ? { ok: true, ms: 18 + Math.round(Math.random() * 10), ttl: 126, via: 'VPN' } : { ok: false, error: 'timeout', message: 'Zeitüberschreitung der Anforderung.' }
    if (!up) return { ok: false, error: 'no-network', message: 'Allgemeiner Fehler.' }
    if (up.apipa) return { ok: false, error: 'apipa', message: 'Zielnetz nicht erreichbar. (Keine gültige IP-Adresse – APIPA 169.254.x.x)' }
    if (up.adapter.network === 'home') return { ok: false, error: 'timeout', message: 'Zeitüberschreitung der Anforderung. (Internes Netz nur über VPN erreichbar)' }
    if (!sameSubnet(up.ip, ip, up.mask)) {
      if (!up.gateway) return { ok: false, error: 'no-gateway', message: 'Übertragung fehlgeschlagen. Allgemeiner Fehler. (Kein Standardgateway)' }
      if (up.gateway !== siteGateway(up.adapter.network) || !sameSubnet(up.ip, up.gateway, up.mask)) return { ok: false, error: 'timeout', message: `Antwort von ${up.ip}: Zielhost nicht erreichbar. (Falsches Standardgateway ${up.gateway})` }
    }
    if (!target.up) return { ok: false, error: 'host-down', message: 'Zeitüberschreitung der Anforderung.' }
    return { ok: true, ms: sameSubnet(up.ip, ip, up.mask) ? 1 : 2 + Math.round(Math.random() * 2), ttl: 127 }
  }

  // Internet
  if (!up) return { ok: false, error: 'no-network', message: 'Allgemeiner Fehler.' }
  if (up.apipa) return { ok: false, error: 'apipa', message: 'Zielnetz nicht erreichbar. (APIPA-Adresse)' }
  if (!up.gateway) return { ok: false, error: 'no-gateway', message: 'Übertragung fehlgeschlagen. Allgemeiner Fehler. (Kein Standardgateway)' }
  if (up.gateway !== siteGateway(up.adapter.network)) return { ok: false, error: 'timeout', message: 'Zeitüberschreitung der Anforderung. (Gateway falsch)' }
  if (!w.infra.internetUp) return { ok: false, error: 'internet-down', message: 'Zeitüberschreitung der Anforderung. (Internetanbindung gestört)' }
  return { ok: true, ms: 9 + Math.round(Math.random() * 15), ttl: 116 }
}

// ─────────────── Namensauflösung ───────────────

export interface ResolveResult {
  ok: boolean
  ip?: string
  fqdn?: string
  server?: string
  source?: 'hosts' | 'cache' | 'dns' | 'literal'
  error?: string
  aliases?: string[]
}

function lookupInternal(w: World, name: string): { ip?: string; fqdn?: string; aliases: string[] } {
  const zone = w.infra.dnsZones.find((z) => z.name === 'musterwerk.local')
  if (!zone) return { aliases: [] }
  let n = name.toLowerCase().replace(/\.$/, '')
  if (n === 'musterwerk.local') n = '@'
  else if (n.endsWith('.musterwerk.local')) n = n.slice(0, -'.musterwerk.local'.length)
  else if (n.includes('.')) return { aliases: [] }
  const aliases: string[] = []
  for (let depth = 0; depth < 5; depth++) {
    const cname = zone.records.find((r) => r.name === n && r.type === 'CNAME')
    if (cname) {
      aliases.push(`${n}.musterwerk.local`)
      n = cname.value.replace(/\.musterwerk\.local\.?$/, '').replace(/\.$/, '')
      continue
    }
    const a = zone.records.find((r) => r.name === n && r.type === 'A')
    if (a) return { ip: a.value, fqdn: n === '@' ? 'musterwerk.local' : `${n}.musterwerk.local`, aliases }
    break
  }
  return { aliases }
}

function dnsServerWorks(w: World, ep: Endpoint, server: string): 'internal' | 'public' | 'dead' {
  const r = reach(w, ep, server)
  if (!r.ok) return 'dead'
  if (INTERNAL_DNS.includes(server)) {
    const srv = w.infra.servers.find((s) => s.ip === server)
    return srv?.online && srv.services.find((s) => s.name === 'DNS')?.status === 'Wird ausgeführt' ? 'internal' : 'dead'
  }
  if (PUBLIC_DNS.includes(server) || server === '192.168.178.1') return 'public'
  return 'dead'
}

/**
 * Namensauflösung wie Windows: hosts-Datei → DNS-Client-Cache → DNS-Server.
 * Reine Lesefunktion – nur mit writeCache: true (innerhalb von updateWorld) wird der Cache befüllt.
 */
export function resolveName(w: World, ep: Endpoint, name: string, opts: { useCache?: boolean; server?: string; writeCache?: boolean } = {}): ResolveResult {
  const host = name.trim().toLowerCase().replace(/^https?:\/\//, '').split(/[/:]/)[0]
  if (!host) return { ok: false, error: 'Kein Name angegeben.' }
  if (isValidIp(host)) return { ok: true, ip: host, source: 'literal', fqdn: host }
  if (host === 'localhost') return { ok: true, ip: '127.0.0.1', source: 'hosts', fqdn: 'localhost' }
  const useCache = opts.useCache ?? true
  if (!opts.server) {
    const hosts = readHosts(ep)
    if (hosts[host]) return { ok: true, ip: hosts[host], source: 'hosts', fqdn: host }
    const short = host.replace(/\.musterwerk\.local$/, '')
    if (hosts[short]) return { ok: true, ip: hosts[short], source: 'hosts', fqdn: host }
    if (useCache && isServiceRunning(ep, 'Dnscache') && ep.dnsCache[host]) return { ok: true, ip: ep.dnsCache[host], source: 'cache', fqdn: host }
  }
  const cfg = primaryConfig(ep)
  if (!cfg) return { ok: false, error: 'Keine Netzwerkverbindung.' }
  const servers = opts.server ? [opts.server] : cfg.dns.length ? cfg.dns : []
  if (!servers.length) return { ok: false, error: 'Es sind keine DNS-Server konfiguriert.' }
  for (const server of servers) {
    const kind = dnsServerWorks(w, ep, server)
    if (kind === 'dead') continue
    if (kind === 'internal') {
      const int = lookupInternal(w, host)
      if (int.ip) {
        if (opts.writeCache && isServiceRunning(ep, 'Dnscache')) ep.dnsCache[host] = int.ip
        return { ok: true, ip: int.ip, fqdn: int.fqdn, server, source: 'dns', aliases: int.aliases }
      }
      if (host.endsWith('.musterwerk.local') || !host.includes('.')) return { ok: false, server, error: `*** ${server} wurde ${host} nicht gefunden: Non-existent domain` }
      if (!w.infra.dnsForwardersOk || !w.infra.internetUp) return { ok: false, server, error: `DNS request timed out. (Weiterleitung an externe DNS-Server schlägt fehl)` }
    }
    if (kind === 'public' && (host.endsWith('.musterwerk.local') || !host.includes('.'))) return { ok: false, server, error: `*** ${server} wurde ${host} nicht gefunden: Non-existent domain` }
    const ext = INTERNET_HOSTS[host]
    if (ext) {
      if (opts.writeCache && isServiceRunning(ep, 'Dnscache')) ep.dnsCache[host] = ext
      return { ok: true, ip: ext, fqdn: host, server, source: 'dns' }
    }
    return { ok: false, server, error: `*** ${server} wurde ${host} nicht gefunden: Non-existent domain` }
  }
  return { ok: false, server: servers[0], error: `DNS request timed out. Zeitüberschreitung bei Anforderung an Server ${servers[0]}.` }
}

// ─────────────── HTTP (für den Browser) ───────────────

export type HttpErrorCode =
  | 'ERR_INTERNET_DISCONNECTED'
  | 'DNS_PROBE_FINISHED_NXDOMAIN'
  | 'DNS_PROBE_FINISHED_NO_INTERNET'
  | 'ERR_CONNECTION_TIMED_OUT'
  | 'ERR_PROXY_CONNECTION_FAILED'
  | 'ERR_CONNECTION_REFUSED'
  | 'ERR_ADDRESS_UNREACHABLE'

export interface HttpResult {
  ok: boolean
  host: string
  ip?: string
  error?: HttpErrorCode
  detail?: string
  viaProxy?: boolean
  /** Antwort kam von einem anderen Server als erwartet (z.B. manipulierte hosts-Datei) */
  spoofed?: boolean
}

/** Simuliert einen HTTP-Aufruf vom Endpunkt aus */
export function httpRequest(w: World, ep: Endpoint, url: string): HttpResult {
  const host = url.trim().toLowerCase().replace(/^[a-z]+:\/\//, '').split(/[/:?#]/)[0]
  if (!uplinkConfig(ep) && !primaryConfig(ep)) return { ok: false, host, error: 'ERR_INTERNET_DISCONNECTED', detail: 'Keine Internetverbindung: Netzwerkkabel, Modem und Router prüfen bzw. erneut mit dem WLAN verbinden.' }
  const proxy = getProxySettings(ep)
  const internalTarget = host.endsWith('.musterwerk.local') || !host.includes('.') || isValidIp(host) && host.startsWith('10.')
  const bypassed = internalTarget && /musterwerk\.local|<local>|10\.\*/i.test(proxy.bypass)
  if (proxy.enabled && !bypassed) {
    const [pHost, pPort] = proxy.server.split(':')
    const pr = resolveName(w, ep, pHost)
    const correct = pr.ok && pr.ip === '10.10.0.60' && Number(pPort || 80) === w.infra.proxy.port
    if (!pr.ok || !correct || !w.infra.proxy.online || !reach(w, ep, pr.ip!).ok) return { ok: false, host, error: 'ERR_PROXY_CONNECTION_FAILED', detail: `Es kann keine Verbindung zum Proxyserver "${proxy.server}" hergestellt werden. Proxy-Einstellungen prüfen.`, viaProxy: true }
    // Proxy löst selbst auf (immer korrekt, ignoriert hosts-Datei des Clients)
    const ip = INTERNET_HOSTS[host] ?? lookupIp(w, host)
    if (!ip) return { ok: false, host, error: 'DNS_PROBE_FINISHED_NXDOMAIN', detail: `Die Server-IP-Adresse von ${host} wurde nicht gefunden.`, viaProxy: true }
    if (!w.infra.internetUp && !ip.startsWith('10.')) return { ok: false, host, error: 'ERR_CONNECTION_TIMED_OUT', viaProxy: true }
    return { ok: true, host, ip, viaProxy: true }
  }
  const r = resolveName(w, ep, host)
  if (!r.ok) {
    const noInternet = !reach(w, ep, '198.51.100.10').ok
    return { ok: false, host, error: noInternet && !internalTarget ? 'DNS_PROBE_FINISHED_NO_INTERNET' : 'DNS_PROBE_FINISHED_NXDOMAIN', detail: r.error }
  }
  const rr = reach(w, ep, r.ip!)
  if (!rr.ok) return { ok: false, host, ip: r.ip, error: rr.error === 'apipa' || rr.error === 'no-gateway' ? 'ERR_ADDRESS_UNREACHABLE' : 'ERR_CONNECTION_TIMED_OUT', detail: rr.message }
  const expected = INTERNET_HOSTS[host] ?? lookupIp(w, host)
  const spoofed = !!expected && expected !== r.ip
  const owner = ownerOfIp(w, r.ip!)
  if (owner.kind === 'none' && !spoofed) return { ok: false, host, ip: r.ip, error: 'ERR_CONNECTION_REFUSED' }
  return { ok: true, host, ip: r.ip, spoofed }
}

/** Korrekte IP eines Namens laut DNS (ohne Client-Einflüsse) */
export function lookupIp(w: World, host: string): string | undefined {
  if (isValidIp(host)) return host
  return INTERNET_HOSTS[host.toLowerCase()] ?? lookupInternal(w, host).ip
}

/** Schnelle Gesamtdiagnose für Szenario-Checks: Kann der Client Intranet + Internet erreichen? */
export function connectivity(w: World, ep: Endpoint) {
  const intranet = httpRequest(w, ep, 'http://intranet.musterwerk.local')
  const internet = httpRequest(w, ep, 'https://www.suche.example')
  return { intranet: intranet.ok && !intranet.spoofed, internet: internet.ok && !internet.spoofed }
}

export const isDnsClientRunning = (ep: Endpoint) => !!findService(ep.services, 'Dnscache') && isServiceRunning(ep, 'Dnscache')
