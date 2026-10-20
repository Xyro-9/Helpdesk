// Ticket-Modul: Queue (links) und Detailansicht (rechts)

import { ClipboardList } from 'lucide-react'
import { useState } from 'react'
import { useStore } from '@/core/store'
import { EmptyState } from '@/ui'
import { TicketDetail } from './detail'
import { NewTicketDialog } from './dialogs'
import { TicketQueue } from './queue'

export function TicketsView() {
  const id = useStore((s) => s.ui.params.id)
  const [showNew, setShowNew] = useState(false)
  return (
    <div className="flex h-full min-h-0">
      <TicketQueue selectedId={id} onNew={() => setShowNew(true)} />
      <div className="min-w-0 flex-1 overflow-y-auto bg-slate-50">
        {id ? (
          <TicketDetail key={id} id={id} />
        ) : (
          <EmptyState icon={<ClipboardList size={40} />} title="Kein Ticket ausgewählt">
            Wählen Sie links ein Ticket aus der Queue oder legen Sie über „Neues Ticket“ eine Anfrage an (z. B. bei Walk-ins).
          </EmptyState>
        )}
      </div>
      {showNew && <NewTicketDialog onClose={() => setShowNew(false)} />}
    </div>
  )
}
