// Remote-Desktop-Modul: Sitzungs-Tabs, "Neue Verbindung", simulierte Windows-11-Desktops.
// Bleibt in App.tsx dauerhaft gemountet, damit Fenster beim Ansichtswechsel erhalten bleiben.

import { Expand, Monitor, Plus, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/core/store'
import { cx } from '@/ui'
import { ConnectPanel } from './ConnectDialog'
import { Session } from './Session'
import { useRdp } from './store'

export function RdpView() {
  const sessions = useStore((s) => s.ui.rdpSessions)
  const active = useStore((s) => s.ui.rdpActive)
  const view = useStore((s) => s.ui.view)
  const openRdp = useStore((s) => s.openRdp)
  const closeRdp = useStore((s) => s.closeRdp)
  const local = useRdp((s) => s.sessions)
  const [showConnect, setShowConnect] = useState(false)
  const areaRef = useRef<HTMLDivElement>(null)

  // Lokalen Sitzungszustand mit ui.rdpSessions abgleichen
  useEffect(() => {
    const st = useRdp.getState()
    for (const k of sessions) st.ensure(k)
    for (const k of Object.keys(st.sessions)) if (!sessions.includes(k)) st.remove(k)
  }, [sessions])

  const current = active && sessions.includes(active) ? active : sessions[0]

  return (
    <div className="flex h-full flex-col bg-slate-100">
      <div className="flex h-10 shrink-0 items-end gap-1 border-b border-slate-300 bg-slate-200 px-2 pt-1.5">
        {sessions.map((k) => {
          const ses = local[k]
          const dot = !ses || ses.phase === 'connecting' ? 'bg-amber-400 animate-pulse' : ses.phase === 'connected' ? 'bg-emerald-500' : 'bg-rose-500'
          return (
            <div
              key={k}
              className={cx('group flex h-full max-w-[220px] cursor-default items-center gap-2 rounded-t-md border border-b-0 px-3 text-sm', k === current ? 'border-slate-300 bg-white text-slate-900' : 'border-transparent text-slate-600 hover:bg-white/60')}
              onClick={() => openRdp(k)}
              title={ses?.phase === 'connected' ? `Verbunden mit ${ses.host}` : k}
            >
              <span className={cx('h-2 w-2 shrink-0 rounded-full', dot)} />
              <Monitor size={14} className="shrink-0" />
              <span className="truncate font-mono text-xs">{ses?.host ?? k}</span>
              <button
                type="button"
                title="Verbindung trennen und schließen"
                className="ml-1 rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                onClick={(e) => {
                  e.stopPropagation()
                  closeRdp(k)
                }}
              >
                <X size={13} />
              </button>
            </div>
          )
        })}
        <button type="button" onClick={() => setShowConnect(true)} className="mb-1 ml-1 flex items-center gap-1 rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-white/70">
          <Plus size={15} /> Neue Verbindung
        </button>
        <div className="flex-1" />
        {current && (
          <button
            type="button"
            title="Vollbild"
            className="mb-1 rounded-md p-1.5 text-slate-600 hover:bg-white/70"
            onClick={() => {
              const el = areaRef.current
              if (el && !document.fullscreenElement) void el.requestFullscreen?.().catch(() => {})
              else void document.exitFullscreen?.().catch(() => {})
            }}
          >
            <Expand size={15} />
          </button>
        )}
      </div>
      <div ref={areaRef} className="relative min-h-0 flex-1">
        {sessions.map((k) => (
          <div key={k} className={cx('absolute inset-0', k !== current && 'invisible')}>
            {local[k] && <Session sessionKey={k} active={k === current && view === 'rdp'} />}
          </div>
        ))}
        {sessions.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-4">
            <ConnectPanel />
            <p className="max-w-md text-center text-xs text-slate-500">Den Computernamen finden Sie im Active Directory (Feld „Verwaltet von“ bzw. Beschreibung) oder im Inventar. Server werden im Modul „Infrastruktur“ verwaltet.</p>
          </div>
        )}
        {showConnect && (
          <div className="absolute inset-0 z-[10000] flex items-center justify-center bg-slate-900/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && setShowConnect(false)}>
            <ConnectPanel onDone={() => setShowConnect(false)} onCancel={() => setShowConnect(false)} />
          </div>
        )}
      </div>
    </div>
  )
}
