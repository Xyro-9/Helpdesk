// Schlichtes SVG-Liniendiagramm der Prozentwerte (chronologisch, je Ergebnis ein Punkt)

import { useMemo, useState } from 'react'
import type { ScoreResult } from '@/core/types'
import { fmtDateTime } from '@/core/util'

const W = 640
const H = 220
const M = { l: 40, r: 16, t: 14, b: 30 }
const IW = W - M.l - M.r
const IH = H - M.t - M.b

export function ResultChart({ results, max = 40 }: { results: ScoreResult[]; max?: number }) {
  // results: neueste zuerst → chronologisch umdrehen
  const data = useMemo(() => [...results].reverse().slice(-max), [results, max])
  const [hover, setHover] = useState<number | null>(null)
  const n = data.length
  const x = (i: number) => M.l + (n <= 1 ? IW / 2 : (i / (n - 1)) * IW)
  const y = (p: number) => M.t + ((100 - Math.max(0, Math.min(100, p))) / 100) * IH
  const path = data.map((r, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(r.percent).toFixed(1)}`).join(' ')
  const ticks = n <= 1 ? [0] : n === 2 ? [0, 1] : [0, Math.floor((n - 1) / 2), n - 1]
  const h = hover !== null ? data[hover] : undefined

  if (!n) return <div className="py-8 text-center text-sm text-slate-500">Noch keine Ergebnisse.</div>

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Verlauf der letzten ${n} Ergebnisse in Prozent`} onMouseLeave={() => setHover(null)}>
        {/* Raster */}
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line x1={M.l} x2={W - M.r} y1={y(v)} y2={y(v)} stroke={v === 50 ? '#94a3b8' : '#e2e8f0'} strokeWidth={1} strokeDasharray={v === 50 ? '4 4' : undefined} />
            <text x={M.l - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#64748b">
              {v} %
            </text>
          </g>
        ))}
        <text x={W - M.r} y={y(50) - 5} textAnchor="end" fontSize="10" fill="#64748b">
          Bestehensgrenze
        </text>
        {/* X-Achse */}
        {ticks.map((i) => (
          <text key={i} x={x(i)} y={H - 8} textAnchor={n > 1 && i === 0 ? 'start' : n > 1 && i === n - 1 ? 'end' : 'middle'} fontSize="11" fill="#64748b">
            {new Date(data[i].evaluatedAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
          </text>
        ))}
        {/* Fadenkreuz */}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={M.t} y2={M.t + IH} stroke="#cbd5e1" strokeWidth={1} />}
        {/* Linie */}
        {n > 1 && <path d={path} fill="none" stroke="#0284c7" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
        {/* Punkte */}
        {data.map((r, i) => (
          <circle key={r.evaluatedAt + i} cx={x(i)} cy={y(r.percent)} r={hover === i ? 6 : 4.5} fill={r.passed ? '#059669' : '#e11d48'} stroke="#fff" strokeWidth={2} />
        ))}
        {/* Trefferflächen */}
        {data.map((r, i) => (
          <rect
            key={'hit' + r.evaluatedAt + i}
            x={x(i) - (n <= 1 ? IW / 2 : IW / (n - 1) / 2)}
            y={M.t}
            width={n <= 1 ? IW : IW / (n - 1)}
            height={IH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}
      </svg>
      {h && hover !== null && (
        <div
          className="pointer-events-none absolute z-10 w-56 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-lg"
          style={{ left: `${(x(hover) / W) * 100}%`, top: `${(y(h.percent) / H) * 100}%`, transform: `translate(${x(hover) / W > 0.75 ? '-90%' : x(hover) / W < 0.25 ? '-10%' : '-50%'}, calc(-100% - 10px))` }}
        >
          <div className="font-medium text-slate-900">{h.scenarioTitle}</div>
          <div className="text-slate-600">
            {h.percent} % · {h.grade} · {h.passed ? '✓ bestanden' : '✗ nicht bestanden'}
          </div>
          <div className="text-slate-400">{fmtDateTime(h.evaluatedAt)}</div>
        </div>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-4 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" /> bestanden
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-600" /> nicht bestanden
        </span>
        {results.length > max && <span>Es werden die letzten {max} von {results.length} Ergebnissen gezeigt.</span>}
      </div>
    </div>
  )
}

/** Horizontale Balken (0–100 %) mit Beschriftung */
export function PercentBars({ rows, empty }: { rows: { key: string; label?: string; value: number; sub?: string }[]; empty?: string }) {
  if (!rows.length) return <div className="py-4 text-sm text-slate-500">{empty ?? 'Keine Daten.'}</div>
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.key} className="text-sm">
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <span className="truncate text-slate-700">{r.label ?? r.key}</span>
            <span className="shrink-0 tabular-nums text-slate-600">
              <span className="font-semibold text-slate-900">{r.value} %</span>
              {r.sub && <span className="ml-1.5 text-xs text-slate-400">{r.sub}</span>}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-sky-500" style={{ width: `${Math.max(2, r.value)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}
