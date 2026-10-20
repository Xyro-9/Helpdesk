// Gemeinsame Bausteine für Telefon, Chat und E-Mail (Benutzersuche, Verlauf, Eingabe, Schnellsätze)

import { Mic, MicOff, Send } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useStore } from '@/core/store'
import type { AdUser, Call, ChatMessage } from '@/core/types'
import { fmtTime, normalize } from '@/core/util'
import { Button, cx, IconButton, Input } from '@/ui'
import { callDurationMs, fmtDuration } from './logic'
import { useSpeechInput } from './speech'

// ─────────────── Zeit ───────────────

/** Re-Render im Intervall (für Dauer-/Countdown-Anzeigen) */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

export function CallTimer({ call }: { call: Call }) {
  useNow(1000)
  return <span className="tabular-nums">{fmtDuration(callDurationMs(call))}</span>
}

// ─────────────── Personen ───────────────

export const initials = (name: string) =>
  name
    .split(/[\s.]+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

export function Avatar({ name, className }: { name: string; className?: string }) {
  return <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700', className)}>{initials(name)}</span>
}

/** Benutzer der Firma (ohne Dienstkonten und ohne den Azubi selbst) */
export function useDirectory() {
  const users = useStore((s) => s.world.users)
  const self = useStore((s) => s.world.tech.sam)
  return useMemo(() => users.filter((u) => !u.isServiceAccount && u.sam !== self), [users, self])
}

export function matchUsers(users: AdUser[], query: string, limit = 8) {
  const q = normalize(query.trim())
  if (!q) return []
  const digits = query.replace(/[^\d]/g, '')
  return users
    .filter((u) => {
      const hay = normalize(`${u.displayName} ${u.sam} ${u.mail} ${u.department} ${u.title}`)
      return hay.includes(q) || (digits.length >= 3 && (u.phone.replace(/[^\d]/g, '').includes(digits) || (u.mobile ?? '').replace(/[^\d]/g, '').includes(digits)))
    })
    .slice(0, limit)
}

/** Suchfeld mit Vorschlagsliste für AD-Benutzer */
export function UserSearch({ onSelect, placeholder = 'Name, Benutzername oder Abteilung …', autoFocus, onEnterRaw, className }: { onSelect: (u: AdUser) => void; placeholder?: string; autoFocus?: boolean; onEnterRaw?: (text: string) => void; className?: string }) {
  const users = useDirectory()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [idx, setIdx] = useState(0)
  const matches = useMemo(() => matchUsers(users, q), [users, q])
  const pick = (u: AdUser) => {
    onSelect(u)
    setQ('')
    setOpen(false)
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIdx((i) => Math.min(i + 1, matches.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (matches[idx]) pick(matches[idx])
      else if (q.trim() && onEnterRaw) {
        onEnterRaw(q.trim())
        setQ('')
      }
    } else if (e.key === 'Escape') setOpen(false)
  }
  return (
    <div className={cx('relative', className)}>
      <Input
        value={q}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(e) => {
          setQ(e.target.value)
          setIdx(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKey}
      />
      {open && matches.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
          {matches.map((u, i) => (
            <li key={u.sam}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(u)}
                className={cx('flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm', i === idx ? 'bg-sky-50' : 'hover:bg-slate-50')}
              >
                <Avatar name={u.displayName} className="h-7 w-7 text-[10px]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-slate-800">{u.displayName}</span>
                  <span className="block truncate text-xs text-slate-500">
                    {u.department} · {u.sam}
                  </span>
                </span>
                <span className="text-xs tabular-nums text-slate-400">{u.phone}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Empfängerfeld (mehrere Adressen, durch Komma/Semikolon getrennt) mit Autovervollständigung */
export function RecipientField({ value, onChange, placeholder, autoFocus }: { value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean }) {
  const users = useDirectory()
  const [open, setOpen] = useState(false)
  const parts = value.split(/[;,]/)
  const current = parts[parts.length - 1] ?? ''
  const matches = useMemo(() => (current.trim().length >= 2 ? matchUsers(users, current, 6) : []), [users, current])
  const pick = (u: AdUser) => {
    const head = parts.slice(0, -1).map((p) => p.trim()).filter(Boolean)
    onChange([...head, u.mail].join('; ') + '; ')
    setOpen(false)
  }
  return (
    <div className="relative">
      <Input
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && open && matches[0]) {
            e.preventDefault()
            pick(matches[0])
          }
        }}
      />
      {open && matches.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
          {matches.map((u) => (
            <li key={u.sam}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(u)} className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-sky-50">
                <span className="truncate font-medium text-slate-800">{u.displayName}</span>
                <span className="truncate text-xs text-slate-500">{u.mail}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─────────────── Schnellsätze ───────────────

export interface Phrase {
  label: string
  text: string
}

export function phrasesFor(kind: 'call' | 'chat', techName: string): Phrase[] {
  const call = kind === 'call'
  return [
    { label: 'Begrüßung', text: call ? `Service Desk Musterwerk, mein Name ist ${techName}. Was kann ich für Sie tun?` : `Hallo, hier ist ${techName} vom Service Desk Musterwerk. Was kann ich für Sie tun?` },
    { label: 'Identität', text: 'Darf ich zur Sicherheit Ihre Personalnummer und Ihr Geburtsdatum erfragen?' },
    { label: 'Rechnername', text: 'Können Sie mir bitte den Rechnernamen nennen? Er steht auf dem Aufkleber am Gerät.' },
    { label: 'Fernzugriff', text: 'Darf ich mich auf Ihren PC aufschalten?' },
    { label: 'Moment', text: 'Einen Moment bitte, ich schaue nach.' },
    { label: 'Bestätigung', text: 'Funktioniert es jetzt wieder?' },
    { label: 'Verabschiedung', text: call ? 'Vielen Dank für Ihren Anruf. Ich wünsche Ihnen einen schönen Tag – auf Wiederhören!' : 'Gern geschehen! Ich schließe den Chat dann. Einen schönen Tag noch!' },
  ]
}

export function QuickPhrases({ phrases, onPick, disabled, compact }: { phrases: Phrase[]; onPick: (text: string) => void; disabled?: boolean; compact?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1">
      {phrases.map((p) => (
        <button
          key={p.label}
          type="button"
          title={p.text}
          disabled={disabled}
          onClick={() => onPick(p.text)}
          className={cx('rounded-full border border-slate-200 bg-white text-slate-600 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-50', compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs')}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}

// ─────────────── Verlauf ───────────────

export function MessageList({ messages, userName, techName, typing, typingLabel, compact, className, empty }: { messages: ChatMessage[]; userName: string; techName: string; typing?: boolean; typingLabel?: string; compact?: boolean; className?: string; empty?: ReactNode }) {
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, typing])
  return (
    <div className={cx('flex flex-col gap-2 overflow-y-auto', compact ? 'p-2' : 'p-4', className)}>
      {messages.length === 0 && !typing && empty}
      {messages.map((m) =>
        m.from === 'system' ? (
          <div key={m.id} className="self-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] text-slate-500">
            {m.text} · {fmtTime(m.time)}
          </div>
        ) : (
          <div key={m.id} className={cx('flex max-w-[85%] flex-col', m.from === 'tech' ? 'items-end self-end' : 'items-start self-start')}>
            <div className={cx('whitespace-pre-wrap break-words rounded-2xl leading-relaxed', compact ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-sm', m.from === 'tech' ? 'rounded-br-sm bg-sky-600 text-white' : 'rounded-bl-sm bg-white text-slate-800 ring-1 ring-slate-200')}>{m.text}</div>
            <span className="mt-0.5 px-1 text-[10px] text-slate-400">
              {m.from === 'tech' ? techName : userName} · {fmtTime(m.time)}
            </span>
          </div>
        ),
      )}
      {typing && (
        <div className="flex items-center gap-2 self-start rounded-2xl rounded-bl-sm bg-white px-3 py-2 text-xs text-slate-500 ring-1 ring-slate-200">
          <span className="flex gap-0.5">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
          </span>
          {typingLabel ?? `${userName} schreibt …`}
        </div>
      )}
      <div ref={endRef} />
    </div>
  )
}

// ─────────────── Eingabe ───────────────

/** Eingabezeile: Enter sendet, optional Mikrofon (Spracheingabe) */
export function Composer({ onSend, disabled, placeholder, compact, autoFocus }: { onSend: (text: string) => void; disabled?: boolean; placeholder?: string; compact?: boolean; autoFocus?: boolean }) {
  const [text, setText] = useState('')
  const sttEnabled = useStore((s) => s.settings.stt)
  const toast = useStore((s) => s.toast)
  const speech = useSpeechInput(
    (t) => setText(t),
    (msg) => toast(msg, 'warning'),
  )
  const send = () => {
    const t = text.trim()
    if (!t || disabled) return
    if (speech.listening) speech.stop()
    onSend(t)
    setText('')
  }
  return (
    <div className="flex items-center gap-1.5">
      <Input
        value={text}
        disabled={disabled}
        autoFocus={autoFocus}
        placeholder={placeholder ?? 'Nachricht eingeben – Enter sendet'}
        className={compact ? 'h-8 text-xs' : undefined}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            send()
          }
        }}
      />
      {sttEnabled && speech.supported && (
        <IconButton title={speech.listening ? 'Spracheingabe beenden' : 'Spracheingabe (Mikrofon)'} disabled={disabled} onClick={speech.listening ? speech.stop : speech.start} className={cx(speech.listening && 'animate-pulse bg-rose-50 text-rose-600 hover:bg-rose-100')}>
          {speech.listening ? <MicOff size={16} /> : <Mic size={16} />}
        </IconButton>
      )}
      <Button variant="primary" size={compact ? 'sm' : 'md'} disabled={disabled || !text.trim()} onClick={send} icon={<Send size={compact ? 13 : 15} />} aria-label="Senden">
        {compact ? null : 'Senden'}
      </Button>
    </div>
  )
}
