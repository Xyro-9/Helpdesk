// Benutzerliste mit Suche und Filtern.

import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { normalize } from '@/core/util'
import { Badge, cx, tableCls } from '@/ui'
import { initials, Link } from '../shared'
import { ADMIN, Crumbs, field, PageTitle, Panel, skuName, userHref, UserBadges, type AdminCtx } from './ui'

const FILTERS = [
  ['all', 'Alle'],
  ['licensed', 'Lizenziert'],
  ['unlicensed', 'Nicht lizenziert'],
  ['blocked', 'Anmeldung blockiert'],
  ['synced', 'Synchronisiert'],
  ['cloud', 'Nur Cloud'],
  ['risky', 'Gefährdet'],
] as const
type FilterId = (typeof FILTERS)[number][0]

export function UsersList({ ctx }: { ctx: AdminCtx }) {
  const { api, world } = ctx
  const [q, setQ] = useState(api.q('q'))
  const [f, setF] = useState<FilterId>((FILTERS.find((x) => x[0] === api.q('filter'))?.[0] ?? 'all') as FilterId)
  const list = useMemo(() => {
    const n = normalize(q.trim())
    return world.cloud.users
      .filter((u) => {
        switch (f) {
          case 'licensed':
            return u.licenses.length > 0
          case 'unlicensed':
            return u.licenses.length === 0
          case 'blocked':
            return u.signInBlocked
          case 'synced':
            return u.synced
          case 'cloud':
            return !u.synced
          case 'risky':
            return u.riskState === 'gefährdet'
          default:
            return true
        }
      })
      .filter((u) => !n || normalize(`${u.displayName} ${u.upn} ${u.sam ?? ''}`).includes(n))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'de'))
  }, [world.cloud.users, q, f])
  return (
    <>
      <Crumbs api={api} items={[{ label: 'Startseite', href: `${ADMIN}/` }, { label: 'Benutzer' }]} />
      <PageTitle title="Aktive Benutzer" sub={`${world.cloud.users.length} Objekte im Verzeichnis`} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search size={14} className="absolute left-2 top-2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nach Name oder UPN suchen" className={cx(field, 'w-full pl-7')} />
        </div>
        <select value={f} onChange={(e) => setF(e.target.value as FilterId)} className={field}>
          {FILTERS.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <Panel flush>
        <div className="overflow-x-auto">
          <table className={tableCls}>
            <thead>
              <tr>
                <th>Anzeigename</th>
                <th>Benutzerprinzipalname</th>
                <th>Lizenzen</th>
                <th>Quelle</th>
              </tr>
            </thead>
            <tbody>
              {list.map((u) => (
                <tr key={u.upn} className="hover:bg-slate-50">
                  <td>
                    <Link api={api} href={userHref(u.upn)} className="flex items-center gap-2 font-medium text-indigo-700 hover:underline">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-semibold text-indigo-700">{initials(u.displayName)}</span>
                      {u.displayName}
                    </Link>
                    <div className="mt-0.5 pl-9">
                      <UserBadges cu={u} />
                    </div>
                  </td>
                  <td className="font-mono text-xs">{u.upn}</td>
                  <td className="text-xs">{u.licenses.length ? u.licenses.map((l) => skuName(world, l)).join(', ') : <span className="text-slate-400">Ohne Lizenz</span>}</td>
                  <td>{u.synced ? <Badge tone="sky">Lokales AD</Badge> : <Badge>Cloud</Badge>}</td>
                </tr>
              ))}
              {!list.length && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-sm text-slate-500">
                    Keine Benutzer gefunden. Neu angelegte AD-Konten erscheinen erst nach der nächsten Synchronisierung.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  )
}
