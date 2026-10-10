// Gemeinsamer Rahmen der internen Musterwerk-Seiten (Intranet, Wissensdatenbank, IT-Status).

import type { ReactNode } from 'react'
import { cx } from '@/ui'
import { Link } from '../shared'
import type { PageApi } from '../types'

/** Eigenes, schlichtes Firmenzeichen der fiktiven Musterwerk AG */
export function MwLogo({ size = 30, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="7" fill="#0f766e" />
      <path d="M7 23V9.5l5.2 7.2L16 11l3.8 5.7L25 9.5V23" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="25" cy="24.5" r="1.6" fill="#99f6e4" />
    </svg>
  )
}

export interface MwNavItem {
  label: string
  href: string
  active?: boolean
}

export function MwShell({ api, section, nav, children, wide }: { api: PageApi; section: string; nav: MwNavItem[]; children: ReactNode; wide?: boolean }) {
  return (
    <div className="flex min-h-full flex-col bg-stone-50 text-slate-800">
      <header className="border-b border-teal-900/20 bg-teal-800 text-white">
        <div className={cx('mx-auto flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2.5', wide ? 'max-w-7xl' : 'max-w-6xl')}>
          <Link api={api} href="http://intranet.musterwerk.local/" className="flex items-center gap-2.5">
            <MwLogo size={28} />
            <span className="leading-tight">
              <span className="block text-sm font-semibold">Musterwerk AG</span>
              <span className="block text-[11px] text-teal-100">{section}</span>
            </span>
          </Link>
          <nav className="flex flex-wrap gap-1 text-sm">
            {nav.map((n) => (
              <Link key={n.href} api={api} href={n.href} className={cx('rounded px-2.5 py-1', n.active ? 'bg-teal-950/40 font-medium' : 'text-teal-50 hover:bg-teal-700')}>
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className={cx('mx-auto w-full flex-1 px-4 py-5', wide ? 'max-w-7xl' : 'max-w-6xl')}>{children}</main>
      <footer className="border-t border-stone-200 bg-white px-4 py-3 text-center text-[11px] text-slate-500">
        Musterwerk AG · Intranet · Nur für den internen Gebrauch · IT-Service-Desk: Durchwahl 999
      </footer>
    </div>
  )
}

export const INTRANET_NAV = (active: string): MwNavItem[] => [
  { label: 'Startseite', href: 'http://intranet.musterwerk.local/', active: active === 'home' },
  { label: 'Telefonbuch', href: 'http://intranet.musterwerk.local/telefonbuch', active: active === 'phone' },
  { label: 'Organigramm', href: 'http://intranet.musterwerk.local/organigramm', active: active === 'org' },
  { label: 'Links', href: 'http://intranet.musterwerk.local/links', active: active === 'links' },
  { label: 'Wissensdatenbank', href: 'http://kb.musterwerk.local/', active: active === 'kb' },
  { label: 'IT-Status', href: 'http://status.musterwerk.local/', active: active === 'status' },
]
