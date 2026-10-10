// Ticket-Queue (linke Spalte): Filter-Tabs, Suche, Liste mit Priorität/Status/SLA

import { Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useStore } from '@/core/store'
import type { Ticket } from '@/core/types'
import { normalize } from '@/core/util'
import { Badge, Button, cx, Input, Tabs } from '@/ui'
import { byPriorityThenDue, ChannelIcon, isOpen, isPendingCall, PRIORITY_TONE, slaInfo, STATUS_TONE, useNow } from './helpers'

export type QueueTab = 'mine' | 'unassigned' | 'open' | 'resolved' | 'history'

/** Zuletzt gewählter Tab bleibt beim Modulwechsel erhalten */
let rememberedTab: QueueTab = 'open'

export function TicketQueue({ selectedId, onNew }: { selectedId?: string; onNew: () => void }) {
  const tickets = useStore((s) => s.world.tickets)
  const users = useStore((s) => s.world.users)
  const activeId = useStore((s) => s.activeTicketId)
  const navigate = useStore((s) => s.navigate)
  const [tab, setTabState] = useState<QueueTab>(rememberedTab)
  const [q, setQ] = useState('')
  const now = useNow(10_000)
  const setTab = (t: QueueTab) => {
    rememberedTab = t
    setTabState(t)
  }

  const nameOf = useMemo(() => {
    const m = new Map(users.map((u) => [u.sam, u.displayName]))
    return (sam: string) => m.get(sam) ?? sam
  }, [users])

  const groups = useMemo(() => {
    const visible = tickets.filter((t) => !isPendingCall(t))
    const live = visible.filter((t) => !t.historical)
    const open = live.filter(isOpen)
    return {
      mine: open.filter((t) => t.assignee === 'trainee'),
      unassigned: open.filter((t) => !t.assignee),
      open,
      resolved: live.filter((t) => !isOpen(t)),
      history: visible.filter((t) => t.historical),
    } satisfies Record<QueueTab, Ticket[]>
  }, [tickets])

  const list = useMemo(() => {
    const n = normalize(q.trim())
    const base = groups[tab].filter((t) => !n || normalize(`${t.id} ${t.title} ${nameOf(t.requester)} ${t.requester} ${t.category} ${t.description}`).includes(n))
    const sorted = [...base]
    if (tab === 'resolved') sorted.sort((a, b) => (b.resolvedAt ?? b.updatedAt).localeCompare(a.resolvedAt ?? a.updatedAt))
    else if (tab === 'history') sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    else sorted.sort(byPriorityThenDue)
    return sorted
  }, [groups, tab, q, nameOf])

  const count = (n: number) => <span className="rounded-full bg-slate-100 px-1.5 text-[11px] font-medium text-slate-600">{n}</span>

  return (
    <aside className="flex w-[27rem] shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
        <h1 className="text-lg font-semibold text-slate-900">Tickets</h1>
        <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={onNew}>
          Neues Ticket
        </Button>
      </div>
      <Tabs
        className="px-2"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'mine', label: 'Meine offenen', badge: count(groups.mine.length) },
          { id: 'unassigned', label: 'Nicht zugewiesen', badge: count(groups.unassigned.length) },
          { id: 'open', label: 'Alle offenen', badge: count(groups.open.length) },
          { id: 'resolved', label: 'Gelöst/Geschlossen', badge: count(groups.resolved.length) },
          { id: 'history', label: 'Historie', badge: count(groups.history.length) },
        ]}
      />
      <div className="border-b border-slate-100 p-2">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Suche nach ID, Titel, Anforderer …" className="pl-8" />
        </div>
      </div>
      <ul className="flex-1 overflow-y-auto">
        {list.length === 0 && <li className="px-4 py-10 text-center text-sm text-slate-500">Keine Tickets in dieser Ansicht.</li>}
        {list.map((t) => {
          const sla = slaInfo(t, now)
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => navigate('tickets', { id: t.id })}
                className={cx('block w-full border-b border-l-4 border-b-slate-100 px-3 py-2.5 text-left', selectedId === t.id ? 'border-l-sky-500 bg-sky-50' : 'border-l-transparent hover:bg-slate-50')}
              >
                <div className="flex items-center gap-1.5 text-xs">
                  <ChannelIcon channel={t.channel} size={13} className="text-slate-400" />
                  <span className="font-mono font-medium text-slate-600">{t.id}</span>
                  {activeId === t.id && <Badge tone="violet">aktiv</Badge>}
                  <span className="ml-auto flex items-center gap-1">
                    <Badge tone={PRIORITY_TONE[t.priority]}>{t.priority}</Badge>
                    <Badge tone={STATUS_TONE[t.status]}>{t.status}</Badge>
                  </span>
                </div>
                <div className={cx('mt-1 truncate text-sm', t.status === 'Neu' ? 'font-semibold text-slate-900' : 'font-medium text-slate-800')}>{t.title}</div>
                <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                  <span className="truncate">
                    {nameOf(t.requester)} · {t.category}
                    {t.assignee ? ` · ${t.assignee === 'trainee' ? 'Sie' : t.assignee}` : ' · nicht zugewiesen'}
                  </span>
                  <span className="ml-auto shrink-0" title={sla.title}>
                    <Badge tone={sla.tone}>{sla.label}</Badge>
                  </span>
                </div>
              </button>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
