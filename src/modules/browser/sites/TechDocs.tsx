// Fiktive Fachseiten: docs.techwissen.example (Doku) und forum.adminhilfe.example (Forum).

import { BadgeCheck, BookOpenText, MessagesSquare, UserRound } from 'lucide-react'
import { Markdown } from '@/ui'
import type { SiteProps } from '../SiteView'
import { Link, NotFoundBlock, useTitle } from '../shared'
import { findTechArticle, TECH_ARTICLES } from './techArticles'

export function TechDocsSite({ api, route }: SiteProps) {
  const forum = route.host === 'forum.adminhilfe.example'
  const article = findTechArticle(route.host, api.path)
  const brand = forum ? 'AdminHilfe Forum' : 'TechWissen'
  useTitle(api, article ? `${article.title} – ${brand}` : brand)
  const list = TECH_ARTICLES.filter((a) => a.host === route.host)
  return (
    <div className="min-h-full bg-slate-50">
      <header className={forum ? 'bg-cyan-800 text-white' : 'bg-white shadow-sm'}>
        <div className="mx-auto flex max-w-4xl items-center gap-2 px-4 py-3">
          {forum ? <MessagesSquare size={20} /> : <BookOpenText size={20} className="text-cyan-700" />}
          <Link api={api} href="/" className="font-semibold">
            {brand}
          </Link>
          <span className={forum ? 'text-xs text-cyan-100' : 'text-xs text-slate-500'}>{forum ? 'Hilfe von Admins für Admins' : 'Dokumentation für die IT-Praxis'}</span>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-5">
        {api.path === '/' ? (
          <div className="space-y-2">
            <h1 className="mb-2 text-lg font-semibold text-slate-900">{forum ? 'Neueste Themen' : 'Artikel'}</h1>
            {list.map((a) => (
              <Link key={a.path} api={api} href={a.path} className="block rounded-lg border border-slate-200 bg-white p-3 hover:border-cyan-400">
                <div className="font-medium text-slate-900">{a.title}</div>
                <div className="text-sm text-slate-600">{a.snippet}</div>
              </Link>
            ))}
          </div>
        ) : !article ? (
          <NotFoundBlock api={api} />
        ) : forum ? (
          <div className="space-y-3">
            <h1 className="text-xl font-semibold text-slate-900">{article.title}</h1>
            {article.posts?.map((p, i) => (
              <div key={i} className={`rounded-lg border bg-white p-4 ${p.accepted ? 'border-emerald-300' : 'border-slate-200'}`}>
                <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
                  <UserRound size={14} /> <span className="font-medium text-slate-700">{p.author}</span>
                  {p.accepted && (
                    <span className="ml-auto flex items-center gap-1 font-medium text-emerald-700">
                      <BadgeCheck size={14} /> Akzeptierte Lösung
                    </span>
                  )}
                </div>
                <Markdown text={p.body} />
              </div>
            ))}
          </div>
        ) : (
          <article className="rounded-lg border border-slate-200 bg-white p-5">
            <Markdown text={article.body ?? ''} />
            <div className="mt-4 border-t border-slate-100 pt-2 text-xs text-slate-400">Stichworte: {article.tags.join(', ')}</div>
          </article>
        )}
      </main>
    </div>
  )
}
