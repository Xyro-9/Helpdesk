// Gesprächsansicht für aktive/gehaltene Anrufe – kompakt (Overlay) und ausführlich (Telefon-Modul)

import { ClipboardList, Pause, PhoneIncoming, PhoneOff, PhoneOutgoing, Play, PhoneCall, Users, Volume2, VolumeX } from 'lucide-react'
import { useStore } from '@/core/store'
import type { Call } from '@/core/types'
import { fmtRelative } from '@/core/util'
import { Badge, Button, cx, IconButton } from '@/ui'
import { acceptCall, declineCall, hangUp, holdCall, linkCallTicket, resumeCall, sayOnCall } from './logic'
import { Avatar, CallTimer, Composer, MessageList, phrasesFor, QuickPhrases, useNow } from './parts'
import { useCommsUi, useIsTyping } from './store'

/** Ticket aus einem Gespräch ohne Ticket anlegen und verknüpfen */
function useCreateTicketFromCall() {
  const createManualTicket = useStore((s) => s.createManualTicket)
  const claimTicket = useStore((s) => s.claimTicket)
  const toast = useStore((s) => s.toast)
  return (call: Call, displayName: string) => {
    const lines = call.transcript.filter((m) => m.from !== 'system').map((m) => `${m.from === 'tech' ? 'Service Desk' : displayName}: ${m.text}`)
    const id = createManualTicket({
      title: `Anruf: ${displayName}`,
      description: `Telefonat mit ${displayName} (${call.number}).\n\nGesprächsverlauf:\n${lines.join('\n') || '(noch kein Verlauf)'}`,
      requester: call.from,
      channel: 'Telefon',
    })
    linkCallTicket(call.id, id)
    claimTicket(id)
    toast(`Ticket ${id} angelegt und übernommen.`, 'success')
  }
}

export function ActiveCallPanel({ callId, compact }: { callId: string; compact?: boolean }) {
  const call = useStore((s) => s.world.calls.find((c) => c.id === callId))
  const user = useStore((s) => (call ? s.world.users.find((u) => u.sam === call.from) : undefined))
  const ticket = useStore((s) => (call?.ticketId ? s.world.tickets.find((t) => t.id === call.ticketId) : undefined))
  const techName = useStore((s) => s.world.tech.name)
  const navigate = useStore((s) => s.navigate)
  const typing = useIsTyping(callId)
  const createTicket = useCreateTicketFromCall()
  if (!call) return null
  const name = user?.displayName ?? call.from
  const held = call.state === 'gehalten'
  const live = call.state === 'aktiv' || held
  const phrases = phrasesFor('call', techName)

  const controls = (
    <div className="flex flex-wrap items-center gap-1.5">
      {held ? (
        <Button size="sm" variant="secondary" icon={<Play size={13} />} onClick={() => resumeCall(call.id)}>
          Fortsetzen
        </Button>
      ) : (
        <Button size="sm" variant="secondary" icon={<Pause size={13} />} onClick={() => holdCall(call.id)} disabled={!live}>
          Halten
        </Button>
      )}
      <Button size="sm" variant="danger" icon={<PhoneOff size={13} />} onClick={() => hangUp(call.id)} disabled={!live}>
        Auflegen
      </Button>
      {ticket ? (
        <Button size="sm" variant="ghost" icon={<ClipboardList size={13} />} onClick={() => navigate('tickets', { id: ticket.id })}>
          {ticket.id}
        </Button>
      ) : (
        <Button size="sm" variant="ghost" icon={<ClipboardList size={13} />} onClick={() => createTicket(call, name)}>
          Ticket erstellen
        </Button>
      )}
      {user && (
        <Button size="sm" variant="ghost" icon={<Users size={13} />} onClick={() => navigate('ad', { sam: user.sam })}>
          Im AD öffnen
        </Button>
      )}
    </div>
  )

  const transcript = (
    <MessageList
      messages={call.transcript}
      userName={name}
      techName={techName}
      typing={typing}
      typingLabel={call.transcript.length === 0 && call.direction === 'ausgehend' ? 'Es klingelt …' : `${name} spricht …`}
      compact={compact}
      className={cx('min-h-0 flex-1 bg-slate-50', compact ? 'max-h-56' : 'min-h-[18rem]')}
    />
  )

  const input = (
    <div className={cx('space-y-1.5 border-t border-slate-200 bg-white', compact ? 'p-2' : 'p-3')}>
      <QuickPhrases phrases={phrases} onPick={(t) => sayOnCall(call.id, t)} disabled={call.state !== 'aktiv'} compact={compact} />
      <Composer onSend={(t) => sayOnCall(call.id, t)} disabled={call.state !== 'aktiv'} compact={compact} placeholder={held ? 'Gespräch wird gehalten …' : 'Was sagen Sie? – Enter sendet'} />
    </div>
  )

  const header = (
    <div className="flex items-center gap-2.5">
      <Avatar name={name} className={compact ? 'h-8 w-8' : undefined} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {call.direction === 'ausgehend' ? <PhoneOutgoing size={13} className="text-slate-400" /> : <PhoneIncoming size={13} className="text-slate-400" />}
          <span className="truncate font-semibold text-slate-900">{name}</span>
        </div>
        <div className="truncate text-xs text-slate-500">
          {call.number}
          {user?.department ? ` · ${user.department}` : ''}
        </div>
      </div>
      <div className="flex flex-col items-end gap-0.5">
        <Badge tone={held ? 'amber' : 'green'}>{held ? 'Gehalten' : 'Aktiv'}</Badge>
        <span className="text-xs text-slate-500">
          <CallTimer call={call} />
        </span>
      </div>
    </div>
  )

  if (compact) {
    return (
      <div className="flex flex-col">
        <div className="space-y-2 border-b border-slate-200 p-2.5">
          {header}
          {controls}
        </div>
        {transcript}
        {input}
      </div>
    )
  }

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="space-y-3 border-b border-slate-200 p-4">
        {header}
        {controls}
      </div>
      <div className="grid lg:grid-cols-[1fr_16rem]">
        <div className="flex min-h-0 flex-col border-slate-200 lg:border-r">
          {transcript}
          {input}
        </div>
        <aside className="space-y-3 p-4 text-sm">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Anrufer</h4>
          {user ? (
            <dl className="space-y-1.5">
              <Row label="Name" value={user.displayName} />
              <Row label="Abteilung" value={user.department} />
              <Row label="Funktion" value={user.title} />
              <Row label="Durchwahl" value={user.phone} />
              {user.mobile && <Row label="Mobil" value={user.mobile} />}
              <Row label="Standort" value={user.homeOffice ? 'Homeoffice' : user.office} />
            </dl>
          ) : (
            <p className="text-slate-500">Rufnummer {call.number} ist keinem Benutzer zugeordnet.</p>
          )}
          <p className="rounded-md bg-amber-50 px-2.5 py-2 text-xs text-amber-900 ring-1 ring-amber-200">Personalnummer und Geburtsdatum bitte selbst im Active Directory nachschlagen und mit den Angaben des Anrufers vergleichen.</p>
          {ticket && (
            <div className="rounded-md border border-slate-200 p-2.5">
              <div className="text-xs text-slate-500">Ticket</div>
              <button type="button" className="text-left text-sm font-medium text-sky-700 hover:underline" onClick={() => navigate('tickets', { id: ticket.id })}>
                {ticket.id}: {ticket.title}
              </button>
            </div>
          )}
        </aside>
      </div>
    </section>
  )
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] gap-2">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="break-words text-slate-800">{value || '–'}</dd>
    </div>
  )
}

/** Klingelnder Anruf mit Annehmen/Ablehnen */
export function RingingCall({ call, floating }: { call: Call; floating?: boolean }) {
  const user = useStore((s) => s.world.users.find((u) => u.sam === call.from))
  const muted = useCommsUi((s) => s.ringMuted)
  const setMuted = useCommsUi((s) => s.setRingMuted)
  useNow(5000)
  const name = user?.displayName ?? 'Unbekannter Anrufer'
  return (
    <div className={cx('pointer-events-auto rounded-xl border border-emerald-200 bg-white p-3', floating ? 'shadow-2xl ring-4 ring-emerald-100' : 'shadow-sm')}>
      <div className="flex items-start gap-3">
        <span className="relative flex h-11 w-11 shrink-0 items-center justify-center">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-60" />
          <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500 text-white">
            <PhoneCall size={20} />
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-medium uppercase tracking-wide text-emerald-700">Eingehender Anruf · {fmtRelative(call.ringingSince)}</div>
          <div className="truncate font-semibold text-slate-900">{name}</div>
          <div className="truncate text-xs text-slate-500">
            {call.number}
            {user ? ` · ${user.department}${user.title ? ` · ${user.title}` : ''}` : ''}
          </div>
        </div>
        <IconButton title={muted ? 'Klingelton einschalten' : 'Klingelton stumm schalten'} onClick={() => setMuted(!muted)} className="h-7 w-7">
          {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
        </IconButton>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="success" icon={<PhoneCall size={15} />} onClick={() => acceptCall(call.id)}>
          Annehmen
        </Button>
        <Button variant="danger" icon={<PhoneOff size={15} />} onClick={() => declineCall(call.id)}>
          Ablehnen
        </Button>
      </div>
    </div>
  )
}
