// Chat-Modul: Unterhaltungen mit Benutzern (Firmen-Chat)

import { ClipboardList, Lock, MessageSquare, MessageSquarePlus, PhoneCall, Search, LockOpen, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useStore } from '@/core/store'
import type { ChatThread } from '@/core/types'
import { fmtRelative, normalize } from '@/core/util'
import { Badge, Button, cx, EmptyState, Input, Modal, PageHeader } from '@/ui'
import { closeChat, linkChatTicket, markChatRead, reopenChat, sendChat, startChat, startOutgoingCall } from './logic'
import { Avatar, Composer, MessageList, phrasesFor, QuickPhrases, UserSearch } from './parts'
import { useIsTyping } from './store'

const lastTime = (c: ChatThread) => c.messages[c.messages.length - 1]?.time ?? ''

export function ChatView() {
  const chats = useStore((s) => s.world.chats)
  const users = useStore((s) => s.world.users)
  const paramId = useStore((s) => s.ui.params.id)
  const navigate = useStore((s) => s.navigate)
  const [showNew, setShowNew] = useState(false)
  const [q, setQ] = useState('')

  const nameOf = useMemo(() => {
    const map = new Map(users.map((u) => [u.sam, u.displayName]))
    return (sam: string) => map.get(sam) ?? sam
  }, [users])
  const sorted = useMemo(() => [...chats].sort((a, b) => Number(b.open) - Number(a.open) || lastTime(b).localeCompare(lastTime(a))), [chats])
  const visible = useMemo(() => {
    const n = normalize(q.trim())
    return n ? sorted.filter((c) => normalize(`${nameOf(c.with)} ${c.with} ${c.ticketId ?? ''}`).includes(n)) : sorted
  }, [sorted, q, nameOf])
  const selected = chats.find((c) => c.id === paramId) ?? sorted[0]

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Chat"
        subtitle="Firmen-Chat mit Benutzern"
        icon={<MessageSquare size={20} />}
        actions={
          <Button variant="primary" icon={<MessageSquarePlus size={15} />} onClick={() => setShowNew(true)}>
            Neuer Chat
          </Button>
        }
      />
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-80 shrink-0 flex-col border-r border-slate-200 bg-white">
          <div className="border-b border-slate-100 p-2">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-slate-400" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chats durchsuchen …" className="pl-8" />
            </div>
          </div>
          <ul className="flex-1 overflow-y-auto">
            {visible.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-500">Keine Chats vorhanden.</li>}
            {visible.map((c) => {
              const last = [...c.messages].reverse().find((m) => m.from !== 'system')
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => navigate('chat', { id: c.id })}
                    className={cx('flex w-full items-start gap-2.5 border-b border-slate-100 px-3 py-2.5 text-left', selected?.id === c.id ? 'bg-sky-50' : 'hover:bg-slate-50', !c.open && 'opacity-70')}
                  >
                    <Avatar name={nameOf(c.with)} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className={cx('truncate text-sm text-slate-900', c.unread > 0 ? 'font-bold' : 'font-medium')}>{nameOf(c.with)}</span>
                        {!c.open && <Badge>geschlossen</Badge>}
                        <span className="ml-auto shrink-0 text-[11px] text-slate-400">{fmtRelative(lastTime(c))}</span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5">
                        <span className={cx('truncate text-xs', c.unread > 0 ? 'font-semibold text-slate-800' : 'text-slate-500')}>
                          {last ? `${last.from === 'tech' ? 'Sie: ' : ''}${last.text}` : 'Noch keine Nachrichten'}
                        </span>
                        {c.unread > 0 && <span className="ml-auto shrink-0 rounded-full bg-sky-600 px-1.5 text-[11px] font-semibold text-white">{c.unread}</span>}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </aside>
        <section className="flex min-w-0 flex-1 flex-col bg-slate-50">
          {selected ? (
            <ChatThreadView key={selected.id} thread={selected} />
          ) : (
            <EmptyState icon={<MessageSquare size={40} />} title="Kein Chat ausgewählt">
              Chats von Benutzern erscheinen hier. Über „Neuer Chat“ schreiben Sie einen Benutzer selbst an.
            </EmptyState>
          )}
        </section>
      </div>
      {showNew && (
        <Modal title="Neuer Chat" onClose={() => setShowNew(false)} size="sm">
          <p className="mb-2 text-sm text-slate-600">Mit welchem Benutzer möchten Sie chatten?</p>
          <UserSearch
            autoFocus
            onSelect={(u) => {
              const id = startChat(u.sam)
              setShowNew(false)
              if (id) navigate('chat', { id })
            }}
          />
        </Modal>
      )}
    </div>
  )
}

function ChatThreadView({ thread }: { thread: ChatThread }) {
  const user = useStore((s) => s.world.users.find((u) => u.sam === thread.with))
  const ticket = useStore((s) => (thread.ticketId ? s.world.tickets.find((t) => t.id === thread.ticketId) : undefined))
  const techName = useStore((s) => s.world.tech.name)
  const navigate = useStore((s) => s.navigate)
  const createManualTicket = useStore((s) => s.createManualTicket)
  const claimTicket = useStore((s) => s.claimTicket)
  const toast = useStore((s) => s.toast)
  const typing = useIsTyping(thread.id)
  const name = user?.displayName ?? thread.with

  // Beim Öffnen (und bei neuen Nachrichten im geöffneten Chat) als gelesen markieren
  useEffect(() => {
    if (thread.unread > 0) markChatRead(thread.id)
  }, [thread.id, thread.unread])

  const createTicket = () => {
    const msgs = thread.messages.filter((m) => m.from !== 'system')
    const first = msgs.find((m) => m.from === 'user')?.text ?? `Chat mit ${name}`
    const id = createManualTicket({
      title: first.length > 70 ? `${first.slice(0, 67)}…` : first,
      description: `Anfrage per Chat von ${name}.\n\nChatverlauf:\n${msgs.map((m) => `${m.from === 'tech' ? 'Service Desk' : name}: ${m.text}`).join('\n')}`,
      requester: thread.with,
      channel: 'Chat',
    })
    linkChatTicket(thread.id, id)
    claimTicket(id)
    toast(`Ticket ${id} angelegt und übernommen.`, 'success')
  }

  return (
    <>
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5">
        <Avatar name={name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold text-slate-900">{name}</span>
            <Badge tone={thread.open ? 'green' : 'gray'}>{thread.open ? 'offen' : 'geschlossen'}</Badge>
          </div>
          <div className="truncate text-xs text-slate-500">{user ? [user.title, user.department, user.phone].filter(Boolean).join(' · ') : thread.with}</div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {ticket ? (
            <Button size="sm" icon={<ClipboardList size={13} />} onClick={() => navigate('tickets', { id: ticket.id })}>
              Ticket {ticket.id}
            </Button>
          ) : (
            <Button size="sm" icon={<ClipboardList size={13} />} onClick={createTicket}>
              Ticket erstellen
            </Button>
          )}
          {user && (
            <>
              <Button size="sm" variant="ghost" icon={<Users size={13} />} onClick={() => navigate('ad', { sam: user.sam })}>
                Im AD öffnen
              </Button>
              <Button size="sm" variant="ghost" icon={<PhoneCall size={13} />} onClick={() => startOutgoingCall(user.sam, thread.ticketId)}>
                Anrufen
              </Button>
            </>
          )}
          {thread.open ? (
            <Button size="sm" variant="ghost" icon={<Lock size={13} />} onClick={() => closeChat(thread.id)}>
              Chat schließen
            </Button>
          ) : (
            <Button size="sm" variant="ghost" icon={<LockOpen size={13} />} onClick={() => reopenChat(thread.id)}>
              Wieder öffnen
            </Button>
          )}
        </div>
      </header>
      <MessageList messages={thread.messages} userName={name} techName={techName} typing={typing} className="min-h-0 flex-1" />
      <div className="space-y-2 border-t border-slate-200 bg-white p-3">
        <QuickPhrases phrases={phrasesFor('chat', techName)} onPick={(t) => sendChat(thread.id, t)} disabled={!thread.open} />
        <Composer onSend={(t) => sendChat(thread.id, t)} disabled={!thread.open} placeholder={thread.open ? 'Nachricht schreiben – Enter sendet' : 'Der Chat ist geschlossen.'} autoFocus />
      </div>
    </>
  )
}
