// Task-Manager: Prozesse, Leistung, Autostart-Apps, Dienste.

import { Activity, Cog, Cpu, Gauge, HardDrive, LayoutList, MemoryStick, Network, Rocket, Wifi } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { A } from '@/core/actions'
import { cpuTotal, freeGb, isStartupActive, killProcess, memUsedGb } from '@/core/ops/endpoint'
import type { Endpoint, WinProcess } from '@/core/types'
import { cx } from '@/ui'
import { useDesk, useEp, useEpOps } from '../desk'
import { AppLoading, ContextMenu, fmtUptime, listCls, ProgressDialog, rowCls, SortTh, useContextMenu, WBtn } from '../ui'
import { useServiceActions } from './Services'
import type { AppProps } from './types'

/** Eigener Aktionstyp (Vorschlag für core/actions.ts: startupChanged) */
export const STARTUP_ACTION = 'endpoint.startup'

type Tab = 'proc' | 'perf' | 'startup' | 'svc'

export function TaskManagerApp({ host }: AppProps) {
  const ep = useEp(host)
  if (!ep) return <AppLoading />
  return <TaskManager host={host} ep={ep} />
}

function TaskManager({ host, ep }: { host: string; ep: Endpoint }) {
  const [tab, setTab] = useState<Tab>('proc')
  const desk = useDesk()
  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'proc', label: 'Prozesse', icon: <LayoutList size={16} /> },
    { id: 'perf', label: 'Leistung', icon: <Activity size={16} /> },
    { id: 'startup', label: 'Autostart-Apps', icon: <Rocket size={16} /> },
    { id: 'svc', label: 'Dienste', icon: <Cog size={16} /> },
  ]
  return (
    <div className="flex h-full text-[12px]">
      <div className="flex w-44 shrink-0 flex-col gap-0.5 bg-[#f3f3f3] p-1.5">
        {tabs.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)} className={cx('flex items-center gap-2.5 rounded-[4px] px-2.5 py-2 text-left', tab === t.id ? 'bg-white font-medium shadow-sm' : 'hover:bg-white/60')}>
            {t.icon}
            {t.label}
          </button>
        ))}
        <div className="mt-auto p-1">
          <WBtn small onClick={desk.showRun} className="w-full">
            Neuen Task ausführen
          </WBtn>
        </div>
      </div>
      <div className="min-w-0 flex-1 bg-white">
        {tab === 'proc' && <Processes host={host} ep={ep} />}
        {tab === 'perf' && <Performance ep={ep} />}
        {tab === 'startup' && <Startup host={host} ep={ep} />}
        {tab === 'svc' && <ServicesTab host={host} ep={ep} />}
      </div>
    </div>
  )
}

const heat = (v: number, max: number) => {
  const r = Math.min(1, v / max)
  return r < 0.05 ? undefined : `rgba(255, 200, 40, ${0.12 + r * 0.55})`
}

function Processes({ host, ep }: { host: string; ep: Endpoint }) {
  const ops = useEpOps(host)
  const desk = useDesk()
  const [sel, setSel] = useState<number | null>(null)
  const [sort, setSort] = useState<{ k: string; dir: 1 | -1 }>({ k: 'cpu', dir: -1 })
  const [q, setQ] = useState('')
  const ctx = useContextMenu<number>()
  const list = useMemo(() => {
    const n = q.trim().toLowerCase()
    const f = ep.processes.filter((p) => !n || p.name.toLowerCase().includes(n) || p.description.toLowerCase().includes(n))
    const k = sort.k as keyof WinProcess
    return [...f].sort((a, b) => {
      const va = a[k] ?? ''
      const vb = b[k] ?? ''
      return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'de')) * sort.dir
    })
  }, [ep.processes, sort, q])
  const cpu = cpuTotal(ep)
  const mem = memUsedGb(ep)
  const memPct = Math.round((mem / ep.ramGb) * 100)
  const p = ep.processes.find((x) => x.pid === sel)

  const kill = (pid: number) => {
    const proc = ep.processes.find((x) => x.pid === pid)
    if (!proc) return
    const ok = ops.run((e) => killProcess(e, String(pid)), { type: A.processKilled, detail: `${proc.name} (PID ${pid})` }, { errorTitle: 'Task-Manager', errorPrefix: `Der Vorgang konnte nicht abgeschlossen werden.` })
    if (ok) setSel(null)
    if (ok && proc.respawn) void desk.alert(`"${proc.name}" wurde beendet, aber sofort neu gestartet.`, { title: 'Task-Manager', icon: 'info' })
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-[#eee] px-3 py-2">
        <span className="text-[14px] font-semibold">Prozesse</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Suchen…" className="ml-4 h-7 w-56 rounded-[4px] border border-[#d0d0d0] px-2 text-[12px] outline-none focus:border-[#005fb8]" />
        <WBtn className="ml-auto" disabled={!p} onClick={() => p && kill(p.pid)}>
          Task beenden
        </WBtn>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className={listCls}>
          <thead>
            <tr>
              <SortTh label="Name" k="name" sort={sort} setSort={setSort} className="w-[26%]" />
              <SortTh label="PID" k="pid" sort={sort} setSort={setSort} />
              <SortTh label="Benutzer" k="user" sort={sort} setSort={setSort} />
              <SortTh label={`${cpu} % CPU`} k="cpu" sort={sort} setSort={setSort} className="text-right" />
              <SortTh label={`${memPct} % Arbeitsspeicher`} k="memMb" sort={sort} setSort={setSort} className="text-right" />
              <SortTh label="Beschreibung" k="description" sort={sort} setSort={setSort} />
            </tr>
          </thead>
          <tbody>
            {list.map((x) => (
              <tr
                key={x.pid}
                className={rowCls(sel === x.pid)}
                onClick={() => setSel(x.pid)}
                onContextMenu={(e) => {
                  setSel(x.pid)
                  ctx.open(e, x.pid)
                }}
              >
                <td>{x.name}</td>
                <td>{x.pid}</td>
                <td>{x.user}</td>
                <td className="text-right" style={{ background: heat(x.cpu, 40) }}>
                  {x.cpu.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %
                </td>
                <td className="text-right" style={{ background: heat(x.memMb, 2000) }}>
                  {x.memMb.toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB
                </td>
                <td className="max-w-[260px] text-slate-600">{x.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {ctx.menu && (
        <ContextMenu
          x={ctx.menu.x}
          y={ctx.menu.y}
          onClose={ctx.close}
          items={[
            { label: 'Task beenden', onClick: () => kill(ctx.menu!.data) },
            { label: 'Dateipfad öffnen', onClick: () => desk.openApp('explorer', { path: 'C:\\Program Files' }) },
          ]}
        />
      )}
    </div>
  )
}

/** Verlauf mit leichtem Rauschen um den Ist-Wert */
function useSeries(value: number, len = 60) {
  const [s, setS] = useState<number[]>(() => Array.from({ length: len }, () => value))
  const ref = useRef(value)
  ref.current = value
  useEffect(() => {
    const t = setInterval(() => {
      setS((old) => [...old.slice(1), Math.max(0, Math.min(100, ref.current + (Math.random() - 0.5) * Math.max(2, ref.current * 0.15)))])
    }, 1000)
    return () => clearInterval(t)
  }, [])
  return s
}

function Spark({ data, color, h = 160 }: { data: number[]; color: string; h?: number }) {
  const w = 600
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / 100) * h}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full border" style={{ height: h, borderColor: color }}>
      {[1, 2, 3].map((i) => (
        <line key={i} x1={0} x2={w} y1={(h / 4) * i} y2={(h / 4) * i} stroke="#eee" />
      ))}
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill={color} opacity={0.12} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  )
}

function Performance({ ep }: { ep: Endpoint }) {
  const [sel, setSel] = useState('cpu')
  const cpu = cpuTotal(ep)
  const mem = memUsedGb(ep)
  const memPct = Math.round((mem / ep.ramGb) * 100)
  const cDisk = ep.disks[0]?.partitions.find((p) => p.letter === 'C')
  const free = freeGb(ep, 'C:')
  const diskPct = cDisk ? Math.round((cDisk.usedGb / cDisk.sizeGb) * 100) : 0
  const cpuS = useSeries(cpu)
  const memS = useSeries(memPct)
  const diskS = useSeries(Math.min(100, 2 + diskPct / 20))
  const nics = ep.adapters.filter((a) => a.kind !== 'VPN' || a.mediaConnected)
  const netS = useSeries(3)
  const items = [
    { id: 'cpu', label: 'CPU', sub: `${cpu} %  ${(1.6 + cpu / 60).toLocaleString('de-DE', { maximumFractionDigits: 2 })} GHz`, icon: <Cpu size={16} />, color: '#1e88e5' },
    { id: 'mem', label: 'Arbeitsspeicher', sub: `${mem.toLocaleString('de-DE')}/${ep.ramGb} GB (${memPct} %)`, icon: <MemoryStick size={16} />, color: '#8e24aa' },
    { id: 'disk', label: 'Datenträger 0 (C:)', sub: `SSD  ${diskPct} % belegt`, icon: <HardDrive size={16} />, color: '#43a047' },
    ...nics.map((a) => ({ id: `nic:${a.name}`, label: a.name, sub: !a.enabled ? 'Deaktiviert' : !a.mediaConnected ? 'Nicht verbunden' : `S: 0 R: ${a.kind === 'WLAN' ? 24 : 8} KBit/s`, icon: a.kind === 'WLAN' ? <Wifi size={16} /> : <Network size={16} />, color: '#e65100' })),
  ]
  const cur = items.find((i) => i.id === sel) ?? items[0]
  const nic = sel.startsWith('nic:') ? ep.adapters.find((a) => `nic:${a.name}` === sel) : undefined
  return (
    <div className="flex h-full">
      <div className="w-56 shrink-0 overflow-auto border-r border-[#eee] p-1.5">
        {items.map((i) => (
          <button key={i.id} type="button" onClick={() => setSel(i.id)} className={cx('mb-0.5 flex w-full items-center gap-2 rounded-[4px] px-2 py-2 text-left', sel === i.id ? 'bg-[#e5f1fb]' : 'hover:bg-[#f5f5f5]')}>
            <span style={{ color: i.color }}>{i.icon}</span>
            <span className="min-w-0">
              <span className="block font-medium">{i.label}</span>
              <span className="block truncate text-[11px] text-slate-500">{i.sub}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="min-w-0 flex-1 overflow-auto p-4">
        <div className="mb-1 flex items-baseline justify-between">
          <span className="text-[20px] font-light">{cur.label}</span>
          <span className="text-[12px] text-slate-600">{sel === 'cpu' ? ep.cpu : sel === 'mem' ? `${ep.ramGb} GB` : sel === 'disk' ? (ep.disks[0]?.model ?? '') : (nic?.description ?? '')}</span>
        </div>
        <div className="mb-1 text-[11px] text-slate-500">{sel === 'cpu' ? '% Auslastung über 60 Sekunden' : sel === 'mem' ? 'Speicherauslastung' : sel === 'disk' ? 'Aktive Zeit' : 'Durchsatz'}</div>
        <Spark data={sel === 'cpu' ? cpuS : sel === 'mem' ? memS : sel === 'disk' ? diskS : netS} color={cur.color} />
        <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-2 md:grid-cols-3">
          {sel === 'cpu' && (
            <>
              <Kv k="Auslastung" v={`${cpu} %`} big />
              <Kv k="Prozesse" v={String(ep.processes.length)} big />
              <Kv k="Betriebszeit" v={fmtUptime(ep.lastBoot)} big />
              <Kv k="Basisgeschwindigkeit" v="1,60 GHz" />
              <Kv k="Kerne" v="10" />
              <Kv k="Logische Prozessoren" v="12" />
            </>
          )}
          {sel === 'mem' && (
            <>
              <Kv k="In Verwendung" v={`${mem.toLocaleString('de-DE')} GB`} big />
              <Kv k="Verfügbar" v={`${Math.max(0, ep.ramGb - mem).toLocaleString('de-DE', { maximumFractionDigits: 1 })} GB`} big />
              <Kv k="Auslastung" v={`${memPct} %`} big />
              <Kv k="Geschwindigkeit" v="3200 MT/s" />
              <Kv k="Formfaktor" v={ep.kind === 'Notebook' ? 'SODIMM' : 'DIMM'} />
            </>
          )}
          {sel === 'disk' && (
            <>
              <Kv k="Kapazität" v={`${cDisk?.sizeGb.toLocaleString('de-DE', { maximumFractionDigits: 0 }) ?? '?'} GB`} big />
              <Kv k="Frei" v={`${free.toLocaleString('de-DE')} GB`} big />
              <Kv k="Belegt" v={`${diskPct} %`} big />
              <Kv k="Typ" v={ep.disks[0]?.kind ?? 'SSD'} />
              <Kv k="Systemdatenträger" v="Ja" />
            </>
          )}
          {nic && (
            <>
              <Kv k="Status" v={!nic.enabled ? 'Deaktiviert' : nic.mediaConnected ? 'Verbunden' : 'Nicht verbunden'} big />
              <Kv k="IPv4-Adresse" v={nic.ip || '–'} big />
              <Kv k="Verbindungstyp" v={nic.kind} />
              {nic.ssid && <Kv k="SSID" v={nic.ssid} />}
              <Kv k="Geschwindigkeit" v={nic.speedMbps ? `${nic.speedMbps} MBit/s` : '–'} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Kv({ k, v, big }: { k: string; v: string; big?: boolean }) {
  return (
    <div>
      <div className="text-[11px] text-slate-500">{k}</div>
      <div className={cx(big ? 'text-[18px] font-light' : 'text-[12px]')}>{v}</div>
    </div>
  )
}

function Startup({ host, ep }: { host: string; ep: Endpoint }) {
  const ops = useEpOps(host)
  const [sel, setSel] = useState<string | null>(null)
  const item = ep.startupApps.find((s) => s.name === sel)
  const toggle = (name: string) => {
    const it = ep.startupApps.find((s) => s.name === name)
    if (!it) return
    ops.mutate(
      (e) => {
        const x = e.startupApps.find((s) => s.name === name)
        if (x) x.enabled = !x.enabled
      },
      { type: STARTUP_ACTION, detail: `Autostart ${it.enabled ? 'deaktiviert' : 'aktiviert'}: ${name}` },
    )
  }
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-[#eee] px-3 py-2">
        <span className="text-[14px] font-semibold">Autostart-Apps</span>
        <span className="ml-4 text-slate-500">
          <Gauge size={13} className="mr-1 inline" />
          Letzte BIOS-Zeit: 4,2 Sekunden
        </span>
        <WBtn className="ml-auto" disabled={!item} onClick={() => item && toggle(item.name)}>
          {item?.enabled ? 'Deaktivieren' : 'Aktivieren'}
        </WBtn>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className={listCls}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Herausgeber</th>
              <th>Status</th>
              <th>Startauswirkungen</th>
              <th>Befehlszeile</th>
            </tr>
          </thead>
          <tbody>
            {ep.startupApps.map((s) => {
              const active = isStartupActive(ep, s.name)
              return (
                <tr key={s.name} className={rowCls(sel === s.name)} onClick={() => setSel(s.name)} onDoubleClick={() => toggle(s.name)}>
                  <td>{s.name}</td>
                  <td>{s.publisher}</td>
                  <td className={cx(!s.enabled && 'text-slate-500')}>
                    {s.enabled ? 'Aktiviert' : 'Deaktiviert'}
                    {s.enabled && !active && <span className="ml-1 text-[11px] text-amber-700">(kein Run-Eintrag)</span>}
                  </td>
                  <td>{s.enabled ? s.impact : 'Nicht gemessen'}</td>
                  <td className="max-w-[300px] font-mono text-[11px] text-slate-600">{s.command}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ServicesTab({ host, ep }: { host: string; ep: Endpoint }) {
  const desk = useDesk()
  const act = useServiceActions(host, ep)
  const [sel, setSel] = useState<string | null>(null)
  const ctx = useContextMenu<string>()
  const list = useMemo(() => [...ep.services].sort((a, b) => a.name.localeCompare(b.name)), [ep.services])
  const pidOf = (name: string) => ep.processes.find((p) => p.service?.toLowerCase() === name.toLowerCase())?.pid ?? (ep.services.find((s) => s.name === name)?.status === 'Wird ausgeführt' ? 1000 + (name.length * 97) % 8000 : undefined)
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-[#eee] px-3 py-2">
        <span className="text-[14px] font-semibold">Dienste</span>
        <WBtn className="ml-auto" onClick={() => desk.openApp('services')}>
          Dienste öffnen
        </WBtn>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className={listCls}>
          <thead>
            <tr>
              <th>Name</th>
              <th>PID</th>
              <th>Beschreibung</th>
              <th>Status</th>
              <th>Gruppe</th>
            </tr>
          </thead>
          <tbody>
            {list.map((s) => (
              <tr
                key={s.name}
                className={rowCls(sel === s.name)}
                onClick={() => setSel(s.name)}
                onContextMenu={(e) => {
                  setSel(s.name)
                  ctx.open(e, s.name)
                }}
              >
                <td>{s.name}</td>
                <td>{s.status === 'Wird ausgeführt' ? pidOf(s.name) : ''}</td>
                <td className="max-w-[260px]">{s.displayName}</td>
                <td>{s.status === 'Wird ausgeführt' ? 'Wird ausgeführt' : s.status === 'Angehalten' ? 'Angehalten' : 'Beendet'}</td>
                <td className="text-slate-500">{s.account === 'Lokales System' ? 'netsvcs' : s.account === 'Netzwerkdienst' ? 'NetworkService' : 'LocalService'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {ctx.menu &&
        (() => {
          const s = ep.services.find((x) => x.name === ctx.menu!.data)
          return (
            <ContextMenu
              x={ctx.menu.x}
              y={ctx.menu.y}
              onClose={ctx.close}
              items={[
                { label: 'Starten', disabled: !s || s.status !== 'Beendet', onClick: () => s && void act.start(s.name) },
                { label: 'Beenden', disabled: !s || s.status === 'Beendet', onClick: () => s && void act.stop(s.name) },
                { label: 'Neu starten', disabled: !s || s.status === 'Beendet', onClick: () => s && void act.restart(s.name) },
                { sep: true },
                { label: 'Dienste öffnen', onClick: () => desk.openApp('services') },
              ]}
            />
          )
        })()}
      {act.busy && <ProgressDialog title="Dienststeuerung" text={act.busy} />}
    </div>
  )
}
