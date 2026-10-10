// Übersicht: Statuskacheln, Server, Netzwerke + Server-Detail (Dienste, Ereignisprotokolle)

import { Cloud, Cpu, Globe, HardDrive, MemoryStick, Network, Printer, Router, Search, Server as ServerIcon, ShieldCheck, TriangleAlert, Waypoints } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useStore } from '@/core/store'
import type { EventLevel, Server, WinEvent } from '@/core/types'
import { fmtRelative } from '@/core/util'
import { Badge, Button, Card, Input, Modal, Select, Tabs, cx, tableCls } from '@/ui'
import { filterEvents, fmtGb, isSvcRunning, pctTone, syncReadiness } from './lib'
import { EventViewer, Meter, OkBadge, ServiceButtons, ServiceStatusBadge, StatusDot } from './shared'

export type InfraTab = 'overview' | 'security' | 'dhcp' | 'dns' | 'files' | 'print' | 'sync' | 'vpn'

export function Overview({ onOpenServer, onTab }: { onOpenServer: (name: string) => void; onTab: (t: InfraTab) => void }) {
  const infra = useStore((s) => s.world.infra)
  const world = useStore((s) => s.world)
  const dc01 = infra.servers.find((s) => s.name === 'DC01')
  const print01 = infra.servers.find((s) => s.name === 'PRINT01')
  const sync = syncReadiness(world)

  const tiles: { label: string; icon: ReactNode; ok: boolean; warn?: boolean; text: ReactNode; tab?: InfraTab }[] = [
    { label: 'Internet', icon: <Globe size={18} />, ok: infra.internetUp, text: infra.internetUp ? 'Verbunden' : 'Keine Verbindung zum Provider' },
    { label: 'Proxy', icon: <Waypoints size={18} />, ok: infra.proxy.online, text: `${infra.proxy.host}:${infra.proxy.port}` },
    { label: 'DNS-Weiterleitung', icon: <Network size={18} />, ok: infra.dnsForwardersOk, text: infra.dnsForwardersOk ? 'Externe Auflösung OK' : 'Weiterleitungen antworten nicht', tab: 'dns' },
    { label: 'DHCP-Server', icon: <Router size={18} />, ok: isSvcRunning(dc01, 'DHCPServer'), text: `DC01 · ${infra.dhcpScopes.filter((s) => s.active).length}/${infra.dhcpScopes.length} Bereiche aktiv`, tab: 'dhcp' },
    { label: 'Druckserver', icon: <Printer size={18} />, ok: isSvcRunning(print01, 'Spooler'), warn: infra.printQueues.some((q) => q.jobs.some((j) => j.status === 'Fehler')), text: `PRINT01 · ${infra.printQueues.reduce((a, q) => a + q.jobs.length, 0)} Aufträge`, tab: 'print' },
    { label: 'VPN-Gateway', icon: <ShieldCheck size={18} />, ok: infra.vpnGateway.online, text: `${infra.vpnGateway.activeSessions.length} aktive Sitzung(en)`, tab: 'vpn' },
    { label: 'Cloud-Sync', icon: <Cloud size={18} />, ok: sync.ok, warn: infra.sync.errors.length > 0, text: `Letzter Lauf ${fmtRelative(infra.sync.lastRun)}`, tab: 'sync' },
  ]

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {tiles.map((t) => (
          <button
            key={t.label}
            type="button"
            disabled={!t.tab}
            onClick={() => t.tab && onTab(t.tab)}
            className={cx('flex flex-col gap-1 rounded-lg border bg-white p-3 text-left shadow-sm transition-colors', t.ok ? (t.warn ? 'border-amber-300' : 'border-slate-200') : 'border-rose-300 bg-rose-50/40', t.tab && 'hover:border-sky-300')}
          >
            <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
              <span className={t.ok ? (t.warn ? 'text-amber-600' : 'text-emerald-600') : 'text-rose-600'}>{t.icon}</span>
              {t.label}
              <span className="ml-auto">
                <StatusDot ok={t.ok} warn={t.warn} />
              </span>
            </div>
            <div className="text-xs text-slate-500">{t.text}</div>
          </button>
        ))}
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Server (Serverraum UG)</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {infra.servers.map((s) => (
            <ServerTile key={s.name} server={s} onOpen={() => onOpenServer(s.name)} />
          ))}
        </div>
      </div>

      <Card title="Netzwerke / VLANs" bodyClassName="p-0">
        <table className={tableCls}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Subnetz</th>
              <th>Gateway</th>
              <th>VLAN</th>
              <th>Beschreibung</th>
              <th>DHCP-Bereich</th>
            </tr>
          </thead>
          <tbody>
            {infra.networks.map((n) => {
              const scope = infra.dhcpScopes.find((d) => n.subnet.startsWith(d.id + '/'))
              return (
                <tr key={n.subnet}>
                  <td className="font-medium">{n.name}</td>
                  <td className="font-mono text-xs">{n.subnet}</td>
                  <td className="font-mono text-xs">{n.gateway}</td>
                  <td>{n.vlan}</td>
                  <td className="text-xs text-slate-500">{n.description}</td>
                  <td>
                    {scope ? (
                      <button type="button" className="text-xs text-sky-700 hover:underline" onClick={() => onTab('dhcp')}>
                        {scope.name} {scope.active ? '' : '(deaktiviert)'}
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">statisch</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

function ServerTile({ server: s, onOpen }: { server: Server; onOpen: () => void }) {
  const stoppedAuto = s.services.filter((x) => x.startType.startsWith('Automatisch') && x.status !== 'Wird ausgeführt')
  return (
    <button type="button" onClick={onOpen} className={cx('flex flex-col gap-3 rounded-lg border bg-white p-4 text-left shadow-sm hover:border-sky-300', s.online ? 'border-slate-200' : 'border-rose-300 bg-rose-50/40')}>
      <div className="flex items-start gap-3">
        <div className={cx('flex h-9 w-9 items-center justify-center rounded-lg', s.online ? 'bg-slate-100 text-slate-700' : 'bg-rose-100 text-rose-700')}>
          <ServerIcon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-900">{s.name}</span>
            <span className="font-mono text-xs text-slate-500">{s.ip}</span>
            <span className="ml-auto">{s.online ? <Badge tone="green">Online</Badge> : <Badge tone="red">Offline</Badge>}</span>
          </div>
          <div className="truncate text-xs text-slate-500">
            {s.os} · {s.location}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {s.roles.map((r) => (
          <Badge key={r} tone="sky">
            {r}
          </Badge>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <div className="mb-1 flex items-center gap-1 text-slate-500">
            <Cpu size={12} /> CPU {s.online ? `${s.cpu} %` : '–'}
          </div>
          <Meter pct={s.online ? s.cpu : 0} />
        </div>
        <div>
          <div className="mb-1 flex items-center gap-1 text-slate-500">
            <MemoryStick size={12} /> RAM {s.online ? `${s.ramUsedPct} % von ${s.ramGb} GB` : '–'}
          </div>
          <Meter pct={s.online ? s.ramUsedPct : 0} />
        </div>
      </div>
      <div className="space-y-1.5">
        {s.volumes.map((v) => {
          const pct = Math.round(((v.sizeGb - v.freeGb) / v.sizeGb) * 100)
          return (
            <div key={v.letter} className="text-xs">
              <div className="mb-0.5 flex items-center gap-1 text-slate-500">
                <HardDrive size={12} /> {v.letter}: {v.label} – {fmtGb(v.freeGb)} frei von {fmtGb(v.sizeGb)}
              </div>
              <Meter pct={pct} tone={pctTone(pct)} />
            </div>
          )
        })}
      </div>
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>Betriebszeit: {s.online ? `${s.uptimeDays} Tage` : '–'}</span>
        {stoppedAuto.length > 0 && (
          <span className="flex items-center gap-1 text-amber-700">
            <TriangleAlert size={12} /> {stoppedAuto.length} autom. Dienst(e) beendet
          </span>
        )}
      </div>
    </button>
  )
}

// ─────────────── Server-Detail ───────────────

type DetailTab = 'dienste' | 'ereignisse' | 'info'

export function ServerDetail({ name, onClose, initialTab = 'dienste' }: { name: string; onClose: () => void; initialTab?: DetailTab }) {
  const server = useStore((s) => s.world.infra.servers.find((x) => x.name === name))
  const [tab, setTab] = useState<DetailTab>(initialTab)
  if (!server) return null
  return (
    <Modal
      size="xl"
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <ServerIcon size={18} className="text-slate-600" /> {server.name}
          <span className="font-mono text-sm font-normal text-slate-500">{server.ip}</span>
          {server.online ? <Badge tone="green">Online</Badge> : <Badge tone="red">Offline</Badge>}
        </span>
      }
      footer={<Button onClick={onClose}>Schließen</Button>}
    >
      {!server.online && <div className="mb-3 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800">Der Server antwortet nicht. Dienste und Ereignisprotokolle können nicht abgefragt bzw. gesteuert werden – an den 2nd Level / Netzwerk & Infrastruktur eskalieren.</div>}
      <Tabs
        tabs={[
          { id: 'dienste', label: `Dienste (${server.services.length})` },
          { id: 'ereignisse', label: 'Ereignisanzeige' },
          { id: 'info', label: 'Systeminformationen' },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div className="min-h-[24rem] pt-4">
        {tab === 'dienste' && <ServicesPanel server={server} />}
        {tab === 'ereignisse' && <ServerEvents server={server} />}
        {tab === 'info' && (
          <div className="grid gap-6 md:grid-cols-2">
            <dl className="grid grid-cols-[9rem_1fr] gap-y-1.5 text-sm">
              <dt className="text-slate-500">Betriebssystem</dt>
              <dd>{server.os}</dd>
              <dt className="text-slate-500">Rollen</dt>
              <dd>{server.roles.join(', ')}</dd>
              <dt className="text-slate-500">IP-Adresse</dt>
              <dd className="font-mono">{server.ip}</dd>
              <dt className="text-slate-500">FQDN</dt>
              <dd className="font-mono">{server.name.toLowerCase()}.musterwerk.local</dd>
              <dt className="text-slate-500">Arbeitsspeicher</dt>
              <dd>
                {server.ramGb} GB ({server.online ? `${server.ramUsedPct} % belegt` : '–'})
              </dd>
              <dt className="text-slate-500">CPU-Last</dt>
              <dd>{server.online ? `${server.cpu} %` : '–'}</dd>
              <dt className="text-slate-500">Betriebszeit</dt>
              <dd>{server.online ? `${server.uptimeDays} Tage` : '–'}</dd>
              <dt className="text-slate-500">Standort</dt>
              <dd>{server.location}</dd>
            </dl>
            <div>
              <table className={tableCls}>
                <thead>
                  <tr>
                    <th>Volume</th>
                    <th>Größe</th>
                    <th>Frei</th>
                    <th className="w-32">Belegung</th>
                  </tr>
                </thead>
                <tbody>
                  {server.volumes.map((v) => {
                    const pct = Math.round(((v.sizeGb - v.freeGb) / v.sizeGb) * 100)
                    return (
                      <tr key={v.letter}>
                        <td>
                          {v.letter}: {v.label}
                        </td>
                        <td>{fmtGb(v.sizeGb)}</td>
                        <td>{fmtGb(v.freeGb)}</td>
                        <td>
                          <Meter pct={pct} tone={pctTone(pct)} label={`${pct} % belegt`} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

export function ServicesPanel({ server, only }: { server: Server; only?: string[] }) {
  const [q, setQ] = useState('')
  const list = useMemo(() => {
    const t = q.trim().toLowerCase()
    return server.services
      .filter((s) => (!only || only.includes(s.name)) && (!t || s.name.toLowerCase().includes(t) || s.displayName.toLowerCase().includes(t)))
      .slice()
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'de'))
  }, [server.services, q, only])
  return (
    <div className="space-y-3">
      {!only && (
        <div className="relative w-72">
          <Search size={14} className="absolute top-2.5 left-2.5 text-slate-400" />
          <Input className="pl-8" placeholder="Dienst suchen …" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      )}
      <div className="overflow-auto rounded-md border border-slate-200">
        <table className={tableCls}>
          <thead>
            <tr>
              <th>Anzeigename</th>
              <th>Dienstname</th>
              <th>Status</th>
              <th>Starttyp</th>
              <th>Anmelden als</th>
              <th className="text-right">Aktion</th>
            </tr>
          </thead>
          <tbody>
            {list.map((svc) => (
              <tr key={svc.name}>
                <td title={svc.description}>
                  <div className="font-medium text-slate-800">{svc.displayName}</div>
                  <div className="text-xs text-slate-500">{svc.description}</div>
                </td>
                <td className="font-mono text-xs">{svc.name}</td>
                <td>
                  <ServiceStatusBadge status={svc.status} />
                </td>
                <td className={cx('text-xs', svc.startType === 'Deaktiviert' && 'text-rose-700')}>{svc.startType}</td>
                <td className="text-xs text-slate-500">{svc.account}</td>
                <td className="text-right">
                  <ServiceButtons server={server.name} svc={svc} disabled={!server.online} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const LEVELS: EventLevel[] = ['Kritisch', 'Fehler', 'Warnung', 'Informationen', 'Überprüfung erfolgreich', 'Überprüfung fehlgeschlagen']

function ServerEvents({ server }: { server: Server }) {
  const [log, setLog] = useState<WinEvent['log'] | 'Alle'>('System')
  const [level, setLevel] = useState<EventLevel | ''>('')
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<string | undefined>()
  const events = useMemo(() => (server.online ? filterEvents(server.events, { log, levels: level ? [level] : undefined, query: q }) : []), [server.events, server.online, log, level, q])
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const e of server.events) c[e.log] = (c[e.log] ?? 0) + 1
    return c
  }, [server.events])
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-slate-300 bg-white p-0.5 text-sm">
          {(['System', 'Anwendung', 'Sicherheit', 'Alle'] as const).map((l) => (
            <button key={l} type="button" onClick={() => setLog(l)} className={cx('rounded px-2.5 py-1', log === l ? 'bg-sky-600 text-white' : 'text-slate-600 hover:bg-slate-100')}>
              {l}
              {l !== 'Alle' && <span className="ml-1 text-[10px] opacity-70">{counts[l] ?? 0}</span>}
            </button>
          ))}
        </div>
        <Select className="w-56" value={level} onChange={(e) => setLevel(e.target.value as EventLevel | '')}>
          <option value="">Alle Ebenen</option>
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </Select>
        <div className="relative w-64">
          <Search size={14} className="absolute top-2.5 left-2.5 text-slate-400" />
          <Input className="pl-8" placeholder="Text oder Ereignis-ID …" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <span className="text-xs text-slate-500">{events.length} Ereignis(se)</span>
      </div>
      <EventViewer events={events} selected={sel} onSelect={setSel} showLog={log === 'Alle'} empty={server.online ? undefined : 'Server nicht erreichbar.'} />
    </div>
  )
}
