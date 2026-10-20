// Interne Wissensdatenbank (kb.musterwerk.local): Suche, Liste, Artikelansicht.

import { ArrowLeft, BookOpen, Eye, Search, Tag, ThumbsUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useStore } from '@/core/store'
import { fmtDate, normalize } from '@/core/util'
import { KbArticleView } from '@/modules/kb/KbArticleView'
import { cx } from '@/ui'
import type { SiteProps } from '../SiteView'
import { Link, NotFoundBlock, useTitle } from '../shared'
import { INTRANET_NAV, MwShell } from './MwShell'

export function KbSite({ api }: SiteProps) {
  if (api.segments[0] === 'artikel' && api.segments[1]) return <Article api={api} id={api.segments[1].toUpperCase()} />
  if (api.segments.length) {
    return (
      <MwShell api={api} section="IT-Wissensdatenbank" nav={INTRANET_NAV('kb')}>
        <NotFoundBlock api={api} />
      </MwShell>
    )
  }
  return <ArticleList api={api} />
}

function ArticleList({ api }: { api: SiteProps['api'] }) {
  useTitle(api, 'Wissensdatenbank')
  const kb = useStore((s) => s.world.kb)
  const [q, setQ] = useState(api.q('q'))
  const [cat, setCat] = useState(api.q('kategorie'))
  const cats = useMemo(() => [...new Set(kb.map((a) => a.category))].sort((a, b) => a.localeCompare(b, 'de')), [kb])
  const list = useMemo(() => {
    const terms = normalize(q).split(/\s+/).filter(Boolean)
    return kb
      .filter((a) => !cat || a.category === cat)
      .map((a) => {
        const title = normalize(a.title)
        const hay = normalize([a.id, a.title, a.tags.join(' '), a.body, a.category].join(' '))
        const score = terms.reduce((s, t) => s + (title.includes(t) ? 3 : 0) + (hay.includes(t) ? 1 : 0), 0)
        return { a, score, ok: terms.every((t) => hay.includes(t)) }
      })
      .filter((x) => x.ok)
      .sort((x, y) => y.score - x.score || x.a.id.localeCompare(y.a.id))
      .map((x) => x.a)
  }, [kb, q, cat])
  return (
    <MwShell api={api} section="IT-Wissensdatenbank" nav={INTRANET_NAV('kb')}>
      <div className="mb-4 rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
          <BookOpen size={20} className="text-teal-700" /> IT-Wissensdatenbank
        </h1>
        <p className="mt-1 text-sm text-slate-600">Anleitungen und bekannte Lösungen der IT-Abteilung.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <div className="relative min-w-0 flex-1">
            <Search size={15} className="absolute left-2.5 top-2.5 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Suchbegriff, z. B. „Drucker“ oder „VPN“" className="h-9 w-full rounded-md border border-stone-300 pl-8 pr-3 text-sm focus:border-teal-500 focus:outline-none" />
          </div>
          <select value={cat} onChange={(e) => setCat(e.target.value)} className="h-9 rounded-md border border-stone-300 bg-white px-2 text-sm">
            <option value="">Alle Kategorien</option>
            {cats.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-2">
        {list.map((a) => (
          <Link key={a.id} api={api} href={`/artikel/${a.id}`} className="block rounded-lg border border-stone-200 bg-white p-3 shadow-sm hover:border-teal-300">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-mono text-xs text-teal-700">{a.id}</span>
              <span className="font-medium text-slate-900">{a.title}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              <span>{a.category}</span>
              <span>Aktualisiert {fmtDate(a.updated)}</span>
              {a.tags.slice(0, 4).map((t) => (
                <span key={t} className="rounded bg-stone-100 px-1.5 py-0.5">
                  {t}
                </span>
              ))}
              {a.custom && <span className="rounded bg-violet-100 px-1.5 py-0.5 text-violet-700">eigener Artikel</span>}
            </div>
          </Link>
        ))}
        {!list.length && <div className="rounded-lg border border-dashed border-stone-300 p-8 text-center text-sm text-slate-500">Keine Artikel gefunden.</div>}
      </div>
    </MwShell>
  )
}

function Article({ api, id }: { api: SiteProps['api']; id: string }) {
  const a = useStore((s) => s.world.kb.find((k) => k.id === id))
  useTitle(api, a ? `${a.id}: ${a.title}` : 'Artikel nicht gefunden')
  return (
    <MwShell api={api} section="IT-Wissensdatenbank" nav={INTRANET_NAV('kb')}>
      <Link api={api} href="/" className="mb-3 inline-flex items-center gap-1 text-sm text-teal-700 hover:underline">
        <ArrowLeft size={15} /> Zur Übersicht
      </Link>
      {!a ? (
        <div className="rounded-lg border border-stone-200 bg-white p-6 text-sm text-slate-600">Der Artikel {id} existiert nicht (mehr).</div>
      ) : (
        <article className="rounded-lg border border-stone-200 bg-white shadow-sm">
          <header className="border-b border-stone-100 px-5 py-4">
            <div className="font-mono text-xs text-teal-700">{a.id}</div>
            <h1 className="mt-0.5 text-xl font-semibold text-slate-900">{a.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
              <span>{a.category}</span>
              <span>Autor: {a.author}</span>
              <span>Aktualisiert {fmtDate(a.updated)}</span>
              <span className="inline-flex items-center gap-1">
                <Eye size={12} /> {a.views}
              </span>
              <span className="inline-flex items-center gap-1">
                <ThumbsUp size={12} /> {a.helpful}
              </span>
            </div>
            {!!a.tags.length && (
              <div className="mt-2 flex flex-wrap gap-1">
                {a.tags.map((t) => (
                  <span key={t} className={cx('inline-flex items-center gap-1 rounded bg-stone-100 px-1.5 py-0.5 text-[11px] text-slate-600')}>
                    <Tag size={10} /> {t}
                  </span>
                ))}
              </div>
            )}
          </header>
          <div className="px-5 py-4">
            <KbArticleView id={a.id} />
          </div>
        </article>
      )}
    </MwShell>
  )
}
