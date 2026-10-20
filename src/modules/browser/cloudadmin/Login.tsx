// Anmeldeseite des Cloud-Anbieters (login.cloudadmin.example): Benutzer → Kennwort → MFA.

import { ArrowLeft, Cloud, Smartphone, UserRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import { findUser } from '@/core/ops/ad'
import { addSignIn, findCloudUser } from '@/core/ops/cloud'
import { useStore } from '@/core/store'
import { nowIso, uid } from '@/core/util'
import { mfaApprovable, publicOrigin } from '../auth'
import { setSession, useSession } from '../session'
import type { SiteProps } from '../SiteView'
import { BA, logEntry, runWorld, useTitle } from '../shared'
import { CLOUD_ADMIN_URL } from '../url'

type Step = 'user' | 'password' | 'mfa' | 'register'

const appFor = (ru: string) => (ru.includes('mail.') || ru.includes('outlook.') ? 'Webmail' : 'Cloud Admin Center')

function safeReturn(ru: string) {
  try {
    const u = new URL(ru)
    return u.hostname.endsWith('.cloudadmin.example') ? u.href : CLOUD_ADMIN_URL
  } catch {
    return CLOUD_ADMIN_URL
  }
}

function QrCode({ seed }: { seed: string }) {
  const cells = useMemo(() => {
    let h = 0
    for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0
    return Array.from({ length: 21 * 21 }, (_, i) => {
      h = (h * 1103515245 + 12345) >>> 0
      const x = i % 21
      const y = Math.floor(i / 21)
      const finder = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13)
      if (finder) return (x % 6 === 0 || y % 6 === 0 || (x > 13 && (x - 14) % 6 === 0) || (y > 13 && (y - 14) % 6 === 0) || ((x % 7) > 1 && (x % 7) < 5 && (y % 7) > 1 && (y % 7) < 5))
      return (h >>> 16) % 2 === 0
    })
  }, [seed])
  return (
    <svg viewBox="0 0 21 21" className="h-32 w-32 border border-slate-200 bg-white p-1" aria-label="QR-Code (Simulation)">
      {cells.map((on, i) => (on ? <rect key={i} x={i % 21} y={Math.floor(i / 21)} width="1" height="1" fill="#0f172a" /> : null))}
    </svg>
  )
}

export function CloudLoginSite({ api }: SiteProps) {
  useTitle(api, 'Anmelden – Cloud-Konto')
  const ru = safeReturn(api.q('ru') || CLOUD_ADMIN_URL)
  const world = useStore((s) => s.world)
  const session = useSession(api.hostname, 'cloud')
  const [step, setStep] = useState<Step>('user')
  const [upn, setUpn] = useState('')
  const [input, setInput] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [number] = useState(() => 10 + Math.floor(Math.random() * 89))
  const cu = upn ? findCloudUser(world, upn) : undefined
  const app = appFor(ru)

  const record = (status: 'Erfolgreich' | 'Fehlgeschlagen' | 'Unterbrochen (MFA)' | 'Blockiert', failureReason?: string) => {
    if (!cu) return
    const target = cu.upn
    runWorld((w) => {
      const o = publicOrigin(w, api.hostname)
      addSignIn(w, target, { time: nowIso(), app, ip: o.ip, location: o.location, client: 'Browser (Windows 11)', status, failureReason, risk: 'keines' })
    })
  }

  const finish = () => {
    if (!cu) return
    record('Erfolgreich')
    setSession(api.hostname, 'cloud', { user: cu.upn, at: Date.now() })
    api.navigate(ru, { replace: true })
  }

  const submitUser = () => {
    setErr('')
    const v = input.trim()
    if (!v) return setErr('Geben Sie eine gültige E-Mail-Adresse ein.')
    const c = findCloudUser(world, v)
    if (!c || !v.includes('@')) return setErr('Dieses Benutzerkonto wurde nicht gefunden. Geben Sie ein anderes Konto ein (Format: name@musterwerk.example).')
    setUpn(c.upn)
    setStep('password')
  }

  const submitPw = () => {
    if (!cu) return
    setErr('')
    const ad = cu.sam ? findUser(world, cu.sam) : undefined
    const p = pw
    setPw('')
    if (!ad || ad.password !== p) {
      record('Fehlgeschlagen', 'Ungültiger Benutzername oder ungültiges Kennwort')
      return setErr('Ihr Konto oder Kennwort ist falsch. Wenn Sie Ihr Kennwort vergessen haben, setzen Sie es jetzt im Kennwort-Portal zurück.')
    }
    if (cu.signInBlocked) {
      record('Blockiert', 'Anmeldung durch Administrator blockiert')
      return setErr('Ihr Konto ist gesperrt. Wenden Sie sich an Ihren Support oder Administrator.')
    }
    setStep(!cu.mfa.methods.length || cu.mfa.requireReRegister ? 'register' : 'mfa')
  }

  const approve = () => {
    if (!cu) return
    if (!mfaApprovable(world, api.hostname, cu)) {
      record('Unterbrochen (MFA)', 'MFA-Anforderung wurde nicht beantwortet')
      return setErr('Die Anforderung wurde nicht rechtzeitig beantwortet. Die Bestätigung muss auf dem registrierten Gerät des Kontoinhabers erfolgen.')
    }
    finish()
  }

  const register = () => {
    if (!cu) return
    if (!mfaApprovable(world, api.hostname, cu)) return setErr('Die Registrierung muss der Kontoinhaber selbst mit seinem eigenen Smartphone durchführen.')
    const target = cu.upn
    runWorld((w) => {
      const c = findCloudUser(w, target)
      if (!c) return
      c.mfa.methods.forEach((m) => (m.isDefault = false))
      c.mfa.methods.push({ id: uid('mfa'), type: 'Authenticator-App', detail: `Smartphone von ${c.displayName}`, isDefault: true, registered: nowIso() })
      c.mfa.requireReRegister = false
    })
    logEntry({ type: BA.cloudMfaRegistered, target, detail: 'Authenticator-App' })
    finish()
  }

  const btn = 'h-9 min-w-24 rounded bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700'
  const sessionUser = session ? findCloudUser(world, session.user) : undefined

  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-indigo-50 via-slate-50 to-sky-50 p-4">
      <div className="w-full max-w-sm rounded-md bg-white p-8 shadow-lg">
        <div className="flex items-center gap-2 text-slate-700">
          <Cloud size={22} className="text-indigo-600" /> <span className="text-sm font-semibold">Cloud-Konto</span>
        </div>
        {upn && step !== 'user' && (
          <button type="button" onClick={() => { setStep('user'); setErr('') }} className="mt-4 flex items-center gap-1 text-sm text-slate-700 hover:underline">
            <ArrowLeft size={14} /> {upn}
          </button>
        )}

        {step === 'user' && sessionUser && (
          <div className="mt-4">
            <h1 className="text-xl font-semibold text-slate-900">Konto auswählen</h1>
            <button type="button" onClick={() => api.navigate(ru, { replace: true })} className="mt-3 flex w-full items-center gap-3 rounded border border-slate-200 p-3 text-left hover:bg-slate-50">
              <UserRound className="text-slate-500" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{sessionUser.displayName}</span>
                <span className="block truncate text-xs text-slate-500">{sessionUser.upn} · Angemeldet</span>
              </span>
            </button>
            <button type="button" onClick={() => setSession(api.hostname, 'cloud')} className="mt-2 text-xs text-indigo-700 hover:underline">
              Abmelden / anderes Konto verwenden
            </button>
          </div>
        )}

        {step === 'user' && !sessionUser && (
          <form className="mt-4 space-y-4" onSubmit={(e) => { e.preventDefault(); submitUser() }}>
            <h1 className="text-xl font-semibold text-slate-900">Anmelden</h1>
            <input autoFocus value={input} onChange={(e) => setInput(e.target.value)} placeholder="E-Mail-Adresse" className="h-9 w-full border-b border-slate-400 text-sm focus:border-indigo-600 focus:outline-none" />
            {err && <p className="text-sm text-rose-700">{err}</p>}
            <div className="flex justify-end">
              <button type="submit" className={btn}>Weiter</button>
            </div>
          </form>
        )}

        {step === 'password' && (
          <form className="mt-2 space-y-4" onSubmit={(e) => { e.preventDefault(); submitPw() }}>
            <h1 className="text-xl font-semibold text-slate-900">Kennwort eingeben</h1>
            <input autoFocus type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Kennwort" className="h-9 w-full border-b border-slate-400 text-sm focus:border-indigo-600 focus:outline-none" />
            {err && <p className="text-sm text-rose-700">{err}</p>}
            <div className="flex items-center justify-between">
              <button type="button" onClick={() => api.navigate('https://konto.musterwerk.example/vergessen')} className="text-xs text-indigo-700 hover:underline">
                Kennwort vergessen?
              </button>
              <button type="submit" className={btn}>Anmelden</button>
            </div>
          </form>
        )}

        {step === 'mfa' && cu && (
          <div className="mt-2 space-y-4">
            <h1 className="text-xl font-semibold text-slate-900">Anmeldeanforderung genehmigen</h1>
            <p className="flex gap-2 text-sm text-slate-700">
              <Smartphone size={18} className="shrink-0 text-indigo-600" />
              Öffnen Sie Ihre Authenticator-App und geben Sie die angezeigte Nummer ein, um sich anzumelden.
            </p>
            <div className="text-center text-4xl font-semibold tracking-wider text-slate-900">{number}</div>
            {err && <p className="text-sm text-rose-700">{err}</p>}
            <button type="button" onClick={approve} className={`${btn} w-full`}>
              In der App bestätigt (Simulation)
            </button>
            <p className="text-[11px] text-slate-500">Bestätigen Sie nie eine Anforderung, die Sie nicht selbst ausgelöst haben.</p>
          </div>
        )}

        {step === 'register' && cu && (
          <div className="mt-2 space-y-3">
            <h1 className="text-xl font-semibold text-slate-900">Weitere Informationen erforderlich</h1>
            <p className="text-sm text-slate-700">Ihre Organisation benötigt weitere Informationen zum Schutz Ihres Kontos. Richten Sie die Authenticator-App ein: Scannen Sie den QR-Code mit der App.</p>
            <div className="flex justify-center">
              <QrCode seed={cu.upn} />
            </div>
            {err && <p className="text-sm text-rose-700">{err}</p>}
            <button type="button" onClick={register} className={`${btn} w-full`}>
              QR-Code gescannt – weiter (Simulation)
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
