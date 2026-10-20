// Fensterrahmen: verschieben (Titelleiste), Größe ändern (Ecke/Kanten), minimieren/maximieren/schließen, Fokus.

import { Copy, Minus, Square, X } from 'lucide-react'
import { memo, useMemo, useRef, type ReactNode } from 'react'
import { cx } from '@/ui'
import { WinCtx, type WinApi } from '../desk'
import { useRdp, type WinState } from '../store'

interface Props {
  sessionKey: string
  win: WinState
  focused: boolean
  icon: ReactNode
  children: ReactNode
}

type Edge = 'se' | 'e' | 's'

function WindowImpl({ sessionKey, win, focused, icon, children }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const focusWindow = useRdp((s) => s.focusWindow)
  const updateWindow = useRdp((s) => s.updateWindow)
  const closeWindow = useRdp((s) => s.closeWindow)
  const drag = useRef<{ sx: number; sy: number; x: number; y: number; w: number; h: number; mode: 'move' | Edge; moved: boolean } | null>(null)

  const api = useMemo<WinApi>(
    () => ({
      id: win.id,
      focused,
      setTitle: (t: string) => {
        const cur = useRdp.getState().sessions[sessionKey]?.windows.find((w) => w.id === win.id)
        if (cur && cur.title !== t) updateWindow(sessionKey, win.id, { title: t })
      },
      close: () => closeWindow(sessionKey, win.id),
    }),
    [win.id, focused, sessionKey, updateWindow, closeWindow],
  )

  const startDrag = (e: React.PointerEvent, mode: 'move' | Edge) => {
    if (e.button !== 0) return
    if (mode === 'move' && (e.target as HTMLElement).closest('button')) return
    if (mode === 'move' && win.max) return
    e.preventDefault()
    drag.current = { sx: e.clientX, sy: e.clientY, x: win.x, y: win.y, w: win.w, h: win.h, mode, moved: false }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    const el = ref.current
    if (!d || !el) return
    const dx = e.clientX - d.sx
    const dy = e.clientY - d.sy
    if (Math.abs(dx) + Math.abs(dy) > 2) d.moved = true
    const parent = el.parentElement?.getBoundingClientRect()
    if (d.mode === 'move') {
      const maxX = (parent?.width ?? 2000) - 60
      const maxY = (parent?.height ?? 2000) - 30
      el.style.left = `${Math.max(-d.w + 80, Math.min(maxX, d.x + dx))}px`
      el.style.top = `${Math.max(0, Math.min(maxY, d.y + dy))}px`
    } else {
      if (d.mode !== 's') el.style.width = `${Math.max(320, d.w + dx)}px`
      if (d.mode !== 'e') el.style.height = `${Math.max(200, d.h + dy)}px`
    }
  }

  const endDrag = () => {
    const d = drag.current
    const el = ref.current
    drag.current = null
    if (!d || !el || !d.moved) return
    updateWindow(sessionKey, win.id, {
      x: parseFloat(el.style.left) || win.x,
      y: parseFloat(el.style.top) || win.y,
      w: parseFloat(el.style.width) || win.w,
      h: parseFloat(el.style.height) || win.h,
    })
  }

  const style: React.CSSProperties = win.max ? { left: 0, top: 0, right: 0, bottom: 0, zIndex: win.z } : { left: win.x, top: win.y, width: win.w, height: win.h, zIndex: win.z }

  return (
    <div
      ref={ref}
      className={cx(
        'absolute flex flex-col overflow-hidden border bg-[#f3f3f3]',
        win.max ? 'rounded-none border-transparent' : 'rounded-[8px]',
        focused ? 'border-[#9a9a9a]/70 shadow-[0_10px_36px_rgba(0,0,0,0.35)]' : 'border-[#b5b5b5]/60 shadow-[0_4px_16px_rgba(0,0,0,0.18)]',
        win.min && 'hidden',
      )}
      style={style}
      onPointerDownCapture={() => !focused && focusWindow(sessionKey, win.id)}
    >
      {/* Titelleiste */}
      <div
        className={cx('flex h-8 shrink-0 select-none items-center', focused ? 'bg-[#eef2f8] text-slate-900' : 'bg-[#f3f3f3] text-slate-500')}
        onPointerDown={(e) => startDrag(e, 'move')}
        onPointerMove={onMove}
        onPointerUp={endDrag}
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).closest('button')) return
          updateWindow(sessionKey, win.id, { max: !win.max })
        }}
      >
        <span className="ml-2.5 flex h-4 w-4 items-center justify-center">{icon}</span>
        <span className="ml-2 min-w-0 flex-1 truncate text-[12px]">{win.title}</span>
        <button type="button" title="Minimieren" className="flex h-8 w-11 items-center justify-center hover:bg-black/[0.06]" onClick={() => updateWindow(sessionKey, win.id, { min: true })}>
          <Minus size={14} />
        </button>
        <button type="button" title={win.max ? 'Verkleinern' : 'Maximieren'} className="flex h-8 w-11 items-center justify-center hover:bg-black/[0.06]" onClick={() => updateWindow(sessionKey, win.id, { max: !win.max })}>
          {win.max ? <Copy size={12} className="-scale-x-100" /> : <Square size={11} />}
        </button>
        <button type="button" title="Schließen" className="flex h-8 w-11 items-center justify-center hover:bg-[#c42b1c] hover:text-white" onClick={() => closeWindow(sessionKey, win.id)}>
          <X size={15} />
        </button>
      </div>
      {/* Inhalt */}
      <div className="relative min-h-0 flex-1 bg-white">
        <WinCtx.Provider value={api}>{children}</WinCtx.Provider>
      </div>
      {/* Größenänderung */}
      {!win.max && (
        <>
          <div className="absolute top-8 right-0 bottom-3 w-1.5 cursor-ew-resize" onPointerDown={(e) => startDrag(e, 'e')} onPointerMove={onMove} onPointerUp={endDrag} />
          <div className="absolute right-3 bottom-0 left-0 h-1.5 cursor-ns-resize" onPointerDown={(e) => startDrag(e, 's')} onPointerMove={onMove} onPointerUp={endDrag} />
          <div className="absolute right-0 bottom-0 h-3.5 w-3.5 cursor-nwse-resize" onPointerDown={(e) => startDrag(e, 'se')} onPointerMove={onMove} onPointerUp={endDrag}>
            <svg viewBox="0 0 10 10" className="h-full w-full text-slate-400">
              <path d="M9 3 L3 9 M9 6 L6 9" stroke="currentColor" strokeWidth="1" />
            </svg>
          </div>
        </>
      )}
    </div>
  )
}

export const Window = memo(WindowImpl)
