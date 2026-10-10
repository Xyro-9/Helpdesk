// Training & Szenarien: Katalog, Lernpfad, Zufallsszenario

import { AlertTriangle, CheckCircle2, Circle, CircleDot, Dices, GraduationCap, LayoutGrid, List, Play, Route, Search, Timer, XCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { allScenarios, CATEGORIES } from '@/core/scenarios/engine'
import type { Scenario } from '@/core/scenarios/types'
import { useStore } from '@/core/store'
import type { Channel, Ticket } from '@/core/types'
import { Badge, Button, Card, Checkbox, cx, EmptyState, IconButton, Input, Modal, PageHeader, Select, Tabs, tableCls } from '@/ui'
import { isOpenTicket, launchScenario } from './launch'
import { ChannelIcon, ChannelLabel, CHANNELS, DIFFICULTY_LABEL, Stars } from './meta'

type Status = 'neu' | 'bestanden' | 'nicht bestanden' | 'läuft'

interface Info {
  best?: number
  attempts: number
  passed: boolean
  running?: Ticket
  status: Status
}

const STATUS_BADGE: Record<Status, { tone: 'gray' | 'green' | 'red' | 'sky'; label: string }> = {
  neu: { tone: 'gray', label: 'Neu' },
  bestanden: { tone: 'green', label: 'Bestanden' },
  'nicht bestanden': { tone: 'red', label: 'Nicht bestanden' },
  läuft: { tone: 'sky', label: 'Läuft gerade' },
}

function StatusIcon({ status }: { status: Status }) {
  if (status === 'bestanden') return <CheckCircle2 size={16} className="text-emerald-600" aria-label="bestanden" />
  if (status === 'nicht bestanden') return <XCircle size={16} className="text-rose-600" aria-label="nicht bestanden" />
  if (status === 'läuft') return <CircleDot size={16} className="animate-pulse text-sky-600" aria-label="läuft" />
  return <Circle size={16} className="text-slate-300" aria-label="neu" />
}

export function TrainingView() {
  const custom = useStore((s) => s.customScenarios)
  const results = useStore((s) => s.results)
  const tickets = useStore((s) => s.world.tickets)
  const shiftActive = useStore((s) => s.world.shift.active)
  const navigate = useStore((s) => s.navigate)
  const scenarios = useMemo(() => allScenarios(custom), [custom])

  const [tab, setTab] = useState<'katalog' | 'lernpfad'>('katalog')
  const [layout, setLayout] = useState<'karten' | 'tabelle'>('karten')
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [diff, setDiff] = useState('')
  const [channel, setChannel] = useState('')
  const [onlyNew, setOnlyNew] = useState(false)
  const [confirm, setConfirm] = useState<{ sc: Scenario; ticket: Ticket } | null>(null)

  const info = useMemo(() => {
    const m = new Map<string, Info>()
    for (const sc of scenarios) m.set(sc.id, { attempts: 0, passed: false, status: 'neu' })
    for (const r of results) {
      const i = m.get(r.scenarioId)
      if (!i) continue
      i.attempts += 1
      i.best = Math.max(i.best ?? 0, r.percent)
      if (r.passed) i.passed = true
    }
    for (const t of tickets) {
      if (!t.scenarioId || !isOpenTicket(t)) continue
      const i = m.get(t.scenarioId)
      if (i && !i.running) i.running = t
    }
    for (const i of m.values()) i.status = i.running ? 'läuft' : i.passed ? 'bestanden' : i.attempts ? 'nicht bestanden' : 'neu'
    return m
  }, [scenarios, results, tickets])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return scenarios.filter((s) => {
      if (cat && s.category !== cat) return false
      if (diff && String(s.difficulty) !== diff) return false
      if (channel && s.channel !== channel) return false
      if (onlyNew && (info.get(s.id)?.attempts ?? 0) > 0) return false
      if (needle) {
        const hay = [s.title, s.summary, s.category, s.channel, ...s.skills].join(' ').toLowerCase()
        if (!hay.includes(needle)) return false
      }
      return true
    })
  }, [scenarios, q, cat, diff, channel, onlyNew, info])

  const usedCategories = useMemo(() => CATEGORIES.filter((c) => scenarios.some((s) => s.category === c)), [scenarios])
  const usedChannels = useMemo(() => CHANNELS.filter((c) => scenarios.some((s) => s.channel === c)), [scenarios])

  const requestStart = (sc: Scenario) => {
    const running = info.get(sc.id)?.running
    if (running) setConfirm({ sc, ticket: running })
    else launchScenario(sc.id)
  }

  const startRandom = () => {
    const pool = filtered.filter((s) => !info.get(s.id)?.running)
    if (!pool.length) {
      useStore.getState().toast('Kein passendes Szenario verfügbar – Filter anpassen oder offene Tickets abschließen.', 'warning')
      return
    }
    const fresh = pool.filter((s) => !info.get(s.id)?.attempts)
    const from = fresh.length ? fresh : pool
    const sc = from[Math.floor(Math.random() * from.length)]
    useStore.getState().toast(`Zufallsszenario: ${sc.title}`, 'info')
    launchScenario(sc.id)
  }

  const resetFilters = () => {
    setQ('')
    setCat('')
    setDiff('')
    setChannel('')
    setOnlyNew(false)
  }

  const passedCount = scenarios.filter((s) => info.get(s.id)?.passed).length

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Training & Szenarien"
        subtitle={`${scenarios.length} Szenarien · ${passedCount} bestanden`}
        icon={<GraduationCap size={20} />}
        actions={
          <Button variant="primary" icon={<Dices size={16} />} onClick={startRandom}>
            Zufälliges Szenario
          </Button>
        }
      />
      <div className="space-y-4 p-5">
        <div className={cx('flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 text-sm', shiftActive ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-sky-200 bg-sky-50 text-sky-900')}>
          <Timer size={18} className="shrink-0" />
          <div className="min-w-0 flex-1">
            {shiftActive ? (
              <>
                <strong>Schicht läuft:</strong> Neue Tickets kommen automatisch über alle Kanäle herein. Einzelne Szenarien kannst du trotzdem zusätzlich starten.
              </>
            ) : (
              <>
                <strong>Tipp: Schichtsimulation.</strong> Für realistischen Helpdesk-Alltag startest du in der Übersicht eine Schicht – dann treffen nacheinander mehrere Tickets per Telefon, E-Mail, Chat und Portal ein und du musst priorisieren.
              </>
            )}
          </div>
          <Button size="sm" onClick={() => navigate('dashboard')}>
            {shiftActive ? 'Schicht ansehen' : 'Schicht starten'}
          </Button>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="relative min-w-56 flex-1">
            <Search size={16} className="pointer-events-none absolute top-2.5 left-2.5 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Szenarien durchsuchen (Titel, Thema, Fähigkeit) …" className="pl-8" aria-label="Suche" />
          </div>
          <Select value={cat} onChange={(e) => setCat(e.target.value)} className="w-auto" aria-label="Kategorie">
            <option value="">Alle Kategorien</option>
            {usedCategories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
          <Select value={diff} onChange={(e) => setDiff(e.target.value)} className="w-auto" aria-label="Schwierigkeit">
            <option value="">Alle Stufen</option>
            {([1, 2, 3] as const).map((d) => (
              <option key={d} value={d}>
                Stufe {d} – {DIFFICULTY_LABEL[d]}
              </option>
            ))}
          </Select>
          <Select value={channel} onChange={(e) => setChannel(e.target.value)} className="w-auto" aria-label="Kanal">
            <option value="">Alle Kanäle</option>
            {usedChannels.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
          <div className="flex h-9 items-center px-1">
            <Checkbox label="nur unbearbeitete" checked={onlyNew} onChange={setOnlyNew} />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <Tabs
            tabs={[
              { id: 'katalog', label: <span className="flex items-center gap-1.5"><LayoutGrid size={15} /> Katalog</span>, badge: <Badge>{filtered.length}</Badge> },
              { id: 'lernpfad', label: <span className="flex items-center gap-1.5"><Route size={15} /> Lernpfad</span> },
            ]}
            value={tab}
            onChange={setTab}
            className="flex-1"
          />
          {tab === 'katalog' && (
            <div className="flex gap-1">
              <IconButton title="Kartenansicht" onClick={() => setLayout('karten')} className={cx(layout === 'karten' && 'bg-slate-200 text-slate-900')}>
                <LayoutGrid size={16} />
              </IconButton>
              <IconButton title="Tabellenansicht" onClick={() => setLayout('tabelle')} className={cx(layout === 'tabelle' && 'bg-slate-200 text-slate-900')}>
                <List size={16} />
              </IconButton>
            </div>
          )}
        </div>

        {!filtered.length ? (
          <Card>
            <EmptyState icon={<Search size={36} />} title="Keine Szenarien gefunden">
              Passe die Filter an.{' '}
              <button type="button" className="text-sky-700 underline" onClick={resetFilters}>
                Filter zurücksetzen
              </button>
            </EmptyState>
          </Card>
        ) : tab === 'lernpfad' ? (
          <LearningPath scenarios={filtered} info={info} onStart={requestStart} />
        ) : layout === 'karten' ? (
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {filtered.map((sc) => (
              <ScenarioCard key={sc.id} sc={sc} info={info.get(sc.id)!} onStart={() => requestStart(sc)} onOpen={(id) => navigate('tickets', { id })} />
            ))}
          </div>
        ) : (
          <Card bodyClassName="p-0">
            <div className="overflow-x-auto">
              <table className={tableCls}>
                <thead>
                  <tr>
                    <th></th>
                    <th>Szenario</th>
                    <th>Kategorie</th>
                    <th>Kanal</th>
                    <th>Stufe</th>
                    <th className="text-right">Bestes Ergebnis</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((sc) => {
                    const i = info.get(sc.id)!
                    return (
                      <tr key={sc.id}>
                        <td>
                          <StatusIcon status={i.status} />
                        </td>
                        <td>
                          <div className="font-medium text-slate-800">
                            {sc.title} {sc.custom && <Badge tone="violet">Eigenes</Badge>}
                          </div>
                          <div className="max-w-md truncate text-xs text-slate-500">{sc.summary}</div>
                        </td>
                        <td className="text-slate-600">{sc.category}</td>
                        <td>
                          <ChannelLabel channel={sc.channel} />
                        </td>
                        <td>
                          <Stars value={sc.difficulty} size={12} />
                        </td>
                        <td className="text-right tabular-nums">{i.best !== undefined ? `${i.best} %` : '–'}</td>
                        <td>
                          <Badge tone={STATUS_BADGE[i.status].tone}>{STATUS_BADGE[i.status].label}</Badge>
                        </td>
                        <td className="text-right">
                          <Button size="sm" variant={i.running ? 'secondary' : 'primary'} icon={<Play size={13} />} onClick={() => requestStart(sc)}>
                            Starten
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      {confirm && (
        <Modal
          title={
            <span className="flex items-center gap-2">
              <AlertTriangle size={18} className="text-amber-500" /> Szenario läuft bereits
            </span>
          }
          onClose={() => setConfirm(null)}
          size="sm"
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirm(null)}>
                Abbrechen
              </Button>
              <Button
                onClick={() => {
                  navigate('tickets', { id: confirm.ticket.id })
                  setConfirm(null)
                }}
              >
                Zum offenen Ticket
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  launchScenario(confirm.sc.id)
                  setConfirm(null)
                }}
              >
                Trotzdem starten
              </Button>
            </>
          }
        >
          <p className="text-sm text-slate-700">
            „{confirm.sc.title}“ ist bereits als Ticket <strong>{confirm.ticket.id}</strong> ({confirm.ticket.status}) offen.
          </p>
          <p className="mt-2 text-sm text-slate-600">Ein erneuter Start erzeugt ein zweites Ticket und baut den Fehler erneut in die Welt ein. Das kann die Bewertung des offenen Tickets beeinflussen. Schließe am besten zuerst das offene Ticket ab.</p>
        </Modal>
      )}
    </div>
  )
}

function ScenarioCard({ sc, info, onStart, onOpen }: { sc: Scenario; info: Info; onStart: () => void; onOpen: (ticketId: string) => void }) {
  const st = STATUS_BADGE[info.status]
  return (
    <div className={cx('flex flex-col rounded-lg border bg-white shadow-sm transition-shadow hover:shadow-md', info.status === 'läuft' ? 'border-sky-300' : 'border-slate-200')}>
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-600" title={`Kanal: ${sc.channel}`}>
          <ChannelIcon channel={sc.channel} size={15} />
        </span>
        <span className="text-xs text-slate-500">{sc.channel}</span>
        <span className="text-slate-300">·</span>
        <span className="truncate text-xs text-slate-600">{sc.category}</span>
        <span className="flex-1" />
        <Stars value={sc.difficulty} />
      </div>
      <div className="flex-1 px-4 py-3">
        <div className="flex items-start gap-2">
          <h3 className="flex-1 font-semibold text-slate-900">{sc.title}</h3>
          {sc.custom && <Badge tone="violet">Eigenes</Badge>}
        </div>
        <p className="mt-1 text-sm text-slate-600">{sc.summary}</p>
        {sc.skills.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {sc.skills.map((sk) => (
              <span key={sk} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
                {sk}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-2.5">
        <Badge tone={st.tone}>
          <StatusIcon status={info.status} />
          {st.label}
        </Badge>
        {info.best !== undefined && (
          <span className="text-xs text-slate-500">
            Bestes: <strong className="text-slate-800">{info.best} %</strong> · {info.attempts}×
          </span>
        )}
        <span className="flex-1" />
        {info.running && (
          <Button size="sm" variant="ghost" onClick={() => onOpen(info.running!.id)}>
            {info.running.id}
          </Button>
        )}
        <Button size="sm" variant={info.running ? 'secondary' : 'primary'} icon={<Play size={13} />} onClick={onStart}>
          Starten
        </Button>
      </div>
    </div>
  )
}

function LearningPath({ scenarios, info, onStart }: { scenarios: Scenario[]; info: Map<string, Info>; onStart: (sc: Scenario) => void }) {
  const levels = ([1, 2, 3] as const).map((d) => {
    const list = scenarios.filter((s) => s.difficulty === d)
    const passed = list.filter((s) => info.get(s.id)?.passed).length
    return { d, list, passed, pct: list.length ? Math.round((passed / list.length) * 100) : 0 }
  })
  const recommended = levels.find((l) => l.list.length && l.pct < 50)?.d ?? 3
  const levelText: Record<1 | 2 | 3, string> = {
    1: 'Grundlagen: Kontosperren, Dienste, einfache Anfragen. Schwerpunkt auf sauberem Ablauf und Kommunikation.',
    2: 'Systematische Fehlersuche mit Terminal, Netzwerk- und Druckerdiagnose, mehrere mögliche Ursachen.',
    3: 'Komplexe und sicherheitskritische Fälle, mehrere Systeme betroffen, Abwägung und Eskalation.',
  }
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {levels.map((l, idx) => (
        <div key={l.d} className="relative">
          <Card
            className={cx(l.d === recommended && 'ring-2 ring-sky-300')}
            title={
              <span className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-600 text-xs font-bold text-white">{l.d}</span>
                Stufe {l.d} – {DIFFICULTY_LABEL[l.d]}
              </span>
            }
            actions={l.d === recommended ? <Badge tone="sky">Empfohlen</Badge> : undefined}
          >
            <p className="text-xs text-slate-500">{levelText[l.d]}</p>
            <div className="mt-3 flex items-center gap-2">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${l.pct}%` }} />
              </div>
              <span className="text-xs tabular-nums text-slate-600">
                {l.passed}/{l.list.length} bestanden
              </span>
            </div>
            <ul className="mt-3 divide-y divide-slate-100">
              {l.list.map((sc) => {
                const i = info.get(sc.id)!
                return (
                  <li key={sc.id} className="flex items-center gap-2 py-2">
                    <StatusIcon status={i.status} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-800">{sc.title}</div>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <ChannelIcon channel={sc.channel as Channel} size={12} /> {sc.category}
                        {i.best !== undefined && <span>· {i.best} %</span>}
                      </div>
                    </div>
                    <IconButton title={`„${sc.title}“ starten`} onClick={() => onStart(sc)} className="text-sky-700 hover:bg-sky-50">
                      <Play size={15} />
                    </IconButton>
                  </li>
                )
              })}
              {!l.list.length && <li className="py-3 text-sm text-slate-400">Keine Szenarien (Filter?)</li>}
            </ul>
          </Card>
          {idx < 2 && <div className="pointer-events-none absolute top-1/2 -right-3 z-10 hidden h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-white text-slate-400 shadow ring-1 ring-slate-200 lg:flex">→</div>}
        </div>
      ))}
    </div>
  )
}
