// App-Rahmen: Seitenleiste, Kopfleiste, Inhaltsbereich, globale Einblendungen

import {
  BookOpen,
  Boxes,
  Building2,
  ClipboardList,
  GraduationCap,
  HelpCircle,
  Inbox,
  LayoutDashboard,
  Globe,
  MessageSquare,
  Monitor,
  Network,
  Phone,
  ShieldCheck,
  SquareTerminal,
  Trophy,
  Truck,
  Users,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStore, type ViewId } from '@/core/store'
import { cx } from '@/ui'
import { fmtRelative } from '@/core/util'

interface NavItem {
  id: ViewId
  label: string
  icon: ReactNode
  badge?: number
  alert?: boolean
}

function useBadges() {
  return useStore(
    useShallow((s) => ({
      openTickets: s.world.tickets.filter((t) => !t.historical && !t.tags.includes('anruf-ausstehend') && !['Gelöst', 'Geschlossen'].includes(t.status)).length,
      unreadMail: s.world.mails.filter((m) => m.folder === 'Posteingang' && !m.read).length,
      unreadChat: s.world.chats.reduce((a, c) => a + (c.open ? c.unread : 0), 0),
      ringing: s.world.calls.filter((c) => c.state === 'klingelt').length,
      activeCalls: s.world.calls.filter((c) => c.state === 'aktiv' || c.state === 'gehalten').length,
      rdp: s.ui.rdpSessions.length,
    })),
  )
}

export function Sidebar() {
  const view = useStore((s) => s.ui.view)
  const navigate = useStore((s) => s.navigate)
  const b = useBadges()
  const sections: { title: string; items: NavItem[] }[] = [
    {
      title: 'Arbeitsplatz',
      items: [
        { id: 'dashboard', label: 'Übersicht', icon: <LayoutDashboard size={18} /> },
        { id: 'tickets', label: 'Tickets', icon: <ClipboardList size={18} />, badge: b.openTickets },
        { id: 'mail', label: 'E-Mail', icon: <Inbox size={18} />, badge: b.unreadMail },
        { id: 'chat', label: 'Chat', icon: <MessageSquare size={18} />, badge: b.unreadChat },
        { id: 'phone', label: 'Telefon', icon: <Phone size={18} />, badge: b.ringing + b.activeCalls, alert: b.ringing > 0 },
      ],
    },
    {
      title: 'Werkzeuge',
      items: [
        { id: 'ad', label: 'Active Directory', icon: <Users size={18} /> },
        { id: 'rdp', label: 'Remote-Desktop', icon: <Monitor size={18} />, badge: b.rdp },
        { id: 'browser', label: 'Webbrowser', icon: <Globe size={18} /> },
        { id: 'powershell', label: 'Admin-PowerShell', icon: <SquareTerminal size={18} /> },
        { id: 'infra', label: 'Infrastruktur', icon: <Network size={18} /> },
      ],
    },
    {
      title: 'Verwaltung',
      items: [
        { id: 'assets', label: 'Inventar', icon: <Boxes size={18} /> },
        { id: 'shipping', label: 'Versand', icon: <Truck size={18} /> },
        { id: 'kb', label: 'Wissensdatenbank', icon: <BookOpen size={18} /> },
      ],
    },
    {
      title: 'Ausbildung',
      items: [
        { id: 'training', label: 'Training & Szenarien', icon: <GraduationCap size={18} /> },
        { id: 'progress', label: 'Fortschritt', icon: <Trophy size={18} /> },
        { id: 'trainer', label: 'Trainer-Modus', icon: <ShieldCheck size={18} /> },
        { id: 'help', label: 'Hilfe', icon: <HelpCircle size={18} /> },
      ],
    },
  ]
  return (
    <nav className="flex h-full w-56 shrink-0 flex-col bg-slate-900 text-slate-300">
      <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500 text-white">
          <Building2 size={18} />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold text-white">Helpdesk-Trainer</div>
          <div className="text-[11px] text-slate-400">Musterwerk AG · Service Desk</div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {sections.map((sec) => (
          <div key={sec.title} className="mb-2">
            <div className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{sec.title}</div>
            {sec.items.map((it) => (
              <button
                key={it.id}
                type="button"
                onClick={() => navigate(it.id)}
                className={cx('flex w-full items-center gap-2.5 px-4 py-1.5 text-left text-sm transition-colors', view === it.id ? 'bg-slate-800 text-white' : 'hover:bg-slate-800/60 hover:text-white')}
              >
                <span className={cx(it.alert && 'animate-pulse text-emerald-400')}>{it.icon}</span>
                <span className="flex-1">{it.label}</span>
                {!!it.badge && <span className={cx('rounded-full px-1.5 text-[11px] font-semibold', it.alert ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-200')}>{it.badge}</span>}
              </button>
            ))}
          </div>
        ))}
      </div>
    </nav>
  )
}

function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000)
    return () => clearInterval(t)
  }, [])
  return <span className="tabular-nums">{now.toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
}

export function Topbar() {
  const { activeTicketId, ticketTitle, shift, trainee, navigate } = useStore(
    useShallow((s) => {
      const t = s.activeTicketId ? s.world.tickets.find((x) => x.id === s.activeTicketId) : undefined
      return { activeTicketId: s.activeTicketId, ticketTitle: t?.title, shift: s.world.shift, trainee: s.settings.traineeName, navigate: s.navigate }
    }),
  )
  return (
    <header className="flex h-11 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 text-sm">
      {activeTicketId ? (
        <button type="button" onClick={() => navigate('tickets', { id: activeTicketId })} className="flex min-w-0 items-center gap-2 rounded-md bg-sky-50 px-2.5 py-1 text-sky-800 ring-1 ring-sky-200 hover:bg-sky-100">
          <ClipboardList size={15} />
          <span className="font-medium">{activeTicketId}</span>
          <span className="truncate text-sky-700">{ticketTitle}</span>
        </button>
      ) : (
        <span className="text-slate-400">Kein Ticket in Bearbeitung</span>
      )}
      <div className="flex-1" />
      {shift.active && (
        <span className="flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1 text-xs text-emerald-800 ring-1 ring-emerald-200">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          Schicht läuft · {shift.spawned.length}/{shift.maxTickets} Tickets{shift.nextArrivalAt ? ` · nächstes ${fmtRelative(shift.nextArrivalAt)}` : ''}
        </span>
      )}
      <span className="text-slate-500">
        <Clock />
      </span>
      <span className="flex items-center gap-2 text-slate-700">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-600 text-xs font-semibold text-white">
          {trainee
            .split(' ')
            .map((p) => p[0])
            .join('')
            .slice(0, 2)
            .toUpperCase()}
        </span>
        <span className="hidden md:inline">{trainee}</span>
      </span>
    </header>
  )
}

export function Toasts() {
  const toasts = useStore((s) => s.ui.toasts)
  const dismiss = useStore((s) => s.dismissToast)
  return (
    <div className="pointer-events-none fixed top-14 right-4 z-[60] flex w-80 flex-col gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismiss(t.id)}
          className={cx(
            'pointer-events-auto rounded-lg px-3 py-2 text-left text-sm shadow-lg ring-1',
            t.kind === 'success' && 'bg-emerald-50 text-emerald-900 ring-emerald-200',
            t.kind === 'error' && 'bg-rose-50 text-rose-900 ring-rose-200',
            t.kind === 'warning' && 'bg-amber-50 text-amber-900 ring-amber-200',
            t.kind === 'info' && 'bg-white text-slate-800 ring-slate-200',
          )}
        >
          {t.text}
        </button>
      ))}
    </div>
  )
}
