// Geräte-Manager: Kategorien, Warnsymbole, Eigenschaften, Aktivieren/Deaktivieren,
// Treiber aktualisieren, Deinstallieren, Nach geänderter Hardware suchen.

import {
  ArrowDown,
  AudioLines,
  Bluetooth,
  Camera,
  Cpu,
  Fingerprint,
  HardDrive,
  Keyboard,
  Monitor,
  MonitorCog,
  Mouse,
  Network,
  PcCase,
  Printer,
  RefreshCw,
  ScanSearch,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  Usb,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { A } from '@/core/actions'
import type { Device, Endpoint } from '@/core/types'
import { cx } from '@/ui'
import { useDesk, useEp, useEpOps } from '../desk'
import { AppLoading, ContextMenu, MenuBar, ProgressDialog, StatusBar, ToolBar, ToolBtn, ToolSep, TreeToggle, useContextMenu, WBtn, WDialog, WTabs, type MenuItem } from '../ui'
import { delay, type AppProps } from './types'

const REMOVED_FLAG = 'rdp:removedDevices'

const CAT_ICON: Record<string, LucideIcon> = {
  Prozessoren: Cpu,
  Grafikkarten: MonitorCog,
  Netzwerkadapter: Network,
  Kameras: Camera,
  Bluetooth: Bluetooth,
  'Audio, Video und Gamecontroller': AudioLines,
  Audio: AudioLines,
  Monitore: Monitor,
  Tastaturen: Keyboard,
  'Mäuse und andere Zeigegeräte': Mouse,
  Mäuse: Mouse,
  Laufwerke: HardDrive,
  'USB-Controller': Usb,
  Sicherheitsgeräte: ShieldCheck,
  Drucker: Printer,
  Biometrische_Geräte: Fingerprint,
}
export const catIcon = (c: string) => CAT_ICON[c] ?? PcCase

export function deviceStatusText(d: Device): string {
  switch (d.status) {
    case 'OK':
      return 'Das Gerät ist betriebsbereit.'
    case 'Deaktiviert':
      return 'Das Gerät ist deaktiviert. (Code 22)\n\nAktivieren Sie das Gerät über „Gerät aktivieren“.'
    case 'Treiber fehlt':
      return `Die Treiber für dieses Gerät wurden nicht installiert. (Code ${d.errorCode ?? 28})\n\nEs sind keine kompatiblen Treiber für dieses Gerät vorhanden.\n\nKlicken Sie auf „Treiber aktualisieren“, um einen Treiber für dieses Gerät zu suchen.`
    default: {
      const code = d.errorCode ?? 10
      const msg: Record<number, string> = {
        10: 'Das Gerät kann nicht gestartet werden.',
        31: 'Das Gerät funktioniert nicht ordnungsgemäß, da Windows die erforderlichen Treiber nicht laden kann.',
        39: 'Der Gerätetreiber für diese Hardware kann nicht geladen werden. Der Treiber ist möglicherweise beschädigt oder nicht vorhanden.',
        43: 'Das Gerät wurde von Windows angehalten, weil Probleme mit dem Gerät festgestellt wurden.',
        45: 'Dieses Hardwaregerät ist zurzeit nicht mit dem Computer verbunden.',
      }
      return `${msg[code] ?? 'Das Gerät funktioniert nicht ordnungsgemäß.'} (Code ${code})`
    }
  }
}

/** Netzwerkkarte ↔ Adapter koppeln */
function syncAdapter(e: Endpoint, d: Device) {
  if (d.category !== 'Netzwerkadapter') return
  const a = e.adapters.find((x) => x.description === d.name)
  if (a) a.enabled = d.status === 'OK'
}

function bumpVersion(v: string) {
  const p = v.split('.').map((x) => parseInt(x, 10) || 0)
  p[p.length - 1] += 7
  if (p.length > 1) p[p.length - 2] += 1
  return p.join('.')
}

export function DeviceManagerApp({ host }: AppProps) {
  const ep = useEp(host)
  if (!ep) return <AppLoading />
  return <DeviceManager host={host} ep={ep} />
}

export function removedDevices(ep: Endpoint): Device[] {
  try {
    return JSON.parse(ep.flags[REMOVED_FLAG] ?? '[]') as Device[]
  } catch {
    return []
  }
}

/** Deinstallierte Geräte wieder erkennen (Hardwaresuche / Neustart) – innerhalb von updateWorld */
export function redetectDevices(e: Endpoint): string[] {
  const removed = removedDevices(e)
  if (!removed.length) return []
  for (const d of removed) {
    const back: Device = { ...d, status: 'OK', errorCode: undefined }
    e.devices.push(back)
    syncAdapter(e, back)
  }
  delete e.flags[REMOVED_FLAG]
  return removed.map((d) => d.name)
}

function DeviceManager({ host, ep }: { host: string; ep: Endpoint }) {
  const desk = useDesk()
  const ops = useEpOps(host)
  const [sel, setSel] = useState<string | null>(null)
  const [closed, setClosed] = useState<Set<string>>(new Set())
  const [opened, setOpened] = useState<Set<string>>(new Set())
  const [props, setProps] = useState<string | null>(null)
  const [update, setUpdate] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const ctx = useContextMenu<string>()

  const cats = useMemo(() => {
    const m = new Map<string, Device[]>()
    for (const d of ep.devices) m.set(d.category, [...(m.get(d.category) ?? []), d])
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'de'))
  }, [ep.devices])
  const isOpen = (c: string, devs: Device[]) => opened.has(c) || (devs.some((d) => d.status !== 'OK') && !closed.has(c))
  const toggleCat = (c: string, devs: Device[]) => {
    if (isOpen(c, devs)) {
      setClosed(new Set(closed).add(c))
      const o = new Set(opened)
      o.delete(c)
      setOpened(o)
    } else {
      setOpened(new Set(opened).add(c))
      const cl = new Set(closed)
      cl.delete(c)
      setClosed(cl)
    }
  }
  const dev = sel ? ep.devices.find((d) => d.id === sel) : undefined

  const setEnabled = async (id: string, enabled: boolean) => {
    const d = ep.devices.find((x) => x.id === id)
    if (!d) return
    if (!enabled) {
      const ok = await desk.confirm(`Wenn Sie dieses Gerät deaktivieren, funktioniert es nicht mehr. Möchten Sie es wirklich deaktivieren?${d.category === 'Netzwerkadapter' ? '\n\nAchtung: Über diesen Adapter kann die Remoteverbindung laufen!' : ''}`, { title: d.name, icon: 'warning', ok: 'Ja', cancel: 'Nein' })
      if (!ok) return
    }
    ops.mutate(
      (e) => {
        const x = e.devices.find((y) => y.id === id)
        if (!x) return
        if (enabled) {
          if (x.status === 'Deaktiviert') {
            x.status = 'OK'
            x.errorCode = undefined
          }
        } else {
          x.status = 'Deaktiviert'
          x.errorCode = 22
        }
        syncAdapter(e, x)
      },
      { type: A.deviceChanged, detail: `Gerät ${enabled ? 'aktiviert' : 'deaktiviert'}: ${d.name}` },
    )
  }

  const uninstall = async (id: string) => {
    const d = ep.devices.find((x) => x.id === id)
    if (!d) return
    const ok = await desk.confirm(`Warnung: Sie sind dabei, dieses Gerät aus dem System zu deinstallieren.\n\n${d.name}`, { title: 'Gerät deinstallieren', icon: 'warning', ok: 'Deinstallieren', cancel: 'Abbrechen' })
    if (!ok) return
    ops.mutate(
      (e) => {
        const x = e.devices.find((y) => y.id === id)
        if (!x) return
        const removed = removedDevices(e)
        removed.push({ ...x })
        e.flags[REMOVED_FLAG] = JSON.stringify(removed)
        e.devices = e.devices.filter((y) => y.id !== id)
        if (x.category === 'Netzwerkadapter') {
          const a = e.adapters.find((y) => y.description === x.name)
          if (a) a.enabled = false
        }
      },
      { type: A.deviceChanged, detail: `Gerät deinstalliert: ${d.name}` },
    )
    setSel(null)
  }

  const scan = async () => {
    setBusy('Nach Plug & Play-Geräten wird gesucht …')
    await delay(1100)
    setBusy(null)
    const names = removedDevices(ep).map((d) => d.name)
    if (!names.length) return
    ops.mutate((e) => void redetectDevices(e), { type: A.deviceChanged, detail: `Hardwareerkennung: ${names.join(', ')} installiert` })
  }

  const items = (d?: Device): MenuItem[] =>
    d
      ? [
          { label: 'Treiber aktualisieren', onClick: () => setUpdate(d.id) },
          d.status === 'Deaktiviert' ? { label: 'Gerät aktivieren', onClick: () => void setEnabled(d.id, true) } : { label: 'Gerät deaktivieren', onClick: () => void setEnabled(d.id, false) },
          { label: 'Gerät deinstallieren', onClick: () => void uninstall(d.id) },
          { sep: true },
          { label: 'Nach geänderter Hardware suchen', onClick: () => void scan() },
          { sep: true },
          { label: 'Eigenschaften', bold: true, onClick: () => setProps(d.id) },
        ]
      : [{ label: 'Nach geänderter Hardware suchen', onClick: () => void scan() }]

  return (
    <div className="flex h-full flex-col text-[12px]">
      <MenuBar
        menus={[
          { label: 'Datei', items: [{ label: 'Optionen', disabled: true }] },
          { label: 'Aktion', items: items(dev) },
          { label: 'Ansicht', items: [{ label: 'Geräte nach Typ', checked: true }, { label: 'Ausgeblendete Geräte anzeigen', disabled: true }] },
        ]}
      />
      <ToolBar>
        <ToolBtn icon={<MonitorCog size={14} />} title="Eigenschaften" disabled={!dev} onClick={() => dev && setProps(dev.id)} />
        <ToolSep />
        <ToolBtn icon={<RefreshCw size={14} />} title="Treiber aktualisieren" disabled={!dev} onClick={() => dev && setUpdate(dev.id)} />
        <ToolBtn icon={<ArrowDown size={14} />} title={dev?.status === 'Deaktiviert' ? 'Gerät aktivieren' : 'Gerät deaktivieren'} disabled={!dev} onClick={() => dev && void setEnabled(dev.id, dev.status === 'Deaktiviert')} />
        <ToolBtn icon={<Trash2 size={14} className="text-rose-600" />} title="Gerät deinstallieren" disabled={!dev} onClick={() => dev && void uninstall(dev.id)} />
        <ToolSep />
        <ToolBtn icon={<ScanSearch size={14} />} title="Nach geänderter Hardware suchen" onClick={() => void scan()} />
      </ToolBar>
      <div className="min-h-0 flex-1 overflow-auto bg-white py-1" onContextMenu={(e) => ctx.open(e, '')}>
        <div className="flex items-center gap-1 px-1">
          <TreeToggle open onClick={() => {}} />
          <PcCase size={14} className="text-slate-600" /> {ep.hostname}
        </div>
        {cats.map(([cat, devs]) => {
          const Icon = catIcon(cat)
          const open = isOpen(cat, devs)
          return (
            <div key={cat}>
              <div className="flex cursor-default items-center gap-1 pl-5 hover:bg-[#e5f1fb]" onClick={() => toggleCat(cat, devs)}>
                <TreeToggle open={open} onClick={() => toggleCat(cat, devs)} />
                <Icon size={14} className="text-slate-600" />
                {cat}
              </div>
              {open &&
                devs.map((d) => (
                  <div
                    key={d.id}
                    className={cx('flex cursor-default items-center gap-1.5 py-[1px] pl-14 select-none', sel === d.id ? 'bg-[#cce4f7]' : 'hover:bg-[#e5f1fb]')}
                    onClick={() => setSel(d.id)}
                    onDoubleClick={() => setProps(d.id)}
                    onContextMenu={(e) => {
                      setSel(d.id)
                      ctx.open(e, d.id)
                    }}
                  >
                    <DevIcon d={d} />
                    {d.name}
                  </div>
                ))}
            </div>
          )
        })}
      </div>
      <StatusBar>{dev ? `${dev.name}: ${deviceStatusText(dev).split('\n')[0]}` : `${ep.devices.length} Geräte`}</StatusBar>

      {ctx.menu && <ContextMenu x={ctx.menu.x} y={ctx.menu.y} onClose={ctx.close} items={items(ep.devices.find((d) => d.id === ctx.menu!.data))} />}
      {props && <DeviceProps ep={ep} id={props} onClose={() => setProps(null)} onUpdate={() => setUpdate(props)} onToggle={(en) => void setEnabled(props, en)} onUninstall={() => { setProps(null); void uninstall(props) }} />}
      {update && <UpdateDriver host={host} ep={ep} id={update} onClose={() => setUpdate(null)} />}
      {busy && <ProgressDialog title="Geräte-Manager" text={busy} />}
    </div>
  )
}

function DevIcon({ d }: { d: Device }) {
  const Icon = catIcon(d.category)
  return (
    <span className="relative inline-flex">
      <Icon size={14} className="text-slate-600" />
      {d.status === 'Deaktiviert' && <ArrowDown size={10} className="absolute -right-1 -bottom-1 rounded-full bg-white text-slate-800" strokeWidth={3} />}
      {(d.status === 'Fehler' || d.status === 'Treiber fehlt') && <TriangleAlert size={10} className="absolute -right-1 -bottom-1 fill-amber-400 text-slate-900" />}
    </span>
  )
}

function DeviceProps({ ep, id, onClose, onUpdate, onToggle, onUninstall }: { ep: Endpoint; id: string; onClose: () => void; onUpdate: () => void; onToggle: (enable: boolean) => void; onUninstall: () => void }) {
  const d = ep.devices.find((x) => x.id === id)
  const [tab, setTab] = useState<'general' | 'driver' | 'details'>('general')
  if (!d) return null
  return (
    <WDialog title={`Eigenschaften von ${d.name}`} onClose={onClose} width={440} footer={<><WBtn primary onClick={onClose}>OK</WBtn><WBtn onClick={onClose}>Abbrechen</WBtn></>}>
      <WTabs
        tabs={[
          { id: 'general', label: 'Allgemein' },
          { id: 'driver', label: 'Treiber' },
          { id: 'details', label: 'Details' },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div className="pt-3">
        <div className="mb-3 flex items-center gap-3">
          <DevIcon d={d} />
          <span className="text-[13px]">{d.name}</span>
        </div>
        {tab === 'general' && (
          <>
            <div className="mb-3 grid grid-cols-[110px_1fr] gap-y-1">
              <span className="text-slate-600">Gerätetyp:</span>
              <span>{d.category}</span>
              <span className="text-slate-600">Hersteller:</span>
              <span>{d.manufacturer}</span>
              <span className="text-slate-600">Ort:</span>
              <span>PCI-Bus 0, Gerät {(d.id.charCodeAt(4) % 30) + 1}, Funktion 0</span>
            </div>
            <div className="mb-1">Gerätestatus</div>
            <div className="h-28 overflow-auto rounded-[4px] border border-[#d0d0d0] bg-[#fafafa] p-2 whitespace-pre-wrap">{deviceStatusText(d)}</div>
          </>
        )}
        {tab === 'driver' && (
          <>
            <div className="mb-3 grid grid-cols-[120px_1fr] gap-y-1">
              <span className="text-slate-600">Treiberanbieter:</span>
              <span>{d.status === 'Treiber fehlt' ? 'Unbekannt' : d.manufacturer}</span>
              <span className="text-slate-600">Treiberdatum:</span>
              <span>{d.status === 'Treiber fehlt' ? 'Nicht verfügbar' : d.driverDate}</span>
              <span className="text-slate-600">Treiberversion:</span>
              <span>{d.status === 'Treiber fehlt' ? 'Nicht verfügbar' : d.driverVersion}</span>
              <span className="text-slate-600">Signaturgeber:</span>
              <span>{d.status === 'Treiber fehlt' ? 'Nicht digital signiert' : 'Hardwarekompatibilitäts-Herausgeber'}</span>
            </div>
            <div className="grid grid-cols-[150px_1fr] items-center gap-2">
              <WBtn onClick={onUpdate}>Treiber aktualisieren</WBtn>
              <span className="text-slate-600">Treibersoftware für dieses Gerät aktualisieren.</span>
              <WBtn disabled>Vorheriger Treiber</WBtn>
              <span className="text-slate-600">Kein vorheriger Treiber vorhanden.</span>
              <WBtn onClick={() => onToggle(d.status === 'Deaktiviert')}>{d.status === 'Deaktiviert' ? 'Gerät aktivieren' : 'Gerät deaktivieren'}</WBtn>
              <span className="text-slate-600">{d.status === 'Deaktiviert' ? 'Ausgewähltes Gerät aktivieren.' : 'Ausgewähltes Gerät deaktivieren.'}</span>
              <WBtn onClick={onUninstall}>Gerät deinstallieren</WBtn>
              <span className="text-slate-600">Gerät vom System deinstallieren (erweitert).</span>
            </div>
          </>
        )}
        {tab === 'details' && (
          <div className="grid grid-cols-[130px_1fr] gap-y-1">
            <span className="text-slate-600">Geräteinstanzpfad:</span>
            <span className="font-mono text-[11px] break-all">PCI\VEN_{(d.manufacturer.length * 1117).toString(16).toUpperCase().padStart(4, '0')}&amp;DEV_{(d.name.length * 331).toString(16).toUpperCase().padStart(4, '0')}\{d.id.toUpperCase()}</span>
            <span className="text-slate-600">Problemcode:</span>
            <span>{d.status === 'OK' ? '–' : (d.errorCode ?? (d.status === 'Treiber fehlt' ? 28 : 10))}</span>
          </div>
        )}
      </div>
    </WDialog>
  )
}

function UpdateDriver({ host, ep, id, onClose }: { host: string; ep: Endpoint; id: string; onClose: () => void }) {
  const ops = useEpOps(host)
  const d = ep.devices.find((x) => x.id === id)
  const [phase, setPhase] = useState<'choose' | 'search' | 'done'>('choose')
  const [result, setResult] = useState('')
  if (!d) return null
  const auto = async () => {
    setPhase('search')
    await delay(1400)
    if (d.status === 'Treiber fehlt') {
      const ver = bumpVersion(d.driverVersion || '10.0.26100.1')
      ops.mutate(
        (e) => {
          const x = e.devices.find((y) => y.id === id)
          if (!x) return
          x.status = 'OK'
          x.errorCode = undefined
          x.driverVersion = ver
          x.driverDate = new Date().toLocaleDateString('de-DE')
          syncAdapter(e, x)
        },
        { type: A.deviceChanged, detail: `Treiber aktualisiert: ${d.name} (${ver})` },
      )
      setResult(`Windows hat die Treiber erfolgreich aktualisiert.\n\nWindows hat die Treiber für dieses Gerät installiert:\n${d.name} – Version ${ver}`)
    } else {
      setResult(`Die besten Treiber für Ihr Gerät sind bereits installiert.\n\nWindows hat festgestellt, dass der beste Treiber für dieses Gerät bereits installiert ist (${d.driverVersion}).${d.status === 'Fehler' ? '\n\nTipp: Bei Gerätefehlern hilft oft „Gerät deinstallieren“ und anschließend „Nach geänderter Hardware suchen“.' : ''}`)
    }
    setPhase('done')
  }
  return (
    <WDialog title={`Treiber aktualisieren – ${d.name}`} onClose={onClose} width={460} footer={phase === 'done' ? <WBtn primary onClick={onClose}>Schließen</WBtn> : <WBtn onClick={onClose}>Abbrechen</WBtn>}>
      {phase === 'choose' && (
        <div className="space-y-3">
          <div className="text-[14px] font-semibold">Wie möchten Sie nach Treibern suchen?</div>
          <button type="button" onClick={() => void auto()} className="block w-full rounded-[4px] border border-[#d0d0d0] p-3 text-left hover:border-[#005fb8] hover:bg-[#f2f8fd]">
            <div className="text-[13px] font-semibold text-[#005fb8]">→ Automatisch nach Treibern suchen</div>
            <div className="text-slate-600">Windows durchsucht Ihren Computer nach der besten verfügbaren Treibersoftware und installiert sie auf dem Gerät.</div>
          </button>
          <button type="button" onClick={() => void auto()} className="block w-full rounded-[4px] border border-[#d0d0d0] p-3 text-left hover:border-[#005fb8] hover:bg-[#f2f8fd]">
            <div className="text-[13px] font-semibold text-[#005fb8]">→ Auf meinem Computer nach Treibern suchen</div>
            <div className="text-slate-600">Treibersoftware manuell suchen und installieren (Treiberspeicher C:\Windows\System32\DriverStore).</div>
          </button>
        </div>
      )}
      {phase === 'search' && (
        <div>
          <p className="mb-3">Es wird online nach Treibern gesucht …</p>
          <div className="h-2 overflow-hidden rounded-full bg-[#e5e5e5]">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-[#005fb8]" />
          </div>
        </div>
      )}
      {phase === 'done' && <p className="whitespace-pre-wrap">{result}</p>}
    </WDialog>
  )
}
