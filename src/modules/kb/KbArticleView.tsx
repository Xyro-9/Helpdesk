// Platzhalter – Anzeige eines KB-Artikels (wird vom KB-Modul implementiert, auch im Browser-Intranet genutzt)
import { Markdown } from '@/ui'
import { useStore } from '@/core/store'

export function KbArticleView({ id }: { id: string }) {
  const a = useStore((s) => s.world.kb.find((k) => k.id === id))
  if (!a) return <div className="text-sm text-slate-500">Artikel {id} nicht gefunden.</div>
  return <Markdown text={a.body} />
}
