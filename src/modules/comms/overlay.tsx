// Globale Anruf-Einblendung (unten rechts): klingelnde Anrufe und kompaktes Gesprächs-Panel.
// Wird in App.tsx einmalig gemountet.

import { ChevronDown, ChevronUp, Maximize2, PhoneOff, Play } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { useStore } from '@/core/store'
import type { Call } from '@/core/types'
import { cx, IconButton } from '@/ui'
import { ActiveCallPanel, RingingCall } from './callpanel'
import { hangUp, resumeCall } from './logic'
import { CallTimer } from './parts'
import { playRing } from './speech'
import { useCommsUi } from './store'

export function CallOverlay() {
  const calls = useStore((s) => s.world.calls)
  const view = useStore((s) => s.ui.view)
  const muted = useCommsUi((s) => s.ringMuted)
  const ringing = useMemo(() => calls.filter((c) => c.state === 'klingelt'), [calls])
  const live = useMemo(() => calls.filter((c) => c.state === 'aktiv' || c.state === 'gehalten'), [calls])
  const ringingCount = ringing.length

  // Klingelton, solange ein Anruf klingelt (abschaltbar)
  useEffect(() => {
    if (!ringingCount || muted) return
    playRing()
    const t = setInterval(playRing, 3500)
    return () => clearInterval(t)
  }, [ringingCount, muted])

  // Im Telefon-Modul werden Anrufe dort ausführlich angezeigt – nur der Klingelton bleibt global
  const showRinging = ringing.length > 0 && view !== 'phone'
  const showLive = live.length > 0 && view !== 'phone'
  if (!showRinging && !showLive) return null
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-40 flex w-[23rem] max-w-[calc(100vw-2rem)] flex-col gap-2">
      {showRinging &&
        ringing.map((c) => (
          <RingingCall key={c.id} call={c} floating />
        ))}
      {showLive && <LivePanel live={live} />}
    </div>
  )
}

function LivePanel({ live }: { live: Call[] }) {
  const collapsed = useCommsUi((s) => s.overlayCollapsed)
  const setCollapsed = useCommsUi((s) => s.setOverlayCollapsed)
  const navigate = useStore((s) => s.navigate)
  const users = useStore((s) => s.world.users)
  const primary = live.find((c) => c.state === 'aktiv') ?? live[0]
  const others = live.filter((c) => c.id !== primary.id)
  const nameOf = (sam: string) => users.find((u) => u.sam === sam)?.displayName ?? sam
  return (
    <div className="pointer-events-auto overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
      <div className="flex items-center gap-2 bg-slate-900 px-3 py-1.5 text-xs text-slate-200">
        <span className={cx('h-2 w-2 rounded-full', primary.state === 'aktiv' ? 'animate-pulse bg-emerald-400' : 'bg-amber-400')} />
        <span className="min-w-0 flex-1 truncate">
          {primary.state === 'aktiv' ? 'Im Gespräch' : 'Gehalten'}: <span className="font-medium text-white">{nameOf(primary.from)}</span> · <CallTimer call={primary} />
        </span>
        {collapsed && (
          <IconButton title="Auflegen" className="h-6 w-6 text-rose-300 hover:bg-slate-800 hover:text-rose-200" onClick={() => hangUp(primary.id)}>
            <PhoneOff size={14} />
          </IconButton>
        )}
        <IconButton title="Im Telefon-Modul öffnen" className="h-6 w-6 text-slate-300 hover:bg-slate-800 hover:text-white" onClick={() => navigate('phone')}>
          <Maximize2 size={13} />
        </IconButton>
        <IconButton title={collapsed ? 'Ausklappen' : 'Einklappen'} className="h-6 w-6 text-slate-300 hover:bg-slate-800 hover:text-white" onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </IconButton>
      </div>
      {!collapsed && <ActiveCallPanel callId={primary.id} compact />}
      {others.length > 0 && (
        <ul className="divide-y divide-slate-100 border-t border-slate-200 bg-slate-50 text-xs">
          {others.map((c) => (
            <li key={c.id} className="flex items-center gap-2 px-3 py-1.5">
              <span className="min-w-0 flex-1 truncate text-slate-600">
                {c.state === 'gehalten' ? 'Gehalten' : 'Aktiv'}: <span className="font-medium text-slate-800">{nameOf(c.from)}</span> · <CallTimer call={c} />
              </span>
              {c.state === 'gehalten' && (
                <IconButton title="Fortsetzen" className="h-6 w-6" onClick={() => resumeCall(c.id)}>
                  <Play size={13} />
                </IconButton>
              )}
              <IconButton title="Auflegen" className="h-6 w-6 text-rose-600" onClick={() => hangUp(c.id)}>
                <PhoneOff size={13} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
