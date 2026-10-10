// Ticket-Detailansicht (rechte Spalte)

import { ArrowUpRight, BookOpen, CircleCheck, ClipboardList, FileText, History, Lightbulb, ListChecks, Mail, MessageSquare, Monitor, Paperclip, Phone, PhoneCall, Pin, Send, StickyNote, Trophy, UserCheck, Users, X } from 'lucide-react'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { A } from '@/core/actions'
import { primaryComputerOf } from '@/core/ops/ad'
import { CATEGORIES, getScenario, priorityFrom, recalcSla } from '@/core/scenarios/engine'
import { useStore } from '@/core/store'
import type { ActionEntry, AdUser, AssignmentGroup, Ticket, TicketCategory, TicketKind, TicketStatus } from '@/core/types'
import { fmtDateTime, fmtRelative, nowIso, uid } from '@/core/util'
import { sendMail, startChat, startOutgoingCall } from '@/modules/comms'
import { Badge, Button, Card, Checkbox, cx, EmptyState, Field, Select, Textarea } from '@/ui'
import { AttachmentDialog, EscalateDialog, HintDialog, KbLinkDialog, PreCheckDialog, ResolveDialog } from './dialogs'
import { ACTION_LABEL, ChannelIcon, GROUPS, IMPACT_LABEL, isOpen, isPendingCall, KINDS, PRIORITY_TONE, slaInfo, STATUS_TONE, URGENCY_LABEL, useNow, useTicketUpdate, WORK_STATUSES } from './helpers'

type DialogKind = 'resolve' | 'escalate' | 'kb' | 'hint' | 'precheck'

export function TicketDetail({ id }: { id: string }) {
  const ticket = useStore((s) => s.world.tickets.find((t) => t.id === id))
  const requester = useStore((s) => (ticket ? s.world.users.find((u) => u.sam === ticket.requester) : undefined))
  const custom = useStore((s) => s.customScenarios)
  const hintsEnabled = useStore((s) => s.settings.hintsEnabled)
  const allowPreCheck = useStore((s) => s.settings.allowPreCheck)
  const activeId = useStore((s) => s.activeTicketId)
  const actionLog = useStore((s) => s.world.actionLog)
  const claimTicket = useStore((s) => s.claimTicket)
  const setActiveTicket = useStore((s) => s.setActiveTicket)
  const showReport = useStore((s) => s.showReport)
  const update = useTicketUpdate(id)
  const [dialog, setDialog] = useState<DialogKind | null>(null)
  const [attachment, setAttachment] = useState<{ name: string; content: string } | null>(null)

  const scenarioId = ticket?.scenarioCtx ? ticket.scenarioId : undefined
  const scenario = useMemo(() => getScenario(scenarioId, custom), [scenarioId, custom])
  const log = useMemo(() => actionLog.filter((a) => a.ticketId === id), [actionLog, id])
  const usedHints = useMemo(() => log.filter((a) => a.type === A.hintUsed).map((a) => a.detail ?? ''), [log])

  if (!ticket) {
    return (
      <EmptyState icon={<ClipboardList size={40} />} title="Ticket nicht gefunden">
        Das Ticket {id} existiert nicht (mehr).
      </EmptyState>
    )
  }
  const pending = isPendingCall(ticket)
  const open = isOpen(ticket)
  const editable = open && !ticket.historical && !pending
  const hintsLeft = scenario ? Math.max(0, scenario.hints.length - (ticket.scenarioCtx?.hintsUsed ?? 0)) : 0
  const closeTicket = () => update((t) => void (t.status = 'Geschlossen'), { type: A.ticketStatus, detail: 'Geschlossen' })

  return (
    <div className="flex min-h-full flex-col">
      {/* Kopf */}
      <div className="border-b border-slate-200 bg-white px-5 py-3">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 text-sm">
              <ChannelIcon channel={ticket.channel} size={15} className="text-slate-400" />
              <span className="font-mono font-semibold text-slate-700">{ticket.id}</span>
              <Badge tone={STATUS_TONE[ticket.status]}>{ticket.status}</Badge>
              <Badge tone={PRIORITY_TONE[ticket.priority]}>{ticket.priority}</Badge>
              <Badge>{ticket.kind}</Badge>
              {scenario && <Badge tone="violet">Training</Badge>}
              {ticket.historical && <Badge>Historie</Badge>}
              {activeId === ticket.id && <Badge tone="violet">Aktives Ticket</Badge>}
            </div>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">{ticket.title}</h2>
            <div className="text-xs text-slate-500">
              Erstellt {fmtDateTime(ticket.createdAt)} ({fmtRelative(ticket.createdAt)}) über {ticket.channel} · Bearbeiter: {ticket.assignee === 'trainee' ? 'Sie' : (ticket.assignee ?? 'nicht zugewiesen')} · {ticket.assignmentGroup}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {editable && ticket.assignee !== 'trainee' && (
              <Button variant="primary" size="sm" icon={<UserCheck size={14} />} onClick={() => claimTicket(ticket.id)}>
                Übernehmen
              </Button>
            )}
            {editable && activeId !== ticket.id && (
              <Button size="sm" icon={<Pin size={14} />} onClick={() => setActiveTicket(ticket.id)}>
                Als aktives Ticket
              </Button>
            )}
            {editable && hintsEnabled && scenario && (
              <Button size="sm" icon={<Lightbulb size={14} />} onClick={() => setDialog('hint')} title="Tipps kosten jeweils 2 Punkte">
                Tipp ({hintsLeft} übrig)
              </Button>
            )}
            {editable && allowPreCheck && scenario && (
              <Button size="sm" icon={<ListChecks size={14} />} onClick={() => setDialog('precheck')}>
                Zwischenstand prüfen
              </Button>
            )}
            {editable && (
              <Button size="sm" icon={<ArrowUpRight size={14} />} onClick={() => setDialog('escalate')}>
                Eskalieren
              </Button>
            )}
            {editable && (
              <Button size="sm" variant="success" icon={<CircleCheck size={14} />} onClick={() => setDialog('resolve')}>
                Lösen
              </Button>
            )}
            {!ticket.historical && ticket.status === 'Gelöst' && (
              <Button size="sm" onClick={closeTicket}>
                Schließen
              </Button>
            )}
            {ticket.score && (
              <Button size="sm" variant="primary" icon={<Trophy size={14} />} onClick={() => showReport(ticket.id)}>
                Bericht anzeigen
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="@container flex-1 p-5">
        <div className="grid gap-4 @4xl:grid-cols-[minmax(0,1fr)_20rem]">
          {/* Hauptspalte */}
          <div className="min-w-0 space-y-4">
            {pending && <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">Dieser Anruf wurde noch nicht angenommen. Nehmen Sie den Anruf an, um das Ticket zu bearbeiten.</div>}

            <Card title="Beschreibung">
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-800">{ticket.description}</p>
              {ticket.attachments.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                  {ticket.attachments.map((a, i) => (
                    <button key={`${a.name}-${i}`} type="button" onClick={() => setAttachment(a)} className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100">
                      <Paperclip size={13} />
                      <span className="font-medium">{a.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </Card>

            {!open && <ResolutionCard ticket={ticket} onReport={() => showReport(ticket.id)} />}

            {usedHints.length > 0 && (
              <Card title={`Genutzte Tipps (${usedHints.length})`}>
                <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-800">
                  {usedHints.map((h, i) => (
                    <li key={i}>{h}</li>
                  ))}
                </ol>
              </Card>
            )}

            <WorkNotesCard ticket={ticket} editable={editable} />
            <CommentsCard ticket={ticket} requester={requester} editable={editable} />
            <TimelineCard ticket={ticket} log={log} />
          </div>

          {/* Seitenspalte */}
          <div className="order-first min-w-0 space-y-4 @4xl:order-none">
            <RequesterCard ticket={ticket} requester={requester} />
            <TriageCard ticket={ticket} editable={editable} />
            <KbCard ticket={ticket} editable={!ticket.historical} onLink={() => setDialog('kb')} />
            <LinkedCommsCard ticketId={ticket.id} />
          </div>
        </div>
      </div>

      {dialog === 'resolve' && <ResolveDialog ticket={ticket} requester={requester} onClose={() => setDialog(null)} />}
      {dialog === 'escalate' && <EscalateDialog ticket={ticket} onClose={() => setDialog(null)} />}
      {dialog === 'kb' && <KbLinkDialog ticket={ticket} onClose={() => setDialog(null)} />}
      {dialog === 'hint' && scenario && <HintDialog ticket={ticket} scenario={scenario} usedHints={usedHints} onClose={() => setDialog(null)} />}
      {dialog === 'precheck' && scenario && <PreCheckDialog ticket={ticket} scenario={scenario} onClose={() => setDialog(null)} />}
      {attachment && <AttachmentDialog name={attachment.name} content={attachment.content} onClose={() => setAttachment(null)} />}
    </div>
  )
}

// ─────────────── Anforderer ───────────────

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] gap-2 text-sm">
      <dt className="text-xs leading-5 text-slate-500">{label}</dt>
      <dd className="min-w-0 break-words text-slate-800">{children || '–'}</dd>
    </div>
  )
}

function RequesterCard({ ticket, requester }: { ticket: Ticket; requester?: AdUser }) {
  const pc = useStore((s) => (requester ? primaryComputerOf(s.world, requester.sam) : undefined))
  const navigate = useStore((s) => s.navigate)
  const openRdp = useStore((s) => s.openRdp)
  if (!requester) {
    return (
      <Card title="Anforderer">
        <p className="text-sm text-slate-600">
          <span className="font-mono">{ticket.requester}</span> ist kein Benutzer im Active Directory.
        </p>
      </Card>
    )
  }
  const location = requester.homeOffice ? `Homeoffice${requester.homeAddress?.city ? ` (${requester.homeAddress.city})` : ''}` : requester.office
  return (
    <Card title="Anforderer">
      <div className="mb-3">
        <div className="font-semibold text-slate-900">{requester.displayName}</div>
        <div className="text-xs text-slate-500">
          {requester.title} · {requester.department}
        </div>
      </div>
      <dl className="space-y-1.5">
        <Info label="Benutzer">
          <span className="font-mono text-xs">{requester.sam}</span>
          {!requester.enabled && (
            <Badge tone="red" className="ml-1.5">
              deaktiviert
            </Badge>
          )}
        </Info>
        <Info label="Telefon">
          {requester.phone}
          {requester.mobile ? <div className="text-xs text-slate-500">mobil {requester.mobile}</div> : null}
        </Info>
        <Info label="E-Mail">{requester.mail}</Info>
        <Info label="Standort">{location}</Info>
        <Info label="Primärer PC">{pc ? `${pc.name} (${pc.os})` : 'keiner zugeordnet'}</Info>
      </dl>
      <div className="mt-3 grid grid-cols-2 gap-1.5">
        <Button size="sm" icon={<Users size={13} />} onClick={() => navigate('ad', { sam: requester.sam })}>
          Im AD öffnen
        </Button>
        <Button size="sm" icon={<Monitor size={13} />} disabled={!pc} onClick={() => pc && openRdp(pc.name)} title={pc ? `Remote-Desktop zu ${pc.name}` : 'Kein PC zugeordnet'}>
          Remote-Desktop
        </Button>
        <Button size="sm" icon={<PhoneCall size={13} />} onClick={() => startOutgoingCall(requester.sam, ticket.id)}>
          Anrufen
        </Button>
        <Button
          size="sm"
          icon={<MessageSquare size={13} />}
          onClick={() => {
            const chatId = startChat(requester.sam, ticket.id)
            if (chatId) navigate('chat', { id: chatId })
          }}
        >
          Chat
        </Button>
      </div>
    </Card>
  )
}

// ─────────────── Triage ───────────────

function PriorityMatrix({ impact, urgency }: { impact: 1 | 2 | 3; urgency: 1 | 2 | 3 }) {
  const levels = [1, 2, 3] as const
  const cellTone: Record<string, string> = { P1: 'bg-rose-100 text-rose-800', P2: 'bg-amber-100 text-amber-800', P3: 'bg-sky-100 text-sky-800', P4: 'bg-slate-100 text-slate-700' }
  return (
    <table className="w-full table-fixed text-center text-[11px]">
      <thead>
        <tr className="text-slate-500">
          <th className="w-16 text-left font-normal">Ausw. ↓ / Dringl. →</th>
          {levels.map((u) => (
            <th key={u} className="font-medium">
              {u}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {levels.map((i) => (
          <tr key={i}>
            <th className="text-left font-medium text-slate-500">{i}</th>
            {levels.map((u) => {
              const p = priorityFrom(i, u).split(' ')[0]
              const current = i === impact && u === urgency
              return (
                <td key={u} className="p-0.5">
                  <div className={cx('rounded py-0.5 font-semibold', cellTone[p], current && 'ring-2 ring-slate-800')}>{p}</div>
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function TriageCard({ ticket, editable }: { ticket: Ticket; editable: boolean }) {
  const update = useTicketUpdate(ticket.id)
  const now = useNow(10_000)
  const sla = slaInfo(ticket, now)
  const setMatrix = (impact: 1 | 2 | 3, urgency: 1 | 2 | 3) => {
    const p = priorityFrom(impact, urgency)
    update(
      (t) => {
        t.impact = impact
        t.urgency = urgency
        t.priority = p
        recalcSla(t)
      },
      { type: A.ticketUpdated, detail: `Auswirkung ${impact}, Dringlichkeit ${urgency} → ${p}` },
    )
  }
  const statusOptions = WORK_STATUSES.includes(ticket.status) ? WORK_STATUSES : [ticket.status]
  return (
    <Card title="Klassifizierung">
      <div className="space-y-2.5">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Typ">
            <Select value={ticket.kind} disabled={!editable} onChange={(e) => update((t) => void (t.kind = e.target.value as TicketKind), { type: A.ticketUpdated, detail: `Typ: ${e.target.value}` })}>
              {KINDS.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={ticket.status} disabled={!editable} onChange={(e) => update((t) => void (t.status = e.target.value as TicketStatus), { type: A.ticketStatus, detail: e.target.value })}>
              {statusOptions.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Kategorie">
          <Select value={ticket.category} disabled={!editable} onChange={(e) => update((t) => void (t.category = e.target.value as TicketCategory), { type: A.ticketUpdated, detail: `Kategorie: ${e.target.value}` })}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Auswirkung">
          <Select value={ticket.impact} disabled={!editable} onChange={(e) => setMatrix(Number(e.target.value) as 1 | 2 | 3, ticket.urgency)}>
            {([1, 2, 3] as const).map((v) => (
              <option key={v} value={v}>
                {IMPACT_LABEL[v]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Dringlichkeit">
          <Select value={ticket.urgency} disabled={!editable} onChange={(e) => setMatrix(ticket.impact, Number(e.target.value) as 1 | 2 | 3)}>
            {([1, 2, 3] as const).map((v) => (
              <option key={v} value={v}>
                {URGENCY_LABEL[v]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2.5 py-2">
          <span className="text-xs text-slate-500">Priorität (berechnet)</span>
          <Badge tone={PRIORITY_TONE[ticket.priority]}>{ticket.priority}</Badge>
        </div>
        <details className="rounded-md border border-slate-200 px-2.5 py-1.5">
          <summary className="cursor-pointer text-xs text-slate-600">Prioritätsmatrix (Auswirkung × Dringlichkeit)</summary>
          <div className="mt-2">
            <PriorityMatrix impact={ticket.impact} urgency={ticket.urgency} />
          </div>
        </details>
        <Field label="Zuweisungsgruppe">
          <Select value={ticket.assignmentGroup} disabled={!editable} onChange={(e) => update((t) => void (t.assignmentGroup = e.target.value as AssignmentGroup), { type: A.ticketUpdated, detail: `Zuweisungsgruppe: ${e.target.value}` })}>
            {GROUPS.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </Select>
        </Field>
        <div className="space-y-1 border-t border-slate-100 pt-2.5 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500">SLA</span>
            <span title={sla.title}>
              <Badge tone={sla.tone}>{sla.label}</Badge>
            </span>
          </div>
          <div className="flex justify-between gap-2 text-slate-600">
            <span>Reaktion fällig</span>
            <span>{fmtDateTime(ticket.slaResponseDue)}</span>
          </div>
          <div className="flex justify-between gap-2 text-slate-600">
            <span>Erste Reaktion</span>
            <span>{ticket.firstResponseAt ? fmtDateTime(ticket.firstResponseAt) : 'noch keine'}</span>
          </div>
          <div className="flex justify-between gap-2 text-slate-600">
            <span>Lösung fällig</span>
            <span>{fmtDateTime(ticket.slaResolveDue)}</span>
          </div>
        </div>
      </div>
    </Card>
  )
}

// ─────────────── Arbeitsnotizen ───────────────

const NOTE_TEMPLATES = [
  { label: 'Symptom', text: 'Symptom: ' },
  { label: 'Ursache', text: 'Ursache: ' },
  { label: 'Maßnahmen', text: 'Maßnahmen: ' },
  { label: 'Lösung', text: 'Lösung: ' },
  { label: 'Vorlage komplett', text: 'Symptom: \nUrsache: \nLösung: ' },
]

function WorkNotesCard({ ticket, editable }: { ticket: Ticket; editable: boolean }) {
  const techName = useStore((s) => s.world.tech.name)
  const update = useTicketUpdate(ticket.id)
  const [text, setText] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)
  const notes = useMemo(() => [...ticket.workNotes].reverse(), [ticket.workNotes])
  const insert = (snippet: string) => {
    const next = (text && !text.endsWith('\n') ? `${text}\n` : text) + snippet
    setText(next)
    requestAnimationFrame(() => {
      const el = wrapRef.current?.querySelector('textarea')
      if (!el) return
      el.focus()
      const pos = snippet.includes('\n') ? next.length - snippet.length + snippet.indexOf(':') + 2 : next.length
      el.setSelectionRange(pos, pos)
    })
  }
  const save = () => {
    const t = text.trim()
    if (!t) return
    update((tk) => void tk.workNotes.push({ id: uid('n'), author: techName, text: t, time: nowIso() }), { type: A.ticketWorkNote, detail: t.slice(0, 300) })
    setText('')
  }
  return (
    <Card title={`Arbeitsnotizen (intern) · ${ticket.workNotes.length}`} actions={<StickyNote size={15} className="text-slate-400" />}>
      {editable && (
        <div className="mb-4 space-y-2">
          <div className="flex flex-wrap gap-1">
            {NOTE_TEMPLATES.map((n) => (
              <button key={n.label} type="button" onClick={() => insert(n.text)} className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs text-slate-600 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700">
                + {n.label}
              </button>
            ))}
          </div>
          <div ref={wrapRef}>
            <Textarea
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Was wurde festgestellt bzw. getan? (nur intern sichtbar) – Strg+Enter speichert"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault()
                  save()
                }
              }}
            />
          </div>
          <div className="flex justify-end">
            <Button size="sm" variant="primary" icon={<StickyNote size={13} />} disabled={!text.trim()} onClick={save}>
              Notiz speichern
            </Button>
          </div>
        </div>
      )}
      {notes.length === 0 ? (
        <p className="text-sm text-slate-500">Noch keine Arbeitsnotizen.</p>
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li key={n.id} className={cx('rounded-md border px-3 py-2', n.author === 'System' ? 'border-slate-200 bg-slate-50' : 'border-amber-200 bg-amber-50/60')}>
              <div className="mb-0.5 flex items-center justify-between gap-2 text-xs text-slate-500">
                <span className="font-medium text-slate-700">{n.author}</span>
                <span title={fmtDateTime(n.time)}>{fmtDateTime(n.time)}</span>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm text-slate-800">{n.text}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

// ─────────────── Antwort an Benutzer ───────────────

function CommentsCard({ ticket, requester, editable }: { ticket: Ticket; requester?: AdUser; editable: boolean }) {
  const techName = useStore((s) => s.world.tech.name)
  const hotline = useStore((s) => s.world.company.helpdeskPhone)
  const toast = useStore((s) => s.toast)
  const update = useTicketUpdate(ticket.id)
  const [text, setText] = useState('')
  const [waitForUser, setWaitForUser] = useState(false)
  const send = () => {
    const body = text.trim()
    if (!body) return
    update(
      (t) => {
        t.comments.push({ id: uid('c'), author: techName, text: body, time: nowIso() })
        t.firstResponseAt ??= nowIso()
      },
      { type: A.ticketComment, detail: body.slice(0, 300) },
    )
    if (waitForUser && ticket.status !== 'Wartet auf Benutzer') update((t) => void (t.status = 'Wartet auf Benutzer'), { type: A.ticketStatus, detail: 'Wartet auf Benutzer' })
    if (requester?.mail) {
      sendMail({
        to: [requester.mail],
        subject: `[${ticket.id}] ${ticket.title}`,
        body: `Guten Tag ${requester.displayName},\n\n${body}\n\nMit freundlichen Grüßen\n${techName}\nIT-Service-Desk · Musterwerk AG\nTel. ${hotline}`,
        ticketId: ticket.id,
        probe: body,
      })
      toast(`Antwort an ${requester.displayName} gesendet.`, 'success')
    } else {
      toast('Kommentar gespeichert – kein AD-Benutzer, daher keine E-Mail versendet.', 'warning')
    }
    setText('')
    setWaitForUser(false)
  }
  const comments = [...ticket.comments].reverse()
  return (
    <Card title={`Antwort an Benutzer (öffentlich) · ${ticket.comments.length}`} actions={<Mail size={15} className="text-slate-400" />}>
      {editable && (
        <div className="mb-4 space-y-2">
          <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={requester ? `Nachricht an ${requester.displayName} – wird per E-Mail an ${requester.mail} gesendet` : 'Kommentar an den Anforderer'} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Checkbox label="Danach Status „Wartet auf Benutzer“" checked={waitForUser} onChange={setWaitForUser} />
            <Button size="sm" variant="primary" icon={<Send size={13} />} disabled={!text.trim()} onClick={send}>
              Antwort senden
            </Button>
          </div>
        </div>
      )}
      {comments.length === 0 ? (
        <p className="text-sm text-slate-500">Noch keine Nachrichten an den Benutzer.</p>
      ) : (
        <ul className="space-y-2">
          {comments.map((c) => (
            <li key={c.id} className="rounded-md border border-sky-200 bg-sky-50/60 px-3 py-2">
              <div className="mb-0.5 flex items-center justify-between gap-2 text-xs text-slate-500">
                <span className="font-medium text-slate-700">{c.author}</span>
                <span>{fmtDateTime(c.time)}</span>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm text-slate-800">{c.text}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

// ─────────────── Ergebnis / Lösung ───────────────

function ResolutionCard({ ticket, onReport }: { ticket: Ticket; onReport: () => void }) {
  const score = ticket.score
  return (
    <Card title="Lösung" actions={<CircleCheck size={15} className="text-emerald-500" />}>
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1 space-y-1 text-sm">
          <div>
            <span className="text-slate-500">Abschlusscode: </span>
            <span className="font-medium text-slate-800">{ticket.resolutionCode ?? '–'}</span>
          </div>
          <div className="text-xs text-slate-500">Gelöst {fmtDateTime(ticket.resolvedAt)}</div>
          {ticket.resolutionNote && <p className="mt-1 whitespace-pre-wrap break-words text-slate-800">{ticket.resolutionNote}</p>}
        </div>
        {score && (
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <div className={cx('text-3xl font-bold tabular-nums', score.passed ? 'text-emerald-600' : 'text-rose-600')}>{score.percent} %</div>
            <div className="space-y-1">
              <div className="text-sm font-semibold text-slate-800">{score.grade}</div>
              <Badge tone={score.passed ? 'green' : 'red'}>{score.passed ? 'bestanden' : 'nicht bestanden'}</Badge>
            </div>
            <Button size="sm" variant="primary" icon={<Trophy size={13} />} onClick={onReport}>
              Bericht anzeigen
            </Button>
          </div>
        )}
      </div>
    </Card>
  )
}

// ─────────────── Wissensdatenbank ───────────────

function KbCard({ ticket, editable, onLink }: { ticket: Ticket; editable: boolean; onLink: () => void }) {
  const kb = useStore((s) => s.world.kb)
  const navigate = useStore((s) => s.navigate)
  const update = useTicketUpdate(ticket.id)
  const linked = useMemo(() => ticket.linkedKb.map((id) => kb.find((a) => a.id === id) ?? { id, title: id, category: '' }), [ticket.linkedKb, kb])
  return (
    <Card
      title="Wissensdatenbank"
      actions={
        editable ? (
          <Button size="sm" variant="ghost" icon={<BookOpen size={13} />} onClick={onLink}>
            Verknüpfen
          </Button>
        ) : undefined
      }
    >
      {linked.length === 0 ? (
        <p className="text-sm text-slate-500">Keine Artikel verknüpft.</p>
      ) : (
        <ul className="space-y-1">
          {linked.map((a) => (
            <li key={a.id} className="flex items-center gap-2">
              <FileText size={14} className="shrink-0 text-slate-400" />
              <button type="button" className="min-w-0 flex-1 truncate text-left text-sm text-sky-700 hover:underline" onClick={() => navigate('kb', { id: a.id })} title={a.title}>
                {a.id}: {a.title}
              </button>
              {editable && (
                <button
                  type="button"
                  title="Verknüpfung entfernen"
                  className="text-slate-400 hover:text-rose-600"
                  onClick={() => update((t) => void (t.linkedKb = t.linkedKb.filter((x) => x !== a.id)), { type: A.ticketUpdated, detail: `KB-Verknüpfung entfernt: ${a.id}` })}
                >
                  <X size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

// ─────────────── Verknüpfte Kommunikation ───────────────

function LinkedCommsCard({ ticketId }: { ticketId: string }) {
  const mails = useStore((s) => s.world.mails)
  const chats = useStore((s) => s.world.chats)
  const calls = useStore((s) => s.world.calls)
  const navigate = useStore((s) => s.navigate)
  const m = useMemo(() => mails.filter((x) => x.ticketId === ticketId), [mails, ticketId])
  const c = useMemo(() => chats.filter((x) => x.ticketId === ticketId), [chats, ticketId])
  const p = useMemo(() => calls.filter((x) => x.ticketId === ticketId), [calls, ticketId])
  if (!m.length && !c.length && !p.length) return null
  return (
    <Card title="Kommunikation" bodyClassName="p-0">
      <ul className="divide-y divide-slate-100 text-sm">
        {p.map((x) => (
          <li key={x.id}>
            <button type="button" className="flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-slate-50" onClick={() => navigate('phone')}>
              <Phone size={14} className="shrink-0 text-slate-400" />
              <span className="min-w-0 flex-1 truncate">
                Anruf ({x.direction}) – {x.state}
              </span>
              <span className="shrink-0 text-xs text-slate-400">{fmtRelative(x.ringingSince)}</span>
            </button>
          </li>
        ))}
        {c.map((x) => (
          <li key={x.id}>
            <button type="button" className="flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-slate-50" onClick={() => navigate('chat', { id: x.id })}>
              <MessageSquare size={14} className="shrink-0 text-slate-400" />
              <span className="min-w-0 flex-1 truncate">Chat ({x.messages.filter((y) => y.from !== 'system').length} Nachrichten)</span>
              {x.unread > 0 && <Badge tone="sky">{x.unread} neu</Badge>}
            </button>
          </li>
        ))}
        {m.map((x) => (
          <li key={x.id}>
            <button type="button" className="flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-slate-50" onClick={() => navigate('mail', { id: x.id })}>
              <Mail size={14} className={cx('shrink-0', x.read ? 'text-slate-400' : 'text-sky-600')} />
              <span className={cx('min-w-0 flex-1 truncate', !x.read && 'font-semibold')}>
                {x.folder === 'Gesendet' ? '→ ' : '← '}
                {x.subject}
              </span>
              <span className="shrink-0 text-xs text-slate-400">{fmtRelative(x.date)}</span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  )
}

// ─────────────── Verlauf ───────────────

interface TimelineItem {
  id: string
  time: string
  label: string
  detail?: string
}

function TimelineCard({ ticket, log }: { ticket: Ticket; log: ActionEntry[] }) {
  const items = useMemo(() => {
    const out: TimelineItem[] = log.map((a) => {
      const label = ACTION_LABEL[a.type] ?? a.type
      const parts = [a.type === A.ticketCreated ? `über ${a.detail ?? ticket.channel}` : a.detail, a.target && a.target !== ticket.requester && a.target !== a.detail ? a.target : undefined].filter(Boolean)
      return { id: a.id, time: a.time, label, detail: parts.join(' · ') || undefined }
    })
    if (!log.some((a) => a.type === A.ticketCreated)) out.unshift({ id: 'created', time: ticket.createdAt, label: 'Ticket erstellt', detail: `über ${ticket.channel}` })
    if (ticket.historical) {
      for (const n of ticket.workNotes) out.push({ id: n.id, time: n.time, label: 'Arbeitsnotiz', detail: n.author })
      if (ticket.resolvedAt) out.push({ id: 'resolved', time: ticket.resolvedAt, label: 'Gelöst', detail: ticket.resolutionCode })
    }
    return out.sort((a, b) => a.time.localeCompare(b.time))
  }, [log, ticket])
  return (
    <Card title="Verlauf" actions={<History size={15} className="text-slate-400" />}>
      <ol className="relative space-y-2.5 border-l border-slate-200 pl-4">
        {items.map((i) => (
          <li key={i.id} className="relative">
            <span className="absolute top-1.5 -left-[1.3rem] h-2 w-2 rounded-full bg-sky-500 ring-2 ring-white" />
            <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="font-medium text-slate-800">{i.label}</span>
              <span className="text-xs text-slate-400">{fmtDateTime(i.time)}</span>
            </div>
            {i.detail && <div className="break-words text-xs text-slate-600">{i.detail}</div>}
          </li>
        ))}
      </ol>
    </Card>
  )
}

