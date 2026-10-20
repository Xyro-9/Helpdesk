// E-Mail-Modul: Helpdesk-Postfach mit Ordnern, Lesebereich, Antworten/Weiterleiten, Phishing-Meldung

import { Archive, ArchiveRestore, ClipboardList, Code, Flag, Forward, Inbox, Mail, MailOpen, MailPlus, Paperclip, Reply, ReplyAll, Search, Send, ShieldAlert, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { findUser } from '@/core/ops/ad'
import { useStore } from '@/core/store'
import type { MailMessage } from '@/core/types'
import { fmtDateTime, fmtRelative, normalize } from '@/core/util'
import { Badge, Button, cx, EmptyState, Field, Input, Modal, PageHeader, Textarea } from '@/ui'
import { MAIL_REPORTED_PHISHING, quoteMail, replySubject, sendMail } from './logic'
import { RecipientField } from './parts'

type Folder = MailMessage['folder']
const FOLDERS: { id: Folder; icon: typeof Inbox }[] = [
  { id: 'Posteingang', icon: Inbox },
  { id: 'Gesendet', icon: Send },
  { id: 'Archiv', icon: Archive },
  { id: 'Papierkorb', icon: Trash2 },
]

interface Draft {
  mode: 'neu' | 'antwort' | 'weiterleitung'
  to: string
  cc: string
  subject: string
  body: string
  ticketId?: string
  attachments: MailMessage['attachments']
}

export function MailView() {
  const pid = useStore((s) => s.ui.params.id)
  // Deep-Link (navigate('mail', { id })) → Client mit dieser Mail neu initialisieren
  return <MailClient key={pid ?? ''} initialId={pid} />
}

function MailClient({ initialId }: { initialId?: string }) {
  const mails = useStore((s) => s.world.mails)
  const updateWorld = useStore((s) => s.updateWorld)
  const techName = useStore((s) => s.world.tech.name)
  const hotline = useStore((s) => s.world.company.helpdeskPhone)
  const [folder, setFolder] = useState<Folder>(() => mails.find((m) => m.id === initialId)?.folder ?? 'Posteingang')
  const [selectedId, setSelectedId] = useState<string | undefined>(initialId)
  const [q, setQ] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)

  const counts = useMemo(() => {
    const c: Record<Folder, { total: number; unread: number }> = { Posteingang: { total: 0, unread: 0 }, Gesendet: { total: 0, unread: 0 }, Archiv: { total: 0, unread: 0 }, Papierkorb: { total: 0, unread: 0 } }
    for (const m of mails) {
      c[m.folder].total++
      if (!m.read) c[m.folder].unread++
    }
    return c
  }, [mails])
  const list = useMemo(() => {
    const n = normalize(q.trim())
    return mails
      .filter((m) => m.folder === folder && (!n || normalize(`${m.subject} ${m.from.name} ${m.from.address} ${m.to.join(' ')} ${m.body}`).includes(n)))
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [mails, folder, q])
  const selected = mails.find((m) => m.id === selectedId && m.folder === folder)

  // Beim Öffnen als gelesen markieren
  const selId = selected?.id
  const selRead = selected?.read
  useEffect(() => {
    if (!selId || selRead) return
    updateWorld((w) => {
      const m = w.mails.find((x) => x.id === selId)
      if (m) m.read = true
    })
  }, [selId, selRead, updateWorld])

  const signature = `\n\n\nMit freundlichen Grüßen\n${techName}\nIT-Service-Desk · Musterwerk AG\nTel. ${hotline}`
  const openCompose = (mode: Draft['mode'], m?: MailMessage, all = false) => {
    if (!m || mode === 'neu') {
      setDraft({ mode: 'neu', to: '', cc: '', subject: '', body: signature, attachments: [] })
      return
    }
    if (mode === 'antwort') {
      const own = useStore.getState().world.company.helpdeskMail.toLowerCase()
      const sentByUs = m.from.address.toLowerCase() === own
      const to = sentByUs ? m.to : [m.from.address]
      const cc = all ? [...(sentByUs ? [] : m.to), ...m.cc].filter((a) => a.toLowerCase() !== own && !to.some((t) => t.toLowerCase() === a.toLowerCase())) : []
      setDraft({ mode, to: to.join('; '), cc: cc.join('; '), subject: replySubject(m.subject, 'AW'), body: `${signature}\n\n${quoteMail(m)}`, ticketId: m.ticketId, attachments: [] })
    } else {
      setDraft({ mode, to: '', cc: '', subject: replySubject(m.subject, 'WG'), body: `${signature}\n\n${quoteMail(m).replace('-----Ursprüngliche Nachricht-----', '-----Weitergeleitete Nachricht-----')}`, ticketId: m.ticketId, attachments: m.attachments })
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="E-Mail"
        subtitle="Postfach helpdesk@musterwerk.example"
        icon={<Mail size={20} />}
        actions={
          <Button variant="primary" icon={<MailPlus size={15} />} onClick={() => openCompose('neu')}>
            Neue E-Mail
          </Button>
        }
      />
      <div className="flex min-h-0 flex-1">
        <nav className="w-48 shrink-0 space-y-0.5 border-r border-slate-200 bg-white p-2">
          {FOLDERS.map(({ id, icon: Icon }) => {
            const c = counts[id]
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setFolder(id)
                  setSelectedId(undefined)
                }}
                className={cx('flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm', folder === id ? 'bg-sky-50 font-medium text-sky-800' : 'text-slate-600 hover:bg-slate-50')}
              >
                <Icon size={16} />
                <span className="flex-1 text-left">{id}</span>
                {id === 'Posteingang' ? c.unread > 0 && <span className="rounded-full bg-sky-600 px-1.5 text-[11px] font-semibold text-white">{c.unread}</span> : c.total > 0 && <span className="text-xs text-slate-400">{c.total}</span>}
              </button>
            )
          })}
        </nav>

        <div className="flex w-[22rem] shrink-0 flex-col border-r border-slate-200 bg-white">
          <div className="border-b border-slate-100 p-2">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-slate-400" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`In „${folder}“ suchen …`} className="pl-8" />
            </div>
          </div>
          <ul className="flex-1 overflow-y-auto">
            {list.length === 0 && <li className="px-4 py-8 text-center text-sm text-slate-500">Keine Nachrichten.</li>}
            {list.map((m) => (
              <li key={m.id}>
                <button type="button" onClick={() => setSelectedId(m.id)} className={cx('block w-full border-b border-slate-100 px-3 py-2 text-left', selected?.id === m.id ? 'bg-sky-50' : 'hover:bg-slate-50')}>
                  <div className="flex items-center gap-1.5">
                    {!m.read && <span className="h-2 w-2 shrink-0 rounded-full bg-sky-600" aria-label="ungelesen" />}
                    <span className={cx('truncate text-sm', m.read ? 'text-slate-700' : 'font-bold text-slate-900')}>{folder === 'Gesendet' ? `An: ${m.to.join(', ')}` : m.from.name}</span>
                    <span className="ml-auto shrink-0 text-[11px] text-slate-400">{fmtRelative(m.date)}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span className={cx('truncate text-sm', m.read ? 'text-slate-600' : 'font-semibold text-slate-800')}>{m.subject || '(kein Betreff)'}</span>
                    <span className="ml-auto flex shrink-0 items-center gap-1 text-slate-400">
                      {m.attachments.length > 0 && <Paperclip size={12} />}
                      {m.flagged && <Flag size={12} className="fill-rose-500 text-rose-500" />}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span className="truncate text-xs text-slate-500">{m.body.split('\n').find((l) => l.trim()) ?? ''}</span>
                    {m.ticketId && <span className="ml-auto shrink-0 font-mono text-[10px] text-sky-700">{m.ticketId}</span>}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <section className="min-w-0 flex-1 overflow-y-auto bg-white">
          {selected ? (
            <MailReader key={selected.id} mail={selected} onCompose={openCompose} onDeselect={() => setSelectedId(undefined)} />
          ) : (
            <EmptyState icon={<MailOpen size={40} />} title="Keine Nachricht ausgewählt">
              Wählen Sie links eine E-Mail aus.
            </EmptyState>
          )}
        </section>
      </div>
      {draft && <ComposeModal draft={draft} onClose={() => setDraft(null)} />}
    </div>
  )
}

function MailReader({ mail, onCompose, onDeselect }: { mail: MailMessage; onCompose: (mode: Draft['mode'], m: MailMessage, all?: boolean) => void; onDeselect: () => void }) {
  const updateWorld = useStore((s) => s.updateWorld)
  const navigate = useStore((s) => s.navigate)
  const toast = useStore((s) => s.toast)
  const createManualTicket = useStore((s) => s.createManualTicket)
  const claimTicket = useStore((s) => s.claimTicket)
  const ticket = useStore((s) => (mail.ticketId ? s.world.tickets.find((t) => t.id === mail.ticketId) : undefined))
  const [showHeaders, setShowHeaders] = useState(false)
  const [attachment, setAttachment] = useState<MailMessage['attachments'][number] | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const patch = (fn: (m: MailMessage) => void) =>
    updateWorld((w) => {
      const m = w.mails.find((x) => x.id === mail.id)
      if (m) fn(m)
    })
  const moveTo = (folder: Folder, msg: string) => {
    patch((m) => {
      m.folder = folder
    })
    onDeselect()
    toast(msg, 'info')
  }
  const reportPhishing = () => {
    const entry = { type: MAIL_REPORTED_PHISHING, detail: mail.from.address, target: mail.from.address }
    updateWorld(
      (w) => {
        const m = w.mails.find((x) => x.id === mail.id)
        if (m) {
          m.folder = 'Papierkorb'
          m.read = true
        }
      },
      mail.ticketId ? { ...entry, ticketId: mail.ticketId } : entry,
    )
    onDeselect()
    toast('Als Phishing gemeldet und in den Papierkorb verschoben.', 'success')
  }
  const createTicket = () => {
    const w = useStore.getState().world
    const u = findUser(w, mail.from.address)
    const id = createManualTicket({ title: mail.subject || '(kein Betreff)', description: mail.body, requester: u?.sam ?? mail.from.address, channel: 'E-Mail' })
    patch((m) => {
      m.ticketId = id
    })
    claimTicket(id)
    toast(u ? `Ticket ${id} angelegt und übernommen.` : `Ticket ${id} angelegt – der Absender ist kein AD-Benutzer, bitte Anforderer prüfen.`, u ? 'success' : 'warning')
  }
  const headers: Record<string, string> = mail.headers ?? {
    From: `${mail.from.name} <${mail.from.address}>`,
    To: mail.to.join(', '),
    ...(mail.cc.length ? { Cc: mail.cc.join(', ') } : {}),
    Subject: mail.subject,
    Date: new Date(mail.date).toUTCString(),
    'Message-ID': `<${mail.id}@musterwerk.example>`,
  }

  return (
    <article className="flex min-h-full flex-col">
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 px-4 py-2">
        <Button size="sm" variant="ghost" icon={<Reply size={14} />} onClick={() => onCompose('antwort', mail)}>
          Antworten
        </Button>
        <Button size="sm" variant="ghost" icon={<ReplyAll size={14} />} onClick={() => onCompose('antwort', mail, true)}>
          Allen antworten
        </Button>
        <Button size="sm" variant="ghost" icon={<Forward size={14} />} onClick={() => onCompose('weiterleitung', mail)}>
          Weiterleiten
        </Button>
        <span className="mx-1 h-5 w-px bg-slate-200" />
        <Button size="sm" variant="ghost" icon={<Flag size={14} className={cx(mail.flagged && 'fill-rose-500 text-rose-500')} />} onClick={() => patch((m) => void (m.flagged = !m.flagged))}>
          {mail.flagged ? 'Markierung entfernen' : 'Markieren'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={<Mail size={14} />}
          onClick={() => {
            patch((m) => void (m.read = false))
            onDeselect()
          }}
        >
          Ungelesen
        </Button>
        {mail.folder === 'Posteingang' && (
          <Button size="sm" variant="ghost" icon={<Archive size={14} />} onClick={() => moveTo('Archiv', 'In das Archiv verschoben.')}>
            Archivieren
          </Button>
        )}
        {(mail.folder === 'Archiv' || mail.folder === 'Papierkorb') && (
          <Button size="sm" variant="ghost" icon={<ArchiveRestore size={14} />} onClick={() => moveTo('Posteingang', 'In den Posteingang verschoben.')}>
            Wiederherstellen
          </Button>
        )}
        <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => (mail.folder === 'Papierkorb' ? setConfirmDelete(true) : moveTo('Papierkorb', 'In den Papierkorb verschoben.'))}>
          {mail.folder === 'Papierkorb' ? 'Endgültig löschen' : 'Löschen'}
        </Button>
        <span className="mx-1 h-5 w-px bg-slate-200" />
        {mail.folder !== 'Gesendet' && mail.folder !== 'Papierkorb' && (
          <Button size="sm" variant="ghost" className="text-rose-700 hover:bg-rose-50" icon={<ShieldAlert size={14} />} onClick={reportPhishing}>
            Als Phishing melden
          </Button>
        )}
        <Button size="sm" variant="ghost" icon={<Code size={14} />} onClick={() => setShowHeaders((v) => !v)}>
          {showHeaders ? 'Kopfzeilen ausblenden' : 'Kopfzeilen anzeigen'}
        </Button>
      </div>

      <div className="space-y-3 px-6 py-4">
        <div className="flex flex-wrap items-start gap-3">
          <h2 className="min-w-0 flex-1 text-lg font-semibold text-slate-900">{mail.subject || '(kein Betreff)'}</h2>
          {ticket ? (
            <Button size="sm" icon={<ClipboardList size={13} />} onClick={() => navigate('tickets', { id: ticket.id })}>
              Ticket öffnen ({ticket.id})
            </Button>
          ) : (
            mail.folder !== 'Gesendet' && (
              <Button size="sm" icon={<ClipboardList size={13} />} onClick={createTicket}>
                Ticket erstellen
              </Button>
            )
          )}
        </div>
        <div className="text-sm">
          <div>
            <span className="font-semibold text-slate-900">{mail.from.name}</span> <span className="text-slate-500">&lt;{mail.from.address}&gt;</span>
          </div>
          <div className="text-slate-600">An: {mail.to.join('; ') || '–'}</div>
          {mail.cc.length > 0 && <div className="text-slate-600">Cc: {mail.cc.join('; ')}</div>}
          <div className="text-xs text-slate-500">{fmtDateTime(mail.date)}</div>
        </div>
        {showHeaders && (
          <pre className="overflow-x-auto rounded-md bg-slate-900 p-3 font-mono text-[11px] leading-relaxed text-slate-100">
            {Object.entries(headers)
              .map(([k, v]) => `${k}: ${v}`)
              .join('\n')}
          </pre>
        )}
        {mail.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {mail.attachments.map((a, i) => (
              <button key={`${a.name}-${i}`} type="button" onClick={() => setAttachment(a)} className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100">
                <Paperclip size={13} />
                <span className="font-medium">{a.name}</span>
                <span className="text-slate-400">{a.sizeKb} KB</span>
              </button>
            ))}
          </div>
        )}
        <div className="border-t border-slate-100 pt-3 text-sm leading-relaxed text-slate-800">
          {mail.body.split('\n').map((line, i) => (
            <div key={i} className={cx('min-h-[1.25rem] whitespace-pre-wrap break-words', line.trimStart().startsWith('>') && 'border-l-2 border-slate-200 pl-2 text-slate-500')}>
              {line}
            </div>
          ))}
        </div>
      </div>

      {attachment && (
        <Modal title={`Anhang: ${attachment.name}`} onClose={() => setAttachment(null)} size="lg">
          {attachment.content ? <pre className="whitespace-pre-wrap break-words rounded-md bg-slate-50 p-3 font-mono text-xs text-slate-800">{attachment.content}</pre> : <p className="text-sm text-slate-500">Für diesen Dateityp ist keine Vorschau verfügbar ({attachment.sizeKb} KB).</p>}
        </Modal>
      )}
      {confirmDelete && (
        <Modal
          title="Endgültig löschen?"
          size="sm"
          onClose={() => setConfirmDelete(false)}
          footer={
            <>
              <Button onClick={() => setConfirmDelete(false)}>Abbrechen</Button>
              <Button
                variant="danger"
                onClick={() => {
                  updateWorld((w) => {
                    w.mails = w.mails.filter((x) => x.id !== mail.id)
                  })
                  setConfirmDelete(false)
                  onDeselect()
                }}
              >
                Löschen
              </Button>
            </>
          }
        >
          <p className="text-sm text-slate-700">Die Nachricht „{mail.subject}“ wird endgültig gelöscht.</p>
        </Modal>
      )}
    </article>
  )
}

function ComposeModal({ draft, onClose }: { draft: Draft; onClose: () => void }) {
  const toast = useStore((s) => s.toast)
  const ticket = useStore((s) => (draft.ticketId ? s.world.tickets.find((t) => t.id === draft.ticketId) : undefined))
  const [to, setTo] = useState(draft.to)
  const [cc, setCc] = useState(draft.cc)
  const [subject, setSubject] = useState(draft.subject)
  const [body, setBody] = useState(draft.body)
  const [ticketId, setTicketId] = useState(draft.ticketId)
  const [attachments, setAttachments] = useState(draft.attachments)
  const title = draft.mode === 'antwort' ? 'Antworten' : draft.mode === 'weiterleitung' ? 'Weiterleiten' : 'Neue E-Mail'
  const send = () => {
    if (!to.trim()) return toast('Bitte mindestens einen Empfänger angeben.', 'warning')
    if (!subject.trim()) return toast('Bitte einen Betreff angeben.', 'warning')
    sendMail({ to: [to], cc: cc.trim() ? [cc] : [], subject: subject.trim(), body, ticketId, attachments })
    toast('E-Mail gesendet.', 'success')
    onClose()
  }
  return (
    <Modal
      title={title}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>Verwerfen</Button>
          <Button variant="primary" icon={<Send size={15} />} onClick={send}>
            Senden
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="An">
          <RecipientField value={to} onChange={setTo} placeholder="Name oder Adresse – Vorschläge aus dem AD" autoFocus={draft.mode !== 'antwort'} />
        </Field>
        <Field label="Cc">
          <RecipientField value={cc} onChange={setCc} />
        </Field>
        <Field label="Betreff">
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
        </Field>
        {ticketId && (
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <Badge tone="sky">
              <ClipboardList size={12} /> {ticketId}
            </Badge>
            <span className="truncate">{ticket?.title ?? ''}</span>
            <button type="button" className="ml-auto text-slate-500 hover:text-rose-600 hover:underline" onClick={() => setTicketId(undefined)}>
              Verknüpfung entfernen
            </button>
          </div>
        )}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {attachments.map((a, i) => (
              <span key={`${a.name}-${i}`} className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700">
                <Paperclip size={12} /> {a.name}
                <button type="button" title="Anhang entfernen" className="text-slate-400 hover:text-rose-600" onClick={() => setAttachments((l) => l.filter((_, j) => j !== i))}>
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <Field label="Nachricht">
          <Textarea rows={14} value={body} onChange={(e) => setBody(e.target.value)} autoFocus={draft.mode === 'antwort'} />
        </Field>
      </div>
    </Modal>
  )
}
