// Benutzerdetails: Übersicht, Lizenzen, Authentifizierungsmethoden, Anmeldeprotokolle, Geräte, Postfach.

import { Ban, KeyRound, LogOut, RotateCcw, ShieldAlert, ShieldCheck, UserCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { A } from '@/core/actions'
import { assignLicense, cloudResetPassword, findCloudUser, removeLicense, resetMfa, revokeSessions, setSignInBlocked, skuUsage } from '@/core/ops/cloud'
import type { CloudUser, SignIn } from '@/core/types'
import { checkPasswordPolicy, fmtDateTime, randomPassword } from '@/core/util'
import { Badge, cx, tableCls, Tabs } from '@/ui'
import { act, BA, ConfirmButton, initials, Link, Meter, Notice, PropGrid } from '../shared'
import { ADMIN, cmdBtn, cmdDanger, cmdPrimary, Crumbs, field, mailboxHref, PageTitle, Panel, skuName, UserBadges, type AdminCtx } from './ui'

type TabId = 'overview' | 'licenses' | 'auth' | 'signins' | 'devices' | 'mailbox'
type Msg = { tone: 'success' | 'error' | 'warning' | 'info'; text: string } | null

export function UserDetail({ ctx, upn }: { ctx: AdminCtx; upn: string }) {
  const { api, world } = ctx
  const cu = findCloudUser(world, upn)
  const [tab, setTab] = useState<TabId>((['overview', 'licenses', 'auth', 'signins', 'devices', 'mailbox'].includes(api.q('tab')) ? api.q('tab') : 'overview') as TabId)
  const [msg, setMsg] = useState<Msg>(null)
  const [pwOpen, setPwOpen] = useState(false)
  const crumbs = [{ label: 'Startseite', href: `${ADMIN}/` }, { label: 'Benutzer', href: `${ADMIN}/users` }, { label: cu?.displayName ?? upn }]
  if (!cu)
    return (
      <>
        <Crumbs api={api} items={crumbs} />
        <Notice tone="warning" title="Benutzer nicht gefunden">
          {upn} existiert nicht im Cloud-Verzeichnis. Neue AD-Konten erscheinen erst nach der nächsten Synchronisierung.
        </Notice>
      </>
    )

  const done = (err: string | null, ok: string) => setMsg(err ? { tone: 'error', text: err } : { tone: 'success', text: ok })
  const block = (b: boolean) => done(act((w) => setSignInBlocked(w, cu.upn, b), { type: b ? A.cloudSignInBlocked : A.cloudSignInUnblocked, target: cu.upn }), b ? 'Die Anmeldung wurde blockiert.' : 'Die Anmeldung ist wieder zugelassen.')
  const revoke = () => done(act((w) => revokeSessions(w, cu.upn), { type: A.cloudSessionsRevoked, target: cu.upn }), 'Alle Sitzungen wurden widerrufen. Der Benutzer muss sich auf allen Geräten neu anmelden.')
  const resolveRisk = () =>
    done(
      act(
        (w) => {
          const c = findCloudUser(w, cu.upn)
          if (!c) return 'Benutzer nicht gefunden.'
          c.riskState = 'behoben'
        },
        { type: BA.cloudRiskResolved, target: cu.upn },
      ),
      'Risiko wurde als behoben markiert.',
    )

  return (
    <>
      <Crumbs api={api} items={crumbs} />
      <PageTitle
        title={
          <span className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">{initials(cu.displayName)}</span>
            <span className="min-w-0">
              <span className="block truncate">{cu.displayName}</span>
              <span className="block truncate font-mono text-xs font-normal text-slate-500">{cu.upn}</span>
            </span>
          </span>
        }
        sub={<UserBadges cu={cu} />}
      />
      <div className="mb-3 flex flex-wrap gap-2">
        <button type="button" className={cmdBtn} onClick={() => setPwOpen((o) => !o)}>
          <KeyRound size={14} /> Kennwort zurücksetzen
        </button>
        {cu.signInBlocked ? (
          <ConfirmButton className={cmdBtn} icon={<UserCheck size={14} />} confirmText="Anmeldung wieder zulassen?" onConfirm={() => block(false)}>
            Anmeldung zulassen
          </ConfirmButton>
        ) : (
          <ConfirmButton className={cmdDanger} icon={<Ban size={14} />} confirmText="Anmeldung für diesen Benutzer blockieren?" onConfirm={() => block(true)}>
            Anmeldung blockieren
          </ConfirmButton>
        )}
        <ConfirmButton className={cmdBtn} icon={<LogOut size={14} />} confirmText="Alle Sitzungen widerrufen?" onConfirm={revoke}>
          Sitzungen widerrufen
        </ConfirmButton>
      </div>
      {cu.synced && (
        <p className="mb-3 text-xs text-slate-500">
          Dieses Konto wird aus dem lokalen Active Directory synchronisiert. Das AD ist führend: Eine Blockierung bzw. Freigabe hier kann beim nächsten Synchronisierungslauf überschrieben werden (im AD deaktivierte Konten werden blockiert, aktive wieder zugelassen).
        </p>
      )}
      {msg && (
        <Notice tone={msg.tone} className="mb-3">
          {msg.text}
        </Notice>
      )}
      {pwOpen && <PasswordReset ctx={ctx} cu={cu} onClose={() => setPwOpen(false)} />}
      {cu.riskState === 'gefährdet' && (
        <Notice tone="error" title="Benutzer gefährdet" className="mb-3">
          Es wurde verdächtige Anmeldeaktivität erkannt. Empfohlen: Kennwort zurücksetzen, Sitzungen widerrufen, Authentifizierungsmethoden und Posteingangsregeln prüfen – danach als behoben markieren.
          <div className="mt-2">
            <ConfirmButton className={cmdBtn} icon={<ShieldCheck size={14} />} confirmText="Risiko als behoben markieren?" onConfirm={resolveRisk}>
              Als behoben markieren
            </ConfirmButton>
          </div>
        </Notice>
      )}
      <Tabs<TabId>
        className="mb-4"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'overview', label: 'Übersicht' },
          { id: 'licenses', label: 'Lizenzen' },
          { id: 'auth', label: 'Authentifizierungsmethoden' },
          { id: 'signins', label: 'Anmeldeprotokolle' },
          { id: 'devices', label: 'Geräte' },
          { id: 'mailbox', label: 'Postfach' },
        ]}
      />
      {tab === 'overview' && <Overview ctx={ctx} cu={cu} />}
      {tab === 'licenses' && <Licenses ctx={ctx} cu={cu} setMsg={setMsg} />}
      {tab === 'auth' && <AuthMethods cu={cu} setMsg={setMsg} />}
      {tab === 'signins' && <SignIns cu={cu} />}
      {tab === 'devices' && <Devices cu={cu} />}
      {tab === 'mailbox' && <MailboxInfo ctx={ctx} cu={cu} />}
    </>
  )
}

function Overview({ ctx, cu }: { ctx: AdminCtx; cu: CloudUser }) {
  const ad = cu.sam ? ctx.world.users.find((u) => u.sam === cu.sam) : undefined
  return (
    <Panel title="Eigenschaften">
      <PropGrid
        items={[
          ['Anzeigename', cu.displayName],
          ['Benutzerprinzipalname', <span className="font-mono text-xs">{cu.upn}</span>],
          ['Quelle', cu.synced ? 'Lokales Active Directory (synchronisiert über SYNC01)' : 'Cloud'],
          ['Lokaler Anmeldename', cu.sam ? <span className="font-mono text-xs">MUSTERWERK\{cu.sam}</span> : '–'],
          ['Abteilung / Position', ad ? `${ad.department || '–'} / ${ad.title || '–'}` : '–'],
          ['Nutzungsort', cu.usageLocation || '–'],
          ['Anmeldung', cu.signInBlocked ? <Badge tone="red">Blockiert</Badge> : <Badge tone="green">Zugelassen</Badge>],
          ['Letzte Kennwortänderung', fmtDateTime(cu.lastPasswordChange)],
          ['Sitzungen widerrufen', fmtDateTime(cu.sessionsRevokedAt)],
          ['Risikostatus', cu.riskState === 'gefährdet' ? <Badge tone="red">Gefährdet</Badge> : cu.riskState === 'behoben' ? <Badge tone="green">Behoben</Badge> : 'Kein Risiko'],
          ['MFA', `${cu.mfa.enforced ? 'Erzwungen' : 'Nicht erzwungen'} · ${cu.mfa.methods.length} Methode(n)${cu.mfa.requireReRegister ? ' · Registrierung erforderlich' : ''}`],
          ['Lizenzen', cu.licenses.length ? cu.licenses.map((l) => skuName(ctx.world, l)).join(', ') : 'Keine'],
        ]}
      />
    </Panel>
  )
}

function PasswordReset({ ctx, cu, onClose }: { ctx: AdminCtx; cu: CloudUser; onClose: () => void }) {
  const [auto, setAuto] = useState(true)
  const [manual, setManual] = useState('')
  const [result, setResult] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const reset = () => {
    const pw = auto ? randomPassword() : manual
    const d = ctx.world.domain
    const policy = checkPasswordPolicy(pw, d.minPasswordLength, d.complexity, cu.sam)
    if (policy) return setErr(policy)
    const e = act((w) => cloudResetPassword(w, cu.upn, pw), { type: A.cloudPasswordReset, target: cu.upn, detail: cu.sam ? 'mit Kennwortrückschreiben ins AD' : 'Cloud-Konto' })
    if (e) return setErr(e)
    setErr('')
    setManual('')
    setResult(pw)
  }
  return (
    <Panel title="Kennwort zurücksetzen" className="mb-3" actions={<button type="button" className="text-xs text-slate-500 hover:underline" onClick={onClose}>Schließen</button>}>
      {result ? (
        <div className="space-y-2">
          <Notice tone="success" title="Kennwort wurde zurückgesetzt">
            Temporäres Kennwort: <span className="select-all rounded bg-white px-1.5 py-0.5 font-mono text-sm">{result}</span>
            <br />
            Der Benutzer muss das Kennwort bei der nächsten Anmeldung ändern.
          </Notice>
          <Notice tone="warning">Kennwort nur telefonisch nach erfolgreicher Identitätsprüfung mitteilen – niemals per E-Mail, Chat oder im Ticket!</Notice>
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" checked={auto} onChange={() => setAuto(true)} className="accent-indigo-600" /> Kennwort automatisch erstellen
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={!auto} onChange={() => setAuto(false)} className="accent-indigo-600" /> Eigenes Kennwort festlegen
          </label>
          {!auto && <input type="text" value={manual} onChange={(e) => setManual(e.target.value)} className={cx(field, 'w-full max-w-xs font-mono')} placeholder="Neues Kennwort" />}
          {cu.sam && <p className="text-xs text-slate-500">Kennwortrückschreiben aktiv: Das Kennwort wird auch im lokalen AD gesetzt (Richtlinie der Domäne gilt). Eine AD-Kontosperre wird dadurch nicht aufgehoben.</p>}
          {err && <Notice tone="error">{err}</Notice>}
          <button type="button" className={cmdPrimary} onClick={reset}>
            <RotateCcw size={14} /> Zurücksetzen
          </button>
        </div>
      )}
    </Panel>
  )
}

function Licenses({ ctx, cu, setMsg }: { ctx: AdminCtx; cu: CloudUser; setMsg: (m: Msg) => void }) {
  const { world } = ctx
  const toggle = (skuId: string, assigned: boolean) => {
    const name = skuName(world, skuId)
    const err = assigned
      ? act((w) => removeLicense(w, cu.upn, skuId), { type: A.cloudLicenseRemoved, target: cu.upn, detail: skuId })
      : act((w) => assignLicense(w, cu.upn, skuId), { type: A.cloudLicenseAssigned, target: cu.upn, detail: skuId })
    setMsg(err ? { tone: 'error', text: err } : { tone: 'success', text: assigned ? `Lizenz „${name}“ wurde entfernt.` : `Lizenz „${name}“ wurde zugewiesen.` })
  }
  return (
    <Panel title="Lizenzen und Apps" flush>
      <ul>
        {world.cloud.skus.map((s) => {
          const assigned = cu.licenses.includes(s.id)
          const free = s.total - skuUsage(world, s.id)
          return (
            <li key={s.id} className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-4 py-3 first:border-0">
              <div className="min-w-[12rem] flex-1">
                <div className="font-medium text-slate-900">{s.name}</div>
                <div className="text-xs text-slate-500">{s.services.join(' · ')}</div>
                <div className={cx('mt-0.5 text-xs', free <= 0 ? 'font-medium text-rose-700' : 'text-slate-500')}>
                  {free} von {s.total} Lizenzen verfügbar
                </div>
              </div>
              {assigned ? (
                <ConfirmButton className={cmdDanger} confirmText="Lizenz entfernen? Dienste werden deaktiviert." onConfirm={() => toggle(s.id, true)}>
                  Entfernen
                </ConfirmButton>
              ) : (
                <button type="button" className={cmdBtn} onClick={() => toggle(s.id, false)}>
                  Zuweisen
                </button>
              )}
              {assigned && <Badge tone="green">Zugewiesen</Badge>}
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}

function AuthMethods({ cu, setMsg }: { cu: CloudUser; setMsg: (m: Msg) => void }) {
  const reset = () => {
    const err = act((w) => resetMfa(w, cu.upn), { type: A.cloudMfaReset, target: cu.upn })
    setMsg(err ? { tone: 'error', text: err } : { tone: 'success', text: 'Alle Methoden wurden entfernt. Der Benutzer muss MFA bei der nächsten Anmeldung neu registrieren.' })
  }
  return (
    <Panel
      title="Authentifizierungsmethoden"
      actions={
        <ConfirmButton className={cmdDanger} icon={<RotateCcw size={14} />} confirmText="Identität geprüft? Alle Methoden entfernen und Neuregistrierung erzwingen?" onConfirm={reset}>
          MFA-Registrierung erneut anfordern
        </ConfirmButton>
      }
      flush
    >
      <div className="flex flex-wrap gap-4 px-4 py-3 text-sm">
        <span>
          MFA erzwungen: <strong>{cu.mfa.enforced ? 'Ja' : 'Nein'}</strong>
        </span>
        <span>
          Erneute Registrierung erforderlich: <strong>{cu.mfa.requireReRegister ? 'Ja' : 'Nein'}</strong>
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className={tableCls}>
          <thead>
            <tr>
              <th>Methode</th>
              <th>Details</th>
              <th>Standard</th>
              <th>Registriert</th>
            </tr>
          </thead>
          <tbody>
            {cu.mfa.methods.map((m) => (
              <tr key={m.id}>
                <td className="font-medium">{m.type}</td>
                <td>{m.detail}</td>
                <td>{m.isDefault ? <Badge tone="blue">Standard</Badge> : ''}</td>
                <td className="text-xs">{fmtDateTime(m.registered)}</td>
              </tr>
            ))}
            {!cu.mfa.methods.length && (
              <tr>
                <td colSpan={4} className="py-5 text-center text-sm text-slate-500">
                  Keine Methoden registriert.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">Hinweis: Ein Zurücksetzen der MFA-Methoden nur nach sorgfältiger Identitätsprüfung (beliebtes Social-Engineering-Ziel).</p>
    </Panel>
  )
}

const riskRow = (s: SignIn) => (s.risk === 'hoch' ? 'bg-rose-50' : s.risk === 'mittel' ? 'bg-amber-50' : '')
const statusTone = (s: SignIn['status']) => (s === 'Erfolgreich' ? 'green' : s === 'Unterbrochen (MFA)' ? 'amber' : 'red')
const riskTone = (r: SignIn['risk']) => (r === 'hoch' ? 'red' : r === 'mittel' ? 'amber' : r === 'niedrig' ? 'sky' : 'gray')

export function SignInTable({ signIns, showUser }: { signIns: (SignIn & { user?: string })[]; showUser?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className={tableCls}>
        <thead>
          <tr>
            <th>Zeit</th>
            {showUser && <th>Benutzer</th>}
            <th>Anwendung</th>
            <th>IP-Adresse</th>
            <th>Ort</th>
            <th>Client</th>
            <th>Status</th>
            <th>Risiko</th>
          </tr>
        </thead>
        <tbody>
          {signIns.map((s) => (
            <tr key={s.id} className={riskRow(s)}>
              <td className="whitespace-nowrap text-xs">{fmtDateTime(s.time)}</td>
              {showUser && <td className="text-xs">{s.user}</td>}
              <td className="text-xs">{s.app}</td>
              <td className="font-mono text-xs">{s.ip}</td>
              <td className={cx('text-xs', s.risk === 'hoch' && 'font-semibold text-rose-700')}>{s.location}</td>
              <td className="text-xs">{s.client}</td>
              <td>
                <Badge tone={statusTone(s.status)}>{s.status}</Badge>
                {s.failureReason && <div className="mt-0.5 text-[11px] text-slate-500">{s.failureReason}</div>}
              </td>
              <td>
                <Badge tone={riskTone(s.risk)}>
                  {s.risk === 'hoch' && <ShieldAlert size={11} />}
                  {s.risk}
                </Badge>
              </td>
            </tr>
          ))}
          {!signIns.length && (
            <tr>
              <td colSpan={showUser ? 8 : 7} className="py-5 text-center text-sm text-slate-500">
                Keine Anmeldungen vorhanden.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function SignIns({ cu }: { cu: CloudUser }) {
  const list = useMemo(() => [...cu.signIns].sort((a, b) => b.time.localeCompare(a.time)), [cu.signIns])
  return (
    <Panel title="Anmeldeprotokolle" flush>
      <SignInTable signIns={list} />
    </Panel>
  )
}

function Devices({ cu }: { cu: CloudUser }) {
  return (
    <Panel title="Registrierte Geräte" flush>
      <table className={tableCls}>
        <thead>
          <tr>
            <th>Gerät</th>
            <th>Betriebssystem</th>
            <th>Registriert</th>
            <th>Konform</th>
          </tr>
        </thead>
        <tbody>
          {cu.devices.map((d) => (
            <tr key={d.name}>
              <td className="font-medium">{d.name}</td>
              <td>{d.os}</td>
              <td className="text-xs">{fmtDateTime(d.registered)}</td>
              <td>{d.compliant ? <Badge tone="green">Ja</Badge> : <Badge tone="red">Nein</Badge>}</td>
            </tr>
          ))}
          {!cu.devices.length && (
            <tr>
              <td colSpan={4} className="py-5 text-center text-sm text-slate-500">
                Keine Geräte registriert.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Panel>
  )
}

function MailboxInfo({ ctx, cu }: { ctx: AdminCtx; cu: CloudUser }) {
  const mb = cu.mailbox
  if (!mb) return <Notice tone="info">Kein Postfach vorhanden. Ein Postfach wird mit einer Lizenz mit E-Mail-Dienst bereitgestellt.</Notice>
  const suspicious = mb.inboxRules.filter((r) => r.suspicious).length
  return (
    <Panel title="Postfach" actions={<Link api={ctx.api} href={mailboxHref(cu.upn)} className="text-xs text-indigo-700 hover:underline">In der E-Mail-Verwaltung öffnen</Link>}>
      <PropGrid
        items={[
          ['Typ', mb.type],
          [
            'Belegung',
            <span className="block max-w-xs">
              {mb.sizeGb.toFixed(1)} GB von {mb.quotaGb} GB
              <Meter value={mb.sizeGb} max={mb.quotaGb} className="mt-1" />
            </span>,
          ],
          ['Weiterleitung', mb.forwardingTo ?? 'Keine'],
          ['Automatische Antworten', mb.autoReply?.enabled ? 'Aktiv' : 'Aus'],
          ['Posteingangsregeln', `${mb.inboxRules.length}${suspicious ? ` (davon ${suspicious} verdächtig!)` : ''}`],
          ['Vollzugriff', mb.fullAccess.join(', ') || '–'],
          ['Archiv', mb.archiveEnabled ? 'Aktiv' : 'Inaktiv'],
        ]}
      />
    </Panel>
  )
}
