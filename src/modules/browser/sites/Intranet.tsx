// Intranet der Musterwerk AG: News, Telefonbuch, Organigramm, Links.

import { BookOpen, CalendarDays, Database, ExternalLink, Headset, KeyRound, Mail, Activity, Search, ShieldAlert, Truck, Utensils, Wrench, PartyPopper, Users } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { getEndpoint } from '@/core/ops/endpoint'
import { DEPARTMENTS } from '@/core/seed/company'
import { useStore } from '@/core/store'
import type { AdUser } from '@/core/types'
import { normalize } from '@/core/util'
import { cx, tableCls } from '@/ui'
import type { SiteProps } from '../SiteView'
import { Link, NotFoundBlock, useTitle } from '../shared'
import { INTRANET_NAV, MwShell } from './MwShell'

/** Nächster Samstag als lesbares Datum */
function nextWeekday(day: number) {
  const d = new Date()
  d.setDate(d.getDate() + ((day + 7 - d.getDay()) % 7 || 7))
  return d.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit' })
}

const daysBack = (n: number) => new Date(Date.now() - n * 86400000).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })

interface News {
  id: string
  title: string
  date: string
  icon: ReactNode
  tone: string
  text: ReactNode
}

function useNews(): News[] {
  return useMemo(
    () => [
      {
        id: 'phishing',
        title: 'Achtung: Gefälschte Anmeldeseiten im Umlauf',
        date: daysBack(0),
        icon: <ShieldAlert size={18} />,
        tone: 'bg-rose-100 text-rose-700',
        text: (
          <>
            Aktuell kursieren E-Mails, die zur „Bestätigung Ihres Cloud-Kontos“ oder zur Zahlung von Paketgebühren auffordern. Unsere echte Anmeldeseite lautet ausschließlich{' '}
            <strong>login.cloudadmin.example</strong>. Prüfen Sie immer die Adresse in der Adresszeile und geben Sie Ihr Kennwort niemals auf unbekannten Seiten ein. Verdächtige Mails bitte an den
            IT-Service-Desk melden.
          </>
        ),
      },
      {
        id: 'wartung',
        title: 'IT-Wartungsfenster am Wochenende',
        date: daysBack(1),
        icon: <Wrench size={18} />,
        tone: 'bg-amber-100 text-amber-700',
        text: (
          <>
            Am {nextWeekday(6)} zwischen 06:00 und 10:00 Uhr installiert die IT Sicherheitsupdates auf den Servern. ERP, Dateiserver und Drucker können in dieser Zeit kurzzeitig nicht verfügbar sein.
            Bitte speichern Sie offene Dokumente vorher.
          </>
        ),
      },
      {
        id: 'kantine',
        title: 'Kantine: Neue Salatbar und vegetarischer Mittwoch',
        date: daysBack(3),
        icon: <Utensils size={18} />,
        tone: 'bg-emerald-100 text-emerald-700',
        text: 'Ab sofort gibt es in der Kantine eine frische Salatbar. Mittwochs bieten wir zusätzlich zwei vegetarische Hauptgerichte an. Rückmeldungen nimmt das Kantinenteam gern entgegen.',
      },
      {
        id: 'ausflug',
        title: 'Betriebsausflug: Hafenrundfahrt mit Grillabend',
        date: daysBack(6),
        icon: <PartyPopper size={18} />,
        tone: 'bg-violet-100 text-violet-700',
        text: 'Der diesjährige Betriebsausflug führt uns auf eine Barkassenfahrt durch den Hafen, anschließend wird gegrillt. Anmeldung bis Monatsende bei der Personalabteilung.',
      },
    ],
    [],
  )
}

export function IntranetSite({ api }: SiteProps) {
  const p = api.segments[0] ?? ''
  if (!p) return <Home api={api} />
  if (p === 'telefonbuch') return <PhoneBook api={api} />
  if (p === 'organigramm') return <OrgChart api={api} />
  if (p === 'links') return <Links api={api} />
  return (
    <MwShell api={api} section="Intranet" nav={INTRANET_NAV('')}>
      <NotFoundBlock api={api} />
    </MwShell>
  )
}

const QUICK = [
  { label: 'MW-ERP', href: 'http://erp.musterwerk.local/', icon: Database },
  { label: 'Kennwort ändern', href: 'https://konto.musterwerk.example/', icon: KeyRound },
  { label: 'Webmail', href: 'https://mail.cloudadmin.example/', icon: Mail },
  { label: 'Wissensdatenbank', href: 'http://kb.musterwerk.local/', icon: BookOpen },
  { label: 'IT-Status', href: 'http://status.musterwerk.local/', icon: Activity },
  { label: 'Telefonbuch', href: '/telefonbuch', icon: Users },
]

function Home({ api }: { api: SiteProps['api'] }) {
  useTitle(api, 'Intranet – Startseite')
  const news = useNews()
  const world = useStore((s) => s.world)
  const user = useMemo(() => {
    const sam = getEndpoint(world, api.hostname)?.loggedOnUser
    return sam ? world.users.find((u) => u.sam === sam) : undefined
  }, [world, api.hostname])
  const hour = new Date().getHours()
  const greet = hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Guten Tag' : 'Guten Abend'
  const [q, setQ] = useState('')
  return (
    <MwShell api={api} section="Intranet" nav={INTRANET_NAV('home')}>
      <div className="grid gap-5 @4xl:grid-cols-[1fr_18rem]">
        <div className="min-w-0 space-y-4">
          <div className="rounded-lg bg-gradient-to-r from-teal-700 to-teal-600 p-5 text-white shadow-sm">
            <div className="text-lg font-semibold">
              {greet}
              {user ? `, ${user.givenName || user.displayName}` : ''}!
            </div>
            <p className="mt-1 text-sm text-teal-50">Willkommen im Intranet der Musterwerk AG.</p>
            <form
              className="mt-3 flex max-w-md gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                api.navigate(`/telefonbuch?q=${encodeURIComponent(q)}`)
              }}
            >
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Kollegen finden (Name, Abteilung …)" className="h-9 min-w-0 flex-1 rounded-md bg-white px-3 text-sm text-slate-800 focus:outline-none" />
              <button type="submit" className="flex h-9 items-center gap-1 rounded-md bg-teal-950/40 px-3 text-sm hover:bg-teal-950/60">
                <Search size={15} /> Suchen
              </button>
            </form>
          </div>
          <h2 className="pt-1 text-sm font-semibold uppercase tracking-wide text-slate-500">Neuigkeiten</h2>
          {news.map((n) => (
            <article key={n.id} className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', n.tone)}>{n.icon}</span>
                <div className="min-w-0">
                  <h3 className="font-semibold text-slate-900">{n.title}</h3>
                  <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                    <CalendarDays size={12} /> {n.date}
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-slate-700">{n.text}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
        <aside className="space-y-4">
          <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-sm font-semibold text-slate-800">Schnellzugriff</h3>
            <div className="grid grid-cols-2 gap-2">
              {QUICK.map((qk) => (
                <Link key={qk.href} api={api} href={qk.href} className="flex flex-col items-center gap-1 rounded-md border border-stone-200 p-2.5 text-center text-xs text-slate-700 hover:border-teal-300 hover:bg-teal-50">
                  <qk.icon size={18} className="text-teal-700" />
                  {qk.label}
                </Link>
              ))}
            </div>
          </section>
          <section className="rounded-lg border border-teal-200 bg-teal-50 p-4 text-sm text-teal-900">
            <div className="mb-1 flex items-center gap-2 font-semibold">
              <Headset size={16} /> IT-Service-Desk
            </div>
            <p>
              Telefon: <strong>{world.company.helpdeskPhone}</strong> (Durchwahl 999)
            </p>
            <p>E-Mail: {world.company.helpdeskMail}</p>
            <p className="mt-1 text-xs text-teal-800">Mo–Fr 7:00–18:00 Uhr. Kennwörter werden nur telefonisch nach Identitätsprüfung mitgeteilt.</p>
          </section>
          <section className="rounded-lg border border-stone-200 bg-white p-4 text-sm shadow-sm">
            <div className="mb-1 flex items-center gap-2 font-semibold text-slate-800">
              <Utensils size={15} /> Kantine heute
            </div>
            <ul className="space-y-0.5 text-slate-700">
              <li>Linsen-Dal mit Reis</li>
              <li>Hähnchenbrust mit Ofengemüse</li>
              <li>Salatbar & Obst</li>
            </ul>
          </section>
        </aside>
      </div>
    </MwShell>
  )
}

const people = (users: AdUser[]) => users.filter((u) => !u.isServiceAccount && u.enabled && u.mail)

function PhoneBook({ api }: { api: SiteProps['api'] }) {
  useTitle(api, 'Intranet – Telefonbuch')
  const users = useStore((s) => s.world.users)
  const [q, setQ] = useState(api.q('q'))
  const [dept, setDept] = useState('')
  const list = useMemo(() => {
    const needle = normalize(q.trim())
    return people(users)
      .filter((u) => !dept || u.department === dept)
      .filter((u) => !needle || normalize([u.displayName, u.department, u.title, u.phone, u.office, u.mail].join(' ')).includes(needle))
      .sort((a, b) => a.surname.localeCompare(b.surname, 'de') || a.givenName.localeCompare(b.givenName, 'de'))
  }, [users, q, dept])
  return (
    <MwShell api={api} section="Intranet" nav={INTRANET_NAV('phone')}>
      <h1 className="mb-3 text-xl font-semibold text-slate-900">Telefonbuch</h1>
      <div className="mb-3 flex flex-wrap gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, Abteilung, Durchwahl …" className="h-9 min-w-0 flex-1 rounded-md border border-stone-300 px-3 text-sm focus:border-teal-500 focus:outline-none" />
        <select value={dept} onChange={(e) => setDept(e.target.value)} className="h-9 rounded-md border border-stone-300 bg-white px-2 text-sm">
          <option value="">Alle Abteilungen</option>
          {DEPARTMENTS.map((d) => (
            <option key={d.name} value={d.name}>
              {d.name}
            </option>
          ))}
        </select>
      </div>
      <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white shadow-sm">
        <table className={tableCls}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Abteilung</th>
              <th>Telefon</th>
              <th>Raum / Standort</th>
              <th>E-Mail</th>
            </tr>
          </thead>
          <tbody>
            {list.map((u) => (
              <tr key={u.sam}>
                <td>
                  <div className="font-medium text-slate-900">{u.displayName}</div>
                  <div className="text-xs text-slate-500">{u.title}</div>
                </td>
                <td>{u.department}</td>
                <td className="whitespace-nowrap font-mono text-xs">{u.phone || '–'}</td>
                <td>{u.office || '–'}</td>
                <td className="text-xs text-teal-700">{u.mail}</td>
              </tr>
            ))}
            {!list.length && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-slate-500">
                  Keine Einträge gefunden.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">{list.length} Einträge · Änderungen an Telefonnummern bitte an die Personalabteilung melden.</p>
    </MwShell>
  )
}

function OrgChart({ api }: { api: SiteProps['api'] }) {
  useTitle(api, 'Intranet – Organigramm')
  const users = useStore((s) => s.world.users)
  const groups = useMemo(() => {
    const staff = people(users)
    return DEPARTMENTS.map((d) => {
      const members = staff.filter((u) => u.department === d.name)
      const lead = members.find((u) => !members.some((m) => m.sam === u.manager)) ?? members[0]
      return { dept: d, lead, rest: members.filter((m) => m !== lead).sort((a, b) => a.surname.localeCompare(b.surname, 'de')) }
    }).filter((g) => g.lead)
  }, [users])
  return (
    <MwShell api={api} section="Intranet" nav={INTRANET_NAV('org')}>
      <h1 className="mb-3 text-xl font-semibold text-slate-900">Organigramm</h1>
      <div className="grid gap-3 @2xl:grid-cols-2 @5xl:grid-cols-3">
        {groups.map((g) => (
          <section key={g.dept.name} className="rounded-lg border border-stone-200 bg-white shadow-sm">
            <header className="flex items-center justify-between rounded-t-lg border-b border-stone-100 bg-teal-50 px-3 py-2">
              <span className="font-semibold text-teal-900">{g.dept.name}</span>
              <span className="text-[11px] text-teal-700">{g.dept.office}</span>
            </header>
            <div className="p-3 text-sm">
              <div className="mb-2 rounded-md bg-stone-50 px-2.5 py-1.5">
                <div className="font-medium text-slate-900">{g.lead!.displayName}</div>
                <div className="text-xs text-slate-500">{g.lead!.title}</div>
              </div>
              <ul className="space-y-1 border-l-2 border-teal-100 pl-3">
                {g.rest.map((u) => (
                  <li key={u.sam}>
                    <span className="text-slate-800">{u.displayName}</span> <span className="text-xs text-slate-500">– {u.title}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ))}
      </div>
    </MwShell>
  )
}

const LINKS: { title: string; items: { label: string; href: string; desc: string; icon: typeof Database }[] }[] = [
  {
    title: 'Anwendungen',
    items: [
      { label: 'MW-ERP', href: 'http://erp.musterwerk.local/', desc: 'Aufträge, Lager, Einkauf, Finanzen', icon: Database },
      { label: 'Webmail', href: 'https://mail.cloudadmin.example/', desc: 'E-Mail im Browser', icon: Mail },
      { label: 'Sendungsverfolgung', href: 'https://tracking.versand.example/', desc: 'Pakete unseres Versanddienstleisters', icon: Truck },
    ],
  },
  {
    title: 'IT-Services',
    items: [
      { label: 'Kennwort-Portal', href: 'https://konto.musterwerk.example/', desc: 'Kennwort ändern oder zurücksetzen (Self-Service)', icon: KeyRound },
      { label: 'Wissensdatenbank', href: 'http://kb.musterwerk.local/', desc: 'Anleitungen und Lösungen der IT', icon: BookOpen },
      { label: 'IT-Status', href: 'http://status.musterwerk.local/', desc: 'Aktuelle Störungen und Wartungen', icon: Activity },
      { label: 'Cloud Admin Center', href: 'https://admin.cloudadmin.example/', desc: 'Nur für die IT-Abteilung', icon: ExternalLink },
    ],
  },
]

function Links({ api }: { api: SiteProps['api'] }) {
  useTitle(api, 'Intranet – Links')
  return (
    <MwShell api={api} section="Intranet" nav={INTRANET_NAV('links')}>
      <h1 className="mb-3 text-xl font-semibold text-slate-900">Links</h1>
      <div className="space-y-5">
        {LINKS.map((sec) => (
          <section key={sec.title}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{sec.title}</h2>
            <div className="grid gap-2 @2xl:grid-cols-2">
              {sec.items.map((l) => (
                <Link key={l.href} api={api} href={l.href} className="flex items-start gap-3 rounded-lg border border-stone-200 bg-white p-3 shadow-sm hover:border-teal-300">
                  <l.icon size={20} className="mt-0.5 shrink-0 text-teal-700" />
                  <span>
                    <span className="block font-medium text-slate-900">{l.label}</span>
                    <span className="block text-xs text-slate-500">{l.desc}</span>
                    <span className="block font-mono text-[11px] text-teal-700">{l.href}</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </MwShell>
  )
}
