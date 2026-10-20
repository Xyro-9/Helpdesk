// Startseite des Cloud Admin Centers: Kennzahlen und Schnellzugriffe.

import { KeyRound, MailWarning, RefreshCw, ShieldAlert, Users } from 'lucide-react'
import { useMemo } from 'react'
import { skuUsage } from '@/core/ops/cloud'
import { fmtRelative } from '@/core/util'
import { Link } from '../shared'
import { ADMIN, isPerson, PageTitle, Panel, type AdminCtx } from './ui'

export function Home({ ctx }: { ctx: AdminCtx }) {
  const { api, world, me } = ctx
  const stats = useMemo(() => {
    const people = world.cloud.users.filter(isPerson)
    return {
      users: people.length,
      blocked: people.filter((u) => u.signInBlocked).length,
      unlicensed: people.filter((u) => !u.licenses.length && u.sam).length,
      risky: world.cloud.users.filter((u) => u.riskState === 'gefährdet').length,
      quarantine: world.cloud.quarantine.filter((q) => !q.released && !q.deleted).length,
    }
  }, [world])
  const tiles = [
    { label: 'Benutzer', value: stats.users, sub: `${stats.blocked} blockiert · ${stats.unlicensed} ohne Lizenz`, href: '/users', icon: Users, tone: 'text-indigo-600 bg-indigo-50' },
    { label: 'Gefährdete Benutzer', value: stats.risky, sub: stats.risky ? 'Handlungsbedarf!' : 'Keine Auffälligkeiten', href: '/security?tab=risky', icon: ShieldAlert, tone: stats.risky ? 'text-rose-600 bg-rose-50' : 'text-emerald-600 bg-emerald-50' },
    { label: 'Quarantäne', value: stats.quarantine, sub: 'Nachrichten warten auf Prüfung', href: '/security', icon: MailWarning, tone: 'text-amber-600 bg-amber-50' },
    { label: 'Synchronisierung', value: fmtRelative(world.infra.sync.lastRun), sub: world.infra.sync.errors.length ? `${world.infra.sync.errors.length} Fehlermeldung(en)` : 'Letzter Lauf', href: '/sync', icon: RefreshCw, tone: world.infra.sync.errors.length ? 'text-amber-600 bg-amber-50' : 'text-sky-600 bg-sky-50' },
  ]
  return (
    <>
      <PageTitle title={`Willkommen, ${me.displayName}`} sub={`Mandant ${world.cloud.name} · ${world.cloud.domain}`} />
      <div className="grid gap-3 @2xl:grid-cols-2 @6xl:grid-cols-4">
        {tiles.map((t) => (
          <Link key={t.label} api={api} href={`${ADMIN}${t.href}`} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:border-indigo-300">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${t.tone}`}>
              <t.icon size={20} />
            </span>
            <span className="min-w-0">
              <span className="block text-xs text-slate-500">{t.label}</span>
              <span className="block text-xl font-semibold text-slate-900">{t.value}</span>
              <span className="block truncate text-xs text-slate-500">{t.sub}</span>
            </span>
          </Link>
        ))}
      </div>
      <div className="mt-4 grid gap-4 @4xl:grid-cols-2">
        <Panel title="Lizenzen" actions={<Link api={api} href={`${ADMIN}/licenses`} className="text-xs text-indigo-700 hover:underline">Alle anzeigen</Link>}>
          <ul className="space-y-2 text-sm">
            {world.cloud.skus.map((s) => {
              const used = skuUsage(world, s.id)
              return (
                <li key={s.id} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <KeyRound size={14} className="text-slate-400" /> {s.name}
                  </span>
                  <span className={s.total - used <= 0 ? 'font-medium text-rose-700' : 'text-slate-600'}>
                    {s.total - used} von {s.total} frei
                  </span>
                </li>
              )
            })}
          </ul>
        </Panel>
        <Panel title="Häufige Aufgaben">
          <div className="grid gap-2 text-sm @xl:grid-cols-2">
            {[
              ['Kennwort zurücksetzen', '/users'],
              ['MFA-Methoden zurücksetzen', '/users'],
              ['Lizenz zuweisen', '/licenses'],
              ['Postfachberechtigung vergeben', '/mailboxes'],
              ['Quarantäne prüfen', '/security'],
              ['Synchronisierungsstatus', '/sync'],
            ].map(([l, h]) => (
              <Link key={l} api={api} href={`${ADMIN}${h}`} className="rounded-md border border-slate-200 px-3 py-2 hover:border-indigo-300 hover:bg-indigo-50">
                {l}
              </Link>
            ))}
          </div>
        </Panel>
      </div>
    </>
  )
}
