// Anzeige eines KB-Artikels (Titel, Metadaten, Markdown-Inhalt).
// Wird von der Wissensdatenbank und vom Browser-Modul (Intranet) verwendet – rein darstellend, ohne Schreibzugriffe.

import { Calendar, Eye, Tag, ThumbsUp, User } from 'lucide-react'
import { useStore } from '@/core/store'
import type { KbArticle } from '@/core/types'
import { fmtDate } from '@/core/util'
import { Badge, Markdown } from '@/ui'

export function KbArticleContent({ article: a }: { article: KbArticle }) {
  return (
    <article>
      <header className="border-b border-slate-200 pb-3">
        <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-mono text-slate-500">{a.id}</span>
          <Badge tone="sky">{a.category}</Badge>
          {a.custom && <Badge tone="violet">Eigener Artikel</Badge>}
        </div>
        <h1 className="text-xl font-semibold text-slate-900">{a.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1">
            <User size={12} /> {a.author}
          </span>
          <span className="inline-flex items-center gap-1">
            <Calendar size={12} /> aktualisiert {fmtDate(a.updated)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Eye size={12} /> {a.views} Aufrufe
          </span>
          <span className="inline-flex items-center gap-1">
            <ThumbsUp size={12} /> {a.helpful} fanden das hilfreich
          </span>
        </div>
        {a.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            <Tag size={12} className="text-slate-400" />
            {a.tags.map((t) => (
              <span key={t} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
                {t}
              </span>
            ))}
          </div>
        )}
      </header>
      <Markdown text={a.body} className="pt-3" />
    </article>
  )
}

export function KbArticleView({ id }: { id: string }) {
  const a = useStore((s) => s.world.kb.find((k) => k.id.toLowerCase() === id.toLowerCase()))
  if (!a) return <div className="text-sm text-slate-500">Artikel {id} nicht gefunden.</div>
  return <KbArticleContent article={a} />
}
