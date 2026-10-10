// Paketverfolgung (tracking.versand.example?nr=…): zeigt den Status einer Sendung aus world.shipments.

import { PackageCheck, PackageSearch, Truck } from 'lucide-react'
import { useState } from 'react'
import { useStore } from '@/core/store'
import type { ShipmentStatus } from '@/core/types'
import { fmtDateTime } from '@/core/util'
import { cx } from '@/ui'
import type { SiteProps } from '../SiteView'
import { Notice, useTitle } from '../shared'

const STEPS: { label: string; reached: ShipmentStatus[] }[] = [
  { label: 'Auftrag erfasst', reached: ['Beauftragt', 'Abgeholt', 'Unterwegs', 'Zugestellt', 'Problem'] },
  { label: 'Abgeholt', reached: ['Abgeholt', 'Unterwegs', 'Zugestellt'] },
  { label: 'Unterwegs', reached: ['Unterwegs', 'Zugestellt'] },
  { label: 'Zugestellt', reached: ['Zugestellt'] },
]

export function TrackingSite({ api }: SiteProps) {
  const nr = api.q('nr').trim()
  useTitle(api, nr ? `Sendung ${nr}` : 'Sendungsverfolgung')
  const shipment = useStore((s) => (nr ? s.world.shipments.find((x) => x.tracking === nr && x.status !== 'Entwurf') : undefined))
  const [input, setInput] = useState(nr)
  return (
    <div className="min-h-full bg-amber-50/40">
      <header className="flex items-center gap-2 bg-amber-500 px-4 py-3 font-semibold text-slate-900">
        <Truck size={20} /> Versand-Service · Sendungsverfolgung
      </header>
      <main className="mx-auto max-w-2xl space-y-4 p-4">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            api.navigate(`/?nr=${encodeURIComponent(input.trim())}`)
          }}
        >
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Sendungsnummer eingeben" className="h-10 min-w-0 flex-1 rounded-md border border-slate-300 px-3 font-mono text-sm focus:border-amber-500 focus:outline-none" />
          <button type="submit" className="h-10 rounded-md bg-slate-900 px-4 text-sm font-medium text-white">
            Verfolgen
          </button>
        </form>
        {nr && !shipment && (
          <Notice tone="warning" title="Keine Sendung gefunden">
            Zur Sendungsnummer „{nr}“ liegen keine Informationen vor. Bitte Nummer prüfen – neue Sendungen erscheinen erst nach der Übergabe an den Versanddienstleister.
          </Notice>
        )}
        {shipment && (
          <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              {shipment.status === 'Zugestellt' ? <PackageCheck className="text-emerald-600" size={28} /> : <PackageSearch className="text-amber-600" size={28} />}
              <div>
                <div className="font-mono text-xs text-slate-500">{shipment.tracking}</div>
                <div className="text-lg font-semibold text-slate-900">{shipment.status === 'Problem' ? 'Zustellproblem – bitte Kontakt aufnehmen' : shipment.status === 'Storniert' ? 'Sendung storniert' : shipment.status}</div>
              </div>
              <div className="ml-auto text-right text-xs text-slate-500">
                {shipment.carrier} · {shipment.service}
                <br />
                Ziel: {shipment.address.postalCode} {shipment.address.city}
              </div>
            </div>
            <ol className="grid grid-cols-4 gap-1 text-center text-[11px]">
              {STEPS.map((s) => {
                const ok = s.reached.includes(shipment.status)
                return (
                  <li key={s.label}>
                    <div className={cx('mb-1 h-1.5 rounded-full', ok ? 'bg-emerald-500' : 'bg-slate-200')} />
                    <span className={ok ? 'font-medium text-slate-800' : 'text-slate-400'}>{s.label}</span>
                  </li>
                )
              })}
            </ol>
            <ul className="space-y-1.5 border-t border-slate-100 pt-3 text-sm">
              {[...shipment.events].reverse().map((e, i) => (
                <li key={i} className="flex gap-3">
                  <span className="shrink-0 text-xs text-slate-500">{fmtDateTime(e.time)}</span>
                  <span>{e.text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </div>
  )
}
