// Versand: Sendungsliste, Detail mit Ereignis-Timeline, simulierter Fortschritt, Etikett

import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Ban, CheckCircle2, PackageCheck, Plus, RefreshCw, Search, Tag, Truck, Wrench } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { A } from '@/core/actions'
import { useStore } from '@/core/store'
import type { Shipment, ShipmentStatus, World } from '@/core/types'
import { fmtDateTime, normalize, nowIso } from '@/core/util'
import { Badge, Button, Card, cx, EmptyState, Input, Modal, PageHeader, Select, tableCls } from '@/ui'
import { addHistory, locationFor, SHIP_FLOW, SHIP_TONE, STATUS_TONE, STOCK_LOCATION } from './helpers'
import { ShipmentDialog, type ShipmentPrefill } from './ShipmentDialog'
import { ShippingLabelModal } from './ShippingLabel'

const ALL_STATUS: ShipmentStatus[] = ['Entwurf', 'Beauftragt', 'Abgeholt', 'Unterwegs', 'Zugestellt', 'Problem', 'Storniert']

export function ShippingView() {
  const shipments = useStore((s) => s.world.shipments)
  const params = useStore((s) => s.ui.params)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [direction, setDirection] = useState('')
  const [selected, setSelected] = useState<string | undefined>()
  const [creating, setCreating] = useState<ShipmentPrefill | undefined>()

  // Deep-Link: navigate('shipping', { id }) bzw. { new: '1', sam, tag }
  useEffect(() => {
    if (params.id) setSelected(params.id)
    if (params.new) setCreating({ sam: params.sam, tags: params.tag ? params.tag.split(',') : undefined, direction: params.direction === 'Rücksendung' ? 'Rücksendung' : 'Ausgehend' })
  }, [params])

  const filtered = useMemo(() => {
    const n = normalize(q.trim())
    return shipments.filter((s) => {
      if (status === 'offen' ? ['Zugestellt', 'Storniert'].includes(s.status) : status && s.status !== status) return false
      if (direction && s.direction !== direction) return false
      if (n && !normalize([s.id, s.recipientName, s.recipientSam ?? '', s.tracking ?? '', s.items.join(' '), s.address.city, s.ticketId ?? '', s.carrier].join(' ')).includes(n)) return false
      return true
    })
  }, [shipments, q, status, direction])

  const openCount = shipments.filter((s) => !['Zugestellt', 'Storniert'].includes(s.status)).length
  const current = selected ? shipments.find((s) => s.id === selected) : undefined

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Versand"
        subtitle={`${shipments.length} Sendungen · ${openCount} in Bearbeitung`}
        icon={<Truck size={20} />}
        actions={
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setCreating({})}>
            Neue Sendung
          </Button>
        }
      />
      <div className="space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-60 flex-1">
            <Search size={16} className="pointer-events-none absolute top-2.5 left-2.5 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Suche: Sendungs-ID, Empfänger, Tracking, Inventarnr., Ticket …" className="pl-8" aria-label="Suche" />
          </div>
          <Select value={direction} onChange={(e) => setDirection(e.target.value)} className="w-auto" aria-label="Richtung">
            <option value="">Alle Richtungen</option>
            <option>Ausgehend</option>
            <option>Rücksendung</option>
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto" aria-label="Status">
            <option value="">Alle Status</option>
            <option value="offen">Nur offene</option>
            {ALL_STATUS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </div>

        <Card bodyClassName="p-0">
          {filtered.length ? (
            <div className="overflow-x-auto">
              <table className={tableCls}>
                <thead>
                  <tr>
                    <th>Sendung</th>
                    <th>Richtung</th>
                    <th>Empfänger / Absender</th>
                    <th>Artikel</th>
                    <th>Dienstleister</th>
                    <th>Tracking</th>
                    <th>Status</th>
                    <th>Aktualisiert</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => (
                    <tr key={s.id} className="cursor-pointer hover:bg-sky-50/60" onClick={() => setSelected(s.id)}>
                      <td className="font-mono text-xs font-medium text-sky-800">
                        {s.id}
                        {s.ticketId && <div className="font-sans text-[11px] font-normal text-slate-400">{s.ticketId}</div>}
                      </td>
                      <td>
                        <DirectionLabel d={s.direction} />
                      </td>
                      <td>
                        <div className="text-slate-800">{s.recipientName}</div>
                        <div className="text-xs text-slate-500">
                          {s.address.postalCode} {s.address.city}
                        </div>
                      </td>
                      <td className="font-mono text-xs">{s.items.join(', ')}</td>
                      <td>
                        {s.carrier} <span className="text-xs text-slate-500">· {s.service}</span>
                      </td>
                      <td className="font-mono text-xs text-slate-600">{s.tracking ?? '–'}</td>
                      <td>
                        <Badge tone={SHIP_TONE[s.status]}>{s.status}</Badge>
                      </td>
                      <td className="whitespace-nowrap text-xs text-slate-500">{fmtDateTime(s.updated)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={<Truck size={32} />} title="Keine Sendungen">
              {shipments.length ? 'Filter anpassen.' : 'Lege eine neue Sendung an, z. B. um ein Notebook ins Homeoffice zu schicken.'}
            </EmptyState>
          )}
        </Card>
      </div>

      {current && <ShipmentDetail shipment={current} onClose={() => setSelected(undefined)} />}
      {creating && <ShipmentDialog prefill={creating} onClose={() => setCreating(undefined)} onCreated={(id) => setSelected(id)} />}
    </div>
  )
}

function DirectionLabel({ d }: { d: Shipment['direction'] }) {
  return d === 'Ausgehend' ? (
    <span className="inline-flex items-center gap-1 text-sm text-slate-700">
      <ArrowUpRight size={14} className="text-sky-600" /> Ausgehend
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-sm text-slate-700">
      <ArrowDownLeft size={14} className="text-violet-600" /> Rücksendung
    </span>
  )
}

type Step = { label: string; status: ShipmentStatus; event: string; returnTarget?: 'Lager' | 'In Reparatur' }

function nextSteps(s: Shipment): Step[] {
  const hub = s.carrier === 'Hauspost' ? 'Hauspost' : `${s.carrier}-Paketzentrum`
  switch (s.status) {
    case 'Entwurf':
      return [{ label: 'Beauftragen', status: 'Beauftragt', event: `Versandauftrag an ${s.carrier} übermittelt` }]
    case 'Beauftragt':
      return [{ label: 'Status aktualisieren', status: 'Abgeholt', event: s.direction === 'Ausgehend' ? `Abgeholt durch ${s.carrier} (IT-Lager EG)` : `Beim Absender abgeholt (${s.address.city})` }]
    case 'Abgeholt':
      return [{ label: 'Status aktualisieren', status: 'Unterwegs', event: `Im ${hub} bearbeitet – unterwegs zum Empfänger` }]
    case 'Problem':
      return [{ label: 'Erneuter Zustellversuch', status: 'Unterwegs', event: 'Erneuter Zustellversuch eingeplant' }]
    case 'Unterwegs':
      return s.direction === 'Ausgehend'
        ? [{ label: 'Status aktualisieren', status: 'Zugestellt', event: `Zugestellt an ${s.recipientName}` }]
        : [
            { label: 'Eingang → Lager', status: 'Zugestellt', event: 'Zugestellt – Wareneingang IT, Gerät geprüft und eingelagert', returnTarget: 'Lager' },
            { label: 'Eingang → defekt (Reparatur)', status: 'Zugestellt', event: 'Zugestellt – Wareneingang IT, Gerät defekt → Reparatur', returnTarget: 'In Reparatur' },
          ]
    default:
      return []
  }
}

function applyStep(w: World, id: string, step: Step) {
  const s = w.shipments.find((x) => x.id === id)
  if (!s) return
  const now = nowIso()
  s.status = step.status
  s.updated = now
  s.events.push({ time: now, text: step.event })
  const recipient = s.recipientSam ? w.users.find((u) => u.sam === s.recipientSam) : undefined
  for (const tag of s.items) {
    const a = w.assets.find((x) => x.tag === tag)
    if (!a) continue
    if (s.direction === 'Rücksendung' && step.status === 'Abgeholt') {
      a.status = 'Im Versand'
      addHistory(a, `Rücksendung ${s.id} abgeholt`)
    }
    if (step.status === 'Zugestellt') {
      if (s.direction === 'Ausgehend') {
        a.status = 'In Benutzung'
        a.assignedTo = s.recipientSam
        a.location = recipient ? (recipient.homeOffice ? `Homeoffice ${s.address.city}` : locationFor(recipient)) : `${s.address.city}`
        addHistory(a, `Zugestellt an ${s.recipientName} (${s.id}) – in Benutzung`)
      } else {
        const target = step.returnTarget ?? 'Lager'
        a.status = target
        a.assignedTo = undefined
        a.location = target === 'Lager' ? STOCK_LOCATION : 'IT-Werkstatt (Prüfung/Reparatur)'
        addHistory(a, `Rücksendung ${s.id} eingegangen → ${target}`)
      }
    }
  }
}

function ShipmentDetail({ shipment: s, onClose }: { shipment: Shipment; onClose: () => void }) {
  const assets = useStore((s2) => s2.world.assets)
  const updateWorld = useStore((s2) => s2.updateWorld)
  const navigate = useStore((s2) => s2.navigate)
  const toast = useStore((s2) => s2.toast)
  const [label, setLabel] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const steps = nextSteps(s)
  const flowIdx = SHIP_FLOW.indexOf(s.status === 'Problem' ? 'Unterwegs' : s.status)
  const canCancel = s.status === 'Entwurf' || s.status === 'Beauftragt'
  const canProblem = s.status === 'Abgeholt' || s.status === 'Unterwegs'

  const run = (step: Step) => {
    updateWorld((w) => applyStep(w, s.id, step), { type: A.shipmentUpdated, target: s.id, detail: step.returnTarget ? `${step.status} (${step.returnTarget})` : step.status, ...(s.ticketId ? { ticketId: s.ticketId } : {}) })
    toast(`${s.id}: ${step.status}`, step.status === 'Zugestellt' ? 'success' : 'info')
  }

  const reportProblem = () => {
    updateWorld(
      (w) => {
        const x = w.shipments.find((y) => y.id === s.id)
        if (!x) return
        x.status = 'Problem'
        x.updated = nowIso()
        x.events.push({ time: x.updated, text: 'Zustellung nicht möglich – Empfänger nicht angetroffen, Benachrichtigung hinterlassen' })
      },
      { type: A.shipmentUpdated, target: s.id, detail: 'Problem', ...(s.ticketId ? { ticketId: s.ticketId } : {}) },
    )
    toast(`${s.id}: Zustellproblem gemeldet`, 'warning')
  }

  const cancel = () => {
    updateWorld(
      (w) => {
        const x = w.shipments.find((y) => y.id === s.id)
        if (!x) return
        x.status = 'Storniert'
        x.updated = nowIso()
        x.events.push({ time: x.updated, text: 'Sendung storniert' })
        for (const tag of x.items) {
          const a = w.assets.find((y) => y.tag === tag)
          if (!a || a.status !== 'Im Versand') continue
          const u = a.assignedTo ? w.users.find((y) => y.sam === a.assignedTo) : undefined
          a.status = a.assignedTo ? 'In Benutzung' : 'Lager'
          a.location = a.assignedTo ? locationFor(u) : STOCK_LOCATION
          addHistory(a, `Versand ${x.id} storniert`)
        }
      },
      { type: A.shipmentUpdated, target: s.id, detail: 'Storniert', ...(s.ticketId ? { ticketId: s.ticketId } : {}) },
    )
    setConfirmCancel(false)
    toast(`${s.id} storniert.`, 'info')
  }

  return (
    <>
      <Modal
        title={
          <span className="flex items-center gap-2">
            <span className="font-mono">{s.id}</span> <Badge tone={SHIP_TONE[s.status]}>{s.status}</Badge>
          </span>
        }
        onClose={onClose}
        size="lg"
        footer={
          <>
            {canCancel && (
              <Button variant="ghost" icon={<Ban size={15} />} onClick={() => setConfirmCancel(true)} className="mr-auto text-rose-700">
                Stornieren
              </Button>
            )}
            <Button icon={<Tag size={15} />} onClick={() => setLabel(true)} disabled={s.status === 'Storniert'}>
              Versandetikett
            </Button>
            {canProblem && (
              <Button icon={<AlertTriangle size={15} />} onClick={reportProblem}>
                Zustellproblem
              </Button>
            )}
            {steps.map((st) => (
              <Button key={st.label} variant={st.returnTarget === 'In Reparatur' ? 'secondary' : 'primary'} icon={st.returnTarget === 'In Reparatur' ? <Wrench size={15} /> : st.status === 'Zugestellt' ? <PackageCheck size={15} /> : <RefreshCw size={15} />} onClick={() => run(st)}>
                {st.label}
              </Button>
            ))}
            {!steps.length && (
              <Button variant="primary" onClick={onClose}>
                Schließen
              </Button>
            )}
          </>
        }
      >
        {/* Fortschrittsleiste */}
        {s.status !== 'Storniert' && (
          <ol className="mb-5 flex items-center">
            {SHIP_FLOW.map((st, i) => {
              const done = i <= flowIdx
              const problemHere = s.status === 'Problem' && st === 'Unterwegs'
              return (
                <li key={st} className="flex flex-1 items-center last:flex-none">
                  <div className="flex flex-col items-center">
                    <span className={cx('flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold', problemHere ? 'bg-rose-500 text-white' : done ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500')}>
                      {problemHere ? '!' : done ? <CheckCircle2 size={15} /> : i + 1}
                    </span>
                    <span className={cx('mt-1 text-[11px]', done ? 'font-medium text-slate-800' : 'text-slate-400')}>{problemHere ? 'Problem' : st}</span>
                  </div>
                  {i < SHIP_FLOW.length - 1 && <div className={cx('mx-1 mb-4 h-0.5 flex-1', i < flowIdx ? 'bg-emerald-400' : 'bg-slate-200')} />}
                </li>
              )
            })}
          </ol>
        )}

        <div className="grid gap-5 md:grid-cols-2">
          <dl className="space-y-1.5 text-sm">
            <div className="grid grid-cols-[8rem_1fr]">
              <dt className="text-slate-500">Richtung</dt>
              <dd>
                <DirectionLabel d={s.direction} />
              </dd>
            </div>
            <div className="grid grid-cols-[8rem_1fr]">
              <dt className="text-slate-500">{s.direction === 'Ausgehend' ? 'Empfänger' : 'Absender'}</dt>
              <dd>
                <div className="font-medium">{s.recipientName}</div>
                <div>{s.address.street}</div>
                <div>
                  {s.address.postalCode} {s.address.city}
                </div>
                <div className="text-slate-500">{s.address.country}</div>
              </dd>
            </div>
            <div className="grid grid-cols-[8rem_1fr]">
              <dt className="text-slate-500">Dienstleister</dt>
              <dd>
                {s.carrier} · {s.service}
              </dd>
            </div>
            <div className="grid grid-cols-[8rem_1fr]">
              <dt className="text-slate-500">Sendungsnummer</dt>
              <dd className="font-mono">{s.tracking ?? '–'}</dd>
            </div>
            <div className="grid grid-cols-[8rem_1fr]">
              <dt className="text-slate-500">Ticket</dt>
              <dd>
                {s.ticketId ? (
                  <button type="button" className="text-sky-700 hover:underline" onClick={() => navigate('tickets', { id: s.ticketId! })}>
                    {s.ticketId}
                  </button>
                ) : (
                  '–'
                )}
              </dd>
            </div>
            <div className="grid grid-cols-[8rem_1fr]">
              <dt className="text-slate-500">Angelegt</dt>
              <dd>{fmtDateTime(s.created)}</dd>
            </div>
            {s.notes && (
              <div className="grid grid-cols-[8rem_1fr]">
                <dt className="text-slate-500">Notiz</dt>
                <dd className="whitespace-pre-wrap">{s.notes}</dd>
              </div>
            )}
          </dl>
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Artikel</div>
            <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
              {s.items.map((tag) => {
                const a = assets.find((x) => x.tag === tag)
                return (
                  <li key={tag} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                    <button type="button" className="font-mono text-xs text-sky-700 hover:underline" onClick={() => navigate('assets', { tag })}>
                      {tag}
                    </button>
                    <span className="min-w-0 flex-1 truncate text-slate-600">{a ? `${a.type} · ${a.model}` : 'unbekannt'}</span>
                    {a && <Badge tone={STATUS_TONE[a.status]}>{a.status}</Badge>}
                  </li>
                )
              })}
            </ul>
            <div className="mt-4 mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Sendungsverlauf</div>
            <ol className="relative space-y-2 border-l-2 border-slate-200 pl-4">
              {[...s.events].reverse().map((e, i) => (
                <li key={i} className="relative text-sm">
                  <span className={cx('absolute top-1.5 -left-[21px] h-2.5 w-2.5 rounded-full border-2 border-white', i === 0 ? 'bg-sky-500' : 'bg-slate-400')} />
                  <div className={cx(i === 0 ? 'font-medium text-slate-900' : 'text-slate-700')}>{e.text}</div>
                  <div className="text-xs text-slate-400">{fmtDateTime(e.time)}</div>
                </li>
              ))}
            </ol>
          </div>
        </div>
        {s.direction === 'Rücksendung' && s.status === 'Unterwegs' && <p className="mt-4 rounded-md bg-violet-50 px-3 py-2 text-xs text-violet-900 ring-1 ring-violet-200">Wareneingang: Prüfe das zurückgesendete Gerät und entscheide, ob es wieder ins Lager geht oder in die Reparatur muss.</p>}
      </Modal>
      {label && <ShippingLabelModal shipment={s} onClose={() => setLabel(false)} />}
      {confirmCancel && (
        <Modal
          title="Sendung stornieren?"
          onClose={() => setConfirmCancel(false)}
          size="sm"
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirmCancel(false)}>
                Abbrechen
              </Button>
              <Button variant="danger" onClick={cancel}>
                Stornieren
              </Button>
            </>
          }
        >
          <p className="text-sm text-slate-700">Die Sendung {s.id} wird storniert. Geräte im Versand werden wieder ins Lager bzw. zurück an den bisherigen Benutzer gebucht.</p>
        </Modal>
      )}
    </>
  )
}
