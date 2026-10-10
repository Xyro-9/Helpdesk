// IT-Statusseite (status.musterwerk.local): Dienste-Ampel aus dem Weltzustand + geplante Wartungen.

import { CalendarClock, CircleCheck, CircleX, TriangleAlert } from 'lucide-react'
import { useMemo } from 'react'
import { useStore } from '@/core/store'
import type { World } from '@/core/types'
import { fmtDateTime, fmtRelative } from '@/core/util'
import { cx } from '@/ui'
import type { SiteProps } from '../SiteView'
import { NotFoundBlock, useTitle } from '../shared'
import { INTRANET_NAV, MwShell } from './MwShell'

type Level = 'ok' | 'warn' | 'down'
interface ServiceState {
  name: string
  desc: string
  level: Level
  info: string
}

const running = (w: World, server: string, svc: string) => {
  const s = w.infra.servers.find((x) => x.name === server)
  return !!s?.online && s.services.find((x) => x.name === svc)?.status === 'Wird ausgeführt'
}
const online = (w: World, server: string) => !!w.infra.servers.find((x) => x.name === server)?.online

export function computeServices(w: World): ServiceState[] {
  const list: ServiceState[] = []
  const dcs = ['DC01', 'DC02'].filter((d) => running(w, d, 'NTDS') && running(w, d, 'Netlogon'))
  list.push({
    name: 'Anmeldung & Active Directory',
    desc: 'Domänenanmeldung, Kerberos, Gruppenrichtlinien',
    level: dcs.length === 2 ? 'ok' : dcs.length ? 'warn' : 'down',
    info: dcs.length === 2 ? 'Beide Domänencontroller verfügbar' : dcs.length ? `Eingeschränkt – nur ${dcs[0]} verfügbar` : 'Keine Domänencontroller erreichbar',
  })
  const dns = ['DC01', 'DC02'].filter((d) => running(w, d, 'DNS'))
  list.push({
    name: 'Namensauflösung (DNS)',
    desc: 'Interne und externe Namensauflösung',
    level: !dns.length ? 'down' : dns.length < 2 || !w.infra.dnsForwardersOk ? 'warn' : 'ok',
    info: !dns.length ? 'DNS-Server nicht verfügbar' : !w.infra.dnsForwardersOk ? 'Externe Namen werden nicht aufgelöst (Weiterleitung gestört)' : dns.length < 2 ? 'Nur ein DNS-Server verfügbar' : 'Betriebsbereit',
  })
  const dhcp = running(w, 'DC01', 'DHCPServer')
  const exhausted = w.infra.dhcpScopes.filter((s) => s.active && s.leases.filter((l) => l.state !== 'Abgelaufen').length >= 140)
  list.push({
    name: 'IP-Adressvergabe (DHCP)',
    desc: 'Automatische Netzwerkkonfiguration der Clients',
    level: !dhcp ? 'down' : exhausted.length || w.infra.dhcpScopes.some((s) => !s.active) ? 'warn' : 'ok',
    info: !dhcp ? 'DHCP-Server nicht verfügbar – neue Geräte erhalten keine Adresse' : w.infra.dhcpScopes.some((s) => !s.active) ? 'Mindestens ein Bereich ist deaktiviert' : exhausted.length ? 'Adressbereich fast erschöpft' : 'Betriebsbereit',
  })
  list.push({
    name: 'Dateiserver',
    desc: 'Netzlaufwerke, Basisordner (FS01)',
    level: online(w, 'FS01') && running(w, 'FS01', 'LanmanServer') ? 'ok' : 'down',
    info: online(w, 'FS01') && running(w, 'FS01', 'LanmanServer') ? 'Betriebsbereit' : 'Netzlaufwerke nicht verfügbar',
  })
  const ps = running(w, 'PRINT01', 'Spooler')
  const badPrinters = w.infra.printers.filter((p) => p.status !== 'Bereit' && p.status !== 'Energiesparmodus')
  const badQueues = w.infra.printQueues.filter((q) => q.status !== 'Bereit')
  list.push({
    name: 'Drucken',
    desc: 'Druckserver PRINT01 und Netzwerkdrucker',
    level: !ps ? 'down' : badPrinters.length || badQueues.length ? 'warn' : 'ok',
    info: !ps ? 'Druckserver nicht verfügbar' : badPrinters.length ? `Störung: ${badPrinters.map((p) => `${p.name} (${p.status})`).join(', ')}` : badQueues.length ? `Warteschlange gestört: ${badQueues.map((q) => q.name).join(', ')}` : 'Alle Drucker betriebsbereit',
  })
  const erp = running(w, 'APP01', 'ERPAppServer') && running(w, 'APP01', 'MSSQLSERVER')
  list.push({ name: 'MW-ERP', desc: 'Warenwirtschaft (APP01)', level: erp ? 'ok' : 'down', info: erp ? 'Betriebsbereit' : 'ERP nicht verfügbar' })
  list.push({ name: 'Internetzugang', desc: 'Anbindung an den Provider', level: w.infra.internetUp ? 'ok' : 'down', info: w.infra.internetUp ? 'Betriebsbereit' : 'Störung beim Provider – Internet nicht erreichbar' })
  list.push({ name: 'Proxy', desc: `Webfilter ${w.infra.proxy.host}:${w.infra.proxy.port}`, level: w.infra.proxy.online ? 'ok' : 'down', info: w.infra.proxy.online ? 'Betriebsbereit' : 'Proxyserver nicht erreichbar' })
  list.push({
    name: 'VPN-Einwahl',
    desc: `SecureLink-Gateway ${w.infra.vpnGateway.host}`,
    level: w.infra.vpnGateway.online ? 'ok' : 'down',
    info: w.infra.vpnGateway.online ? `Betriebsbereit · ${w.infra.vpnGateway.activeSessions.length} aktive Sitzungen` : 'VPN-Gateway nicht erreichbar',
  })
  const syncSvc = running(w, 'SYNC01', 'CloudSync')
  const stale = Date.now() - new Date(w.infra.sync.lastRun).getTime() > w.infra.sync.intervalMin * 2 * 60000
  list.push({
    name: 'Cloud-Synchronisierung',
    desc: 'Abgleich AD → Cloud-Mandant (SYNC01)',
    level: !syncSvc || !w.infra.sync.enabled ? 'down' : w.infra.sync.errors.length || stale ? 'warn' : 'ok',
    info: !syncSvc ? 'Synchronisierungsdienst gestoppt' : !w.infra.sync.enabled ? 'Synchronisierung deaktiviert' : stale ? `Letzte Synchronisierung ${fmtRelative(w.infra.sync.lastRun)}` : `Letzter Lauf ${fmtRelative(w.infra.sync.lastRun)}`,
  })
  list.push({ name: 'E-Mail & Cloud-Dienste', desc: 'Postfächer, Office-Apps (Cloud)', level: w.infra.internetUp ? 'ok' : 'down', info: w.infra.internetUp ? 'Betriebsbereit' : 'Aus dem Firmennetz nicht erreichbar' })
  return list
}

const LEVEL = {
  ok: { label: 'Betriebsbereit', icon: CircleCheck, cls: 'text-emerald-600', dot: 'bg-emerald-500' },
  warn: { label: 'Eingeschränkt', icon: TriangleAlert, cls: 'text-amber-600', dot: 'bg-amber-500' },
  down: { label: 'Störung', icon: CircleX, cls: 'text-rose-600', dot: 'bg-rose-500' },
}

function nextDay(weekday: number, hour: number) {
  const d = new Date()
  d.setDate(d.getDate() + ((weekday + 7 - d.getDay()) % 7 || 7))
  d.setHours(hour, 0, 0, 0)
  return d
}

export function StatusSite({ api }: SiteProps) {
  useTitle(api, 'IT-Status')
  const world = useStore((s) => s.world)
  const services = useMemo(() => computeServices(world), [world])
  const worst: Level = services.some((s) => s.level === 'down') ? 'down' : services.some((s) => s.level === 'warn') ? 'warn' : 'ok'
  const maint = useMemo(() => {
    const sat = nextDay(6, 6)
    const tue = nextDay(2, 19)
    return [
      { when: `${sat.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit' })}, 06:00–10:00 Uhr`, what: 'Sicherheitsupdates Server (DC01, DC02, FS01, APP01)', impact: 'Kurzzeitige Unterbrechungen von ERP und Netzlaufwerken' },
      { when: `${tue.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit' })}, 19:00–20:00 Uhr`, what: 'Firmware-Update Netzwerkdrucker', impact: 'Drucker im 1. OG nicht verfügbar' },
    ]
  }, [])
  if (api.segments.length)
    return (
      <MwShell api={api} section="IT-Status" nav={INTRANET_NAV('status')}>
        <NotFoundBlock api={api} />
      </MwShell>
    )
  const W = LEVEL[worst]
  return (
    <MwShell api={api} section="IT-Status" nav={INTRANET_NAV('status')}>
      <div className={cx('mb-4 flex items-center gap-3 rounded-lg border p-4 shadow-sm', worst === 'ok' ? 'border-emerald-200 bg-emerald-50' : worst === 'warn' ? 'border-amber-200 bg-amber-50' : 'border-rose-200 bg-rose-50')}>
        <W.icon size={28} className={W.cls} />
        <div>
          <div className="font-semibold text-slate-900">{worst === 'ok' ? 'Alle Systeme betriebsbereit' : worst === 'warn' ? 'Einzelne Dienste eingeschränkt' : 'Es liegen Störungen vor'}</div>
          <div className="text-xs text-slate-600">Stand: {fmtDateTime(new Date().toISOString())} · automatische Überwachung</div>
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
        {services.map((s, i) => {
          const L = LEVEL[s.level]
          return (
            <div key={s.name} className={cx('flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3', i > 0 && 'border-t border-stone-100')}>
              <span className={cx('h-3 w-3 shrink-0 rounded-full', L.dot)} title={L.label} />
              <div className="min-w-[12rem] flex-1">
                <div className="font-medium text-slate-900">{s.name}</div>
                <div className="text-xs text-slate-500">{s.desc}</div>
              </div>
              <div className={cx('text-sm', L.cls)}>
                <span className="font-medium">{L.label}</span>
                <span className="block text-xs text-slate-600 @xl:inline @xl:pl-2">{s.info}</span>
              </div>
            </div>
          )
        })}
      </div>
      <h2 className="mb-2 mt-6 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        <CalendarClock size={15} /> Geplante Wartungen
      </h2>
      <div className="space-y-2">
        {maint.map((m) => (
          <div key={m.what} className="rounded-lg border border-stone-200 bg-white p-3 text-sm shadow-sm">
            <div className="font-medium text-slate-900">{m.what}</div>
            <div className="text-xs text-slate-600">{m.when}</div>
            <div className="mt-1 text-xs text-amber-700">Auswirkung: {m.impact}</div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-slate-500">Störung nicht aufgeführt? Bitte beim IT-Service-Desk melden (Durchwahl 999).</p>
    </MwShell>
  )
}
