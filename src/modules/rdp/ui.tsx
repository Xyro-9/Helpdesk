// Bausteine im Stil eines modernen Desktop-Betriebssystems (eigene Gestaltung).

import { Check, ChevronRight, CircleHelp, CircleX, Info, TriangleAlert, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import { cx } from '@/ui'
import { useDesk } from './desk'

// ─────────────── Formular-Elemente ───────────────

export function WBtn({ primary, small, icon, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean; small?: boolean; icon?: ReactNode }) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[4px] border text-[12px] transition-colors disabled:cursor-default disabled:opacity-45 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#005fb8]/50',
        small ? 'h-6 px-2' : 'h-7 min-w-[76px] px-3',
        primary ? 'border-[#005fb8] bg-[#005fb8] text-white hover:bg-[#1a6fc0] disabled:hover:bg-[#005fb8]' : 'border-[#d0d0d0] bg-white text-slate-800 hover:bg-[#f5f5f5] disabled:hover:bg-white',
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
}

export function WInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        'h-7 w-full rounded-[4px] border border-[#d0d0d0] border-b-[#8a8a8a] bg-white px-2 text-[12px] text-slate-900 placeholder:text-slate-400 focus:border-b-2 focus:border-b-[#005fb8] focus:outline-none disabled:bg-[#f3f3f3] disabled:text-slate-400',
        className,
      )}
      {...rest}
    />
  )
}

export function WSelect({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx('h-7 w-full rounded-[4px] border border-[#d0d0d0] bg-white px-1.5 text-[12px] text-slate-900 focus:border-[#005fb8] focus:outline-none disabled:bg-[#f3f3f3] disabled:text-slate-400', className)} {...rest}>
      {children}
    </select>
  )
}

export function WCheck({ label, checked, onChange, disabled, className }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; className?: string }) {
  return (
    <label className={cx('inline-flex cursor-pointer select-none items-center gap-2 text-[12px] text-slate-800', disabled && 'cursor-default opacity-50', className)}>
      <input type="checkbox" className="h-3.5 w-3.5 accent-[#005fb8]" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

export function WRadio({ label, checked, onChange, disabled, name }: { label: ReactNode; checked: boolean; onChange: () => void; disabled?: boolean; name: string }) {
  return (
    <label className={cx('inline-flex cursor-pointer select-none items-center gap-2 text-[12px] text-slate-800', disabled && 'cursor-default opacity-50')}>
      <input type="radio" name={name} className="h-3.5 w-3.5 accent-[#005fb8]" checked={checked} disabled={disabled} onChange={() => onChange()} />
      {label}
    </label>
  )
}

export function WField({ label, children, className, labelW = 'w-36' }: { label: ReactNode; children: ReactNode; className?: string; labelW?: string }) {
  return (
    <label className={cx('flex items-center gap-2 text-[12px]', className)}>
      <span className={cx('shrink-0 text-slate-700', labelW)}>{label}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </label>
  )
}

export function Group({ title, children, className }: { title: ReactNode; children: ReactNode; className?: string }) {
  return (
    <fieldset className={cx('rounded-[4px] border border-[#d6d6d6] px-3 pt-1 pb-3', className)}>
      <legend className="px-1 text-[12px] text-slate-700">{title}</legend>
      {children}
    </fieldset>
  )
}

/** Mini-Reiter für Eigenschaften-Dialoge */
export function WTabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="flex gap-0.5 border-b border-[#d6d6d6]">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={cx('-mb-px rounded-t-[4px] border px-3 py-1 text-[12px]', value === t.id ? 'border-[#d6d6d6] border-b-white bg-white text-slate-900' : 'border-transparent text-slate-600 hover:bg-white/60')}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

// ─────────────── Symbolleisten, Menüs ───────────────

export function ToolBar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('flex flex-wrap items-center gap-0.5 border-b border-[#e5e5e5] bg-[#fafafa] px-1.5 py-1', className)}>{children}</div>
}

export function ToolBtn({ icon, label, onClick, disabled, title, active }: { icon: ReactNode; label?: string; onClick?: () => void; disabled?: boolean; title?: string; active?: boolean }) {
  return (
    <button
      type="button"
      title={title ?? label}
      onClick={onClick}
      disabled={disabled}
      className={cx('inline-flex h-7 items-center gap-1.5 rounded-[4px] px-2 text-[12px] text-slate-700 hover:bg-[#ebebeb] disabled:opacity-35 disabled:hover:bg-transparent', active && 'bg-[#e0e0e0]')}
    >
      {icon}
      {label && <span>{label}</span>}
    </button>
  )
}

export const ToolSep = () => <span className="mx-1 h-5 w-px bg-[#dcdcdc]" />

export interface MenuItem {
  label?: string
  onClick?: () => void
  disabled?: boolean
  sep?: boolean
  shortcut?: string
  checked?: boolean
  icon?: ReactNode
  bold?: boolean
}

function MenuList({ items, onDone }: { items: MenuItem[]; onDone: () => void }) {
  return (
    <div className="min-w-[200px] rounded-[6px] border border-[#d6d6d6] bg-[#fbfbfb] py-1 text-[12px] shadow-xl">
      {items.map((it, i) =>
        it.sep ? (
          <div key={i} className="my-1 h-px bg-[#e3e3e3]" />
        ) : (
          <button
            key={i}
            type="button"
            disabled={it.disabled}
            onClick={() => {
              onDone()
              it.onClick?.()
            }}
            className={cx('flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-slate-800 hover:bg-[#e8eef7] disabled:text-slate-400 disabled:hover:bg-transparent', it.bold && 'font-semibold')}
          >
            <span className="flex w-4 justify-center text-slate-500">{it.checked ? <Check size={13} /> : it.icon}</span>
            <span className="flex-1">{it.label}</span>
            {it.shortcut && <span className="text-[11px] text-slate-400">{it.shortcut}</span>}
          </button>
        ),
      )}
    </div>
  )
}

/** Klassische Menüleiste (Datei, Bearbeiten, …) */
export function MenuBar({ menus }: { menus: { label: string; items: MenuItem[] }[] }) {
  const [open, setOpen] = useState<number | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (open === null) return
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  return (
    <div ref={ref} className="relative flex items-center gap-0.5 border-b border-[#ececec] bg-white px-1 text-[12px]">
      {menus.map((m, i) => (
        <div key={m.label} className="relative">
          <button
            type="button"
            className={cx('rounded px-2 py-1 text-slate-800 hover:bg-[#ebebeb]', open === i && 'bg-[#e3e3e3]')}
            onClick={() => setOpen(open === i ? null : i)}
            onMouseEnter={() => open !== null && setOpen(i)}
          >
            {m.label}
          </button>
          {open === i && (
            <div className="absolute top-full left-0 z-50 mt-0.5">
              <MenuList items={m.items} onDone={() => setOpen(null)} />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/** Kontextmenü an Mausposition (Portal in document.body) */
export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({ x: Math.min(x, window.innerWidth - r.width - 6), y: Math.min(y, window.innerHeight - r.height - 6) })
  }, [x, y])
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('mousedown', h)
    document.addEventListener('keydown', k)
    return () => {
      document.removeEventListener('mousedown', h)
      document.removeEventListener('keydown', k)
    }
  }, [onClose])
  return createPortal(
    <div ref={ref} className="fixed z-[10000]" style={{ left: pos.x, top: pos.y }} onContextMenu={(e) => e.preventDefault()}>
      <MenuList items={items} onDone={onClose} />
    </div>,
    document.body,
  )
}

/** Hook für Kontextmenü-Zustand */
export function useContextMenu<T = unknown>() {
  const [menu, setMenu] = useState<{ x: number; y: number; data: T } | null>(null)
  return {
    menu,
    open: (e: { clientX: number; clientY: number; preventDefault: () => void; stopPropagation: () => void }, data: T) => {
      e.preventDefault()
      e.stopPropagation()
      setMenu({ x: e.clientX, y: e.clientY, data })
    },
    close: () => setMenu(null),
  }
}

// ─────────────── Dialoge ───────────────

export type MsgIcon = 'error' | 'warning' | 'info' | 'question' | 'none'

export function MsgIconView({ icon, size = 30 }: { icon: MsgIcon; size?: number }) {
  if (icon === 'error') return <CircleX size={size} className="shrink-0 fill-rose-600 text-white" />
  if (icon === 'warning') return <TriangleAlert size={size} className="shrink-0 fill-amber-400 text-slate-900" />
  if (icon === 'question') return <CircleHelp size={size} className="shrink-0 fill-[#005fb8] text-white" />
  if (icon === 'info') return <Info size={size} className="shrink-0 fill-[#005fb8] text-white" />
  return null
}

/** Verschiebbarer Dialog im Desktop (Portal in die Dialog-Ebene der Sitzung) */
export function WDialog({
  title,
  onClose,
  children,
  footer,
  width = 420,
  icon,
  modal = true,
  bodyClassName,
}: {
  title: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: number
  icon?: ReactNode
  modal?: boolean
  bodyClassName?: string
}) {
  const desk = useDesk()
  const [off, setOff] = useState({ x: 0, y: 0 })
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null)
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && desk.isActive()) onClose()
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose, desk])
  const layer = desk.dialogLayer
  if (!layer) return null
  return createPortal(
    <div className={cx('pointer-events-auto absolute inset-0 flex items-center justify-center', modal ? 'bg-black/10' : 'pointer-events-none')}>
      <div
        className="pointer-events-auto flex max-h-[92%] flex-col overflow-hidden rounded-[8px] border border-[#c8c8c8] bg-[#f3f3f3] shadow-[0_12px_40px_rgba(0,0,0,0.28)]"
        style={{ width, maxWidth: '96%', transform: `translate(${off.x}px, ${off.y}px)` }}
        role="dialog"
      >
        <div
          className="flex h-8 shrink-0 cursor-default select-none items-center gap-2 pl-3 text-[12px] text-slate-800"
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest('button')) return
            drag.current = { sx: e.clientX, sy: e.clientY, ox: off.x, oy: off.y }
            ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
          }}
          onPointerMove={(e) => {
            const d = drag.current
            if (d) setOff({ x: d.ox + e.clientX - d.sx, y: d.oy + e.clientY - d.sy })
          }}
          onPointerUp={() => (drag.current = null)}
        >
          {icon}
          <span className="flex-1 truncate">{title}</span>
          <button type="button" onClick={onClose} className="flex h-8 w-11 items-center justify-center hover:bg-[#c42b1c] hover:text-white" title="Schließen">
            <X size={14} />
          </button>
        </div>
        <div className={cx('min-h-0 flex-1 overflow-auto bg-white px-4 py-3 text-[12px] text-slate-800', bodyClassName)}>{children}</div>
        {footer && <div className="flex shrink-0 justify-end gap-2 border-t border-[#e3e3e3] bg-[#f3f3f3] px-4 py-2.5">{footer}</div>}
      </div>
    </div>,
    layer,
  )
}

/** Fortschritts-Dialog (z.B. "Dienst wird gestartet…") */
export function ProgressDialog({ title, text }: { title: string; text: string }) {
  return (
    <WDialog title={title} onClose={() => {}} width={380}>
      <p className="mb-3">{text}</p>
      <div className="h-2 overflow-hidden rounded-full bg-[#e5e5e5]">
        <div className="h-full w-1/3 animate-[rdp-progress_1.1s_ease-in-out_infinite] rounded-full bg-[#005fb8]" />
      </div>
      <style>{'@keyframes rdp-progress{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}'}</style>
    </WDialog>
  )
}

// ─────────────── Anzeige-Helfer ───────────────

/** Klassische Listenansicht */
export const listCls =
  'w-full border-collapse text-left text-[12px] [&_th]:sticky [&_th]:top-0 [&_th]:z-[1] [&_th]:border-b [&_th]:border-r [&_th]:border-[#e5e5e5] [&_th]:bg-white [&_th]:px-2 [&_th]:py-1 [&_th]:font-normal [&_th]:text-slate-600 [&_th]:whitespace-nowrap [&_td]:px-2 [&_td]:py-[3px] [&_td]:whitespace-nowrap [&_td]:overflow-hidden [&_td]:text-ellipsis'

export const rowCls = (selected: boolean) => cx('cursor-default select-none', selected ? 'bg-[#cce4f7]' : 'hover:bg-[#e5f1fb]')

export function SortTh({ label, k, sort, setSort, className }: { label: string; k: string; sort: { k: string; dir: 1 | -1 }; setSort: (s: { k: string; dir: 1 | -1 }) => void; className?: string }) {
  return (
    <th className={cx('cursor-default select-none hover:bg-[#f0f0f0]', className)} onClick={() => setSort({ k, dir: sort.k === k ? (sort.dir === 1 ? -1 : 1) : 1 })}>
      {label}
      {sort.k === k && <span className="ml-1 text-[10px] text-slate-400">{sort.dir === 1 ? '▲' : '▼'}</span>}
    </th>
  )
}

export function StatusBar({ children }: { children: ReactNode }) {
  return <div className="flex h-6 shrink-0 items-center gap-4 border-t border-[#e5e5e5] bg-[#f7f7f7] px-2 text-[11px] text-slate-600">{children}</div>
}

export function TreeToggle({ open, onClick, hidden }: { open: boolean; onClick: () => void; hidden?: boolean }) {
  return (
    <button
      type="button"
      className={cx('flex h-4 w-4 shrink-0 items-center justify-center text-slate-500', hidden && 'invisible')}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
    >
      <ChevronRight size={12} className={cx('transition-transform', open && 'rotate-90')} />
    </button>
  )
}

export function Bar({ pct, warn = 90, className }: { pct: number; warn?: number; className?: string }) {
  return (
    <div className={cx('h-2.5 overflow-hidden rounded-sm border border-[#bcbcbc] bg-[#e6e6e6]', className)}>
      <div className={cx('h-full', pct >= warn ? 'bg-[#da3b01]' : 'bg-[#26a0da]')} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  )
}

export function fmtSize(mb: number | undefined): string {
  if (mb === undefined) return ''
  if (mb >= 1024 * 1024) return `${(mb / 1024 / 1024).toLocaleString('de-DE', { maximumFractionDigits: 1 })} TB`
  if (mb >= 1024) return `${(mb / 1024).toLocaleString('de-DE', { maximumFractionDigits: 1 })} GB`
  if (mb >= 1) return `${mb.toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB`
  return `${Math.max(1, Math.round(mb * 1024)).toLocaleString('de-DE')} KB`
}

export const fmtGb = (gb: number) => `${gb.toLocaleString('de-DE', { maximumFractionDigits: 2 })} GB`

export const fmtDT = (iso?: string) => (iso ? new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '')

export const fmtDTShort = (iso?: string) => (iso ? new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')

export function fmtUptime(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  return `${d}:${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

export function AppLoading() {
  return <div className="flex h-full items-center justify-center bg-white text-[12px] text-slate-500">Wird geladen …</div>
}
