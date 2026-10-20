// Eigenschaften eines Benutzerkontos (Modal mit Registerkarten)

import { CircleCheck, CircleX, Cloud, ExternalLink, FolderInput, KeyRound, Lock, LockOpen, Monitor, Plus, Power, PowerOff, ShieldAlert, Trash2, UserPlus } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { A } from '@/core/actions'
import { addGroupMember, directGroupsOf, effectiveGroupsOf, removeGroupMember, setUserEnabled, unlockUser, updateUser } from '@/core/ops/ad'
import { useStore } from '@/core/store'
import type { AdUser } from '@/core/types'
import { fmtDate, fmtDateTime, fmtRelative } from '@/core/util'
import { Badge, Button, Checkbox, Field, Input, Modal, Select, Tabs, cx, tableCls } from '@/ui'
import { diffObject, dnToPath, fmtYmd, isPrivilegedGroup, passwordState, uacFlags } from './lib'
import { KV, ObjIcon, PickerDialog, SectionTitle, Warn, useAdCtx, usePrivilegedGuard, useRun } from './parts'
import { useAdActions } from './useAdActions'

export type UserTab = 'allgemein' | 'adresse' | 'konto' | 'organisation' | 'mitglied' | 'profil' | 'identitaet' | 'attribute' | 'cloud'

const EDIT_KEYS = [
  'givenName',
  'surname',
  'displayName',
  'description',
  'office',
  'phone',
  'mobile',
  'mail',
  'upn',
  'homeOffice',
  'homeAddress',
  'accountExpires',
  'mustChangePassword',
  'passwordNeverExpires',
  'cannotChangePassword',
  'title',
  'department',
  'company',
  'manager',
  'homeDirectory',
  'homeDrive',
  'logonScript',
  'employeeId',
  'birthDate',
  'extra',
] as const satisfies readonly (keyof AdUser)[]

const FIELD_LABELS: Partial<Record<keyof AdUser, string>> = {
  givenName: 'Vorname',
  surname: 'Nachname',
  displayName: 'Anzeigename',
  description: 'Beschreibung',
  office: 'Büro',
  phone: 'Rufnummer',
  mobile: 'Mobiltelefon',
  mail: 'E-Mail',
  upn: 'Benutzeranmeldename',
  homeOffice: 'Homeoffice',
  homeAddress: 'Privatadresse',
  accountExpires: 'Konto läuft ab',
  mustChangePassword: 'Kennwort bei nächster Anmeldung ändern',
  passwordNeverExpires: 'Kennwort läuft nie ab',
  cannotChangePassword: 'Benutzer kann Kennwort nicht ändern',
  title: 'Position',
  department: 'Abteilung',
  company: 'Firma',
  manager: 'Vorgesetzter',
  homeDirectory: 'Basisordner',
  homeDrive: 'Basislaufwerk',
  logonScript: 'Anmeldeskript',
  employeeId: 'Personalnummer',
  birthDate: 'Geburtsdatum',
  extra: 'Erweiterungsattribute',
}

export function UserProperties({ sam, initialTab, onClose }: { sam: string; initialTab?: string; onClose: () => void }) {
  const user = useStore((s) => s.world.users.find((u) => u.sam === sam))
  if (!user)
    return (
      <Modal title="Objekt nicht gefunden" onClose={onClose} size="sm" footer={<Button onClick={onClose}>Schließen</Button>}>
        <p className="text-sm text-slate-600">Das Benutzerobjekt „{sam}“ ist nicht (mehr) vorhanden. Möglicherweise wurde es gelöscht.</p>
      </Modal>
    )
  return <UserPropertiesInner key={user.sam} user={user} initialTab={(initialTab as UserTab) ?? 'allgemein'} onClose={onClose} />
}

function UserPropertiesInner({ user, initialTab, onClose }: { user: AdUser; initialTab: UserTab; onClose: () => void }) {
  const [tab, setTab] = useState<UserTab>(initialTab)
  const [orig, setOrig] = useState<AdUser>(user)
  const [draft, setDraft] = useState<AdUser>(user)
  const [unlockOnSave, setUnlockOnSave] = useState(false)
  const run = useRun()
  const toast = useStore((s) => s.toast)
  const actions = useAdActions()
  const { openAction } = useAdCtx()

  const set = <K extends keyof AdUser>(k: K, v: AdUser[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const patch = useMemo(() => diffObject(orig, draft, EDIT_KEYS), [orig, draft])
  const enabledChanged = draft.enabled !== orig.enabled
  const dirty = Object.keys(patch).length > 0 || enabledChanged || (unlockOnSave && user.lockedOut)

  function save(): boolean {
    let ok = true
    let changed = false
    if (unlockOnSave && user.lockedOut) {
      ok = run((w) => unlockUser(w, user.sam), { type: A.adUnlock, target: user.sam }) && ok
      changed = true
    }
    if (enabledChanged) {
      if (!draft.enabled && user.sam === useStore.getState().world.tech.sam) {
        toast('Sie können Ihr eigenes Konto nicht deaktivieren.', 'error')
        ok = false
      } else {
        ok = run((w) => setUserEnabled(w, user.sam, draft.enabled), { type: draft.enabled ? A.adUserEnabled : A.adUserDisabled, target: user.sam }) && ok
        changed = true
      }
    }
    const keys = Object.keys(patch) as (keyof AdUser)[]
    if (keys.length) {
      if (draft.mustChangePassword && draft.passwordNeverExpires) {
        toast('„Kennwort läuft nie ab“ und „Kennwort bei der nächsten Anmeldung ändern“ schließen sich aus.', 'error')
        return false
      }
      if (!draft.upn.includes('@') || draft.upn.startsWith('@')) {
        toast('Der Benutzeranmeldename (UPN) ist ungültig.', 'error')
        return false
      }
      const clean: Partial<AdUser> = { ...patch }
      if ('manager' in clean && !clean.manager) clean.manager = undefined
      if ('accountExpires' in clean && !clean.accountExpires) clean.accountExpires = undefined
      if ('mobile' in clean && !clean.mobile) clean.mobile = undefined
      ok = run((w) => updateUser(w, user.sam, clean), { type: A.adUserUpdated, target: user.sam, detail: keys.join(', ') }) && ok
      changed = true
    }
    if (ok) {
      setOrig(draft)
      setUnlockOnSave(false)
      if (changed) toast(`Änderungen an „${draft.displayName}“ wurden gespeichert.`, 'success')
    }
    return ok
  }

  const tabs: { id: UserTab; label: ReactNode }[] = [
    { id: 'allgemein', label: 'Allgemein' },
    { id: 'adresse', label: 'Adresse' },
    { id: 'konto', label: user.lockedOut ? <span className="flex items-center gap-1">Konto <Lock size={12} className="text-amber-600" /></span> : 'Konto' },
    { id: 'organisation', label: 'Organisation' },
    { id: 'mitglied', label: 'Mitglied von' },
    { id: 'profil', label: 'Profil' },
    { id: 'identitaet', label: <span className="flex items-center gap-1">Identität <ShieldAlert size={12} className="text-rose-600" /></span> },
    { id: 'attribute', label: 'Attribut-Editor' },
    { id: 'cloud', label: 'Cloud' },
  ]

  return (
    <Modal
      size="xl"
      onClose={onClose}
      title={
        <span className="flex flex-wrap items-center gap-2">
          <ObjIcon kind="user" variant={user.isServiceAccount ? 'service' : undefined} disabled={!user.enabled} locked={user.lockedOut} size={18} />
          Eigenschaften von {user.displayName}
          <span className="text-sm font-normal text-slate-500">({user.sam})</span>
          {!user.enabled && <Badge tone="gray">Deaktiviert</Badge>}
          {user.lockedOut && <Badge tone="amber">Gesperrt</Badge>}
        </span>
      }
      footer={
        <>
          <span className="mr-auto self-center text-xs text-slate-500">{dirty ? 'Ungespeicherte Änderungen' : `Zuletzt geändert ${fmtRelative(user.modified)}`}</span>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button disabled={!dirty} onClick={() => save()}>
            Übernehmen
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              if (!dirty || save()) onClose()
            }}
          >
            OK
          </Button>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap gap-1.5">
        <Button size="sm" icon={<KeyRound size={13} />} onClick={() => openAction({ t: 'reset', sam: user.sam })}>
          Kennwort zurücksetzen…
        </Button>
        <Button size="sm" icon={<LockOpen size={13} />} disabled={!user.lockedOut} onClick={() => actions.unlock(user.sam)}>
          Konto entsperren
        </Button>
        {user.enabled ? (
          <Button size="sm" icon={<PowerOff size={13} />} onClick={() => actions.setUserEnabled(user.sam, false)}>
            Konto deaktivieren
          </Button>
        ) : (
          <Button size="sm" icon={<Power size={13} />} onClick={() => actions.setUserEnabled(user.sam, true)}>
            Konto aktivieren
          </Button>
        )}
        <Button size="sm" icon={<FolderInput size={13} />} onClick={() => openAction({ t: 'move', kind: 'user', id: user.sam })}>
          Verschieben…
        </Button>
        <Button size="sm" icon={<UserPlus size={13} />} onClick={() => openAction({ t: 'newUser', ou: user.ou, template: user.sam })}>
          Kopieren…
        </Button>
        <Button size="sm" icon={<Monitor size={13} />} onClick={() => actions.rdpUser(user.sam)}>
          Remote-Desktop zum PC
        </Button>
        <Button size="sm" variant="ghost" className="text-rose-700 hover:bg-rose-50" icon={<Trash2 size={13} />} onClick={() => openAction({ t: 'deleteUser', sam: user.sam })}>
          Löschen
        </Button>
      </div>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      <div className="min-h-[24rem] pt-4">
        {tab === 'allgemein' && <GeneralTab draft={draft} set={set} />}
        {tab === 'adresse' && <AddressTab draft={draft} set={set} />}
        {tab === 'konto' && <AccountTab user={user} draft={draft} set={set} unlockOnSave={unlockOnSave} setUnlockOnSave={setUnlockOnSave} />}
        {tab === 'organisation' && <OrgTab user={user} draft={draft} set={set} />}
        {tab === 'mitglied' && <MemberOfTab member={user.sam} memberLabel={user.displayName} primaryGroup="Domänen-Benutzer" />}
        {tab === 'profil' && <ProfileTab draft={draft} set={set} />}
        {tab === 'identitaet' && <IdentityTab draft={draft} set={set} />}
        {tab === 'attribute' && <AttributeTab user={user} draft={draft} set={set} />}
        {tab === 'cloud' && <CloudTab user={user} />}
      </div>
      {!!Object.keys(patch).length && (
        <div className="mt-3 text-xs text-slate-500">
          Geändert:{' '}
          {Object.keys(patch)
            .map((k) => FIELD_LABELS[k as keyof AdUser] ?? k)
            .join(', ')}
        </div>
      )}
    </Modal>
  )
}

type Setter = <K extends keyof AdUser>(k: K, v: AdUser[K]) => void

// ─────────────── Allgemein ───────────────

function GeneralTab({ draft, set }: { draft: AdUser; set: Setter }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Vorname">
        <Input value={draft.givenName} onChange={(e) => set('givenName', e.target.value)} />
      </Field>
      <Field label="Nachname">
        <Input value={draft.surname} onChange={(e) => set('surname', e.target.value)} />
      </Field>
      <Field label="Anzeigename" className="md:col-span-2">
        <Input value={draft.displayName} onChange={(e) => set('displayName', e.target.value)} />
      </Field>
      <Field label="Beschreibung" className="md:col-span-2">
        <Input value={draft.description ?? ''} onChange={(e) => set('description', e.target.value)} />
      </Field>
      <Field label="Büro">
        <Input value={draft.office} onChange={(e) => set('office', e.target.value)} />
      </Field>
      <Field label="Rufnummer (Durchwahl)">
        <Input value={draft.phone} onChange={(e) => set('phone', e.target.value)} />
      </Field>
      <Field label="Mobiltelefon">
        <Input value={draft.mobile ?? ''} onChange={(e) => set('mobile', e.target.value)} />
      </Field>
      <Field label="E-Mail">
        <Input value={draft.mail} onChange={(e) => set('mail', e.target.value)} />
      </Field>
    </div>
  )
}

// ─────────────── Adresse ───────────────

function AddressTab({ draft, set }: { draft: AdUser; set: Setter }) {
  const company = useStore((s) => s.world.company)
  const addr = draft.homeAddress ?? { street: '', postalCode: '', city: '' }
  const setAddr = (k: keyof typeof addr, v: string) => {
    const next = { ...addr, [k]: v }
    set('homeAddress', next.street || next.postalCode || next.city ? next : undefined)
  }
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-3">
        <SectionTitle>Privatadresse / Homeoffice</SectionTitle>
        <Checkbox label="Mitarbeiter arbeitet (überwiegend) im Homeoffice" checked={draft.homeOffice} onChange={(v) => set('homeOffice', v)} />
        <Field label="Straße und Hausnummer">
          <Input value={addr.street} onChange={(e) => setAddr('street', e.target.value)} />
        </Field>
        <div className="grid grid-cols-[8rem_1fr] gap-3">
          <Field label="PLZ">
            <Input value={addr.postalCode} onChange={(e) => setAddr('postalCode', e.target.value)} />
          </Field>
          <Field label="Ort">
            <Input value={addr.city} onChange={(e) => setAddr('city', e.target.value)} />
          </Field>
        </div>
        <Warn tone="sky">
          <span>Diese Adresse wird für den Versand von Geräten ins Homeoffice verwendet. Vor dem Versand mit dem Mitarbeiter abgleichen – personenbezogene Daten nicht weitergeben.</span>
        </Warn>
      </div>
      <div className="space-y-3">
        <SectionTitle>Geschäftsadresse</SectionTitle>
        <KV
          rows={[
            ['Firma', company.legalName],
            ['Anschrift', company.address],
            ['Standort / Büro', draft.office],
            ['Zentrale', company.phone],
          ]}
        />
      </div>
    </div>
  )
}

// ─────────────── Konto ───────────────

function AccountTab({ user, draft, set, unlockOnSave, setUnlockOnSave }: { user: AdUser; draft: AdUser; set: Setter; unlockOnSave: boolean; setUnlockOnSave: (v: boolean) => void }) {
  const domain = useStore((s) => s.world.domain)
  const toast = useStore((s) => s.toast)
  const actions = useAdActions()
  const { openAction } = useAdCtx()
  const [upnPrefix, upnSuffix] = useMemo(() => {
    const i = draft.upn.lastIndexOf('@')
    return i < 0 ? [draft.upn, domain.upnSuffix] : [draft.upn.slice(0, i), draft.upn.slice(i + 1)]
  }, [draft.upn, domain.upnSuffix])
  const suffixes = Array.from(new Set([domain.upnSuffix, domain.dnsName, upnSuffix]))
  const unlockAt = user.lockoutTime ? new Date(new Date(user.lockoutTime).getTime() + domain.lockoutDurationMin * 60_000).toISOString() : undefined
  const pw = passwordState(user, domain.maxPasswordAgeDays)
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <Field label="Benutzeranmeldename (UPN)">
          <div className="flex items-center gap-1">
            <Input value={upnPrefix} onChange={(e) => set('upn', `${e.target.value}@${upnSuffix}`)} />
            <span className="text-slate-500">@</span>
            <Select value={upnSuffix} onChange={(e) => set('upn', `${upnPrefix}@${e.target.value}`)} className="w-52">
              {suffixes.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </div>
        </Field>
        <Field label="Benutzeranmeldename (Prä-Windows 2000)">
          <div className="flex items-center gap-1">
            <Input value={`${domain.netbios}\\`} disabled className="w-36" />
            <Input value={user.sam} disabled />
          </div>
        </Field>

        <div className={cx('rounded-md border p-3', user.lockedOut ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-slate-50')}>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            {user.lockedOut ? <Lock size={16} className="text-amber-700" /> : <LockOpen size={16} className="text-emerald-600" />}
            {user.lockedOut ? 'Dieses Konto ist auf dem Domänencontroller gesperrt.' : 'Konto ist nicht gesperrt.'}
          </div>
          <KV
            rows={[
              ['Kontosperrungsstatus', user.lockedOut ? <Badge tone="amber">Gesperrt</Badge> : <Badge tone="green">Nicht gesperrt</Badge>],
              ['Gesperrt seit', user.lockedOut ? `${fmtDateTime(user.lockoutTime)} (${fmtRelative(user.lockoutTime)})` : '–'],
              ['Automatische Entsperrung', user.lockedOut && unlockAt ? `${fmtDateTime(unlockAt)} (Sperrdauer ${domain.lockoutDurationMin} Min.)` : '–'],
              ['Fehlanmeldungen (badPwdCount)', `${user.badPwdCount} von ${domain.lockoutThreshold}`],
              ['Letzte Anmeldung', user.lastLogon ? `${fmtDateTime(user.lastLogon)}` : 'nie'],
            ]}
          />
          {user.lockedOut && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Checkbox label="Konto entsperren (beim Speichern)" checked={unlockOnSave} onChange={setUnlockOnSave} />
              <Button size="sm" icon={<LockOpen size={13} />} onClick={() => actions.unlock(user.sam)}>
                Jetzt entsperren
              </Button>
            </div>
          )}
          <p className="mt-2 text-xs text-slate-500">Woher die Fehlanmeldungen stammen, zeigt das Sicherheitsprotokoll des Domänencontrollers (Infrastruktur → DC-Sicherheitsprotokoll, Ereignis 4740).</p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <SectionTitle>Kontooptionen</SectionTitle>
          <div className="flex flex-col gap-2 rounded-md border border-slate-200 p-3">
            <Checkbox
              label="Benutzer muss Kennwort bei der nächsten Anmeldung ändern"
              checked={draft.mustChangePassword}
              onChange={(v) => {
                set('mustChangePassword', v)
                if (v && draft.passwordNeverExpires) {
                  set('passwordNeverExpires', false)
                  toast('„Kennwort läuft nie ab“ wurde deaktiviert – beide Optionen schließen sich aus.', 'info')
                }
              }}
            />
            <Checkbox label="Benutzer kann Kennwort nicht ändern" checked={draft.cannotChangePassword} onChange={(v) => set('cannotChangePassword', v)} />
            <Checkbox
              label="Kennwort läuft nie ab"
              checked={draft.passwordNeverExpires}
              onChange={(v) => {
                set('passwordNeverExpires', v)
                if (v && draft.mustChangePassword) {
                  set('mustChangePassword', false)
                  toast('„Kennwort bei der nächsten Anmeldung ändern“ wurde deaktiviert – beide Optionen schließen sich aus.', 'info')
                }
              }}
            />
            <Checkbox label="Konto ist deaktiviert" checked={!draft.enabled} onChange={(v) => set('enabled', !v)} />
          </div>
        </div>
        <div>
          <SectionTitle>Konto läuft ab</SectionTitle>
          <div className="flex flex-wrap items-center gap-4 rounded-md border border-slate-200 p-3 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" className="accent-sky-600" checked={!draft.accountExpires} onChange={() => set('accountExpires', undefined)} />
              Nie
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" className="accent-sky-600" checked={!!draft.accountExpires} onChange={() => set('accountExpires', draft.accountExpires ?? new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10))} />
              Am Ende von:
            </label>
            <Input type="date" className="w-44" disabled={!draft.accountExpires} value={draft.accountExpires?.slice(0, 10) ?? ''} onChange={(e) => set('accountExpires', e.target.value || undefined)} />
          </div>
          {user.accountExpires && new Date(user.accountExpires).getTime() < Date.now() && <p className="mt-1 text-xs text-rose-700">Das Konto ist abgelaufen ({fmtDate(user.accountExpires)}).</p>}
        </div>
        <div>
          <SectionTitle>Kennwort</SectionTitle>
          <KV
            rows={[
              ['Zuletzt festgelegt', `${fmtDateTime(user.pwdLastSet)} (${fmtRelative(user.pwdLastSet)})`],
              ['Status', <Badge tone={pw.tone}>{pw.label}</Badge>],
              ['Max. Kennwortalter', `${domain.maxPasswordAgeDays} Tage`],
            ]}
          />
          <Button size="sm" className="mt-2" icon={<KeyRound size={13} />} onClick={() => openAction({ t: 'reset', sam: user.sam })}>
            Kennwort zurücksetzen…
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─────────────── Organisation ───────────────

function OrgTab({ user, draft, set }: { user: AdUser; draft: AdUser; set: Setter }) {
  const users = useStore((s) => s.world.users)
  const { openProps } = useAdCtx()
  const [pick, setPick] = useState(false)
  const departments = useMemo(() => Array.from(new Set(users.map((u) => u.department).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'de')), [users])
  const manager = draft.manager ? users.find((u) => u.sam === draft.manager) : undefined
  const reports = useMemo(() => users.filter((u) => u.manager === user.sam).sort((a, b) => a.displayName.localeCompare(b.displayName, 'de')), [users, user.sam])
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-3">
        <Field label="Position">
          <Input value={draft.title} onChange={(e) => set('title', e.target.value)} />
        </Field>
        <Field label="Abteilung">
          <Input list="ad-departments" value={draft.department} onChange={(e) => set('department', e.target.value)} />
          <datalist id="ad-departments">
            {departments.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </Field>
        <Field label="Firma">
          <Input value={draft.company} onChange={(e) => set('company', e.target.value)} />
        </Field>
        <Field label="Vorgesetzter">
          <div className="flex items-center gap-2">
            <Input value={manager ? `${manager.displayName} (${manager.sam})` : (draft.manager ?? '')} disabled />
            <Button size="sm" onClick={() => setPick(true)}>
              Ändern…
            </Button>
            <Button size="sm" disabled={!manager} onClick={() => manager && openProps({ kind: 'user', id: manager.sam })}>
              Eigenschaften
            </Button>
            <Button size="sm" variant="ghost" disabled={!draft.manager} onClick={() => set('manager', undefined)}>
              Löschen
            </Button>
          </div>
        </Field>
      </div>
      <div>
        <SectionTitle>Mitarbeiter (direkt unterstellt)</SectionTitle>
        <div className="max-h-72 overflow-auto rounded-md border border-slate-200">
          <table className={tableCls}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Position</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.sam} className="cursor-pointer hover:bg-slate-50" onDoubleClick={() => openProps({ kind: 'user', id: r.sam })} title="Doppelklick öffnet die Eigenschaften">
                  <td>
                    <span className="flex items-center gap-2">
                      <ObjIcon kind="user" disabled={!r.enabled} locked={r.lockedOut} />
                      {r.displayName}
                    </span>
                  </td>
                  <td className="text-xs text-slate-500">{r.title}</td>
                </tr>
              ))}
              {!reports.length && (
                <tr>
                  <td colSpan={2} className="py-4 text-center text-slate-400">
                    Keine Mitarbeiter
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {pick && <PickerDialog title="Vorgesetzten auswählen" kinds={['user']} exclude={[user.sam]} onPick={(e) => set('manager', e.id)} onClose={() => setPick(false)} />}
    </div>
  )
}

// ─────────────── Mitglied von (auch für Gruppen/Computer) ───────────────

export function MemberOfTab({ member, memberLabel, primaryGroup }: { member: string; memberLabel: string; primaryGroup?: string }) {
  const world = useStore((s) => s.world)
  const groups = world.groups
  const run = useRun()
  const { openProps } = useAdCtx()
  const { guard, dialog } = usePrivilegedGuard()
  const [pick, setPick] = useState(false)
  const [sel, setSel] = useState<string | null>(null)
  const direct = useMemo(() => directGroupsOf(world, member), [world, member])
  const effective = useMemo(() => effectiveGroupsOf(world, member).filter((g) => !direct.includes(g)), [world, member, direct])
  const directGroups = useMemo(() => direct.map((n) => groups.find((g) => g.name === n)!).filter(Boolean), [direct, groups])

  const add = (group: string) =>
    guard(group, memberLabel, () => run((w) => addGroupMember(w, group, member), { type: A.adGroupAdd, target: member, detail: group }, `„${memberLabel}“ wurde der Gruppe „${group}“ hinzugefügt.`))
  const remove = (group: string) => {
    if (primaryGroup && group === primaryGroup) return
    if (run((w) => removeGroupMember(w, group, member), { type: A.adGroupRemove, target: member, detail: group }, `„${memberLabel}“ wurde aus „${group}“ entfernt.`)) setSel(null)
  }
  return (
    <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
      <div>
        <SectionTitle>Direkte Mitgliedschaften</SectionTitle>
        <div className="max-h-80 overflow-auto rounded-md border border-slate-200">
          <table className={tableCls}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Ordner</th>
              </tr>
            </thead>
            <tbody>
              {directGroups.map((g) => (
                <tr
                  key={g.name}
                  className={cx('cursor-pointer', sel === g.name ? 'bg-sky-100' : 'hover:bg-slate-50')}
                  onClick={() => setSel(g.name)}
                  onDoubleClick={() => openProps({ kind: 'group', id: g.name })}
                >
                  <td>
                    <span className="flex items-center gap-2">
                      <ObjIcon kind="group" />
                      {g.name}
                      {isPrivilegedGroup(g.name) && <Badge tone="red">privilegiert</Badge>}
                      {g.name === primaryGroup && <Badge>primäre Gruppe</Badge>}
                    </span>
                  </td>
                  <td className="text-xs text-slate-500">{dnToPath(g.ou).split('/').slice(1).join('/')}</td>
                </tr>
              ))}
              {!directGroups.length && (
                <tr>
                  <td colSpan={2} className="py-4 text-center text-slate-400">
                    Keine Gruppenmitgliedschaften
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex gap-2">
          <Button size="sm" icon={<Plus size={13} />} onClick={() => setPick(true)}>
            Hinzufügen…
          </Button>
          <Button size="sm" disabled={!sel || sel === primaryGroup} onClick={() => sel && remove(sel)} title={sel === primaryGroup ? 'Die primäre Gruppe kann nicht entfernt werden.' : undefined}>
            Entfernen
          </Button>
          <Button size="sm" variant="ghost" disabled={!sel} onClick={() => sel && openProps({ kind: 'group', id: sel })}>
            Eigenschaften
          </Button>
        </div>
        <p className="mt-2 text-xs text-slate-500">Änderungen an Gruppenmitgliedschaften werden sofort wirksam. Der Benutzer muss sich neu anmelden (bzw. „klist purge“/Neustart), damit das Anmeldetoken die neue Gruppe enthält.</p>
      </div>
      <div>
        <SectionTitle>Effektiv über Verschachtelung (Info)</SectionTitle>
        <ul className="max-h-80 space-y-1 overflow-auto rounded-md border border-slate-200 p-2 text-sm">
          {effective.map((g) => (
            <li key={g} className="flex items-center gap-2 text-slate-600">
              <ObjIcon kind="group" size={14} />
              {g}
            </li>
          ))}
          {!effective.length && <li className="py-2 text-center text-slate-400">Keine weiteren Gruppen</li>}
        </ul>
      </div>
      {pick && <PickerDialog title={`Gruppe für „${memberLabel}“ auswählen`} kinds={['group']} exclude={[...direct, member]} onPick={(e) => add(e.id)} onClose={() => setPick(false)} />}
      {dialog}
    </div>
  )
}

// ─────────────── Profil ───────────────

function ProfileTab({ draft, set }: { draft: AdUser; set: Setter }) {
  const letters = ['', 'H:', 'I:', 'J:', 'K:', 'M:', 'N:', 'P:', 'U:', 'Z:']
  return (
    <div className="grid max-w-2xl gap-4">
      <SectionTitle>Basisordner</SectionTitle>
      <div className="grid grid-cols-[8rem_1fr] gap-3">
        <Field label="Verbinden von">
          <Select value={draft.homeDrive ?? ''} onChange={(e) => set('homeDrive', e.target.value || undefined)}>
            {letters.map((l) => (
              <option key={l} value={l}>
                {l || '(keins)'}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="mit (UNC-Pfad)" hint="z. B. \\FS01\home$\vorname.nachname">
          <Input value={draft.homeDirectory ?? ''} onChange={(e) => set('homeDirectory', e.target.value || undefined)} />
        </Field>
      </div>
      <SectionTitle className="mt-2">Benutzerprofil</SectionTitle>
      <Field label="Anmeldeskript" hint="Wird aus \\musterwerk.local\NETLOGON ausgeführt (z. B. logon.cmd)">
        <Input value={draft.logonScript ?? ''} onChange={(e) => set('logonScript', e.target.value)} />
      </Field>
    </div>
  )
}

// ─────────────── Identität (vertraulich) ───────────────

function IdentityTab({ draft, set }: { draft: AdUser; set: Setter }) {
  const [givenId, setGivenId] = useState('')
  const [givenBirth, setGivenBirth] = useState('')
  const normBirth = (s: string) => {
    const t = s.trim()
    const m = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
    return t
  }
  const idOk = givenId.trim() ? givenId.trim() === draft.employeeId : undefined
  const birthOk = givenBirth.trim() ? normBirth(givenBirth) === draft.birthDate : undefined
  const mark = (ok?: boolean) => (ok === undefined ? null : ok ? <CircleCheck size={18} className="text-emerald-600" /> : <CircleX size={18} className="text-rose-600" />)
  return (
    <div className="space-y-4">
      <Warn tone="red">
        <ShieldAlert size={18} className="mt-0.5 shrink-0" />
        <div>
          <strong>VERTRAULICH – personenbezogene Daten.</strong> Nur zur Identitätsprüfung verwenden: Der Anrufer muss die Daten <em>selbst nennen</em>, Sie gleichen ab. Niemals vorlesen, nicht ins Ticket schreiben, nicht per Mail/Chat weitergeben.
        </div>
      </Warn>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-3 rounded-md border-2 border-dashed border-rose-200 p-3">
          <Field label="Personalnummer">
            <Input value={draft.employeeId} onChange={(e) => set('employeeId', e.target.value)} />
          </Field>
          <Field label="Geburtsdatum" hint={draft.birthDate ? `= ${fmtYmd(draft.birthDate)}` : undefined}>
            <Input type="date" value={draft.birthDate} onChange={(e) => set('birthDate', e.target.value)} />
          </Field>
        </div>
        <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
          <SectionTitle>Abgleich mit Angaben des Anrufers</SectionTitle>
          <Field label="Genannte Personalnummer">
            <div className="flex items-center gap-2">
              <Input value={givenId} onChange={(e) => setGivenId(e.target.value)} placeholder="z. B. 41237" />
              {mark(idOk)}
            </div>
          </Field>
          <Field label="Genanntes Geburtsdatum">
            <div className="flex items-center gap-2">
              <Input value={givenBirth} onChange={(e) => setGivenBirth(e.target.value)} placeholder="TT.MM.JJJJ" />
              {mark(birthOk)}
            </div>
          </Field>
          {idOk !== undefined && birthOk !== undefined && (
            <div className={cx('rounded px-2 py-1 text-sm font-medium', idOk && birthOk ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800')}>
              {idOk && birthOk ? 'Identität bestätigt – beide Angaben stimmen überein.' : 'Angaben stimmen NICHT überein – keine sicherheitsrelevanten Änderungen durchführen!'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────── Attribut-Editor ───────────────

const NEW_MARK = '(neu)'

interface AttrRow {
  attr: string
  value: string
  key?: keyof AdUser
  extraKey?: string
}

function AttributeTab({ user, draft, set }: { user: AdUser; draft: AdUser; set: Setter }) {
  const users = useStore((s) => s.world.users)
  const groups = useStore((s) => s.world.groups)
  const [onlyValues, setOnlyValues] = useState(true)
  const [edit, setEdit] = useState<string | null>(null)
  const [editVal, setEditVal] = useState('')
  const [newExt, setNewExt] = useState('')
  const rows = useMemo<AttrRow[]>(() => {
    const mgr = draft.manager ? users.find((u) => u.sam === draft.manager) : undefined
    const memberOf = groups.filter((g) => g.members.some((m) => m.toLowerCase() === user.sam.toLowerCase())).map((g) => `CN=${g.name},${g.ou}`)
    const s = (v: unknown) => (v === undefined || v === null ? '' : String(v))
    const list: AttrRow[] = [
      { attr: 'accountExpires', value: draft.accountExpires ? fmtDateTime(draft.accountExpires) : '(nie)' },
      { attr: 'badPwdCount', value: s(user.badPwdCount) },
      { attr: 'company', value: s(draft.company), key: 'company' },
      { attr: 'department', value: s(draft.department), key: 'department' },
      { attr: 'description', value: s(draft.description), key: 'description' },
      { attr: 'displayName', value: s(draft.displayName), key: 'displayName' },
      { attr: 'distinguishedName', value: `CN=${user.displayName},${user.ou}` },
      { attr: 'employeeID', value: s(draft.employeeId), key: 'employeeId' },
      { attr: 'givenName', value: s(draft.givenName), key: 'givenName' },
      { attr: 'homeDirectory', value: s(draft.homeDirectory), key: 'homeDirectory' },
      { attr: 'homeDrive', value: s(draft.homeDrive), key: 'homeDrive' },
      { attr: 'l', value: s(draft.homeAddress?.city) },
      { attr: 'lastLogonTimestamp', value: user.lastLogon ? fmtDateTime(user.lastLogon) : '' },
      { attr: 'lockoutTime', value: user.lockoutTime ? fmtDateTime(user.lockoutTime) : '0' },
      { attr: 'mail', value: s(draft.mail), key: 'mail' },
      { attr: 'manager', value: mgr ? `CN=${mgr.displayName},${mgr.ou}` : s(draft.manager) },
      { attr: 'memberOf', value: memberOf.join('; ') },
      { attr: 'mobile', value: s(draft.mobile), key: 'mobile' },
      { attr: 'mw-birthDate', value: s(draft.birthDate), key: 'birthDate' },
      { attr: 'objectClass', value: 'top; person; organizationalPerson; user' },
      { attr: 'physicalDeliveryOfficeName', value: s(draft.office), key: 'office' },
      { attr: 'postalCode', value: s(draft.homeAddress?.postalCode) },
      { attr: 'pwdLastSet', value: fmtDateTime(user.pwdLastSet) },
      { attr: 'sAMAccountName', value: user.sam },
      { attr: 'scriptPath', value: s(draft.logonScript), key: 'logonScript' },
      { attr: 'sn', value: s(draft.surname), key: 'surname' },
      { attr: 'streetAddress', value: s(draft.homeAddress?.street) },
      { attr: 'telephoneNumber', value: s(draft.phone), key: 'phone' },
      { attr: 'title', value: s(draft.title), key: 'title' },
      { attr: 'userAccountControl', value: uacFlags({ ...user, enabled: draft.enabled, passwordNeverExpires: draft.passwordNeverExpires, cannotChangePassword: draft.cannotChangePassword }) },
      { attr: 'userPassword', value: '<nicht lesbar>' },
      { attr: 'userPrincipalName', value: s(draft.upn), key: 'upn' },
      { attr: 'whenChanged', value: fmtDateTime(user.modified) },
      { attr: 'whenCreated', value: fmtDateTime(user.created) },
    ]
    for (const [k, v] of Object.entries(draft.extra ?? {})) list.push({ attr: k, value: v, extraKey: k })
    return list.sort((a, b) => a.attr.localeCompare(b.attr))
  }, [draft, user, users, groups])
  const shown = onlyValues ? rows.filter((r) => r.value !== '' || r.key || r.extraKey) : rows
  const commit = (r: AttrRow) => {
    if (r.key) set(r.key, editVal as never)
    else if (r.extraKey) {
      const extra = { ...(draft.extra ?? {}) }
      if (editVal) extra[r.extraKey] = editVal
      else delete extra[r.extraKey]
      set('extra', Object.keys(extra).length ? extra : undefined)
    }
    setEdit(null)
  }
  const cancel = (r: AttrRow) => {
    if (r.extraKey && draft.extra?.[r.extraKey] === NEW_MARK) {
      const extra = { ...(draft.extra ?? {}) }
      delete extra[r.extraKey]
      set('extra', Object.keys(extra).length ? extra : undefined)
    }
    setEdit(null)
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Checkbox label="Nur Attribute mit Werten anzeigen" checked={onlyValues} onChange={setOnlyValues} />
        <div className="flex items-center gap-2">
          <Input className="h-7 w-52 text-xs" placeholder="extensionAttribute1 …" value={newExt} onChange={(e) => setNewExt(e.target.value.replace(/\s/g, ''))} />
          <Button
            size="sm"
            disabled={!/^extensionAttribute([1-9]|1[0-5])$/.test(newExt) || !!draft.extra?.[newExt]}
            onClick={() => {
              setEdit(newExt)
              setEditVal('')
              set('extra', { ...(draft.extra ?? {}), [newExt]: NEW_MARK })
              setNewExt('')
            }}
          >
            Attribut setzen
          </Button>
        </div>
      </div>
      <div className="max-h-[22rem] overflow-auto rounded-md border border-slate-200">
        <table className={cx(tableCls, 'text-xs')}>
          <thead>
            <tr>
              <th className="w-56">Attribut</th>
              <th>Wert</th>
              <th className="w-24" />
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const editable = !!(r.key || r.extraKey)
              const isEdit = edit === r.attr
              return (
                <tr key={r.attr} className={cx(!editable && 'text-slate-500')}>
                  <td className="font-mono">{r.attr}</td>
                  <td className="font-mono break-all">
                    {isEdit ? (
                      <Input
                        autoFocus
                        className="h-7 text-xs"
                        value={editVal}
                        onChange={(e) => setEditVal(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commit(r)
                          if (e.key === 'Escape') {
                            e.stopPropagation()
                            cancel(r)
                          }
                        }}
                      />
                    ) : (
                      r.value || <span className="text-slate-400">&lt;nicht festgelegt&gt;</span>
                    )}
                  </td>
                  <td className="text-right">
                    {editable &&
                      (isEdit ? (
                        <span className="flex justify-end gap-1">
                          <Button size="sm" variant="primary" onClick={() => commit(r)}>
                            OK
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => cancel(r)}>
                            ✕
                          </Button>
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEdit(r.attr)
                            setEditVal(r.value === NEW_MARK ? '' : r.value)
                          }}
                        >
                          Bearbeiten
                        </Button>
                      ))}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">Grau dargestellte Attribute sind systemverwaltet bzw. werden auf anderen Registerkarten gepflegt. Änderungen werden mit „Übernehmen“/„OK“ gespeichert.</p>
    </div>
  )
}

// ─────────────── Cloud ───────────────

function CloudTab({ user }: { user: AdUser }) {
  const cloudUsers = useStore((s) => s.world.cloud.users)
  const skus = useStore((s) => s.world.cloud.skus)
  const sync = useStore((s) => s.world.infra.sync)
  const navigate = useStore((s) => s.navigate)
  const actions = useAdActions()
  const cu = useMemo(() => cloudUsers.find((c) => c.sam === user.sam), [cloudUsers, user.sam])
  const synced = user.ou.includes('OU=Musterwerk') && !user.isServiceAccount && !!user.mail
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Cloud size={18} className="text-sky-600" />
        <span className="text-sm text-slate-700">Hybrid-Identität im Cloud-Mandanten (nur lesend – Änderungen im Cloud Admin Center).</span>
      </div>
      {!cu ? (
        <Warn>
          <span>
            Für dieses Konto existiert (noch) kein Cloud-Objekt.{' '}
            {synced ? 'Es erscheint nach der nächsten Synchronisierung (Infrastruktur → Cloud-Sync).' : 'Das Konto liegt außerhalb des synchronisierten Bereichs (OU=Musterwerk) oder hat keine E-Mail-Adresse.'} Letzte Synchronisierung: {fmtDateTime(sync.lastRun)}.
          </span>
        </Warn>
      ) : (
        <KV
          rows={[
            ['Cloud-UPN', cu.upn],
            ['Quelle', cu.synced ? <Badge tone="sky">Synchronisiert aus dem lokalen AD</Badge> : <Badge>Nur Cloud</Badge>],
            ['Anmeldung blockiert', cu.signInBlocked ? <Badge tone="red">Ja</Badge> : <Badge tone="green">Nein</Badge>],
            ['Lizenzen', cu.licenses.length ? cu.licenses.map((l) => skus.find((s) => s.id === l)?.name ?? l).join(', ') : <span className="text-amber-700">keine</span>],
            ['Postfach', cu.mailbox ? `${cu.mailbox.type} (${cu.mailbox.sizeGb.toFixed(1)} von ${cu.mailbox.quotaGb} GB)` : 'kein Postfach'],
            ['MFA', `${cu.mfa.enforced ? 'erzwungen' : 'nicht erzwungen'} · ${cu.mfa.methods.length} Methode(n)${cu.mfa.requireReRegister ? ' · Neuregistrierung erforderlich' : ''}`],
            ['Risikostatus', cu.riskState],
            ['Letzte Kennwortänderung', fmtDateTime(cu.lastPasswordChange)],
            ['Letzte Synchronisierung', fmtDateTime(sync.lastRun)],
          ]}
        />
      )}
      <div className="flex flex-wrap gap-2">
        <Button icon={<ExternalLink size={14} />} onClick={() => actions.cloudAdmin(cu?.upn ?? user.upn)}>
          Im Cloud Admin Center öffnen
        </Button>
        <Button variant="ghost" onClick={() => navigate('infra', { tab: 'sync' })}>
          Zur Cloud-Synchronisierung
        </Button>
      </div>
    </div>
  )
}
