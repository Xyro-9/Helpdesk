// Netzwerkbefehle (cmd-Stil, auch in PowerShell verfügbar): ipconfig, ping, tracert, nslookup, netstat, arp, route, getmac, netsh

import { A } from '@/core/actions'
import type { Endpoint, NetAdapter } from '@/core/types'
import { isServiceRunning, readHosts } from '@/core/ops/endpoint'
import { activeConfigs, dhcpServerOk, primaryConfig, reach, releaseDhcp, renewDhcp, resolveName, uplinkConfig, ownerOfIp } from '@/core/sim/network'
import { hashString, isApipa, isValidIp, maskToPrefix, sameSubnet } from '@/core/util'
import { act, dots, elevationMsg, fmtDT, lowerArgs, optVal, type Env, type Handler } from './shell'

export function adapterHeader(a: NetAdapter) {
  if (a.kind === 'WLAN') return `Drahtlos-LAN-Adapter ${a.name}:`
  if (a.kind === 'VPN') return `Unbekannter Adapter ${a.name}:`
  return `Ethernet-Adapter ${a.name}:`
}

export function findAdapter(ep: Endpoint, name: string | undefined): NetAdapter | undefined {
  if (!name) return undefined
  const n = name.toLowerCase().replace(/^name=/, '')
  return ep.adapters.find((a) => a.name.toLowerCase() === n || (n === 'wi-fi' && a.kind === 'WLAN') || (n === 'lan' && a.kind === 'Ethernet'))
}

const leaseInfo = (ep: Endpoint) => {
  const base = new Date(ep.lastBoot).getTime()
  return { got: new Date(base).toISOString(), exp: new Date(base + 8 * 86400000).toISOString() }
}

export function dnsNameOf(ip: string): string {
  if (ip === '10.10.0.10') return 'dc01.musterwerk.local'
  if (ip === '10.10.0.11') return 'dc02.musterwerk.local'
  if (ip === '192.168.178.1') return 'heimrouter.lan'
  return 'UnKnown'
}

function ipconfigShow(e: Env, all: boolean): string {
  const ep = e.ep
  const out: string[] = ['', 'Windows-IP-Konfiguration', '']
  if (all) {
    out.push(`   ${dots('Hostname', 35)}${ep.hostname}`, `   ${dots('Primäres DNS-Suffix', 35)}musterwerk.local`, `   ${dots('Knotentyp', 35)}Hybrid`, `   ${dots('IP-Routing aktiviert', 35)}Nein`, `   ${dots('WINS-Proxy aktiviert', 35)}Nein`, `   ${dots('DNS-Suffixsuchliste', 35)}musterwerk.local`, '')
  }
  const L = (label: string, v: string) => `   ${dots(label, 35)}${v}`
  for (const a of ep.adapters.filter((x) => x.enabled)) {
    out.push(adapterHeader(a), '')
    const corp = a.network !== 'home' && a.network !== 'none'
    if (!a.mediaConnected) {
      out.push(L('Medienstatus', 'Medium getrennt'), L('Verbindungsspezifisches DNS-Suffix', ''))
      if (all) out.push(L('Beschreibung', a.description), L('Physische Adresse', a.mac), L('DHCP aktiviert', a.dhcp ? 'Ja' : 'Nein'), L('Autokonfiguration aktiviert', 'Ja'))
      out.push('')
      continue
    }
    out.push(L('Verbindungsspezifisches DNS-Suffix', corp ? 'musterwerk.local' : a.network === 'home' ? 'heimnetz.lan' : ''))
    if (all) out.push(L('Beschreibung', a.description), L('Physische Adresse', a.mac), L('DHCP aktiviert', a.dhcp ? 'Ja' : 'Nein'), L('Autokonfiguration aktiviert', 'Ja'))
    const hasIp = a.ip && a.ip !== '0.0.0.0'
    if (hasIp) {
      out.push(L('Verbindungslokale IPv6-Adresse', `fe80::${(hashString(a.mac) % 0xffff).toString(16)}:${(hashString(a.mac + 'x') % 0xffff).toString(16)}%${ep.adapters.indexOf(a) + 7}${all ? '(Bevorzugt)' : ''}`))
      if (isApipa(a.ip)) out.push(L('Autokonfiguration IPv4-Adresse', `${a.ip}${all ? '(Bevorzugt)' : ''}`))
      else out.push(L('IPv4-Adresse', `${a.ip}${all ? '(Bevorzugt)' : ''}`))
      out.push(L('Subnetzmaske', a.mask))
      if (all && a.dhcp && !isApipa(a.ip)) {
        const li = leaseInfo(ep)
        out.push(L('Lease erhalten', fmtDT(li.got)), L('Lease läuft ab', fmtDT(li.exp)))
      }
    }
    out.push(L('Standardgateway', hasIp ? a.gateway : ''))
    if (all) {
      if (a.dhcp && hasIp && !isApipa(a.ip)) out.push(L('DHCP-Server', a.network === 'home' ? '192.168.178.1' : '10.10.0.10'))
      if (a.dnsServers.length) {
        out.push(L('DNS-Server', a.dnsServers[0]))
        for (const d of a.dnsServers.slice(1)) out.push(' '.repeat(41) + d)
      } else out.push(L('DNS-Server', ''))
      out.push(L('NetBIOS über TCP/IP', 'Aktiviert'))
    }
    out.push('')
  }
  return out.join('\n')
}

export const ipconfig: Handler = (e, args) => {
  const a = lowerArgs(args)
  const op = a.find((x) => x.startsWith('/') || x.startsWith('-'))?.replace(/^-/, '/')
  const ep = e.ep
  if (!op || op === '/all') return ipconfigShow(e, op === '/all')
  if (op === '/?' ) return 'Verwendung: ipconfig [/all | /release | /renew | /flushdns | /displaydns | /registerdns]'
  if (op === '/flushdns') {
    if (!isServiceRunning(ep, 'Dnscache')) return '\nWindows-IP-Konfiguration\n\nFehler beim Leeren des DNS-Auflösungscaches: Funktion fehlgeschlagen während der Ausführung.\n(Der DNS-Client-Dienst "Dnscache" wird nicht ausgeführt.)'
    ep.dnsCache = {}
    act(e, A.networkChanged, e.host, 'DNS-Cache geleert (ipconfig /flushdns)')
    return '\nWindows-IP-Konfiguration\n\nDer DNS-Auflösungscache wurde geleert.'
  }
  if (op === '/displaydns') {
    if (!isServiceRunning(ep, 'Dnscache')) return '\nWindows-IP-Konfiguration\n\nDer DNS-Auflösungscache konnte nicht angezeigt werden (DNS-Client-Dienst beendet).'
    const entries: [string, string][] = [...Object.entries(readHosts(ep)), ...Object.entries(ep.dnsCache)]
    if (!entries.length) return '\nWindows-IP-Konfiguration\n\nDer DNS-Auflösungscache konnte nicht angezeigt werden. (Cache ist leer)'
    const out = ['', 'Windows-IP-Konfiguration', '']
    for (const [name, ip] of entries) {
      out.push(`    ${name}`, '    ----------------------------------------', `    ${dots('Eintragsname', 24)}${name}`, `    ${dots('Eintragstyp', 24)}1`, `    ${dots('Gültigkeitsdauer', 24)}${600 + (hashString(name) % 3000)}`, `    ${dots('Datenlänge', 24)}4`, `    ${dots('Abschnitt', 24)}Antwort`, `    ${dots('(Host-)A-Eintrag', 24)}${ip}`, '', '')
    }
    return out.join('\n')
  }
  if (op === '/release' || op === '/renew' || op === '/registerdns') {
    if (!e.admin) return '\nWindows-IP-Konfiguration\n\nDer angeforderte Vorgang erfordert erhöhte Rechte (Als Administrator ausführen).'
    if (op === '/registerdns') {
      act(e, A.networkChanged, e.host, 'ipconfig /registerdns')
      return '\nWindows-IP-Konfiguration\n\nDie Registrierung der DNS-Ressourceneinträge für alle Adapter dieses Computers wurde initiiert. Eventuelle Fehler werden innerhalb von 15 Minuten in der Ereignisanzeige gemeldet.'
    }
    const target = args.find((x) => !x.startsWith('/') && !x.startsWith('-'))
    const adapters = ep.adapters.filter((x) => x.enabled && x.kind !== 'VPN' && x.dhcp && (!target || x.name.toLowerCase() === target.toLowerCase().replace(/\*/g, '')))
    const out = ['', 'Windows-IP-Konfiguration', '']
    for (const a of adapters) {
      if (!a.mediaConnected) {
        out.push(`Für "${a.name}" kann kein Vorgang durchgeführt werden, da das Medium getrennt ist.`)
        continue
      }
      if (op === '/release') releaseDhcp(e.w, ep, a)
      else {
        const r = renewDhcp(e.w, ep, a)
        if (!r.ok) out.push(r.message)
      }
    }
    if (!adapters.length) out.push('Für keinen Adapter ist DHCP aktiviert (statische Konfiguration).')
    act(e, A.networkChanged, e.host, op === '/release' ? 'DHCP-Lease freigegeben (ipconfig /release)' : 'DHCP-Lease erneuert (ipconfig /renew)')
    return out.join('\n') + '\n' + ipconfigShow(e, false).split('\n').slice(3).join('\n')
  }
  return `Fehler: Unbekannte oder unvollständige Befehlszeilenoption "${args[0]}".\nVerwendung: ipconfig [/all | /release | /renew | /flushdns | /displaydns]`
}

// ─────────────── ping / tracert ───────────────

function pingLines(e: Env, target: string, count: number, header = true): { lines: string[]; ok: number; ip?: string; fail?: string } {
  const r = resolveName(e.w, e.ep, target, { writeCache: true })
  if (!r.ok || !r.ip) return { lines: [`Ping-Anforderung konnte Host "${target}" nicht finden. Überprüfen Sie den Namen, und versuchen Sie es erneut.`], ok: 0, fail: 'name' }
  const ip = r.ip
  const lines: string[] = []
  if (header) lines.push('', isValidIp(target) ? `Ping wird ausgeführt für ${ip} mit 32 Bytes Daten:` : `Ping wird ausgeführt für ${r.fqdn ?? target} [${ip}] mit 32 Bytes Daten:`)
  let ok = 0
  const times: number[] = []
  for (let i = 0; i < count; i++) {
    const rr = reach(e.w, e.ep, ip)
    if (rr.ok) {
      ok++
      const ms = rr.ms ?? 1
      times.push(ms)
      lines.push(`Antwort von ${ip}: Bytes=32 ${ms < 1 ? 'Zeit<1ms' : `Zeit=${ms}ms`} TTL=${ip === '127.0.0.1' ? 128 : (rr.ttl ?? 128)}`)
    } else if (rr.error === 'apipa' || rr.error === 'no-gateway' || rr.error === 'no-network') lines.push(`PING: Fehler bei der Übertragung. Allgemeiner Fehler.${rr.message && rr.message.includes('(') ? ' ' + rr.message.slice(rr.message.indexOf('(')) : ''}`)
    else if (rr.message?.startsWith('Antwort von')) lines.push(rr.message)
    else lines.push(rr.message ?? 'Zeitüberschreitung der Anforderung.')
  }
  lines.push('', `Ping-Statistik für ${ip}:`, `    Pakete: Gesendet = ${count}, Empfangen = ${ok}, Verloren = ${count - ok}`, `    (${Math.round(((count - ok) / count) * 100)}% Verlust),`)
  if (times.length) lines.push('Ca. Zeitangaben in Millisek.:', `    Minimum = ${Math.min(...times)}ms, Maximum = ${Math.max(...times)}ms, Mittelwert = ${Math.round(times.reduce((s, t) => s + t, 0) / times.length)}ms`)
  return { lines, ok, ip }
}

export const ping: Handler = (e, args) => {
  const target = args.find((x, i) => !x.startsWith('-') && !x.startsWith('/') && !/^-(n|l|i|w)$/i.test(args[i - 1] ?? ''))
  if (!target) return '\nSyntax: ping [-t] [-n Anzahl] [-4] Zielname\n\nBeispiel: ping fs01   |   ping 10.10.0.10   |   ping www.suche.example'
  const n = Number(optVal(args, '-n', '/n') ?? 4)
  return pingLines(e, target, Math.max(1, Math.min(n || 4, 10))).lines.join('\n')
}

export const tracert: Handler = (e, args) => {
  const target = args.find((x) => !x.startsWith('-') && !x.startsWith('/'))
  if (!target) return 'Syntax: tracert Zielname'
  const r = resolveName(e.w, e.ep, target, { writeCache: true })
  if (!r.ok || !r.ip) return `Der Zielname "${target}" konnte nicht aufgelöst werden.`
  const ip = r.ip
  const out = ['', isValidIp(target) ? `Routenverfolgung zu ${ip} über maximal 30 Hops` : `Routenverfolgung zu ${r.fqdn ?? target} [${ip}]`, isValidIp(target) ? '' : 'über maximal 30 Hops:', '']
  const up = uplinkConfig(e.ep)
  const vpn = activeConfigs(e.ep).find((c) => c.adapter.kind === 'VPN')
  const final = reach(e.w, e.ep, ip)
  const hop = (n: number, h: string) => `  ${String(n).padStart(2)}    ${`${1 + (n % 3)} ms`.padStart(5)}    ${`${1 + (n % 2)} ms`.padStart(5)}    ${`${1 + (n % 4)} ms`.padStart(5)}  ${h}`
  const star = (n: number) => `  ${String(n).padStart(2)}     *        *        *     Zeitüberschreitung der Anforderung.`
  const hops: string[] = []
  const internal = ip.startsWith('10.')
  if (up && !up.apipa && up.gateway && !(internal && sameSubnet(up.ip, ip, up.mask) && !vpn)) {
    if (internal && vpn) hops.push('vpn-gw.musterwerk.local [10.10.99.1]')
    else hops.push(up.adapter.network === 'home' ? 'heimrouter.lan [192.168.178.1]' : `${up.gateway}`)
    if (!internal) hops.push(up.adapter.network === 'home' ? '100.64.12.1' : 'fw01.musterwerk.local [10.10.0.1]', 'provider-core-1.netz.example [192.0.2.17]', 'ix-hamburg.netz.example [192.0.2.41]')
  }
  let n = 1
  if (!final.ok) {
    const reachable = up && !up.apipa && up.gateway ? hops.slice(0, 1) : []
    for (const h of reachable) out.push(hop(n++, h))
    for (let i = 0; i < 3; i++) out.push(star(n++))
    out.push('', 'Ablaufverfolgung beendet. (Ziel nicht erreicht – weitere Hops gekürzt)')
    return out.join('\n')
  }
  for (const h of hops) out.push(hop(n++, h))
  out.push(hop(n, isValidIp(target) ? ip : `${r.fqdn ?? target} [${ip}]`), '', 'Ablaufverfolgung beendet.')
  return out.join('\n')
}

export const pathping: Handler = (e, args) => tracert(e, args, '') + '\n\nBerechnung der Statistiken dauert ca. 25 Sekunden...\nKein Paketverlust festgestellt (Simulator: vereinfachte Ausgabe).'

// ─────────────── nslookup ───────────────

export const nslookup: Handler = (e, args) => {
  const pos = args.filter((x) => !x.startsWith('-'))
  const name = pos[0]
  const cfg = primaryConfig(e.ep)
  const server = pos[1] ?? cfg?.dns[0]
  if (!server) return '*** Der Standardserver ist nicht verfügbar (keine DNS-Server konfiguriert).'
  const sName = dnsNameOf(server)
  const head = `Server:  ${sName}\nAddress:  ${server}\n`
  if (!name) return `Standardserver:  ${sName}\nAddress:  ${server}\n\n(Der interaktive Modus wird im Simulator nicht unterstützt. Verwendung: nslookup <Name> [Server])`
  const r = resolveName(e.w, e.ep, name, { server, useCache: false })
  if (!r.ok) {
    if (/timed out|Zeitüberschreitung/i.test(r.error ?? '')) {
      const reachable = reach(e.w, e.ep, server).ok
      return `DNS request timed out.\n    timeout was 2 seconds.\n${head}\n*** Zeitüberschreitung bei Anforderung an ${sName}.${reachable ? '' : `\n(Der DNS-Server ${server} ist nicht erreichbar.)`}`
    }
    return `${head}\n*** ${sName} wurde ${name} nicht gefunden: Non-existent domain`
  }
  const externalAnswer = !r.fqdn?.endsWith('musterwerk.local') && !isValidIp(name)
  const lines = [head]
  if (externalAnswer) lines.push('Nicht autorisierende Antwort:')
  lines.push(`Name:    ${r.fqdn ?? name}`, `Address:  ${r.ip}`)
  if (r.aliases?.length) lines.push(`Aliases:  ${r.aliases.join('\n          ')}`)
  return lines.join('\n') + '\n'
}

// ─────────────── netstat / arp / route / getmac ───────────────

export const netstat: Handler = (e, args) => {
  const ep = e.ep
  const cfg = primaryConfig(ep)
  const me = cfg?.ip ?? '127.0.0.1'
  const withPid = lowerArgs(args).some((a) => a.includes('o'))
  const rows: [string, string, string, string, number][] = [
    ['TCP', '0.0.0.0:135', '0.0.0.0:0', 'ABHÖREN', 1012],
    ['TCP', '0.0.0.0:445', '0.0.0.0:0', 'ABHÖREN', 4],
  ]
  if (isServiceRunning(ep, 'TermService')) rows.push(['TCP', '0.0.0.0:3389', '0.0.0.0:0', 'ABHÖREN', 1188])
  if (isServiceRunning(ep, 'WinRM')) rows.push(['TCP', '0.0.0.0:5985', '0.0.0.0:0', 'ABHÖREN', 4])
  rows.push(['TCP', '0.0.0.0:49664', '0.0.0.0:0', 'ABHÖREN', 760], ['TCP', '0.0.0.0:49665', '0.0.0.0:0', 'ABHÖREN', 612])
  if (cfg && !cfg.apipa) {
    let port = 50110
    const est = (remote: string, pid: number) => rows.push(['TCP', `${me}:${port++}`, remote, 'HERGESTELLT', pid])
    const ok = (ip: string) => reach(e.w, ep, ip).ok
    if (ok('10.10.0.10')) est('10.10.0.10:389', 760)
    if (ep.mappedDrives.length && ok('10.10.0.20')) est('10.10.0.20:445', 4)
    if (ep.printers.some((p) => p.serverQueue) && ok('10.10.0.30')) est('10.10.0.30:445', 4)
    if (ep.processes.some((p) => p.name === 'OUTLOOK.EXE') && ok('198.51.100.22')) est('198.51.100.22:443', 5120)
    if (ep.processes.some((p) => p.name === 'ERPClient.exe') && ok('10.10.0.40')) est('10.10.0.40:4711', 6300)
    if (ep.processes.some((p) => p.name === 'msedge.exe') && ok('198.51.100.10')) est('198.51.100.10:443', 7012)
  }
  rows.push(['UDP', '0.0.0.0:123', '*:*', '', 1440], ['UDP', '0.0.0.0:5353', '*:*', '', 1920])
  const out = ['', 'Aktive Verbindungen', '', `  Proto  Lokale Adresse         Remoteadresse          Status${withPid ? '           PID' : ''}`]
  for (const [p, l, r, s, pid] of rows) out.push(`  ${p.padEnd(7)}${l.padEnd(23)}${r.padEnd(23)}${s.padEnd(withPid ? 16 : 0)}${withPid ? ' ' + pid : ''}`.trimEnd())
  return out.join('\n')
}

export const arp: Handler = (e) => {
  const out: string[] = []
  activeConfigs(e.ep).forEach((c, i) => {
    out.push('', `Schnittstelle: ${c.ip} --- 0x${(i + 7).toString(16)}`, '  Internetadresse       Physische Adresse     Typ')
    if (c.gateway && !c.apipa) out.push(`  ${c.gateway.padEnd(22)}00-1a-8c-${(hashString(c.gateway) % 256).toString(16).padStart(2, '0')}-4e-01     dynamisch`)
    if (!c.apipa && c.ip.startsWith('10.10.') && sameSubnet(c.ip, '10.10.0.10', c.mask)) out.push(`  ${'10.10.0.10'.padEnd(22)}00-15-5d-0a-00-0a     dynamisch`)
    const bc = c.ip.split('.').slice(0, 3).join('.') + '.255'
    out.push(`  ${bc.padEnd(22)}ff-ff-ff-ff-ff-ff     statisch`, `  ${'224.0.0.22'.padEnd(22)}01-00-5e-00-00-16     statisch`, `  ${'239.255.255.250'.padEnd(22)}01-00-5e-7f-ff-fa     statisch`)
  })
  return out.length ? out.join('\n') : 'Keine ARP-Einträge gefunden.'
}

export const route: Handler = (e, args) => {
  if (!lowerArgs(args).includes('print')) return 'Verwendung: route print   (Änderungen an Routen sind im Simulator nicht vorgesehen)'
  const out = ['===========================================================================', 'Schnittstellenliste']
  e.ep.adapters.forEach((a, i) => out.push(`  ${String(i + 7).padStart(2)}...${a.mac.toLowerCase().replace(/-/g, ' ')} ......${a.description}`))
  out.push('   1...........................Software Loopback Interface 1', '===========================================================================', '', 'IPv4-Routentabelle', '===========================================================================', 'Aktive Routen:', '     Netzwerkziel    Netzwerkmaske          Gateway    Schnittstelle Metrik')
  for (const c of activeConfigs(e.ep)) {
    if (c.gateway) out.push(`          0.0.0.0          0.0.0.0${c.gateway.padStart(17)}${c.ip.padStart(17)}     25`)
    const net = c.ip.split('.').slice(0, 3).join('.') + '.0'
    out.push(`${net.padStart(17)}${c.mask.padStart(17)}   Auf Verbindung${c.ip.padStart(17)}    281`)
  }
  out.push('        127.0.0.0        255.0.0.0   Auf Verbindung         127.0.0.1    331', '===========================================================================', 'Ständige Routen:', '  Keine')
  return out.join('\n')
}

export const getmac: Handler = (e) => {
  const out = ['', 'Physische Adresse   Transportname', '=================== ==========================================================']
  for (const a of e.ep.adapters) out.push(`${a.mac.padEnd(20)}${!a.enabled ? 'Deaktiviert' : !a.mediaConnected ? 'Medien getrennt' : `\\Device\\Tcpip_{${(hashString(a.mac) >>> 0).toString(16).toUpperCase().padStart(8, '0')}-4A1C-4E2B-9F11-${a.mac.replace(/-/g, '')}}`}`)
  return out.join('\n')
}

// ─────────────── netsh ───────────────

export function resetDnsToDhcp(e: Env, a: NetAdapter) {
  a.dnsFromDhcp = true
  if (a.network === 'home') a.dnsServers = ['192.168.178.1']
  else {
    const scope = e.w.infra.dhcpScopes.find((s) => s.id === a.network)
    if (scope && dhcpServerOk(e.w) && a.dhcp) a.dnsServers = [...scope.dnsServers]
    else if (!a.dhcp) a.dnsServers = []
  }
}

function netshShowConfig(e: Env, only?: string) {
  const out: string[] = []
  for (const a of e.ep.adapters.filter((x) => !only || x.name.toLowerCase() === only.toLowerCase())) {
    out.push('', `Konfiguration der Schnittstelle "${a.name}"`)
    out.push(`    DHCP aktiviert:                       ${a.dhcp ? 'Ja' : 'Nein'}`)
    if (a.enabled && a.mediaConnected && a.ip) {
      out.push(`    IP-Adresse:                           ${a.ip}`, `    Subnetzpräfix:                        ${a.ip.split('.').slice(0, 3).join('.')}.0/${maskToPrefix(a.mask)} (Maske ${a.mask})`)
      if (a.gateway) out.push(`    Standardgateway:                      ${a.gateway}`, '    Gatewaymetrik:                        0')
    }
    out.push(`    InterfaceMetric:                      ${a.kind === 'Ethernet' ? 25 : a.kind === 'WLAN' ? 35 : 1}`)
    const label = a.dnsFromDhcp ? 'Über DHCP konfigurierte DNS-Server:  ' : 'Statisch konfigurierte DNS-Server:    '
    out.push(`    ${label}${a.dnsServers[0] ?? 'Keine'}`)
    for (const d of a.dnsServers.slice(1)) out.push(' '.repeat(42) + d)
    out.push('    Mit primärem Suffix registrieren:     Nur primäres', '    Über DHCP konfigurierte WINS-Server:  Keine')
  }
  return out.join('\n')
}

export const netsh: Handler = (e, args) => {
  const a = lowerArgs(args)
  const s = a.join(' ')
  const denied = () => 'Der angeforderte Vorgang erfordert erhöhte Rechte (Als Administrator ausführen).'
  if (!a.length) return 'netsh> (Interaktiver Modus wird nicht unterstützt.)\nBeispiele: netsh interface ip show config | netsh interface ip set dns "Ethernet" dhcp | netsh winhttp show proxy | netsh wlan show interfaces'
  if (/^(interface|int) (ip|ipv4) show (config|addresses|dnsservers|dns)/.test(s)) {
    const name = args.slice(4).find((x) => !x.includes('='))
    return netshShowConfig(e, name)
  }
  const named = (key: string) => args.find((x) => x.toLowerCase().startsWith(key + '='))?.split('=')[1]
  if (/^(interface|int) (ip|ipv4) set address/.test(s)) {
    if (!e.admin) return denied()
    const rest = args.slice(4)
    const ad = findAdapter(e.ep, named('name') ?? rest[0])
    if (!ad) return 'Die Schnittstelle wurde nicht gefunden. Verwenden Sie z.B. "Ethernet" oder "WLAN".'
    const vals = rest.slice(1).filter((x) => !x.includes('=') || /^source=/i.test(x)).map((x) => x.replace(/^source=/i, '').toLowerCase())
    const src = (named('source') ?? vals[0] ?? '').toLowerCase()
    if (src === 'dhcp') {
      ad.dhcp = true
      const r = renewDhcp(e.w, e.ep, ad)
      act(e, A.networkChanged, e.host, `netsh: ${ad.name} IP-Adresse per DHCP`)
      return r.ok ? 'Ok.' : `Ok.\n${r.message}`
    }
    if (src === 'static') {
      const ipv = named('address') ?? named('addr') ?? rest[2]
      const mask = named('mask') ?? rest[3] ?? '255.255.255.0'
      const gw = named('gateway') ?? rest[4] ?? ''
      if (!ipv || !isValidIp(ipv) || !isValidIp(mask) || (gw && gw !== 'none' && !isValidIp(gw))) return 'Ungültige Parameter. Syntax: netsh interface ip set address "Ethernet" static <IP> <Maske> <Gateway>'
      ad.dhcp = false
      ad.ip = ipv
      ad.mask = mask
      ad.gateway = gw === 'none' ? '' : gw
      act(e, A.networkChanged, e.host, `netsh: ${ad.name} statisch ${ipv}/${mask} GW ${gw || '-'}`)
      return 'Ok.'
    }
    return 'Syntax: netsh interface ip set address "Ethernet" dhcp\n        netsh interface ip set address "Ethernet" static 10.10.20.80 255.255.255.0 10.10.20.1'
  }
  if (/^(interface|int) (ip|ipv4) (set|add) (dns|dnsservers|dnsserver)/.test(s)) {
    if (!e.admin) return denied()
    const rest = args.slice(4)
    const ad = findAdapter(e.ep, named('name') ?? rest[0])
    if (!ad) return 'Die Schnittstelle wurde nicht gefunden.'
    const vals = rest.slice(1).filter((x) => !/^(index|register|validate|name)=/i.test(x)).map((x) => x.replace(/^(source|address)=/i, ''))
    if (a[2] === 'add') {
      const ipv = vals[0]
      if (!ipv || !isValidIp(ipv)) return 'Ungültige DNS-Serveradresse.'
      if (!ad.dnsServers.includes(ipv)) ad.dnsServers.push(ipv)
      ad.dnsFromDhcp = false
      act(e, A.networkChanged, e.host, `netsh: ${ad.name} DNS hinzugefügt ${ipv}`)
      return 'Ok.'
    }
    const mode = (vals[0] ?? '').toLowerCase()
    if (mode === 'dhcp') {
      resetDnsToDhcp(e, ad)
      act(e, A.networkChanged, e.host, `netsh: ${ad.name} DNS automatisch (DHCP)`)
      return 'Ok.'
    }
    const ipv = mode === 'static' ? vals[1] : vals[0]
    if (!ipv || !isValidIp(ipv)) return 'Syntax: netsh interface ip set dns "Ethernet" static 10.10.0.10   bzw.   netsh interface ip set dns "Ethernet" dhcp'
    ad.dnsFromDhcp = false
    ad.dnsServers = [ipv]
    act(e, A.networkChanged, e.host, `netsh: ${ad.name} DNS statisch ${ipv}`)
    return 'Ok.'
  }
  if (/^(interface|int) set interface/.test(s)) {
    if (!e.admin) return denied()
    const rest = args.slice(3)
    const ad = findAdapter(e.ep, named('name') ?? rest[0])
    if (!ad) return 'Die Schnittstelle wurde nicht gefunden.'
    const v = (named('admin') ?? rest[1] ?? '').toLowerCase()
    if (!/^(enable|enabled|disable|disabled)$/.test(v)) return 'Syntax: netsh interface set interface "Ethernet" enable|disable'
    ad.enabled = v.startsWith('enable')
    if (ad.enabled && ad.dhcp && ad.mediaConnected) renewDhcp(e.w, e.ep, ad)
    act(e, A.networkChanged, e.host, `Adapter "${ad.name}" ${ad.enabled ? 'aktiviert' : 'deaktiviert'}`)
    return ''
  }
  if (/^(interface|int) show interface/.test(s)) {
    const out = ['', 'Administratorstatus Status          Typ              Schnittstellenname', '-------------------------------------------------------------------------']
    for (const ad of e.ep.adapters) out.push(`${(ad.enabled ? 'Aktiviert' : 'Deaktiviert').padEnd(20)}${(ad.enabled && ad.mediaConnected ? 'Verbunden' : 'Getrennt').padEnd(16)}${'Dediziert'.padEnd(17)}${ad.name}`)
    return out.join('\n')
  }
  if (/^winhttp show proxy/.test(s)) return '\nAktuelle WinHTTP-Proxyeinstellungen:\n\n    Direkter Zugriff (kein Proxyserver).\n\n(Hinweis: Browser-Proxy steht in HKCU\\...\\Internet Settings – "reg query" verwenden.)'
  if (/^wlan show (interfaces|interface)/.test(s)) {
    const w = e.ep.adapters.find((x) => x.kind === 'WLAN')
    if (!w) return 'Auf dem System ist keine Drahtlosschnittstelle vorhanden.'
    const conn = w.enabled && w.mediaConnected
    return [
      '',
      'Es ist 1 Schnittstelle auf dem System vorhanden:',
      '',
      `    Name                   : ${w.name}`,
      `    Beschreibung           : ${w.description}`,
      `    Physische Adresse      : ${w.mac.toLowerCase().replace(/-/g, ':')}`,
      `    Status                 : ${!w.enabled ? 'Deaktiviert' : conn ? 'Verbunden' : 'Getrennt'}`,
      ...(conn ? [`    SSID                   : ${w.ssid ?? ''}`, '    Netzwerktyp            : Infrastruktur', '    Funktyp                : 802.11ax', `    Authentifizierung      : ${w.network === 'home' ? 'WPA2-Personal' : 'WPA2-Enterprise'}`, '    Kanal                  : 44', `    Empfangsrate (MBit/s)  : ${w.speedMbps ?? 866}`, '    Signal                 : 86%', `    Profil                 : ${w.ssid ?? ''}`] : []),
    ].join('\n')
  }
  if (/^advfirewall show (allprofiles|currentprofile)/.test(s)) {
    const f = e.ep.firewall
    return (['Domänenprofil', 'Privates Profil', 'Öffentliches Profil'] as const).map((p, i) => `${p}-Einstellungen:\n----------------------------------------------------------------------\nStatus                                ${[f.domain, f.private, f.public][i] ? 'EIN' : 'AUS'}`).join('\n\n') + '\nOk.'
  }
  if (/^(winsock reset|int ip reset|interface ip reset)/.test(s)) {
    if (!e.admin) return denied()
    e.ep.pendingReboot = true
    act(e, A.networkChanged, e.host, `netsh ${s}`)
    return 'Der Winsock-Katalog bzw. TCP/IP-Stack wurde zurückgesetzt.\nSie müssen den Computer neu starten, um den Vorgang abzuschließen.'
  }
  return `Der folgende Befehl wurde nicht gefunden: ${args.join(' ')}.\nUnterstützt: interface ip show config | interface ip set address/dns | interface set interface | interface show interface | winhttp show proxy | wlan show interfaces | advfirewall show allprofiles | winsock reset`
}

export const hostnameCmd: Handler = (e) => e.host

/** Beschreibt den Besitzer einer IP für Port-Tests */
export function openPorts(e: Env, ip: string): number[] {
  const o = ownerOfIp(e.w, ip)
  if (o.kind === 'server') {
    const base = [135, 445, 3389, 5985]
    if (o.name === 'DC01' || o.name === 'DC02') return [...base, 53, 88, 389, 636, 3268]
    if (o.name === 'APP01') return [...base, 80, 443, 1433, 4711]
    if (o.name === 'PRINT01') return [...base, 80]
    if (o.name === 'VPN-GW') return [443]
    return base
  }
  if (o.kind === 'proxy') return [8080, 3128]
  if (o.kind === 'printer') return [80, 443, 631, 9100]
  if (o.kind === 'internet' || o.kind === 'dns') return [53, 80, 443]
  if (o.kind === 'gateway') return [53, 80]
  if (o.kind === 'endpoint') {
    const ep = Object.values(e.w.endpoints).find((x) => x.hostname === o.name) ?? (o.name === 'localhost' ? e.ep : undefined)
    if (!ep) return [135, 445]
    return [135, ...(isServiceRunning(ep, 'LanmanServer') ? [445] : []), ...(isServiceRunning(ep, 'TermService') ? [3389] : []), ...(isServiceRunning(ep, 'WinRM') ? [5985] : [])]
  }
  return []
}

export { pingLines }
