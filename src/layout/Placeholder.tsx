import { Construction } from 'lucide-react'
import { EmptyState, PageHeader } from '@/ui'

export function Placeholder({ title }: { title: string }) {
  return (
    <div className="flex h-full flex-col">
      <PageHeader title={title} />
      <EmptyState icon={<Construction size={40} />} title="Dieses Modul wird gerade gebaut">
        Der Bereich „{title}“ ist in Arbeit und erscheint in einer der nächsten Versionen.
      </EmptyState>
    </div>
  )
}
