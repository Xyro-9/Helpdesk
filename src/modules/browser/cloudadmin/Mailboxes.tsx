// E-Mail-Verwaltung: Postfächer, Berechtigungen, Weiterleitung, automatische Antworten, Regeln.

import { Archive, Forward, Search, Trash2, TriangleAlert, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { A } from '@/core/actions'
import { convertToShared, findCloudUser, grantMailboxRight, revokeMailboxRight, type MailboxRight } from '@/core/ops/cloud'
import type { CloudUser, Mailbox } from '@/core/types'
import { normalize } from '@/core/util'
import { Badge, cx, tableCls, Tabs } from '@/ui'
import { act, ConfirmButton, Link, Meter, Notice, PropGrid } from '../shared'
import { ADMIN, cmdBtn, cmdDanger, cmdPrimary, Crumbs, field, mailboxHref, PageTitle, Panel, userHref, type AdminCtx } from './ui'

type TypeFilter = 'all' | Mailbox['type']

export function Mailboxes({ ctx }: { ctx: AdminCtx }) {
  const { api, world } = ctx
  const [q, setQ] = useState('')
  const [t, setT] = useState<TypeFilter>('all')
  const list = useMemo(() => {
    const n = normalize(q.trim())
    return world.cloud.users
      .filter((u) => u.mailbox && (t === 'all' || u.mailbox.type === t))
      .filter((u) => !n || normalize(`${u.displayName} ${u.upn}`).includes(n))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'de'))
  }, [world.cloud.users, q, t])
  return (
    <>
      <Crumbs api={api} items={[{ label: 'Startseite', href: `${ADMIN}/` }, { label: 'E-Mail-Verwaltung' }]} />
      <PageTitle title="Postfächer" sub="Benutzer-, freigegebene und Raumpostfächer" />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search size={14} className="absolute left-2 top-2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Postfach suchen" className={cx(field, 'w-full pl-7')} />
        </div>
        <select value={t} onChange={(e) => setT(e.target.value as TypeFilter)} className={field}>
          <option value="all">Alle Typen</option>
          <option value="Benutzer">Benutzer</option>
          <option value="Freigegeben">Freigegeben</option>
          <option value="Raum">Raum</option>
        </select>
      </div>
      <Panel flush>
        <div className="overflow-x-auto">
          <table className={tableCls}>
            <thead>
              <tr>
                <th>Anzeigename</th>
                <th>E-Mail-Adresse</th>
                <th>Typ</th>
                <th>Belegung</th>
                <th>Hinweise</th>
              </tr>
            </thead>
            <tbody>
              {list.map((u) => {
                const mb = u.mailbox!
                const sus = mb.inboxRules.some((r) => r.suspicious)
                return (
                  <tr key={u.upn} className="hover:bg-slate-50">
                    <td>
                      <Link api={api} href={mailboxHref(u.upn)} className="font-medium text-indigo-700 hover:underline">
                        {u.displayName}
                      </Link>
                    </td>
                    <td className="font-mono text-xs">{u.upn}</td>
                    <td>
                      <Badge tone={mb.type === 'Benutzer' ? 'gray' : 'violet'}>{mb.type}</Badge>
                    </td>
                    <td className="min-w-[7rem] text-xs">
                      {mb.sizeGb.toFixed(1)} / {mb.quotaGb} GB
                      <Meter value={mb.sizeGb} max={mb.quotaGb} className="mt-1" />
                    </td>
                    <td className="space-x-1">
                      {mb.forwardingTo && (
                        <Badge tone="amber">
                          <Forward size={11} /> Weiterleitung
                        </Badge>
                      )}
                      {sus && (
                        <Badge tone="red">
                          <TriangleAlert size={11} /> Verdächtige Regel
                        </Badge>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  )
}

type TabId = 'general' | 'permissions' | 'forwarding' | 'autoreply' | 'rules'
type Msg = { tone: 'success' | 'error' | 'warning'; text: string } | null

const RIGHTS: { id: MailboxRight; label: string; desc: string }[] = [
  { id: 'fullAccess', label: 'Vollzugriff', desc: 'Postfach öffnen und alle Inhalte lesen/bearbeiten' },
  { id: 'sendAs', label: 'Senden als', desc: 'E-Mails erscheinen, als kämen sie direkt von diesem Postfach' },
  { id: 'sendOnBehalf', label: 'Senden im Auftrag', desc: '„X im Auftrag von Y“' },
]

/** Postfach-Einstellung ändern (direkt am Cloud-Objekt) und protokollieren */
function updateMailbox(upn: string, fn: (mb: Mailbox) => string | void, detail: string) {
  return act(
    (w) => {
      const mb = findCloudUser(w, upn)?.mailbox
      if (!mb) return 'Postfach nicht gefunden.'
      return fn(mb)
    },
    { type: A.cloudMailboxUpdated, target: upn, detail },
  )
}

export function MailboxDetail({ ctx, upn }: { ctx: AdminCtx; upn: string }) {
  const { api, world } = ctx
  const cu = findCloudUser(world, upn)
  const [tab, setTab] = useState<TabId>('general')
  const [msg, setMsg] = useState<Msg>(null)
  const crumbs = [{ label: 'Startseite', href: `${ADMIN}/` }, { label: 'E-Mail-Verwaltung', href: `${ADMIN}/mailboxes` }, { label: cu?.displayName ?? upn }]
  if (!cu?.mailbox)
    return (
      <>
        <Crumbs api={api} items={crumbs} />
        <Notice tone="warning">Postfach {upn} wurde nicht gefunden.</Notice>
      </>
    )
  const done = (err: string | null, ok: string) => setMsg(err ? { tone: 'error', text: err } : { tone: 'success', text: ok })
  return (
    <>
      <Crumbs api={api} items={crumbs} />
      <PageTitle
        title={cu.displayName}
        sub={
          <>
            <span className="font-mono text-xs">{cu.upn}</span> · {cu.mailbox.type === 'Benutzer' ? 'Benutzerpostfach' : cu.mailbox.type === 'Freigegeben' ? 'Freigegebenes Postfach' : 'Raumpostfach'}
          </>
        }
        actions={
          cu.sam ? (
            <Link api={api} href={userHref(cu.upn)} className={cmdBtn}>
              Benutzerkonto öffnen
            </Link>
          ) : undefined
        }
      />
      {msg && (
        <Notice tone={msg.tone} className="mb-3">
          {msg.text}
        </Notice>
      )}
      <Tabs<TabId>
        className="mb-4"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'general', label: 'Allgemein' },
          { id: 'permissions', label: 'Postfachberechtigungen' },
          { id: 'forwarding', label: 'Weiterleitung' },
          { id: 'autoreply', label: 'Automatische Antworten' },
          { id: 'rules', label: 'Posteingangsregeln', badge: cu.mailbox.inboxRules.some((r) => r.suspicious) ? <TriangleAlert size={13} className="text-rose-600" /> : undefined },
        ]}
      />
      {tab === 'general' && <General cu={cu} done={done} />}
      {tab === 'permissions' && <Permissions ctx={ctx} cu={cu} done={done} />}
      {tab === 'forwarding' && <Forwarding cu={cu} done={done} />}
      {tab === 'autoreply' && <AutoReply cu={cu} done={done} />}
      {tab === 'rules' && <Rules cu={cu} done={done} />}
    </>
  )
}

type Done = (err: string | null, ok: string) => void

function General({ cu, done }: { cu: CloudUser; done: Done }) {
  const mb = cu.mailbox!
  const pct = (mb.sizeGb / mb.quotaGb) * 100
  return (
    <div className="grid gap-4 @4xl:grid-cols-2">
      <Panel title="Postfacheigenschaften">
        <PropGrid
          items={[
            ['Typ', mb.type],
            [
              'Belegung',
              <span className="block max-w-xs">
                {mb.sizeGb.toFixed(2)} GB von {mb.quotaGb} GB ({Math.round(pct)} %)
                <Meter value={mb.sizeGb} max={mb.quotaGb} className="mt-1" />
                {pct >= 90 && <span className="text-xs text-rose-700">Postfach fast voll – Archiv aktivieren oder aufräumen.</span>}
              </span>,
            ],
            ['Archivpostfach', mb.archiveEnabled ? <Badge tone="green">Aktiv</Badge> : <Badge>Inaktiv</Badge>],
            ['Beweissicherung', mb.litigationHold ? 'Aktiv' : 'Inaktiv'],
          ]}
        />
      </Panel>
      <Panel title="Aktionen">
        <div className="space-y-3 text-sm">
          <div>
            <ConfirmButton
              className={cmdBtn}
              disabled={mb.archiveEnabled}
              icon={<Archive size={14} />}
              confirmText="Archivpostfach aktivieren?"
              onConfirm={() =>
                done(
                  updateMailbox(cu.upn, (m) => {
                    if (m.archiveEnabled) return 'Archiv ist bereits aktiv.'
                    m.archiveEnabled = true
                  }, 'Archiv aktiviert'),
                  'Archivpostfach wurde aktiviert.',
                )
              }
            >
              Archiv aktivieren
            </ConfirmButton>
          </div>
          {mb.type === 'Benutzer' && (
            <div>
              <ConfirmButton
                className={cmdBtn}
                icon={<Users size={14} />}
                confirmText="In freigegebenes Postfach umwandeln?"
                onConfirm={() => done(act((w) => convertToShared(w, cu.upn), { type: A.cloudMailboxUpdated, target: cu.upn, detail: 'In freigegebenes Postfach umgewandelt' }), 'Das Postfach ist jetzt ein freigegebenes Postfach.')}
              >
                In freigegebenes Postfach umwandeln
              </ConfirmButton>
              <p className="mt-1 text-xs text-slate-500">Typisch beim Offboarding: Danach Vollzugriff für die Vertretung vergeben; die Lizenz kann entfernt werden (bis 50 GB).</p>
            </div>
          )}
        </div>
      </Panel>
    </div>
  )
}

function Permissions({ ctx, cu, done }: { ctx: AdminCtx; cu: CloudUser; done: Done }) {
  const mb = cu.mailbox!
  const candidates = useMemo(() => ctx.world.cloud.users.filter((u) => u.sam && u.upn !== cu.upn).sort((a, b) => a.displayName.localeCompare(b.displayName, 'de')), [ctx.world.cloud.users, cu.upn])
  const [sel, setSel] = useState<Record<MailboxRight, string>>({ fullAccess: '', sendAs: '', sendOnBehalf: '' })
  const name = (upn: string) => ctx.world.cloud.users.find((u) => u.upn.toLowerCase() === upn.toLowerCase())?.displayName ?? upn
  const grant = (r: (typeof RIGHTS)[number]) => {
    const g = sel[r.id]
    if (!g) return
    done(act((w) => grantMailboxRight(w, cu.upn, r.id, g), { type: A.cloudMailboxPermission, target: cu.upn, detail: `+${r.id} ${g}` }), `${r.label} für ${name(g)} hinzugefügt.`)
    setSel((s) => ({ ...s, [r.id]: '' }))
  }
  const revoke = (r: (typeof RIGHTS)[number], g: string) =>
    done(act((w) => revokeMailboxRight(w, cu.upn, r.id, g), { type: A.cloudMailboxPermission, target: cu.upn, detail: `-${r.id} ${g}` }), `${r.label} für ${name(g)} entfernt.`)
  return (
    <div className="space-y-4">
      {RIGHTS.map((r) => (
        <Panel key={r.id} title={r.label}>
          <p className="mb-2 text-xs text-slate-500">{r.desc}</p>
          <ul className="mb-3 space-y-1">
            {mb[r.id].map((g) => (
              <li key={g} className="flex flex-wrap items-center gap-2 rounded bg-slate-50 px-2 py-1 text-sm">
                <span className="font-medium">{name(g)}</span>
                <span className="font-mono text-xs text-slate-500">{g}</span>
                <ConfirmButton className={cx(cmdDanger, 'ml-auto h-7')} icon={<Trash2 size={12} />} confirmText="Berechtigung entfernen?" onConfirm={() => revoke(r, g)}>
                  Entfernen
                </ConfirmButton>
              </li>
            ))}
            {!mb[r.id].length && <li className="text-sm text-slate-400">Keine Berechtigungen vergeben.</li>}
          </ul>
          <div className="flex flex-wrap gap-2">
            <select value={sel[r.id]} onChange={(e) => setSel((s) => ({ ...s, [r.id]: e.target.value }))} className={cx(field, 'min-w-0 max-w-full flex-1')}>
              <option value="">Benutzer auswählen …</option>
              {candidates.map((c) => (
                <option key={c.upn} value={c.upn}>
                  {c.displayName} ({c.upn})
                </option>
              ))}
            </select>
            <button type="button" className={cmdPrimary} disabled={!sel[r.id]} onClick={() => grant(r)}>
              Hinzufügen
            </button>
          </div>
        </Panel>
      ))}
    </div>
  )
}

function Forwarding({ cu, done }: { cu: CloudUser; done: Done }) {
  const mb = cu.mailbox!
  const [to, setTo] = useState('')
  const external = !!to && !to.toLowerCase().endsWith('@musterwerk.example')
  const save = () => {
    const addr = to.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) return done('Bitte eine gültige E-Mail-Adresse angeben.', '')
    done(updateMailbox(cu.upn, (m) => void (m.forwardingTo = addr), `Weiterleitung an ${addr} gesetzt`), `Weiterleitung an ${addr} wurde eingerichtet.`)
    setTo('')
  }
  return (
    <Panel title="E-Mail-Weiterleitung">
      <p className="mb-3 text-sm">
        Aktuell: {mb.forwardingTo ? <strong className={mb.forwardingTo.endsWith('@musterwerk.example') ? '' : 'text-rose-700'}>{mb.forwardingTo}</strong> : <span className="text-slate-500">keine Weiterleitung</span>}
      </p>
      {mb.forwardingTo && !mb.forwardingTo.endsWith('@musterwerk.example') && (
        <Notice tone="error" className="mb-3">
          Externe Weiterleitung! Ohne Freigabe ein Datenabfluss-Risiko – typisches Zeichen eines kompromittierten Kontos.
        </Notice>
      )}
      <div className="flex flex-wrap gap-2">
        <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="empfaenger@musterwerk.example" className={cx(field, 'min-w-[14rem] flex-1')} />
        <button type="button" className={cmdPrimary} onClick={save} disabled={!to.trim()}>
          Weiterleitung setzen
        </button>
        {mb.forwardingTo && (
          <ConfirmButton className={cmdDanger} confirmText="Weiterleitung entfernen?" onConfirm={() => done(updateMailbox(cu.upn, (m) => void (m.forwardingTo = undefined), 'Weiterleitung entfernt'), 'Weiterleitung wurde entfernt.')}>
            Entfernen
          </ConfirmButton>
        )}
      </div>
      {external && <p className="mt-2 text-xs text-amber-700">Achtung: externe Adresse – nur mit dokumentierter Freigabe einrichten.</p>}
    </Panel>
  )
}

function AutoReply({ cu, done }: { cu: CloudUser; done: Done }) {
  const ar = cu.mailbox!.autoReply
  const [enabled, setEnabled] = useState(!!ar?.enabled)
  const [internal, setInternal] = useState(ar?.internal ?? '')
  const [externalText, setExternal] = useState(ar?.external ?? '')
  const save = () =>
    done(
      updateMailbox(cu.upn, (m) => void (m.autoReply = { enabled, internal, external: externalText }), `Automatische Antworten ${enabled ? 'aktiviert' : 'deaktiviert'}`),
      enabled ? 'Automatische Antworten sind aktiv.' : 'Automatische Antworten wurden deaktiviert.',
    )
  const ta = 'w-full rounded-md border border-slate-300 p-2 text-sm focus:border-indigo-500 focus:outline-none'
  return (
    <Panel title="Automatische Antworten (Abwesenheit)">
      <div className="space-y-3 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4 accent-indigo-600" /> Automatische Antworten senden
        </label>
        <label className="block text-xs font-medium text-slate-600">
          Nachricht an Absender innerhalb der Organisation
          <textarea rows={3} value={internal} onChange={(e) => setInternal(e.target.value)} className={ta} />
        </label>
        <label className="block text-xs font-medium text-slate-600">
          Nachricht an externe Absender
          <textarea rows={3} value={externalText} onChange={(e) => setExternal(e.target.value)} className={ta} />
        </label>
        <button type="button" className={cmdPrimary} onClick={save}>
          Speichern
        </button>
      </div>
    </Panel>
  )
}

const looksSuspicious = (r: Mailbox['inboxRules'][number]) => r.suspicious || /extern|weiterleit|löschen|rss|gelesen markieren/i.test(`${r.name} ${r.description}`)

function Rules({ cu, done }: { cu: CloudUser; done: Done }) {
  const rules = cu.mailbox!.inboxRules
  const toggle = (name: string, enabled: boolean) =>
    done(
      updateMailbox(cu.upn, (m) => {
        const r = m.inboxRules.find((x) => x.name === name)
        if (!r) return 'Regel nicht gefunden.'
        r.enabled = enabled
      }, `Regel ${enabled ? 'aktiviert' : 'deaktiviert'}: ${name}`),
      `Regel „${name}“ ${enabled ? 'aktiviert' : 'deaktiviert'}.`,
    )
  const remove = (name: string) =>
    done(
      updateMailbox(cu.upn, (m) => {
        m.inboxRules = m.inboxRules.filter((x) => x.name !== name)
      }, `Regel gelöscht: ${name}`),
      `Regel „${name}“ gelöscht.`,
    )
  return (
    <Panel title="Posteingangsregeln" flush>
      <div className="overflow-x-auto">
        <table className={tableCls}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Beschreibung</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.name} className={looksSuspicious(r) ? 'bg-rose-50' : ''}>
                <td className="font-medium">
                  {r.name}
                  {looksSuspicious(r) && (
                    <div>
                      <Badge tone="red">
                        <TriangleAlert size={11} /> Verdächtig
                      </Badge>
                    </div>
                  )}
                </td>
                <td className="text-xs">{r.description}</td>
                <td>{r.enabled ? <Badge tone="green">Aktiv</Badge> : <Badge>Deaktiviert</Badge>}</td>
                <td className="whitespace-nowrap text-right">
                  <span className="inline-flex flex-wrap justify-end gap-1">
                    <button type="button" className={cx(cmdBtn, 'h-7')} onClick={() => toggle(r.name, !r.enabled)}>
                      {r.enabled ? 'Deaktivieren' : 'Aktivieren'}
                    </button>
                    <ConfirmButton className={cx(cmdDanger, 'h-7')} icon={<Trash2 size={12} />} confirmText="Regel löschen?" onConfirm={() => remove(r.name)}>
                      Löschen
                    </ConfirmButton>
                  </span>
                </td>
              </tr>
            ))}
            {!rules.length && (
              <tr>
                <td colSpan={4} className="py-5 text-center text-sm text-slate-500">
                  Keine Posteingangsregeln vorhanden.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}
