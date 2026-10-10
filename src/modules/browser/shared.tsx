// Gemeinsame Bausteine für die simulierten Webseiten.

import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react'
import { useEffect, useState, type MouseEvent, type ReactNode } from 'react'
import { useStore } from '@/core/store'
import type { ActionEntry, World } from '@/core/types'
import { cx } from '@/ui'
import type { PageApi } from './types'

export type LogEntry = Omit<ActionEntry, 'id' | 'time' | 'ticketId'>

/** Eigene Aktionstypen des Browser-Moduls (Vorschlag zur Übernahme in core/actions.ts) */
export const BA = {
  ssprReset: 'sspr.reset',
  phishingSubmitted: 'browser.phishingSubmitted',
  cloudRiskResolved: 'cloud.riskResolved',
  cloudMfaRegistered: 'cloud.mfaRegistered',
  erpLogin: 'erp.login',
} as const

/**
 * Führt eine Änderung am Weltzustand aus und liefert den Rückgabewert des Rezepts.
 * Achtung: nur primitive Werte zurückgeben (keine Draft-Objekte!).
 */
export function runWorld<T>(fn: (w: World) => T): T {
  let out!: T
  useStore.getState().updateWorld((w) => {
    out = fn(w)
  })
  return out
}

/**
 * Schreibende Aktion: Rezept ausführen; liefert es einen Fehlertext, wird NICHT protokolliert.
 * Bei Erfolg wird der Eintrag ins Aktionsprotokoll geschrieben (bewertungsrelevant).
 */
export function act(recipe: (w: World) => string | null | undefined | void, entry?: LogEntry): string | null {
  const err = runWorld((w) => recipe(w) ?? null)
  if (!err && entry) useStore.getState().log(entry)
  return err
}

export function logEntry(entry: LogEntry) {
  useStore.getState().log(entry)
}

export const toast = (text: string, kind: 'info' | 'success' | 'warning' | 'error' = 'info') => useStore.getState().toast(text, kind)

/** Seitentitel (Tab-Beschriftung) setzen */
export function useTitle(api: PageApi, title: string) {
  useEffect(() => {
    api.setTitle(title)
  }, [api, title])
}

/** Link innerhalb des simulierten Browsers (Strg/Mittelklick → neuer Tab) */
export function Link({ api, href, className, children, title }: { api: PageApi; href: string; className?: string; children: ReactNode; title?: string }) {
  const onClick = (e: MouseEvent) => {
    e.preventDefault()
    api.navigate(href, { newTab: e.ctrlKey || e.metaKey })
  }
  const onAux = (e: MouseEvent) => {
    if (e.button !== 1) return
    e.preventDefault()
    api.navigate(href, { newTab: true })
  }
  return (
    <a href={api.resolve(href)} title={title} className={className} onClick={onClick} onAuxClick={onAux}>
      {children}
    </a>
  )
}

const noticeTones = {
  info: { cls: 'border-sky-200 bg-sky-50 text-sky-900', icon: Info },
  success: { cls: 'border-emerald-200 bg-emerald-50 text-emerald-900', icon: CircleCheck },
  warning: { cls: 'border-amber-200 bg-amber-50 text-amber-900', icon: TriangleAlert },
  error: { cls: 'border-rose-200 bg-rose-50 text-rose-900', icon: CircleAlert },
}

export function Notice({ tone = 'info', title, children, className }: { tone?: keyof typeof noticeTones; title?: ReactNode; children?: ReactNode; className?: string }) {
  const t = noticeTones[tone]
  const Icon = t.icon
  return (
    <div className={cx('flex gap-2.5 rounded-md border px-3 py-2.5 text-sm', t.cls, className)} role={tone === 'error' ? 'alert' : undefined}>
      <Icon size={17} className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        {title && <div className="font-semibold">{title}</div>}
        {children && <div className={cx(title && 'mt-0.5', 'leading-relaxed')}>{children}</div>}
      </div>
    </div>
  )
}

/** Füllstandsbalken */
export function Meter({ value, max = 100, tone, className, label }: { value: number; max?: number; tone?: string; className?: string; label?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  const auto = pct >= 90 ? 'bg-rose-500' : pct >= 75 ? 'bg-amber-500' : 'bg-emerald-500'
  return (
    <div className={cx('h-2 w-full overflow-hidden rounded-full bg-slate-200', className)} title={label ?? `${Math.round(pct)} %`}>
      <div className={cx('h-full rounded-full transition-all', tone ?? auto)} style={{ width: `${pct}%` }} />
    </div>
  )
}

/** Zweistufiger Bestätigungsknopf (statt Dialog – passt auch in kleine Fenster) */
export function ConfirmButton({
  children,
  confirmText = 'Wirklich ausführen?',
  onConfirm,
  className,
  confirmClassName,
  disabled,
  icon,
}: {
  children: ReactNode
  confirmText?: ReactNode
  onConfirm: () => void
  className?: string
  confirmClassName?: string
  disabled?: boolean
  icon?: ReactNode
}) {
  const [ask, setAsk] = useState(false)
  if (!ask)
    return (
      <button type="button" disabled={disabled} className={className} onClick={() => setAsk(true)}>
        {icon}
        {children}
      </button>
    )
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-900 ring-1 ring-amber-200">
      <span>{confirmText}</span>
      <button
        type="button"
        className={cx('rounded bg-rose-600 px-2 py-0.5 font-medium text-white hover:bg-rose-700', confirmClassName)}
        onClick={() => {
          setAsk(false)
          onConfirm()
        }}
      >
        Ja
      </button>
      <button type="button" className="rounded px-2 py-0.5 font-medium text-slate-700 hover:bg-amber-100" onClick={() => setAsk(false)}>
        Abbrechen
      </button>
    </span>
  )
}

/** 404 einer Website */
export function NotFoundBlock({ api, home = '/' }: { api: PageApi; home?: string }) {
  return (
    <div className="mx-auto max-w-lg px-6 py-16 text-center">
      <div className="text-5xl font-light text-slate-300">404</div>
      <h1 className="mt-2 text-lg font-semibold text-slate-800">Seite nicht gefunden</h1>
      <p className="mt-1 text-sm text-slate-500">
        Die Seite <span className="font-mono">{api.path}</span> existiert auf {api.host} nicht.
      </p>
      <Link api={api} href={home} className="mt-4 inline-block text-sm text-sky-700 hover:underline">
        Zur Startseite
      </Link>
    </div>
  )
}

/** Einfaches Schlüssel/Wert-Raster */
export function PropGrid({ items, className }: { items: [ReactNode, ReactNode][]; className?: string }) {
  return (
    <dl className={cx('grid grid-cols-1 gap-x-6 gap-y-2 text-sm @lg:grid-cols-[minmax(9rem,auto)_1fr]', className)}>
      {items.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-xs font-medium text-slate-500 @lg:pt-0.5">{k}</dt>
          <dd className="mb-1 min-w-0 break-words text-slate-800 @lg:mb-0">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

/** URLs in Text anklickbar machen (öffnet im simulierten Browser) */
export function Linkify({ api, text }: { api: PageApi; text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>"')]+)/g)
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <Link key={i} api={api} href={p.replace(/[.,;:!?]+$/, '')} className="break-all text-sky-700 underline">
            {p}
          </Link>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  )
}

export const initials = (name: string) =>
  name
    .split(/[\s.@()-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join('')
