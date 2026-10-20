// Übersicht: Begrüßung, Kennzahlen, Schnellstart (Schicht), meine Tickets, letzte Ergebnisse, IT-Status, Tipp des Tages

import {
  AlarmClock,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  GraduationCap,
  Inbox,
  LayoutDashboard,
  Lightbulb,
  Percent,
  PhoneCall,
  Play,
  Rocket,
  Square,
  Trophy,
  UserCheck,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { printServerOk } from '@/core/ops/endpoint'
import { useStore } from '@/core/store'
import type { Infrastructure, World } from '@/core/types'
import { fmtDateTime, fmtRelative } from '@/core/util'
import { openReport } from '@/modules/progress/report'
import { avg } from '@/modules/progress/stats'
import { isOpenTicket } from '@/modules/training/launch'
import { ChannelIcon } from '@/modules/training/meta'
import { Badge, Button, Card, cx, Field, Input, PageHeader, Select, Stat } from '@/ui'

const TIPS: { title: string; text: string }[] = [
  { title: 'Erst zuhören, dann klicken', text: 'Lass Anrufende ihr Problem vollständig schildern, bevor du Lösungen vorschlägst. Notiere Fehlermeldungen wörtlich – sie sind oft der schnellste Weg zur Ursache.' },
  { title: 'Identität vor Kennwort', text: 'Kennwörter, MFA-Resets und BitLocker-Schlüssel gibt es nur nach Identitätsprüfung: Personalnummer und Geburtsdatum mit dem AD vergleichen. Eine freundliche, aber bestimmte Nachfrage schützt vor Social Engineering.' },
  { title: 'Schreib für dein zukünftiges Ich', text: 'Gute Arbeitsnotizen beantworten vier Fragen: Was war das Symptom? Was war die Ursache? Was hast du getan? Wie wurde das Ergebnis geprüft?' },
  { title: 'Priorität = Auswirkung × Dringlichkeit', text: 'Ein Drucker für eine Person ist selten P1 – ein ausgefallener Server für die ganze Halle schon. Frag nach, wie viele Personen betroffen sind und ob es einen Workaround gibt.' },
  { title: 'Fernzugriff nur mit Einverständnis', text: 'Bevor du dich auf einen fremden PC aufschaltest, frag nach: „Darf ich mich kurz auf Ihren Rechner verbinden?“ – das ist nicht nur höflich, sondern auch Datenschutz.' },
  { title: 'ipconfig /all zuerst', text: 'Bei Netzwerkproblemen bringt „ipconfig /all“ in Sekunden Klarheit: IP-Adresse, Gateway, DNS-Server und DHCP-Status. Eine 169.254er-Adresse heißt: Kein DHCP-Server erreicht.' },
  { title: 'Ursache statt Symptom', text: 'Ein entsperrtes Konto sperrt sich gleich wieder, wenn das alte Kennwort noch im Smartphone hinterlegt ist. Löse das Problem dauerhaft, nicht nur für den Moment.' },
  { title: 'Lösung bestätigen lassen', text: 'Ein Ticket ist erst dann gelöst, wenn die Benutzerin bestätigt, dass es wieder funktioniert. Frag aktiv nach, bevor du schließt.' },
  { title: 'Wissensdatenbank nutzen', text: 'Für viele Standardfälle gibt es schon einen KB-Artikel. Verknüpfe ihn mit dem Ticket – so sieht das Team, welche Anleitung geholfen hat. Und wenn es keinen gibt: Schreib einen!' },
  { title: 'Kennwörter gehören nicht ins Ticket', text: 'Weder in Arbeitsnotizen noch in E-Mails oder Chats. Ein temporäres Kennwort wird telefonisch nach Identitätsprüfung mitgeteilt und muss bei der Anmeldung geändert werden.' },
  { title: 'Eskalieren ist keine Schwäche', text: 'Wenn du nach sinnvoller Diagnose nicht weiterkommst oder dir Berechtigungen fehlen, eskaliere an den 2nd Level – mit sauberer Doku, was du schon geprüft hast.' },
  { title: 'Gruppenänderung? Neu anmelden!', text: 'Neue Gruppenmitgliedschaften wirken erst nach einer neuen Anmeldung (oder „klist purge“). Sonst wundert sich der Benutzer, dass das Netzlaufwerk immer noch fehlt.' },
  { title: 'Kleine Schritte, einzeln testen', text: 'Ändere bei der Fehlersuche immer nur eine Sache und teste danach. So weißt du am Ende genau, was die Lösung war – und kannst es dokumentieren.' },
  { title: 'SLA im Blick behalten', text: 'Sortiere deine Tickets nach Fälligkeit. Eine kurze Zwischeninfo an den Benutzer („Ich kümmere mich, melde mich bis 14 Uhr“) verschafft Luft und Vertrauen.' },
]

const ONBOARDING_KEY = 'helpdesk-trainer.onboarding-dismissed'

function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

type Light = 'green' | 'amber' | 'red'

function itStatus(w: World): { label: string; light: Light; detail: string }[] {
  const infra: Infrastructure = w.infra
  const offline = infra.servers.filter((s) => !s.online)
  const dcDown = offline.some((s) => s.name.startsWith('DC'))
  const syncAge = (Date.now() - new Date(infra.sync.lastRun).getTime()) / 60000
  const printerIssues = infra.printers.filter((p) => !['Bereit', 'Energiesparmodus'].includes(p.status))
  const psOk = printServerOk(w)
  const queuesDown = infra.printQueues.filter((q) => q.status !== 'Bereit')
  return [
    {
      label: 'Server',
      light: offline.length === 0 ? 'green' : dcDown || offline.length > 1 ? 'red' : 'amber',
      detail: offline.length === 0 ? `Alle ${infra.servers.length} Server online` : `Offline: ${offline.map((s) => s.name).join(', ')}`,
    },
    {
      label: 'Internet',
      light: !infra.internetUp ? 'red' : !infra.proxy.online || !infra.dnsForwardersOk ? 'amber' : 'green',
      detail: !infra.internetUp ? 'Internetleitung gestört' : !infra.proxy.online ? 'Proxy nicht erreichbar' : !infra.dnsForwardersOk ? 'Externe DNS-Auflösung gestört' : 'Leitung, Proxy und DNS in Ordnung',
    },
    {
      label: 'Druckserver',
      light: !psOk ? 'red' : queuesDown.length || printerIssues.length ? 'amber' : 'green',
      detail: !psOk
        ? 'PRINT01 bzw. Druckwarteschlange nicht verfügbar'
        : queuesDown.length
          ? `Warteschlange gestört: ${queuesDown.map((q) => q.name).join(', ')}`
          : printerIssues.length
            ? `Geräte melden: ${printerIssues.map((p) => `${p.name} (${p.status})`).join(', ')}`
            : 'Alle Warteschlangen bereit',
    },
    {
      label: 'Cloud-Sync',
      light: !infra.sync.enabled || infra.sync.errors.length ? 'red' : syncAge > infra.sync.intervalMin * 2 ? 'amber' : 'green',
      detail: !infra.sync.enabled ? 'Synchronisierung deaktiviert' : infra.sync.errors.length ? `${infra.sync.errors.length} Fehler beim letzten Lauf` : `Letzter Lauf ${fmtRelative(infra.sync.lastRun)}`,
    },
    {
      label: 'VPN-Gateway',
      light: infra.vpnGateway.online ? 'green' : 'red',
      detail: infra.vpnGateway.online ? `${infra.vpnGateway.activeSessions.length} aktive Sitzung(en)` : 'Gateway nicht erreichbar',
    },
  ]
}

const LIGHT_CLS: Record<Light, string> = { green: 'bg-emerald-500', amber: 'bg-amber-400', red: 'bg-rose-500' }
const LIGHT_TEXT: Record<Light, string> = { green: 'OK', amber: 'Warnung', red: 'Störung' }

export function DashboardView() {
  const world = useStore((s) => s.world)
  const results = useStore((s) => s.results)
  const traineeName = useStore((s) => s.settings.traineeName)
  const navigate = useStore((s) => s.navigate)
  const startShift = useStore((s) => s.startShift)
  const stopShift = useStore((s) => s.stopShift)
  const now = useNow()

  const [difficulty, setDifficulty] = useState<0 | 1 | 2 | 3>(0)
  const [count, setCount] = useState(5)
  const [interval, setIntervalMin] = useState(4)
  const [tipIndex, setTipIndex] = useState(() => {
    const d = new Date()
    const day = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86_400_000)
    return day % TIPS.length
  })
  const [onboardingHidden, setOnboardingHidden] = useState(() => {
    try {
      return localStorage.getItem(ONBOARDING_KEY) === '1'
    } catch {
      return false
    }
  })

  const { tickets, mails, calls, shift } = world
  const kpi = useMemo(() => {
    const open = tickets.filter((t) => isOpenTicket(t) && !t.tags.includes('anruf-ausstehend'))
    const mine = open.filter((t) => t.assignee === 'trainee')
    const overdue = open.filter((t) => new Date(t.slaResolveDue).getTime() < now)
    return {
      open: open.length,
      mine,
      overdue: overdue.length,
      unread: mails.filter((m) => m.folder === 'Posteingang' && !m.read).length,
      ringing: calls.filter((c) => c.state === 'klingelt').length,
      activeCalls: calls.filter((c) => c.state === 'aktiv' || c.state === 'gehalten').length,
    }
  }, [tickets, mails, calls, now])

  const myTop = useMemo(() => [...kpi.mine].sort((a, b) => a.slaResolveDue.localeCompare(b.slaResolveDue)).slice(0, 5), [kpi.mine])
  const avgPercent = results.length ? Math.round(avg(results.map((r) => r.percent))) : undefined
  const uniqueDone = useMemo(() => new Set(results.map((r) => r.scenarioId)).size, [results])
  const status = useMemo(() => itStatus(world), [world])
  const hour = new Date(now).getHours()
  const greeting = hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Hallo' : 'Guten Abend'
  const firstName = traineeName.split(' ')[0]
  const tip = TIPS[tipIndex]
  const showOnboarding = results.length === 0 && !onboardingHidden

  const hideOnboarding = () => {
    setOnboardingHidden(true)
    try {
      localStorage.setItem(ONBOARDING_KEY, '1')
    } catch {
      /* ohne Speicher – nur für diese Sitzung ausgeblendet */
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader title="Übersicht" subtitle={`${world.company.legalName} · IT-Service-Desk`} icon={<LayoutDashboard size={20} />} />
      <div className="space-y-5 p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">
              {greeting}, {firstName}! 👋
            </h2>
            <p className="text-sm text-slate-500">
              {kpi.open ? `${kpi.open} offene${kpi.open === 1 ? 's Ticket' : ' Tickets'} im Service Desk` : 'Keine offenen Tickets – Zeit für ein Trainingsszenario.'}
              {kpi.ringing > 0 && <span className="ml-2 font-medium text-emerald-700">· 📞 {kpi.ringing} Anruf{kpi.ringing > 1 ? 'e' : ''} klingelt!</span>}
            </p>
          </div>
        </div>

        {showOnboarding && <Onboarding onClose={hideOnboarding} onStart={() => navigate('training')} />}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          <KpiButton onClick={() => navigate('tickets')}>
            <Stat label="Offene Tickets" value={kpi.open} tone="sky" icon={<ClipboardList size={20} />} />
          </KpiButton>
          <KpiButton onClick={() => navigate('tickets')}>
            <Stat label="Meine Tickets" value={kpi.mine.length} tone="blue" icon={<UserCheck size={20} />} />
          </KpiButton>
          <KpiButton onClick={() => navigate('tickets')}>
            <Stat label="SLA überfällig" value={kpi.overdue} tone={kpi.overdue ? 'red' : 'green'} icon={<AlarmClock size={20} />} />
          </KpiButton>
          <KpiButton onClick={() => navigate('mail')}>
            <Stat label="Ungelesene Mails" value={kpi.unread} tone={kpi.unread ? 'amber' : 'gray'} icon={<Inbox size={20} />} />
          </KpiButton>
          <KpiButton onClick={() => navigate('phone')}>
            <Stat label="Aktive Anrufe" value={kpi.activeCalls + kpi.ringing} sub={kpi.ringing ? `${kpi.ringing} klingelt` : undefined} tone={kpi.ringing ? 'green' : 'gray'} icon={<PhoneCall size={20} />} />
          </KpiButton>
          <KpiButton onClick={() => navigate('progress')}>
            <Stat label="Ø-Punktzahl" value={avgPercent !== undefined ? `${avgPercent} %` : '–'} tone="violet" icon={<Percent size={20} />} />
          </KpiButton>
          <KpiButton onClick={() => navigate('progress')}>
            <Stat label="Absolvierte Szenarien" value={results.length} sub={results.length ? `${uniqueDone} verschiedene` : undefined} tone="green" icon={<Trophy size={20} />} />
          </KpiButton>
        </div>

        <div className="grid gap-5 xl:grid-cols-3">
          {/* Schnellstart */}
          <Card
            title={
              <span className="flex items-center gap-2">
                <Rocket size={16} className="text-sky-600" /> Schnellstart
              </span>
            }
          >
            {shift.active ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900 ring-1 ring-emerald-200">
                  <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500" />
                  <span>
                    <strong>Schicht läuft</strong> seit {fmtRelative(shift.startedAt).replace('vor ', '')}
                  </span>
                </div>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <dt className="text-slate-500">Tickets</dt>
                  <dd className="font-medium">
                    {shift.spawned.length} / {shift.maxTickets}
                  </dd>
                  <dt className="text-slate-500">Schwierigkeit</dt>
                  <dd className="font-medium">{shift.difficulty === 0 ? 'gemischt' : `Stufe ${shift.difficulty}`}</dd>
                  <dt className="text-slate-500">Nächstes Ticket</dt>
                  <dd className="font-medium">{shift.nextArrivalAt ? fmtRelative(shift.nextArrivalAt) : 'keine weiteren'}</dd>
                </dl>
                <Button variant="danger" icon={<Square size={14} />} onClick={stopShift} className="w-full">
                  Schicht beenden
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-slate-600">Simuliere eine Schicht: Tickets treffen in zufälligen Abständen über alle Kanäle ein.</p>
                <div className="grid grid-cols-3 gap-2">
                  <Field label="Schwierigkeit">
                    <Select value={difficulty} onChange={(e) => setDifficulty(Number(e.target.value) as 0 | 1 | 2 | 3)}>
                      <option value={0}>gemischt</option>
                      <option value={1}>Stufe 1</option>
                      <option value={2}>Stufe 2</option>
                      <option value={3}>Stufe 3</option>
                    </Select>
                  </Field>
                  <Field label="Anzahl Tickets">
                    <Input type="number" min={1} max={30} value={count} onChange={(e) => setCount(Math.max(1, Math.min(30, Number(e.target.value) || 1)))} />
                  </Field>
                  <Field label="Abstand (Min.)">
                    <Input type="number" min={1} max={60} value={interval} onChange={(e) => setIntervalMin(Math.max(1, Math.min(60, Number(e.target.value) || 1)))} />
                  </Field>
                </div>
                <Button
                  variant="primary"
                  icon={<Play size={14} />}
                  className="w-full"
                  onClick={() => {
                    startShift(difficulty, count, interval)
                    useStore.getState().toast('Schicht gestartet – das erste Ticket kommt gleich.', 'success')
                  }}
                >
                  Schicht starten
                </Button>
              </div>
            )}
            <div className="mt-4 border-t border-slate-100 pt-3">
              <Button icon={<GraduationCap size={15} />} className="w-full" onClick={() => navigate('training')}>
                Einzelnes Szenario starten
              </Button>
            </div>
          </Card>

          {/* Meine Tickets */}
          <Card
            title={
              <span className="flex items-center gap-2">
                <UserCheck size={16} className="text-sky-600" /> Meine Tickets
              </span>
            }
            actions={
              <Button size="sm" variant="ghost" onClick={() => navigate('tickets')}>
                Alle <ArrowRight size={13} />
              </Button>
            }
            bodyClassName="p-0"
          >
            {myTop.length ? (
              <ul className="divide-y divide-slate-100">
                {myTop.map((t) => {
                  const due = new Date(t.slaResolveDue).getTime()
                  const overdue = due < now
                  const soon = !overdue && due - now < 10 * 60_000
                  return (
                    <li key={t.id}>
                      <button type="button" onClick={() => navigate('tickets', { id: t.id })} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50">
                        <ChannelIcon channel={t.channel} size={15} className="shrink-0 text-slate-400" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-slate-800">{t.title}</div>
                          <div className="text-xs text-slate-500">
                            {t.id} · {t.priority} · {t.status}
                          </div>
                        </div>
                        <Badge tone={overdue ? 'red' : soon ? 'amber' : 'gray'}>{overdue ? 'überfällig' : fmtRelative(t.slaResolveDue)}</Badge>
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <div className="px-4 py-8 text-center text-sm text-slate-500">
                Dir sind keine offenen Tickets zugewiesen.
                <br />
                <button type="button" className="mt-1 text-sky-700 underline" onClick={() => navigate('tickets')}>
                  Tickets ansehen und übernehmen
                </button>
              </div>
            )}
          </Card>

          {/* Letzte Ergebnisse */}
          <Card
            title={
              <span className="flex items-center gap-2">
                <Trophy size={16} className="text-amber-500" /> Letzte Ergebnisse
              </span>
            }
            actions={
              <Button size="sm" variant="ghost" onClick={() => navigate('progress')}>
                Fortschritt <ArrowRight size={13} />
              </Button>
            }
            bodyClassName="p-0"
          >
            {results.length ? (
              <ul className="divide-y divide-slate-100">
                {results.slice(0, 5).map((r) => (
                  <li key={r.evaluatedAt + r.ticketId}>
                    <button type="button" onClick={() => openReport(r)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50">
                      <span className={cx('flex h-9 w-12 shrink-0 items-center justify-center rounded-md text-sm font-bold tabular-nums', r.passed ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700')}>{r.percent}%</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-slate-800">{r.scenarioTitle}</div>
                        <div className="text-xs text-slate-500">
                          {r.grade} · {fmtDateTime(r.evaluatedAt)}
                        </div>
                      </div>
                      {r.passed ? <CheckCircle2 size={16} className="text-emerald-600" aria-label="bestanden" /> : <X size={16} className="text-rose-600" aria-label="nicht bestanden" />}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-4 py-8 text-center text-sm text-slate-500">Noch keine Szenarien abgeschlossen.</div>
            )}
          </Card>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="IT-Status">
            <ul className="space-y-2.5">
              {status.map((s) => (
                <li key={s.label} className="flex items-center gap-3">
                  <span className="flex shrink-0 gap-1 rounded-full bg-slate-800 px-1.5 py-1" aria-label={`${s.label}: ${LIGHT_TEXT[s.light]}`}>
                    {(['red', 'amber', 'green'] as Light[]).map((l) => (
                      <span key={l} className={cx('h-2.5 w-2.5 rounded-full', s.light === l ? LIGHT_CLS[l] : 'bg-slate-600')} />
                    ))}
                  </span>
                  <span className="w-28 shrink-0 text-sm font-medium text-slate-800">{s.label}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-500" title={s.detail}>
                    {s.detail}
                  </span>
                  <Badge tone={s.light === 'green' ? 'green' : s.light === 'amber' ? 'amber' : 'red'}>{LIGHT_TEXT[s.light]}</Badge>
                </li>
              ))}
            </ul>
            <div className="mt-3 text-right">
              <Button size="sm" variant="ghost" onClick={() => navigate('infra')}>
                Zur Infrastruktur <ArrowRight size={13} />
              </Button>
            </div>
          </Card>

          <Card
            title={
              <span className="flex items-center gap-2">
                <Lightbulb size={16} className="text-amber-500" /> Tipp des Tages
              </span>
            }
            actions={
              <>
                <button type="button" title="Vorheriger Tipp" aria-label="Vorheriger Tipp" className="rounded p-1 text-slate-500 hover:bg-slate-100" onClick={() => setTipIndex((i) => (i - 1 + TIPS.length) % TIPS.length)}>
                  <ChevronLeft size={16} />
                </button>
                <span className="text-xs tabular-nums text-slate-400">
                  {tipIndex + 1}/{TIPS.length}
                </span>
                <button type="button" title="Nächster Tipp" aria-label="Nächster Tipp" className="rounded p-1 text-slate-500 hover:bg-slate-100" onClick={() => setTipIndex((i) => (i + 1) % TIPS.length)}>
                  <ChevronRight size={16} />
                </button>
              </>
            }
          >
            <div className="text-base font-semibold text-slate-900">{tip.title}</div>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">{tip.text}</p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="ghost" icon={<BookOpen size={14} />} onClick={() => navigate('kb')}>
                Wissensdatenbank
              </Button>
              <Button size="sm" variant="ghost" onClick={() => navigate('help')}>
                Hilfe & Leitfäden
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

function KpiButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-lg text-left transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60 [&>div]:h-full">
      {children}
    </button>
  )
}

function Onboarding({ onClose, onStart }: { onClose: () => void; onStart: () => void }) {
  const steps = [
    { n: 1, title: 'Szenario starten', text: 'Wähle im Bereich „Training“ ein Szenario der Stufe 1 – oder starte eine Schicht.', icon: <GraduationCap size={18} /> },
    { n: 2, title: 'Ticket übernehmen', text: 'Nimm den Anruf an bzw. öffne das Ticket und klicke auf „Übernehmen“. Setze Kategorie und Priorität.', icon: <ClipboardList size={18} /> },
    { n: 3, title: 'Problem lösen', text: 'Nutze AD-Konsole, Remote-Desktop, PowerShell und Wissensdatenbank. Frag beim Benutzer nach.', icon: <Lightbulb size={18} /> },
    { n: 4, title: 'Dokumentieren & schließen', text: 'Arbeitsnotizen schreiben, Lösung bestätigen lassen, Abschlusscode wählen – dann kommt deine Bewertung.', icon: <CheckCircle2 size={18} /> },
  ]
  return (
    <div className="relative overflow-hidden rounded-xl border border-sky-200 bg-gradient-to-br from-sky-50 via-white to-emerald-50 p-5 shadow-sm">
      <button type="button" onClick={onClose} className="absolute top-3 right-3 rounded p-1 text-slate-400 hover:bg-white hover:text-slate-700" title="Ausblenden" aria-label="Einführung ausblenden">
        <X size={16} />
      </button>
      <div className="text-lg font-semibold text-slate-900">Willkommen im Service Desk der Musterwerk AG!</div>
      <p className="mt-1 max-w-3xl text-sm text-slate-600">
        Hier übst du den Alltag im 1st-Level-Support – mit echten Abläufen, aber ohne Risiko. Alle Personen und Systeme sind erfunden. So startest du in vier Schritten:
      </p>
      <ol className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {steps.map((s) => (
          <li key={s.n} className="flex gap-3 rounded-lg bg-white/80 p-3 ring-1 ring-slate-200">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-600 text-sm font-bold text-white">{s.n}</span>
            <div>
              <div className="flex items-center gap-1.5 font-medium text-slate-900">
                <span className="text-sky-600">{s.icon}</span>
                {s.title}
              </div>
              <div className="mt-0.5 text-xs leading-relaxed text-slate-600">{s.text}</div>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="primary" icon={<Play size={14} />} onClick={onStart}>
          Erstes Szenario auswählen
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Später
        </Button>
      </div>
    </div>
  )
}
