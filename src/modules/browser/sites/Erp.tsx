// MW-ERP (erp.musterwerk.local): Anmeldung gegen das AD (inkl. Sperrzähler) und Dummy-Übersicht.

import { Boxes, ClipboardList, Database, Landmark, Lock, LogOut, ShoppingCart, Users } from 'lucide-react'
import { useState } from 'react'
import { findUser, isMemberOf } from '@/core/ops/ad'
import { useStore } from '@/core/store'
import type { World } from '@/core/types'
import { nowIso } from '@/core/util'
import { cx, tableCls } from '@/ui'
import { accountExpired, attemptAdPassword, passwordExpired } from '../auth'
import { setSession, useSession } from '../session'
import type { SiteProps } from '../SiteView'
import { BA, Link, logEntry, Notice, runWorld, useTitle } from '../shared'

const svcRunning = (w: World, svc: string) => {
  const s = w.infra.servers.find((x) => x.name === 'APP01')
  return !!s?.online && s.services.find((x) => x.name === svc)?.status === 'Wird ausgeführt'
}

export function ErpSite({ api }: SiteProps) {
  const appOk = useStore((s) => svcRunning(s.world, 'ERPAppServer'))
  const session = useSession(api.hostname, 'erp')
  useTitle(api, appOk ? (session ? 'MW-ERP – Übersicht' : 'MW-ERP – Anmeldung') : '503 Service Unavailable')
  if (!appOk) {
    return (
      <div className="p-6 font-mono text-sm text-slate-700">
        <h1 className="mb-2 text-xl font-bold">Service Unavailable</h1>
        <p>HTTP Error 503. Der Dienst ist nicht verfügbar.</p>
        <p className="mt-3 text-xs text-slate-500">MW-ERP Applikationsserver (APP01) antwortet nicht.</p>
      </div>
    )
  }
  return session ? <ErpHome api={api} sam={session.user} /> : <ErpLogin api={api} />
}

type Outcome = 'ok' | 'unknown' | 'bad' | 'locked' | 'locked-now' | 'disabled' | 'expired' | 'pwexpired' | 'nogroup' | 'nodb'

function ErpLogin({ api }: { api: SiteProps['api'] }) {
  const [user, setUser] = useState('')
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState<{ tone: 'error' | 'warning'; text: string; link?: boolean } | null>(null)

  const submit = () => {
    if (!user.trim() || !pw) return setMsg({ tone: 'error', text: 'Bitte Benutzername und Kennwort eingeben.' })
    const login = user.trim().replace(/^musterwerk\\/i, '')
    const outcome = runWorld<{ o: Outcome; sam?: string }>((w) => {
      if (!svcRunning(w, 'MSSQLSERVER')) return { o: 'nodb' }
      const r = attemptAdPassword(w, login, pw, api.hostname)
      if (r !== 'ok') return { o: r }
      const u = findUser(w, login)!
      const sam = u.sam
      if (!u.enabled) return { o: 'disabled', sam }
      if (accountExpired(u)) return { o: 'expired', sam }
      if (passwordExpired(w, u)) return { o: 'pwexpired', sam }
      if (!isMemberOf(w, u.sam, 'GG_ERP_Benutzer')) return { o: 'nogroup', sam }
      u.lastLogon = nowIso()
      return { o: 'ok', sam }
    })
    if (outcome.o !== 'nodb') logEntry({ type: BA.erpLogin, target: outcome.sam ?? login.toLowerCase(), detail: outcome.o === 'ok' ? 'Erfolgreich' : `Fehlgeschlagen (${outcome.o})` })
    setPw('')
    switch (outcome.o) {
      case 'ok':
        setSession(api.hostname, 'erp', { user: outcome.sam!, at: Date.now() })
        return
      case 'nodb':
        return setMsg({ tone: 'error', text: 'Datenbankverbindung fehlgeschlagen: Der SQL-Server ist nicht erreichbar (Fehler 08001). Bitte IT verständigen.' })
      case 'unknown':
      case 'bad':
        return setMsg({ tone: 'error', text: 'Anmeldung fehlgeschlagen: Benutzername oder Kennwort ist falsch. Fehlversuche werden protokolliert.' })
      case 'locked':
      case 'locked-now':
        return setMsg({ tone: 'error', text: 'Ihr Benutzerkonto ist gesperrt. Bitte wenden Sie sich an den IT-Service-Desk (Durchwahl 999).' })
      case 'disabled':
        return setMsg({ tone: 'error', text: 'Ihr Benutzerkonto ist deaktiviert.' })
      case 'expired':
        return setMsg({ tone: 'error', text: 'Ihr Benutzerkonto ist abgelaufen.' })
      case 'pwexpired':
        return setMsg({ tone: 'warning', text: 'Ihr Kennwort ist abgelaufen bzw. muss geändert werden. Bitte ändern Sie es zuerst im Kennwort-Portal.', link: true })
      case 'nogroup':
        return setMsg({ tone: 'error', text: 'Keine Berechtigung: Für Ihr Konto ist keine ERP-Rolle hinterlegt (AD-Gruppe „GG_ERP_Benutzer“ fehlt). Bitte über Ihre Führungskraft beantragen.' })
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-slate-700 to-slate-900 p-4">
      <div className="w-full max-w-sm overflow-hidden rounded-lg bg-white shadow-2xl">
        <div className="flex items-center gap-2 bg-orange-600 px-5 py-3 text-white">
          <Database size={20} />
          <div>
            <div className="font-semibold leading-tight">MW-ERP</div>
            <div className="text-[11px] text-orange-100">Warenwirtschaft · Musterwerk AG</div>
          </div>
        </div>
        <form
          className="space-y-3 p-5"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <label className="block text-xs font-medium text-slate-600">
            Mandant
            <select className="mt-1 h-9 w-full rounded border border-slate-300 bg-white px-2 text-sm">
              <option>100 – Musterwerk AG</option>
              <option>900 – Schulungsmandant</option>
            </select>
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Benutzer
            <input value={user} onChange={(e) => setUser(e.target.value)} autoComplete="off" placeholder="z. B. m.becker" className="mt-1 h-9 w-full rounded border border-slate-300 px-2 text-sm focus:border-orange-500 focus:outline-none" />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Kennwort
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} className="mt-1 h-9 w-full rounded border border-slate-300 px-2 text-sm focus:border-orange-500 focus:outline-none" />
          </label>
          {msg && (
            <Notice tone={msg.tone}>
              {msg.text}{' '}
              {msg.link && (
                <Link api={api} href="https://konto.musterwerk.example/aendern" className="font-medium underline">
                  Zum Kennwort-Portal
                </Link>
              )}
            </Notice>
          )}
          <button type="submit" className="h-9 w-full rounded bg-orange-600 text-sm font-medium text-white hover:bg-orange-700">
            Anmelden
          </button>
          <p className="text-center text-[11px] text-slate-500">Anmeldung mit Ihrem Windows-Benutzernamen und -Kennwort.</p>
        </form>
      </div>
    </div>
  )
}

const ORDERS = [
  ['AU-24871', 'Nordhafen Maschinenbau GmbH', 'Flanschplatten FP-200 (500 Stk.)', 'In Fertigung', '12.480,00 €'],
  ['AU-24872', 'Elbtal Fahrzeugteile KG', 'Lagerbuchsen LB-12 (2.000 Stk.)', 'Versandbereit', '6.920,00 €'],
  ['AU-24875', 'Werkhaus Schulte', 'Sonderanfertigung Halterung', 'Angebot', '1.150,00 €'],
  ['AU-24877', 'Heidekreis Agrartechnik', 'Achsbolzen AB-40 (800 Stk.)', 'In Fertigung', '9.760,00 €'],
  ['AU-24880', 'Küstenwerft Nord', 'Edelstahlwinkel EW-5 (1.200 Stk.)', 'Offen', '4.310,00 €'],
]

function ErpHome({ api, sam }: { api: SiteProps['api']; sam: string }) {
  const user = useStore((s) => s.world.users.find((u) => u.sam === sam))
  const fin = useStore((s) => isMemberOf(s.world, sam, 'GG_ERP_Finanzen'))
  const modules = [
    { label: 'Aufträge', icon: ClipboardList, ok: true },
    { label: 'Lager', icon: Boxes, ok: true },
    { label: 'Einkauf', icon: ShoppingCart, ok: true },
    { label: 'Finanzbuchhaltung', icon: Landmark, ok: fin },
    { label: 'Kunden', icon: Users, ok: true },
  ]
  return (
    <div className="min-h-full bg-slate-100">
      <header className="flex flex-wrap items-center gap-3 bg-slate-800 px-4 py-2 text-white">
        <Database size={18} className="text-orange-400" />
        <span className="font-semibold">MW-ERP</span>
        <span className="text-xs text-slate-300">Mandant 100 · Musterwerk AG</span>
        <span className="ml-auto text-xs text-slate-300">{user?.displayName ?? sam}</span>
        <button type="button" onClick={() => setSession(api.hostname, 'erp')} className="flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-slate-700">
          <LogOut size={13} /> Abmelden
        </button>
      </header>
      <div className="mx-auto max-w-6xl space-y-4 p-4">
        <div className="grid grid-cols-2 gap-2 @xl:grid-cols-5">
          {modules.map((m) => (
            <div key={m.label} title={m.ok ? undefined : 'Keine Berechtigung (Rolle GG_ERP_Finanzen fehlt)'} className={cx('flex flex-col items-center gap-1.5 rounded-lg border bg-white p-3 text-sm shadow-sm', m.ok ? 'border-slate-200 text-slate-800' : 'border-dashed border-slate-300 text-slate-400')}>
              {m.ok ? <m.icon size={22} className="text-orange-600" /> : <Lock size={22} />}
              {m.label}
            </div>
          ))}
        </div>
        <div className="grid gap-2 @xl:grid-cols-3">
          {[
            ['Offene Aufträge', '37'],
            ['Lieferungen heute', '12'],
            ['Bestellvorschläge', '8'],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
              <div className="text-xs text-slate-500">{k}</div>
              <div className="text-2xl font-semibold text-slate-900">{v}</div>
            </div>
          ))}
        </div>
        <section className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <h2 className="border-b border-slate-100 px-3 py-2 text-sm font-semibold text-slate-800">Kundenaufträge (Auszug)</h2>
          <table className={tableCls}>
            <thead>
              <tr>
                <th>Auftrag</th>
                <th>Kunde</th>
                <th>Position</th>
                <th>Status</th>
                <th className="text-right">Wert</th>
              </tr>
            </thead>
            <tbody>
              {ORDERS.map((o) => (
                <tr key={o[0]}>
                  <td className="font-mono text-xs">{o[0]}</td>
                  <td>{o[1]}</td>
                  <td className="text-slate-600">{o[2]}</td>
                  <td>{o[3]}</td>
                  <td className="text-right font-mono text-xs">{o[4]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <p className="text-center text-[11px] text-slate-500">Schulungsumgebung – alle Daten sind fiktiv.</p>
      </div>
    </div>
  )
}
