// Öffentliche Firmenwebsite (www.musterwerk.example) – kurz gehalten.

import { Cog, Leaf, MapPin, Phone, Ruler } from 'lucide-react'
import { useStore } from '@/core/store'
import { cx } from '@/ui'
import type { SiteProps } from '../SiteView'
import { Link, NotFoundBlock, useTitle } from '../shared'
import { MwLogo } from './MwShell'

const NAV = [
  ['/', 'Start'],
  ['/karriere', 'Karriere'],
  ['/kontakt', 'Kontakt'],
  ['/impressum', 'Impressum'],
] as const

export function CompanySite({ api }: SiteProps) {
  const company = useStore((s) => s.world.company)
  const page = api.segments[0] ?? ''
  useTitle(api, page ? `Musterwerk AG – ${NAV.find((n) => n[0] === `/${page}`)?.[1] ?? 'Seite'}` : 'Musterwerk AG – Präzisionsteile aus Hamburg')
  return (
    <div className="min-h-full bg-white text-slate-800">
      <header className="border-b border-slate-200">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 px-4 py-3">
          <Link api={api} href="/" className="flex items-center gap-2 font-semibold">
            <MwLogo size={30} /> Musterwerk AG
          </Link>
          <nav className="ml-auto flex gap-1 text-sm">
            {NAV.map(([href, label]) => (
              <Link key={href} api={api} href={href} className={cx('rounded px-2.5 py-1 hover:bg-slate-100', `/${page}` === href || (!page && href === '/') ? 'font-medium text-teal-700' : 'text-slate-600')}>
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        {page === '' && (
          <>
            <section className="rounded-2xl bg-gradient-to-br from-teal-800 to-slate-800 p-8 text-white">
              <h1 className="text-2xl font-bold @2xl:text-3xl">Präzisionsteile aus Hamburg.</h1>
              <p className="mt-3 max-w-xl text-teal-50">Die Musterwerk AG fertigt Dreh- und Frästeile, Baugruppen und Sonderanfertigungen für Maschinenbau und Fahrzeugtechnik – zuverlässig, termintreu und mit eigenem Werkzeugbau.</p>
            </section>
            <div className="mt-6 grid gap-4 @2xl:grid-cols-3">
              {[
                [Cog, 'Fertigung', 'Moderne CNC-Bearbeitung in zwei Hallen, Losgrößen von 1 bis 50.000.'],
                [Ruler, 'Qualität', 'Lückenlose Prüfung und Dokumentation jedes Auftrags.'],
                [Leaf, 'Nachhaltigkeit', 'Eigene Solaranlage und Kühlschmierstoff-Recycling.'],
              ].map(([Icon, t, d]) => {
                const I = Icon as typeof Cog
                return (
                  <div key={t as string} className="rounded-xl border border-slate-200 p-4">
                    <I className="text-teal-700" />
                    <div className="mt-2 font-semibold">{t as string}</div>
                    <p className="mt-1 text-sm text-slate-600">{d as string}</p>
                  </div>
                )
              })}
            </div>
          </>
        )}
        {page === 'karriere' && (
          <div className="space-y-3">
            <h1 className="text-xl font-semibold">Karriere</h1>
            <p className="text-sm text-slate-600">Wir suchen Verstärkung! Bewerbungen bitte an bewerbung@musterwerk.example.</p>
            {['Zerspanungsmechaniker/in (m/w/d)', 'Fachinformatiker/in Systemintegration – Ausbildung (m/w/d)', 'Sachbearbeiter/in Einkauf (m/w/d)'].map((j) => (
              <div key={j} className="rounded-lg border border-slate-200 p-3 text-sm font-medium">
                {j}
              </div>
            ))}
          </div>
        )}
        {page === 'kontakt' && (
          <div className="space-y-2 text-sm">
            <h1 className="text-xl font-semibold">Kontakt</h1>
            <p className="flex items-center gap-2">
              <MapPin size={16} className="text-teal-700" /> {company.legalName}, {company.address}
            </p>
            <p className="flex items-center gap-2">
              <Phone size={16} className="text-teal-700" /> {company.phone}
            </p>
            <p>E-Mail: info@musterwerk.example</p>
          </div>
        )}
        {page === 'impressum' && (
          <div className="space-y-2 text-sm text-slate-700">
            <h1 className="text-xl font-semibold text-slate-900">Impressum</h1>
            <p>
              {company.legalName}
              <br />
              {company.address}
            </p>
            <p>Vorstand: Thomas Brandt · Registergericht: Amtsgericht Hamburg (fiktiv)</p>
            <p className="text-xs text-slate-500">Dies ist eine fiktive Firma in einer Trainingssimulation.</p>
          </div>
        )}
        {!['', 'karriere', 'kontakt', 'impressum'].includes(page) && <NotFoundBlock api={api} />}
      </main>
    </div>
  )
}
