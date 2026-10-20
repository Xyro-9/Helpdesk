// Synchronisierungsstatus (AD → Cloud). Ausgelöst wird der Sync lokal (SYNC01), nicht hier.

import { CircleCheck, CircleX, Info } from 'lucide-react'
import { useMemo } from 'react'
import { fmtDateTime, fmtRelative, minutesFromNow } from '@/core/util'
import { Badge, tableCls } from '@/ui'
import { Link, Notice } from '../shared'
import { ADMIN, Crumbs, PageTitle, Panel, userHref, type AdminCtx } from './ui'

export function Sync({ ctx }: { ctx: AdminCtx }) {
  const { api, world } = ctx
  const sync = world.infra.sync
  const srv = world.infra.servers.find((s) => s.name === 'SYNC01')
  const svc = srv?.services.find((s) => s.name === 'CloudSync')
  const running = !!srv?.online && svc?.status === 'Wird ausgeführt'
  const { pending, mismatch, syncedCount } = useMemo(() => {
    const synced = world.cloud.users.filter((c) => c.synced)
    const pending = world.users.filter((u) => !u.isServiceAccount && u.mail && u.ou.includes('OU=Musterwerk') && !world.cloud.users.some((c) => c.sam === u.sam))
    const mismatch = world.users.filter((u) => !u.enabled && world.cloud.users.some((c) => c.sam === u.sam && !c.signInBlocked))
    return { pending, mismatch, syncedCount: synced.length }
  }, [world])
  const next = minutesFromNow(sync.intervalMin, new Date(sync.lastRun))
  const ok = running && sync.enabled
  return (
    <>
      <Crumbs api={api} items={[{ label: 'Startseite', href: `${ADMIN}/` }, { label: 'Synchronisierung' }]} />
      <PageTitle title="Synchronisierung" sub="Hybrid-Identität: lokales Active Directory → Cloud-Mandant" />
      <Notice tone="info" className="mb-4">
        Die Synchronisierung läuft auf dem lokalen Server <strong>SYNC01</strong> (Dienst „MW Cloud Sync Service“) alle {sync.intervalMin} Minuten. Ein sofortiger Abgleich wird lokal ausgelöst – über die
        Infrastruktur-Konsole bzw. die Admin-PowerShell –, nicht im Cloud Admin Center. Das lokale AD ist für synchronisierte Objekte führend.
      </Notice>
      <div className="grid gap-4 @4xl:grid-cols-2">
        <Panel title="Status">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            {ok ? <CircleCheck className="text-emerald-600" size={18} /> : <CircleX className="text-rose-600" size={18} />}
            {ok ? 'Synchronisierung aktiv' : !srv?.online ? 'SYNC01 nicht erreichbar' : !running ? 'Synchronisierungsdienst gestoppt' : 'Synchronisierung deaktiviert'}
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-slate-500">Letzter Lauf</dt>
            <dd>
              {fmtDateTime(sync.lastRun)} ({fmtRelative(sync.lastRun)})
            </dd>
            <dt className="text-slate-500">Nächster Lauf</dt>
            <dd>{ok ? `ca. ${fmtDateTime(next)}` : '–'}</dd>
            <dt className="text-slate-500">Synchronisierte Objekte</dt>
            <dd>{syncedCount}</dd>
            <dt className="text-slate-500">Kennwort-Hash-Sync</dt>
            <dd>Aktiviert</dd>
            <dt className="text-slate-500">Kennwortrückschreiben</dt>
            <dd>Aktiviert</dd>
          </dl>
        </Panel>
        <Panel title="Fehlermeldungen">
          {sync.errors.length ? (
            <ul className="space-y-1 text-xs text-rose-800">
              {sync.errors.slice(0, 10).map((e, i) => (
                <li key={i} className="rounded bg-rose-50 px-2 py-1">
                  {e}
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Info size={15} /> Keine Fehler gemeldet.
            </div>
          )}
        </Panel>
      </div>
      <Panel title={`Noch nicht synchronisiert (${pending.length})`} className="mt-4" flush>
        {pending.length ? (
          <table className={tableCls}>
            <thead>
              <tr>
                <th>AD-Benutzer</th>
                <th>Anmeldename</th>
                <th>Abteilung</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((u) => (
                <tr key={u.sam}>
                  <td>{u.displayName}</td>
                  <td className="font-mono text-xs">{u.upn}</td>
                  <td>{u.department}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="p-4 text-sm text-slate-500">Alle relevanten AD-Benutzer sind im Cloud-Verzeichnis vorhanden.</p>
        )}
      </Panel>
      {!!mismatch.length && (
        <Panel title="Abweichungen bis zum nächsten Lauf" className="mt-4">
          <ul className="space-y-1 text-sm">
            {mismatch.map((u) => (
              <li key={u.sam}>
                <Link api={api} href={userHref(u.upn)} className="text-indigo-700 hover:underline">
                  {u.displayName}
                </Link>{' '}
                <Badge tone="amber">im AD deaktiviert, Cloud-Anmeldung noch möglich</Badge>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  )
}
