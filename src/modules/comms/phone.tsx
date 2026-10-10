// Telefon-Modul: aktive Gespräche, Anrufliste, verpasste Anrufe, Wählfeld/Telefonbuch

import { Delete, MessageSquare, Phone, PhoneCall, PhoneIncoming, PhoneMissed, PhoneOutgoing } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useStore } from '@/core/store'
import type { AdUser, Call } from '@/core/types'
import { fmtDateTime, fmtRelative } from '@/core/util'
import { Badge, Button, Card, cx, EmptyState, IconButton, Input, PageHeader, tableCls, Tabs, type Tone } from '@/ui'
import { ActiveCallPanel, RingingCall } from './callpanel'
import { callDurationMs, fmtDuration, startChat, startOutgoingCall } from './logic'
import { Avatar, useNow, UserSearch } from './parts'

const STATE_TONE: Record<Call['state'], Tone> = { klingelt: 'sky', aktiv: 'green', gehalten: 'amber', beendet: 'gray', verpasst: 'red' }
const STATE_LABEL: Record<Call['state'], string> = { klingelt: 'Klingelt', aktiv: 'Aktiv', gehalten: 'Gehalten', beendet: 'Beendet', verpasst: 'Verpasst' }

type LogFilter = 'alle' | 'verpasst' | 'eingehend' | 'ausgehend'

export function PhoneView() {
  const calls = useStore((s) => s.world.calls)
  const users = useStore((s) => s.world.users)
  const hotline = useStore((s) => s.world.company.helpdeskPhone)
  const navigate = useStore((s) => s.navigate)
  const [selected, setSelected] = useState<string | undefined>()
  const [filter, setFilter] = useState<LogFilter>('alle')
  useNow(15_000)

  const ringing = useMemo(() => calls.filter((c) => c.state === 'klingelt'), [calls])
  const live = useMemo(() => calls.filter((c) => c.state === 'aktiv' || c.state === 'gehalten'), [calls])
  const missed = useMemo(() => calls.filter((c) => c.state === 'verpasst'), [calls])
  const history = useMemo(
    () =>
      calls.filter((c) => {
        if (filter === 'verpasst') return c.state === 'verpasst'
        if (filter === 'eingehend') return c.direction === 'eingehend'
        if (filter === 'ausgehend') return c.direction === 'ausgehend'
        return true
      }),
    [calls, filter],
  )
  const nameOf = (sam: string) => users.find((u) => u.sam === sam)?.displayName ?? sam
  const current = live.find((c) => c.id === selected) ?? live.find((c) => c.state === 'aktiv') ?? live[0]
  const callBack = (c: Call) => {
    const id = startOutgoingCall(c.from, c.ticketId)
    if (id) setSelected(id)
  }

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader title="Telefon" subtitle={`Service-Desk-Hotline ${hotline}`} icon={<Phone size={20} />} />
      <div className="grid flex-1 gap-4 p-5 xl:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-4">
          {ringing.length > 0 && (
            <div className="grid gap-3 md:grid-cols-2">
              {ringing.map((c) => (
                <RingingCall key={c.id} call={c} />
              ))}
            </div>
          )}

          {live.length > 1 && (
            <Tabs
              tabs={live.map((c) => ({ id: c.id, label: nameOf(c.from), badge: <Badge tone={STATE_TONE[c.state]}>{STATE_LABEL[c.state]}</Badge> }))}
              value={current?.id ?? ''}
              onChange={setSelected}
            />
          )}
          {current ? (
            <ActiveCallPanel key={current.id} callId={current.id} />
          ) : (
            <Card>
              <EmptyState icon={<PhoneCall size={40} />} title="Kein aktives Gespräch">
                Eingehende Anrufe erscheinen unten rechts. Über das Telefonbuch rufen Sie Benutzer zurück.
              </EmptyState>
            </Card>
          )}

          <Card title="Anrufliste" bodyClassName="p-0">
            <Tabs
              className="px-3"
              value={filter}
              onChange={setFilter}
              tabs={[
                { id: 'alle', label: 'Alle' },
                { id: 'verpasst', label: 'Verpasst', badge: missed.length ? <Badge tone="red">{missed.length}</Badge> : undefined },
                { id: 'eingehend', label: 'Eingehend' },
                { id: 'ausgehend', label: 'Ausgehend' },
              ]}
            />
            {history.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-500">Keine Anrufe vorhanden.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className={tableCls}>
                  <thead>
                    <tr>
                      <th />
                      <th>Teilnehmer</th>
                      <th>Zeitpunkt</th>
                      <th>Dauer</th>
                      <th>Zustand</th>
                      <th>Ticket</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((c) => (
                      <tr key={c.id} className={cx(c.state === 'verpasst' && 'bg-rose-50/40')}>
                        <td className="w-8">
                          <DirectionIcon call={c} />
                        </td>
                        <td>
                          <div className="font-medium text-slate-800">{nameOf(c.from)}</div>
                          <div className="text-xs text-slate-500">{c.number}</div>
                        </td>
                        <td className="whitespace-nowrap text-slate-600" title={fmtDateTime(c.ringingSince)}>
                          {fmtRelative(c.ringingSince)}
                        </td>
                        <td className="tabular-nums text-slate-600">{c.startedAt ? fmtDuration(callDurationMs(c)) : '–'}</td>
                        <td>
                          <Badge tone={STATE_TONE[c.state]}>{STATE_LABEL[c.state]}</Badge>
                        </td>
                        <td>
                          {c.ticketId ? (
                            <button type="button" className="font-mono text-xs text-sky-700 hover:underline" onClick={() => navigate('tickets', { id: c.ticketId! })}>
                              {c.ticketId}
                            </button>
                          ) : (
                            <span className="text-slate-400">–</span>
                          )}
                        </td>
                        <td className="text-right">
                          {(c.state === 'verpasst' || c.state === 'beendet') && (
                            <Button size="sm" variant={c.state === 'verpasst' ? 'primary' : 'secondary'} icon={<PhoneOutgoing size={13} />} onClick={() => callBack(c)}>
                              {c.state === 'verpasst' ? 'Zurückrufen' : 'Anrufen'}
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Dialer onCalled={setSelected} />
          <Card title={`Verpasste Anrufe (${missed.length})`} bodyClassName="p-0">
            {missed.length === 0 ? (
              <p className="px-4 py-4 text-sm text-slate-500">Keine verpassten Anrufe.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {missed.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 px-4 py-2">
                    <PhoneMissed size={16} className="text-rose-500" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-800">{nameOf(c.from)}</div>
                      <div className="text-xs text-slate-500">
                        {c.number} · {fmtRelative(c.ringingSince)}
                      </div>
                    </div>
                    <Button size="sm" variant="primary" icon={<PhoneOutgoing size={13} />} onClick={() => callBack(c)}>
                      Zurückrufen
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

function DirectionIcon({ call }: { call: Call }) {
  if (call.state === 'verpasst') return <PhoneMissed size={16} className="text-rose-500" aria-label="Verpasst" />
  if (call.direction === 'ausgehend') return <PhoneOutgoing size={16} className="text-sky-600" aria-label="Ausgehend" />
  return <PhoneIncoming size={16} className="text-emerald-600" aria-label="Eingehend" />
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#']

/** Wählfeld + Telefonbuch (AD-Benutzer) */
function Dialer({ onCalled }: { onCalled: (callId: string) => void }) {
  const navigate = useStore((s) => s.navigate)
  const [number, setNumber] = useState('')
  const [picked, setPicked] = useState<AdUser | undefined>()
  const dial = (target: string) => {
    const id = startOutgoingCall(target)
    if (id) {
      onCalled(id)
      setNumber('')
    }
  }
  const chat = (u: AdUser) => {
    const id = startChat(u.sam)
    if (id) navigate('chat', { id })
  }
  return (
    <Card title="Wählen">
      <div className="space-y-3">
        <div>
          <div className="mb-1 text-xs font-medium text-slate-600">Telefonbuch</div>
          <UserSearch onSelect={setPicked} placeholder="Name oder Abteilung suchen …" onEnterRaw={dial} />
        </div>
        {picked && (
          <div className="flex items-center gap-2.5 rounded-lg border border-slate-200 p-2.5">
            <Avatar name={picked.displayName} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-slate-900">{picked.displayName}</div>
              <div className="truncate text-xs text-slate-500">
                {picked.department} · {picked.phone}
              </div>
            </div>
            <IconButton title="Chat starten" onClick={() => chat(picked)}>
              <MessageSquare size={16} />
            </IconButton>
            <Button size="sm" variant="success" icon={<PhoneCall size={13} />} onClick={() => dial(picked.sam)}>
              Anrufen
            </Button>
          </div>
        )}
        <div>
          <div className="mb-1 text-xs font-medium text-slate-600">Rufnummer</div>
          <div className="flex gap-1.5">
            <Input
              value={number}
              inputMode="tel"
              placeholder="Durchwahl, z. B. 214"
              className="font-mono"
              onChange={(e) => setNumber(e.target.value.replace(/[^\d+*# -]/g, ''))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && number.trim()) dial(number)
              }}
            />
            <IconButton title="Letzte Ziffer löschen" onClick={() => setNumber((n) => n.slice(0, -1))}>
              <Delete size={16} />
            </IconButton>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {KEYS.map((k) => (
              <button key={k} type="button" onClick={() => setNumber((n) => n + k)} className="h-9 rounded-md border border-slate-200 bg-slate-50 font-mono text-sm text-slate-700 hover:bg-slate-100">
                {k}
              </button>
            ))}
          </div>
          <Button variant="success" className="mt-2 w-full" icon={<PhoneCall size={15} />} disabled={!number.trim()} onClick={() => dial(number)}>
            Wählen
          </Button>
        </div>
      </div>
    </Card>
  )
}
