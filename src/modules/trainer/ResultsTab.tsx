// Trainer-Modus · Ergebnisse und Aktionsprotokoll

import { Download, FileSearch, ListFilter, Search, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { allScenarios } from '@/core/scenarios/engine'
import { useStore } from '@/core/store'
import type { ActionEntry } from '@/core/types'
import { fmtDateTime } from '@/core/util'
import { openReport } from '@/modules/progress/report'
import { downloadText, enrich, fileStamp, gradeNote, resultsCsv, summarize } from '@/modules/progress/stats'
import { Badge, Button, Card, cx, EmptyState, Input, Modal, Select, tableCls } from '@/ui'
import { actionLabel, AREA_LABELS, GOOD_TYPES, SENSITIVE_TYPES } from './actionLabels'

const PAGE = 200

export function ResultsTab() {
  const results = useStore((s) => s.results)
  const custom = useStore((s) => s.customScenarios)
  const resetProgress = useStore((s) => s.resetProgress)
  const toast = useStore((s) => s.toast)
  const traineeName = useStore((s) => s.settings.traineeName)
  const scenarios = useMemo(() => allScenarios(custom), [custom])
  const list = useMemo(() => enrich(results, scenarios), [results, scenarios])
  const sum = useMemo(() => summarize(results), [results])
  const [q, setQ] = useState('')
  const [passed, setPassed] = useState('')
  const [scenario, setScenario] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [logTicket, setLogTicket] = useState('')

  const scenarioOptions = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of results) m.set(r.scenarioId, r.scenarioTitle)
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'de'))
  }, [results])

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase()
    return list.filter(({ r }) => {
      if (passed && (passed === 'ja') !== r.passed) return false
      if (scenario && r.scenarioId !== scenario) return false
      if (n && !`${r.ticketId} ${r.scenarioTitle} ${r.grade}`.toLowerCase().includes(n)) return false
      return true
    })
  }, [list, q, passed, scenario])

  return (
    <div className="space-y-5">
      <Card
        title={`Ergebnisse von ${traineeName}`}
        actions={
          <>
            <Button size="sm" icon={<Download size={14} />} disabled={!results.length} onClick={() => downloadText(`helpdesk-ergebnisse_${fileStamp()}.csv`, resultsCsv(shown), 'text/csv;charset=utf-8')}>
              CSV
            </Button>
            <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} className="text-rose-700" disabled={!results.length} onClick={() => setConfirm(true)}>
              Alle löschen
            </Button>
          </>
        }
        bodyClassName="p-0"
      >
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-slate-100 px-4 py-2 text-sm text-slate-600">
          <span>
            <strong className="text-slate-900">{sum.count}</strong> Ergebnisse ({sum.unique} Szenarien)
          </span>
          <span>
            Ø <strong className="text-slate-900">{sum.avgPercent} %</strong>
          </span>
          <span>
            Bestehensquote <strong className="text-slate-900">{sum.passRate} %</strong>
          </span>
          <span>
            Gesamtzeit <strong className="text-slate-900">{sum.totalMin} Min.</strong>
          </span>
        </div>
        <div className="flex flex-wrap gap-2 px-4 py-3">
          <div className="relative min-w-48 flex-1">
            <Search size={15} className="pointer-events-none absolute top-2.5 left-2.5 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ticket, Szenario, Note …" className="pl-8" />
          </div>
          <Select value={scenario} onChange={(e) => setScenario(e.target.value)} className="w-auto max-w-72">
            <option value="">Alle Szenarien</option>
            {scenarioOptions.map(([id, title]) => (
              <option key={id} value={id}>
                {title}
              </option>
            ))}
          </Select>
          <Select value={passed} onChange={(e) => setPassed(e.target.value)} className="w-auto">
            <option value="">Bestanden & nicht bestanden</option>
            <option value="ja">Nur bestanden</option>
            <option value="nein">Nur nicht bestanden</option>
          </Select>
        </div>
        {shown.length ? (
          <div className="max-h-96 overflow-auto">
            <table className={tableCls}>
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Ticket</th>
                  <th>Szenario</th>
                  <th className="text-right">%</th>
                  <th>Note</th>
                  <th>Status</th>
                  <th className="text-right">Dauer</th>
                  <th className="text-right">Tipps</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {shown.map(({ r, sc }) => (
                  <tr key={r.evaluatedAt + r.ticketId}>
                    <td className="whitespace-nowrap text-xs text-slate-500">{fmtDateTime(r.evaluatedAt)}</td>
                    <td className="font-mono text-xs">{r.ticketId}</td>
                    <td>
                      <div className="text-slate-800">{r.scenarioTitle}</div>
                      {sc && (
                        <div className="text-xs text-slate-400">
                          {sc.category} · {sc.channel}
                          {sc.custom ? ' · eigenes Szenario' : ''}
                        </div>
                      )}
                    </td>
                    <td className="text-right font-semibold tabular-nums">{r.percent}</td>
                    <td className="whitespace-nowrap">
                      {gradeNote(r.grade)} <span className="text-xs text-slate-500">{r.grade}</span>
                    </td>
                    <td>{r.passed ? <Badge tone="green">bestanden</Badge> : <Badge tone="red">nicht bestanden</Badge>}</td>
                    <td className="text-right tabular-nums">{r.durationMin} Min.</td>
                    <td className="text-right tabular-nums">{r.hintsUsed}</td>
                    <td className="whitespace-nowrap text-right">
                      <Button size="sm" variant="ghost" icon={<FileSearch size={13} />} onClick={() => openReport(r)}>
                        Bericht
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<ListFilter size={13} />}
                        onClick={() => {
                          setLogTicket(r.ticketId)
                          document.getElementById('trainer-actionlog')?.scrollIntoView({ behavior: 'smooth' })
                        }}
                      >
                        Protokoll
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title={results.length ? 'Keine Treffer' : 'Noch keine Ergebnisse'}>{results.length ? 'Filter anpassen.' : 'Sobald der Azubi Szenarien abschließt, erscheinen sie hier.'}</EmptyState>
        )}
      </Card>

      <ActionLog ticket={logTicket} onTicket={setLogTicket} />

      {confirm && (
        <Modal
          title="Alle Ergebnisse löschen?"
          onClose={() => setConfirm(false)}
          size="sm"
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirm(false)}>
                Abbrechen
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  resetProgress()
                  setConfirm(false)
                  toast('Alle Ergebnisse wurden gelöscht.', 'info')
                }}
              >
                Endgültig löschen
              </Button>
            </>
          }
        >
          <p className="text-sm text-slate-700">
            Alle {results.length} Bewertungsergebnisse von {traineeName} werden gelöscht. Abzeichen und Fortschrittsstatistik beginnen wieder bei null. Tipp: Vorher als CSV exportieren.
          </p>
        </Modal>
      )}
    </div>
  )
}

function ActionLog({ ticket, onTicket }: { ticket: string; onTicket: (t: string) => void }) {
  const log = useStore((s) => s.world.actionLog)
  const [area, setArea] = useState('')
  const [type, setType] = useState('')
  const [q, setQ] = useState('')
  const [limit, setLimit] = useState(PAGE)

  const ticketIds = useMemo(() => [...new Set(log.map((e) => e.ticketId).filter((x): x is string => !!x))].sort().reverse(), [log])
  const types = useMemo(() => [...new Set(log.map((e) => e.type))].filter((t) => !area || t.startsWith(area + '.')).sort(), [log, area])
  const areas = useMemo(() => [...new Set(log.map((e) => e.type.split('.')[0]))].sort(), [log])

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase()
    const out: ActionEntry[] = []
    for (let i = log.length - 1; i >= 0; i--) {
      const e = log[i]
      if (ticket === '__none' ? !!e.ticketId : ticket && e.ticketId !== ticket) continue
      if (area && !e.type.startsWith(area + '.')) continue
      if (type && e.type !== type) continue
      if (n && !`${e.type} ${actionLabel(e.type)} ${e.target ?? ''} ${e.detail ?? ''}`.toLowerCase().includes(n)) continue
      out.push(e)
    }
    return out
  }, [log, ticket, area, type, q])

  return (
    <Card title={`Aktionsprotokoll (${filtered.length} von ${log.length})`} bodyClassName="p-0">
      <div id="trainer-actionlog" className="flex flex-wrap gap-2 px-4 py-3">
        <Select
          value={ticket}
          onChange={(e) => {
            onTicket(e.target.value)
            setLimit(PAGE)
          }}
          className="w-auto"
          aria-label="Ticket"
        >
          <option value="">Alle Tickets</option>
          <option value="__none">ohne Ticketbezug</option>
          {ticketIds.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </Select>
        <Select
          value={area}
          onChange={(e) => {
            setArea(e.target.value)
            setType('')
          }}
          className="w-auto"
          aria-label="Bereich"
        >
          <option value="">Alle Bereiche</option>
          {areas.map((a) => (
            <option key={a} value={a}>
              {AREA_LABELS[a] ?? a}
            </option>
          ))}
        </Select>
        <Select value={type} onChange={(e) => setType(e.target.value)} className="w-auto max-w-64" aria-label="Aktionstyp">
          <option value="">Alle Aktionen</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {actionLabel(t)}
            </option>
          ))}
        </Select>
        <div className="relative min-w-48 flex-1">
          <Search size={15} className="pointer-events-none absolute top-2.5 left-2.5 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ziel, Detail, Befehl …" className="pl-8" />
        </div>
      </div>
      <div className="flex flex-wrap gap-3 border-t border-slate-100 px-4 py-1.5 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-emerald-500" /> gute Praxis (Identität, Bestätigung, Einverständnis …)
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-amber-500" /> sensibel (Kennwort, MFA, Schlüssel, Tipp …)
        </span>
      </div>
      {filtered.length ? (
        <div className="max-h-[32rem] overflow-auto">
          <table className={tableCls}>
            <thead>
              <tr>
                <th>Zeit</th>
                <th>Ticket</th>
                <th>Aktion</th>
                <th>Ziel</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, limit).map((e) => (
                <tr key={e.id} className={cx(SENSITIVE_TYPES.has(e.type) && 'bg-amber-50/60', GOOD_TYPES.has(e.type) && 'bg-emerald-50/50')}>
                  <td className="whitespace-nowrap text-xs tabular-nums text-slate-500">
                    {new Date(e.time).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </td>
                  <td className="font-mono text-xs">
                    {e.ticketId ? (
                      <button type="button" className="text-sky-700 hover:underline" onClick={() => onTicket(e.ticketId!)}>
                        {e.ticketId}
                      </button>
                    ) : (
                      <span className="text-slate-300">–</span>
                    )}
                  </td>
                  <td>
                    <div className="text-slate-800">{actionLabel(e.type)}</div>
                    <div className="font-mono text-[10px] text-slate-400">{e.type}</div>
                  </td>
                  <td className="max-w-48 truncate font-mono text-xs" title={e.target}>
                    {e.target ?? ''}
                  </td>
                  <td className="max-w-md truncate text-xs text-slate-600" title={e.detail}>
                    {e.detail ?? ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > limit && (
            <div className="border-t border-slate-100 p-2 text-center">
              <Button size="sm" variant="ghost" onClick={() => setLimit((l) => l + PAGE)}>
                Weitere {Math.min(PAGE, filtered.length - limit)} Einträge laden
              </Button>
            </div>
          )}
        </div>
      ) : (
        <EmptyState title="Keine Einträge">{log.length ? 'Filter anpassen.' : 'Bisher wurden keine Aktionen protokolliert.'}</EmptyState>
      )}
    </Card>
  )
}
