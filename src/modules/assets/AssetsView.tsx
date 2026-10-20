// Inventar: Asset-Tabelle mit Filtern, Detailansicht mit Aktionen, Lagerbestand, neues Asset

import { AlertTriangle, Boxes, Link2, Monitor, PackagePlus, Plus, RotateCcw, Search, Truck, UserPlus, Users } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { A } from '@/core/actions'
import { useStore } from '@/core/store'
import type { Asset, AssetStatus, AssetType } from '@/core/types'
import { fmtDate, fmtDateTime, normalize, nowIso } from '@/core/util'
import { isOpenTicket } from '@/modules/training/launch'
import { Badge, Button, Card, cx, EmptyState, Field, Input, Modal, PageHeader, Select, tableCls, Textarea } from '@/ui'
import { addHistory, addYears, ASSET_STATUSES, ASSET_TYPES, locationFor, nextAssetTag, STATUS_TONE, STOCK_LOCATION, userName, warrantyExpired } from './helpers'
import { ShipmentDialog, type ShipmentPrefill } from './ShipmentDialog'
import { UserPicker } from './UserPicker'

export function AssetsView() {
  const assets = useStore((s) => s.world.assets)
  const users = useStore((s) => s.world.users)
  const params = useStore((s) => s.ui.params)
  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  const [status, setStatus] = useState('')
  const [selected, setSelected] = useState<string | undefined>()
  const [creating, setCreating] = useState(false)
  const [shipPrefill, setShipPrefill] = useState<ShipmentPrefill | undefined>()

  // Deep-Link: navigate('assets', { tag }) oder { hostname }
  useEffect(() => {
    const tag = params.tag ?? (params.hostname ? assets.find((a) => a.hostname?.toLowerCase() === params.hostname.toLowerCase())?.tag : undefined)
    if (tag) setSelected(tag)
    else if (params.hostname) {
      setQ(params.hostname)
      useStore.getState().toast(`Kein Inventareintrag mit Hostname ${params.hostname} gefunden.`, 'warning')
    }
    // nur bei Navigation reagieren (params ist bei jedem navigate() ein neues Objekt)
  }, [params]) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const n = normalize(q.trim())
    return assets.filter((a) => {
      if (type && a.type !== type) return false
      if (status && a.status !== status) return false
      if (n) {
        const hay = normalize([a.tag, a.type, a.manufacturer, a.model, a.serial, a.hostname ?? '', a.location, a.assignedTo ?? '', userName(users, a.assignedTo), a.notes].join(' '))
        if (!hay.includes(n)) return false
      }
      return true
    })
  }, [assets, users, q, type, status])

  const stock = useMemo(() => {
    const m = new Map<AssetType, number>()
    for (const a of assets) if (a.status === 'Lager') m.set(a.type, (m.get(a.type) ?? 0) + 1)
    return ASSET_TYPES.filter((t) => m.has(t)).map((t) => ({ type: t, count: m.get(t)! }))
  }, [assets])
  const counts = useMemo(() => {
    const m: Partial<Record<AssetStatus, number>> = {}
    for (const a of assets) m[a.status] = (m[a.status] ?? 0) + 1
    return m
  }, [assets])

  const current = selected ? assets.find((a) => a.tag === selected) : undefined

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Inventar"
        subtitle={`${assets.length} Geräte · ${counts['In Benutzung'] ?? 0} in Benutzung · ${counts.Lager ?? 0} im Lager`}
        icon={<Boxes size={20} />}
        actions={
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setCreating(true)}>
            Neues Asset
          </Button>
        }
      />
      <div className="space-y-4 p-5">
        <Card title="Lagerbestand (IT-Lager EG)" bodyClassName="p-3">
          {stock.length ? (
            <div className="flex flex-wrap gap-2">
              {stock.map((s) => (
                <button
                  key={s.type}
                  type="button"
                  onClick={() => {
                    setType(s.type)
                    setStatus('Lager')
                  }}
                  className={cx('rounded-lg border px-3 py-2 text-left hover:border-sky-300 hover:bg-sky-50', type === s.type && status === 'Lager' ? 'border-sky-400 bg-sky-50' : 'border-slate-200')}
                >
                  <div className="text-xl font-semibold tabular-nums text-slate-900">{s.count}</div>
                  <div className="text-xs text-slate-500">{s.type}</div>
                </button>
              ))}
              {(['In Reparatur', 'Im Versand', 'Bestellt'] as AssetStatus[])
                .filter((st) => counts[st])
                .map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => {
                      setType('')
                      setStatus(st)
                    }}
                    className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-left hover:bg-slate-50"
                  >
                    <div className="text-xl font-semibold tabular-nums text-slate-700">{counts[st]}</div>
                    <div className="text-xs text-slate-500">{st}</div>
                  </button>
                ))}
            </div>
          ) : (
            <div className="text-sm text-slate-500">Das Lager ist leer.</div>
          )}
        </Card>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-60 flex-1">
            <Search size={16} className="pointer-events-none absolute top-2.5 left-2.5 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Suche: Inventarnr., Seriennr., Hostname, Benutzer, Modell …" className="pl-8" aria-label="Suche" />
          </div>
          <Select value={type} onChange={(e) => setType(e.target.value)} className="w-auto" aria-label="Typ">
            <option value="">Alle Typen</option>
            {ASSET_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto" aria-label="Status">
            <option value="">Alle Status</option>
            {ASSET_STATUSES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
          {(q || type || status) && (
            <Button
              variant="ghost"
              onClick={() => {
                setQ('')
                setType('')
                setStatus('')
              }}
            >
              Zurücksetzen
            </Button>
          )}
        </div>

        <Card bodyClassName="p-0">
          {filtered.length ? (
            <div className="max-h-[calc(100vh-22rem)] min-h-64 overflow-auto">
              <table className={tableCls}>
                <thead>
                  <tr>
                    <th>Inventarnr.</th>
                    <th>Typ</th>
                    <th>Hersteller / Modell</th>
                    <th>Seriennr.</th>
                    <th>Status</th>
                    <th>Zugewiesen an</th>
                    <th>Standort</th>
                    <th>Hostname</th>
                    <th>Garantie bis</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a) => {
                    const expired = warrantyExpired(a)
                    return (
                      <tr key={a.tag} className="cursor-pointer hover:bg-sky-50/60" onClick={() => setSelected(a.tag)}>
                        <td className="font-mono text-xs font-medium text-sky-800">{a.tag}</td>
                        <td>{a.type}</td>
                        <td>
                          <div className="text-slate-800">{a.model}</div>
                          <div className="text-xs text-slate-500">{a.manufacturer}</div>
                        </td>
                        <td className="font-mono text-xs text-slate-600">{a.serial}</td>
                        <td>
                          <Badge tone={STATUS_TONE[a.status]}>{a.status}</Badge>
                        </td>
                        <td>{a.assignedTo ? <span title={a.assignedTo}>{userName(users, a.assignedTo)}</span> : <span className="text-slate-400">–</span>}</td>
                        <td className="max-w-48 truncate text-slate-600" title={a.location}>
                          {a.location}
                        </td>
                        <td className="font-mono text-xs">{a.hostname ?? <span className="text-slate-400">–</span>}</td>
                        <td className={cx('whitespace-nowrap tabular-nums', expired ? 'font-medium text-rose-700' : 'text-slate-600')} title={expired ? 'Garantie abgelaufen' : undefined}>
                          {fmtDate(a.warrantyUntil)}
                          {expired && ' ⚠'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={<Search size={32} />} title="Keine Geräte gefunden">
              Filter oder Suchbegriff anpassen.
            </EmptyState>
          )}
          <div className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
            {filtered.length} von {assets.length} Geräten
          </div>
        </Card>
      </div>

      {current && <AssetDetail asset={current} onClose={() => setSelected(undefined)} onShip={(p) => setShipPrefill(p)} />}
      {creating && (
        <NewAssetDialog
          onClose={() => setCreating(false)}
          onCreated={(tag) => {
            setCreating(false)
            setSelected(tag)
          }}
        />
      )}
      {shipPrefill && (
        <ShipmentDialog
          prefill={shipPrefill}
          onClose={() => setShipPrefill(undefined)}
          onCreated={(id) => {
            const st = useStore.getState()
            st.toast(`Zur Sendungsverfolgung: Versand → ${id}`, 'info')
          }}
        />
      )}
    </div>
  )
}

// ─────────────── Detail ───────────────

function AssetDetail({ asset: a, onClose, onShip }: { asset: Asset; onClose: () => void; onShip: (p: ShipmentPrefill) => void }) {
  const users = useStore((s) => s.world.users)
  const tickets = useStore((s) => s.world.tickets)
  const shipments = useStore((s) => s.world.shipments)
  const activeTicketId = useStore((s) => s.activeTicketId)
  const updateWorld = useStore((s) => s.updateWorld)
  const navigate = useStore((s) => s.navigate)
  const openRdp = useStore((s) => s.openRdp)
  const toast = useStore((s) => s.toast)
  const [assigning, setAssigning] = useState(false)
  const [newStatus, setNewStatus] = useState<AssetStatus>(a.status)
  const [notes, setNotes] = useState(a.notes)
  const [location, setLocation] = useState(a.location)
  const assignee = a.assignedTo ? users.find((u) => u.sam === a.assignedTo) : undefined
  const activeTicket = activeTicketId ? tickets.find((t) => t.id === activeTicketId && isOpenTicket(t)) : undefined
  const relatedShipments = useMemo(() => shipments.filter((s) => s.items.includes(a.tag)), [shipments, a.tag])
  const inTransit = a.status === 'Im Versand'

  // Formular bei Wechsel des Assets bzw. externen Änderungen nachziehen
  useEffect(() => {
    setNewStatus(a.status)
    setNotes(a.notes)
    setLocation(a.location)
  }, [a.tag, a.status, a.notes, a.location])

  const assign = (sam: string) => {
    const u = users.find((x) => x.sam === sam)
    if (!u) return
    updateWorld(
      (w) => {
        const x = w.assets.find((y) => y.tag === a.tag)
        if (!x) return
        const prev = x.assignedTo
        x.assignedTo = u.sam
        x.status = 'In Benutzung'
        x.location = locationFor(u)
        addHistory(x, prev && prev !== u.sam ? `Neu zugewiesen: ${userName(w.users, prev)} → ${u.displayName}` : `Ausgegeben an ${u.displayName}`)
      },
      { type: A.assetAssigned, target: a.tag, detail: u.sam },
    )
    setAssigning(false)
    toast(`${a.tag} an ${u.displayName} ausgegeben.`, 'success')
  }

  const takeBack = () => {
    updateWorld(
      (w) => {
        const x = w.assets.find((y) => y.tag === a.tag)
        if (!x) return
        const prev = x.assignedTo
        x.assignedTo = undefined
        x.status = 'Lager'
        x.location = STOCK_LOCATION
        addHistory(x, `Rücknahme ins Lager${prev ? ` (von ${userName(w.users, prev)})` : ''}`)
      },
      { type: A.assetUpdated, target: a.tag, detail: 'Rücknahme → Lager' },
    )
    toast(`${a.tag} zurückgenommen.`, 'success')
  }

  const applyStatus = () => {
    if (newStatus === a.status) return
    updateWorld(
      (w) => {
        const x = w.assets.find((y) => y.tag === a.tag)
        if (!x) return
        addHistory(x, `Status geändert: ${x.status} → ${newStatus}`)
        x.status = newStatus
        if (newStatus === 'Lager' || newStatus === 'Ausgemustert') {
          x.assignedTo = undefined
          if (newStatus === 'Lager') x.location = STOCK_LOCATION
        }
      },
      { type: A.assetUpdated, target: a.tag, detail: `Status: ${newStatus}` },
    )
    toast(`Status von ${a.tag}: ${newStatus}`, 'success')
  }

  const saveNotes = () => {
    updateWorld(
      (w) => {
        const x = w.assets.find((y) => y.tag === a.tag)
        if (!x) return
        const changes: string[] = []
        if (x.location !== location.trim()) changes.push(`Standort: ${location.trim()}`)
        if (x.notes !== notes) changes.push('Notiz aktualisiert')
        x.location = location.trim()
        x.notes = notes
        if (changes.length) addHistory(x, changes.join(' · '))
      },
      { type: A.assetUpdated, target: a.tag, detail: 'Notiz/Standort' },
    )
    toast('Gespeichert.', 'success')
  }

  const linkTicket = () => {
    if (!activeTicket) return
    updateWorld(
      (w) => {
        const t = w.tickets.find((x) => x.id === activeTicket.id)
        if (t && !t.linkedAssets.includes(a.tag)) {
          t.linkedAssets.push(a.tag)
          t.updatedAt = nowIso()
        }
      },
      { type: A.assetUpdated, target: a.tag, detail: `Mit Ticket ${activeTicket.id} verknüpft` },
    )
    toast(`${a.tag} mit ${activeTicket.id} verknüpft.`, 'success')
  }

  const row = (label: string, value: ReactNode) => (
    <div className="grid grid-cols-[9rem_1fr] gap-2 py-1 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="min-w-0 text-slate-800">{value}</dd>
    </div>
  )

  return (
    <Modal
      title={
        <span className="flex items-center gap-2">
          <span className="font-mono">{a.tag}</span> <Badge tone={STATUS_TONE[a.status]}>{a.status}</Badge>
        </span>
      }
      onClose={onClose}
      size="xl"
      footer={
        <Button variant="primary" onClick={onClose}>
          Schließen
        </Button>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <dl className="divide-y divide-slate-100">
            {row('Typ', a.type)}
            {row('Hersteller / Modell', `${a.manufacturer} ${a.model}`)}
            {row('Seriennummer', <span className="font-mono">{a.serial}</span>)}
            {row(
              'Zugewiesen an',
              assignee ? (
                <button type="button" className="text-sky-700 hover:underline" onClick={() => navigate('ad', { sam: assignee.sam })} title="Im Active Directory öffnen">
                  {assignee.displayName} ({assignee.sam}) · {assignee.department}
                </button>
              ) : (
                <span className="text-slate-400">–</span>
              ),
            )}
            {row('Standort', a.location)}
            {row('Hostname', a.hostname ? <span className="font-mono">{a.hostname}</span> : '–')}
            {row('Kaufdatum', fmtDate(a.purchaseDate))}
            {row('Garantie bis', <span className={warrantyExpired(a) ? 'font-medium text-rose-700' : ''}>{fmtDate(a.warrantyUntil) + (warrantyExpired(a) ? ' – abgelaufen' : '')}</span>)}
            {row('Anschaffungskosten', `${a.costEur.toLocaleString('de-DE')} €`)}
          </dl>

          {a.status === 'Verloren/Gestohlen' && (
            <div className="flex gap-2 rounded-md bg-rose-50 p-3 text-sm text-rose-900 ring-1 ring-rose-200">
              <AlertTriangle size={18} className="shrink-0" />
              <div>
                <strong>Verlust/Diebstahl:</strong> Sicherheitsvorfall an die Informationssicherheit melden, Sitzungen des Benutzers widerrufen, ggf. Kennwort zurücksetzen und das Gerät im AD deaktivieren. Bei Diebstahl: Anzeige durch die Mitarbeiterin/den Mitarbeiter.
              </div>
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Standort">
              <Input value={location} onChange={(e) => setLocation(e.target.value)} />
            </Field>
            <Field label="Status ändern">
              <div className="flex gap-2">
                <Select value={newStatus} onChange={(e) => setNewStatus(e.target.value as AssetStatus)}>
                  {ASSET_STATUSES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </Select>
                <Button onClick={applyStatus} disabled={newStatus === a.status}>
                  Setzen
                </Button>
              </div>
            </Field>
          </div>
          <Field label="Notiz">
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <div className="flex justify-end">
            <Button size="sm" onClick={saveNotes} disabled={notes === a.notes && location.trim() === a.location}>
              Notiz & Standort speichern
            </Button>
          </div>

          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Historie</div>
            <ol className="relative space-y-2 border-l-2 border-slate-200 pl-4">
              {[...a.history].reverse().map((h, i) => (
                <li key={i} className="relative text-sm">
                  <span className="absolute top-1.5 -left-[21px] h-2.5 w-2.5 rounded-full border-2 border-white bg-slate-400" />
                  <div className="text-slate-800">{h.text}</div>
                  <div className="text-xs text-slate-400">{fmtDateTime(h.time)}</div>
                </li>
              ))}
              {!a.history.length && <li className="text-sm text-slate-400">Keine Einträge.</li>}
            </ol>
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Aktionen</div>
            <div className="flex flex-col gap-2">
              <Button icon={<UserPlus size={15} />} onClick={() => setAssigning((v) => !v)} disabled={inTransit} title={inTransit ? 'Gerät ist im Versand' : undefined}>
                {a.assignedTo ? 'Anderem Benutzer zuweisen' : 'Benutzer zuweisen'}
              </Button>
              {assigning && (
                <div className="rounded-md bg-slate-50 p-2">
                  <UserPicker value={a.assignedTo} onPick={(u) => assign(u.sam)} autoFocus />
                  <p className="mt-1 text-xs text-slate-500">Standort wird automatisch gesetzt (Büro bzw. Homeoffice). Das AD-Attribut „Verwaltet von“ des Computers bleibt unverändert.</p>
                </div>
              )}
              <Button icon={<RotateCcw size={15} />} onClick={takeBack} disabled={!a.assignedTo || inTransit}>
                Rücknahme ins Lager
              </Button>
              <Button icon={<Truck size={15} />} onClick={() => onShip({ tags: [a.tag], sam: a.assignedTo, direction: 'Ausgehend' })} disabled={inTransit || !['Lager', 'In Benutzung'].includes(a.status)}>
                Versand anlegen
              </Button>
              {a.assignedTo && a.status === 'In Benutzung' && (
                <Button icon={<PackagePlus size={15} />} onClick={() => onShip({ tags: [a.tag], sam: a.assignedTo, direction: 'Rücksendung' })}>
                  Rücksendung anlegen
                </Button>
              )}
              {a.hostname && (
                <Button icon={<Monitor size={15} />} onClick={() => openRdp(a.hostname!)}>
                  Remote-Desktop ({a.hostname})
                </Button>
              )}
              {assignee && (
                <Button icon={<Users size={15} />} variant="ghost" onClick={() => navigate('ad', { sam: assignee.sam })}>
                  Benutzer im AD öffnen
                </Button>
              )}
              <Button icon={<Link2 size={15} />} variant="ghost" onClick={linkTicket} disabled={!activeTicket || activeTicket.linkedAssets.includes(a.tag)} title={activeTicket ? undefined : 'Kein Ticket in Bearbeitung'}>
                {activeTicket?.linkedAssets.includes(a.tag) ? `Mit ${activeTicket.id} verknüpft` : 'Mit aktivem Ticket verknüpfen'}
              </Button>
            </div>
          </div>
          {relatedShipments.length > 0 && (
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Sendungen</div>
              <ul className="space-y-1.5 text-sm">
                {relatedShipments.map((s) => (
                  <li key={s.id}>
                    <button type="button" className="text-sky-700 hover:underline" onClick={() => navigate('shipping', { id: s.id })}>
                      {s.id}
                    </button>{' '}
                    <span className="text-xs text-slate-500">
                      {s.direction} · {s.status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

// ─────────────── Neues Asset ───────────────

function NewAssetDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (tag: string) => void }) {
  const updateWorld = useStore((s) => s.updateWorld)
  const toast = useStore((s) => s.toast)
  const today = new Date().toISOString().slice(0, 10)
  const [f, setF] = useState({
    type: 'Notebook' as AssetType,
    manufacturer: '',
    model: '',
    serial: '',
    status: 'Lager' as AssetStatus,
    location: STOCK_LOCATION,
    hostname: '',
    purchaseDate: today,
    warrantyUntil: addYears(today, 3),
    costEur: '',
    notes: '',
  })
  const [error, setError] = useState('')
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((cur) => ({ ...cur, [k]: v }))

  const submit = () => {
    if (!f.manufacturer.trim() || !f.model.trim()) return setError('Hersteller und Modell sind Pflichtfelder.')
    if (!f.serial.trim()) return setError('Bitte die Seriennummer erfassen (steht auf dem Typenschild).')
    let tag = ''
    updateWorld(
      (w) => {
        if (w.assets.some((a) => a.serial.toLowerCase() === f.serial.trim().toLowerCase())) return
        tag = nextAssetTag(w, f.type)
        w.assets.unshift({
          tag,
          type: f.type,
          manufacturer: f.manufacturer.trim(),
          model: f.model.trim(),
          serial: f.serial.trim().toUpperCase(),
          status: f.status,
          location: f.location.trim() || STOCK_LOCATION,
          hostname: f.hostname.trim().toUpperCase() || undefined,
          purchaseDate: f.purchaseDate,
          warrantyUntil: f.warrantyUntil,
          costEur: Number(f.costEur.replace(',', '.')) || 0,
          notes: f.notes.trim(),
          history: [{ time: nowIso(), text: f.status === 'Bestellt' ? 'Bestellung erfasst' : 'Inventarisiert (Wareneingang)' }],
        })
      },
    )
    if (!tag) return setError('Diese Seriennummer ist bereits inventarisiert.')
    useStore.getState().log({ type: A.assetUpdated, target: tag, detail: `Neu angelegt: ${f.type} ${f.model.trim()}` })
    toast(`Asset ${tag} angelegt.`, 'success')
    onCreated(tag)
  }

  return (
    <Modal
      title="Neues Asset inventarisieren"
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button variant="primary" onClick={submit}>
            Anlegen
          </Button>
        </>
      }
    >
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Typ" hint="Die Inventarnummer wird automatisch vergeben (MW-<Typ>-<Nr.>).">
          <Select value={f.type} onChange={(e) => set('type', e.target.value as AssetType)}>
            {ASSET_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </Field>
        <Field label="Status">
          <Select value={f.status} onChange={(e) => set('status', e.target.value as AssetStatus)}>
            <option>Lager</option>
            <option>Bestellt</option>
          </Select>
        </Field>
        <Field label="Hersteller *">
          <Input value={f.manufacturer} onChange={(e) => set('manufacturer', e.target.value)} placeholder="z. B. Nordtec Computer" />
        </Field>
        <Field label="Modell *">
          <Input value={f.model} onChange={(e) => set('model', e.target.value)} placeholder="z. B. ProBook 14 G10" />
        </Field>
        <Field label="Seriennummer *">
          <Input value={f.serial} onChange={(e) => set('serial', e.target.value)} className="font-mono" />
        </Field>
        <Field label="Hostname (optional)">
          <Input value={f.hostname} onChange={(e) => set('hostname', e.target.value)} placeholder="z. B. NB-VT-010" className="font-mono" />
        </Field>
        <Field label="Standort">
          <Input value={f.location} onChange={(e) => set('location', e.target.value)} />
        </Field>
        <Field label="Anschaffungskosten (€)">
          <Input value={f.costEur} onChange={(e) => set('costEur', e.target.value)} inputMode="decimal" />
        </Field>
        <Field label="Kaufdatum">
          <Input type="date" value={f.purchaseDate} onChange={(e) => setF((cur) => ({ ...cur, purchaseDate: e.target.value, warrantyUntil: e.target.value ? addYears(e.target.value, 3) : cur.warrantyUntil }))} />
        </Field>
        <Field label="Garantie bis">
          <Input type="date" value={f.warrantyUntil} onChange={(e) => set('warrantyUntil', e.target.value)} />
        </Field>
        <Field label="Notiz" className="md:col-span-2">
          <Textarea rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </div>
      {error && <div className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-200">{error}</div>}
    </Modal>
  )
}
