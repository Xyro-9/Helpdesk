// Bewertungsbericht als Modal – global gemountet (App.tsx), zeigt den Bericht für ui.reportTicketId.

import { Check, ChevronRight, Clock, Lightbulb, RotateCcw, Trophy, X } from 'lucide-react'
import { useCallback, useMemo } from 'react'
import { create } from 'zustand'
import { getScenario } from '@/core/scenarios/engine'
import { useStore } from '@/core/store'
import type { ScoreResult, ScoreSection } from '@/core/types'
import { fmtDateTime } from '@/core/util'
import { launchScenario } from '@/modules/training/launch'
import { Badge, Button, cx, Modal } from '@/ui'
import { fmtDuration, gradeNote, IHK_SCALE } from './stats'

// Welches Ergebnis genau angezeigt werden soll (Ticket-IDs können sich nach einem Welt-Reset wiederholen)
const usePick = create<{ evaluatedAt?: string }>(() => ({}))

/** Bericht zu einem bestimmten Ergebnis öffnen (eindeutig auch nach Welt-Reset) */
export function openReport(r: ScoreResult) {
  usePick.setState({ evaluatedAt: r.evaluatedAt })
  useStore.getState().showReport(r.ticketId)
}

export function ScoreReportModal() {
  const ticketId = useStore((s) => s.ui.reportTicketId)
  if (!ticketId) return null
  return <ReportDialog ticketId={ticketId} />
}

const ratioTone = (ratio: number) => (ratio >= 0.8 ? 'bg-emerald-500' : ratio >= 0.5 ? 'bg-amber-500' : 'bg-rose-500')

function ReportDialog({ ticketId }: { ticketId: string }) {
  const ticket = useStore((s) => s.world.tickets.find((t) => t.id === ticketId))
  const results = useStore((s) => s.results)
  const custom = useStore((s) => s.customScenarios)
  const showSolution = useStore((s) => s.settings.showSolution)
  const showReport = useStore((s) => s.showReport)
  const navigate = useStore((s) => s.navigate)
  const pick = usePick((s) => s.evaluatedAt)

  const result = useMemo<ScoreResult | undefined>(() => {
    if (pick) {
      const r = results.find((x) => x.ticketId === ticketId && x.evaluatedAt === pick)
      if (r) return r
    }
    return ticket?.score ?? results.find((x) => x.ticketId === ticketId)
  }, [pick, results, ticket, ticketId])

  const close = useCallback(() => {
    usePick.setState({ evaluatedAt: undefined })
    showReport(undefined)
  }, [showReport])

  if (!result) {
    return (
      <Modal title="Bewertungsbericht" onClose={close} size="sm" footer={<Button onClick={close}>Schließen</Button>}>
        <p className="text-sm text-slate-600">Für Ticket {ticketId} liegt keine Bewertung vor.</p>
      </Modal>
    )
  }

  const scenarioExists = !!getScenario(result.scenarioId, custom)
  const note = gradeNote(result.grade)
  const ticketExists = !!ticket && ticket.score?.evaluatedAt === result.evaluatedAt

  const repeat = () => {
    close()
    launchScenario(result.scenarioId)
  }

  return (
    <Modal
      title={
        <span className="flex items-center gap-2">
          <Trophy size={18} className="text-amber-500" /> Bewertungsbericht · {result.ticketId}
        </span>
      }
      onClose={close}
      size="lg"
      footer={
        <>
          {ticketExists && (
            <Button
              variant="ghost"
              onClick={() => {
                close()
                navigate('tickets', { id: result.ticketId })
              }}
            >
              Zum Ticket
            </Button>
          )}
          <Button
            variant="secondary"
            icon={<ChevronRight size={16} />}
            onClick={() => {
              close()
              navigate('progress')
            }}
          >
            Zum Fortschritt
          </Button>
          <Button variant="secondary" icon={<RotateCcw size={16} />} onClick={repeat} disabled={!scenarioExists} title={scenarioExists ? 'Szenario erneut starten' : 'Szenario existiert nicht mehr'}>
            Szenario wiederholen
          </Button>
          <Button variant="primary" onClick={close}>
            Schließen
          </Button>
        </>
      }
    >
      {/* Kopf: Ergebnis */}
      <div className="flex flex-wrap items-center gap-5">
        <ScoreRing percent={result.percent} passed={result.passed} />
        <div className="min-w-0 flex-1">
          <div className="text-xs text-slate-500">Szenario</div>
          <div className="text-base font-semibold text-slate-900">{result.scenarioTitle}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {result.passed ? (
              <Badge tone="green">
                <Check size={12} /> Bestanden
              </Badge>
            ) : (
              <Badge tone="red">
                <X size={12} /> Nicht bestanden
              </Badge>
            )}
            <Badge tone="violet">
              Note {note} · {result.grade}
            </Badge>
            <Badge tone="gray">
              {result.earned} / {result.max} Punkte
            </Badge>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1">
              <Clock size={13} /> Dauer: {fmtDuration(result.durationMin)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Lightbulb size={13} /> Tipps genutzt: {result.hintsUsed}
            </span>
            <span>Bewertet: {fmtDateTime(result.evaluatedAt)}</span>
          </div>
          {!result.passed && result.percent >= 50 && <p className="mt-2 text-xs text-rose-700">Hinweis: Bestanden ist ein Szenario nur, wenn mindestens 50 % erreicht UND das technische Problem vollständig gelöst ist.</p>}
        </div>
      </div>

      {/* Abschnitte */}
      <div className="mt-5 space-y-4">
        {result.sections.map((s) => (
          <SectionBlock key={s.key} section={s} />
        ))}
      </div>

      {result.feedback.length > 0 && (
        <div className="mt-5 rounded-lg border border-sky-200 bg-sky-50 p-3">
          <div className="mb-1 text-sm font-semibold text-sky-900">Rückmeldung</div>
          <ul className="list-disc space-y-1 pl-5 text-sm text-sky-900">
            {result.feedback.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      {showSolution && result.solution.length > 0 && (
        <details className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 [&_summary]:cursor-pointer">
          <summary className="text-sm font-semibold text-slate-800">Musterlösung anzeigen</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-700">
            {result.solution.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </details>
      )}

      <details className="mt-3 text-xs text-slate-500 [&_summary]:cursor-pointer">
        <summary>Notenschlüssel (IHK)</summary>
        <div className="mt-2 grid grid-cols-3 gap-1 sm:grid-cols-6">
          {IHK_SCALE.map((g) => (
            <div key={g.note} className={cx('rounded border px-2 py-1 text-center', g.grade === result.grade ? 'border-violet-300 bg-violet-50 text-violet-800' : 'border-slate-200')}>
              <div className="font-semibold">Note {g.note}</div>
              <div>
                {g.from}–{g.to} %
              </div>
            </div>
          ))}
        </div>
      </details>
    </Modal>
  )
}

function ScoreRing({ percent, passed }: { percent: number; passed: boolean }) {
  const r = 34
  const c = 2 * Math.PI * r
  const p = Math.max(0, Math.min(100, percent))
  return (
    <div className="relative h-24 w-24 shrink-0" aria-label={`${percent} Prozent`}>
      <svg viewBox="0 0 80 80" className="h-24 w-24 -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="#e2e8f0" strokeWidth="7" />
        <circle cx="40" cy="40" r={r} fill="none" stroke={passed ? '#059669' : percent >= 50 ? '#d97706' : '#e11d48'} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${(p / 100) * c} ${c}`} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold tabular-nums text-slate-900">{percent}</span>
        <span className="-mt-1 text-xs text-slate-500">Prozent</span>
      </div>
    </div>
  )
}

function SectionBlock({ section: s }: { section: ScoreSection }) {
  const isPenalty = s.key === 'abzuege'
  const ratio = s.max > 0 ? s.earned / s.max : 1
  return (
    <div className="rounded-lg border border-slate-200">
      <div className="flex items-center gap-3 border-b border-slate-100 px-3 py-2">
        <div className="w-40 shrink-0 text-sm font-semibold text-slate-800">{s.label}</div>
        {isPenalty ? (
          <div className="flex-1 text-sm">{s.items.length ? <span className="font-medium text-rose-700">{s.earned} Punkte</span> : <span className="text-emerald-700">Keine Abzüge</span>}</div>
        ) : (
          <>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={Math.round(ratio * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div className={cx('h-full rounded-full', ratioTone(ratio))} style={{ width: `${Math.round(ratio * 100)}%` }} />
            </div>
            <div className="w-20 shrink-0 text-right text-sm tabular-nums text-slate-700">
              {s.earned} / {s.max}
            </div>
          </>
        )}
      </div>
      {s.items.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {s.items.map((it, i) => (
            <li key={i} className="flex items-start gap-2 px-3 py-1.5 text-sm">
              <span className={cx('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full', it.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700')} aria-label={it.ok ? 'erfüllt' : 'nicht erfüllt'}>
                {it.ok ? <Check size={11} strokeWidth={3} /> : <X size={11} strokeWidth={3} />}
              </span>
              <div className="min-w-0 flex-1">
                <div className={cx(it.ok ? 'text-slate-700' : 'text-slate-900')}>{it.label}</div>
                {it.hint && !it.ok && <div className="text-xs text-slate-500">{it.hint}</div>}
              </div>
              <span className={cx('shrink-0 tabular-nums', isPenalty ? 'text-rose-700' : it.ok ? 'text-emerald-700' : 'text-slate-400')}>{isPenalty ? it.points : `${it.points}/${it.max}`}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
