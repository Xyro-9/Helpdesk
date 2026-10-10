// Gemeinsame Bausteine des Terminal-Interpreters: Typen, Tokenizer, Parameter, Ausgabeformatierung, Pipeline-Filter.

import type { Endpoint, World } from '@/core/types'
import { expandEnv } from '@/core/ops/endpoint'

export type ShellKind = 'cmd' | 'powershell'

export interface ShellCtx {
  hostname: string
  shell: ShellKind
  cwd: string
  admin: boolean
  /** Remote-Sitzung (Enter-PSSession) – Befehle laufen auf diesem Host */
  remote?: string
  user: string
}

export interface ActionReq {
  type: string
  target?: string
  detail?: string
}

export interface RunResult {
  output: string
  cwd?: string
  clear?: boolean
  exit?: boolean
  enterRemote?: string
  exitRemote?: boolean
  actions: ActionReq[]
}

export type Val = string | number | boolean | undefined | null | string[]
export type Rec = Record<string, Val>

/** Objektausgabe (PowerShell) – wird am Ende der Pipeline als Tabelle oder Liste gerendert */
export interface ObjOut {
  kind: 'obj'
  objs: Rec[]
  cols: string[]
  list?: boolean
}

export type Out = string | ObjOut

export interface Env {
  w: World
  ep: Endpoint
  ctx: ShellCtx
  /** Hostname, auf dem der Befehl tatsächlich läuft (lokal oder Remote) */
  host: string
  ps: boolean
  admin: boolean
  user: string
  /** AD-/Cloud-Cmdlets verfügbar (Admin-Arbeitsplatz) */
  adTools: boolean
  actions: ActionReq[]
  res: Partial<RunResult>
  /** Befehlsname wie eingegeben */
  cmd: string
  /** Eingabe aus der Pipeline */
  input?: Out
}

export type Handler = (e: Env, args: string[], rest: string) => Out

export const obj = (objs: Rec[], cols: string[], list = false): ObjOut => ({ kind: 'obj', objs, cols, list })
export const isObj = (o: Out | undefined): o is ObjOut => typeof o === 'object' && o !== null && o.kind === 'obj'

// ─────────────── Tokenizer ───────────────

/** Zerlegt eine Zeile in Tokens. Anführungszeichen werden entfernt, {…} und (…) bleiben als ein Token erhalten. */
export function tokenize(s: string): string[] {
  const out: string[] = []
  let cur = ''
  let q: string | null = null
  let depth = 0
  let has = false
  for (const ch of s) {
    if (depth > 0) {
      cur += ch
      if (ch === '{' || ch === '(') depth++
      else if (ch === '}' || ch === ')') depth--
      continue
    }
    if (q) {
      if (ch === q) q = null
      else cur += ch
      continue
    }
    if (ch === '"' || ch === "'") {
      q = ch
      has = true
      continue
    }
    if ((ch === '{' || ch === '(') && cur === '') {
      depth = 1
      cur = ch
      has = true
      continue
    }
    if (/\s/.test(ch)) {
      if (cur || has) out.push(cur)
      cur = ''
      has = false
      continue
    }
    cur += ch
  }
  if (cur || has) out.push(cur)
  return out
}

/** Teilt an einem Trennzeichen außerhalb von Anführungszeichen und Klammern */
export function splitTop(s: string, sep: string): string[] {
  const parts: string[] = []
  let cur = ''
  let q: string | null = null
  let depth = 0
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (q) {
      if (ch === q) q = null
      cur += ch
      continue
    }
    if (ch === '"' || ch === "'") q = ch
    else if (ch === '{' || ch === '(') depth++
    else if (ch === '}' || ch === ')') depth = Math.max(0, depth - 1)
    if (depth === 0 && s.startsWith(sep, i)) {
      parts.push(cur)
      cur = ''
      i += sep.length - 1
      continue
    }
    cur += ch
  }
  parts.push(cur)
  return parts
}

/** Findet eine Umleitung > bzw. >> außerhalb von Anführungszeichen */
export function parseRedirect(s: string): { cmd: string; file?: string; append?: boolean } {
  let q: string | null = null
  let depth = 0
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (q) {
      if (ch === q) q = null
      continue
    }
    if (ch === '"' || ch === "'") q = ch
    else if (ch === '{' || ch === '(') depth++
    else if (ch === '}' || ch === ')') depth = Math.max(0, depth - 1)
    else if (ch === '>' && depth === 0) {
      // 2>&1 / 2>nul ignorieren
      if (s[i - 1] === '2') {
        const m = s.slice(i + 1).match(/^(&1|nul|\$null)/i)
        if (m) {
          s = s.slice(0, i - 1) + s.slice(i + 1 + m[0].length)
          i -= 2
          continue
        }
      }
      const append = s[i + 1] === '>'
      const file = s.slice(i + (append ? 2 : 1)).trim().replace(/^["']|["']$/g, '')
      return { cmd: s.slice(0, i).trimEnd(), file, append }
    }
  }
  return { cmd: s }
}

// ─────────────── Parameter ───────────────

export interface Args {
  pos: string[]
  named: Record<string, string>
  flags: Set<string>
}

/** PowerShell-Parameter: -Name Wert, -Switch, -Param:Wert */
export function psArgs(tokens: string[], switches: string[] = []): Args {
  const a: Args = { pos: [], named: {}, flags: new Set() }
  const sw = switches.map((s) => s.toLowerCase())
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    const m = t.match(/^-([A-Za-z][\w-]*)(?::(.*))?$/)
    if (!m) {
      a.pos.push(t)
      continue
    }
    const key = m[1].toLowerCase()
    if (m[2] !== undefined) {
      a.named[key] = m[2]
      continue
    }
    if (sw.some((s) => s === key || (key.length >= 3 && s.startsWith(key)))) {
      a.flags.add(sw.find((s) => s === key || s.startsWith(key))!)
      continue
    }
    const next = tokens[i + 1]
    if (next !== undefined && !/^-[A-Za-z]/.test(next)) {
      a.named[key] = next
      i++
    } else a.flags.add(key)
  }
  return a
}

const matchKey = (k: string, names: string[]) => names.some((n) => n === k || (k.length >= 3 && n.startsWith(k)))

/** Liest einen benannten Parameter (mit Aliasen und Präfix-Abkürzung) */
export function arg(a: Args, ...names: string[]): string | undefined {
  const ns = names.map((n) => n.toLowerCase())
  for (const [k, v] of Object.entries(a.named)) if (matchKey(k, ns)) return v
  return undefined
}

export function has(a: Args, ...names: string[]): boolean {
  const ns = names.map((n) => n.toLowerCase())
  for (const f of a.flags) if (matchKey(f, ns)) return true
  for (const [k, v] of Object.entries(a.named)) if (matchKey(k, ns) && !/^\$?false$/i.test(v)) return true
  return false
}

/** Wert eines Parameters oder erstes Positionsargument */
export const argOrPos = (a: Args, idx: number, ...names: string[]) => arg(a, ...names) ?? a.pos[idx]

/** "a,b" / ("a","b") / @('a') → Liste */
export const list = (v: string | undefined): string[] =>
  (v ?? '')
    .replace(/^@?\(|\)$/g, '')
    .split(',')
    .map((x) => x.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean)

export const boolArg = (v: string | undefined) => (v === undefined ? undefined : /^\$?true$|^1$/i.test(v.trim()))

/** cmd-Optionen: /all, -n 4, /fi "…" */
export const lowerArgs = (args: string[]) => args.map((x) => x.toLowerCase())

export function optVal(args: string[], ...names: string[]): string | undefined {
  const ns = names.map((n) => n.toLowerCase())
  for (let i = 0; i < args.length; i++) {
    const t = args[i].toLowerCase()
    for (const n of ns) {
      if (t === n) return args[i + 1]
      if (t.startsWith(n + ':') || t.startsWith(n + '=')) return args[i].slice(n.length + 1)
    }
  }
  return undefined
}

// ─────────────── Umgebung / Pfade ───────────────

export function expand(e: Env, s: string): string {
  return expandEnv(e.ep, s)
    .replace(/%computername%|\$env:computername/gi, e.host)
    .replace(/%userdomain%|\$env:userdomain/gi, 'MUSTERWERK')
    .replace(/%logonserver%|\$env:logonserver/gi, '\\\\DC01')
    .replace(/%appdata%|\$env:appdata/gi, `C:\\Users\\${e.ep.loggedOnUser ?? 'administrator'}\\AppData\\Roaming`)
    .replace(/%localappdata%|\$env:localappdata/gi, `C:\\Users\\${e.ep.loggedOnUser ?? 'administrator'}\\AppData\\Local`)
    .replace(/%programfiles%|\$env:programfiles/gi, 'C:\\Program Files')
    .replace(/%cd%|\$pwd/gi, e.ctx.cwd)
}

/** Absoluter, normalisierter Dateipfad relativ zum aktuellen Verzeichnis */
export function absPath(e: Env, p: string): string {
  let s = expand(e, p.trim()).replace(/\//g, '\\').replace(/^Microsoft\.PowerShell\.Core\\FileSystem::/i, '')
  if (/^\\\\/.test(s)) return s
  const cwd = e.ctx.cwd
  if (/^[a-z]:$/i.test(s)) s = s.toUpperCase() + '\\'
  else if (/^[a-z]:[^\\]/i.test(s)) s = s.slice(0, 2) + '\\' + s.slice(2)
  else if (s.startsWith('\\')) s = cwd.slice(0, 2) + s
  else if (!/^[a-z]:\\/i.test(s)) s = cwd.replace(/\\$/, '') + '\\' + s
  const drive = s.slice(0, 2).toUpperCase()
  const parts: string[] = []
  for (const part of s.slice(3).split('\\')) {
    if (!part || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return `${drive}\\${parts.join('\\')}`
}

// ─────────────── Formatierung ───────────────

const pad2 = (n: number) => String(n).padStart(2, '0')
export const fmtD = (iso?: string) => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`
}
export const fmtT = (iso?: string, sec = false) => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}${sec ? ':' + pad2(d.getSeconds()) : ''}`
}
export const fmtDT = (iso?: string) => (iso ? `${fmtD(iso)} ${fmtT(iso, true)}` : '')
export const num = (n: number, digits = 0) => n.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits })

/** "Label . . . . . : Wert" wie bei ipconfig */
export function dots(label: string, width = 36) {
  let s = label + ' '
  while (s.length < width) s += s.length % 2 === 0 ? ' ' : '.'
  return s.slice(0, width) + ': '
}

export const psBool = (b: boolean | undefined) => (b ? 'True' : 'False')

function valStr(v: Val): string {
  if (v === undefined || v === null) return ''
  if (Array.isArray(v)) return `{${v.join(', ')}}`
  if (typeof v === 'boolean') return psBool(v)
  return String(v)
}

export function renderTable(objs: Rec[], cols: string[]): string {
  if (!objs.length) return ''
  const widths = cols.map((c) => Math.min(60, Math.max(c.length, ...objs.map((o) => valStr(o[c]).length))))
  const isNum = cols.map((c) => objs.every((o) => typeof o[c] === 'number' || o[c] === undefined || o[c] === ''))
  const cell = (s: string, i: number, last: boolean) => {
    const t = s.length > widths[i] ? s.slice(0, widths[i] - 3) + '...' : s
    return isNum[i] ? t.padStart(widths[i]) : last ? t : t.padEnd(widths[i])
  }
  const line = (vals: string[]) => vals.map((v, i) => cell(v, i, i === vals.length - 1)).join(' ').trimEnd()
  return ['', line(cols), line(cols.map((c) => '-'.repeat(c.length))), ...objs.map((o) => line(cols.map((c) => valStr(o[c])))), ''].join('\n')
}

export function renderList(objs: Rec[], cols: string[]): string {
  if (!objs.length) return ''
  const w = Math.max(...cols.map((c) => c.length))
  const blocks = objs.map((o) =>
    cols
      .map((c) => {
        const v = valStr(o[c])
        return `${c.padEnd(w)} : ${v.split('\n').join('\n' + ' '.repeat(w + 3))}`
      })
      .join('\n'),
  )
  return '\n' + blocks.join('\n\n') + '\n'
}

export function render(out: Out | undefined): string {
  if (out === undefined) return ''
  if (!isObj(out)) return out
  if (!out.objs.length) return ''
  return out.list ? renderList(out.objs, out.cols) : renderTable(out.objs, out.cols)
}

// ─────────────── Fehlermeldungen ───────────────

export function psError(e: Env, msg: string, category = 'NotSpecified') {
  const c = e.cmd
  return `${c} : ${msg}\nIn Zeile:1 Zeichen:1\n+ ${c} ...\n+ ${'~'.repeat(Math.max(1, c.length))}\n    + CategoryInfo          : ${category}: (:) [${c}], Exception\n    + FullyQualifiedErrorId : ${category},${c}`
}

export const elevationMsg = (e: Env) =>
  e.ps ? psError(e, 'Zugriff verweigert. Für diesen Vorgang sind erhöhte Rechte erforderlich (PowerShell "Als Administrator ausführen").', 'PermissionDenied') : 'Zugriff verweigert.\nFür diesen Vorgang sind erhöhte Rechte erforderlich (Eingabeaufforderung "Als Administrator ausführen").'

export const act = (e: Env, type: string, target?: string, detail?: string) => e.actions.push({ type, target, detail })

// ─────────────── Pipeline-Filter ───────────────

export function wildToRe(p: string) {
  return new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i')
}

function getProp(o: Rec, name: string): Val {
  const k = Object.keys(o).find((x) => x.toLowerCase() === name.toLowerCase())
  return k ? o[k] : undefined
}

function compare(v: Val, op: string, raw: string): boolean {
  const target = raw.replace(/^\$true$/i, 'True').replace(/^\$false$/i, 'False').replace(/^\$null$/i, '')
  const s = valStr(v)
  const n1 = Number(s)
  const n2 = Number(target)
  switch (op) {
    case 'eq':
      return s.toLowerCase() === target.toLowerCase()
    case 'ne':
      return s.toLowerCase() !== target.toLowerCase()
    case 'like':
      return wildToRe(target).test(s)
    case 'notlike':
      return !wildToRe(target).test(s)
    case 'match':
      try {
        return new RegExp(target, 'i').test(s)
      } catch {
        return false
      }
    case 'notmatch':
      try {
        return !new RegExp(target, 'i').test(s)
      } catch {
        return true
      }
    case 'contains':
      return Array.isArray(v) ? v.some((x) => x.toLowerCase() === target.toLowerCase()) : s.toLowerCase() === target.toLowerCase()
    case 'gt':
      return n1 > n2
    case 'ge':
      return n1 >= n2
    case 'lt':
      return n1 < n2
    case 'le':
      return n1 <= n2
  }
  return false
}

/** Bedingungen aus {$_.Status -eq 'Running' -and $_.Name -like 'W*'} oder "Status -eq Running" */
function parseConds(expr: string): { prop: string; op: string; val: string }[] {
  const conds: { prop: string; op: string; val: string }[] = []
  const re = /(?:\$_\.|\$PSItem\.)?([A-Za-z][\w]*)\s+-(eq|ne|like|notlike|match|notmatch|contains|gt|ge|lt|le)\s+(?:'([^']*)'|"([^"]*)"|([^\s})]+))/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(expr))) conds.push({ prop: m[1], op: m[2].toLowerCase(), val: m[3] ?? m[4] ?? m[5] ?? '' })
  if (!conds.length) {
    const b = expr.match(/\$_\.(\w+)/)
    if (b) conds.push({ prop: b[1], op: /-not|!/.test(expr) ? 'eq' : 'ne', val: 'False' })
  }
  return conds
}

const textLines = (o: Out) => render(o).split('\n')

/** Wendet einen Pipeline-Filter an. Liefert undefined, wenn der Befehl kein Filter ist. */
export function applyFilter(name: string, tokens: string[], rawArgs: string, input: Out): Out | undefined {
  const n = name.toLowerCase()
  const a = psArgs(tokens, ['descending', 'unique', 'casesensitive', 'simplematch', 'notmatch', 'autosize', 'wrap', 'property', 'force'])
  switch (n) {
    case 'where-object':
    case 'where':
    case '?': {
      const conds = parseConds(rawArgs)
      if (isObj(input)) return { ...input, objs: input.objs.filter((o) => conds.every((c) => compare(getProp(o, c.prop), c.op, c.val))) }
      const needle = conds[0]?.val ?? rawArgs.replace(/[{}$_.]/g, '').trim()
      return textLines(input).filter((l) => l.toLowerCase().includes(needle.toLowerCase())).join('\n')
    }
    case 'select-object':
    case 'select': {
      const first = arg(a, 'first')
      const last = arg(a, 'last')
      const expandP = arg(a, 'expandproperty')
      const props = list(arg(a, 'property') ?? a.pos.join(','))
      if (!isObj(input)) {
        let lines = textLines(input)
        if (first) lines = lines.filter((l) => l.trim()).slice(0, Number(first))
        if (last) lines = lines.filter((l) => l.trim()).slice(-Number(last))
        return lines.join('\n')
      }
      let objs = input.objs
      if (a.flags.has('unique')) objs = objs.filter((o, i) => objs.findIndex((x) => JSON.stringify(x) === JSON.stringify(o)) === i)
      if (first) objs = objs.slice(0, Number(first))
      if (last) objs = objs.slice(-Number(last))
      if (expandP) return objs.map((o) => { const v = getProp(o, expandP); return Array.isArray(v) ? v.join('\n') : valStr(v) }).join('\n')
      if (!props.length) return { ...input, objs }
      const cols = props.includes('*') ? Object.keys(objs[0] ?? {}) : props.map((p) => Object.keys(objs[0] ?? {}).find((k) => k.toLowerCase() === p.toLowerCase()) ?? p)
      return { kind: 'obj', objs: objs.map((o) => Object.fromEntries(cols.map((c) => [c, getProp(o, c)]))), cols, list: cols.length > 4 }
    }
    case 'format-list':
    case 'fl': {
      if (!isObj(input)) return input
      const props = list(arg(a, 'property') ?? a.pos.join(','))
      const all = props.includes('*')
      const cols = all ? [...new Set(input.objs.flatMap((o) => Object.keys(o)))] : props.length ? props.map((p) => Object.keys(input.objs[0] ?? {}).find((k) => k.toLowerCase() === p.toLowerCase()) ?? p) : input.cols
      return { ...input, cols, list: true }
    }
    case 'format-table':
    case 'ft': {
      if (!isObj(input)) return input
      const props = list(arg(a, 'property') ?? a.pos.join(','))
      const cols = props.length && !props.includes('*') ? props.map((p) => Object.keys(input.objs[0] ?? {}).find((k) => k.toLowerCase() === p.toLowerCase()) ?? p) : input.cols
      return { ...input, cols, list: false }
    }
    case 'sort-object':
    case 'sort': {
      if (!isObj(input)) return textLines(input).sort().join('\n')
      const prop = arg(a, 'property') ?? a.pos[0] ?? input.cols[0]
      const desc = a.flags.has('descending') || /^-desc/i.test(rawArgs)
      const objs = [...input.objs].sort((x, y) => {
        const vx = getProp(x, prop)
        const vy = getProp(y, prop)
        const r = typeof vx === 'number' && typeof vy === 'number' ? vx - vy : valStr(vx).localeCompare(valStr(vy), 'de')
        return desc ? -r : r
      })
      return { ...input, objs }
    }
    case 'measure-object':
    case 'measure': {
      const count = isObj(input) ? input.objs.length : textLines(input).filter((l) => l.trim()).length
      return obj([{ Count: count, Average: '', Sum: '', Maximum: '', Minimum: '', Property: '' }], ['Count', 'Average', 'Sum', 'Maximum', 'Minimum', 'Property'], true)
    }
    case 'findstr':
    case 'find':
    case 'select-string':
    case 'sls': {
      const inv = /\/v\b/i.test(rawArgs) || a.flags.has('notmatch')
      const pattern = (arg(a, 'pattern') ?? tokens.filter((t) => !/^\/[a-z]$/i.test(t) && !/^-/.test(t))[0] ?? '').toLowerCase()
      const words = n === 'findstr' ? pattern.split(/\s+/).filter(Boolean) : [pattern]
      return textLines(input)
        .filter((l) => {
          const hit = words.some((w) => l.toLowerCase().includes(w))
          return inv ? !hit && l.trim() : hit
        })
        .join('\n')
    }
    case 'out-string':
    case 'out-host':
    case 'out-default':
    case 'more':
    case 'oh':
      return input
    case 'out-null':
      return ''
    case 'format-wide':
    case 'fw': {
      if (!isObj(input)) return input
      const p = a.pos[0] ?? input.cols[0]
      return input.objs.map((o) => valStr(getProp(o, p))).join('\n')
    }
  }
  return undefined
}

export const FILTER_NAMES = ['where-object', 'where', '?', 'select-object', 'select', 'format-list', 'fl', 'format-table', 'ft', 'sort-object', 'sort', 'measure-object', 'measure', 'findstr', 'find', 'select-string', 'sls', 'out-string', 'out-host', 'out-default', 'more', 'oh', 'out-null', 'format-wide', 'fw']
