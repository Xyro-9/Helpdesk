// Suchmaschine (www.suche.example): Ergebnisse aus der Wissensdatenbank, fiktiven Fachartikeln und bekannten Websites.

import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useStore } from '@/core/store'
import { normalize } from '@/core/util'
import type { SiteProps } from '../SiteView'
import { Link, useTitle } from '../shared'
import { TECH_ARTICLES } from './techArticles'

interface Hit {
  url: string
  title: string
  snippet: string
  score: number
  ad?: boolean
  note?: string
}

const SITES: { url: string; title: string; snippet: string; keys: string }[] = [
  { url: 'https://admin.cloudadmin.example/', title: 'Cloud Admin Center', snippet: 'Verwaltung von Benutzern, Lizenzen, Postfächern und Sicherheit Ihres Cloud-Mandanten.', keys: 'cloud admin center verwaltung lizenzen postfach benutzer mfa portal' },
  { url: 'https://login.cloudadmin.example/', title: 'Anmelden – Cloud-Konto', snippet: 'Melden Sie sich mit Ihrem Geschäftskonto an.', keys: 'login anmelden anmeldung cloud konto' },
  { url: 'https://mail.cloudadmin.example/', title: 'Webmail – Cloud', snippet: 'E-Mails im Browser lesen.', keys: 'mail webmail email e-mail postfach outlook' },
  { url: 'https://status.cloudadmin.example/', title: 'Cloud-Dienststatus', snippet: 'Aktueller Status aller Cloud-Dienste.', keys: 'status störung cloud ausfall dienst' },
  { url: 'https://www.musterwerk.example/', title: 'Musterwerk AG – Präzisionsteile aus Hamburg', snippet: 'Dreh- und Frästeile, Baugruppen und Sonderanfertigungen.', keys: 'musterwerk firma hamburg präzisionsteile karriere kontakt' },
  { url: 'https://konto.musterwerk.example/', title: 'Kennwort-Portal – Musterwerk AG', snippet: 'Kennwort ändern oder vergessenes Kennwort zurücksetzen.', keys: 'kennwort passwort ändern vergessen zurücksetzen self-service musterwerk entsperren' },
  { url: 'https://tracking.versand.example/', title: 'Sendungsverfolgung – Versand-Service', snippet: 'Verfolgen Sie Ihre Sendung mit der Sendungsnummer.', keys: 'paket sendung tracking verfolgung versand dhl lieferung' },
  { url: 'https://www.nachrichten.example/', title: 'Nachrichten – Aktuelles', snippet: 'Nachrichten aus Hamburg und der Welt.', keys: 'nachrichten news aktuell wetter' },
]

const AD_TRIGGER = /login|anmeld|cloud|admin|konto|kennwort|passwort|mail|postfach/

export function SearchSite({ api }: SiteProps) {
  const q = api.q('q')
  useTitle(api, q ? `${q} – Suche` : 'Suche')
  const kb = useStore((s) => s.world.kb)
  const [input, setInput] = useState(q)
  const hits = useMemo<Hit[]>(() => {
    const terms = normalize(q).split(/[\s,.;:!?]+/).filter((t) => t.length > 1)
    if (!terms.length) return []
    const score = (title: string, text: string) => {
      const t = normalize(title)
      const h = normalize(text)
      return terms.reduce((s, x) => s + (t.includes(x) ? 3 : 0) + (h.includes(x) ? 1 : 0), 0)
    }
    const list: Hit[] = []
    for (const a of TECH_ARTICLES) {
      const s = score(a.title, [a.snippet, a.tags.join(' '), a.body ?? '', ...(a.posts ?? []).map((p) => p.body)].join(' '))
      if (s) list.push({ url: `https://${a.host}${a.path}`, title: a.title, snippet: a.snippet, score: s })
    }
    for (const a of kb) {
      const s = score(a.title, [a.tags.join(' '), a.body, a.category].join(' '))
      if (s) list.push({ url: `http://kb.musterwerk.local/artikel/${a.id}`, title: `${a.id}: ${a.title} – IT-Wissensdatenbank`, snippet: a.body.replace(/[#*`>]/g, '').slice(0, 160) + '…', score: s, note: 'Intranet – nur im Firmennetz erreichbar' })
    }
    for (const w of SITES) {
      const s = score(w.title, `${w.snippet} ${w.keys}`)
      if (s) list.push({ url: w.url, title: w.title, snippet: w.snippet, score: s + 1 })
    }
    list.sort((a, b) => b.score - a.score)
    if (AD_TRIGGER.test(normalize(q)))
      list.unshift({ url: 'https://cloudadmin-login.secure-verify.example/verify?ref=suche', title: 'Cloud Admin Center – Schnell & sicher anmelden', snippet: 'Offizielle Anmeldung für Ihr Geschäftskonto. Jetzt Konto bestätigen und Sperrung vermeiden!', score: 99, ad: true })
    return list
  }, [q, kb])

  const form = (big: boolean) => (
    <form
      className={big ? 'mt-6 flex w-full max-w-xl gap-2' : 'flex min-w-0 flex-1 gap-2'}
      onSubmit={(e) => {
        e.preventDefault()
        if (input.trim()) api.navigate(`/?q=${encodeURIComponent(input.trim())}`)
      }}
    >
      <input value={input} onChange={(e) => setInput(e.target.value)} autoFocus={big} placeholder="Suchbegriff eingeben" className={`min-w-0 flex-1 rounded-full border border-slate-300 px-4 text-sm shadow-sm focus:border-violet-400 focus:outline-none ${big ? 'h-11' : 'h-9'}`} />
      <button type="submit" className="flex items-center justify-center rounded-full bg-violet-600 px-4 text-white hover:bg-violet-700" aria-label="Suchen">
        <Search size={16} />
      </button>
    </form>
  )

  if (!q)
    return (
      <div className="flex min-h-full flex-col items-center px-4 pt-20">
        <div className="flex items-center gap-2 text-4xl font-semibold text-slate-800">
          <Search size={36} className="text-violet-600" /> Suche
        </div>
        {form(true)}
        <p className="mt-6 text-xs text-slate-400">Die freundliche Suchmaschine für Admins und Neugierige.</p>
      </div>
    )

  return (
    <div className="min-h-full bg-white">
      <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
        <Link api={api} href="/" className="flex items-center gap-1 font-semibold text-slate-800">
          <Search size={20} className="text-violet-600" /> <span className="hidden @md:inline">Suche</span>
        </Link>
        {form(false)}
      </header>
      <main className="max-w-2xl space-y-5 px-4 py-4 @3xl:pl-28">
        <div className="text-xs text-slate-500">Ungefähr {hits.length} Ergebnisse (0,{Math.floor(20 + hits.length * 3)} Sekunden)</div>
        {hits.map((h) => (
          <div key={h.url}>
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              {h.ad && <span className="rounded border border-slate-400 px-1 text-[10px] font-bold">Anzeige</span>}
              <span className="truncate">{h.url.replace(/^https?:\/\//, '')}</span>
            </div>
            <Link api={api} href={h.url} className="text-lg leading-snug text-violet-800 hover:underline">
              {h.title}
            </Link>
            <p className="text-sm text-slate-600">{h.snippet}</p>
            {h.note && <p className="text-xs text-amber-700">{h.note}</p>}
          </div>
        ))}
        {!hits.length && <p className="text-sm text-slate-600">Keine Ergebnisse für „{q}“. Versuchen Sie andere Suchbegriffe.</p>}
      </main>
    </div>
  )
}
