// Lizenzübersicht je SKU und Benutzerliste pro SKU.

import { useMemo, useState } from 'react'
import { A } from '@/core/actions'
import { assignLicense, removeLicense, skuUsage } from '@/core/ops/cloud'
import { cx, tableCls } from '@/ui'
import { act, ConfirmButton, Link, Meter, Notice } from '../shared'
import { ADMIN, cmdDanger, cmdPrimary, Crumbs, field, PageTitle, Panel, userHref, type AdminCtx } from './ui'

export function Licenses({ ctx }: { ctx: AdminCtx }) {
  const { api, world } = ctx
  return (
    <>
      <Crumbs api={api} items={[{ label: 'Startseite', href: `${ADMIN}/` }, { label: 'Lizenzen' }]} />
      <PageTitle title="Lizenzen" sub="Gekaufte Produkte und Zuweisungen" />
      <Panel flush>
        <div className="overflow-x-auto">
          <table className={tableCls}>
            <thead>
              <tr>
                <th>Produkt</th>
                <th>Zugewiesen</th>
                <th>Verfügbar</th>
                <th>Enthaltene Dienste</th>
              </tr>
            </thead>
            <tbody>
              {world.cloud.skus.map((s) => {
                const used = skuUsage(world, s.id)
                const free = s.total - used
                return (
                  <tr key={s.id}>
                    <td>
                      <Link api={api} href={`${ADMIN}/licenses/${s.id}`} className="font-medium text-indigo-700 hover:underline">
                        {s.name}
                      </Link>
                      <div className="font-mono text-[11px] text-slate-400">{s.id}</div>
                    </td>
                    <td className="min-w-[8rem] text-xs">
                      {used} von {s.total}
                      <Meter value={used} max={s.total} className="mt-1" />
                    </td>
                    <td className={cx('font-medium', free <= 0 ? 'text-rose-700' : 'text-slate-800')}>{free}</td>
                    <td className="text-xs text-slate-600">{s.services.join(', ')}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Panel>
      <p className="mt-2 text-xs text-slate-500">Keine Lizenzen frei? Lizenzen ausgeschiedener Mitarbeiter freigeben oder eine Bestellung über die IT-Leitung anstoßen.</p>
    </>
  )
}

export function LicenseDetail({ ctx, skuId }: { ctx: AdminCtx; skuId: string }) {
  const { api, world } = ctx
  const sku = world.cloud.skus.find((s) => s.id === skuId)
  const [sel, setSel] = useState('')
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const holders = useMemo(() => world.cloud.users.filter((u) => u.licenses.includes(skuId)).sort((a, b) => a.displayName.localeCompare(b.displayName, 'de')), [world.cloud.users, skuId])
  const others = useMemo(() => world.cloud.users.filter((u) => u.sam && !u.licenses.includes(skuId)).sort((a, b) => a.displayName.localeCompare(b.displayName, 'de')), [world.cloud.users, skuId])
  const crumbs = [{ label: 'Startseite', href: `${ADMIN}/` }, { label: 'Lizenzen', href: `${ADMIN}/licenses` }, { label: sku?.name ?? skuId }]
  if (!sku)
    return (
      <>
        <Crumbs api={api} items={crumbs} />
        <Notice tone="warning">Produkt {skuId} nicht gefunden.</Notice>
      </>
    )
  const free = sku.total - skuUsage(world, sku.id)
  const assign = () => {
    if (!sel) return
    const err = act((w) => assignLicense(w, sel, sku.id), { type: A.cloudLicenseAssigned, target: sel, detail: sku.id })
    setMsg(err ? { tone: 'error', text: err } : { tone: 'success', text: `Lizenz an ${sel} zugewiesen.` })
    if (!err) setSel('')
  }
  const remove = (upn: string) => {
    const err = act((w) => removeLicense(w, upn, sku.id), { type: A.cloudLicenseRemoved, target: upn, detail: sku.id })
    setMsg(err ? { tone: 'error', text: err } : { tone: 'success', text: `Lizenz von ${upn} entfernt.` })
  }
  return (
    <>
      <Crumbs api={api} items={crumbs} />
      <PageTitle title={sku.name} sub={`${sku.total - free} von ${sku.total} zugewiesen · ${free} verfügbar`} />
      {msg && (
        <Notice tone={msg.tone} className="mb-3">
          {msg.text}
        </Notice>
      )}
      <Panel title="Lizenz zuweisen" className="mb-4">
        <div className="flex flex-wrap gap-2">
          <select value={sel} onChange={(e) => setSel(e.target.value)} className={cx(field, 'min-w-0 max-w-full flex-1')}>
            <option value="">Benutzer auswählen …</option>
            {others.map((u) => (
              <option key={u.upn} value={u.upn}>
                {u.displayName} ({u.upn})
              </option>
            ))}
          </select>
          <button type="button" className={cmdPrimary} disabled={!sel} onClick={assign}>
            Zuweisen
          </button>
        </div>
      </Panel>
      <Panel title={`Lizenzierte Benutzer (${holders.length})`} flush>
        <div className="overflow-x-auto">
          <table className={tableCls}>
            <thead>
              <tr>
                <th>Anzeigename</th>
                <th>UPN</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {holders.map((u) => (
                <tr key={u.upn}>
                  <td>
                    <Link api={api} href={userHref(u.upn)} className="text-indigo-700 hover:underline">
                      {u.displayName}
                    </Link>
                  </td>
                  <td className="font-mono text-xs">{u.upn}</td>
                  <td className="text-xs">{u.signInBlocked ? <span className="font-medium text-amber-700">Anmeldung blockiert – Lizenz evtl. freigeben</span> : 'Aktiv'}</td>
                  <td className="text-right">
                    <ConfirmButton className={cx(cmdDanger, 'h-7')} confirmText="Lizenz entfernen?" onConfirm={() => remove(u.upn)}>
                      Entfernen
                    </ConfirmButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  )
}
