// Bausteine des Cloud Admin Centers (ruhiges, professionelles Admin-Portal).

import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import type { CloudUser, World } from '@/core/types'
import { Badge, cx } from '@/ui'
import { Link } from '../shared'
import type { PageApi } from '../types'

export interface AdminCtx {
  api: PageApi
  world: World
  me: CloudUser
  role: string
}

export const ADMIN = 'https://admin.cloudadmin.example'
export const userHref = (upn: string) => `${ADMIN}/users/${encodeURIComponent(upn)}`
export const mailboxHref = (upn: string) => `${ADMIN}/mailboxes/${encodeURIComponent(upn)}`

export function Crumbs({ api, items }: { api: PageApi; items: { label: string; href?: string }[] }) {
  return (
    <nav className="mb-2 flex flex-wrap items-center gap-1 text-xs text-slate-500">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight size={12} />}
          {it.href ? (
            <Link api={api} href={it.href} className="text-indigo-700 hover:underline">
              {it.label}
            </Link>
          ) : (
            <span>{it.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}

export function PageTitle({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {sub && <p className="mt-0.5 text-sm text-slate-500">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Panel({ title, children, actions, className, flush }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string; flush?: boolean }) {
  return (
    <section className={cx('rounded-lg border border-slate-200 bg-white shadow-sm', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={flush ? '' : 'p-4'}>{children}</div>
    </section>
  )
}

/** Befehlsleiste-Knopf */
export const cmdBtn = 'inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50'
export const cmdPrimary = 'inline-flex h-8 items-center gap-1.5 rounded-md bg-indigo-600 px-3 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50'
export const cmdDanger = 'inline-flex h-8 items-center gap-1.5 rounded-md border border-rose-300 bg-white px-2.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50'
export const field = 'h-8 rounded-md border border-slate-300 bg-white px-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20'

export function UserBadges({ cu }: { cu: CloudUser }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {cu.mailbox?.type === 'Freigegeben' && <Badge tone="violet">Freigegebenes Postfach</Badge>}
      {cu.mailbox?.type === 'Raum' && <Badge tone="violet">Raum</Badge>}
      {cu.signInBlocked && cu.mailbox?.type !== 'Freigegeben' && cu.mailbox?.type !== 'Raum' && <Badge tone="red">Anmeldung blockiert</Badge>}
      {cu.riskState === 'gefährdet' && <Badge tone="red">Gefährdet</Badge>}
      {cu.sam && !cu.signInBlocked && (!cu.mfa.methods.length || cu.mfa.requireReRegister) && <Badge tone="amber">MFA nicht registriert</Badge>}
    </span>
  )
}

export const skuName = (w: World, id: string) => w.cloud.skus.find((s) => s.id === id)?.name ?? id

export const isPerson = (cu: CloudUser) => !cu.mailbox || cu.mailbox.type === 'Benutzer'
