// Versandetikett-Vorschau (druckbar). Barcode = rein dekorative CSS-Streifen aus der Sendungsnummer.

import { Printer } from 'lucide-react'
import { useMemo } from 'react'
import { useStore } from '@/core/store'
import type { Shipment } from '@/core/types'
import { fmtDate, hashString } from '@/core/util'
import { Button, Modal } from '@/ui'
import { companySender, WEIGHT_KG } from './helpers'

const PRINT_CSS = `@media print {
  body * { visibility: hidden !important; }
  #mw-versandetikett, #mw-versandetikett * { visibility: visible !important; }
  #mw-versandetikett { position: fixed; left: 0; top: 0; margin: 0; box-shadow: none !important; }
}`

function Barcode({ code }: { code: string }) {
  const bars = useMemo(() => {
    const out: { w: number; dark: boolean }[] = [
      { w: 2, dark: true },
      { w: 1, dark: false },
      { w: 2, dark: true },
      { w: 2, dark: false },
    ]
    for (const ch of code) {
      const v = hashString(ch + code.length) ^ ch.charCodeAt(0)
      for (let i = 0; i < 4; i++) out.push({ w: 1 + ((v >> (i * 2)) & 3) % 3, dark: i % 2 === 0 })
    }
    out.push({ w: 2, dark: false }, { w: 2, dark: true }, { w: 1, dark: false }, { w: 2, dark: true })
    return out
  }, [code])
  return (
    <div className="flex h-16 items-stretch justify-center" aria-label={`Barcode ${code}`}>
      {bars.map((b, i) => (
        <div key={i} style={{ width: b.w * 2 }} className={b.dark ? 'bg-black' : 'bg-white'} />
      ))}
    </div>
  )
}

export function ShippingLabelModal({ shipment: sh, onClose }: { shipment: Shipment; onClose: () => void }) {
  const world = useStore((s) => s.world)
  const assets = world.assets
  const company = companySender(world)
  const user = sh.recipientSam ? world.users.find((u) => u.sam === sh.recipientSam) : undefined
  const party = { name: sh.recipientName, street: sh.address.street, postalCode: sh.address.postalCode, city: sh.address.city, country: sh.address.country, phone: user?.mobile ?? user?.phone }
  const from = sh.direction === 'Ausgehend' ? { ...company, phone: world.company.helpdeskPhone } : party
  const to = sh.direction === 'Ausgehend' ? party : { ...company, phone: world.company.helpdeskPhone }
  const weight = sh.items.reduce((sum, tag) => {
    const a = assets.find((x) => x.tag === tag)
    return sum + (a ? WEIGHT_KG[a.type] : 1)
  }, 0.4)
  const code = sh.tracking ?? sh.id

  return (
    <Modal
      title={`Versandetikett ${sh.id}`}
      onClose={onClose}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Schließen
          </Button>
          <Button variant="primary" icon={<Printer size={16} />} onClick={() => window.print()}>
            Drucken
          </Button>
        </>
      }
    >
      <style>{PRINT_CSS}</style>
      <div className="flex justify-center">
        <div id="mw-versandetikett" className="w-[380px] border-2 border-black bg-white font-sans text-black shadow-md">
          <div className="flex items-center justify-between border-b-2 border-black px-3 py-2">
            <div className="text-2xl font-black tracking-tight">{sh.carrier}</div>
            <div className="text-right">
              <div className="text-sm font-bold uppercase">{sh.service}</div>
              <div className="text-[10px]">{sh.direction === 'Rücksendung' ? 'RETOURE' : 'PAKET'}</div>
            </div>
          </div>
          <div className="border-b border-black px-3 py-2 text-[11px] leading-snug">
            <div className="font-semibold uppercase">Absender</div>
            <div>{from.name}</div>
            <div>{from.street}</div>
            <div>
              {from.postalCode} {from.city}
            </div>
          </div>
          <div className="border-b-2 border-black px-3 py-3 leading-snug">
            <div className="text-[11px] font-semibold uppercase">Empfänger</div>
            <div className="text-lg font-bold">{to.name}</div>
            <div className="text-base">{to.street}</div>
            <div className="text-xl font-bold">
              {to.postalCode} {to.city}
            </div>
            <div className="text-sm uppercase">{to.country}</div>
            {to.phone && <div className="mt-1 text-[11px]">Tel.: {to.phone}</div>}
          </div>
          <div className="px-3 pt-3 pb-2">
            <Barcode code={code} />
            <div className="mt-1 text-center font-mono text-sm tracking-widest">{code}</div>
          </div>
          <div className="grid grid-cols-3 border-t border-black text-[11px]">
            <div className="border-r border-black px-2 py-1">
              <div className="font-semibold">Sendung</div>
              {sh.id}
            </div>
            <div className="border-r border-black px-2 py-1">
              <div className="font-semibold">Datum</div>
              {fmtDate(sh.created)}
            </div>
            <div className="px-2 py-1">
              <div className="font-semibold">Gewicht</div>
              ca. {weight.toFixed(1).replace('.', ',')} kg
            </div>
          </div>
          <div className="border-t border-black px-2 py-1 text-[10px]">
            Ref.: {sh.ticketId ?? '–'} · Inhalt: {sh.items.length} Artikel ({sh.items.join(', ')})
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-slate-500">Übungsetikett – nur für das Training, nicht für den echten Versand.</p>
    </Modal>
  )
}
