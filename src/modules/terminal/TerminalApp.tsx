// Terminal (cmd / PowerShell) auf einem simulierten Endpunkt.
// Die Befehle werden vom reinen Interpreter (interpreter.ts) innerhalb von updateWorld ausgeführt.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { A } from '@/core/actions'
import { ensureEndpoint, getEndpoint } from '@/core/ops/endpoint'
import { logAction } from '@/core/scenarios/engine'
import { useStore } from '@/core/store'
import { ADMIN_WORKSTATION, completions, runCommand, type RunResult } from './interpreter'

export interface TerminalAppProps {
  /** Hostname des Endpunkts, auf dem die Befehle laufen (z.B. "PC-VT-001" oder "IT-ADM-01") */
  hostname: string
  shell: 'cmd' | 'powershell'
  /** Als Administrator gestartet (Titelzeile, erweiterte Rechte) */
  admin?: boolean
  className?: string
}

interface Line {
  id: number
  text: string
  kind: 'out' | 'in' | 'err' | 'warn' | 'info'
}

const MAX_LINES = 3000

/** Kennwörter nicht im Klartext ins Aktionsprotokoll schreiben */
export function maskSecrets(line: string) {
  return line
    .replace(/(ConvertTo-SecureString\s+(?:-String\s+)?)(["'])(.*?)\2/gi, '$1$2***$2')
    .replace(/^(\s*net\s+user\s+\S+\s+)(?!\/)(\S+)/i, '$1***')
}

function banner(shell: 'cmd' | 'powershell') {
  return shell === 'cmd'
    ? 'Microsoft Windows [Version 10.0.26100.2033]\n(Trainingsumgebung der Musterwerk AG – "help" zeigt alle unterstützten Befehle.)\n'
    : 'Windows PowerShell\n(Trainingsumgebung der Musterwerk AG – "help" zeigt alle unterstützten Befehle und Cmdlets.)\n'
}

let lineId = 0
const mk = (text: string, kind: Line['kind'] = 'out'): Line => ({ id: ++lineId, text, kind })

function classify(shell: 'cmd' | 'powershell', text: string): Line['kind'] {
  if (shell === 'powershell' && /FullyQualifiedErrorId|CommandNotFoundException/.test(text)) return 'err'
  if (shell === 'powershell' && /^WARNUNG:/.test(text)) return 'warn'
  return 'out'
}

export function TerminalApp({ hostname, shell, admin = false, className }: TerminalAppProps) {
  const updateWorld = useStore((s) => s.updateWorld)
  const exists = useStore((s) => !!getEndpoint(s.world, hostname))
  const loggedOn = useStore((s) => getEndpoint(s.world, hostname)?.loggedOnUser)
  const techSam = useStore((s) => s.world.tech.sam)
  const user = loggedOn ?? techSam
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    if (exists) return
    let ok = false
    updateWorld((w) => {
      ok = !!ensureEndpoint(w, hostname)
    })
    if (!ok) setMissing(true)
  }, [exists, hostname, updateWorld])

  const homeCwd = admin ? 'C:\\Windows\\system32' : `C:\\Users\\${user}`
  const [lines, setLines] = useState<Line[]>(() => [mk(banner(shell), 'info')])
  const [cwd, setCwd] = useState(homeCwd)
  const [remote, setRemote] = useState<string | undefined>()
  const [savedCwd, setSavedCwd] = useState(homeCwd)
  const [input, setInput] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [histIdx, setHistIdx] = useState<number | null>(null)
  const [closed, setClosed] = useState(false)
  const tabState = useRef<{ prefix: string; matches: string[]; i: number } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Sobald der Endpunkt erzeugt ist, Startverzeichnis des angemeldeten Benutzers übernehmen
  useEffect(() => {
    if (exists && !history.length && !remote) setCwd(homeCwd)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exists, homeCwd])

  const ps = shell === 'powershell'
  const prompt = remote ? `[${remote}]: PS ${cwd}>` : ps ? `PS ${cwd}>` : `${cwd}>`
  const adTools = hostname.toUpperCase() === ADMIN_WORKSTATION && !remote
  const cmdList = useMemo(() => completions(shell, adTools), [shell, adTools])

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines, closed])

  const append = useCallback((add: Line[]) => setLines((l) => [...l, ...add].slice(-MAX_LINES)), [])

  const execute = (raw: string) => {
    const line = raw
    append([mk(`${prompt} ${line}`.replace(/ $/, ''), 'in')])
    if (line.trim()) setHistory((h) => (h[h.length - 1] === line ? h : [...h, line].slice(-200)))
    setHistIdx(null)
    if (!line.trim()) return
    let result: RunResult | undefined
    updateWorld(
      (w) => {
        result = runCommand(w, { hostname, shell, cwd, admin, remote, user: remote ? techSam : user }, line)
        const ticketId = useStore.getState().activeTicketId
        for (const a of result.actions) logAction(w, { ticketId, ...a })
      },
      { type: A.command, target: remote ?? hostname, detail: maskSecrets(line) },
    )
    const r = result
    if (!r) return
    if (r.clear) setLines([])
    else if (r.output) append([mk(r.output, classify(shell, r.output))])
    if (r.enterRemote) {
      setSavedCwd(cwd)
      setRemote(r.enterRemote)
      setCwd(r.cwd ?? 'C:\\Users\\azubi\\Documents')
      return
    }
    if (r.exitRemote) {
      setRemote(undefined)
      setCwd(savedCwd)
      return
    }
    if (r.cwd) setCwd(r.cwd)
    if (r.exit) setClosed(true)
  }

  const restart = () => {
    setLines([mk(banner(shell), 'info')])
    setCwd(homeCwd)
    setRemote(undefined)
    setClosed(false)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Tab') tabState.current = null
    if (e.key === 'Enter') {
      e.preventDefault()
      const v = input
      setInput('')
      execute(v)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (!history.length) return
      const i = histIdx === null ? history.length - 1 : Math.max(0, histIdx - 1)
      setHistIdx(i)
      setInput(history[i])
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (histIdx === null) return
      const i = histIdx + 1
      if (i >= history.length) {
        setHistIdx(null)
        setInput('')
      } else {
        setHistIdx(i)
        setInput(history[i])
      }
    } else if (e.key === 'Tab') {
      e.preventDefault()
      if (input.includes(' ')) return
      let st = tabState.current
      if (!st) {
        const prefix = input.toLowerCase()
        const matches = cmdList.filter((c) => c.toLowerCase().startsWith(prefix)).sort((a, b) => a.length - b.length || a.localeCompare(b))
        if (!matches.length) return
        st = { prefix, matches, i: -1 }
      }
      st.i = (st.i + 1) % st.matches.length
      tabState.current = st
      setInput(st.matches[st.i])
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault()
      setLines([])
    } else if (e.key === 'c' && e.ctrlKey && !window.getSelection()?.toString()) {
      e.preventDefault()
      append([mk(`${prompt} ${input}^C`, 'in')])
      setInput('')
    }
  }

  const focusInput = () => {
    if (window.getSelection()?.toString()) return
    inputRef.current?.focus()
  }

  const title = `${admin ? 'Administrator: ' : ''}${ps ? 'Windows PowerShell' : 'Eingabeaufforderung'}`
  const bg = ps ? 'bg-[#012456]' : 'bg-black'
  const color: Record<Line['kind'], string> = { out: ps ? 'text-slate-100' : 'text-slate-200', in: ps ? 'text-white' : 'text-slate-100', err: 'text-red-400', warn: 'text-yellow-300', info: ps ? 'text-slate-200' : 'text-slate-300' }

  return (
    <div className={`flex min-h-0 flex-col overflow-hidden ${bg} ${className ?? ''}`}>
      <div className={`flex shrink-0 items-center justify-between gap-2 border-b px-3 py-1 text-xs ${ps ? 'border-[#1d3f73] bg-[#0b2c5c] text-slate-200' : 'border-neutral-800 bg-neutral-900 text-neutral-300'}`}>
        <span className="truncate font-medium">{title}</span>
        <span className="shrink-0 font-mono text-[11px] opacity-80">
          {remote ? `${hostname} → ${remote}` : hostname}
          {remote ? ' (Remotesitzung)' : ''}
        </span>
      </div>
      <div ref={scrollRef} onClick={focusInput} className="min-h-0 flex-1 cursor-text overflow-auto px-3 py-2 font-mono text-[13px] leading-[1.35] select-text">
        {missing && <div className="mb-2 text-red-400">Der Computer „{hostname}“ ist nicht als Client verfügbar.</div>}
        {lines.map((l) => (
          <pre key={l.id} className={`m-0 whitespace-pre-wrap break-words font-mono ${color[l.kind]}`}>
            {l.text || ' '}
          </pre>
        ))}
        {closed ? (
          <div className="mt-2 text-slate-400">
            [Sitzung beendet]{' '}
            <button type="button" onClick={restart} className="ml-2 rounded border border-slate-600 px-2 py-0.5 text-xs text-slate-200 hover:bg-slate-700">
              Neue Sitzung öffnen
            </button>
          </div>
        ) : (
          <div className={`flex items-baseline ${color.in}`}>
            <span className="shrink-0 whitespace-pre">{prompt}&nbsp;</span>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value)
                tabState.current = null
              }}
              onKeyDown={onKey}
              autoFocus
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              aria-label="Befehlseingabe"
              disabled={missing}
              className={`min-w-0 flex-1 border-none bg-transparent p-0 font-mono text-[13px] outline-none ${color.in} caret-current`}
            />
          </div>
        )}
      </div>
    </div>
  )
}
