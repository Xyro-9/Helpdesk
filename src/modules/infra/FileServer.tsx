// Dateiserver FS01: Freigaben, Berechtigungen, Ordner, effektiver Zugriff

import { FolderLock, FolderOpen, Plus, Search, Trash2, UserSearch } from 'lucide-react'
import { useMemo, useState } from 'react'
import { A } from '@/core/actions'
import { useStore } from '@/core/store'
import type { FileShare, SharePermission } from '@/core/types'
import { Badge, Button, Card, Select, cx, tableCls } from '@/ui'
import { PickerDialog } from '../ad/parts'
import { effectiveShareAccess, fmtGb, pctTone, principalKind } from './lib'
import { Meter, useRun } from './shared'

const ACCESS: SharePermission['access'][] = ['Lesen', 'Ändern', 'Vollzugriff', 'Verweigern']

export function FileServerPanel() {
  const shares = useStore((s) => s.world.infra.shares)
  const fs01 = useStore((s) => s.world.infra.servers.find((x) => x.name === 'FS01'))
  const [selName, setSelName] = useState(shares[0]?.name)
  const [q, setQ] = useState('')
  const share = shares.find((s) => s.name === selName) ?? shares[0]
  const list = useMemo(() => shares.filter((s) => !q.trim() || s.name.toLowerCase().includes(q.toLowerCase()) || s.description.toLowerCase().includes(q.toLowerCase())), [shares, q])
  const vol = fs01?.volumes.find((v) => v.letter === 'D')
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
        <FolderLock size={18} className="text-sky-600" />
        <div>
          <div className="font-medium">Dateiserver FS01 (\\FS01)</div>
          <div className="text-xs text-slate-500">
            {fs01?.online ? 'Online' : 'Offline'} · {shares.length} Freigaben
          </div>
        </div>
        {vol && (
          <div className="w-64 text-xs text-slate-500">
            D: {vol.label} – {fmtGb(vol.freeGb)} frei von {fmtGb(vol.sizeGb)}
            <Meter pct={Math.round(((vol.sizeGb - vol.freeGb) / vol.sizeGb) * 100)} className="mt-1" />
          </div>
        )}
      </div>
      <div className="grid gap-4 xl:grid-cols-[18rem_1fr]">
        <div className="space-y-2">
          <div className="relative">
            <Search size={14} className="absolute top-2.5 left-2.5 text-slate-400" />
            <input className="h-9 w-full rounded-md border border-slate-300 pl-8 text-sm" placeholder="Freigabe suchen …" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="max-h-[36rem] space-y-1 overflow-auto">
            {list.map((s) => (
              <button key={s.name} type="button" onClick={() => setSelName(s.name)} className={cx('flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm', share?.name === s.name ? 'border-sky-400 bg-sky-50' : 'border-slate-200 bg-white hover:border-sky-300')}>
                <FolderOpen size={15} className="text-amber-500" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{s.name}</span>
                  <span className="block truncate text-xs text-slate-500">{s.description}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
        {share && <ShareDetail key={share.name} share={share} />}
      </div>
    </div>
  )
}

function ShareDetail({ share }: { share: FileShare }) {
  const run = useRun()
  const world = useStore((s) => s.world)
  const [pick, setPick] = useState(false)
  const [newAccess, setNewAccess] = useState<SharePermission['access']>('Lesen')
  const [checkUser, setCheckUser] = useState<string | null>(null)
  const [pickUser, setPickUser] = useState(false)
  const quotaPct = share.quotaGb ? Math.round((share.sizeGb / share.quotaGb) * 100) : 0
  const check = useMemo(() => (checkUser ? effectiveShareAccess(world, checkUser, share) : null), [world, checkUser, share])
  const checkedUser = checkUser ? world.users.find((u) => u.sam === checkUser) : undefined

  const mutate = (fn: (s: FileShare) => string | null | void, detail: string, success: string) =>
    run(
      (w) => {
        const s = w.infra.shares.find((x) => x.name === share.name && x.server === share.server)
        if (!s) return 'Freigabe nicht gefunden.'
        return fn(s) ?? null
      },
      { type: A.shareChanged, target: share.name, detail },
      success,
    )

  const addPrincipal = (principal: string) =>
    mutate(
      (s) => {
        if (s.permissions.some((p) => p.principal.toLowerCase() === principal.toLowerCase())) return `„${principal}“ ist bereits berechtigt – Zugriff in der Liste ändern.`
        s.permissions.push({ principal, access: newAccess })
      },
      `+${principal}: ${newAccess}`,
      `${principal} erhält „${newAccess}“ auf \\\\${share.server}\\${share.name}.`,
    )

  return (
    <div className="space-y-4">
      <Card title={`\\\\${share.server}\\${share.name}`}>
        <div className="grid gap-4 md:grid-cols-2">
          <dl className="grid grid-cols-[8rem_1fr] gap-y-1 text-sm">
            <dt className="text-slate-500">Lokaler Pfad</dt>
            <dd className="font-mono text-xs">{share.localPath}</dd>
            <dt className="text-slate-500">Beschreibung</dt>
            <dd>{share.description}</dd>
            <dt className="text-slate-500">Belegt</dt>
            <dd>
              {fmtGb(share.sizeGb)}
              {share.quotaGb ? ` von ${fmtGb(share.quotaGb)} Kontingent` : ' (kein Kontingent)'}
            </dd>
          </dl>
          <div>
            {share.quotaGb ? (
              <>
                <div className="mb-1 text-xs text-slate-500">Kontingent: {quotaPct} %</div>
                <Meter pct={quotaPct} tone={pctTone(quotaPct)} />
              </>
            ) : null}
            <div className="mt-3 text-xs font-semibold tracking-wide text-slate-500 uppercase">Ordner</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {share.folders.length ? share.folders.map((f) => <Badge key={f}>📁 {f}</Badge>) : <span className="text-xs text-slate-400">(Benutzerordner)</span>}
            </div>
          </div>
        </div>
      </Card>

      <Card title="Freigabeberechtigungen" bodyClassName="p-0">
        <table className={tableCls}>
          <thead>
            <tr>
              <th>Gruppe oder Benutzer</th>
              <th>Typ</th>
              <th>Zugriff</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {share.permissions.map((p) => {
              const kind = principalKind(world, p.principal)
              return (
                <tr key={p.principal}>
                  <td className="font-medium">{p.principal}</td>
                  <td className="text-xs text-slate-500">{kind === 'group' ? 'Gruppe' : kind === 'user' ? 'Benutzer' : <span className="text-rose-600">unbekannt (verwaist)</span>}</td>
                  <td>
                    <Select
                      className="h-8 w-40"
                      value={p.access}
                      onChange={(e) => {
                        const acc = e.target.value as SharePermission['access']
                        mutate(
                          (s) => {
                            const x = s.permissions.find((y) => y.principal === p.principal)
                            if (!x) return 'Eintrag nicht gefunden.'
                            x.access = acc
                          },
                          `${p.principal}: ${p.access} → ${acc}`,
                          `Zugriff für ${p.principal} auf „${acc}“ geändert.`,
                        )
                      }}
                    >
                      {ACCESS.map((a) => (
                        <option key={a}>{a}</option>
                      ))}
                    </Select>
                  </td>
                  <td className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Trash2 size={13} />}
                      onClick={() =>
                        mutate(
                          (s) => {
                            s.permissions = s.permissions.filter((y) => y.principal !== p.principal)
                          },
                          `-${p.principal}`,
                          `Berechtigung für ${p.principal} entfernt.`,
                        )
                      }
                    >
                      Entfernen
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-3">
          <span className="text-sm text-slate-600">Neue Berechtigung:</span>
          <Select className="h-8 w-40" value={newAccess} onChange={(e) => setNewAccess(e.target.value as SharePermission['access'])}>
            {ACCESS.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </Select>
          <Button size="sm" icon={<Plus size={13} />} onClick={() => setPick(true)}>
            Gruppe/Benutzer hinzufügen…
          </Button>
          <span className="text-xs text-slate-500">Best Practice: Berechtigungen nur an FS_-Gruppen vergeben, Benutzer über Gruppenmitgliedschaft berechtigen.</span>
        </div>
      </Card>

      <Card
        title="Effektiven Zugriff prüfen"
        actions={
          <Button size="sm" icon={<UserSearch size={13} />} onClick={() => setPickUser(true)}>
            Benutzer auswählen…
          </Button>
        }
      >
        {!check ? (
          <p className="text-sm text-slate-500">Wählen Sie einen Benutzer, um seinen effektiven Zugriff auf diese Freigabe laut Active Directory (inkl. verschachtelter Gruppen) zu ermitteln.</p>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span>
                <strong>{checkedUser?.displayName ?? checkUser}</strong> ({checkUser}):
              </span>
              <Badge tone={check.access === 'Verweigert' || check.access === 'Kein Zugriff' ? 'red' : check.access === 'Lesen' ? 'amber' : 'green'}>{check.access}</Badge>
              {check.disabled && <Badge tone="red">Konto deaktiviert</Badge>}
            </div>
            {check.matches.length ? (
              <ul className="space-y-1 text-xs">
                {check.matches.map((m) => (
                  <li key={m.perm.principal}>
                    <Badge tone={m.perm.access === 'Verweigern' ? 'red' : 'gray'}>{m.perm.access}</Badge> über <span className="font-mono">{m.path.join(' → ')}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-600">Keine der berechtigten Gruppen enthält den Benutzer. Lösung: Benutzer (nach Freigabe durch den Verantwortlichen) in die passende FS_-Gruppe bzw. Abteilungsgruppe aufnehmen.</p>
            )}
            <p className="text-xs text-slate-500">Hinweis: Der Client nutzt das Anmeldetoken. Nach einer Gruppenänderung muss sich der Benutzer ab- und wieder anmelden (oder „klist purge“ / Neustart), bevor der neue Zugriff wirkt.</p>
          </div>
        )}
      </Card>

      {pick && <PickerDialog title={`Berechtigung für \\\\${share.server}\\${share.name}`} kinds={['group', 'user']} exclude={share.permissions.map((p) => p.principal)} onPick={(e) => addPrincipal(e.id)} onClose={() => setPick(false)} />}
      {pickUser && <PickerDialog title="Benutzer für Zugriffsprüfung" kinds={['user']} onPick={(e) => setCheckUser(e.id)} onClose={() => setPickUser(false)} />}
    </div>
  )
}
