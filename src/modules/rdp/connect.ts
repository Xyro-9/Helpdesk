// Verbindungsprüfung für Remotedesktop – reine Lesefunktionen über die Welt.

import { findComputer, findUser } from '@/core/ops/ad'
import { getEndpoint, getRegValue, isServiceRunning } from '@/core/ops/endpoint'
import { primaryConfig, reach } from '@/core/sim/network'
import type { AdComputer, Endpoint, World } from '@/core/types'
import { isValidIp, sameSubnet } from '@/core/util'
import type { ConnError } from './store'

export const isServerComputer = (c: AdComputer) => c.ou.includes('Domain Controllers') || c.ou.includes('OU=Server') || /server/i.test(c.os)

const notFound = (name: string): ConnError => ({
  title: 'Remotedesktopverbindung',
  message: `Remotedesktop kann den Computer "${name}" nicht finden. Möglicherweise gehört "${name}" nicht zum angegebenen Netzwerk. Überprüfen Sie den Computernamen und die Domäne, und wiederholen Sie den Vorgang.`,
})

const unreachable = (details?: string): ConnError => ({
  title: 'Remotedesktopverbindung',
  message:
    'Remotedesktop kann aus einem der folgenden Gründe keine Verbindung mit dem Remotecomputer herstellen:\n\n1) Der Remotezugriff auf den Server ist nicht aktiviert.\n2) Der Remotecomputer ist ausgeschaltet.\n3) Der Remotecomputer ist im Netzwerk nicht verfügbar.\n\nStellen Sie sicher, dass der Remotecomputer eingeschaltet und mit dem Netzwerk verbunden ist und dass der Remotezugriff aktiviert ist.',
  details,
})

/** Name/IP → AD-Computer (ohne Welt zu verändern). */
export function lookupTarget(w: World, input: string): { computer?: AdComputer; error?: ConnError } {
  const raw = input.trim().replace(/^\\\\/, '').replace(/:3389$/, '')
  if (!raw) return { error: { title: 'Remotedesktopverbindung', message: 'Geben Sie den Namen des Remotecomputers ein.' } }
  let computer = findComputer(w, raw)
  if (!computer && isValidIp(raw)) {
    // IP über DNS-A-Eintrag bzw. materialisierte Endpunkte zuordnen
    const zone = w.infra.dnsZones.find((z) => z.name === 'musterwerk.local')
    const rec = zone?.records.find((r) => r.type === 'A' && r.value === raw && r.name !== '@')
    if (rec) computer = findComputer(w, rec.name)
    if (!computer) {
      const ep = Object.values(w.endpoints).find((e) => e.adapters.some((a) => a.ip === raw && a.enabled && a.mediaConnected))
      if (ep) computer = findComputer(w, ep.hostname)
    }
    if (!computer && w.infra.servers.some((s) => s.ip === raw)) {
      const srv = w.infra.servers.find((s) => s.ip === raw)!
      computer = findComputer(w, srv.name)
    }
  }
  if (!computer) return { error: notFound(raw) }
  if (isServerComputer(computer))
    return {
      computer,
      error: {
        title: 'Remotedesktopverbindung',
        message: `"${computer.name}" ist ein Server (${computer.description ?? computer.os}). Server werden im Trainer über das Modul „Infrastruktur“ verwaltet – Remote-Desktop ist hier nur für Windows-Clients vorgesehen.`,
        server: true,
      },
    }
  return { computer }
}

/** Primäre IPv4-Adresse des Ziels (VPN > Ethernet > WLAN) */
export const targetIp = (ep: Endpoint) => primaryConfig(ep)?.ip

/**
 * Prüft, ob vom Azubi-PC aus eine RDP-Verbindung zum (bereits materialisierten) Endpunkt möglich ist.
 * Liefert null bei Erfolg.
 */
export function linkCheck(w: World, host: string): ConnError | null {
  const ep = getEndpoint(w, host)
  if (!ep) return notFound(host)
  if (!ep.online) return unreachable(`Ping ${host}: Zeitüberschreitung der Anforderung. (Gerät ist ausgeschaltet oder nicht im Netzwerk)`)
  const tech = getEndpoint(w, w.tech.workstation)
  if (!tech) return unreachable('Eigener Arbeitsplatz nicht verfügbar.')
  const ip = targetIp(ep)
  if (!ip) return unreachable(`Der Name ${host} wurde aufgelöst, aber das Gerät hat keine aktive Netzwerkverbindung. Ping: Zeitüberschreitung der Anforderung.`)
  if (!ip.startsWith('10.')) {
    const home = ep.adapters.some((a) => a.network === 'home' && a.enabled && a.mediaConnected)
    return unreachable(
      ip.startsWith('169.254.')
        ? `Ping ${host}: Zeitüberschreitung der Anforderung. (Zielgerät hat keine gültige IP-Adresse)`
        : `Ping ${host}: Zeitüberschreitung der Anforderung.${home ? ' (Gerät befindet sich in einem externen Netz – interne Verbindungen nur bei aktiver VPN-Verbindung möglich)' : ''}`,
    )
  }
  // IP muss zum physischen Netz des Adapters passen (z.B. falsche statische IP → nicht erreichbar)
  const cfg = primaryConfig(ep)
  const net = cfg?.adapter.network
  if (cfg && net && /^\d+\.\d+\.\d+\.0$/.test(net) && !sameSubnet(ip, net, '255.255.255.0'))
    return unreachable(`Ping ${host}: Zeitüberschreitung der Anforderung. (Die IP-Adresse ${ip} passt nicht zum angeschlossenen Netzwerksegment)`)
  const r = reach(w, tech, ip)
  if (!r.ok) return unreachable(`Ping ${host} [${ip}]: ${r.message ?? 'Zeitüberschreitung der Anforderung.'}`)
  if (!isServiceRunning(ep, 'TermService')) return unreachable(`Port 3389 auf ${host} [${ip}] antwortet nicht. (Dienst "Remotedesktopdienste" nicht gestartet)`)
  if (Number(getRegValue(ep, 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Terminal Server', 'fDenyTSConnections')?.data ?? 0) === 1)
    return unreachable(`Port 3389 auf ${host} [${ip}] antwortet nicht. (Remoteverbindungen sind auf dem Zielcomputer deaktiviert)`)
  return null
}

export function loggedOnName(w: World, ep: Endpoint | undefined) {
  if (!ep?.loggedOnUser) return undefined
  const u = findUser(w, ep.loggedOnUser)
  return { sam: ep.loggedOnUser, name: u?.displayName ?? ep.loggedOnUser }
}
