// Taskleiste: Start, Suche, angeheftete Apps, offene Fenster, Infobereich (Netzwerk, VPN, Uhr mit Abweichung, Benutzer).

import { Globe, Network, Orbit, RefreshCw, Search, ShieldCheck, ShieldOff, Volume2, Wifi, WifiOff } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { A } from '@/core/actions'
import { connectVpn, disconnectVpn } from '@/core/ops/endpoint'
import { useStore } from '@/core/store'
import type { Endpoint } from '@/core/types'
import { cx } from '@/ui'
import { adapterStatus, NET_STATE_TEXT, netState, type NetState } from '../apps/net'
import { APPS } from '../apps/registry'
import { useDesk, useEpOps } from '../desk'
import { useRdp, type AppId, type WinState } from '../store'
import { WBtn } from '../ui'
import { initials } from './StartMenu'

const PINNED: AppId[] = ['explorer', 'browser', 'outlook', 'cmd', 'settings']

interface Props {
  ep: Endpoint
  windows: WinState[]
  focused?: string
  startOpen: boolean
  onStart: () => void
  onStartContext: (e: React.MouseEvent) => void
  search: string
  setSearch: (s: string) => void
  userName: string
}

export function Taskbar({ ep, windows, focused, startOpen, onStart, onStartContext, search, setSearch, userName }: Props) {
  const desk = useDesk()
  const focusWindow = useRdp((s) => s.focusWindow)
  const updateWindow = useRdp((s) => s.updateWindow)
  const minimizeAll = useRdp((s) => s.minimizeAll)
  const [pop, setPop] = useState<null | 'net' | 'vpn' | 'clock'>(null)
  const state = useStore((s) => {
    const e = s.world.endpoints[ep.hostname]
    return e ? netState(s.world, e) : 'none'
  })

  const clickWin = (w: WinState) => {
    if (w.id === focused && !w.min) updateWindow(desk.sessionKey, w.id, { min: true })
    else focusWindow(desk.sessionKey, w.id)
  }
  const clickPinned = (id: AppId) => {
    const open = windows.filter((w) => w.app === id).sort((a, b) => b.z - a.z)
    if (open.length) clickWin(open[0])
    else desk.openApp(id)
  }
  const ordered = [...windows].sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)))

  return (
    <div className="absolute right-0 bottom-0 left-0 z-[7000] flex h-12 items-center border-t border-white/40 bg-[#e9eef5]/90 px-2 backdrop-blur-xl">
      <div className="flex min-w-0 flex-1 items-center justify-center gap-1">
        <button type="button" data-startbtn title="Start" onClick={onStart} onContextMenu={onStartContext} className={cx('flex h-10 w-10 items-center justify-center rounded-[6px] hover:bg-white/70', startOpen && 'bg-white/80')}>
          <span className="flex h-6 w-6 items-center justify-center rounded-[7px] bg-gradient-to-br from-[#2b88d8] to-[#0b4fa0] shadow-sm">
            <Orbit size={15} className="text-white" />
          </span>
        </button>
        <div data-searchbox className="relative mx-1 hidden w-48 md:block">
          <Search size={13} className="absolute top-2 left-3 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => !startOpen && onStart()}
            placeholder="Suche"
            className="h-8 w-full rounded-full border border-[#d6d6d6] bg-white/90 pr-3 pl-8 text-[12px] outline-none"
          />
        </div>
        {PINNED.map((id) => {
          const a = APPS[id]
          const Icon = a.icon
          const open = windows.some((w) => w.app === id)
          const active = windows.some((w) => w.app === id && w.id === focused && !w.min)
          return (
            <button key={id} type="button" title={a.title} onClick={() => clickPinned(id)} className={cx('relative flex h-10 w-10 items-center justify-center rounded-[6px] hover:bg-white/70', active && 'bg-white/80')}>
              <Icon size={20} className={a.tint} />
              {open && <span className={cx('absolute bottom-0.5 h-[3px] rounded-full', active ? 'w-4 bg-[#005fb8]' : 'w-1.5 bg-slate-500')} />}
            </button>
          )
        })}
        {ordered
          .filter((w) => !PINNED.includes(w.app) || windows.filter((x) => x.app === w.app).length > 1)
          .map((w) => {
            const a = APPS[w.app]
            const Icon = a.icon
            const active = w.id === focused && !w.min
            return (
              <button key={w.id} type="button" title={w.title} onClick={() => clickWin(w)} className={cx('relative flex h-10 max-w-[150px] items-center gap-1.5 rounded-[6px] px-2 hover:bg-white/70', active && 'bg-white/80')}>
                <Icon size={18} className={cx('shrink-0', a.tint)} />
                <span className="hidden truncate text-[11px] text-slate-700 xl:inline">{w.title}</span>
                <span className={cx('absolute bottom-0.5 left-1/2 h-[3px] -translate-x-1/2 rounded-full', active ? 'w-4 bg-[#005fb8]' : 'w-1.5 bg-slate-500')} />
              </button>
            )
          })}
      </div>
      {/* Infobereich */}
      <div className="relative flex shrink-0 items-center gap-0.5 text-slate-700">
        {ep.pendingReboot && (
          <span title="Neustart erforderlich, um Updates/Änderungen abzuschließen" className="flex h-8 w-7 items-center justify-center">
            <RefreshCw size={15} className="text-amber-600" />
          </span>
        )}
        {ep.kind === 'Notebook' && ep.vpn.installed && (
          <TrayBtn title={`SecureLink VPN: ${ep.vpn.connected ? 'Verbunden' : 'Getrennt'}`} onClick={() => setPop(pop === 'vpn' ? null : 'vpn')}>
            {ep.vpn.connected ? <ShieldCheck size={16} className="text-emerald-600" /> : <ShieldOff size={16} className="text-slate-500" />}
          </TrayBtn>
        )}
        <TrayBtn title={NET_STATE_TEXT[state]} onClick={() => setPop(pop === 'net' ? null : 'net')}>
          <NetIcon ep={ep} state={state} />
          <Volume2 size={16} />
        </TrayBtn>
        <TrayBtn title="Datum und Uhrzeit" onClick={() => setPop(pop === 'clock' ? null : 'clock')}>
          <Clock offset={ep.timeOffsetMin} />
        </TrayBtn>
        <span title={`Angemeldet: MUSTERWERK\\${ep.loggedOnUser ?? 'azubi'}`} className="ml-1 flex h-7 w-7 items-center justify-center rounded-full bg-[#005fb8] text-[10px] font-semibold text-white">
          {initials(userName)}
        </span>
        <button type="button" title="Desktop anzeigen" onClick={() => minimizeAll(desk.sessionKey)} className="ml-1 h-10 w-1.5 border-l border-slate-300 hover:bg-white/80" />
        {pop && <TrayPopup kind={pop} ep={ep} state={state} onClose={() => setPop(null)} />}
      </div>
    </div>
  )
}

function TrayBtn({ children, title, onClick }: { children: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button type="button" data-tray title={title} onClick={onClick} className="flex h-10 items-center gap-1.5 rounded-[6px] px-1.5 hover:bg-white/70">
      {children}
    </button>
  )
}

function NetIcon({ ep, state }: { ep: Endpoint; state: NetState }) {
  const wlan = ep.adapters.some((a) => a.kind === 'WLAN' && a.enabled && a.mediaConnected) && !ep.adapters.some((a) => a.kind === 'Ethernet' && a.enabled && a.mediaConnected)
  if (state === 'none') return wlan ? <WifiOff size={16} className="text-slate-500" /> : <span className="relative"><Network size={16} /><span className="absolute -right-1 -bottom-1 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-rose-600 text-[7px] font-bold text-white">×</span></span>
  const Icon = wlan ? Wifi : state === 'ok' ? Network : Globe
  return (
    <span className="relative">
      <Icon size={16} />
      {state !== 'ok' && <span className="absolute -right-1 -bottom-1 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-amber-400 text-[7px] font-bold text-slate-900">!</span>}
    </span>
  )
}

function Clock({ offset }: { offset: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000)
    return () => clearInterval(t)
  }, [])
  const d = new Date(now + offset * 60000)
  return (
    <span className="flex flex-col items-end text-[11px] leading-tight">
      <span>{d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</span>
      <span>{d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
    </span>
  )
}

function TrayPopup({ kind, ep, state, onClose }: { kind: 'net' | 'vpn' | 'clock'; ep: Endpoint; state: NetState; onClose: () => void }) {
  const desk = useDesk()
  const ops = useEpOps(ep.hostname)
  const ref = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const h = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (ref.current && !ref.current.contains(t) && !t.closest('[data-tray]')) onClose()
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onClose])
  const open = (app: AppId, args?: Record<string, string>) => {
    onClose()
    desk.openApp(app, args)
  }
  return (
    <div ref={ref} className="absolute right-0 bottom-12 z-[8000] w-80 rounded-[10px] border border-white/60 bg-[#eef2f7]/95 p-4 text-[12px] shadow-[0_18px_50px_rgba(0,0,0,0.3)] backdrop-blur-xl">
      {kind === 'net' && (
        <>
          <div className="mb-2 font-semibold">{NET_STATE_TEXT[state]}</div>
          {ep.adapters.map((a) => (
            <div key={a.name} className="mb-1 flex items-center justify-between rounded-[6px] bg-white/80 px-2 py-1.5">
              <span>{a.name}</span>
              <span className="text-slate-500">{adapterStatus(a).text}</span>
            </div>
          ))}
          <div className="mt-2 flex gap-2">
            <WBtn small onClick={() => open('settings', { page: 'netzwerk' })}>
              Netzwerkeinstellungen
            </WBtn>
            <WBtn small onClick={() => open('ncpa')}>
              Adapteroptionen
            </WBtn>
          </div>
        </>
      )}
      {kind === 'vpn' && (
        <>
          <div className="mb-1 font-semibold">SecureLink VPN</div>
          <div className="mb-2 text-slate-600">
            Profil {ep.vpn.profile} – {busy ? 'Verbindung wird hergestellt …' : ep.vpn.connected ? 'Verbunden' : 'Getrennt'}
          </div>
          {ep.vpn.lastError && !ep.vpn.connected && <div className="mb-2 rounded bg-rose-50 p-1.5 text-rose-700">{ep.vpn.lastError}</div>}
          {ep.vpn.connected ? (
            <WBtn
              onClick={() => {
                onClose()
                void desk.confirm('VPN trennen? Läuft die Remotesitzung über das VPN, wird sie getrennt.', { title: 'SecureLink VPN', icon: 'warning', ok: 'Trennen', cancel: 'Abbrechen' }).then((ok) => ok && ops.mutate((e, w) => disconnectVpn(w, e), { type: A.networkChanged, detail: 'VPN getrennt' }))
              }}
            >
              Trennen
            </WBtn>
          ) : (
            <WBtn
              primary
              disabled={busy}
              onClick={() => {
                setBusy(true)
                setTimeout(() => {
                  setBusy(false)
                  ops.run((e, w) => connectVpn(w, e), { type: A.networkChanged, detail: 'VPN verbunden' }, { errorTitle: 'SecureLink VPN', errorPrefix: 'Die VPN-Verbindung konnte nicht hergestellt werden.' })
                }, 1100)
              }}
            >
              Verbinden
            </WBtn>
          )}
        </>
      )}
      {kind === 'clock' && (
        <>
          <ClockBig offset={ep.timeOffsetMin} />
          <WBtn small className="mt-2" onClick={() => open('settings', { page: 'zeit' })}>
            Datum- und Uhrzeiteinstellungen
          </WBtn>
        </>
      )}
    </div>
  )
}

function ClockBig({ offset }: { offset: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const d = new Date(now + offset * 60000)
  return (
    <div>
      <div className="text-[26px] font-light">{d.toLocaleTimeString('de-DE')}</div>
      <div className="text-slate-600">{d.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</div>
    </div>
  )
}
