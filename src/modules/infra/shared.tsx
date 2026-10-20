// Gemeinsame Bausteine der Infrastruktur-Konsole

import { CircleAlert, CircleCheck, CircleX, Info, Play, RotateCw, ShieldCheck, ShieldX, Square, TriangleAlert } from 'lucide-react'
import { useCallback, type ReactNode } from 'react'
import { A } from '@/core/actions'
import { useStore } from '@/core/store'
import type { ActionEntry, EventLevel, ServiceStatus, WinEvent, WinService, World } from '@/core/types'
import { fmtDateTime } from '@/core/util'
import { Badge, Button, cx } from '@/ui'
import { SVC_ACTION_LABEL, controlServerService, eventFields, type SvcAction } from './lib'

export type LogEntry = Omit<ActionEntry, 'id' | 'time'>

class AbortAction extends Error {}

/** updateWorld mit Fehlerbehandlung: Fehlertext der Operation → Änderung verwerfen (ohne Protokolleintrag) + Toast */
export function useRun() {
  const updateWorld = useStore((s) => s.updateWorld)
  const toast = useStore((s) => s.toast)
  return useCallback(
    (recipe: (w: World) => string | null | undefined | void, entry?: LogEntry, success?: string): boolean => {
      const box: { err: string | null } = { err: null }
      try {
        updateWorld((w) => {
          const r = recipe(w)
          if (typeof r === 'string' && r) {
            box.err = r
            throw new AbortAction(r)
          }
        }, entry)
      } catch (e) {
        if (!(e instanceof AbortAction)) {
          toast(`Unerwarteter Fehler: ${(e as Error).message}`, 'error')
          return false
        }
      }
      if (box.err) {
        toast(box.err, 'error')
        return false
      }
      if (success) toast(success, 'success')
      return true
    },
    [updateWorld, toast],
  )
}

/** Dienst auf einem Server steuern; protokolliert A.serverServiceChanged (auch fehlgeschlagene Versuche, mit Ergebnis im Detail) */
export function useServiceControl() {
  const updateWorld = useStore((s) => s.updateWorld)
  const toast = useStore((s) => s.toast)
  return useCallback(
    (server: string, svc: string, action: SvcAction) => {
      const entry: LogEntry = { type: A.serverServiceChanged, target: server, detail: `${svc}: ${SVC_ACTION_LABEL[action]}` }
      const box = { ok: false, message: '' }
      updateWorld((w) => {
        const r = controlServerService(w, server, svc, action)
        box.ok = r.ok
        box.message = r.message
        if (!r.ok) entry.detail = `${svc}: ${SVC_ACTION_LABEL[action]} (fehlgeschlagen)`
      }, entry)
      toast(box.message, box.ok ? 'success' : 'error')
      return box.ok
    },
    [updateWorld, toast],
  )
}

// ─────────────── Anzeige ───────────────

export function Meter({ pct, tone, className, label }: { pct: number; tone?: 'green' | 'amber' | 'red' | 'sky' | 'slate'; className?: string; label?: string }) {
  const t = tone ?? (pct >= 90 ? 'red' : pct >= 75 ? 'amber' : 'green')
  const color = { green: 'bg-emerald-500', amber: 'bg-amber-500', red: 'bg-rose-500', sky: 'bg-sky-500', slate: 'bg-slate-400' }[t]
  return (
    <div className={cx('h-2 w-full overflow-hidden rounded-full bg-slate-200', className)} title={label ?? `${pct} %`} role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx('h-full rounded-full', color)} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  )
}

export function StatusDot({ ok, warn }: { ok: boolean; warn?: boolean }) {
  return <span className={cx('inline-block h-2.5 w-2.5 shrink-0 rounded-full', ok ? (warn ? 'bg-amber-500' : 'bg-emerald-500') : 'bg-rose-500')} />
}

export function ServiceStatusBadge({ status }: { status: ServiceStatus }) {
  return <Badge tone={status === 'Wird ausgeführt' ? 'green' : status === 'Angehalten' ? 'amber' : 'red'}>{status}</Badge>
}

export function ServiceButtons({ server, svc, size = 'sm', disabled }: { server: string; svc: WinService; size?: 'sm' | 'md'; disabled?: boolean }) {
  const control = useServiceControl()
  const running = svc.status === 'Wird ausgeführt'
  return (
    <span className="inline-flex gap-1">
      <Button size={size} icon={<Play size={12} />} disabled={disabled || running} onClick={() => control(server, svc.name, 'start')} title="Starten">
        Starten
      </Button>
      <Button size={size} icon={<Square size={12} />} disabled={disabled || !running} onClick={() => control(server, svc.name, 'stop')} title="Beenden">
        Beenden
      </Button>
      <Button size={size} icon={<RotateCw size={12} />} disabled={disabled} onClick={() => control(server, svc.name, 'restart')} title="Neu starten">
        Neu starten
      </Button>
    </span>
  )
}

export function LevelIcon({ level }: { level: EventLevel }) {
  switch (level) {
    case 'Fehler':
    case 'Kritisch':
      return <CircleX size={15} className="text-rose-600" />
    case 'Warnung':
      return <TriangleAlert size={15} className="text-amber-500" />
    case 'Überprüfung erfolgreich':
      return <ShieldCheck size={15} className="text-emerald-600" />
    case 'Überprüfung fehlgeschlagen':
      return <ShieldX size={15} className="text-rose-600" />
    default:
      return <Info size={15} className="text-sky-600" />
  }
}

/** Ereignisliste mit Detailbereich (Ereignisanzeige) */
export function EventViewer({ events, selected, onSelect, empty = 'Keine Ereignisse für den aktuellen Filter.', showLog }: { events: WinEvent[]; selected?: string; onSelect: (id: string) => void; empty?: ReactNode; showLog?: boolean }) {
  const sel = events.find((e) => e.id === selected) ?? events[0]
  return (
    <div className="grid min-h-0 gap-3 lg:grid-cols-[3fr_2fr]">
      <div className="max-h-[28rem] min-h-0 overflow-auto rounded-md border border-slate-200 bg-white">
        <table className="w-full text-left text-xs [&_td]:px-2.5 [&_td]:py-1.5 [&_th]:sticky [&_th]:top-0 [&_th]:bg-slate-50 [&_th]:px-2.5 [&_th]:py-2 [&_th]:font-medium [&_th]:text-slate-500">
          <thead>
            <tr>
              <th>Ebene</th>
              <th>Datum und Uhrzeit</th>
              <th>Quelle</th>
              <th>Ereignis-ID</th>
              <th>{showLog ? 'Protokoll' : 'Aufgabenkategorie'}</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id} className={cx('cursor-pointer border-t border-slate-100', sel?.id === e.id ? 'bg-sky-100' : 'hover:bg-slate-50')} onClick={() => onSelect(e.id)}>
                <td>
                  <span className="flex items-center gap-1.5 whitespace-nowrap">
                    <LevelIcon level={e.level} />
                    {e.level}
                  </span>
                </td>
                <td className="whitespace-nowrap">{fmtDateTime(e.time)}</td>
                <td className="max-w-48 truncate" title={e.source}>
                  {e.source}
                </td>
                <td className="font-mono">{e.eventId}</td>
                <td className="whitespace-nowrap text-slate-500">{showLog ? e.log : (e.task ?? 'Keine')}</td>
              </tr>
            ))}
            {!events.length && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-400">
                  {empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="min-h-0 overflow-auto rounded-md border border-slate-200 bg-white p-3 text-sm">
        {sel ? <EventDetail event={sel} /> : <div className="py-8 text-center text-slate-400">Kein Ereignis ausgewählt.</div>}
      </div>
    </div>
  )
}

export function EventDetail({ event }: { event: WinEvent }) {
  const fields = eventFields(event.message)
  const highlight = /Aufrufername des Computers|Arbeitsstationsname/i
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 font-medium text-slate-800">
        <LevelIcon level={event.level} /> Ereignis {event.eventId}, {event.source}
      </div>
      <pre className="whitespace-pre-wrap rounded-md bg-slate-50 p-2.5 font-sans text-[13px] leading-relaxed text-slate-800 ring-1 ring-slate-200">{event.message}</pre>
      {fields.some(([k]) => highlight.test(k)) && (
        <div className="flex items-start gap-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900 ring-1 ring-amber-200">
          <CircleAlert size={14} className="mt-0.5 shrink-0" />
          <span>
            {fields
              .filter(([k]) => highlight.test(k))
              .map(([k, v]) => `${k}: ${v}`)
              .join(' · ')}
          </span>
        </div>
      )}
      <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-slate-500">Protokollname</dt>
        <dd>{event.log}</dd>
        <dt className="text-slate-500">Quelle</dt>
        <dd>{event.source}</dd>
        <dt className="text-slate-500">Protokolliert</dt>
        <dd>{fmtDateTime(event.time)}</dd>
        <dt className="text-slate-500">Ereignis-ID</dt>
        <dd>{event.eventId}</dd>
        <dt className="text-slate-500">Aufgabenkategorie</dt>
        <dd>{event.task ?? 'Keine'}</dd>
        <dt className="text-slate-500">Ebene</dt>
        <dd>{event.level}</dd>
        <dt className="text-slate-500">Benutzer</dt>
        <dd>{event.user ?? 'Nicht zutreffend'}</dd>
        <dt className="text-slate-500">Computer</dt>
        <dd>{event.computer}</dd>
      </dl>
    </div>
  )
}

export function OkBadge({ ok, okText = 'OK', badText = 'Störung' }: { ok: boolean; okText?: string; badText?: string }) {
  return (
    <Badge tone={ok ? 'green' : 'red'}>
      {ok ? <CircleCheck size={12} /> : <CircleX size={12} />}
      {ok ? okText : badText}
    </Badge>
  )
}
