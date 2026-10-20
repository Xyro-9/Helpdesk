// DNS-Verwaltung: Zonen, Einträge (anlegen, bearbeiten, löschen), Weiterleitungsstatus

import { Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { A } from '@/core/actions'
import { useStore } from '@/core/store'
import type { DnsRecord, DnsZone } from '@/core/types'
import { Badge, Button, Field, Input, Modal, Select, cx, tableCls } from '@/ui'
import { DNS_TYPES, isSvcRunning, relativeName, validateDnsRecord } from './lib'
import { OkBadge, ServiceButtons, useRun } from './shared'

export function DnsPanel() {
  const zones = useStore((s) => s.world.infra.dnsZones)
  const fwOk = useStore((s) => s.world.infra.dnsForwardersOk)
  const internetUp = useStore((s) => s.world.infra.internetUp)
  const dc01 = useStore((s) => s.world.infra.servers.find((x) => x.name === 'DC01'))
  const dc02 = useStore((s) => s.world.infra.servers.find((x) => x.name === 'DC02'))
  const toast = useStore((s) => s.toast)
  const [zoneName, setZoneName] = useState(zones[0]?.name ?? '')
  const zone = zones.find((z) => z.name === zoneName) ?? zones[0]
  const dnsSvc = dc01?.services.find((s) => s.name === 'DNS')

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        {[dc01, dc02].map(
          (srv) =>
            srv && (
              <div key={srv.name} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                <div className="mb-1 flex items-center gap-2 text-sm font-medium">
                  DNS-Server {srv.name} <span className="font-mono text-xs text-slate-500">{srv.ip}</span>
                  <span className="ml-auto">
                    <OkBadge ok={isSvcRunning(srv, 'DNS')} okText="Dienst läuft" badText="Dienst beendet" />
                  </span>
                </div>
                {srv.name === 'DC01' && dnsSvc && <ServiceButtons server="DC01" svc={dnsSvc} disabled={!srv.online} />}
                {srv.name === 'DC02' && (() => {
                  const s = srv.services.find((x) => x.name === 'DNS')
                  return s ? <ServiceButtons server="DC02" svc={s} disabled={!srv.online} /> : null
                })()}
              </div>
            ),
        )}
        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <div className="mb-1 flex items-center gap-2 text-sm font-medium">
            Weiterleitungen (Provider-DNS)
            <span className="ml-auto">
              <OkBadge ok={fwOk && internetUp} okText="Erreichbar" badText="Keine Antwort" />
            </span>
          </div>
          <div className="text-xs text-slate-500">Externe Namen (z. B. www.suche.example) werden an die DNS-Server des Providers weitergeleitet.</div>
          <Button size="sm" className="mt-2" onClick={() => toast(fwOk && internetUp ? 'Test der Weiterleitungen erfolgreich: alle Server antworten.' : 'Test fehlgeschlagen: Zeitüberschreitung bei den Weiterleitungsservern. Internetanbindung/Provider prüfen bzw. an Netzwerk & Infrastruktur eskalieren.', fwOk && internetUp ? 'success' : 'error')}>
            Weiterleitungen testen
          </Button>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
        <div className="space-y-1">
          <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Forward-/Reverse-Lookupzonen</div>
          {zones.map((z) => (
            <button key={z.name} type="button" onClick={() => setZoneName(z.name)} className={cx('w-full rounded-md border px-3 py-2 text-left text-sm', zone?.name === z.name ? 'border-sky-400 bg-sky-50' : 'border-slate-200 bg-white hover:border-sky-300')}>
              <div className="font-medium text-slate-800">{z.name}</div>
              <div className="text-xs text-slate-500">
                {z.type} · {z.records.length} Einträge
              </div>
            </button>
          ))}
        </div>
        {zone && <ZoneRecords key={zone.name} zone={zone} />}
      </div>
    </div>
  )
}

function ZoneRecords({ zone }: { zone: DnsZone }) {
  const run = useRun()
  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  const [edit, setEdit] = useState<{ index: number; rec: DnsRecord } | null>(null)
  const [del, setDel] = useState<number | null>(null)
  const readOnly = zone.type === 'Weiterleitung'
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase()
    return zone.records
      .map((r, index) => ({ r, index }))
      .filter(({ r }) => (!type || r.type === type) && (!t || r.name.toLowerCase().includes(t) || r.value.toLowerCase().includes(t)))
      .sort((a, b) => (a.r.name === '@' ? -1 : 0) - (b.r.name === '@' ? -1 : 0) || a.r.name.localeCompare(b.r.name) || a.r.type.localeCompare(b.r.type))
  }, [zone.records, q, type])
  const remove = (index: number) => {
    const r = zone.records[index]
    run(
      (w) => {
        const z = w.infra.dnsZones.find((x) => x.name === zone.name)
        const i = z ? z.records.findIndex((x) => x.name === r.name && x.type === r.type && x.value === r.value) : -1
        if (!z || i < 0) return 'Eintrag nicht gefunden.'
        z.records.splice(i, 1)
        return null
      },
      { type: A.dnsChanged, target: zone.name, detail: `Gelöscht: ${r.name} ${r.type} ${r.value}` },
      `Eintrag ${r.name} (${r.type}) gelöscht.`,
    )
  }
  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <div className="font-semibold text-slate-800">{zone.name}</div>
        <Badge>{zone.type}</Badge>
        <div className="flex-1" />
        <div className="relative w-56">
          <Search size={14} className="absolute top-2.5 left-2.5 text-slate-400" />
          <Input className="pl-8" placeholder="Name oder Wert …" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select className="w-32" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Alle Typen</option>
          {[...DNS_TYPES, 'SOA'].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </Select>
        <Button variant="primary" icon={<Plus size={14} />} disabled={readOnly} onClick={() => setEdit({ index: -1, rec: { name: '', type: 'A', value: '', ttl: 3600 } })}>
          Neuer Eintrag…
        </Button>
      </div>
      {readOnly && <p className="text-xs text-slate-500">Bedingte Weiterleitung – Einträge werden beim Provider gepflegt.</p>}
      <div className="max-h-[28rem] overflow-auto rounded-md border border-slate-200">
        <table className={tableCls}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Typ</th>
              <th>Daten</th>
              <th>TTL</th>
              <th>Zeitstempel</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ r, index }) => (
              <tr key={index}>
                <td className="font-mono text-xs">{r.name === '@' ? '(identisch mit übergeordnetem Ordner)' : r.name}</td>
                <td>
                  <Badge tone={r.type === 'A' ? 'sky' : r.type === 'CNAME' ? 'violet' : 'gray'}>{r.type}</Badge>
                </td>
                <td className="font-mono text-xs break-all">{r.value}</td>
                <td className="text-xs">{r.ttl}</td>
                <td className="text-xs text-slate-500">{r.dynamic ? 'dynamisch' : 'statisch'}</td>
                <td className="text-right whitespace-nowrap">
                  {!readOnly && r.type !== 'SOA' && (
                    <>
                      <Button size="sm" variant="ghost" icon={<Pencil size={12} />} onClick={() => setEdit({ index, rec: r })}>
                        Bearbeiten
                      </Button>
                      <Button size="sm" variant="ghost" icon={<Trash2 size={12} />} onClick={() => setDel(index)}>
                        Löschen
                      </Button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-slate-400">
                  Keine Einträge.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {edit && <RecordDialog zone={zone} index={edit.index} initial={edit.rec} onClose={() => setEdit(null)} />}
      {del !== null && zone.records[del] && (
        <Modal
          title="Eintrag löschen"
          size="sm"
          onClose={() => setDel(null)}
          footer={
            <>
              <Button onClick={() => setDel(null)}>Abbrechen</Button>
              <Button
                variant="danger"
                onClick={() => {
                  remove(del)
                  setDel(null)
                }}
              >
                Löschen
              </Button>
            </>
          }
        >
          <p className="text-sm">
            Soll der Eintrag <strong className="font-mono">{zone.records[del].name}</strong> ({zone.records[del].type} → {zone.records[del].value}) gelöscht werden?
            {['NS', 'SRV'].includes(zone.records[del].type) && <span className="mt-2 block text-rose-700">Achtung: NS-/SRV-Einträge sind für die Domänenanmeldung wichtig!</span>}
          </p>
        </Modal>
      )}
    </div>
  )
}

function RecordDialog({ zone, index, initial, onClose }: { zone: DnsZone; index: number; initial: DnsRecord; onClose: () => void }) {
  const run = useRun()
  const [name, setName] = useState(initial.name)
  const [type, setType] = useState<DnsRecord['type']>(initial.type)
  const [value, setValue] = useState(initial.value)
  const [ttl, setTtl] = useState(String(initial.ttl))
  const [err, setErr] = useState<string | null>(null)
  const isNew = index < 0
  const hints: Partial<Record<DnsRecord['type'], string>> = {
    A: 'IPv4-Adresse, z. B. 10.10.0.40',
    AAAA: 'IPv6-Adresse',
    CNAME: 'Zielhost (FQDN), z. B. app01.musterwerk.local.',
    MX: 'Priorität + Mailserver, z. B. 10 mail.musterwerk.example.',
    SRV: 'Priorität Gewichtung Port Ziel, z. B. 0 100 389 dc01.musterwerk.local.',
    PTR: 'Hostname (FQDN)',
    TXT: 'Beliebiger Text',
    NS: 'Namensserver (FQDN)',
  }
  const save = () => {
    const rec: DnsRecord = { name: relativeName(name, zone.name), type, value: value.trim(), ttl: Number(ttl) }
    const e = validateDnsRecord(zone.name, rec, zone.records, index)
    setErr(e)
    if (e) return
    const old = zone.records[index]
    const ok = run(
      (w) => {
        const z = w.infra.dnsZones.find((x) => x.name === zone.name)
        if (!z) return 'Zone nicht gefunden.'
        if (isNew) z.records.push(rec)
        else {
          const i = z.records.findIndex((x) => x.name === old.name && x.type === old.type && x.value === old.value)
          if (i < 0) return 'Eintrag nicht gefunden.'
          z.records[i] = rec
        }
        return null
      },
      { type: A.dnsChanged, target: zone.name, detail: isNew ? `Neu: ${rec.name} ${rec.type} ${rec.value}` : `Geändert: ${old.name} ${old.type} ${old.value} → ${rec.name} ${rec.type} ${rec.value}` },
      isNew ? `Eintrag ${rec.name} (${rec.type}) angelegt.` : `Eintrag ${rec.name} (${rec.type}) geändert.`,
    )
    if (ok) onClose()
  }
  return (
    <Modal
      title={isNew ? `Neuer Eintrag in ${zone.name}` : `Eintrag bearbeiten – ${initial.name}`}
      size="md"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" onClick={save}>
            {isNew ? 'Eintrag hinzufügen' : 'OK'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <Field label="Name (leer bzw. @ = übergeordnete Domäne)" hint={`FQDN: ${relativeName(name, zone.name) === '@' ? zone.name : `${relativeName(name, zone.name)}.${zone.name}`}`}>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Typ">
          <Select value={type} onChange={(e) => setType(e.target.value as DnsRecord['type'])}>
            {DNS_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </Field>
        <Field label="Daten" hint={hints[type]} className="sm:col-span-2">
          <Input className="font-mono" value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
        <Field label="TTL (Sekunden)">
          <Input value={ttl} onChange={(e) => setTtl(e.target.value.replace(/\D/g, ''))} />
        </Field>
      </div>
      {err && <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-200">{err}</p>}
      <p className="mt-3 text-xs text-slate-500">Clients übernehmen Änderungen erst nach Ablauf der TTL bzw. nach „ipconfig /flushdns“.</p>
    </Modal>
  )
}
