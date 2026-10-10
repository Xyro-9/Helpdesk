// Dialoge des Ticket-Moduls: Neues Ticket, Lösen, Eskalieren, KB verknüpfen, Tipp, Zwischenstand, Anhang

import { BookOpen, CircleCheck, CircleX, Lightbulb, Link2, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { A } from '@/core/actions'
import { CATEGORIES, PRIORITIES, technicalStatus } from '@/core/scenarios/engine'
import type { Scenario } from '@/core/scenarios/types'
import { useStore } from '@/core/store'
import type { AdUser, AssignmentGroup, Channel, Priority, ResolutionCode, Ticket, TicketCategory, TicketKind } from '@/core/types'
import { normalize, nowIso, uid } from '@/core/util'
import { fileSentMail } from '@/modules/comms'
import { UserSearch } from '@/modules/comms/parts'
import { Badge, Button, Checkbox, cx, Field, Input, Modal, Select, Textarea } from '@/ui'
import { CHANNELS, GROUPS, KINDS, RESOLUTION_CODES, useTicketUpdate } from './helpers'

// ─────────────── Neues Ticket ───────────────

export function NewTicketDialog({ onClose }: { onClose: () => void }) {
  const createManualTicket = useStore((s) => s.createManualTicket)
  const claimTicket = useStore((s) => s.claimTicket)
  const navigate = useStore((s) => s.navigate)
  const toast = useStore((s) => s.toast)
  const [requester, setRequester] = useState<AdUser | undefined>()
  const [channel, setChannel] = useState<Channel>('Telefon')
  const [kind, setKind] = useState<TicketKind>('Störung')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<TicketCategory>('Sonstiges')
  const [priority, setPriority] = useState<Priority>('P3 – Mittel')
  const [claim, setClaim] = useState(true)
  const valid = !!requester && title.trim().length >= 3 && description.trim().length > 0

  const create = () => {
    if (!requester) return toast('Bitte einen Anforderer auswählen.', 'warning')
    if (!valid) return toast('Bitte Titel und Beschreibung ausfüllen.', 'warning')
    const id = createManualTicket({ title: title.trim(), description: description.trim(), requester: requester.sam, channel, kind, category, priority })
    if (claim) claimTicket(id)
    toast(`Ticket ${id} angelegt.`, 'success')
    navigate('tickets', { id })
    onClose()
  }

  return (
    <Modal
      title="Neues Ticket"
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" disabled={!valid} onClick={create}>
            Ticket anlegen
          </Button>
        </>
      }
    >
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Anforderer (AD-Benutzer)" className="md:col-span-2">
          {requester ? (
            <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm">
              <span className="font-medium text-slate-800">{requester.displayName}</span>
              <span className="text-slate-500">
                {requester.department} · {requester.sam}
              </span>
              <button type="button" className="ml-auto text-slate-400 hover:text-rose-600" title="Anforderer ändern" onClick={() => setRequester(undefined)}>
                <X size={15} />
              </button>
            </div>
          ) : (
            <UserSearch onSelect={setRequester} autoFocus placeholder="Name, Benutzername oder Abteilung suchen …" />
          )}
        </Field>
        <Field label="Kanal">
          <Select value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
            {CHANNELS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Typ">
          <Select value={kind} onChange={(e) => setKind(e.target.value as TicketKind)}>
            {KINDS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </Select>
        </Field>
        <Field label="Titel" className="md:col-span-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Kurze Zusammenfassung des Anliegens" />
        </Field>
        <Field label="Beschreibung" className="md:col-span-2">
          <Textarea rows={5} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Was genau ist das Problem? Seit wann? Wer ist betroffen?" />
        </Field>
        <Field label="Kategorie">
          <Select value={category} onChange={(e) => setCategory(e.target.value as TicketCategory)}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Priorität">
          <Select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            {PRIORITIES.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </Select>
        </Field>
        <div className="md:col-span-2">
          <Checkbox label="Ticket direkt übernehmen und als aktives Ticket setzen" checked={claim} onChange={setClaim} />
        </div>
      </div>
    </Modal>
  )
}

// ─────────────── Lösen ───────────────

export function ResolveDialog({ ticket, requester, onClose }: { ticket: Ticket; requester?: AdUser; onClose: () => void }) {
  const resolveTicket = useStore((s) => s.resolveTicket)
  const toast = useStore((s) => s.toast)
  const techName = useStore((s) => s.world.tech.name)
  const hotline = useStore((s) => s.world.company.helpdeskPhone)
  const [code, setCode] = useState<ResolutionCode | ''>('')
  const [note, setNote] = useState('')
  const [notify, setNotify] = useState(true)
  const noteOk = note.trim().length >= 20
  const submit = () => {
    if (!code) return toast('Bitte einen Abschlusscode wählen.', 'warning')
    if (!noteOk) return toast('Die Lösungsbeschreibung muss mindestens 20 Zeichen lang sein.', 'warning')
    const text = note.trim()
    const result = resolveTicket(ticket.id, code, text, notify)
    if (notify && requester?.mail) {
      fileSentMail({
        to: [requester.mail],
        subject: `[${ticket.id}] Gelöst: ${ticket.title}`,
        body: `Guten Tag ${requester.displayName},\n\nIhr Ticket ${ticket.id} wurde gelöst:\n\n${text}\n\nSollte das Problem erneut auftreten, antworten Sie einfach auf diese E-Mail.\n\nMit freundlichen Grüßen\n${techName}\nIT-Service-Desk · Musterwerk AG\nTel. ${hotline}`,
        ticketId: ticket.id,
      })
    }
    toast(result ? `Ticket ${ticket.id} gelöst – Bewertung: ${result.percent} % (${result.grade}).` : `Ticket ${ticket.id} gelöst.`, 'success')
    onClose()
  }
  return (
    <Modal
      title={`Ticket ${ticket.id} lösen`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button variant="success" disabled={!code || !noteOk} onClick={submit}>
            Ticket lösen
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Abschlusscode">
          <Select value={code} onChange={(e) => setCode(e.target.value as ResolutionCode)}>
            <option value="" disabled>
              Bitte wählen …
            </option>
            {RESOLUTION_CODES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Lösungsbeschreibung" hint={`${note.trim().length} / mind. 20 Zeichen – Ursache und durchgeführte Maßnahmen nachvollziehbar beschreiben.`}>
          <Textarea rows={6} value={note} onChange={(e) => setNote(e.target.value)} placeholder={'Ursache: …\nLösung: …'} autoFocus />
        </Field>
        <Checkbox label={requester ? `Benutzer per Mail informieren (${requester.mail})` : 'Benutzer per Mail informieren'} checked={notify} onChange={setNotify} />
      </div>
    </Modal>
  )
}

// ─────────────── Eskalieren ───────────────

export function EscalateDialog({ ticket, onClose }: { ticket: Ticket; onClose: () => void }) {
  const update = useTicketUpdate(ticket.id)
  const techName = useStore((s) => s.world.tech.name)
  const toast = useStore((s) => s.toast)
  const [group, setGroup] = useState<AssignmentGroup>(ticket.assignmentGroup === '2nd Level Support' ? 'Netzwerk & Infrastruktur' : '2nd Level Support')
  const [reason, setReason] = useState('')
  const ok = reason.trim().length >= 10
  const submit = () => {
    const text = reason.trim()
    update(
      (t) => {
        t.assignmentGroup = group
        t.status = 'Wartet auf Dritte'
        t.workNotes.push({ id: uid('n'), author: techName, text: `Eskaliert an ${group}: ${text}`, time: nowIso() })
      },
      { type: A.ticketEscalated, detail: `${group}: ${text}` },
    )
    toast(`Ticket an „${group}“ eskaliert.`, 'info')
    onClose()
  }
  return (
    <Modal
      title={`Ticket ${ticket.id} eskalieren`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" disabled={!ok} onClick={submit}>
            Eskalieren
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Zuweisungsgruppe">
          <Select value={group} onChange={(e) => setGroup(e.target.value as AssignmentGroup)}>
            {GROUPS.filter((g) => g !== ticket.assignmentGroup).map((g) => (
              <option key={g}>{g}</option>
            ))}
          </Select>
        </Field>
        <Field label="Begründung" hint="Was wurde bereits geprüft? Warum ist der 1st Level nicht zuständig? (mind. 10 Zeichen)">
          <Textarea rows={5} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
        </Field>
        <p className="text-xs text-slate-500">Der Status wird auf „Wartet auf Dritte“ gesetzt und die Begründung als Arbeitsnotiz gespeichert.</p>
      </div>
    </Modal>
  )
}

// ─────────────── KB verknüpfen ───────────────

export function KbLinkDialog({ ticket, onClose }: { ticket: Ticket; onClose: () => void }) {
  const kb = useStore((s) => s.world.kb)
  const update = useTicketUpdate(ticket.id)
  const navigate = useStore((s) => s.navigate)
  const [q, setQ] = useState('')
  const results = useMemo(() => {
    const n = normalize(q.trim())
    const words = n.split(/\s+/).filter(Boolean)
    return kb.filter((a) => {
      const hay = normalize(`${a.id} ${a.title} ${a.category} ${a.tags.join(' ')} ${a.body}`)
      return words.every((w) => hay.includes(w))
    })
  }, [kb, q])
  const link = (id: string) => {
    if (ticket.linkedKb.includes(id)) return
    update(
      (t) => {
        if (!t.linkedKb.includes(id)) t.linkedKb.push(id)
      },
      { type: A.kbLinked, target: id, detail: id },
    )
  }
  return (
    <Modal title="Wissensartikel verknüpfen" onClose={onClose} size="lg" footer={<Button onClick={onClose}>Fertig</Button>}>
      <div className="relative mb-3">
        <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-slate-400" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Stichwort, z. B. gesperrt, Drucker, VPN …" className="pl-8" autoFocus />
      </div>
      {results.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">Keine passenden Artikel gefunden.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
          {results.map((a) => {
            const linked = ticket.linkedKb.includes(a.id)
            return (
              <li key={a.id} className="flex items-center gap-3 px-3 py-2">
                <BookOpen size={16} className="shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    className="block truncate text-left text-sm font-medium text-slate-800 hover:text-sky-700 hover:underline"
                    onClick={() => {
                      onClose()
                      navigate('kb', { id: a.id })
                    }}
                  >
                    {a.title}
                  </button>
                  <div className="truncate text-xs text-slate-500">
                    {a.id} · {a.category}
                    {a.tags.length ? ` · ${a.tags.slice(0, 4).join(', ')}` : ''}
                  </div>
                </div>
                {linked ? (
                  <Badge tone="green">verknüpft</Badge>
                ) : (
                  <Button size="sm" icon={<Link2 size={13} />} onClick={() => link(a.id)}>
                    Verknüpfen
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Modal>
  )
}

// ─────────────── Tipp ───────────────

export function HintDialog({ ticket, scenario, usedHints, onClose }: { ticket: Ticket; scenario: Scenario; usedHints: string[]; onClose: () => void }) {
  const takeHint = useStore((s) => s.useHint)
  const toast = useStore((s) => s.toast)
  const remaining = Math.max(0, scenario.hints.length - (ticket.scenarioCtx?.hintsUsed ?? 0))
  const reveal = () => {
    const h = takeHint(ticket.id)
    if (!h) toast('Für dieses Szenario sind keine weiteren Tipps verfügbar.', 'info')
  }
  return (
    <Modal
      title="Tipps zum Szenario"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Schließen</Button>
          <Button variant="primary" icon={<Lightbulb size={15} />} disabled={remaining === 0} onClick={reveal}>
            Tipp anzeigen (−2 Punkte)
          </Button>
        </>
      }
    >
      <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
        Jeder Tipp kostet <strong>2 Punkte</strong> in der Bewertung. Noch verfügbar: <strong>{remaining}</strong> von {scenario.hints.length}.
      </p>
      {usedHints.length === 0 ? (
        <p className="text-sm text-slate-500">Bisher wurden keine Tipps genutzt.</p>
      ) : (
        <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-800">
          {usedHints.map((h, i) => (
            <li key={i}>{h}</li>
          ))}
        </ol>
      )}
    </Modal>
  )
}

// ─────────────── Zwischenstand ───────────────

export function PreCheckDialog({ ticket, scenario, onClose }: { ticket: Ticket; scenario: Scenario; onClose: () => void }) {
  const [snapshot, setSnapshot] = useState(() => ({ at: new Date(), status: technicalStatus(useStore.getState().world, ticket, scenario) }))
  const refresh = () => {
    const t = useStore.getState().world.tickets.find((x) => x.id === ticket.id) ?? ticket
    setSnapshot({ at: new Date(), status: technicalStatus(useStore.getState().world, t, scenario) })
  }
  const done = snapshot.status.items.filter((i) => i.ok).length
  return (
    <Modal
      title="Zwischenstand prüfen"
      onClose={onClose}
      footer={
        <>
          <Button onClick={refresh}>Erneut prüfen</Button>
          <Button variant="primary" onClick={onClose}>
            Schließen
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-slate-600">
        Technische Prüfpunkte ({snapshot.at.toLocaleTimeString('de-DE')}): <strong>{done}</strong> von {snapshot.status.items.length} erfüllt.
      </p>
      <ul className="space-y-1.5">
        {snapshot.status.items.map((i) => (
          <li key={i.id} className={cx('flex items-start gap-2 rounded-md px-3 py-2 text-sm ring-1', i.ok ? 'bg-emerald-50 text-emerald-900 ring-emerald-200' : 'bg-rose-50 text-rose-900 ring-rose-200')}>
            {i.ok ? <CircleCheck size={16} className="mt-0.5 shrink-0" /> : <CircleX size={16} className="mt-0.5 shrink-0" />}
            <span>
              {i.label} – <strong>{i.ok ? 'ok' : 'nicht ok'}</strong>
            </span>
          </li>
        ))}
      </ul>
    </Modal>
  )
}

// ─────────────── Anhang ───────────────

export function AttachmentDialog({ name, content, onClose }: { name: string; content: string; onClose: () => void }) {
  return (
    <Modal title={`Anhang: ${name}`} onClose={onClose} size="lg">
      <pre className="whitespace-pre-wrap break-words rounded-md bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-800">{content || '(leer)'}</pre>
    </Modal>
  )
}
