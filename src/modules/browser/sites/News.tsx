// Fiktive Nachrichtenseite (www.nachrichten.example).

import { Newspaper } from 'lucide-react'
import type { SiteProps } from '../SiteView'
import { useTitle } from '../shared'

const ITEMS = [
  { cat: 'Digital', title: 'Verbraucherschützer warnen vor gefälschten Paket-SMS', text: 'Betrüger verschicken derzeit Nachrichten über angeblich nicht zustellbare Sendungen. Der Link führt auf Seiten, die Zugangsdaten oder kleine „Zollgebühren“ abgreifen wollen.' },
  { cat: 'Wirtschaft', title: 'Maschinenbau im Norden: Auftragseingang stabil', text: 'Die Betriebe der Region melden ein leichtes Plus bei den Bestellungen. Fachkräfte bleiben knapp.' },
  { cat: 'Digital', title: 'Mehr-Faktor-Anmeldung: Warum die Bestätigung per App so wichtig ist', text: 'Wer eine Anmeldeanforderung bestätigt, die er nicht selbst ausgelöst hat, öffnet Angreifern die Tür. Expertinnen raten: Unerwartete Anfragen immer ablehnen und melden.' },
  { cat: 'Hamburg', title: 'Hafenfest lockt am Wochenende Tausende Besucher', text: 'Mit Barkassen-Korso, Musik und Feuerwerk feiert die Stadt ihren Hafen.' },
  { cat: 'Wetter', title: 'Herbstlich: Wind und Schauer an der Küste', text: 'Zum Wochenende wird es kühler, an der Küste sind Sturmböen möglich.' },
]

export function NewsSite({ api }: SiteProps) {
  useTitle(api, 'Nachrichten – Aktuelles aus Hamburg und der Welt')
  return (
    <div className="min-h-full bg-white">
      <header className="border-b-4 border-red-600 px-4 py-3">
        <div className="mx-auto flex max-w-4xl items-center gap-2 text-2xl font-black tracking-tight text-slate-900">
          <Newspaper className="text-red-600" /> nachrichten<span className="text-red-600">.example</span>
        </div>
      </header>
      <main className="mx-auto max-w-4xl space-y-4 px-4 py-6">
        {ITEMS.map((n, i) => (
          <article key={n.title} className={i === 0 ? 'rounded-lg bg-slate-50 p-4' : 'border-b border-slate-100 pb-3'}>
            <div className="text-xs font-semibold uppercase text-red-600">{n.cat}</div>
            <h2 className={i === 0 ? 'text-xl font-bold text-slate-900' : 'font-semibold text-slate-900'}>{n.title}</h2>
            <p className="mt-1 text-sm text-slate-600">{n.text}</p>
          </article>
        ))}
      </main>
    </div>
  )
}
