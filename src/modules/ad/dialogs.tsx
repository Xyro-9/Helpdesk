// Aktionsdialoge der AD-Konsole

import { Check, CircleCheck, Cloud, Eye, EyeOff, Info, KeyRound, Search, ShieldAlert, TriangleAlert, WandSparkles, X } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { A } from '@/core/actions'
import { copyGroupsFrom, createGroup, createUser, deleteUser, directGroupsOf, findUser, moveObject, resetComputerAccount, resetPassword, unlockUser } from '@/core/ops/ad'
import { useStore } from '@/core/store'
import type { AdGroup, GroupScope, GroupType } from '@/core/types'
import { checkPasswordPolicy, fmtDateTime } from '@/core/util'
import { Badge, Button, Checkbox, Field, Input, Modal, cx, tableCls } from '@/ui'
import { dnToPath, generatePassword, isPrivilegedGroup, isUserContainer, suggestSam } from './lib'
import { ConfirmDialog, KV, OuPickerDialog, PickerDialog, SecretValue, SectionTitle, Warn, useAdCtx, useRun, type ActionDialog } from './parts'
import { AD_GROUP_UPDATED } from './useAdActions'

// ─────────────── Kennwort-Prüfliste ───────────────

function PolicyChecklist({ pw, confirm, sam }: { pw: string; confirm?: string; sam?: string }) {
  const domain = useStore((s) => s.world.domain)
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(pw)).length
  const namePart = (sam?.split('.').pop() ?? '').toLowerCase()
  const items: [boolean, string][] = [
    [pw.length >= domain.minPasswordLength, `Mindestens ${domain.minPasswordLength} Zeichen (aktuell ${pw.length})`],
    ...(domain.complexity
      ? ([
          [classes >= 3, `3 von 4 Zeichenarten: Groß-, Kleinbuchstaben, Ziffern, Sonderzeichen (aktuell ${classes})`],
          [!namePart || !pw.toLowerCase().includes(namePart), 'Enthält keine Teile des Benutzernamens'],
        ] as [boolean, string][])
      : []),
    ...(confirm !== undefined ? ([[!!pw && pw === confirm, 'Kennwort und Bestätigung stimmen überein']] as [boolean, string][]) : []),
  ]
  return (
    <ul className="space-y-0.5 text-xs">
      {items.map(([ok, label]) => (
        <li key={label} className={cx('flex items-center gap-1.5', ok ? 'text-emerald-700' : 'text-slate-500')}>
          {ok ? <Check size={13} /> : <X size={13} />}
          {label}
        </li>
      ))}
    </ul>
  )
}

function PasswordInputs({ pw, setPw, confirm, setConfirm, show, setShow }: { pw: string; setPw: (v: string) => void; confirm: string; setConfirm: (v: string) => void; show: boolean; setShow: (v: boolean) => void }) {
  const minLen = useStore((s) => s.world.domain.minPasswordLength)
  return (
    <div className="space-y-3">
      <Field label="Neues Kennwort">
        <div className="flex gap-2">
          <Input type={show ? 'text' : 'password'} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} className="font-mono" />
          <Button title={show ? 'Kennwort verbergen' : 'Kennwort anzeigen'} onClick={() => setShow(!show)}>
            {show ? <EyeOff size={15} /> : <Eye size={15} />}
          </Button>
        </div>
      </Field>
      <Field label="Kennwort bestätigen">
        <Input type={show ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="font-mono" />
      </Field>
      <Button
        size="sm"
        icon={<WandSparkles size={13} />}
        onClick={() => {
          const p = generatePassword(Math.max(12, minLen))
          setPw(p)
          setConfirm(p)
          setShow(true)
        }}
      >
        Sicheres Kennwort generieren
      </Button>
    </div>
  )
}

// ─────────────── Kennwort zurücksetzen ───────────────

export function ResetPasswordDialog({ sam, onClose }: { sam: string; onClose: () => void }) {
  const user = useStore((s) => s.world.users.find((u) => u.sam === sam))
  const run = useRun()
  const log = useStore((s) => s.log)
  const toast = useStore((s) => s.toast)
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [mustChange, setMustChange] = useState(true)
  const [unlock, setUnlock] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!user) return null
  const submit = () => {
    if (!pw) return setError('Bitte ein Kennwort eingeben.')
    if (pw !== confirm) return setError('Die Kennwörter stimmen nicht überein. Bitte geben Sie das Kennwort erneut ein.')
    const domain = useStore.getState().world.domain
    const policy = checkPasswordPolicy(pw, domain.minPasswordLength, domain.complexity, user.sam)
    if (policy) return setError(`Das Kennwort entspricht nicht den Anforderungen der Kennwortrichtlinie. ${policy}`)
    const wasLocked = user.lockedOut
    const flags = [mustChange ? 'Änderung bei nächster Anmeldung' : 'keine Änderung erzwungen', unlock ? 'Konto entsperren' : ''].filter(Boolean).join(', ')
    const ok = run(
      (w) => {
        const err = resetPassword(w, user.sam, pw, { mustChange, unlock })
        if (err) return err
        if (unlock && wasLocked) unlockUser(w, user.sam)
        return null
      },
      { type: A.adPasswordReset, target: user.sam, detail: flags },
    )
    if (!ok) return
    if (unlock && wasLocked) log({ type: A.adUnlock, target: user.sam, detail: 'beim Zurücksetzen des Kennworts' })
    toast(`Das Kennwort für „${user.displayName}“ wurde geändert.${unlock && wasLocked ? ' Das Konto wurde entsperrt.' : ''}`, 'success')
    onClose()
  }
  return (
    <Modal
      title={
        <span className="flex items-center gap-2">
          <KeyRound size={18} className="text-sky-600" /> Kennwort zurücksetzen – {user.displayName}
        </span>
      }
      onClose={onClose}
      size="md"
      footer={
        <>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" onClick={submit}>
            OK
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Warn tone="amber">
          <ShieldAlert size={16} className="mt-0.5 shrink-0" />
          <span>
            Nur nach erfolgreicher <strong>Identitätsprüfung</strong>! Das Kennwort nur telefonisch mitteilen – niemals ins Ticket, per E-Mail oder Chat.
          </span>
        </Warn>
        <PasswordInputs pw={pw} setPw={setPw} confirm={confirm} setConfirm={setConfirm} show={show} setShow={setShow} />
        <PolicyChecklist pw={pw} confirm={confirm} sam={user.sam} />
        <div className="flex flex-col gap-2 rounded-md border border-slate-200 p-3">
          <Checkbox label="Benutzer muss das Kennwort bei der nächsten Anmeldung ändern" checked={mustChange} onChange={setMustChange} />
          <Checkbox
            label={
              <span>
                Konto entsperren <span className={cx('text-xs', user.lockedOut ? 'font-medium text-amber-700' : 'text-slate-500')}>(Kontosperrungsstatus: {user.lockedOut ? 'gesperrt' : 'nicht gesperrt'})</span>
              </span>
            }
            checked={unlock}
            onChange={setUnlock}
          />
        </div>
        {error && (
          <Warn tone="red">
            <TriangleAlert size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </Warn>
        )}
      </div>
    </Modal>
  )
}

// ─────────────── Neuer Benutzer / Benutzer kopieren ───────────────

export function NewUserWizard({ ou, template, onClose }: { ou: string; template?: string; onClose: () => void }) {
  const world = useStore((s) => s.world)
  const run = useRun()
  const log = useStore((s) => s.log)
  const navigate = useStore((s) => s.navigate)
  const { openProps } = useAdCtx()
  const tpl = template ? world.users.find((u) => u.sam === template) : undefined
  const validOu = world.ous.find((o) => o.dn === ou && isUserContainer(o)) ? ou : `OU=Benutzer,OU=Musterwerk,${world.domain.baseDn}`
  const [step, setStep] = useState(0)
  const [given, setGiven] = useState('')
  const [sur, setSur] = useState('')
  const [samManual, setSamManual] = useState<string | null>(null)
  const [targetOu, setTargetOu] = useState(tpl?.ou ?? validOu)
  const [pickOu, setPickOu] = useState(false)
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [mustChange, setMustChange] = useState(true)
  const [cannotChange, setCannotChange] = useState(false)
  const [neverExpires, setNeverExpires] = useState(false)
  const [disabled, setDisabled] = useState(false)
  const [dept, setDept] = useState(tpl?.department ?? '')
  const [title, setTitle] = useState(tpl?.title ?? '')
  const [office, setOffice] = useState(tpl?.office ?? '')
  const [phone, setPhone] = useState('')
  const [manager, setManager] = useState(tpl?.manager ?? '')
  const [pickMgr, setPickMgr] = useState(false)
  const [employeeId, setEmployeeId] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [description, setDescription] = useState(tpl?.description && !/arbeitsplatz/i.test(tpl.description) ? tpl.description : '')
  const [homeOffice, setHomeOffice] = useState(false)
  const [street, setStreet] = useState('')
  const [plz, setPlz] = useState('')
  const [city, setCity] = useState('')
  const [created, setCreated] = useState<{ sam: string; groups: string[] } | null>(null)

  const sam = samManual ?? suggestSam(given, sur)
  const samErr = !sam
    ? 'Bitte einen Anmeldenamen angeben.'
    : !/^[a-z0-9._-]{2,20}$/.test(sam)
      ? 'Nur a–z, 0–9, Punkt, Bindestrich, Unterstrich; 2–20 Zeichen, Kleinbuchstaben.'
      : world.users.some((u) => u.sam.toLowerCase() === sam)
        ? `Ein Objekt mit dem Anmeldenamen „${sam}“ ist bereits vorhanden.`
        : null
  const policyErr = checkPasswordPolicy(pw, world.domain.minPasswordLength, world.domain.complexity, sam)
  const tplGroups = useMemo(() => (tpl ? directGroupsOf(world, tpl.sam).filter((g) => g !== 'Domänen-Benutzer') : []), [world, tpl])
  const privileged = tplGroups.filter(isPrivilegedGroup)
  const departments = useMemo(() => Array.from(new Set(world.users.map((u) => u.department).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'de')), [world.users])
  const mgrUser = manager ? world.users.find((u) => u.sam === manager) : undefined

  const steps = ['Name', 'Kennwort', 'Organisation', 'Zusammenfassung']
  const canNext = step === 0 ? !!(given.trim() || sur.trim()) && !samErr : step === 1 ? !policyErr && pw === confirm : step === 2 ? !birthDate || /^\d{4}-\d{2}-\d{2}$/.test(birthDate) : true

  const finish = () => {
    const box: { groups: string[] } = { groups: [] }
    const entry = { type: A.adUserCreated, target: sam, detail: tpl ? `Kopie von ${tpl.sam} → ${dnToPath(targetOu)}` : dnToPath(targetOu) }
    const ok = run((w) => {
      const err = createUser(w, {
        givenName: given.trim(),
        surname: sur.trim(),
        sam,
        password: pw,
        ou: targetOu,
        mustChangePassword: mustChange,
        enabled: !disabled,
        department: dept.trim() || undefined,
        title: title.trim() || undefined,
        office: office.trim() || undefined,
        phone: phone.trim() || undefined,
        manager: manager || undefined,
        employeeId: employeeId.trim() || undefined,
        birthDate: birthDate || undefined,
        description: description.trim() || undefined,
        homeOffice,
        homeAddress: street || plz || city ? { street: street.trim(), postalCode: plz.trim(), city: city.trim() } : undefined,
      })
      if (err) return err
      const u = findUser(w, sam)
      if (u) {
        u.cannotChangePassword = cannotChange
        u.passwordNeverExpires = neverExpires
        if (tpl) u.company = tpl.company
      }
      if (tpl) box.groups = copyGroupsFrom(w, tpl.sam, sam)
      return null
    }, entry)
    if (!ok) return
    for (const g of box.groups) log({ type: A.adGroupAdd, target: sam, detail: g })
    setCreated({ sam, groups: box.groups })
  }

  if (created)
    return (
      <Modal
        title="Benutzer erstellt"
        onClose={onClose}
        size="md"
        footer={
          <>
            <Button
              onClick={() => {
                onClose()
                navigate('infra', { tab: 'sync' })
              }}
              icon={<Cloud size={14} />}
            >
              Zur Cloud-Synchronisierung
            </Button>
            <Button
              onClick={() => {
                onClose()
                openProps({ kind: 'user', id: created.sam })
              }}
            >
              Eigenschaften öffnen
            </Button>
            <Button variant="primary" onClick={onClose}>
              Fertig
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2 text-emerald-700">
            <CircleCheck size={20} /> Das Benutzerkonto <strong>{created.sam}</strong> wurde in {dnToPath(targetOu)} erstellt.
          </div>
          {!!created.groups.length && <p>Gruppen der Vorlage übernommen: {created.groups.join(', ')}</p>}
          <Warn tone="sky">
            <Cloud size={16} className="mt-0.5 shrink-0" />
            <span>
              Das Cloud-Konto (E-Mail, Lizenzen) erscheint erst nach der nächsten Synchronisierung (<strong>Infrastruktur → Cloud-Sync</strong>, Intervall {world.infra.sync.intervalMin} Min.). Danach im Cloud Admin Center eine Lizenz zuweisen.
            </span>
          </Warn>
        </div>
      </Modal>
    )

  return (
    <Modal
      title={tpl ? `Objekt kopieren – Benutzer (Vorlage: ${tpl.displayName})` : 'Neues Objekt – Benutzer'}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <span className="mr-auto self-center text-xs text-slate-500">Erstellen in: {dnToPath(targetOu)}</span>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button disabled={step === 0} onClick={() => setStep(step - 1)}>
            &lt; Zurück
          </Button>
          {step < steps.length - 1 ? (
            <Button variant="primary" disabled={!canNext} onClick={() => setStep(step + 1)}>
              Weiter &gt;
            </Button>
          ) : (
            <Button variant="primary" onClick={finish}>
              Fertig stellen
            </Button>
          )}
        </>
      }
    >
      <ol className="mb-4 flex flex-wrap gap-2 text-xs">
        {steps.map((s, i) => (
          <li key={s} className={cx('rounded-full px-2.5 py-1', i === step ? 'bg-sky-600 text-white' : i < step ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 text-slate-500')}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>
      {step === 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Vorname">
            <Input autoFocus value={given} onChange={(e) => setGiven(e.target.value)} />
          </Field>
          <Field label="Nachname">
            <Input value={sur} onChange={(e) => setSur(e.target.value)} />
          </Field>
          <Field label="Vollständiger Name" className="md:col-span-2">
            <Input value={`${given} ${sur}`.trim()} disabled />
          </Field>
          <Field label="Benutzeranmeldename (Prä-Windows 2000)" hint={samManual === null ? 'Vorschlag: erster Buchstabe des Vornamens + Punkt + Nachname (Umlaute ersetzt)' : undefined}>
            <div className="flex gap-2">
              <Input value={sam} onChange={(e) => setSamManual(e.target.value.toLowerCase())} className="font-mono" />
              {samManual !== null && (
                <Button size="sm" variant="ghost" onClick={() => setSamManual(null)}>
                  Vorschlag
                </Button>
              )}
            </div>
          </Field>
          <Field label="Benutzeranmeldename (UPN)">
            <Input value={sam ? `${sam}@${world.domain.upnSuffix}` : ''} disabled className="font-mono" />
          </Field>
          {(given || sur) && samErr && <p className="text-sm text-rose-700 md:col-span-2">{samErr}</p>}
          <Field label="Organisationseinheit" className="md:col-span-2">
            <div className="flex gap-2">
              <Input value={dnToPath(targetOu)} disabled />
              <Button onClick={() => setPickOu(true)}>Ändern…</Button>
            </div>
          </Field>
          {tpl && (
            <div className="md:col-span-2">
              <SectionTitle>Werden von der Vorlage übernommen</SectionTitle>
              <p className="text-sm text-slate-600">Abteilung, Position, Büro, Firma, Vorgesetzter und Gruppenmitgliedschaften: {tplGroups.length ? tplGroups.join(', ') : '(keine)'}</p>
              {!!privileged.length && (
                <div className="mt-2">
                  <Warn tone="red">
                    <ShieldAlert size={16} className="mt-0.5 shrink-0" />
                    <span>
                      Die Vorlage ist Mitglied privilegierter Gruppen ({privileged.join(', ')}). <strong>Nur mit Freigabe der IT-Leitung!</strong> Gegebenenfalls nach dem Kopieren entfernen.
                    </span>
                  </Warn>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {step === 1 && (
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-3">
            <PasswordInputs pw={pw} setPw={setPw} confirm={confirm} setConfirm={setConfirm} show={show} setShow={setShow} />
            <PolicyChecklist pw={pw} confirm={confirm} sam={sam} />
          </div>
          <div className="flex flex-col gap-2 rounded-md border border-slate-200 p-3">
            <Checkbox
              label="Benutzer muss Kennwort bei der nächsten Anmeldung ändern"
              checked={mustChange}
              onChange={(v) => {
                setMustChange(v)
                if (v) setNeverExpires(false)
              }}
            />
            <Checkbox label="Benutzer kann Kennwort nicht ändern" checked={cannotChange} onChange={setCannotChange} />
            <Checkbox
              label="Kennwort läuft nie ab"
              checked={neverExpires}
              onChange={(v) => {
                setNeverExpires(v)
                if (v) setMustChange(false)
              }}
            />
            <Checkbox label="Konto ist deaktiviert" checked={disabled} onChange={setDisabled} />
            <p className="mt-2 text-xs text-slate-500">Für neue Mitarbeiter: Startkennwort + „bei nächster Anmeldung ändern“. Kennwort nur persönlich/telefonisch übergeben.</p>
          </div>
        </div>
      )}
      {step === 2 && (
        <div className="space-y-4">
          <p className="text-sm text-slate-500">Optionale Angaben – können später in den Eigenschaften ergänzt werden.</p>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Abteilung">
              <Input list="ad-new-departments" value={dept} onChange={(e) => setDept(e.target.value)} />
              <datalist id="ad-new-departments">
                {departments.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
            </Field>
            <Field label="Position">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label="Büro">
              <Input value={office} onChange={(e) => setOffice(e.target.value)} />
            </Field>
            <Field label="Rufnummer">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+49 40 5550-…" />
            </Field>
            <Field label="Vorgesetzter" className="md:col-span-2">
              <div className="flex gap-2">
                <Input value={mgrUser ? `${mgrUser.displayName} (${mgrUser.sam})` : manager} disabled />
                <Button onClick={() => setPickMgr(true)}>Auswählen…</Button>
                {manager && (
                  <Button variant="ghost" onClick={() => setManager('')}>
                    Löschen
                  </Button>
                )}
              </div>
            </Field>
            <Field label="Beschreibung" className="md:col-span-3">
              <Input value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
          </div>
          <div className="grid gap-4 rounded-md border-2 border-dashed border-rose-200 p-3 md:grid-cols-2">
            <div className="md:col-span-2 flex items-center gap-2 text-xs font-semibold text-rose-700">
              <ShieldAlert size={14} /> Vertraulich – für die Identitätsprüfung
            </div>
            <Field label="Personalnummer">
              <Input value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} />
            </Field>
            <Field label="Geburtsdatum">
              <Input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
            </Field>
          </div>
          <div className="space-y-3 rounded-md border border-slate-200 p-3">
            <Checkbox label="Homeoffice-Arbeitsplatz (Adresse für Geräteversand)" checked={homeOffice} onChange={setHomeOffice} />
            <div className="grid gap-3 md:grid-cols-[2fr_8rem_1fr]">
              <Field label="Straße und Hausnummer">
                <Input value={street} onChange={(e) => setStreet(e.target.value)} />
              </Field>
              <Field label="PLZ">
                <Input value={plz} onChange={(e) => setPlz(e.target.value)} />
              </Field>
              <Field label="Ort">
                <Input value={city} onChange={(e) => setCity(e.target.value)} />
              </Field>
            </div>
          </div>
        </div>
      )}
      {step === 3 && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Wenn Sie auf „Fertig stellen“ klicken, wird folgendes Objekt erstellt:</p>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <KV
              rows={[
                ['Vollständiger Name', `${given} ${sur}`.trim()],
                ['Anmeldename', `${world.domain.netbios}\\${sam}`],
                ['UPN', `${sam}@${world.domain.upnSuffix}`],
                ['Container', dnToPath(targetOu)],
                ['Kennwortoptionen', [mustChange && 'Ändern bei nächster Anmeldung', cannotChange && 'Kann nicht ändern', neverExpires && 'Läuft nie ab', disabled && 'Konto deaktiviert'].filter(Boolean).join(', ') || '–'],
                ['Abteilung / Position', [dept, title].filter(Boolean).join(' / ')],
                ['Vorgesetzter', mgrUser?.displayName ?? ''],
                ['Personalnummer', employeeId ? '(erfasst)' : ''],
                ['Homeoffice', homeOffice ? `Ja${city ? ` – ${city}` : ''}` : 'Nein'],
                ...(tpl ? ([['Gruppen (Vorlage)', tplGroups.join(', ') || '–']] as [ReactNode, ReactNode][]) : []),
              ]}
            />
          </div>
          <Warn tone="sky">
            <Info size={16} className="mt-0.5 shrink-0" />
            <span>Das Cloud-Konto erscheint nach der nächsten Synchronisierung (Infrastruktur → Cloud-Sync).</span>
          </Warn>
        </div>
      )}
      {pickOu && <OuPickerDialog title="Container auswählen" initial={targetOu} filter={(dn) => !!world.ous.find((o) => o.dn === dn && isUserContainer(o))} onPick={setTargetOu} onClose={() => setPickOu(false)} />}
      {pickMgr && <PickerDialog title="Vorgesetzten auswählen" kinds={['user']} onPick={(e) => setManager(e.id)} onClose={() => setPickMgr(false)} />}
    </Modal>
  )
}

// ─────────────── Neue Gruppe ───────────────

export function NewGroupDialog({ ou, onClose }: { ou: string; onClose: () => void }) {
  const world = useStore((s) => s.world)
  const run = useRun()
  const { openProps } = useAdCtx()
  const validOu = world.ous.find((o) => o.dn === ou && o.kind !== 'domain') ? ou : `OU=Gruppen,OU=Musterwerk,${world.domain.baseDn}`
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [scope, setScope] = useState<GroupScope>('Global')
  const [type, setType] = useState<GroupType>('Sicherheit')
  const [mail, setMail] = useState('')
  const [targetOu, setTargetOu] = useState(validOu)
  const [pickOu, setPickOu] = useState(false)
  const nameErr = !name.trim() ? null : /[\\/[\]:;|=,+*?<>"]/.test(name) ? 'Der Name enthält ungültige Zeichen.' : world.groups.some((g) => g.name.toLowerCase() === name.trim().toLowerCase()) ? 'Eine Gruppe mit diesem Namen existiert bereits.' : null
  const submit = () => {
    const n = name.trim()
    const g: Omit<AdGroup, 'members'> = { name: n, description: description.trim(), scope, type, ou: targetOu, ...(mail.trim() ? { mail: mail.trim() } : {}) }
    if (run((w) => createGroup(w, g), { type: A.adGroupCreated, target: n, detail: `${type} / ${scope} – ${dnToPath(targetOu)}` }, `Die Gruppe „${n}“ wurde erstellt.`)) {
      onClose()
      openProps({ kind: 'group', id: n, tab: 'mitglieder' })
    }
  }
  return (
    <Modal
      title="Neues Objekt – Gruppe"
      onClose={onClose}
      size="md"
      footer={
        <>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" disabled={!name.trim() || !!nameErr} onClick={submit}>
            OK
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Erstellen in">
          <div className="flex gap-2">
            <Input value={dnToPath(targetOu)} disabled />
            <Button onClick={() => setPickOu(true)}>Ändern…</Button>
          </div>
        </Field>
        <Field label="Gruppenname" hint="Namenskonvention: GG_ = globale Gruppe (Personen), FS_ = Berechtigung Dateiserver (lokal), DL_ = Verteiler">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        {nameErr && <p className="text-sm text-rose-700">{nameErr}</p>}
        <Field label="Beschreibung">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <fieldset className="rounded-md border border-slate-200 p-3 text-sm">
            <legend className="px-1 text-xs font-medium text-slate-600">Gruppenbereich</legend>
            {(['Lokal (Domäne)', 'Global', 'Universal'] as GroupScope[]).map((s) => (
              <label key={s} className="flex items-center gap-2 py-0.5">
                <input type="radio" className="accent-sky-600" checked={scope === s} onChange={() => setScope(s)} />
                {s}
              </label>
            ))}
          </fieldset>
          <fieldset className="rounded-md border border-slate-200 p-3 text-sm">
            <legend className="px-1 text-xs font-medium text-slate-600">Gruppentyp</legend>
            {(['Sicherheit', 'Verteilung'] as GroupType[]).map((t) => (
              <label key={t} className="flex items-center gap-2 py-0.5">
                <input type="radio" className="accent-sky-600" checked={type === t} onChange={() => setType(t)} />
                {t === 'Sicherheit' ? 'Sicherheitsgruppe' : 'Verteilergruppe'}
              </label>
            ))}
          </fieldset>
        </div>
        <Field label="E-Mail (optional)">
          <Input value={mail} onChange={(e) => setMail(e.target.value)} placeholder="verteiler@musterwerk.example" />
        </Field>
      </div>
      {pickOu && <OuPickerDialog title="Container auswählen" initial={targetOu} filter={(dn) => !!world.ous.find((o) => o.dn === dn && o.kind !== 'domain')} onPick={setTargetOu} onClose={() => setPickOu(false)} />}
    </Modal>
  )
}

// ─────────────── Verschieben ───────────────

export function MoveDialog({ kind, id, onClose }: { kind: 'user' | 'computer' | 'group'; id: string; onClose: () => void }) {
  const world = useStore((s) => s.world)
  const run = useRun()
  const current = kind === 'user' ? world.users.find((u) => u.sam === id)?.ou : kind === 'computer' ? world.computers.find((c) => c.name === id)?.ou : world.groups.find((g) => g.name === id)?.ou
  const label = kind === 'user' ? (world.users.find((u) => u.sam === id)?.displayName ?? id) : id
  const move = (dn: string) => {
    if (dn === current) return
    const path = dnToPath(dn)
    const entry =
      kind === 'user'
        ? { type: A.adUserMoved, target: id, detail: dn }
        : kind === 'computer'
          ? { type: A.adComputerUpdated, target: id, detail: `Verschoben nach ${dn}` }
          : { type: AD_GROUP_UPDATED, target: id, detail: `Verschoben nach ${dn}` }
    run((w) => moveObject(w, kind, id, dn), entry, `„${label}“ wurde nach ${path} verschoben.`)
  }
  return <OuPickerDialog title={`Verschieben – ${label}`} initial={current} okLabel="Verschieben" filter={(dn) => !!world.ous.find((o) => o.dn === dn && o.kind !== 'domain')} onPick={move} onClose={onClose} />
}

// ─────────────── Löschen ───────────────

export function DeleteUserDialog({ sam, onClose, onDeleted }: { sam: string; onClose: () => void; onDeleted: () => void }) {
  const user = useStore((s) => s.world.users.find((u) => u.sam === sam))
  const techSam = useStore((s) => s.world.tech.sam)
  const run = useRun()
  if (!user) return null
  if (user.sam === techSam)
    return (
      <Modal title="Löschen nicht möglich" onClose={onClose} size="sm" footer={<Button onClick={onClose}>OK</Button>}>
        <p className="text-sm text-slate-700">Sie können Ihr eigenes Benutzerkonto nicht löschen.</p>
      </Modal>
    )
  return (
    <ConfirmDialog
      title="Active Directory – Löschen bestätigen"
      danger
      confirmLabel="Ja, löschen"
      onClose={onClose}
      onConfirm={() => {
        if (run((w) => deleteUser(w, user.sam), { type: A.adUserDeleted, target: user.sam, detail: user.displayName }, `Das Objekt „${user.displayName}“ wurde gelöscht.`)) onDeleted()
      }}
    >
      <p>
        Möchten Sie den Benutzer <strong>{user.displayName}</strong> ({user.sam}) wirklich löschen?
      </p>
      <Warn tone="red">
        <TriangleAlert size={16} className="mt-0.5 shrink-0" />
        <span>Gelöschte Konten verlieren SID, Gruppenmitgliedschaften und Postfachverknüpfung. Beim Offboarding wird ein Konto üblicherweise zuerst <strong>deaktiviert</strong> und in die OU „Deaktiviert“ verschoben (Aufbewahrung 90 Tage).</span>
      </Warn>
    </ConfirmDialog>
  )
}

export function ComputerResetDialog({ name, onClose }: { name: string; onClose: () => void }) {
  const run = useRun()
  return (
    <ConfirmDialog
      title="Computerkonto zurücksetzen"
      danger
      confirmLabel="Konto zurücksetzen"
      onClose={onClose}
      onConfirm={() => run((w) => resetComputerAccount(w, name), { type: A.adComputerReset, target: name }, `Das Computerkonto „${name}“ wurde zurückgesetzt.`)}
    >
      <Warn tone="amber">
        <TriangleAlert size={16} className="mt-0.5 shrink-0" />
        <span>
          Durch das Zurücksetzen des Kontos wird die Verbindung des Computers <strong>{name}</strong> zur Domäne unterbrochen (Vertrauensstellung). Der Computer muss anschließend neu in die Domäne aufgenommen bzw. die Vertrauensstellung repariert werden
          (z. B. <code>Test-ComputerSecureChannel -Repair</code>).
        </span>
      </Warn>
      <p>Möchten Sie das Computerkonto wirklich zurücksetzen?</p>
    </ConfirmDialog>
  )
}

// ─────────────── BitLocker-Schlüssel suchen ───────────────

export function BitlockerSearchDialog({ onClose }: { onClose: () => void }) {
  const computers = useStore((s) => s.world.computers)
  const log = useStore((s) => s.log)
  const { openProps } = useAdCtx()
  const [q, setQ] = useState('')
  const [searched, setSearched] = useState<string | null>(null)
  const [revealed, setRevealed] = useState<Record<string, boolean>>({})
  const id = q.trim().toUpperCase().replace(/^\{/, '').slice(0, 8)
  const valid = /^[0-9A-F]{8}$/.test(id)
  const results = useMemo(() => {
    if (!searched) return []
    const out: { computer: string; keyId: string; recovery: string; created: string }[] = []
    for (const c of computers) for (const k of c.bitlockerKeys) if (k.keyId.toUpperCase().startsWith(searched)) out.push({ computer: c.name, keyId: k.keyId, recovery: k.recoveryPassword, created: k.created })
    return out
  }, [computers, searched])
  return (
    <Modal title="BitLocker-Wiederherstellungskennwort suchen" onClose={onClose} size="lg" footer={<Button onClick={onClose}>Schließen</Button>}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">Geben Sie die ersten 8 Zeichen der Kennwort-ID ein, die auf dem BitLocker-Wiederherstellungsbildschirm des Benutzers angezeigt wird.</p>
        <div className="flex gap-2">
          <Input autoFocus className="font-mono uppercase" placeholder="z. B. 1A2B3C4D" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && valid && setSearched(id)} />
          <Button variant="primary" icon={<Search size={14} />} disabled={!valid} onClick={() => setSearched(id)}>
            Suchen
          </Button>
        </div>
        {q && !valid && <p className="text-xs text-slate-500">Die Kennwort-ID besteht aus Hexadezimalzeichen (0–9, A–F); es werden genau die ersten 8 Zeichen benötigt.</p>}
        {searched && (
          <div className="rounded-md border border-slate-200">
            <table className={tableCls}>
              <thead>
                <tr>
                  <th>Computer</th>
                  <th>Kennwort-ID</th>
                  <th>Erstellt</th>
                  <th>Wiederherstellungskennwort</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.computer + r.keyId}>
                    <td>
                      <button
                        type="button"
                        className="text-sky-700 hover:underline"
                        onClick={() => {
                          onClose()
                          openProps({ kind: 'computer', id: r.computer })
                        }}
                      >
                        {r.computer}
                      </button>
                    </td>
                    <td className="font-mono">{r.keyId}</td>
                    <td className="text-xs">{fmtDateTime(r.created)}</td>
                    <td>
                      <SecretValue
                        value={r.recovery}
                        revealed={!!revealed[r.computer + r.keyId]}
                        onReveal={() => {
                          setRevealed((x) => ({ ...x, [r.computer + r.keyId]: true }))
                          log({ type: A.adBitlockerViewed, target: r.computer, detail: `Kennwort-ID ${r.keyId}` })
                        }}
                      />
                    </td>
                  </tr>
                ))}
                {!results.length && (
                  <tr>
                    <td colSpan={4} className="py-5 text-center text-slate-500">
                      Es wurde kein BitLocker-Wiederherstellungskennwort mit der Kennwort-ID „{searched}“ gefunden.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <Warn tone="amber">
          <ShieldAlert size={16} className="mt-0.5 shrink-0" />
          <span>Vor dem Anzeigen: Identität des Anrufers prüfen und Gerät dem Benutzer zuordnen. Den Schlüssel nur telefonisch durchgeben – nicht ins Ticket, nicht per Mail/Chat.</span>
        </Warn>
      </div>
    </Modal>
  )
}

// ─────────────── Domäneninformationen ───────────────

export function DomainInfoDialog({ onClose }: { onClose: () => void }) {
  const domain = useStore((s) => s.world.domain)
  const users = useStore((s) => s.world.users)
  const groups = useStore((s) => s.world.groups)
  const computers = useStore((s) => s.world.computers)
  const servers = useStore((s) => s.world.infra.servers)
  const dcs = servers.filter((s) => s.roles.includes('AD DS'))
  return (
    <Modal title={`Domäne ${domain.dnsName}`} onClose={onClose} size="md" footer={<Button onClick={onClose}>Schließen</Button>}>
      <div className="space-y-5">
        <div>
          <SectionTitle>Allgemein</SectionTitle>
          <KV
            rows={[
              ['Domänenname (DNS)', domain.dnsName],
              ['Domänenname (NetBIOS)', domain.netbios],
              ['UPN-Suffix', domain.upnSuffix],
              ['Basis-DN', <span className="font-mono text-xs">{domain.baseDn}</span>],
              [
                'Domänencontroller',
                <span className="flex flex-wrap gap-1">
                  {dcs.map((d) => (
                    <Badge key={d.name} tone={d.online ? 'green' : 'red'}>
                      {d.name} ({d.ip})
                    </Badge>
                  ))}
                </span>,
              ],
              ['Objekte', `${users.length} Benutzer · ${groups.length} Gruppen · ${computers.length} Computer`],
            ]}
          />
        </div>
        <div>
          <SectionTitle>Kennwortrichtlinie (Default Domain Policy)</SectionTitle>
          <KV
            rows={[
              ['Minimale Kennwortlänge', `${domain.minPasswordLength} Zeichen`],
              ['Komplexitätsanforderungen', domain.complexity ? <Badge tone="green">Aktiviert</Badge> : <Badge>Deaktiviert</Badge>],
              ['', domain.complexity ? '3 von 4 Zeichenarten, keine Teile des Benutzernamens' : ''],
              ['Maximales Kennwortalter', `${domain.maxPasswordAgeDays} Tage`],
            ]}
          />
        </div>
        <div>
          <SectionTitle>Kontosperrungsrichtlinie</SectionTitle>
          <KV
            rows={[
              ['Kontosperrungsschwelle', `${domain.lockoutThreshold} ungültige Anmeldeversuche`],
              ['Kontosperrdauer', `${domain.lockoutDurationMin} Minuten`],
              ['Zurücksetzen des Zählers nach', `${domain.lockoutDurationMin} Minuten`],
            ]}
          />
        </div>
      </div>
    </Modal>
  )
}

/** Rendert den passenden Aktionsdialog */
export function ActionDialogHost({ dialog, onClose, onUserDeleted }: { dialog: ActionDialog | null; onClose: () => void; onUserDeleted: (sam: string) => void }) {
  if (!dialog) return null
  switch (dialog.t) {
    case 'reset':
      return <ResetPasswordDialog sam={dialog.sam} onClose={onClose} />
    case 'newUser':
      return <NewUserWizard ou={dialog.ou} template={dialog.template} onClose={onClose} />
    case 'newGroup':
      return <NewGroupDialog ou={dialog.ou} onClose={onClose} />
    case 'move':
      return <MoveDialog kind={dialog.kind} id={dialog.id} onClose={onClose} />
    case 'deleteUser':
      return <DeleteUserDialog sam={dialog.sam} onClose={onClose} onDeleted={() => onUserDeleted(dialog.sam)} />
    case 'computerReset':
      return <ComputerResetDialog name={dialog.name} onClose={onClose} />
    case 'bitlocker':
      return <BitlockerSearchDialog onClose={onClose} />
    case 'domain':
      return <DomainInfoDialog onClose={onClose} />
  }
}
