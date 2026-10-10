// Kennwort-Self-Service (konto.musterwerk.example): Kennwort ändern und "Kennwort vergessen" per MFA.

import { ArrowLeft, KeyRound, LifeBuoy, Lock, MessageSquareText, ShieldCheck, Smartphone } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { findCloudUser } from '@/core/ops/cloud'
import { findUser, resetPassword } from '@/core/ops/ad'
import { useStore } from '@/core/store'
import type { MfaMethod } from '@/core/types'
import { checkPasswordPolicy } from '@/core/util'
import { attemptAdPassword, mfaApprovable } from '../auth'
import type { SiteProps } from '../SiteView'
import { BA, Link, logEntry, NotFoundBlock, Notice, runWorld, useTitle } from '../shared'

export function KontoSite({ api }: SiteProps) {
  const p = api.segments[0] ?? ''
  const body = !p ? <Landing api={api} /> : p === 'aendern' ? <ChangePassword api={api} /> : p === 'vergessen' ? <ForgotPassword api={api} /> : <NotFoundBlock api={api} />
  return (
    <div className="flex min-h-full flex-col bg-gradient-to-b from-teal-50 to-white">
      <header className="border-b border-teal-100 bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
          <KeyRound size={20} className="text-teal-700" />
          <Link api={api} href="/" className="font-semibold text-slate-900">
            Kennwort-Portal
          </Link>
          <span className="text-xs text-slate-500">· Musterwerk AG</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{body}</main>
      <footer className="px-4 py-3 text-center text-[11px] text-slate-500">Probleme? IT-Service-Desk, Durchwahl 999</footer>
    </div>
  )
}

function PolicyBox() {
  const d = useStore((s) => s.world.domain)
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-600">
      <div className="mb-1 font-medium text-slate-700">Kennwortrichtlinie</div>
      <ul className="list-disc space-y-0.5 pl-4">
        <li>mindestens {d.minPasswordLength} Zeichen</li>
        {d.complexity && <li>3 von 4 Zeichenarten: Groß-, Kleinbuchstaben, Ziffern, Sonderzeichen</li>}
        {d.complexity && <li>darf keine Teile des Benutzernamens enthalten</li>}
        <li>gültig für {d.maxPasswordAgeDays} Tage</li>
      </ul>
    </div>
  )
}

function Landing({ api }: { api: SiteProps['api'] }) {
  useTitle(api, 'Kennwort-Portal')
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Was möchten Sie tun?</h1>
      <div className="grid gap-3 @xl:grid-cols-2">
        <Link api={api} href="/aendern" className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:border-teal-400">
          <Lock className="text-teal-700" />
          <div className="mt-2 font-semibold text-slate-900">Kennwort ändern</div>
          <p className="mt-1 text-sm text-slate-600">Sie kennen Ihr aktuelles Kennwort und möchten ein neues festlegen – z. B. wenn es abgelaufen ist.</p>
        </Link>
        <Link api={api} href="/vergessen" className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:border-teal-400">
          <LifeBuoy className="text-teal-700" />
          <div className="mt-2 font-semibold text-slate-900">Kennwort vergessen / Konto entsperren</div>
          <p className="mt-1 text-sm text-slate-600">Identität mit Ihrer registrierten Authentifizierungsmethode bestätigen und neues Kennwort setzen.</p>
        </Link>
      </div>
      <PolicyBox />
    </div>
  )
}

const inputCls = 'mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20'

function ChangePassword({ api }: { api: SiteProps['api'] }) {
  useTitle(api, 'Kennwort ändern')
  const [user, setUser] = useState('')
  const [oldPw, setOldPw] = useState('')
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)

  const submit = () => {
    setErr('')
    if (!user.trim() || !oldPw || !pw1) return setErr('Bitte alle Felder ausfüllen.')
    if (pw1 !== pw2) return setErr('Die neuen Kennwörter stimmen nicht überein.')
    if (pw1 === oldPw) return setErr('Das neue Kennwort muss sich vom bisherigen unterscheiden.')
    const res = runWorld<{ err?: string; sam?: string }>((w) => {
      const u = findUser(w, user)
      if (!u) return { err: 'Benutzername oder aktuelles Kennwort ist falsch.' }
      const sam = u.sam
      if (!u.enabled) return { err: 'Ihr Konto ist deaktiviert. Bitte wenden Sie sich an den IT-Service-Desk.' }
      const r = attemptAdPassword(w, u.sam, oldPw, api.hostname)
      if (r === 'locked' || r === 'locked-now') return { err: 'Ihr Konto ist gesperrt. Nutzen Sie „Kennwort vergessen / Konto entsperren“ oder wenden Sie sich an den IT-Service-Desk.' }
      if (r !== 'ok') return { err: 'Benutzername oder aktuelles Kennwort ist falsch.' }
      if (u.cannotChangePassword) return { err: 'Für Ihr Konto ist die Kennwortänderung nicht erlaubt.' }
      const policy = checkPasswordPolicy(pw1, w.domain.minPasswordLength, w.domain.complexity, u.sam)
      if (policy) return { err: policy }
      const e = resetPassword(w, u.sam, pw1, { mustChange: false })
      return e ? { err: e } : { sam }
    })
    setOldPw('')
    if (res.err) return setErr(res.err)
    logEntry({ type: BA.ssprReset, target: res.sam, detail: 'Kennwort geändert (Self-Service)' })
    setPw1('')
    setPw2('')
    setDone(true)
  }

  if (done)
    return (
      <div className="space-y-3">
        <Notice tone="success" title="Kennwort geändert">
          Ihr Kennwort wurde erfolgreich geändert. Melden Sie sich an Windows und allen Anwendungen mit dem neuen Kennwort an. Auf Mobilgeräten muss das Kennwort ebenfalls aktualisiert werden.
        </Notice>
        <Link api={api} href="/" className="inline-flex items-center gap-1 text-sm text-teal-700 hover:underline">
          <ArrowLeft size={15} /> Zurück
        </Link>
      </div>
    )

  return (
    <div className="grid gap-4 @3xl:grid-cols-[1fr_15rem]">
      <form
        className="space-y-3 rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <h1 className="text-lg font-semibold text-slate-900">Kennwort ändern</h1>
        <label className="block text-xs font-medium text-slate-600">
          Benutzername oder E-Mail-Adresse
          <input value={user} onChange={(e) => setUser(e.target.value)} autoComplete="off" className={inputCls} placeholder="m.becker@musterwerk.example" />
        </label>
        <label className="block text-xs font-medium text-slate-600">
          Aktuelles Kennwort
          <input type="password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} className={inputCls} />
        </label>
        <label className="block text-xs font-medium text-slate-600">
          Neues Kennwort
          <input type="password" value={pw1} onChange={(e) => setPw1(e.target.value)} className={inputCls} />
        </label>
        <label className="block text-xs font-medium text-slate-600">
          Neues Kennwort bestätigen
          <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} className={inputCls} />
        </label>
        {err && <Notice tone="error">{err}</Notice>}
        <button type="submit" className="h-9 rounded-md bg-teal-700 px-4 text-sm font-medium text-white hover:bg-teal-800">
          Kennwort ändern
        </button>
      </form>
      <PolicyBox />
    </div>
  )
}

type Step = 'id' | 'method' | 'verify' | 'newpw' | 'done'

function ForgotPassword({ api }: { api: SiteProps['api'] }) {
  useTitle(api, 'Kennwort zurücksetzen')
  const world = useStore((s) => s.world)
  const [step, setStep] = useState<Step>('id')
  const [id, setId] = useState('')
  const [robot, setRobot] = useState(false)
  const [upn, setUpn] = useState('')
  const [method, setMethod] = useState<MfaMethod | null>(null)
  const [sentCode, setSentCode] = useState('')
  const [code, setCode] = useState('')
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [err, setErr] = useState<ReactNode>('')
  const cu = upn ? findCloudUser(world, upn) : undefined
  const helpdesk = world.company.helpdeskPhone

  const checkId = () => {
    setErr('')
    if (!robot) return setErr('Bitte bestätigen Sie, dass Sie kein Roboter sind.')
    const c = findCloudUser(world, id)
    const ad = c?.sam ? findUser(world, c.sam) : undefined
    if (!c || !c.sam || !ad) return setErr('Für diese Benutzer-ID ist der Self-Service nicht verfügbar. Prüfen Sie die Schreibweise (vorname.nachname@musterwerk.example bzw. Kurzname).')
    if (!ad.enabled || c.signInBlocked) return setErr(`Ihr Konto ist deaktiviert bzw. gesperrt. Bitte wenden Sie sich an den IT-Service-Desk (${helpdesk}).`)
    if (!c.mfa.methods.length)
      return setErr(
        <>
          Für Ihr Konto sind keine Authentifizierungsmethoden hinterlegt, daher ist ein Zurücksetzen per Self-Service nicht möglich.
          <br />
          <strong>Bitte wenden Sie sich an den IT-Service-Desk ({helpdesk}).</strong>
        </>,
      )
    setUpn(c.upn)
    setMethod(c.mfa.methods.find((m) => m.isDefault) ?? c.mfa.methods[0])
    setStep('method')
  }

  const send = () => {
    if (!cu || !method) return
    setErr('')
    setCode('')
    if (method.type === 'Authenticator-App' || method.type === 'FIDO2-Schlüssel') {
      setSentCode('')
    } else {
      setSentCode(String(100000 + Math.floor(Math.random() * 900000)))
    }
    setStep('verify')
  }

  const verify = () => {
    if (!cu || !method) return
    const present = mfaApprovable(world, api.hostname, cu)
    if (!present) {
      setErr('Es ist keine Bestätigung eingegangen. Die Bestätigung muss auf dem registrierten Gerät des Kontoinhabers erfolgen – der Self-Service ist nur für den Kontoinhaber selbst gedacht.')
      return
    }
    if (sentCode && code.trim() !== sentCode) return setErr('Der eingegebene Code ist falsch.')
    setErr('')
    setStep('newpw')
  }

  const save = () => {
    if (!cu?.sam) return
    if (pw1 !== pw2) return setErr('Die Kennwörter stimmen nicht überein.')
    const sam = cu.sam
    const e = runWorld((w) => {
      const u = findUser(w, sam)
      if (!u) return 'Benutzer nicht gefunden.'
      if (u.password === pw1) return 'Dieses Kennwort wurde kürzlich verwendet. Bitte wählen Sie ein anderes.'
      return resetPassword(w, sam, pw1, { mustChange: false, unlock: true })
    })
    if (e) return setErr(e)
    logEntry({ type: BA.ssprReset, target: sam, detail: `Kennwort vergessen – Zurücksetzung per ${method?.type ?? 'MFA'} (Konto entsperrt)` })
    setPw1('')
    setPw2('')
    setErr('')
    setStep('done')
  }

  const card = 'space-y-3 rounded-lg border border-slate-200 bg-white p-5 shadow-sm'
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-900">Kennwort vergessen / Konto entsperren</h1>
      <ol className="flex flex-wrap gap-2 text-[11px] text-slate-500">
        {['Benutzer-ID', 'Methode', 'Bestätigung', 'Neues Kennwort'].map((s, i) => {
          const idx = ['id', 'method', 'verify', 'newpw', 'done'].indexOf(step)
          return (
            <li key={s} className={i <= idx ? 'rounded-full bg-teal-100 px-2 py-0.5 font-medium text-teal-800' : 'rounded-full bg-slate-100 px-2 py-0.5'}>
              {i + 1}. {s}
            </li>
          )
        })}
      </ol>
      {step === 'id' && (
        <form
          className={card}
          onSubmit={(e) => {
            e.preventDefault()
            checkId()
          }}
        >
          <label className="block text-xs font-medium text-slate-600">
            Benutzer-ID (E-Mail-Adresse)
            <input value={id} onChange={(e) => setId(e.target.value)} autoComplete="off" className={inputCls} placeholder="vorname.nachname@musterwerk.example" />
          </label>
          <label className="flex w-fit items-center gap-2 rounded border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <input type="checkbox" checked={robot} onChange={(e) => setRobot(e.target.checked)} className="h-4 w-4 accent-teal-700" /> Ich bin kein Roboter
          </label>
          {err && <Notice tone="error">{err}</Notice>}
          <button type="submit" className="h-9 rounded-md bg-teal-700 px-4 text-sm font-medium text-white hover:bg-teal-800">
            Weiter
          </button>
        </form>
      )}
      {step === 'method' && cu && (
        <div className={card}>
          <p className="text-sm text-slate-700">
            Konto: <strong>{cu.upn}</strong>. Wählen Sie die Methode, mit der Sie Ihre Identität bestätigen:
          </p>
          <div className="space-y-2">
            {cu.mfa.methods.map((m) => (
              <label key={m.id} className="flex cursor-pointer items-center gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50">
                <input type="radio" name="method" checked={method?.id === m.id} onChange={() => setMethod(m)} className="accent-teal-700" />
                {m.type === 'Authenticator-App' ? <Smartphone size={16} className="text-teal-700" /> : <MessageSquareText size={16} className="text-teal-700" />}
                <span>
                  <span className="block font-medium text-slate-800">{m.type === 'Authenticator-App' ? 'Benachrichtigung in der Authenticator-App' : m.type === 'SMS' ? 'Code per SMS' : m.type}</span>
                  <span className="block text-xs text-slate-500">{m.detail}</span>
                </span>
              </label>
            ))}
          </div>
          {err && <Notice tone="error">{err}</Notice>}
          <button type="button" onClick={send} className="h-9 rounded-md bg-teal-700 px-4 text-sm font-medium text-white hover:bg-teal-800">
            {method?.type === 'Authenticator-App' ? 'Benachrichtigung senden' : 'Code senden'}
          </button>
        </div>
      )}
      {step === 'verify' && cu && method && (
        <div className={card}>
          {sentCode ? (
            <>
              <p className="text-sm text-slate-700">Wir haben einen Code an {method.detail} gesendet.</p>
              {mfaApprovable(world, api.hostname, cu) && (
                <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  <Smartphone size={14} /> Simulation – SMS auf dem Telefon des Kontoinhabers: „Ihr Bestätigungscode lautet <strong className="font-mono">{sentCode}</strong>“
                </div>
              )}
              <label className="block text-xs font-medium text-slate-600">
                Code
                <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" className={inputCls} />
              </label>
            </>
          ) : (
            <p className="flex items-center gap-2 text-sm text-slate-700">
              <ShieldCheck size={18} className="text-teal-700" /> Wir haben eine Benachrichtigung an „{method.detail}“ gesendet. Bitte genehmigen Sie die Anforderung in der App.
            </p>
          )}
          {err && <Notice tone="error">{err}</Notice>}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={verify} className="h-9 rounded-md bg-teal-700 px-4 text-sm font-medium text-white hover:bg-teal-800">
              {sentCode ? 'Überprüfen' : 'Anforderung wurde genehmigt (Simulation)'}
            </button>
            <button type="button" onClick={() => setStep('method')} className="h-9 rounded-md px-3 text-sm text-slate-600 hover:bg-slate-100">
              Andere Methode
            </button>
          </div>
        </div>
      )}
      {step === 'newpw' && (
        <div className="grid gap-4 @3xl:grid-cols-[1fr_15rem]">
          <form
            className={card}
            onSubmit={(e) => {
              e.preventDefault()
              save()
            }}
          >
            <Notice tone="success">Identität bestätigt. Legen Sie jetzt ein neues Kennwort fest – eine Kontosperre wird dabei aufgehoben.</Notice>
            <label className="block text-xs font-medium text-slate-600">
              Neues Kennwort
              <input type="password" value={pw1} onChange={(e) => setPw1(e.target.value)} className={inputCls} />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Neues Kennwort bestätigen
              <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} className={inputCls} />
            </label>
            {err && <Notice tone="error">{err}</Notice>}
            <button type="submit" className="h-9 rounded-md bg-teal-700 px-4 text-sm font-medium text-white hover:bg-teal-800">
              Kennwort festlegen
            </button>
          </form>
          <PolicyBox />
        </div>
      )}
      {step === 'done' && (
        <Notice tone="success" title="Kennwort zurückgesetzt">
          Ihr neues Kennwort ist sofort gültig, Ihr Konto ist entsperrt. Bitte melden Sie sich überall mit dem neuen Kennwort an.
        </Notice>
      )}
      <Link api={api} href="/" className="inline-flex items-center gap-1 text-sm text-teal-700 hover:underline">
        <ArrowLeft size={15} /> Zur Übersicht
      </Link>
    </div>
  )
}
