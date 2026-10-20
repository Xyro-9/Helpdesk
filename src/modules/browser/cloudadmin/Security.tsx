// Sicherheit: Quarantäne, gesperrte Absender, riskante Benutzer und Anmeldungen.

import { Ban, CircleCheck, CircleX, ShieldCheck, Trash2, Undo2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { A } from '@/core/actions'
import { findCloudUser } from '@/core/ops/cloud'
import { fmtDateTime } from '@/core/util'
import { Badge, cx, tableCls, Tabs } from '@/ui'
import { act, BA, ConfirmButton, Link, Notice } from '../shared'
import { ADMIN, cmdBtn, cmdDanger, cmdPrimary, Crumbs, field, PageTitle, Panel, userHref, type AdminCtx } from './ui'
import { SignInTable } from './UserDetail'

type TabId = 'quarantine' | 'blocked' | 'risky' | 'signins'
type Msg = { tone: 'success' | 'error'; text: string } | null

export function Security({ ctx }: { ctx: AdminCtx }) {
  const { api } = ctx
  const initial = api.q('tab') as TabId
  const [tab, setTab] = useState<TabId>(['quarantine', 'blocked', 'risky', 'signins'].includes(initial) ? initial : 'quarantine')
  const [msg, setMsg] = useState<Msg>(null)
  const done = (err: string | null, ok: string) => setMsg(err ? { tone: 'error', text: err } : { tone: 'success', text: ok })
  const risky = ctx.world.cloud.users.filter((u) => u.riskState === 'gefährdet').length
  return (
    <>
      <Crumbs api={api} items={[{ label: 'Startseite', href: `${ADMIN}/` }, { label: 'Sicherheit' }]} />
      <PageTitle title="Sicherheit" sub="E-Mail-Schutz und Identitätsrisiken" />
      {msg && (
        <Notice tone={msg.tone} className="mb-3">
          {msg.text}
        </Notice>
      )}
      <Tabs<TabId>
        className="mb-4"
        value={tab}
        onChange={(t) => {
          setTab(t)
          setMsg(null)
        }}
        tabs={[
          { id: 'quarantine', label: 'Quarantäne' },
          { id: 'blocked', label: 'Gesperrte Absender' },
          { id: 'risky', label: 'Riskante Benutzer', badge: risky ? <Badge tone="red">{risky}</Badge> : undefined },
          { id: 'signins', label: 'Riskante Anmeldungen' },
        ]}
      />
      {tab === 'quarantine' && <Quarantine ctx={ctx} done={done} />}
      {tab === 'blocked' && <Blocked ctx={ctx} done={done} />}
      {tab === 'risky' && <RiskyUsers ctx={ctx} done={done} />}
      {tab === 'signins' && <RiskySignIns ctx={ctx} />}
    </>
  )
}

type Done = (err: string | null, ok: string) => void

function Quarantine({ ctx, done }: { ctx: AdminCtx; done: Done }) {
  const items = ctx.world.cloud.quarantine.filter((q) => !q.deleted)
  const deleted = ctx.world.cloud.quarantine.length - items.length
  const update = (id: string, what: 'release' | 'delete') => {
    const q = ctx.world.cloud.quarantine.find((x) => x.id === id)
    return done(
      act(
        (w) => {
          const item = w.cloud.quarantine.find((x) => x.id === id)
          if (!item) return 'Nachricht nicht gefunden.'
          if (what === 'release') item.released = true
          else item.deleted = true
        },
        { type: A.cloudQuarantine, target: id, detail: `${what === 'release' ? 'freigegeben' : 'gelöscht'}: ${q?.subject ?? ''} (${q?.from ?? ''})` },
      ),
      what === 'release' ? 'Nachricht wurde freigegeben und zugestellt.' : 'Nachricht wurde endgültig gelöscht.',
    )
  }
  const blockSender = (from: string) =>
    done(
      act(
        (w) => {
          if (w.cloud.blockedSenders.some((s) => s.toLowerCase() === from.toLowerCase())) return 'Absender ist bereits gesperrt.'
          w.cloud.blockedSenders.push(from)
        },
        { type: A.cloudSenderBlocked, target: from, detail: 'hinzugefügt (aus Quarantäne)' },
      ),
      `${from} wurde gesperrt.`,
    )
  return (
    <Panel flush>
      <div className="overflow-x-auto">
        <table className={tableCls}>
          <thead>
            <tr>
              <th>Empfangen</th>
              <th>Absender</th>
              <th>Betreff</th>
              <th>Grund</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((q) => {
              const phish = /phishing|schadsoftware|malware/i.test(q.reason)
              return (
                <tr key={q.id} className={phish && !q.released ? 'bg-rose-50/50' : ''}>
                  <td className="whitespace-nowrap text-xs">{fmtDateTime(q.received)}</td>
                  <td className="font-mono text-xs">{q.from}</td>
                  <td className="text-sm">{q.subject}</td>
                  <td>
                    <Badge tone={phish ? 'red' : 'amber'}>{q.reason}</Badge>
                  </td>
                  <td className="text-xs">{q.released ? 'Freigegeben' : 'In Quarantäne'}</td>
                  <td>
                    <span className="flex flex-wrap justify-end gap-1">
                      {!q.released && (
                        <ConfirmButton
                          className={cx(cmdBtn, 'h-7')}
                          icon={<Undo2 size={12} />}
                          confirmText={phish ? 'Als Phishing eingestuft! Wirklich freigeben?' : 'Nachricht freigeben?'}
                          onConfirm={() => update(q.id, 'release')}
                        >
                          Freigeben
                        </ConfirmButton>
                      )}
                      <ConfirmButton className={cx(cmdDanger, 'h-7')} icon={<Trash2 size={12} />} confirmText="Endgültig löschen?" onConfirm={() => update(q.id, 'delete')}>
                        Löschen
                      </ConfirmButton>
                      {!ctx.world.cloud.blockedSenders.includes(q.from) && (
                        <button type="button" className={cx(cmdBtn, 'h-7')} onClick={() => blockSender(q.from)}>
                          <Ban size={12} /> Absender sperren
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
              )
            })}
            {!items.length && (
              <tr>
                <td colSpan={6} className="py-5 text-center text-sm text-slate-500">
                  Keine Nachrichten in Quarantäne.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {!!deleted && <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">{deleted} gelöschte Nachricht(en) ausgeblendet.</p>}
    </Panel>
  )
}

function Blocked({ ctx, done }: { ctx: AdminCtx; done: Done }) {
  const [v, setV] = useState('')
  const list = ctx.world.cloud.blockedSenders
  const add = () => {
    const s = v.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && !/^@?[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s)) return done('Bitte eine E-Mail-Adresse oder Domäne (z. B. spam.example) angeben.', '')
    done(
      act(
        (w) => {
          if (w.cloud.blockedSenders.some((x) => x.toLowerCase() === s)) return 'Eintrag ist bereits vorhanden.'
          w.cloud.blockedSenders.push(s)
        },
        { type: A.cloudSenderBlocked, target: s, detail: 'hinzugefügt' },
      ),
      `${s} wurde zur Sperrliste hinzugefügt.`,
    )
    setV('')
  }
  const remove = (s: string) =>
    done(
      act(
        (w) => {
          w.cloud.blockedSenders = w.cloud.blockedSenders.filter((x) => x !== s)
        },
        { type: A.cloudSenderBlocked, target: s, detail: 'entfernt' },
      ),
      `${s} wurde von der Sperrliste entfernt.`,
    )
  return (
    <Panel title="Gesperrte Absender und Domänen">
      <div className="mb-3 flex flex-wrap gap-2">
        <input value={v} onChange={(e) => setV(e.target.value)} placeholder="absender@domain.example oder domain.example" className={cx(field, 'min-w-[14rem] flex-1')} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button type="button" className={cmdPrimary} onClick={add} disabled={!v.trim()}>
          <Ban size={13} /> Sperren
        </button>
      </div>
      <ul className="space-y-1">
        {list.map((s) => (
          <li key={s} className="flex items-center gap-2 rounded bg-slate-50 px-2 py-1 font-mono text-sm">
            {s}
            <ConfirmButton className={cx(cmdDanger, 'ml-auto h-7')} confirmText="Sperre aufheben?" onConfirm={() => remove(s)}>
              Entfernen
            </ConfirmButton>
          </li>
        ))}
        {!list.length && <li className="text-sm text-slate-500">Keine Einträge.</li>}
      </ul>
    </Panel>
  )
}

function RiskyUsers({ ctx, done }: { ctx: AdminCtx; done: Done }) {
  const { api, world } = ctx
  const list = useMemo(
    () =>
      world.cloud.users
        .filter((u) => u.riskState !== 'keines')
        .map((u) => {
          const incident = u.signIns.filter((s) => s.risk === 'hoch' || s.risk === 'mittel').sort((a, b) => b.time.localeCompare(a.time))[0]
          const t = incident ? incident.time : ''
          return { u, incident, pwChanged: !!t && !!u.lastPasswordChange && u.lastPasswordChange > t, revoked: !!t && !!u.sessionsRevokedAt && u.sessionsRevokedAt > t }
        })
        .sort((a, b) => (a.u.riskState === 'gefährdet' ? -1 : 1) - (b.u.riskState === 'gefährdet' ? -1 : 1)),
    [world.cloud.users],
  )
  const resolve = (upn: string) =>
    done(
      act(
        (w) => {
          const c = findCloudUser(w, upn)
          if (!c) return 'Benutzer nicht gefunden.'
          c.riskState = 'behoben'
        },
        { type: BA.cloudRiskResolved, target: upn },
      ),
      `${upn}: Risiko als behoben markiert.`,
    )
  const Check = ({ ok, label }: { ok: boolean; label: string }) => (
    <span className={cx('inline-flex items-center gap-1 text-xs', ok ? 'text-emerald-700' : 'text-slate-500')}>
      {ok ? <CircleCheck size={13} /> : <CircleX size={13} />} {label}
    </span>
  )
  if (!list.length) return <Notice tone="success">Derzeit sind keine Benutzer als gefährdet eingestuft.</Notice>
  return (
    <div className="space-y-3">
      {list.map(({ u, incident, pwChanged, revoked }) => (
        <Panel
          key={u.upn}
          title={
            <span className="flex flex-wrap items-center gap-2">
              <Link api={api} href={userHref(u.upn)} className="text-indigo-700 hover:underline">
                {u.displayName}
              </Link>
              {u.riskState === 'gefährdet' ? <Badge tone="red">Gefährdet</Badge> : <Badge tone="green">Behoben</Badge>}
            </span>
          }
          actions={
            u.riskState === 'gefährdet' && (
              <ConfirmButton className={cmdBtn} icon={<ShieldCheck size={14} />} confirmText="Als behoben markieren?" onConfirm={() => resolve(u.upn)}>
                Als behoben markieren
              </ConfirmButton>
            )
          }
        >
          {incident ? (
            <p className="text-sm">
              Verdächtige Anmeldung am {fmtDateTime(incident.time)} aus <strong className="text-rose-700">{incident.location}</strong> (IP {incident.ip}, {incident.client}) – Status: {incident.status}
            </p>
          ) : (
            <p className="text-sm text-slate-500">Keine riskante Anmeldung protokolliert.</p>
          )}
          <div className="mt-2 flex flex-wrap gap-4">
            <Check ok={pwChanged} label="Kennwort seit Vorfall geändert" />
            <Check ok={revoked} label="Sitzungen seit Vorfall widerrufen" />
            <Check ok={!(u.mailbox?.inboxRules.some((r) => r.suspicious && r.enabled) ?? false)} label="Keine aktiven verdächtigen Regeln" />
            <Check ok={!u.mailbox?.forwardingTo || u.mailbox.forwardingTo.endsWith('@musterwerk.example')} label="Keine externe Weiterleitung" />
          </div>
        </Panel>
      ))}
    </div>
  )
}

function RiskySignIns({ ctx }: { ctx: AdminCtx }) {
  const list = useMemo(
    () =>
      ctx.world.cloud.users
        .flatMap((u) => u.signIns.filter((s) => s.risk === 'hoch' || s.risk === 'mittel').map((s) => ({ ...s, user: u.upn })))
        .sort((a, b) => b.time.localeCompare(a.time)),
    [ctx.world.cloud.users],
  )
  return (
    <Panel title="Anmeldungen mit mittlerem oder hohem Risiko" flush>
      <SignInTable signIns={list} showUser />
    </Panel>
  )
}
