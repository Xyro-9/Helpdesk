// Fortschritt: Kennzahlen, Verlauf, Kompetenzen, Stärken/Schwächen, Abzeichen, Ergebnisliste, CSV-Export

import {
  Award,
  Brain,
  CheckCircle2,
  Clock,
  Compass,
  Download,
  Flag,
  Flame,
  GraduationCap,
  MessageCircle,
  Mountain,
  Network,
  PenLine,
  Percent,
  Phone,
  ShieldCheck,
  Star,
  Trophy,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { allScenarios } from '@/core/scenarios/engine'
import { useStore } from '@/core/store'
import { fmtDateTime } from '@/core/util'
import { ChannelIcon, Stars } from '@/modules/training/meta'
import { Badge, Button, Card, cx, EmptyState, PageHeader, Stat, Tabs, tableCls } from '@/ui'
import { openReport } from './report'
import { PercentBars, ResultChart } from './ResultChart'
import { byCategory, bySection, bySkill, computeBadges, downloadText, enrich, fileStamp, fmtDuration, frequentMisses, gradeNote, resultsCsv, SECTION_LABEL, summarize, type BadgeState } from './stats'

const BADGE_ICON: Record<BadgeState['icon'], ReactNode> = {
  flag: <Flag size={20} />,
  phone: <Phone size={20} />,
  shield: <ShieldCheck size={20} />,
  pen: <PenLine size={20} />,
  brain: <Brain size={20} />,
  network: <Network size={20} />,
  clock: <Clock size={20} />,
  star: <Star size={20} />,
  compass: <Compass size={20} />,
  mountain: <Mountain size={20} />,
  message: <MessageCircle size={20} />,
  flame: <Flame size={20} />,
}

export function ProgressView() {
  const results = useStore((s) => s.results)
  const custom = useStore((s) => s.customScenarios)
  const navigate = useStore((s) => s.navigate)
  const traineeName = useStore((s) => s.settings.traineeName)
  const scenarios = useMemo(() => allScenarios(custom), [custom])
  const list = useMemo(() => enrich(results, scenarios), [results, scenarios])
  const sum = useMemo(() => summarize(results), [results])
  const cats = useMemo(() => byCategory(list), [list])
  const skills = useMemo(() => bySkill(list), [list])
  const sections = useMemo(() => bySection(results), [results])
  const misses = useMemo(() => frequentMisses(results), [results])
  const badges = useMemo(() => computeBadges(list), [list])
  const [compTab, setCompTab] = useState<'cat' | 'skill'>('cat')
  const [filter, setFilter] = useState<'alle' | 'bestanden' | 'nicht'>('alle')

  const shown = useMemo(() => list.filter(({ r }) => filter === 'alle' || (filter === 'bestanden' ? r.passed : !r.passed)), [list, filter])
  const strongest = sections.length ? sections.reduce((a, b) => (b.avg > a.avg ? b : a)) : undefined
  const weakest = sections.length ? sections.reduce((a, b) => (b.avg < a.avg ? b : a)) : undefined
  const earnedBadges = badges.filter((b) => b.earned).length

  const exportCsv = () => downloadText(`helpdesk-ergebnisse_${traineeName.replace(/\s+/g, '-')}_${fileStamp()}.csv`, resultsCsv(list), 'text/csv;charset=utf-8')

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Fortschritt"
        subtitle={`Lernstand von ${traineeName}`}
        icon={<Trophy size={20} />}
        actions={
          <Button icon={<Download size={16} />} onClick={exportCsv} disabled={!results.length}>
            Export als CSV
          </Button>
        }
      />
      {!results.length ? (
        <div className="p-5">
          <Card>
            <EmptyState icon={<GraduationCap size={44} />} title="Noch keine Ergebnisse">
              Sobald du dein erstes Trainingsszenario abgeschlossen hast, siehst du hier deinen Verlauf, deine Stärken und gesammelte Abzeichen.
              <div className="mt-4">
                <Button variant="primary" onClick={() => navigate('training')}>
                  Zum Szenario-Katalog
                </Button>
              </div>
            </EmptyState>
          </Card>
          <BadgeGrid badges={badges} className="mt-5" />
        </div>
      ) : (
        <div className="space-y-5 p-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Absolvierte Szenarien" value={sum.count} sub={`${sum.unique} verschiedene`} tone="sky" icon={<GraduationCap size={20} />} />
            <Stat label="Ø-Ergebnis" value={`${sum.avgPercent} %`} sub={`Note ${gradeNote(gradeFor(sum.avgPercent))}`} tone="violet" icon={<Percent size={20} />} />
            <Stat label="Bestehensquote" value={`${sum.passRate} %`} sub={`${sum.passed} von ${sum.count} bestanden`} tone={sum.passRate >= 70 ? 'green' : sum.passRate >= 40 ? 'amber' : 'red'} icon={<CheckCircle2 size={20} />} />
            <Stat label="Gesamte Bearbeitungszeit" value={fmtDuration(sum.totalMin)} sub={`Ø ${Math.round(sum.totalMin / Math.max(1, sum.count))} Min. je Ticket`} tone="gray" icon={<Clock size={20} />} />
          </div>

          <Card title="Verlauf der Ergebnisse">
            <ResultChart results={results} />
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="Kompetenzen" actions={<Tabs tabs={[{ id: 'cat', label: 'Kategorien' }, { id: 'skill', label: 'Fähigkeiten' }]} value={compTab} onChange={setCompTab} className="border-0" />}>
              {compTab === 'cat' ? (
                <PercentBars rows={cats.map((c) => ({ key: c.key, value: c.avg, sub: `${c.count}× · ${c.passed} best.` }))} />
              ) : (
                <PercentBars rows={skills.slice(0, 12).map((c) => ({ key: c.key, value: c.avg, sub: `${c.count}×` }))} empty="Keine Fähigkeiten hinterlegt." />
              )}
            </Card>

            <Card title="Stärken & Schwächen">
              <div className="mb-4 grid grid-cols-2 gap-3">
                {strongest && (
                  <div className="rounded-lg bg-emerald-50 p-3 ring-1 ring-emerald-200">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-800">
                      <TrendingUp size={14} /> Stärkster Bereich
                    </div>
                    <div className="mt-1 font-semibold text-emerald-900">{strongest.label}</div>
                    <div className="text-xs text-emerald-800">Ø {strongest.avg} % der Punkte</div>
                  </div>
                )}
                {weakest && (
                  <div className="rounded-lg bg-amber-50 p-3 ring-1 ring-amber-200">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-amber-800">
                      <TrendingDown size={14} /> Ausbaufähig
                    </div>
                    <div className="mt-1 font-semibold text-amber-900">{weakest.label}</div>
                    <div className="text-xs text-amber-800">Ø {weakest.avg} % der Punkte</div>
                  </div>
                )}
              </div>
              <PercentBars rows={sections.map((s) => ({ key: s.key, label: s.label, value: s.avg }))} />
              {misses.length > 0 && (
                <div className="mt-4">
                  <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Häufig verpasste Punkte</div>
                  <ul className="space-y-1.5">
                    {misses.map((m) => (
                      <li key={m.section + m.label} className="flex items-start gap-2 text-sm">
                        <Badge tone={m.section === 'abzuege' ? 'red' : 'amber'} className="mt-0.5 shrink-0">
                          {m.count}×
                        </Badge>
                        <div className="min-w-0">
                          <div className="text-slate-800">{m.label}</div>
                          <div className="text-xs text-slate-500">
                            {SECTION_LABEL[m.section]}
                            {m.section !== 'abzuege' && ` · in ${m.count} von ${m.of} Fällen verpasst`}
                            {m.hint && ` · ${m.hint}`}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          </div>

          <BadgeGrid badges={badges} subtitle={`${earnedBadges} von ${badges.length} erreicht`} />

          <Card
            title={`Ergebnisse (${shown.length})`}
            bodyClassName="p-0"
            actions={
              <Tabs
                className="border-0"
                tabs={[
                  { id: 'alle', label: 'Alle' },
                  { id: 'bestanden', label: 'Bestanden' },
                  { id: 'nicht', label: 'Nicht bestanden' },
                ]}
                value={filter}
                onChange={setFilter}
              />
            }
          >
            <div className="overflow-x-auto">
              <table className={tableCls}>
                <thead>
                  <tr>
                    <th>Datum</th>
                    <th>Szenario</th>
                    <th>Kategorie</th>
                    <th className="text-right">Ergebnis</th>
                    <th>Note</th>
                    <th>Status</th>
                    <th className="text-right">Dauer</th>
                    <th className="text-right">Tipps</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map(({ r, sc }) => (
                    <tr key={r.evaluatedAt + r.ticketId} className="cursor-pointer hover:bg-sky-50/60" onClick={() => openReport(r)} title="Bericht anzeigen">
                      <td className="whitespace-nowrap text-slate-500">{fmtDateTime(r.evaluatedAt)}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          {sc && <ChannelIcon channel={sc.channel} size={14} className="shrink-0 text-slate-400" />}
                          <span className="font-medium text-slate-800">{r.scenarioTitle}</span>
                          {sc && <Stars value={sc.difficulty} size={11} />}
                        </div>
                        <div className="text-xs text-slate-400">{r.ticketId}</div>
                      </td>
                      <td className="text-slate-600">{sc?.category ?? '–'}</td>
                      <td className="text-right font-semibold tabular-nums">{r.percent} %</td>
                      <td className="whitespace-nowrap">
                        {gradeNote(r.grade)} <span className="text-xs text-slate-500">({r.grade})</span>
                      </td>
                      <td>{r.passed ? <Badge tone="green">bestanden</Badge> : <Badge tone="red">nicht bestanden</Badge>}</td>
                      <td className="text-right tabular-nums text-slate-600">{r.durationMin} Min.</td>
                      <td className="text-right tabular-nums text-slate-600">{r.hintsUsed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

function gradeFor(p: number) {
  if (p >= 92) return 'Sehr gut' as const
  if (p >= 81) return 'Gut' as const
  if (p >= 67) return 'Befriedigend' as const
  if (p >= 50) return 'Ausreichend' as const
  if (p >= 30) return 'Mangelhaft' as const
  return 'Ungenügend' as const
}

function BadgeGrid({ badges, subtitle, className }: { badges: BadgeState[]; subtitle?: string; className?: string }) {
  return (
    <Card
      className={className}
      title={
        <span className="flex items-center gap-2">
          <Award size={16} className="text-amber-500" /> Abzeichen {subtitle && <span className="font-normal text-slate-500">· {subtitle}</span>}
        </span>
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {badges.map((b) => (
          <div key={b.id} className={cx('flex items-start gap-3 rounded-lg border p-3', b.earned ? 'border-amber-200 bg-amber-50/60' : 'border-slate-200 bg-slate-50/50')}>
            <div className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', b.earned ? 'bg-amber-400 text-white shadow-sm' : 'bg-slate-200 text-slate-400')}>{BADGE_ICON[b.icon]}</div>
            <div className="min-w-0">
              <div className={cx('text-sm font-semibold', b.earned ? 'text-slate-900' : 'text-slate-500')}>{b.title}</div>
              <div className="text-xs text-slate-500">{b.description}</div>
              <div className={cx('mt-1 text-xs font-medium', b.earned ? 'text-amber-700' : 'text-slate-400')}>{b.earned ? 'Erreicht' : `Fortschritt: ${b.progress}`}</div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
