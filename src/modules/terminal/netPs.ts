// PowerShell-Netzwerk-Cmdlets: Test-NetConnection, Test-Connection, Resolve-DnsName, Get-NetAdapter …

import { A } from '@/core/actions'
import type { NetAdapter } from '@/core/types'
import { isServiceRunning, readHosts } from '@/core/ops/endpoint'
import { activeConfigs, primaryConfig, reach, renewDhcp, resolveName } from '@/core/sim/network'
import { hashString, isApipa, isValidIp, maskToPrefix } from '@/core/util'
import { findAdapter, openPorts, resetDnsToDhcp } from './netCmd'
import { act, arg, argOrPos, elevationMsg, has, list, obj, psArgs, psBool, psError, isObj, type Env, type Handler, type Rec } from './shell'

const ifIndex = (e: Env, a: NetAdapter) => e.ep.adapters.indexOf(a) + 7
const status = (a: NetAdapter) => (!a.enabled ? 'Disabled' : a.mediaConnected ? 'Up' : 'Disconnected')

export const testNetConnection: Handler = (e, args) => {
  const a = psArgs(args, ['informationlevel', 'traceroute'])
  const target = argOrPos(a, 0, 'computername', 'cn', 'remoteaddress') ?? 'www.suche.example'
  const portS = arg(a, 'port') ?? (arg(a, 'commontcpport') ? { http: '80', rdp: '3389', smb: '445', winrm: '5985' }[arg(a, 'commontcpport')!.toLowerCase()] : undefined)
  const cfg = primaryConfig(e.ep)
  const r = resolveName(e.w, e.ep, target, { writeCache: true })
  if (!r.ok || !r.ip) {
    return `WARNUNG: Name resolution of ${target} failed\n\nComputerName   : ${target}\nRemoteAddress  :\nInterfaceAlias :\nSourceAddress  :\nPingSucceeded  : False`
  }
  const rr = reach(e.w, e.ep, r.ip)
  const rec: Rec = { ComputerName: target, RemoteAddress: r.ip }
  if (portS) rec.RemotePort = Number(portS)
  rec.InterfaceAlias = cfg?.adapter.name ?? ''
  rec.SourceAddress = cfg?.ip ?? ''
  const lines: string[] = []
  if (!rr.ok && !portS) lines.push(`WARNUNG: Ping to ${r.ip} failed with status: TimedOut`)
  if (portS) {
    const ok = rr.ok && openPorts(e, r.ip).includes(Number(portS))
    if (!ok) lines.push(`WARNUNG: TCP connect to (${r.ip} : ${portS}) failed`)
    rec.TcpTestSucceeded = psBool(ok)
  } else {
    rec.PingSucceeded = psBool(rr.ok)
    if (rr.ok) rec['PingReplyDetails (RTT)'] = `${rr.ms ?? 1} ms`
  }
  const w = Math.max(...Object.keys(rec).map((k) => k.length))
  return [...lines, '', ...Object.entries(rec).map(([k, v]) => `${k.padEnd(w)} : ${v ?? ''}`), ''].join('\n')
}

export const testConnection: Handler = (e, args) => {
  const a = psArgs(args, ['quiet'])
  const target = argOrPos(a, 0, 'computername', 'targetname', 'cn')
  if (!target) return psError(e, 'Der Parameter "-ComputerName" fehlt.')
  const count = Number(arg(a, 'count') ?? 4) || 4
  const r = resolveName(e.w, e.ep, target, { writeCache: true })
  const results = Array.from({ length: Math.min(count, 10) }, () => (r.ok && r.ip ? reach(e.w, e.ep, r.ip) : undefined))
  const okCount = results.filter((x) => x?.ok).length
  if (has(a, 'quiet')) return psBool(okCount > 0)
  if (!okCount) return psError(e, `Fehler beim Testen der Verbindung mit dem Computer "${target}": ${r.ok ? 'Zeitüberschreitung der Anforderung.' : 'Der Hostname konnte nicht aufgelöst werden.'}`, 'ResourceUnavailable')
  return obj(
    results.filter((x) => x?.ok).map((x) => ({ Source: e.host, Destination: target, IPV4Address: r.ip, IPV6Address: '', Bytes: 32, 'Time(ms)': x!.ms ?? 1 })),
    ['Source', 'Destination', 'IPV4Address', 'IPV6Address', 'Bytes', 'Time(ms)'],
  )
}

export const resolveDnsName: Handler = (e, args) => {
  const a = psArgs(args, ['dnsonly', 'nohostsfile', 'cacheonly'])
  const name = argOrPos(a, 0, 'name')
  if (!name) return psError(e, 'Der Parameter "-Name" fehlt.')
  const server = arg(a, 'server')
  const hosts = readHosts(e.ep)
  if (!server && !has(a, 'nohostsfile', 'dnsonly') && hosts[name.toLowerCase()]) {
    return obj([{ Name: name, Type: 'A', TTL: 86400, Section: 'Answer', IPAddress: hosts[name.toLowerCase()] }], ['Name', 'Type', 'TTL', 'Section', 'IPAddress'])
  }
  const dns = server ?? primaryConfig(e.ep)?.dns[0]
  if (!dns) return psError(e, `${name} : Es sind keine DNS-Server konfiguriert.`, 'OperationTimeout')
  const r = resolveName(e.w, e.ep, name, { server: dns, useCache: false, writeCache: true })
  if (!r.ok) {
    if (/timed out|Zeitüberschreitung/i.test(r.error ?? '')) return psError(e, `${name} : Vorgang wurde wegen Zeitüberschreitung beendet (DNS-Server ${dns})`, 'OperationTimeout')
    return psError(e, `${name} : DNS-Name ist nicht vorhanden`, 'ResourceUnavailable')
  }
  const rows: Rec[] = []
  for (const al of r.aliases ?? []) rows.push({ Name: al, Type: 'CNAME', TTL: 3600, Section: 'Answer', NameHost: r.fqdn, IPAddress: '' })
  rows.push({ Name: r.fqdn ?? name, Type: 'A', TTL: 1200, Section: 'Answer', NameHost: '', IPAddress: r.ip })
  return obj(rows, rows.length > 1 ? ['Name', 'Type', 'TTL', 'Section', 'NameHost', 'IPAddress'] : ['Name', 'Type', 'TTL', 'Section', 'IPAddress'])
}

export const getNetAdapter: Handler = (e, args) => {
  const a = psArgs(args)
  const name = argOrPos(a, 0, 'name', 'interfacealias')
  const ads = e.ep.adapters.filter((x) => !name || new RegExp('^' + name.replace(/\*/g, '.*') + '$', 'i').test(x.name))
  if (name && !ads.length) return psError(e, `Es wurden keine MSFT_NetAdapter-Objekte gefunden, deren Eigenschaft "Name" gleich "${name}" ist.`, 'ObjectNotFound')
  return obj(
    ads.map((x) => ({ Name: x.name, InterfaceDescription: x.description, ifIndex: ifIndex(e, x), Status: status(x), MacAddress: x.mac, LinkSpeed: x.enabled && x.mediaConnected && x.speedMbps ? `${x.speedMbps >= 1000 ? x.speedMbps / 1000 + ' Gbps' : x.speedMbps + ' Mbps'}` : '0 bps', MediaConnectionState: x.mediaConnected ? 'Connected' : 'Disconnected', AdminStatus: x.enabled ? 'Up' : 'Down' })),
    ['Name', 'InterfaceDescription', 'ifIndex', 'Status', 'MacAddress', 'LinkSpeed'],
  )
}

function adapterFromArgs(e: Env, args: string[]): NetAdapter | string {
  const a = psArgs(args, ['confirm', 'passthru'])
  const name = argOrPos(a, 0, 'name', 'interfacealias') ?? (isObj(e.input) ? String(e.input.objs[0]?.Name ?? '') : undefined)
  const ad = findAdapter(e.ep, name)
  if (!ad) return psError(e, `Es wurden keine MSFT_NetAdapter-Objekte gefunden, deren Eigenschaft "Name" gleich "${name ?? ''}" ist.`, 'ObjectNotFound')
  return ad
}

const setAdapter = (enable: boolean | 'restart'): Handler => (e, args) => {
  if (!e.admin) return elevationMsg(e)
  const ad = adapterFromArgs(e, args)
  if (typeof ad === 'string') return ad
  ad.enabled = enable !== false
  if (ad.enabled && ad.dhcp && ad.mediaConnected && ad.kind !== 'VPN') renewDhcp(e.w, e.ep, ad)
  act(e, A.networkChanged, e.host, `Adapter "${ad.name}" ${enable === 'restart' ? 'neu gestartet' : enable ? 'aktiviert' : 'deaktiviert'}`)
  return ''
}
export const enableNetAdapter = setAdapter(true)
export const disableNetAdapter = setAdapter(false)
export const restartNetAdapter = setAdapter('restart')

export const getNetIPConfiguration: Handler = (e, args) => {
  const a = psArgs(args, ['all', 'detailed'])
  const only = argOrPos(a, 0, 'interfacealias')
  const cfgs = e.ep.adapters.filter((x) => x.enabled && (!only || x.name.toLowerCase() === only.toLowerCase()))
  return obj(
    cfgs.map((x) => ({
      InterfaceAlias: x.name,
      InterfaceIndex: ifIndex(e, x),
      InterfaceDescription: x.description,
      'NetProfile.Name': x.mediaConnected ? (x.network === 'home' ? x.ssid ?? 'Netzwerk' : 'musterwerk.local') : '',
      IPv4Address: x.mediaConnected ? x.ip : '',
      IPv4DefaultGateway: x.mediaConnected ? x.gateway : '',
      DNSServer: x.mediaConnected ? x.dnsServers.join('\n') : '',
      NetAdapter: status(x),
    })),
    ['InterfaceAlias', 'InterfaceIndex', 'InterfaceDescription', 'NetProfile.Name', 'IPv4Address', 'IPv4DefaultGateway', 'DNSServer'],
    true,
  )
}

export const getNetIPAddress: Handler = (e, args) => {
  const a = psArgs(args)
  const only = arg(a, 'interfacealias')
  const rows: Rec[] = activeConfigs(e.ep)
    .filter((c) => !only || c.adapter.name.toLowerCase() === only.toLowerCase())
    .map((c) => ({ IPAddress: c.ip, InterfaceIndex: ifIndex(e, c.adapter), InterfaceAlias: c.adapter.name, AddressFamily: 'IPv4', Type: 'Unicast', PrefixLength: maskToPrefix(c.mask), PrefixOrigin: isApipa(c.ip) ? 'WellKnown' : c.adapter.dhcp ? 'Dhcp' : 'Manual', SuffixOrigin: isApipa(c.ip) ? 'Link' : c.adapter.dhcp ? 'Dhcp' : 'Manual', AddressState: isApipa(c.ip) ? 'Tentative' : 'Preferred' }))
  rows.push({ IPAddress: '127.0.0.1', InterfaceIndex: 1, InterfaceAlias: 'Loopback Pseudo-Interface 1', AddressFamily: 'IPv4', Type: 'Unicast', PrefixLength: 8, PrefixOrigin: 'WellKnown', SuffixOrigin: 'WellKnown', AddressState: 'Preferred' })
  return obj(rows, Object.keys(rows[0]), true)
}

export const getDnsClientServerAddress: Handler = (e) =>
  obj(
    e.ep.adapters.map((x) => ({ InterfaceAlias: x.name, 'Interface Index': ifIndex(e, x), AddressFamily: 'IPv4', ServerAddresses: `{${x.dnsServers.join(', ')}}` })),
    ['InterfaceAlias', 'Interface Index', 'AddressFamily', 'ServerAddresses'],
  )

export const setDnsClientServerAddress: Handler = (e, args) => {
  if (!e.admin) return elevationMsg(e)
  const a = psArgs(args, ['resetserveraddresses', 'validate'])
  const ad = findAdapter(e.ep, arg(a, 'interfacealias', 'alias') ?? a.pos[0]) ?? (arg(a, 'interfaceindex') ? e.ep.adapters[Number(arg(a, 'interfaceindex')) - 7] : undefined)
  if (!ad) return psError(e, 'Es wurde keine passende Schnittstelle gefunden. Beispiel: Set-DnsClientServerAddress -InterfaceAlias Ethernet -ServerAddresses 10.10.0.10,10.10.0.11', 'ObjectNotFound')
  if (has(a, 'resetserveraddresses')) {
    resetDnsToDhcp(e, ad)
    act(e, A.networkChanged, e.host, `${ad.name}: DNS automatisch (DHCP)`)
    return ''
  }
  const servers = list(arg(a, 'serveraddresses', 'addresses') ?? a.pos.slice(1).join(','))
  if (!servers.length || servers.some((s) => !isValidIp(s))) return psError(e, 'Ungültige oder fehlende -ServerAddresses.', 'InvalidArgument')
  ad.dnsFromDhcp = false
  ad.dnsServers = servers
  act(e, A.networkChanged, e.host, `${ad.name}: DNS statisch ${servers.join(', ')}`)
  return ''
}

export const clearDnsClientCache: Handler = (e) => {
  if (!isServiceRunning(e.ep, 'Dnscache')) return psError(e, 'Der DNS-Client-Dienst (Dnscache) wird nicht ausgeführt.')
  e.ep.dnsCache = {}
  act(e, A.networkChanged, e.host, 'DNS-Cache geleert (Clear-DnsClientCache)')
  return ''
}

export const getDnsClientCache: Handler = (e) => {
  const entries = [...Object.entries(readHosts(e.ep)), ...Object.entries(e.ep.dnsCache)]
  return obj(
    entries.map(([n, ip]) => ({ Entry: n, RecordName: n, Record: 'A', Status: 'Success', Section: 'Answer', TimeToLive: 600 + (hashString(n) % 3000), 'Data Length': 4, Data: ip })),
    ['Entry', 'RecordName', 'Record', 'Status', 'Section', 'TimeToLive', 'Data Length', 'Data'],
  )
}
