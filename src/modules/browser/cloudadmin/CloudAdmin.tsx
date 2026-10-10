// Cloud Admin Center (admin.cloudadmin.example): Rahmen, Anmeldeprüfung, Navigation, Routing.

import { CloudCog, KeyRound, LayoutDashboard, LogOut, Mail, RefreshCw, Search, ShieldCheck, ShieldX, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { findCloudUser } from '@/core/ops/cloud'
import { useStore } from '@/core/store'
import { cx } from '@/ui'
import { adminRole } from '../auth'
import { setSession, useSession } from '../session'
import type { SiteProps } from '../SiteView'
import { initials, Link, NotFoundBlock, useTitle } from '../shared'
import { CLOUD_LOGIN_URL } from '../url'
import { Home } from './Home'
import { LicenseDetail, Licenses } from './Licenses'
import { MailboxDetail, Mailboxes } from './Mailboxes'
import { Security } from './Security'
import { Sync } from './Sync'
import { ADMIN, type AdminCtx } from './ui'
import { UserDetail } from './UserDetail'
import { UsersList } from './Users'

const NAV = [
  { id: '', label: 'Startseite', icon: LayoutDashboard },
  { id: 'users', label: 'Benutzer', icon: Users },
  { id: 'mailboxes', label: 'E-Mail-Verwaltung', icon: Mail },
  { id: 'licenses', label: 'Lizenzen', icon: KeyRound },
  { id: 'security', label: 'Sicherheit', icon: ShieldCheck },
  { id: 'sync', label: 'Synchronisierung', icon: RefreshCw },
]

export function CloudAdminSite({ api }: SiteProps) {
  const session = useSession(api.hostname, 'cloud')
  const world = useStore((s) => s.world)
  const me = session ? findCloudUser(world, session.user) : undefined
  const revoked = !!me && !!session && !!me.sessionsRevokedAt && Date.parse(me.sessionsRevokedAt) > session.at
  const valid = !!me && !me.signInBlocked && !revoked
  const role = me ? adminRole(world, me) : null
  const [q, setQ] = useState('')
  useTitle(api, 'Cloud Admin Center')

  useEffect(() => {
    if (!session) api.navigate(`${CLOUD_LOGIN_URL}?ru=${encodeURIComponent(api.href)}`, { replace: true })
  }, [session, api])

  const relogin = () => {
    setSession(api.hostname, 'cloud')
    api.navigate(`${CLOUD_LOGIN_URL}?ru=${encodeURIComponent(api.href)}`)
  }

  if (!session) return null
  if (!valid || !me)
    return (
      <div className="mx-auto max-w-md px-6 py-16 text-center">
        <ShieldX size={40} className="mx-auto text-slate-400" />
        <h1 className="mt-3 text-lg font-semibold text-slate-800">Ihre Sitzung ist abgelaufen</h1>
        <p className="mt-1 text-sm text-slate-600">{revoked ? 'Ihre Anmeldesitzungen wurden widerrufen.' : 'Ihr Konto kann sich derzeit nicht anmelden.'} Bitte melden Sie sich erneut an.</p>
        <button type="button" onClick={relogin} className="mt-4 rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
          Erneut anmelden
        </button>
      </div>
    )
  if (!role)
    return (
      <div className="mx-auto max-w-md px-6 py-16 text-center">
        <ShieldX size={40} className="mx-auto text-rose-400" />
        <h1 className="mt-3 text-lg font-semibold text-slate-800">Kein Zugriff</h1>
        <p className="mt-1 text-sm text-slate-600">Das Konto {me.upn} besitzt keine Administratorrolle für das Cloud Admin Center.</p>
        <button type="button" onClick={relogin} className="mt-4 rounded-md border border-slate-300 px-4 py-1.5 text-sm hover:bg-slate-50">
          Mit anderem Konto anmelden
        </button>
      </div>
    )

  const ctx: AdminCtx = { api, world, me, role }
  const [s0, s1] = api.segments
  let page
  if (!s0) page = <Home ctx={ctx} />
  else if (s0 === 'users') page = s1 ? <UserDetail ctx={ctx} upn={s1} /> : <UsersList ctx={ctx} />
  else if (s0 === 'mailboxes') page = s1 ? <MailboxDetail ctx={ctx} upn={s1} /> : <Mailboxes ctx={ctx} />
  else if (s0 === 'licenses') page = s1 ? <LicenseDetail ctx={ctx} skuId={s1} /> : <Licenses ctx={ctx} />
  else if (s0 === 'security') page = <Security ctx={ctx} />
  else if (s0 === 'sync') page = <Sync ctx={ctx} />
  else page = <NotFoundBlock api={api} home={`${ADMIN}/`} />

  return (
    <div className="flex h-full flex-col bg-slate-50 text-slate-800">
      <header className="flex h-11 shrink-0 items-center gap-3 bg-slate-900 px-3 text-white">
        <CloudCog size={20} className="text-indigo-300" />
        <Link api={api} href={`${ADMIN}/`} className="whitespace-nowrap text-sm font-semibold">
          Cloud Admin Center
        </Link>
        <span className="hidden rounded bg-white/10 px-2 py-0.5 text-[11px] text-slate-200 @xl:inline">Musterwerk AG</span>
        <form
          className="ml-auto hidden max-w-xs flex-1 @3xl:flex"
          onSubmit={(e) => {
            e.preventDefault()
            api.navigate(`${ADMIN}/users?q=${encodeURIComponent(q)}`)
          }}
        >
          <div className="relative w-full">
            <Search size={14} className="absolute left-2 top-1.5 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Benutzer suchen" className="h-7 w-full rounded bg-white/10 pl-7 pr-2 text-xs text-white placeholder:text-slate-400 focus:bg-white/20 focus:outline-none" />
          </div>
        </form>
        <div className="ml-auto flex items-center gap-2 @3xl:ml-0">
          <span className="hidden text-right text-[11px] leading-tight text-slate-300 @2xl:block">
            {me.displayName}
            <br />
            <span className="text-slate-400">{role}</span>
          </span>
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-500 text-[11px] font-semibold">{initials(me.displayName)}</span>
          <button type="button" title="Abmelden" onClick={() => { setSession(api.hostname, 'cloud'); api.navigate(CLOUD_LOGIN_URL) }} className="rounded p-1 hover:bg-white/10">
            <LogOut size={15} />
          </button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <nav className="w-12 shrink-0 overflow-y-auto border-r border-slate-200 bg-white py-2 @3xl:w-52">
          {NAV.map((n) => {
            const active = (s0 ?? '') === n.id
            return (
              <Link key={n.id} api={api} href={`${ADMIN}/${n.id}`} title={n.label} className={cx('mx-1.5 mb-0.5 flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm', active ? 'bg-indigo-50 font-medium text-indigo-800' : 'text-slate-700 hover:bg-slate-100')}>
                <n.icon size={17} className={cx('shrink-0', active ? 'text-indigo-600' : 'text-slate-500')} />
                <span className="hidden truncate @3xl:inline">{n.label}</span>
              </Link>
            )
          })}
        </nav>
        <main className="min-w-0 flex-1 overflow-y-auto p-4 @3xl:p-6">{page}</main>
      </div>
    </div>
  )
}
