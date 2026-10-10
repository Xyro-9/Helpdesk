// Dialog "Neue Sendung" (auch aus der Asset-Detailansicht vorbefüllt aufrufbar)

import { PackagePlus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { A } from '@/core/actions'
import { shipmentId, trackingFor } from '@/core/seed/assets'
import { useStore } from '@/core/store'
import type { AdUser, Shipment } from '@/core/types'
import { nowIso } from '@/core/util'
import { isOpenTicket } from '@/modules/training/launch'
import { Badge, Button, cx, Field, Input, Modal, Select, Textarea } from '@/ui'
import { addHistory, CARRIERS, SERVICES, STATUS_TONE } from './helpers'
import { UserPicker } from './UserPicker'

export interface ShipmentPrefill {
  sam?: string
  tags?: string[]
  direction?: Shipment['direction']
}

export function ShipmentDialog({ prefill, onClose, onCreated }: { prefill?: ShipmentPrefill; onClose: () => void; onCreated?: (id: string) => void }) {
  const users = useStore((s) => s.world.users)
  const assets = useStore((s) => s.world.assets)
  const tickets = useStore((s) => s.world.tickets)
  const activeTicketId = useStore((s) => s.activeTicketId)
  const updateWorld = useStore((s) => s.updateWorld)
  const toast = useStore((s) => s.toast)

  const initialUser = prefill?.sam ? users.find((u) => u.sam === prefill.sam) : undefined
  const [direction, setDirection] = useState<Shipment['direction']>(prefill?.direction ?? 'Ausgehend')
  const [sam, setSam] = useState(initialUser?.sam ?? '')
  const [pickUser, setPickUser] = useState(!initialUser)
  const [name, setName] = useState(initialUser?.displayName ?? '')
  const [street, setStreet] = useState(initialUser?.homeAddress?.street ?? '')
  const [postalCode, setPostalCode] = useState(initialUser?.homeAddress?.postalCode ?? '')
  const [city, setCity] = useState(initialUser?.homeAddress?.city ?? '')
  const [country, setCountry] = useState('Deutschland')
  const [items, setItems] = useState<string[]>(prefill?.tags ?? [])
  const [carrier, setCarrier] = useState<Shipment['carrier']>('DHL')
  const [service, setService] = useState<Shipment['service']>('Standard')
  const openTickets = useMemo(() => tickets.filter(isOpenTicket), [tickets])
  const [ticketId, setTicketId] = useState(activeTicketId && openTickets.some((t) => t.id === activeTicketId) ? activeTicketId : '')
  const [notes, setNotes] = useState('')
  const [itemFilter, setItemFilter] = useState('')
  const [error, setError] = useState('')

  const chooseUser = (u: AdUser) => {
    setSam(u.sam)
    setName(u.displayName)
    setStreet(u.homeAddress?.street ?? '')
    setPostalCode(u.homeAddress?.postalCode ?? '')
    setCity(u.homeAddress?.city ?? '')
    setCountry('Deutschland')
    setPickUser(false)
    // nicht mehr passende Artikel entfernen
    setItems((cur) => cur.filter((tag) => eligibleFor(tag, u.sam, direction)))
  }

  const eligibleFor = (tag: string, forSam: string, dir: Shipment['direction']) => {
    const a = assets.find((x) => x.tag === tag)
    if (!a) return false
    if (dir === 'Ausgehend') return a.status === 'Lager' || (a.status === 'In Benutzung' && a.assignedTo === forSam)
    return a.assignedTo === forSam && (a.status === 'In Benutzung' || a.status === 'Verloren/Gestohlen')
  }

  const eligible = useMemo(() => {
    const f = itemFilter.trim().toLowerCase()
    return assets
      .filter((a) => (direction === 'Ausgehend' ? a.status === 'Lager' || (a.status === 'In Benutzung' && !!sam && a.assignedTo === sam) : !!sam && a.assignedTo === sam && (a.status === 'In Benutzung' || a.status === 'Verloren/Gestohlen')))
      .filter((a) => !f || `${a.tag} ${a.type} ${a.manufacturer} ${a.model}`.toLowerCase().includes(f))
  }, [assets, direction, sam, itemFilter])

  const toggle = (tag: string) => setItems((cur) => (cur.includes(tag) ? cur.filter((x) => x !== tag) : [...cur, tag]))

  const submit = () => {
    if (!sam) return setError('Bitte einen Empfänger (AD-Benutzer) auswählen.')
    if (!name.trim() || !street.trim() || !city.trim()) return setError('Bitte Name, Straße und Ort angeben.')
    if (country === 'Deutschland' && !/^\d{5}$/.test(postalCode.trim())) return setError('Die Postleitzahl muss in Deutschland fünfstellig sein.')
    const valid = items.filter((t) => eligibleFor(t, sam, direction))
    if (!valid.length) return setError('Bitte mindestens einen Artikel auswählen.')
    let id = ''
    updateWorld(
      (w) => {
        id = shipmentId(++w.counters.shipment)
        const now = nowIso()
        const sh: Shipment = {
          id,
          direction,
          ticketId: ticketId || undefined,
          recipientName: name.trim(),
          recipientSam: sam,
          address: { street: street.trim(), postalCode: postalCode.trim(), city: city.trim(), country: country.trim() || 'Deutschland' },
          items: valid,
          carrier,
          service,
          tracking: trackingFor(carrier),
          status: 'Beauftragt',
          created: now,
          updated: now,
          notes: notes.trim(),
          events: [
            { time: now, text: direction === 'Ausgehend' ? 'Sendung angelegt' : 'Rücksendung angelegt – Retourenlabel an Absender verschickt' },
            { time: now, text: carrier === 'Hauspost' ? 'Hauspost beauftragt' : `Versandauftrag an ${carrier} übermittelt (${service})` },
          ],
        }
        w.shipments.unshift(sh)
        for (const tag of valid) {
          const a = w.assets.find((x) => x.tag === tag)
          if (!a) continue
          if (direction === 'Ausgehend') {
            a.status = 'Im Versand'
            addHistory(a, `Versand ${id} an ${sh.recipientName} beauftragt (${carrier})`)
          } else {
            addHistory(a, `Rücksendung ${id} von ${sh.recipientName} angelegt (${carrier})`)
          }
        }
        if (ticketId) {
          const t = w.tickets.find((x) => x.id === ticketId)
          if (t) {
            for (const tag of valid) if (!t.linkedAssets.includes(tag)) t.linkedAssets.push(tag)
            t.updatedAt = now
          }
        }
      },
      { type: A.shipmentCreated, target: sam, detail: valid.join(', '), ...(ticketId ? { ticketId } : {}) },
    )
    toast(`Sendung ${id} angelegt.`, 'success')
    onCreated?.(id)
    onClose()
  }

  return (
    <Modal
      title={
        <span className="flex items-center gap-2">
          <PackagePlus size={18} className="text-sky-600" /> Neue Sendung
        </span>
      }
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button variant="primary" onClick={submit}>
            Sendung beauftragen
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-2">
          {(['Ausgehend', 'Rücksendung'] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => {
                setDirection(d)
                setItems((cur) => cur.filter((t) => eligibleFor(t, sam, d)))
              }}
              className={cx('flex-1 rounded-md border px-3 py-2 text-left text-sm', direction === d ? 'border-sky-500 bg-sky-50 text-sky-900 ring-1 ring-sky-500' : 'border-slate-300 hover:bg-slate-50')}
            >
              <div className="font-medium">{d === 'Ausgehend' ? 'Ausgehend' : 'Rücksendung'}</div>
              <div className="text-xs text-slate-500">{d === 'Ausgehend' ? 'Gerät an Mitarbeitende verschicken (z. B. Homeoffice)' : 'Gerät von Mitarbeitenden zurückholen (Retourenlabel)'}</div>
            </button>
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <div className="mb-1 flex items-center justify-between text-xs font-medium text-slate-600">
              <span>{direction === 'Ausgehend' ? 'Empfänger' : 'Absender (Mitarbeiter/in)'}</span>
              {sam && !pickUser && (
                <button type="button" className="text-sky-700 hover:underline" onClick={() => setPickUser(true)}>
                  ändern
                </button>
              )}
            </div>
            {pickUser || !sam ? (
              <UserPicker value={sam} onPick={chooseUser} autoFocus />
            ) : (
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <div className="font-medium text-slate-800">{users.find((u) => u.sam === sam)?.displayName ?? sam}</div>
                <div className="text-xs text-slate-500">
                  {sam} · {users.find((u) => u.sam === sam)?.department}
                </div>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Field label="Name auf dem Etikett">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Straße und Hausnummer" hint={sam ? 'Vorbefüllt mit der Homeoffice-Adresse aus dem AD – bei Bedarf anpassen.' : undefined}>
              <Input value={street} onChange={(e) => setStreet(e.target.value)} />
            </Field>
            <div className="grid grid-cols-[6rem_1fr] gap-2">
              <Field label="PLZ">
                <Input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} inputMode="numeric" />
              </Field>
              <Field label="Ort">
                <Input value={city} onChange={(e) => setCity(e.target.value)} />
              </Field>
            </div>
            <Field label="Land">
              <Input value={country} onChange={(e) => setCountry(e.target.value)} />
            </Field>
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-600">
              Artikel {direction === 'Ausgehend' ? '(Lagerbestand oder dem Empfänger zugewiesene Geräte)' : '(dem Absender zugewiesene Geräte)'}
            </span>
            <Input value={itemFilter} onChange={(e) => setItemFilter(e.target.value)} placeholder="Artikel filtern …" className="h-7 max-w-48 text-xs" />
          </div>
          <div className="max-h-52 overflow-y-auto rounded-md border border-slate-200">
            {eligible.length ? (
              <ul className="divide-y divide-slate-100">
                {eligible.map((a) => (
                  <li key={a.tag}>
                    <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-50">
                      <input type="checkbox" className="h-4 w-4 accent-sky-600" checked={items.includes(a.tag)} onChange={() => toggle(a.tag)} />
                      <span className="w-28 shrink-0 font-mono text-xs text-slate-700">{a.tag}</span>
                      <span className="min-w-0 flex-1 truncate">
                        {a.type} · {a.manufacturer} {a.model}
                      </span>
                      <Badge tone={STATUS_TONE[a.status]}>{a.status}</Badge>
                    </label>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-3 py-4 text-center text-sm text-slate-500">{sam || direction === 'Ausgehend' ? 'Keine passenden Geräte.' : 'Zuerst den Absender auswählen.'}</div>
            )}
          </div>
          {items.length > 0 && <div className="mt-1 text-xs text-slate-500">Ausgewählt: {items.join(', ')}</div>}
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Dienstleister">
            <Select value={carrier} onChange={(e) => setCarrier(e.target.value as Shipment['carrier'])}>
              {CARRIERS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Service">
            <Select value={service} onChange={(e) => setService(e.target.value as Shipment['service'])}>
              {SERVICES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Ticket verknüpfen">
            <Select value={ticketId} onChange={(e) => setTicketId(e.target.value)}>
              <option value="">– kein Ticket –</option>
              {openTickets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.id} · {t.title.slice(0, 40)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Notiz (intern)">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="z. B. Ersatzgerät, Altgerät bitte mit beiliegendem Label zurücksenden" />
        </Field>
        {error && <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-200">{error}</div>}
      </div>
    </Modal>
  )
}
