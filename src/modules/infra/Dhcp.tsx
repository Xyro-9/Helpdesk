// DHCP-Verwaltung (DC01): Bereiche, Auslastung, Ausschlüsse, Reservierungen, Leases, Optionen

import { Eraser, Pencil, Plus, Power, PowerOff, Router, Search, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { A } from '@/core/actions'
import { useStore } from '@/core/store'
import type { DhcpScope } from '@/core/types'
import { fmtDateTime, isValidIp } from '@/core/util'
import { Badge, Button, Card, Field, Input, Modal, Tabs, cx, tableCls } from '@/ui'
import { cleanupLeases, leaseExpired, normalizeMac, scopeNetworkLabel, scopeStats, validateExclusion, validateReservation, validateScopeEdit, type ScopeEdit } from './lib'
import { Meter, ServiceButtons, ServiceStatusBadge, useRun } from './shared'

type ScopeTab = 'pool' | 'leases' | 'reservations' | 'options'

export function DhcpPanel({ initialScope }: { initialScope?: string }) {
  const scopes = useStore((s) => s.world.infra.dhcpScopes)
  const dc = useStore((s) => s.world.infra.servers.find((x) => x.name === 'DC01'))
  const [selId, setSelId] = useState(initialScope ?? scopes[0]?.id)
  const scope = scopes.find((s) => s.id === selId) ?? scopes[0]
  const svc = dc?.services.find((s) => s.name === 'DHCPServer')
  const serverOk = !!dc?.online && svc?.status === 'Wird ausgeführt'

  return (
    <div className="space-y-4">
      <div className={cx('flex flex-wrap items-center gap-3 rounded-lg border bg-white px-4 py-3 shadow-sm', serverOk ? 'border-slate-200' : 'border-rose-300 bg-rose-50/40')}>
        <Router size={18} className={serverOk ? 'text-emerald-600' : 'text-rose-600'} />
        <div className="text-sm">
          <div className="font-medium text-slate-800">DHCP-Server dc01.musterwerk.local (10.10.0.10)</div>
          <div className="text-xs text-slate-500">Dienst „DHCP-Server“ (DHCPServer) · Server {dc?.online ? 'online' : 'offline'}</div>
        </div>
        {svc && <ServiceStatusBadge status={svc.status} />}
        <div className="flex-1" />
        {dc && svc && <ServiceButtons server="DC01" svc={svc} disabled={!dc.online} />}
      </div>
      {!serverOk && <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-200">Der DHCP-Serverdienst läuft nicht – Clients erhalten keine Adressen (APIPA 169.254.x.x) und können ihre Leases nicht erneuern.</div>}

      <div className="grid gap-4 xl:grid-cols-[20rem_1fr]">
        <div className="space-y-2">
          <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">IPv4-Bereiche</div>
          {scopes.map((s) => {
            const st = scopeStats(s)
            return (
              <button key={s.id} type="button" onClick={() => setSelId(s.id)} className={cx('w-full rounded-lg border bg-white p-3 text-left shadow-sm', scope?.id === s.id ? 'border-sky-400 ring-2 ring-sky-100' : 'border-slate-200 hover:border-sky-300')}>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-800">[{s.id}] {s.name}</span>
                  <span className="ml-auto">{s.active ? <Badge tone="green">Aktiv</Badge> : <Badge tone="red">Deaktiviert</Badge>}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                  <span>
                    {st.used} von {st.pool} belegt
                  </span>
                  <span className={cx(st.pct >= 90 && 'font-semibold text-rose-700')}>{st.pct} %</span>
                </div>
                <Meter pct={st.pct} className="mt-1" />
                {(st.bad > 0 || st.free === 0) && (
                  <div className="mt-1.5 flex gap-1">
                    {st.free === 0 && <Badge tone="red">Bereich erschöpft</Badge>}
                    {st.bad > 0 && <Badge tone="amber">{st.bad}× BAD_ADDRESS</Badge>}
                  </div>
                )}
              </button>
            )
          })}
        </div>
        {scope && <ScopeDetail key={scope.id} scope={scope} />}
      </div>
    </div>
  )
}

function ScopeDetail({ scope }: { scope: DhcpScope }) {
  const run = useRun()
  const [tab, setTab] = useState<ScopeTab>('pool')
  const [edit, setEdit] = useState(false)
  const st = scopeStats(scope)
  const log = (detail: string) => ({ type: A.dhcpChanged, target: scope.id, detail })
  const mutate = (fn: (s: DhcpScope) => string | null | void, detail: string, success?: string) =>
    run(
      (w) => {
        const s = w.infra.dhcpScopes.find((x) => x.id === scope.id)
        if (!s) return 'Bereich nicht gefunden.'
        return fn(s) ?? null
      },
      log(detail),
      success,
    )

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          Bereich [{scope.id}] {scope.name} <span className="font-mono text-xs font-normal text-slate-500">{scopeNetworkLabel(scope)}</span>
        </span>
      }
      actions={
        <>
          <Button size="sm" icon={<Pencil size={13} />} onClick={() => setEdit(true)}>
            Bereich bearbeiten…
          </Button>
          {scope.active ? (
            <Button
              size="sm"
              icon={<PowerOff size={13} />}
              onClick={() =>
                mutate(
                  (s) => {
                    s.active = false
                  },
                  'Bereich deaktiviert',
                  `Bereich ${scope.name} wurde deaktiviert.`,
                )
              }
            >
              Deaktivieren
            </Button>
          ) : (
            <Button
              size="sm"
              variant="success"
              icon={<Power size={13} />}
              onClick={() =>
                mutate(
                  (s) => {
                    s.active = true
                  },
                  'Bereich aktiviert',
                  `Bereich ${scope.name} wurde aktiviert.`,
                )
              }
            >
              Aktivieren
            </Button>
          )}
        </>
      }
    >
      <div className="mb-4 grid gap-3 text-sm sm:grid-cols-4">
        <Kpi label="Adresspool" value={`${scope.rangeStart} – ${scope.rangeEnd}`} />
        <Kpi label="Verfügbar (ohne Ausschlüsse)" value={String(st.pool)} />
        <Kpi label="Belegt" value={`${st.used} (${st.pct} %)`} tone={st.pct >= 90 ? 'red' : st.pct >= 75 ? 'amber' : undefined} />
        <Kpi label="Frei" value={String(st.free)} tone={st.free === 0 ? 'red' : undefined} />
      </div>
      <Tabs
        tabs={[
          { id: 'pool', label: `Adresspool (${scope.exclusions.length} Ausschl.)` },
          { id: 'leases', label: `Adressleases (${scope.leases.length})` },
          { id: 'reservations', label: `Reservierungen (${scope.reservations.length})` },
          { id: 'options', label: 'Bereichsoptionen' },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div className="pt-4">
        {tab === 'pool' && <PoolTab scope={scope} mutate={mutate} />}
        {tab === 'leases' && <LeasesTab scope={scope} mutate={mutate} />}
        {tab === 'reservations' && <ReservationsTab scope={scope} mutate={mutate} />}
        {tab === 'options' && (
          <table className={tableCls}>
            <thead>
              <tr>
                <th>Option</th>
                <th>Wert</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>003 Router (Standardgateway)</td>
                <td className="font-mono">{scope.router || '–'}</td>
              </tr>
              <tr>
                <td>006 DNS-Server</td>
                <td className="font-mono">{scope.dnsServers.join(', ') || '–'}</td>
              </tr>
              <tr>
                <td>015 DNS-Domänenname</td>
                <td className="font-mono">{scope.domainName}</td>
              </tr>
              <tr>
                <td>051 Leasedauer</td>
                <td>{fmtLease(scope.leaseHours)}</td>
              </tr>
              <tr>
                <td>Subnetzmaske</td>
                <td className="font-mono">{scope.mask}</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
      {edit && <ScopeEditDialog scope={scope} onClose={() => setEdit(false)} />}
    </Card>
  )
}

type Mutate = (fn: (s: DhcpScope) => string | null | void, detail: string, success?: string) => boolean

function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'red' | 'amber' }) {
  return (
    <div className="rounded-md bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={cx('font-medium', tone === 'red' ? 'text-rose-700' : tone === 'amber' ? 'text-amber-700' : 'text-slate-800')}>{value}</div>
    </div>
  )
}

const fmtLease = (h: number) => {
  const d = Math.floor(h / 24)
  const r = h % 24
  return [d ? `${d} Tag(e)` : '', r ? `${r} Std.` : ''].filter(Boolean).join(' ') || '0 Std.'
}

function PoolTab({ scope, mutate }: { scope: DhcpScope; mutate: Mutate }) {
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const add = () => {
    const e = validateExclusion(scope, start.trim(), end.trim())
    setErr(e)
    if (e) return
    const ex = { start: start.trim(), end: end.trim() || start.trim() }
    if (mutate((s) => void s.exclusions.push(ex), `Ausschluss hinzugefügt ${ex.start}–${ex.end}`, `Ausschlussbereich ${ex.start} – ${ex.end} hinzugefügt.`)) {
      setStart('')
      setEnd('')
    }
  }
  return (
    <div className="space-y-4">
      <table className={tableCls}>
        <thead>
          <tr>
            <th>Startadresse</th>
            <th>Endadresse</th>
            <th>Beschreibung</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="font-mono">{scope.rangeStart}</td>
            <td className="font-mono">{scope.rangeEnd}</td>
            <td className="text-xs text-slate-500">Adressbereich für die Verteilung</td>
            <td />
          </tr>
          {scope.exclusions.map((x, i) => (
            <tr key={`${x.start}-${x.end}-${i}`} className="text-slate-600">
              <td className="font-mono">{x.start}</td>
              <td className="font-mono">{x.end}</td>
              <td className="text-xs">Von der Verteilung ausgeschlossene IP-Adressen</td>
              <td className="text-right">
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Trash2 size={13} />}
                  onClick={() =>
                    mutate(
                      (s) => {
                        const idx = s.exclusions.findIndex((e) => e.start === x.start && e.end === x.end)
                        if (idx < 0) return 'Ausschluss nicht gefunden.'
                        s.exclusions.splice(idx, 1)
                      },
                      `Ausschluss entfernt ${x.start}–${x.end}`,
                      'Ausschlussbereich entfernt.',
                    )
                  }
                >
                  Entfernen
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-wrap items-end gap-2 rounded-md border border-slate-200 bg-slate-50 p-3">
        <Field label="Ausschluss: Startadresse">
          <Input className="w-40 font-mono" value={start} onChange={(e) => setStart(e.target.value)} placeholder={scope.rangeStart} />
        </Field>
        <Field label="Endadresse (optional)">
          <Input className="w-40 font-mono" value={end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
        <Button icon={<Plus size={14} />} onClick={add}>
          Ausschluss hinzufügen
        </Button>
        {err && <span className="text-sm text-rose-700">{err}</span>}
      </div>
    </div>
  )
}

function LeasesTab({ scope, mutate }: { scope: DhcpScope; mutate: Mutate }) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<string | null>(null)
  const st = scopeStats(scope)
  const leases = useMemo(() => {
    const t = q.trim().toLowerCase()
    return scope.leases.filter((l) => !t || l.ip.includes(t) || l.hostname.toLowerCase().includes(t) || l.mac.toLowerCase().includes(t)).sort((a, b) => a.ip.split('.').map(Number)[3] - b.ip.split('.').map(Number)[3])
  }, [scope.leases, q])
  const selLease = scope.leases.find((l) => l.ip === sel)
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-64">
          <Search size={14} className="absolute top-2.5 left-2.5 text-slate-400" />
          <Input className="pl-8" placeholder="IP, Name oder MAC …" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Button
          size="sm"
          icon={<Trash2 size={13} />}
          disabled={!selLease}
          onClick={() =>
            selLease &&
            mutate(
              (s) => {
                const before = s.leases.length
                s.leases = s.leases.filter((l) => l.ip !== selLease.ip)
                if (s.leases.length === before) return 'Lease nicht gefunden.'
              },
              `Lease gelöscht ${selLease.ip} (${selLease.hostname || selLease.mac || 'unbekannt'})`,
              `Lease ${selLease.ip} wurde gelöscht.`,
            ) && setSel(null)
          }
        >
          Lease löschen
        </Button>
        <Button
          size="sm"
          disabled={!selLease || !normalizeMac(selLease.mac) || scope.reservations.some((r) => r.ip === selLease.ip)}
          title="Adresse dauerhaft für dieses Gerät reservieren"
          onClick={() => {
            if (!selLease) return
            const mac = normalizeMac(selLease.mac)!
            const name = selLease.hostname.split('.')[0].toUpperCase()
            mutate(
              (s) => {
                if (s.reservations.some((r) => r.ip === selLease.ip || normalizeMac(r.mac) === mac)) return 'Für diese Adresse oder MAC existiert bereits eine Reservierung.'
                s.reservations.push({ ip: selLease.ip, mac, name })
                const l = s.leases.find((x) => x.ip === selLease.ip)
                if (l) l.state = 'Reservierung'
              },
              `Reservierung hinzugefügt ${selLease.ip} (${mac}) aus Lease`,
              `Reservierung für ${name} (${selLease.ip}) angelegt.`,
            )
          }}
        >
          Zu Reservierung hinzufügen
        </Button>
        <div className="flex-1" />
        <Button
          size="sm"
          icon={<Eraser size={13} />}
          disabled={!st.expired && !st.bad}
          onClick={() => {
            const box = { expired: 0, bad: 0 }
            mutate(
              (s) => {
                const r = cleanupLeases(s)
                box.expired = r.expired
                box.bad = r.bad
              },
              `Leases bereinigt (${st.expired} abgelaufen, ${st.bad} BAD_ADDRESS)`,
            ) && useStore.getState().toast(`${box.expired} abgelaufene und ${box.bad} BAD_ADDRESS-Lease(s) entfernt.`, 'success')
          }}
        >
          Abgelaufene/BAD_ADDRESS bereinigen ({st.expired + st.bad})
        </Button>
      </div>
      <div className="max-h-[26rem] overflow-auto rounded-md border border-slate-200">
        <table className={tableCls}>
          <thead>
            <tr>
              <th>Client-IP-Adresse</th>
              <th>Name</th>
              <th>Leaseablauf</th>
              <th>Eindeutige ID (MAC)</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {leases.map((l) => {
              const expired = leaseExpired(l)
              return (
                <tr key={l.ip + l.mac + l.hostname} className={cx('cursor-pointer', sel === l.ip ? 'bg-sky-100' : 'hover:bg-slate-50', expired && 'text-slate-400')} onClick={() => setSel(l.ip)}>
                  <td className="font-mono">{l.ip}</td>
                  <td>{l.hostname || <span className="text-slate-400">–</span>}</td>
                  <td className="text-xs">{l.state === 'Reservierung' ? 'Reservierung (aktiv)' : fmtDateTime(l.expires)}</td>
                  <td className="font-mono text-xs">{l.mac || '–'}</td>
                  <td>
                    {l.state === 'BAD_ADDRESS' ? (
                      <Badge tone="red">BAD_ADDRESS</Badge>
                    ) : expired ? (
                      <Badge>Abgelaufen</Badge>
                    ) : l.state === 'Reservierung' ? (
                      <Badge tone="violet">Reservierung</Badge>
                    ) : (
                      <Badge tone="green">Aktiv</Badge>
                    )}
                  </td>
                </tr>
              )
            })}
            {!leases.length && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-slate-400">
                  Keine Adressleases.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">BAD_ADDRESS: Der Server hat einen Adresskonflikt erkannt (Adresse antwortet bereits auf Ping, z. B. statisch vergebenes Gerät). Ursache prüfen, dann bereinigen.</p>
    </div>
  )
}

function ReservationsTab({ scope, mutate }: { scope: DhcpScope; mutate: Mutate }) {
  const [name, setName] = useState('')
  const [ip, setIp] = useState('')
  const [mac, setMac] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const add = () => {
    const e = validateReservation(scope, ip.trim(), mac, name)
    setErr(e)
    if (e) return
    const m = normalizeMac(mac)!
    const r = { ip: ip.trim(), mac: m, name: name.trim() }
    if (mutate((s) => void s.reservations.push(r), `Reservierung hinzugefügt ${r.ip} (${m}) ${r.name}`, `Reservierung ${r.name} → ${r.ip} angelegt.`)) {
      setName('')
      setIp('')
      setMac('')
    }
  }
  return (
    <div className="space-y-4">
      <table className={tableCls}>
        <thead>
          <tr>
            <th>Reservierungsname</th>
            <th>IP-Adresse</th>
            <th>MAC-Adresse</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {scope.reservations.map((r) => (
            <tr key={r.ip}>
              <td>{r.name}</td>
              <td className="font-mono">{r.ip}</td>
              <td className="font-mono text-xs">{r.mac}</td>
              <td className="text-right">
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Trash2 size={13} />}
                  onClick={() =>
                    mutate(
                      (s) => {
                        const before = s.reservations.length
                        s.reservations = s.reservations.filter((x) => x.ip !== r.ip)
                        if (s.reservations.length === before) return 'Reservierung nicht gefunden.'
                        for (const l of s.leases) if (l.ip === r.ip && l.state === 'Reservierung') l.state = 'Aktiv'
                      },
                      `Reservierung gelöscht ${r.ip} (${r.mac}) ${r.name}`,
                      `Reservierung ${r.name} gelöscht.`,
                    )
                  }
                >
                  Löschen
                </Button>
              </td>
            </tr>
          ))}
          {!scope.reservations.length && (
            <tr>
              <td colSpan={4} className="py-5 text-center text-slate-400">
                Keine Reservierungen.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="flex flex-wrap items-end gap-2 rounded-md border border-slate-200 bg-slate-50 p-3">
        <Field label="Reservierungsname">
          <Input className="w-44" value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. PRN-1OG-SW" />
        </Field>
        <Field label="IP-Adresse">
          <Input className="w-36 font-mono" value={ip} onChange={(e) => setIp(e.target.value)} placeholder={scope.rangeStart.replace(/\d+$/, '120')} />
        </Field>
        <Field label="MAC-Adresse">
          <Input className="w-48 font-mono" value={mac} onChange={(e) => setMac(e.target.value)} placeholder="3C-52-82-1A-2B-3C" />
        </Field>
        <Button icon={<Plus size={14} />} onClick={add}>
          Hinzufügen
        </Button>
        {err && <span className="w-full text-sm text-rose-700">{err}</span>}
      </div>
    </div>
  )
}

function ScopeEditDialog({ scope, onClose }: { scope: DhcpScope; onClose: () => void }) {
  const run = useRun()
  const [name, setName] = useState(scope.name)
  const [rangeStart, setRangeStart] = useState(scope.rangeStart)
  const [rangeEnd, setRangeEnd] = useState(scope.rangeEnd)
  const [days, setDays] = useState(String(Math.floor(scope.leaseHours / 24)))
  const [hours, setHours] = useState(String(scope.leaseHours % 24))
  const [router, setRouter] = useState(scope.router)
  const [dns, setDns] = useState(scope.dnsServers.join(', '))
  const [domainName, setDomainName] = useState(scope.domainName)
  const [err, setErr] = useState<string | null>(null)
  const save = () => {
    const edit: ScopeEdit = {
      name: name.trim(),
      rangeStart: rangeStart.trim(),
      rangeEnd: rangeEnd.trim(),
      router: router.trim(),
      dnsServers: dns
        .split(/[\s,;]+/)
        .map((d) => d.trim())
        .filter(Boolean),
      domainName: domainName.trim(),
      leaseHours: (parseInt(days || '0', 10) || 0) * 24 + (parseInt(hours || '0', 10) || 0),
    }
    const e = validateScopeEdit(scope, edit)
    setErr(e)
    if (e) return
    const changed = (Object.keys(edit) as (keyof ScopeEdit)[]).filter((k) => JSON.stringify(edit[k]) !== JSON.stringify(scope[k]))
    if (!changed.length) return onClose()
    const labels: Record<keyof ScopeEdit, string> = { name: 'Name', rangeStart: 'Startadresse', rangeEnd: 'Endadresse', router: 'Router', dnsServers: 'DNS-Server', domainName: 'Domänenname', leaseHours: 'Leasedauer' }
    const detail = 'Bereich bearbeitet: ' + changed.map((k) => `${labels[k]}=${Array.isArray(edit[k]) ? (edit[k] as string[]).join('/') : edit[k]}`).join(', ')
    if (
      run(
        (w) => {
          const s = w.infra.dhcpScopes.find((x) => x.id === scope.id)
          if (!s) return 'Bereich nicht gefunden.'
          Object.assign(s, edit)
          return null
        },
        { type: A.dhcpChanged, target: scope.id, detail },
        `Bereich ${edit.name} wurde aktualisiert.`,
      )
    )
      onClose()
  }
  return (
    <Modal
      title={`Eigenschaften von Bereich [${scope.id}]`}
      onClose={onClose}
      size="md"
      footer={
        <>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" onClick={save}>
            OK
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Bereichsname" className="sm:col-span-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Startadresse">
          <Input className="font-mono" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} />
        </Field>
        <Field label="Endadresse">
          <Input className="font-mono" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} />
        </Field>
        <Field label="Subnetzmaske">
          <Input className="font-mono" value={scope.mask} disabled />
        </Field>
        <Field label="Leasedauer">
          <div className="flex items-center gap-1.5 text-sm">
            <Input className="w-16" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ''))} /> Tage
            <Input className="w-14" value={hours} onChange={(e) => setHours(e.target.value.replace(/\D/g, ''))} /> Std.
          </div>
        </Field>
        <Field label="003 Router (Standardgateway)">
          <Input className={cx('font-mono', router && !isValidIp(router) && 'border-rose-400')} value={router} onChange={(e) => setRouter(e.target.value)} />
        </Field>
        <Field label="006 DNS-Server (kommagetrennt)">
          <Input className="font-mono" value={dns} onChange={(e) => setDns(e.target.value)} />
        </Field>
        <Field label="015 DNS-Domänenname" className="sm:col-span-2">
          <Input className="font-mono" value={domainName} onChange={(e) => setDomainName(e.target.value)} />
        </Field>
      </div>
      {err && <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-200">{err}</p>}
      <p className="mt-3 text-xs text-slate-500">Geänderte Optionen erhalten Clients erst bei der nächsten Lease-Erneuerung (z. B. „ipconfig /renew“).</p>
    </Modal>
  )
}
