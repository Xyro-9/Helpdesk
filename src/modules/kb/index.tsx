// Wissensdatenbank: Kategorien, Suche, Artikelliste, Artikelansicht, Editor

import { ArrowLeft, BookOpen, FileText, Folder, Link2, Pencil, Plus, Search, ThumbsDown, ThumbsUp, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { A } from '@/core/actions'
import { useStore } from '@/core/store'
import type { KbArticle } from '@/core/types'
import { fmtDate, normalize, nowIso } from '@/core/util'
import { isOpenTicket } from '@/modules/training/launch'
import { Badge, Button, Card, cx, EmptyState, Input, Modal, PageHeader, Select } from '@/ui'
import { KbArticleContent } from './KbArticleView'
import { KbEditor } from './KbEditor'

// Bewertungen "hilfreich" nur einmal je Artikel und Sitzung
const votedThisSession = new Map<string, 'yes' | 'no'>()

type Sort = 'relevanz' | 'titel' | 'aktualisiert' | 'aufrufe' | 'hilfreich'

function score(a: KbArticle, terms: string[]): number {
  if (!terms.length) return 1
  const title = normalize(a.title)
  const tags = normalize(a.tags.join(' '))
  const body = normalize(a.body)
  const id = a.id.toLowerCase()
  let s = 0
  for (const t of terms) {
    let hit = 0
    if (id === t) hit += 20
    if (title.includes(t)) hit += 6
    if (tags.includes(t)) hit += 4
    if (normalize(a.category).includes(t)) hit += 2
    if (body.includes(t)) hit += 1
    if (!hit) return 0 // alle Begriffe müssen vorkommen
    s += hit
  }
  return s
}

export function KbView() {
  const kb = useStore((s) => s.world.kb)
  const params = useStore((s) => s.ui.params)
  const updateWorld = useStore((s) => s.updateWorld)
  const [category, setCategory] = useState<string>('')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<Sort>('relevanz')
  const [selected, setSelected] = useState<string | undefined>()
  const [editor, setEditor] = useState<{ article?: KbArticle } | null>(null)
  const handledParams = useRef<Record<string, string> | null>(null)

  const open = (id: string) => {
    setSelected(id)
    updateWorld(
      (w) => {
        const a = w.kb.find((x) => x.id === id)
        if (a) a.views += 1
      },
      { type: A.kbViewed, target: id },
    )
  }

  // Deep-Link: navigate('kb', { id: 'KB0001' }) – Guard gegen doppelte Ausführung (StrictMode)
  useEffect(() => {
    if (handledParams.current === params) return
    handledParams.current = params
    if (!params.id) return
    const a = useStore.getState().world.kb.find((x) => x.id.toLowerCase() === params.id.toLowerCase())
    if (a) open(a.id)
    else useStore.getState().toast(`KB-Artikel ${params.id} nicht gefunden.`, 'warning')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  const categories = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of kb) m.set(a.category, (m.get(a.category) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'de'))
  }, [kb])
  const customCount = useMemo(() => kb.filter((a) => a.custom).length, [kb])

  const list = useMemo(() => {
    const terms = normalize(q.trim())
      .split(/\s+/)
      .filter((t) => t.length > 0)
    const rows = kb
      .filter((a) => !category || (category === '__custom' ? a.custom : a.category === category))
      .map((a) => ({ a, s: score(a, terms) }))
      .filter((x) => x.s > 0)
    const by: Record<Sort, (x: { a: KbArticle; s: number }, y: { a: KbArticle; s: number }) => number> = {
      relevanz: (x, y) => (terms.length ? y.s - x.s : 0) || x.a.category.localeCompare(y.a.category, 'de') || x.a.title.localeCompare(y.a.title, 'de'),
      titel: (x, y) => x.a.title.localeCompare(y.a.title, 'de'),
      aktualisiert: (x, y) => y.a.updated.localeCompare(x.a.updated),
      aufrufe: (x, y) => y.a.views - x.a.views,
      hilfreich: (x, y) => y.a.helpful - x.a.helpful,
    }
    return rows.sort(by[sort]).map((x) => x.a)
  }, [kb, q, category, sort])

  const current = selected ? kb.find((a) => a.id === selected) : undefined

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Wissensdatenbank"
        subtitle={`${kb.length} Artikel · Lösungen für wiederkehrende Probleme`}
        icon={<BookOpen size={20} />}
        actions={
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setEditor({})}>
            Neuer Artikel
          </Button>
        }
      />
      <div className="flex min-h-0 flex-1">
        {/* Kategorien */}
        <aside className="hidden w-56 shrink-0 overflow-y-auto border-r border-slate-200 bg-white py-3 md:block">
          <div className="px-4 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Kategorien</div>
          <CatButton active={!category} onClick={() => setCategory('')} label="Alle Artikel" count={kb.length} />
          {categories.map(([c, n]) => (
            <CatButton key={c} active={category === c} onClick={() => setCategory(c)} label={c} count={n} />
          ))}
          {customCount > 0 && (
            <>
              <div className="mt-3 px-4 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Eigene</div>
              <CatButton active={category === '__custom'} onClick={() => setCategory('__custom')} label="Von mir erstellt" count={customCount} />
            </>
          )}
        </aside>

        {/* Liste */}
        <section className={cx('flex min-h-0 w-full flex-col border-r border-slate-200 bg-slate-50 lg:w-96 lg:shrink-0', current && 'hidden lg:flex')}>
          <div className="space-y-2 border-b border-slate-200 p-3">
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute top-2.5 left-2.5 text-slate-400" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Suchen in Titel, Schlagwörtern und Text …" className="pl-8" aria-label="Wissensdatenbank durchsuchen" />
            </div>
            <div className="flex gap-2">
              <Select value={category} onChange={(e) => setCategory(e.target.value)} className="md:hidden" aria-label="Kategorie">
                <option value="">Alle Kategorien</option>
                {categories.map(([c]) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
              <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sortierung">
                <option value="relevanz">Sortierung: Relevanz</option>
                <option value="titel">Titel A–Z</option>
                <option value="aktualisiert">Zuletzt aktualisiert</option>
                <option value="aufrufe">Meistgelesen</option>
                <option value="hilfreich">Am hilfreichsten</option>
              </Select>
            </div>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {list.map((a) => (
              <li key={a.id}>
                <button type="button" onClick={() => open(a.id)} className={cx('w-full border-b border-slate-200 px-4 py-2.5 text-left hover:bg-white', selected === a.id && 'border-l-4 border-l-sky-500 bg-white')}>
                  <div className="flex items-center gap-2 text-[11px] text-slate-500">
                    <span className="font-mono">{a.id}</span>
                    <span>·</span>
                    <span className="truncate">{a.category}</span>
                    {a.custom && <Badge tone="violet">eigen</Badge>}
                  </div>
                  <div className="mt-0.5 text-sm font-medium text-slate-900">{a.title}</div>
                  <div className="mt-0.5 flex items-center gap-3 text-[11px] text-slate-400">
                    <span>{fmtDate(a.updated)}</span>
                    <span>{a.views} Aufrufe</span>
                    <span>👍 {a.helpful}</span>
                  </div>
                </button>
              </li>
            ))}
            {!list.length && (
              <li>
                <EmptyState icon={<Search size={28} />} title="Nichts gefunden">
                  Andere Suchbegriffe probieren – oder einen neuen Artikel schreiben.
                </EmptyState>
              </li>
            )}
          </ul>
        </section>

        {/* Artikel */}
        <section className={cx('min-h-0 flex-1 overflow-y-auto bg-white', !current && 'hidden lg:block')}>
          {current ? (
            <ArticlePanel article={current} onBack={() => setSelected(undefined)} onEdit={() => setEditor({ article: current })} onDeleted={() => setSelected(undefined)} />
          ) : (
            <EmptyState icon={<FileText size={40} />} title="Artikel auswählen">
              Wähle links einen Artikel aus. Tipp: Verknüpfe hilfreiche Artikel mit deinem aktiven Ticket – das gehört zu guter Dokumentation.
            </EmptyState>
          )}
        </section>
      </div>
      {editor && (
        <KbEditor
          article={editor.article}
          onClose={() => setEditor(null)}
          onSaved={(id) => {
            setEditor(null)
            setSelected(id)
          }}
        />
      )}
    </div>
  )
}

function CatButton({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button type="button" onClick={onClick} className={cx('flex w-full items-center gap-2 px-4 py-1.5 text-left text-sm', active ? 'bg-sky-50 font-medium text-sky-800' : 'text-slate-700 hover:bg-slate-50')}>
      <Folder size={14} className={active ? 'text-sky-600' : 'text-slate-400'} />
      <span className="flex-1 truncate">{label}</span>
      <span className="text-xs text-slate-400">{count}</span>
    </button>
  )
}

function ArticlePanel({ article: a, onBack, onEdit, onDeleted }: { article: KbArticle; onBack: () => void; onEdit: () => void; onDeleted: () => void }) {
  const updateWorld = useStore((s) => s.updateWorld)
  const toast = useStore((s) => s.toast)
  const activeTicket = useStore((s) => (s.activeTicketId ? s.world.tickets.find((t) => t.id === s.activeTicketId) : undefined))
  const [vote, setVote] = useState(votedThisSession.get(a.id))
  const [confirmDelete, setConfirmDelete] = useState(false)
  const linked = !!activeTicket?.linkedKb.includes(a.id)
  const canLink = !!activeTicket && isOpenTicket(activeTicket)

  useEffect(() => setVote(votedThisSession.get(a.id)), [a.id])

  const rate = (v: 'yes' | 'no') => {
    votedThisSession.set(a.id, v)
    setVote(v)
    if (v === 'yes')
      updateWorld((w) => {
        const x = w.kb.find((y) => y.id === a.id)
        if (x) x.helpful += 1
      })
  }

  const link = () => {
    if (!activeTicket || linked) return
    updateWorld(
      (w) => {
        const t = w.tickets.find((x) => x.id === activeTicket.id)
        if (t && !t.linkedKb.includes(a.id)) {
          t.linkedKb.push(a.id)
          t.updatedAt = nowIso()
        }
      },
      { type: A.kbLinked, target: a.id, ticketId: activeTicket.id },
    )
    toast(`${a.id} mit ${activeTicket.id} verknüpft.`, 'success')
  }

  const remove = () => {
    updateWorld((w) => {
      w.kb = w.kb.filter((x) => x.id !== a.id)
    })
    setConfirmDelete(false)
    toast(`${a.id} gelöscht.`, 'info')
    onDeleted()
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-5">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" icon={<ArrowLeft size={14} />} onClick={onBack} className="lg:hidden">
          Zurück
        </Button>
        <div className="flex-1" />
        <Button size="sm" icon={<Link2 size={14} />} onClick={link} disabled={!canLink || linked} title={canLink ? undefined : 'Kein Ticket in Bearbeitung'}>
          {linked ? `Mit ${activeTicket!.id} verknüpft` : canLink ? `Mit ${activeTicket!.id} verknüpfen` : 'Mit aktivem Ticket verknüpfen'}
        </Button>
        <Button size="sm" icon={<Pencil size={14} />} onClick={onEdit}>
          Bearbeiten
        </Button>
        {a.custom && (
          <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => setConfirmDelete(true)} className="text-rose-700">
            Löschen
          </Button>
        )}
      </div>
      <Card bodyClassName="p-5">
        <KbArticleContent article={a} />
      </Card>
      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
        {vote ? (
          <span className="text-slate-600">{vote === 'yes' ? 'Danke für dein Feedback! 👍' : 'Danke! Du kannst den Artikel auch direkt verbessern.'}</span>
        ) : (
          <>
            <span className="font-medium text-slate-700">War das hilfreich?</span>
            <Button size="sm" icon={<ThumbsUp size={14} />} onClick={() => rate('yes')}>
              Ja
            </Button>
            <Button size="sm" icon={<ThumbsDown size={14} />} onClick={() => rate('no')}>
              Nein
            </Button>
          </>
        )}
        {vote === 'no' && (
          <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={onEdit}>
            Artikel verbessern
          </Button>
        )}
      </div>
      {confirmDelete && (
        <Modal
          title="Artikel löschen?"
          onClose={() => setConfirmDelete(false)}
          size="sm"
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                Abbrechen
              </Button>
              <Button variant="danger" onClick={remove}>
                Löschen
              </Button>
            </>
          }
        >
          <p className="text-sm text-slate-700">
            Soll der eigene Artikel „{a.title}“ ({a.id}) endgültig gelöscht werden?
          </p>
        </Modal>
      )}
    </div>
  )
}
