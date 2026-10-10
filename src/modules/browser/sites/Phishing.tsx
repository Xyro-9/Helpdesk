// Phishing-Seiten (Lernchance!): täuschend ähnliche, aber erkennbar falsche Anmeldeseiten.
// Eingegebene Zugangsdaten führen zu einer verdächtigen Anmeldung im Cloud-Mandanten.

import { Cloud, PackageX, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { findUser } from '@/core/ops/ad'
import { addSignIn, findCloudUser } from '@/core/ops/cloud'
import { hashString, nowIso } from '@/core/util'
import type { SiteProps } from '../SiteView'
import { BA, logEntry, runWorld, useTitle } from '../shared'
import { CLOUD_LOGIN_URL } from '../url'

const PLACES = ['Bukarest, RO', 'Lagos, NG', 'Hanoi, VN', 'São Paulo, BR', 'Unbekannt (Anonymisierungsdienst)']

function submitCredentials(user: string, pw: string, source: string) {
  const login = user.trim()
  const known = runWorld((w) => {
    const cu = findCloudUser(w, login) ?? (findUser(w, login)?.upn ? findCloudUser(w, findUser(w, login)!.upn) : undefined)
    if (!cu) return false
    cu.riskState = 'gefährdet'
    const ad = cu.sam ? findUser(w, cu.sam) : undefined
    const correct = !!ad && ad.password === pw
    const h = hashString(cu.upn)
    addSignIn(w, cu.upn, {
      time: nowIso(),
      app: 'Webmail',
      ip: `192.0.2.${(h % 200) + 20}`,
      location: PLACES[h % PLACES.length],
      client: 'Unbekannter Browser (Linux)',
      status: correct ? 'Erfolgreich' : 'Fehlgeschlagen',
      failureReason: correct ? undefined : 'Ungültiger Benutzername oder ungültiges Kennwort',
      risk: 'hoch',
    })
    return true
  })
  logEntry({ type: BA.phishingSubmitted, target: login.toLowerCase(), detail: `${source}${known ? '' : ' (unbekannter Benutzer)'}` })
}

export function PhishingSite({ api, route }: SiteProps) {
  const parcel = route.host.startsWith('paket')
  const [user, setUser] = useState('')
  const [pw, setPw] = useState('')
  const [done, setDone] = useState(false)
  useTitle(api, parcel ? 'Zustellung fehlgeschlagen – Aktion erforderlich' : 'Anmelden – Konto-Verifizierung')

  useEffect(() => {
    if (!done) return
    const t = setTimeout(() => api.navigate(CLOUD_LOGIN_URL, { replace: true }), 3000)
    return () => clearTimeout(t)
  }, [done, api])

  const submit = () => {
    if (!user.trim() || !pw) return
    submitCredentials(user, pw, route.host)
    setPw('')
    setDone(true)
  }

  if (done)
    return (
      <div className="flex min-h-full items-center justify-center bg-slate-100 p-4">
        <div className="max-w-sm rounded bg-white p-8 text-center shadow">
          <div className="text-lg font-semibold text-slate-800">Vielen Dank!</div>
          <p className="mt-2 text-sm text-slate-600">Ihr Konto wurde erfolgreich verifiziert. Sie werden in Kürze weitergeleitet …</p>
        </div>
      </div>
    )

  const form = (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <input value={user} onChange={(e) => setUser(e.target.value)} placeholder="E-Mail-Adresse" className="h-10 w-full border-b border-slate-400 px-1 text-sm focus:border-blue-600 focus:outline-none" />
      <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Passwort" className="h-10 w-full border-b border-slate-400 px-1 text-sm focus:border-blue-600 focus:outline-none" />
      <button type="submit" className="h-9 w-full bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700">
        {parcel ? 'Bestätigen & Zustellung planen' : 'Konto verifizieren'}
      </button>
    </form>
  )

  if (parcel)
    return (
      <div className="min-h-full bg-yellow-50 p-4">
        <div className="mx-auto max-w-md rounded border border-yellow-300 bg-white p-6 shadow">
          <div className="flex items-center gap-2 text-lg font-bold text-red-700">
            <PackageX /> Zustellung fehlgeschlagen
          </div>
          <p className="mt-2 text-sm text-slate-700">Ihre Sendung konnte nicht zugestellt werden, da eine Zollgebühr von 1,99 EUR offen ist. Bitte melden Sie sich mit Ihrem Firmenkonto an, um die Zustellung neu zu planen. Andernfalls wird die Sendung in 24 Stunden zurückgesandt.</p>
          <div className="mt-4">{form}</div>
          <p className="mt-4 text-[10px] text-slate-400">© 2019 Paket Zustellung Service Info</p>
        </div>
      </div>
    )

  return (
    <div className="flex min-h-full items-center justify-center bg-[#eef1f6] p-4">
      <div className="w-full max-w-sm bg-white p-8 shadow-md">
        <div className="flex items-center gap-2 text-blue-600">
          <Cloud size={22} /> <span className="font-semibold">Cloud Admin Centre</span>
        </div>
        <div className="mt-4 flex items-start gap-2 bg-red-50 p-2 text-xs text-red-800">
          <TriangleAlert size={14} className="mt-0.5 shrink-0" /> Ihr Passwort läuft heute ab! Bestätigen Sie jetzt Ihre Zugangsdaten, um eine Sperrung Ihres Kontos zu vermeiden.
        </div>
        <h1 className="mb-3 mt-4 text-xl font-semibold text-slate-800">Anmeldung erforderlich zur Konto-Verifizierung</h1>
        {form}
        <p className="mt-6 text-[10px] text-slate-400">© Cloud Admin Centre 2019 · Sicherheits-Team</p>
      </div>
    </div>
  )
}
