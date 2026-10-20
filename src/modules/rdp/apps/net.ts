// Netzwerk-Hilfsfunktionen (nur lesend) für Taskleiste, ncpa.cpl und Einstellungen.

import { getProxySettings } from '@/core/ops/endpoint'
import { connectivity, httpRequest, primaryConfig, reach, resolveName } from '@/core/sim/network'
import type { Endpoint, NetAdapter, World } from '@/core/types'
import { ipToInt, isApipa, isValidIp, maskToPrefix, sameSubnet } from '@/core/util'

export type NetState = 'ok' | 'nointernet' | 'limited' | 'none'

/** Zustand für das Netzwerksymbol im Infobereich */
export function netState(w: World, ep: Endpoint): NetState {
  const cfg = primaryConfig(ep)
  if (!cfg) return 'none'
  if (cfg.apipa || (cfg.adapter.kind !== 'VPN' && !cfg.gateway)) return 'limited'
  const c = connectivity(w, ep)
  if (c.internet) return 'ok'
  return c.intranet ? 'nointernet' : 'limited'
}

export const NET_STATE_TEXT: Record<NetState, string> = {
  ok: 'Verbunden, Internetzugriff',
  nointernet: 'Kein Internet, gesichert',
  limited: 'Eingeschränkt – kein Netzwerkzugriff',
  none: 'Nicht verbunden – Keine Verbindungen verfügbar',
}

export function adapterStatus(a: NetAdapter): { text: string; up: boolean } {
  if (!a.enabled) return { text: 'Deaktiviert', up: false }
  if (!a.mediaConnected) return { text: a.kind === 'Ethernet' ? 'Netzwerkkabel wurde entfernt' : a.kind === 'WLAN' ? 'Nicht verbunden' : 'Getrennt', up: false }
  if (!a.ip || a.ip === '0.0.0.0' || isApipa(a.ip)) return { text: 'Nicht identifiziertes Netzwerk', up: true }
  if (a.network === 'home') return { text: a.ssid ?? 'Netzwerk', up: true }
  return { text: a.kind === 'WLAN' && a.ssid ? `${a.ssid} (musterwerk.local)` : 'musterwerk.local', up: true }
}

export const isValidMask = (m: string) => {
  if (!isValidIp(m)) return false
  const bin = ipToInt(m).toString(2).padStart(32, '0')
  return /^1+0*$/.test(bin) && bin !== '0'.repeat(32)
}

export interface DiagItem {
  ok: boolean
  text: string
  fix?: 'enable' | 'renew'
}

/** Windows-Netzwerkdiagnose (vereinfacht) */
export function diagnose(w: World, ep: Endpoint, a: NetAdapter): DiagItem[] {
  if (!a.enabled) return [{ ok: false, text: `Der Netzwerkadapter "${a.name}" ist deaktiviert.`, fix: 'enable' }]
  if (!a.mediaConnected)
    return [
      {
        ok: false,
        text: a.kind === 'WLAN' ? 'Es besteht keine Verbindung mit einem Drahtlosnetzwerk.' : a.kind === 'VPN' ? 'Die VPN-Verbindung ist getrennt. Verbindung über den VPN-Client herstellen.' : 'Das Netzwerkkabel ist nicht ordnungsgemäß angeschlossen oder möglicherweise defekt.',
      },
    ]
  const out: DiagItem[] = []
  if (!a.ip || a.ip === '0.0.0.0') return [{ ok: false, text: `"${a.name}" verfügt über keine IP-Adresse.`, fix: a.dhcp ? 'renew' : undefined }]
  if (isApipa(a.ip)) return [{ ok: false, text: `"${a.name}" verfügt über keine gültige IP-Konfiguration (automatische private Adresse ${a.ip}). Der DHCP-Server wurde nicht erreicht.`, fix: a.dhcp ? 'renew' : undefined }]
  out.push({ ok: true, text: `IPv4-Adresse ${a.ip}/${maskToPrefix(a.mask)} (${a.dhcp ? 'per DHCP' : 'statisch'})` })
  if (a.kind !== 'VPN') {
    if (!a.gateway) out.push({ ok: false, text: 'Es ist kein gültiges Standardgateway konfiguriert.' })
    else if (!sameSubnet(a.ip, a.gateway, a.mask)) out.push({ ok: false, text: `Das Standardgateway ${a.gateway} befindet sich nicht im Subnetz der IP-Adresse.` })
    else {
      const r = reach(w, ep, a.gateway)
      out.push(r.ok ? { ok: true, text: `Standardgateway ${a.gateway} antwortet.` } : { ok: false, text: `Das Standardgateway ${a.gateway} ist nicht verfügbar.` })
    }
  }
  if (!a.dnsServers.length) out.push({ ok: false, text: 'Es sind keine DNS-Server konfiguriert.' })
  else {
    const internal = a.network !== 'home'
    const probe = internal ? 'dc01.musterwerk.local' : 'www.suche.example'
    const res = a.dnsServers.map((s) => ({ s, r: resolveName(w, ep, probe, { server: s }) }))
    const good = res.find((x) => x.r.ok)
    if (good) out.push({ ok: true, text: `DNS-Server ${good.s} löst ${probe} auf.` })
    else {
      const first = res[0]
      out.push({ ok: false, text: /timed out|Zeitüberschreitung/i.test(first.r.error ?? '') ? `Der DNS-Server ${first.s} antwortet nicht.` : `Der DNS-Server ${first.s} konnte "${probe}" nicht auflösen.` })
    }
  }
  const proxy = getProxySettings(ep)
  if (proxy.enabled) {
    const h = httpRequest(w, ep, 'https://www.suche.example')
    if (h.error === 'ERR_PROXY_CONNECTION_FAILED') out.push({ ok: false, text: `Der Proxyserver "${proxy.server}" antwortet nicht.` })
  }
  const c = connectivity(w, ep)
  out.push(c.intranet ? { ok: true, text: 'Intranet (intranet.musterwerk.local) erreichbar.' } : { ok: false, text: 'Das Intranet (intranet.musterwerk.local) ist nicht erreichbar.' })
  out.push(c.internet ? { ok: true, text: 'Internetverbindung funktioniert.' } : { ok: false, text: 'Keine Internetverbindung.' })
  return out
}
