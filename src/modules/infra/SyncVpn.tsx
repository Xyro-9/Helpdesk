// Cloud-Synchronisierung (SYNC01) und VPN-Gateway

import { Cloud, Eraser, RefreshCw, ShieldCheck, Users } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { A } from '@/core/actions'
import { effectiveUserMembers } from '@/core/ops/ad'
import { syncCloud } from '@/core/ops/cloud'
import { useStore } from '@/core/store'
import { fmtDateTime, fmtRelative } from '@/core/util'
import { Badge, Button, Card, Checkbox, tableCls } from '@/ui'
import { syncReadiness } from './lib'
import { OkBadge, ServiceButtons, ServiceStatusBadge, useRun, type LogEntry } from './shared'

export function SyncPanel() {
  const world = useStore((s) => s.world)
  const updateWorld = useStore((s) => s.updateWorld)
  const toast = useStore((s) => s.toast)
  const run = useRun()
  const sync = world.infra.sync
  const srv = world.infra.servers.find((s) => s.name === 'SYNC01')
  const svc = srv?.services.find((s) => s.name === 'CloudSync')
  const ready = syncReadiness(world)
  const [result, setResult] = useState<{ created: string[]; updated: string[]; blocked: string[]; ok: boolean; time: string } | null>(null)
  const name = (sam: string) => world.users.find((u) => u.sam === sam)?.displayName ?? sam

  const start = () => {
    const ok = syncReadiness(useStore.getState().world).ok
    const entry: LogEntry = { type: A.cloudSync, target: 'SYNC01', detail: '' }
    const box = { r: { created: [] as string[], updated: [] as string[], blocked: [] as string[] } }
    updateWorld((w) => {
      box.r = syncCloud(w)
      entry.detail = ok ? `Delta-Sync: ${box.r.created.length} neu, ${box.r.updated.length} aktualisiert, ${box.r.blocked.length} gesperrt` : 'fehlgeschlagen (Dienst nicht erreichbar)'
    }, entry)
    setResult({ ...box.r, ok, time: new Date().toISOString() })
    if (ok) toast(`Synchronisierung abgeschlossen: ${box.r.created.length} neu, ${box.r.updated.length} aktualisiert, ${box.r.blocked.length} gesperrt.`, 'success')
    else toast(`Synchronisierung fehlgeschlagen: ${ready.reason ?? 'Dienst nicht erreichbar'}`, 'error')
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <Info label="Status" value={<OkBadge ok={ready.ok} okText="Bereit" badText="Gestört" />} />
        <Info label="Letzter Lauf" value={`${fmtDateTime(sync.lastRun)} (${fmtRelative(sync.lastRun)})`} />
        <Info label="Intervall" value={`alle ${sync.intervalMin} Minuten`} />
        <Info label="Nächster geplanter Lauf" value={sync.enabled ? fmtRelative(new Date(new Date(sync.lastRun).getTime() + sync.intervalMin * 60_000).toISOString()) : 'deaktiviert'} />
      </div>
      <Card
        title={
          <span className="flex items-center gap-2">
            <Cloud size={16} className="text-sky-600" /> Hybrid-Synchronisierung AD → Cloud (SYNC01)
          </span>
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" icon={<RefreshCw size={15} />} onClick={start}>
            Synchronisierung jetzt starten
          </Button>
          <Checkbox
            label="Geplante Synchronisierung aktiviert"
            checked={sync.enabled}
            onChange={(v) => run((w) => void (w.infra.sync.enabled = v), { type: A.cloudSync, target: 'SYNC01', detail: v ? 'Zeitplan aktiviert' : 'Zeitplan deaktiviert' }, v ? 'Zeitplan aktiviert.' : 'Zeitplan deaktiviert.')}
          />
          <div className="flex-1" />
          {svc && (
            <span className="flex items-center gap-2 text-sm">
              Dienst CloudSync: <ServiceStatusBadge status={svc.status} />
              <ServiceButtons server="SYNC01" svc={svc} disabled={!srv?.online} />
            </span>
          )}
        </div>
        {!ready.ok && <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-200">{ready.reason}</p>}
        <p className="mt-3 text-xs text-slate-500">Synchronisiert werden Benutzer unterhalb von OU=Musterwerk mit E-Mail-Adresse. Neue Konten erscheinen erst nach einem Lauf im Cloud Admin Center; deaktivierte AD-Konten werden in der Cloud für die Anmeldung gesperrt. Kennwort-Hashes werden sofort synchronisiert.</p>
        {result && (
          <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
            <div className="mb-2 font-medium">
              Ergebnis des Laufs um {fmtDateTime(result.time)}: {result.ok ? 'erfolgreich' : <span className="text-rose-700">fehlgeschlagen</span>}
            </div>
            {result.ok && (
              <div className="grid gap-3 md:grid-cols-3">
                {(
                  [
                    ['Neu angelegt', result.created, 'green'],
                    ['Aktualisiert', result.updated, 'sky'],
                    ['Anmeldung gesperrt', result.blocked, 'amber'],
                  ] as const
                ).map(([label, list, tone]) => (
                  <div key={label}>
                    <div className="mb-1 flex items-center gap-2 text-xs text-slate-500">
                      {label} <Badge tone={tone}>{list.length}</Badge>
                    </div>
                    <ul className="text-xs">
                      {list.map((s) => (
                        <li key={s}>
                          {name(s)} <span className="text-slate-400">({s})</span>
                        </li>
                      ))}
                      {!list.length && <li className="text-slate-400">–</li>}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>
      <Card
        title={`Fehlerprotokoll (${sync.errors.length})`}
        actions={
          <Button size="sm" variant="ghost" icon={<Eraser size={13} />} disabled={!sync.errors.length} onClick={() => run((w) => void (w.infra.sync.errors = []), { type: A.cloudSync, target: 'SYNC01', detail: 'Fehlerprotokoll geleert' }, 'Fehlerprotokoll geleert.')}>
            Leeren
          </Button>
        }
      >
        {sync.errors.length ? (
          <ul className="space-y-1 font-mono text-xs text-rose-800">
            {sync.errors.slice(0, 50).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">Keine Synchronisierungsfehler.</p>
        )}
      </Card>
    </div>
  )
}

function Info({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-0.5 text-sm font-medium text-slate-800">{value}</div>
    </div>
  )
}

export function VpnPanel() {
  const world = useStore((s) => s.world)
  const navigate = useStore((s) => s.navigate)
  const gw = world.infra.vpnGateway
  const members = effectiveUserMembers(world, gw.allowedGroup)
  const name = (sam: string) => world.users.find((u) => u.sam === sam)?.displayName ?? sam
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <Info label="Status" value={<OkBadge ok={gw.online} okText="Online" badText="Offline" />} />
        <Info label="Öffentlicher Name" value={<span className="font-mono">{gw.host}</span>} />
        <Info label="Internetanbindung" value={<OkBadge ok={world.infra.internetUp} okText="Verbunden" badText="Gestört" />} />
        <Info label="Aktive Sitzungen" value={String(gw.activeSessions.length)} />
      </div>
      <Card
        title={
          <span className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-sky-600" /> Zugriffsberechtigung
          </span>
        }
      >
        <p className="text-sm text-slate-700">
          Einwahl erlaubt für Mitglieder der Gruppe{' '}
          <button type="button" className="font-medium text-sky-700 hover:underline" onClick={() => navigate('ad', { group: gw.allowedGroup })}>
            {gw.allowedGroup}
          </button>{' '}
          ({members.length} Benutzer, inkl. verschachtelter Gruppen). Neue Berechtigungen nur mit Freigabe des Vorgesetzten.
        </p>
      </Card>
      <Card title="Aktive VPN-Sitzungen" bodyClassName="p-0">
        <table className={tableCls}>
          <thead>
            <tr>
              <th>Benutzer</th>
              <th>Anmeldename</th>
              <th>Berechtigt</th>
            </tr>
          </thead>
          <tbody>
            {gw.activeSessions.map((s) => (
              <tr key={s}>
                <td>
                  <span className="flex items-center gap-2">
                    <Users size={14} className="text-slate-400" /> {name(s)}
                  </span>
                </td>
                <td className="font-mono text-xs">{s}</td>
                <td>{members.includes(s) ? <Badge tone="green">Ja</Badge> : <Badge tone="red">Nein</Badge>}</td>
              </tr>
            ))}
            {!gw.activeSessions.length && (
              <tr>
                <td colSpan={3} className="py-5 text-center text-slate-400">
                  Keine aktiven Sitzungen.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
