// Editor für KB-Artikel (neu / bearbeiten) mit Live-Vorschau

import { useMemo, useState } from 'react'
import { A } from '@/core/actions'
import { CATEGORIES } from '@/core/scenarios/engine'
import { useStore } from '@/core/store'
import type { KbArticle } from '@/core/types'
import { nowIso } from '@/core/util'
import { Button, Field, Input, Markdown, Modal, Tabs, Textarea } from '@/ui'

/** Eigener Aktionstyp für Bearbeitungen (Vorschlag: in core/actions.ts als A.kbUpdated ergänzen) */
export const KB_UPDATED = 'kb.updated'

const TEMPLATE = `# Titel des Problems

## Symptom
- Was sieht der Benutzer? (Fehlermeldung wörtlich)

## Ursache
Kurze Erklärung.

## Lösung
1. Erster Schritt
2. Zweiter Schritt (\`Befehl\`)

> Hinweis: Was ist zu beachten (z. B. Identitätsprüfung)?
`

export const nextKbId = (kb: KbArticle[]) => {
  const max = kb.reduce((m, a) => {
    const n = /^KB(\d+)$/i.exec(a.id)
    return n ? Math.max(m, Number(n[1])) : m
  }, 0)
  return `KB${String(max + 1).padStart(4, '0')}`
}

export function KbEditor({ article, onClose, onSaved }: { article?: KbArticle; onClose: () => void; onSaved: (id: string) => void }) {
  const kb = useStore((s) => s.world.kb)
  const techName = useStore((s) => s.world.tech.name)
  const updateWorld = useStore((s) => s.updateWorld)
  const toast = useStore((s) => s.toast)
  const [title, setTitle] = useState(article?.title ?? '')
  const [category, setCategory] = useState(article?.category ?? 'Konto & Zugriff')
  const [tags, setTags] = useState(article?.tags.join(', ') ?? '')
  const [body, setBody] = useState(article?.body ?? TEMPLATE)
  const [tab, setTab] = useState<'edit' | 'preview'>('edit')
  const [error, setError] = useState('')
  const categories = useMemo(() => [...new Set([...CATEGORIES, ...kb.map((a) => a.category)])], [kb])

  const save = () => {
    if (title.trim().length < 5) return setError('Bitte einen aussagekräftigen Titel angeben (mind. 5 Zeichen).')
    if (!category.trim()) return setError('Bitte eine Kategorie wählen.')
    if (body.trim().length < 30) return setError('Der Inhalt ist zu kurz – beschreibe Symptom, Ursache und Lösung.')
    const tagList = [...new Set(tags.split(/[,;]/).map((t) => t.trim()).filter(Boolean))]
    if (article) {
      updateWorld(
        (w) => {
          const a = w.kb.find((x) => x.id === article.id)
          if (!a) return
          a.title = title.trim()
          a.category = category.trim()
          a.tags = tagList
          a.body = body
          a.updated = nowIso()
        },
        { type: KB_UPDATED, target: article.id, detail: title.trim() },
      )
      toast(`${article.id} gespeichert.`, 'success')
      onSaved(article.id)
    } else {
      const id = nextKbId(kb)
      updateWorld(
        (w) => {
          w.kb.push({ id, title: title.trim(), category: category.trim(), tags: tagList, body, author: techName, updated: nowIso(), views: 0, helpful: 0, custom: true })
        },
        { type: A.kbCreated, target: id, detail: title.trim() },
      )
      toast(`Artikel ${id} veröffentlicht.`, 'success')
      onSaved(id)
    }
  }

  return (
    <Modal
      title={article ? `Artikel ${article.id} bearbeiten` : 'Neuer KB-Artikel'}
      onClose={onClose}
      size="xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button variant="primary" onClick={save}>
            {article ? 'Speichern' : 'Veröffentlichen'}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr]">
        <Field label="Titel">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Outlook fragt ständig nach dem Kennwort" autoFocus />
        </Field>
        <Field label="Kategorie">
          <Input value={category} onChange={(e) => setCategory(e.target.value)} list="kb-categories" />
          <datalist id="kb-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Schlagwörter (kommagetrennt)">
          <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Outlook, Kennwort, Cloud" />
        </Field>
      </div>
      <Tabs
        className="mt-4 lg:hidden"
        tabs={[
          { id: 'edit', label: 'Bearbeiten' },
          { id: 'preview', label: 'Vorschau' },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <div className={tab === 'preview' ? 'hidden lg:block' : ''}>
          <div className="mb-1 text-xs font-medium text-slate-600">Inhalt (Markdown)</div>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={18} className="font-mono text-xs" spellCheck />
          <p className="mt-1 text-xs text-slate-500">
            Formatierung: <code># Überschrift</code>, <code>## Abschnitt</code>, <code>- Liste</code>, <code>1. Schritt</code>, <code>**fett**</code>, <code>`Befehl`</code>, <code>&gt; Hinweis</code>, <code>```</code> Codeblock <code>```</code>
          </p>
        </div>
        <div className={tab === 'edit' ? 'hidden lg:block' : ''}>
          <div className="mb-1 text-xs font-medium text-slate-600">Vorschau</div>
          <div className="h-[calc(18*1.6em+1rem)] overflow-y-auto rounded-md border border-slate-200 bg-slate-50/50 px-4 py-2">
            <Markdown text={body} />
          </div>
        </div>
      </div>
      {error && <div className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-200">{error}</div>}
    </Modal>
  )
}
