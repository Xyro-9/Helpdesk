// Dateisystem und Registry: dir, cd, type, del, mkdir, echo >, copy, move, reg, Get-ItemProperty …

import { A } from '@/core/actions'
import type { FsNode, RegKey, RegType } from '@/core/types'
import { deleteFs, deleteRegKey, deleteRegValue, ensureRegKey, freeGb, getRegKey, getRegValue, makeDir, readFile, regPathParts, resolveFs, setRegValue, shareAccess, writeFile } from '@/core/ops/endpoint'
import { uncReachable, sysErr } from './netres'
import { absPath, act, arg, argOrPos, elevationMsg, fmtD, fmtT, has, num, obj, psArgs, psError, wildToRe, type Env, type Handler, type Rec } from './shell'

// ─────────────── Hilfen ───────────────

const isReg = (p: string) => /^(hk(lm|cu|cr|u|cc)|hkey_[a-z_]+)(:|\\|$)|^registry::/i.test(p.trim())

export function needsAdmin(e: Env, abs: string): boolean {
  if (e.admin) return false
  const p = abs.toLowerCase()
  if (/^c:\\(windows|program files|program files \(x86\)|programdata)(\\|$)/.test(p)) return true
  const m = p.match(/^c:\\users\\([^\\]+)/)
  if (m && m[1] !== e.user.toLowerCase() && m[1] !== 'public') return true
  if (/^c:\\[^\\]+$/.test(p)) return true
  return false
}

const bytes = (n: FsNode) => Math.round((n.sizeMb ?? 0) * 1048576)

/** Virtuelle Verzeichnisliste einer Netzwerkfreigabe (Netzlaufwerk oder UNC) */
function shareListing(e: Env, abs: string): FsNode[] | string | undefined {
  let unc = abs
  if (/^[a-z]:/i.test(abs)) {
    const d = e.ep.mappedDrives.find((x) => x.letter.toUpperCase() === abs.slice(0, 2).toUpperCase())
    if (!d) return undefined
    unc = d.path + abs.slice(2).replace(/\\$/, '')
  } else if (!abs.startsWith('\\\\')) return undefined
  const net = uncReachable(e, unc)
  if (net) return sysErr(net)
  const acc = shareAccess(e.w, e.ep, unc)
  if (!acc.ok) return sysErr(acc.error ?? 'Systemfehler 5: Zugriff verweigert.')
  const parts = unc.replace(/^\\\\/, '').split('\\')
  const share = e.w.infra.shares.find((s) => s.server === parts[0].toUpperCase() && s.name.toLowerCase() === (parts[1] ?? '').toLowerCase())
  const now = new Date().toISOString()
  if (!share) return []
  if (parts.length > 2) return [{ name: 'Dokumente.docx', type: 'file', sizeMb: 0.04, modified: now }]
  return share.folders.map((f) => ({ name: f, type: 'dir', children: [], modified: now }))
}

function splitWild(abs: string): { dir: string; pattern?: RegExp; patternRaw?: string } {
  const idx = abs.lastIndexOf('\\')
  const last = abs.slice(idx + 1)
  if (/[*?]/.test(last)) return { dir: abs.slice(0, idx) || abs.slice(0, 2) + '\\', pattern: wildToRe(last), patternRaw: last }
  return { dir: abs }
}

// ─────────────── dir / Get-ChildItem ───────────────

function listDir(e: Env, pathArg: string | undefined, showHidden: boolean): { dir: string; nodes: FsNode[] } | string {
  const abs = absPath(e, pathArg || '.')
  const { dir, pattern } = splitWild(abs)
  const share = shareListing(e, dir)
  if (typeof share === 'string') return share
  let nodes: FsNode[]
  if (share) nodes = share
  else {
    const node = resolveFs(e.ep, dir)
    if (!node) return `NOTFOUND:${abs}`
    if (node.type === 'file') return { dir: dir.slice(0, dir.lastIndexOf('\\')), nodes: [node] }
    if (needsAdmin(e, dir) && /^c:\\users\\/i.test(dir)) return `DENIED:${dir}`
    nodes = node.children ?? []
  }
  nodes = nodes.filter((n) => (showHidden || !n.hidden) && (!pattern || pattern.test(n.name)))
  return { dir, nodes }
}

export const dirCmd: Handler = (e, args) => {
  if (e.ps) return getChildItem(e, args.map((x) => (x.toLowerCase() === '/a' ? '-Force' : x)), '')
  const low = args.map((x) => x.toLowerCase())
  const showHidden = low.some((x) => x.startsWith('/a'))
  const bare = low.includes('/b')
  const p = args.find((x) => !x.startsWith('/'))
  const r = listDir(e, p, showHidden)
  if (typeof r === 'string') {
    if (r.startsWith('NOTFOUND:')) return 'Datei nicht gefunden'
    if (r.startsWith('DENIED:')) return 'Zugriff verweigert'
    return r
  }
  if (bare) return r.nodes.map((n) => n.name).join('\n')
  const drive = r.dir.slice(0, 2).toUpperCase()
  const files = r.nodes.filter((n) => n.type === 'file')
  const dirs = r.nodes.filter((n) => n.type === 'dir')
  const total = files.reduce((s, n) => s + bytes(n), 0)
  const line = (n: FsNode) => `${fmtD(n.modified)}  ${fmtT(n.modified)}    ${n.type === 'dir' ? '<DIR>         ' : num(bytes(n)).padStart(14)} ${n.name}`
  const free = Math.round(freeGb(e.ep, drive) * 1073741824)
  const isRoot = /^[A-Z]:\\?$/i.test(r.dir)
  return [
    ` Volume in Laufwerk ${drive} ${e.ep.fs[drive] ? 'ist Windows' : 'ist Netzlaufwerk'}`,
    ` Volumeseriennummer: ${(e.host.length * 4099).toString(16).toUpperCase().padStart(4, '0')}-1F02`,
    '',
    ` Verzeichnis von ${r.dir.replace(/\\$/, '') || drive}${isRoot ? '\\' : ''}`,
    '',
    ...(isRoot ? [] : [`${fmtD(new Date().toISOString())}  ${fmtT(new Date().toISOString())}    <DIR>          .`, `${fmtD(new Date().toISOString())}  ${fmtT(new Date().toISOString())}    <DIR>          ..`]),
    ...r.nodes.map(line),
    `${String(files.length).padStart(16)} Datei(en),${num(total).padStart(18)} Bytes`,
    `${String(dirs.length + (isRoot ? 0 : 2)).padStart(16)} Verzeichnis(se),${num(free).padStart(16)} Bytes frei`,
  ].join('\n')
}

const mode = (n: FsNode) => `${n.type === 'dir' ? 'd' : '-'}${n.type === 'file' && !n.readOnly ? 'a' : '-'}${n.readOnly ? 'r' : '-'}${n.hidden ? 'h' : '-'}${n.system ? 's' : '-'}-`

export const getChildItem: Handler = (e, args) => {
  const a = psArgs(args, ['force', 'recurse', 'file', 'directory', 'name'])
  const p = argOrPos(a, 0, 'path', 'literalpath')
  if (p && isReg(p)) return regChildren(e, p)
  const filter = arg(a, 'filter', 'include')
  const blocks: string[] = []
  const walk = (path: string | undefined, depth: number): string | undefined => {
    const r = listDir(e, path, has(a, 'force'))
    if (typeof r === 'string') {
      if (r.startsWith('NOTFOUND:')) return psError(e, `Der Pfad "${r.slice(9)}" kann nicht gefunden werden, da er nicht vorhanden ist.`, 'ObjectNotFound')
      if (r.startsWith('DENIED:')) return psError(e, `Der Zugriff auf den Pfad "${r.slice(7)}" wurde verweigert.`, 'PermissionDenied')
      return psError(e, r, 'ReadError')
    }
    let nodes = r.nodes
    if (filter) nodes = nodes.filter((n) => wildToRe(filter).test(n.name))
    if (has(a, 'file')) nodes = nodes.filter((n) => n.type === 'file')
    if (has(a, 'directory')) nodes = nodes.filter((n) => n.type === 'dir')
    if (nodes.length) {
      if (has(a, 'name')) blocks.push(nodes.map((n) => n.name).join('\n'))
      else blocks.push(['', `    Verzeichnis: ${r.dir}`, '', '', 'Mode                 LastWriteTime         Length Name', '----                 -------------         ------ ----', ...nodes.map((n) => `${mode(n).padEnd(14)}${fmtD(n.modified).padStart(10)}${fmtT(n.modified).padStart(9)}${(n.type === 'file' ? String(bytes(n)) : '').padStart(15)} ${n.name}`)].join('\n'))
    }
    if (has(a, 'recurse') && depth < 6) for (const d of r.nodes.filter((n) => n.type === 'dir')) walk(`${r.dir.replace(/\\$/, '')}\\${d.name}`, depth + 1)
    return undefined
  }
  const err = walk(p, 0)
  return err ?? blocks.join('\n') + '\n'
}

// ─────────────── cd ───────────────

export const cdCmd: Handler = (e, args) => {
  const pos = args.filter((x) => x.toLowerCase() !== '/d')
  const target = (e.ps ? psArgs(args).named.path : undefined) ?? pos.join(' ').trim()
  if (!target) return e.ps ? '' : e.ctx.cwd
  if (isReg(target)) return e.ps ? psError(e, 'Die Registry-Navigation per Set-Location wird im Simulator nicht unterstützt. Verwenden Sie Get-ChildItem/Get-ItemProperty HKCU:\\…', 'NotImplemented') : 'Das System kann den angegebenen Pfad nicht finden.'
  const abs = absPath(e, target === '~' ? '%userprofile%' : target)
  const share = shareListing(e, abs)
  if (typeof share === 'string') return e.ps ? psError(e, share, 'ReadError') : share
  if (!share) {
    const node = resolveFs(e.ep, abs)
    if (!node || node.type !== 'dir') {
      if (!e.ep.fs[abs.slice(0, 2).toUpperCase()] && /^[a-z]:\\?$/i.test(abs)) return e.ps ? psError(e, `Es ist kein Laufwerk mit dem Namen "${abs[0]}" vorhanden.`, 'ObjectNotFound') : 'Das System kann das angegebene Laufwerk nicht finden.'
      return e.ps ? psError(e, `Der Pfad "${abs}" kann nicht gefunden werden, da er nicht vorhanden ist.`, 'ObjectNotFound') : 'Das System kann den angegebenen Pfad nicht finden.'
    }
  }
  // cmd: "cd D:\x" wechselt nur mit /d auch das Laufwerk
  if (!e.ps && abs.slice(0, 2).toUpperCase() !== e.ctx.cwd.slice(0, 2).toUpperCase() && !args.some((x) => x.toLowerCase() === '/d')) return ''
  e.res.cwd = abs
  return ''
}

export const driveChange = (e: Env, drive: string): string => {
  const d = drive.toUpperCase()
  if (!e.ep.fs[d] && !e.ep.mappedDrives.some((m) => m.letter === d)) return e.ps ? psError(e, `Es ist kein Laufwerk mit dem Namen "${d[0]}" vorhanden.`, 'ObjectNotFound') : 'Das System kann das angegebene Laufwerk nicht finden.'
  e.res.cwd = d + '\\'
  return ''
}

export const pwd: Handler = (e) => (e.ps ? obj([{ Path: e.ctx.cwd }], ['Path']) : e.ctx.cwd)

// ─────────────── type / Get-Content ───────────────

export const typeCmd: Handler = (e, args) => {
  const a = psArgs(args)
  const p = e.ps ? argOrPos(a, 0, 'path', 'literalpath') : args.join(' ')
  if (!p) return e.ps ? psError(e, 'Der Parameter "-Path" fehlt.') : 'Die Syntax für den Dateinamen, Verzeichnisnamen oder die Datenträgerbezeichnung ist falsch.'
  const abs = absPath(e, p)
  const node = resolveFs(e.ep, abs)
  if (!node) return e.ps ? psError(e, `Der Pfad "${abs}" kann nicht gefunden werden, da er nicht vorhanden ist.`, 'ObjectNotFound') : 'Das System kann die angegebene Datei nicht finden.'
  if (node.type === 'dir') return e.ps ? psError(e, `Der Zugriff auf den Pfad "${abs}" wurde verweigert (Verzeichnis).`, 'PermissionDenied') : 'Zugriff verweigert'
  const content = node.content ?? (node.sizeMb && node.sizeMb > 0.5 ? '(Binärdatei – Inhalt nicht darstellbar)' : '')
  let lines = content.replace(/\r/g, '').split('\n')
  const tail = arg(a, 'tail', 'last')
  const head = arg(a, 'totalcount', 'head', 'first')
  if (tail) lines = lines.slice(-Number(tail))
  if (head) lines = lines.slice(0, Number(head))
  return lines.join('\n')
}

// ─────────────── Schreiben ───────────────

export function writeOut(e: Env, file: string, text: string, append: boolean): string | null {
  if (/^nul$|^\$null$/i.test(file)) return null
  const abs = absPath(e, file)
  if (needsAdmin(e, abs)) return e.ps ? psError(e, `Der Zugriff auf den Pfad "${abs}" wurde verweigert.`, 'PermissionDenied') : 'Zugriff verweigert'
  const existing = readFile(e.ep, abs)
  const content = append && existing !== undefined ? existing + (existing.endsWith('\n') || !existing ? '' : '\n') + text + '\n' : text + '\n'
  const err = writeFile(e.ep, abs, content)
  if (err) return e.ps ? psError(e, err, 'WriteError') : err === 'Ziel ist ein Ordner.' ? 'Zugriff verweigert' : 'Das System kann den angegebenen Pfad nicht finden.'
  act(e, A.fileChanged, e.host, `${append ? 'Ergänzt' : 'Geschrieben'}: ${abs}`)
  return null
}

const contentCmd = (append: boolean): Handler => (e, args) => {
  const a = psArgs(args, ['force', 'nonewline'])
  const p = argOrPos(a, 0, 'path', 'literalpath', 'filepath')
  const v = arg(a, 'value') ?? a.pos[1] ?? (typeof e.input === 'string' ? e.input : undefined)
  if (!p) return psError(e, 'Der Parameter "-Path" fehlt.')
  return writeOut(e, p, (v ?? '').replace(/`t/g, '\t').replace(/`n/g, '\n'), append) ?? ''
}
export const setContent = contentCmd(false)
export const addContent = contentCmd(true)
export const outFile: Handler = (e, args) => {
  const a = psArgs(args, ['append', 'force'])
  const p = argOrPos(a, 0, 'filepath', 'path')
  if (!p) return psError(e, 'Der Parameter "-FilePath" fehlt.')
  return writeOut(e, p, typeof e.input === 'string' ? e.input : '', has(a, 'append')) ?? ''
}

export const clearContent: Handler = (e, args) => {
  const p = argOrPos(psArgs(args), 0, 'path')
  if (!p) return psError(e, 'Der Parameter "-Path" fehlt.')
  const abs = absPath(e, p)
  if (needsAdmin(e, abs)) return psError(e, `Der Zugriff auf den Pfad "${abs}" wurde verweigert.`, 'PermissionDenied')
  const err = writeFile(e.ep, abs, '')
  if (err) return psError(e, err)
  act(e, A.fileChanged, e.host, `Geleert: ${abs}`)
  return ''
}

export const mkdirCmd: Handler = (e, args) => {
  const a = psArgs(args, ['force'])
  const p = e.ps ? argOrPos(a, 0, 'path', 'name') : args.join(' ')
  if (!p) return e.ps ? psError(e, 'Der Parameter "-Path" fehlt.') : 'Die Syntax des Befehls ist falsch.'
  return makeDirs(e, absPath(e, p), !e.ps || has(a, 'force'))
}

function makeDirs(e: Env, abs: string, parents: boolean): string {
  if (needsAdmin(e, abs)) return e.ps ? psError(e, `Der Zugriff auf den Pfad "${abs}" wurde verweigert.`, 'PermissionDenied') : 'Zugriff verweigert'
  if (resolveFs(e.ep, abs)) return e.ps ? psError(e, `Ein Element mit dem angegebenen Namen "${abs}" ist bereits vorhanden.`, 'ResourceExists') : `Ein Unterverzeichnis oder eine Datei mit dem Namen "${abs}" existiert bereits.`
  const parts = abs.split('\\')
  for (let i = 2; i <= parts.length; i++) {
    const sub = parts.slice(0, i).join('\\')
    if (resolveFs(e.ep, sub)) continue
    if (i < parts.length && !parents) return 'Das System kann den angegebenen Pfad nicht finden.'
    const err = makeDir(e.ep, sub)
    if (err) return e.ps ? psError(e, err) : err
  }
  act(e, A.fileChanged, e.host, `Ordner erstellt: ${abs}`)
  return e.ps ? `\n    Verzeichnis: ${parts.slice(0, -1).join('\\')}\n\nMode                 LastWriteTime         Length Name\n----                 -------------         ------ ----\nd-----        ${fmtD(new Date().toISOString())}     ${fmtT(new Date().toISOString())}                ${parts[parts.length - 1]}\n` : ''
}

export const newItem: Handler = (e, args) => {
  const a = psArgs(args, ['force'])
  const path = argOrPos(a, 0, 'path')
  const name = arg(a, 'name')
  const type = (arg(a, 'itemtype', 'type') ?? 'File').toLowerCase()
  if (!path && !name) return psError(e, 'Der Parameter "-Path" fehlt.')
  const full = name ? `${path ?? '.'}\\${name}` : path!
  if (isReg(full)) {
    if (/^hklm|^hkey_local/i.test(full) && !e.admin) return elevationMsg(e)
    ensureRegKey(e.ep, full)
    act(e, A.registryChanged, e.host, `Schlüssel erstellt: ${full}`)
    return ''
  }
  const abs = absPath(e, full)
  if (type.startsWith('dir')) return makeDirs(e, abs, true)
  return writeOut(e, abs, arg(a, 'value') ?? '', false) ?? ''
}

// ─────────────── Löschen ───────────────

function deleteOne(e: Env, abs: string, out: string[], verbose: boolean): boolean {
  const node = resolveFs(e.ep, abs)
  if (node?.name.toLowerCase().endsWith('.ost') && e.ep.processes.some((p) => p.name.toUpperCase() === 'OUTLOOK.EXE')) {
    out.push(e.ps ? psError(e, `Das Element "${abs}" kann nicht entfernt werden: Der Prozess kann nicht auf die Datei zugreifen, da sie von einem anderen Prozess verwendet wird.`, 'WriteError') : `${abs}\nDer Prozess kann nicht auf die Datei zugreifen, da sie von einem anderen Prozess verwendet wird.`)
    return false
  }
  const err = deleteFs(e.ep, abs)
  if (err) {
    out.push(e.ps ? psError(e, err, 'PermissionDenied') : err.startsWith('Zugriff') ? `${abs}\nZugriff verweigert` : 'Das System kann die angegebene Datei nicht finden.')
    return false
  }
  if (verbose) out.push(`Gelöschte Datei - ${abs}`)
  return true
}

export const delCmd: Handler = (e, args) => {
  const ps = e.ps
  const a = psArgs(args, ['recurse', 'force', 'confirm', 'whatif'])
  const low = args.map((x) => x.toLowerCase())
  const paths = ps ? [arg(a, 'path', 'literalpath') ?? '', ...a.pos].flatMap((x) => x.split(',')).filter(Boolean) : args.filter((x) => !x.startsWith('/'))
  const recurse = ps ? has(a, 'recurse') : low.includes('/s')
  const rd = /^(rd|rmdir)$/i.test(e.cmd)
  if (!paths.length) return ps ? psError(e, 'Der Parameter "-Path" fehlt.') : 'Die Syntax des Befehls ist falsch.'
  const out: string[] = []
  let count = 0
  const before = freeGb(e.ep, 'C:')
  for (const p of paths) {
    if (isReg(p)) {
      if (/^hklm|^hkey_local/i.test(p) && !e.admin) return elevationMsg(e)
      if (!deleteRegKey(e.ep, p)) out.push(psError(e, `Der Pfad "${p}" kann nicht gefunden werden.`, 'ObjectNotFound'))
      else act(e, A.registryChanged, e.host, `Schlüssel gelöscht: ${p}`)
      continue
    }
    const abs = absPath(e, p)
    if (needsAdmin(e, abs)) {
      out.push(ps ? psError(e, `Der Zugriff auf den Pfad "${abs}" wurde verweigert.`, 'PermissionDenied') : 'Zugriff verweigert')
      continue
    }
    const { dir, pattern } = splitWild(abs)
    const parent = resolveFs(e.ep, dir)
    if (pattern) {
      if (!parent?.children) {
        out.push(ps ? psError(e, `Der Pfad "${dir}" kann nicht gefunden werden.`, 'ObjectNotFound') : 'Das System kann den angegebenen Pfad nicht finden.')
        continue
      }
      for (const c of [...parent.children].filter((n) => pattern.test(n.name))) {
        const cp = `${dir.replace(/\\$/, '')}\\${c.name}`
        if (c.type === 'dir') {
          if (ps || rd) {
            if (!recurse && (c.children ?? []).length) {
              out.push(psError(e, `Das Element unter "${cp}" hat untergeordnete Elemente, und der Recurse-Parameter wurde nicht angegeben.`, 'WriteError'))
              continue
            }
            if (deleteOne(e, cp, out, false)) count++
          } else if (recurse) count += deleteFilesIn(e, cp, out)
        } else if (deleteOne(e, cp, out, !ps && recurse)) count++
      }
      continue
    }
    const node = resolveFs(e.ep, abs)
    if (!node) {
      out.push(ps ? psError(e, `Der Pfad "${abs}" kann nicht gefunden werden, da er nicht vorhanden ist.`, 'ObjectNotFound') : rd ? 'Das System kann die angegebene Datei nicht finden.' : `Das System kann die Datei "${abs}" nicht finden.`)
      continue
    }
    if (node.type === 'dir') {
      if (ps || rd) {
        if (!recurse && (node.children ?? []).length) {
          out.push(ps ? psError(e, `Das Element unter "${abs}" hat untergeordnete Elemente, und der Recurse-Parameter wurde nicht angegeben.`, 'WriteError') : 'Das Verzeichnis ist nicht leer.')
          continue
        }
        if (deleteOne(e, abs, out, false)) count++
      } else count += deleteFilesIn(e, abs, out, recurse)
      continue
    }
    if (deleteOne(e, abs, out, !ps && recurse)) count++
  }
  if (count) act(e, A.fileChanged, e.host, `Gelöscht (${count} Elemente): ${paths.join(', ')} – ${Math.max(0, Math.round((freeGb(e.ep, 'C:') - before) * 1024))} MB freigegeben`)
  return out.join('\n')
}

/** del <ordner> bzw. del /s: löscht die Dateien, Ordner bleiben */
function deleteFilesIn(e: Env, dir: string, out: string[], recurse = true): number {
  const node = resolveFs(e.ep, dir)
  if (!node?.children) return 0
  let n = 0
  for (const c of [...node.children]) {
    const cp = `${dir}\\${c.name}`
    if (c.type === 'file') {
      if (deleteOne(e, cp, out, recurse)) n++
    } else if (recurse) n += deleteFilesIn(e, cp, out, true)
  }
  return n
}

// ─────────────── copy / move / ren ───────────────

const clone = (n: FsNode): FsNode => JSON.parse(JSON.stringify(n))

function copyMove(e: Env, src: string | undefined, dst: string | undefined, move: boolean): string {
  if (!src || !dst) return e.ps ? psError(e, 'Quelle und Ziel angeben.') : 'Die Syntax des Befehls ist falsch.'
  const sAbs = absPath(e, src)
  const node = resolveFs(e.ep, sAbs)
  if (!node) return e.ps ? psError(e, `Der Pfad "${sAbs}" kann nicht gefunden werden.`, 'ObjectNotFound') : 'Das System kann die angegebene Datei nicht finden.'
  let dAbs = absPath(e, dst)
  const dNode = resolveFs(e.ep, dAbs)
  if (dNode?.type === 'dir') dAbs = `${dAbs.replace(/\\$/, '')}\\${node.name}`
  if (needsAdmin(e, dAbs) || (move && needsAdmin(e, sAbs))) return e.ps ? psError(e, `Der Zugriff auf den Pfad "${dAbs}" wurde verweigert.`, 'PermissionDenied') : 'Zugriff verweigert'
  const parentPath = dAbs.slice(0, dAbs.lastIndexOf('\\')) || dAbs.slice(0, 3)
  const parent = resolveFs(e.ep, parentPath)
  if (!parent || parent.type !== 'dir') return e.ps ? psError(e, `Der Pfad "${parentPath}" kann nicht gefunden werden.`, 'ObjectNotFound') : 'Das System kann den angegebenen Pfad nicht finden.'
  const name = dAbs.slice(dAbs.lastIndexOf('\\') + 1)
  parent.children ??= []
  parent.children = parent.children.filter((c) => c.name.toLowerCase() !== name.toLowerCase())
  parent.children.push({ ...clone(node), name, modified: new Date().toISOString() })
  if (move) deleteFs(e.ep, sAbs)
  act(e, A.fileChanged, e.host, `${move ? 'Verschoben' : 'Kopiert'}: ${sAbs} → ${dAbs}`)
  return e.ps ? '' : move ? '        1 Datei(en) verschoben.' : '        1 Datei(en) kopiert.'
}

export const copyCmd: Handler = (e, args) => {
  const a = psArgs(args, ['force', 'recurse'])
  const pos = e.ps ? [arg(a, 'path') ?? a.pos[0], arg(a, 'destination') ?? a.pos[1]] : args.filter((x) => !x.startsWith('/'))
  return copyMove(e, pos[0], pos[1], false)
}
export const moveCmd: Handler = (e, args) => {
  const a = psArgs(args, ['force'])
  const pos = e.ps ? [arg(a, 'path') ?? a.pos[0], arg(a, 'destination') ?? a.pos[1]] : args.filter((x) => !x.startsWith('/'))
  return copyMove(e, pos[0], pos[1], true)
}
export const renCmd: Handler = (e, args) => {
  const a = psArgs(args, ['force'])
  const src = e.ps ? arg(a, 'path') ?? a.pos[0] : args[0]
  const nn = e.ps ? arg(a, 'newname') ?? a.pos[1] : args[1]
  if (!src || !nn) return e.ps ? psError(e, 'Pfad und neuer Name angeben.') : 'Die Syntax des Befehls ist falsch.'
  const abs = absPath(e, src)
  return copyMove(e, abs, abs.slice(0, abs.lastIndexOf('\\')) + '\\' + nn, true)
}

export const testPath: Handler = (e, args) => {
  const p = argOrPos(psArgs(args), 0, 'path', 'literalpath')
  if (!p) return 'False'
  if (isReg(p)) return getRegKey(e.ep, p) ? 'True' : 'False'
  const abs = absPath(e, p)
  if (abs.startsWith('\\\\') || e.ep.mappedDrives.some((d) => d.letter === abs.slice(0, 2).toUpperCase())) return Array.isArray(shareListing(e, abs)) ? 'True' : 'False'
  return resolveFs(e.ep, abs) ? 'True' : 'False'
}

export const attrib: Handler = (e, args) => {
  const flags = args.filter((x) => /^[+-][rhsa]$/i.test(x))
  const p = args.find((x) => !/^[+-][rhsa]$/i.test(x) && !x.startsWith('/'))
  if (!p) return 'Syntax: attrib [+r|-r] [+h|-h] Datei'
  const abs = absPath(e, p)
  const n = resolveFs(e.ep, abs)
  if (!n) return `Datei nicht gefunden - ${abs}`
  if (flags.length) {
    if (needsAdmin(e, abs)) return 'Zugriff verweigert'
    for (const f of flags) {
      const on = f[0] === '+'
      const k = f[1].toLowerCase()
      if (k === 'r') n.readOnly = on
      if (k === 'h') n.hidden = on
    }
    act(e, A.fileChanged, e.host, `Attribute ${flags.join(' ')}: ${abs}`)
    return ''
  }
  return `${n.type === 'file' ? 'A' : ' '}  ${n.system ? 'S' : ' '}${n.hidden ? 'H' : ' '}${n.readOnly ? 'R' : ' '}        ${abs}`
}

export const notepad: Handler = (_e, args) => `Der Editor ist ein grafisches Programm – öffnen Sie ihn im Remote-Desktop (Start → Editor)${args[0] ? ` und laden Sie "${args.join(' ')}"` : ''}.\nTipp: Inhalt anzeigen mit "type <Datei>" bzw. "Get-Content", ergänzen mit "echo 10.10.0.20 fs01 >> <Datei>" bzw. "Add-Content". Für Systemdateien (z.B. hosts) ist eine Admin-Konsole nötig.`

// ─────────────── Registry ───────────────

const fmtRegData = (type: RegType, data: string | number) => (type === 'REG_DWORD' || type === 'REG_QWORD' ? `0x${Number(data).toString(16)}` : String(data))
const fullRegPath = (p: string) => regPathParts(p).join('\\')

function regBlock(key: RegKey, path: string, only?: string): string[] {
  const vals = key.values.filter((v) => only === undefined || v.name.toLowerCase() === only.toLowerCase())
  return ['', path, ...vals.map((v) => `    ${v.name || '(Standard)'}    ${v.type}    ${fmtRegData(v.type, v.data)}`)]
}

export const reg: Handler = (e, args) => {
  const op = (args[0] ?? '').toLowerCase()
  const path = args[1]
  const v = (flag: string) => {
    const i = args.findIndex((x) => x.toLowerCase() === flag)
    return i >= 0 ? args[i + 1] : undefined
  }
  const hasF = (flag: string) => args.some((x) => x.toLowerCase() === flag)
  if (!op || !path) return 'REG Vorgang [Parameterliste]\n\n  Vorgang  == [ QUERY | ADD | DELETE ]\n\nBeispiele:\n  reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings"\n  reg add "HKCU\\...\\Internet Settings" /v ProxyEnable /t REG_DWORD /d 0 /f'
  const full = fullRegPath(path)
  const hklm = /^HKEY_LOCAL_MACHINE/i.test(full)
  if (op === 'query') {
    const key = getRegKey(e.ep, path)
    if (!key) return 'FEHLER: Der angegebene Registrierungsschlüssel bzw. Wert wurde nicht gefunden.'
    const name = hasF('/ve') ? '' : v('/v')
    if (name !== undefined && !key.values.some((x) => x.name.toLowerCase() === name.toLowerCase())) return 'FEHLER: Der angegebene Registrierungsschlüssel bzw. Wert wurde nicht gefunden.'
    const out = regBlock(key, full, name)
    if (name === undefined) {
      const walk = (k: RegKey, p: string, depth: number) => {
        for (const s of k.subkeys) {
          if (hasF('/s')) {
            out.push(...regBlock(s, `${p}\\${s.name}`))
            if (depth < 8) walk(s, `${p}\\${s.name}`, depth + 1)
          } else out.push('', `${p}\\${s.name}`)
        }
      }
      walk(key, full, 0)
    }
    return out.join('\n') + '\n'
  }
  if (op === 'add') {
    if (hklm && !e.admin) return 'FEHLER: Zugriff verweigert.'
    const name = hasF('/ve') ? '' : v('/v')
    if (name === undefined) {
      ensureRegKey(e.ep, path)
      act(e, A.registryChanged, e.host, `Schlüssel ${full}`)
      return 'Der Vorgang wurde erfolgreich beendet.'
    }
    const type = (v('/t') ?? 'REG_SZ').toUpperCase() as RegType
    if (!['REG_SZ', 'REG_EXPAND_SZ', 'REG_DWORD', 'REG_QWORD', 'REG_MULTI_SZ', 'REG_BINARY'].includes(type)) return `FEHLER: Ungültiger Datentyp "${type}".`
    const raw = v('/d') ?? ''
    const data = type === 'REG_DWORD' || type === 'REG_QWORD' ? (raw.toLowerCase().startsWith('0x') ? parseInt(raw, 16) : Number(raw)) : raw
    if (typeof data === 'number' && Number.isNaN(data)) return 'FEHLER: Ungültiger Wert für REG_DWORD.'
    const existed = !!getRegValue(e.ep, path, name)
    setRegValue(e.ep, path, name, type, data)
    act(e, A.registryChanged, e.host, `${full}\\${name || '(Standard)'} = ${fmtRegData(type, data)}`)
    return `${existed && !hasF('/f') ? `Der Wert ${name} ist bereits vorhanden. Überschreiben (Ja/Nein)? Ja\n` : ''}Der Vorgang wurde erfolgreich beendet.`
  }
  if (op === 'delete') {
    if (hklm && !e.admin) return 'FEHLER: Zugriff verweigert.'
    const name = v('/v')
    const ok = name !== undefined ? deleteRegValue(e.ep, path, name) : deleteRegKey(e.ep, path)
    if (!ok) return 'FEHLER: Das System konnte den angegebenen Registrierungsschlüssel bzw. Wert nicht finden.'
    act(e, A.registryChanged, e.host, `Gelöscht: ${full}${name !== undefined ? '\\' + name : ''}`)
    return `${hasF('/f') ? '' : `Möchten Sie den Registrierungs${name !== undefined ? 'wert' : 'schlüssel'} ${name ?? full} wirklich löschen (Ja/Nein)? Ja\n`}Der Vorgang wurde erfolgreich beendet.`
  }
  return `FEHLER: Ungültiger Vorgang "${args[0]}". Unterstützt: QUERY, ADD, DELETE`
}

function regChildren(e: Env, path: string): string {
  const key = getRegKey(e.ep, path)
  if (!key) return psError(e, `Der Pfad "${path}" kann nicht gefunden werden, da er nicht vorhanden ist.`, 'ObjectNotFound')
  const out = ['', `    Hive: ${fullRegPath(path)}`, '', '', 'Name                           Property', '----                           --------']
  for (const s of key.subkeys) out.push(`${s.name.padEnd(31)}${s.values.map((v) => `${v.name || '(Standard)'} : ${fmtRegData(v.type, v.data)}`).join('\n' + ' '.repeat(31))}`)
  return out.join('\n') + '\n'
}

export const getItemProperty: Handler = (e, args) => {
  const a = psArgs(args)
  const p = argOrPos(a, 0, 'path', 'literalpath')
  const name = arg(a, 'name') ?? a.pos[1]
  if (!p) return psError(e, 'Der Parameter "-Path" fehlt.')
  if (!isReg(p)) {
    const n = resolveFs(e.ep, absPath(e, p))
    if (!n) return psError(e, `Der Pfad "${p}" kann nicht gefunden werden.`, 'ObjectNotFound')
    return obj([{ Name: n.name, Length: bytes(n), LastWriteTime: `${fmtD(n.modified)} ${fmtT(n.modified)}`, Attributes: n.type === 'dir' ? 'Directory' : 'Archive', Mode: mode(n) }], ['Name', 'Length', 'LastWriteTime', 'Attributes', 'Mode'], true)
  }
  const key = getRegKey(e.ep, p)
  if (!key) return psError(e, `Der Pfad "${p}" kann nicht gefunden werden, da er nicht vorhanden ist.`, 'ObjectNotFound')
  const vals = key.values.filter((v) => !name || wildToRe(name).test(v.name))
  if (name && !vals.length) return psError(e, `Die Eigenschaft "${name}" ist im Pfad "${p}" nicht vorhanden.`, 'InvalidArgument')
  const rec: Rec = {}
  for (const v of vals) rec[v.name || '(default)'] = v.data
  const full = fullRegPath(p)
  rec.PSPath = `Microsoft.PowerShell.Core\\Registry::${full}`
  rec.PSParentPath = `Microsoft.PowerShell.Core\\Registry::${full.slice(0, full.lastIndexOf('\\'))}`
  rec.PSChildName = key.name
  rec.PSDrive = full.startsWith('HKEY_CURRENT_USER') ? 'HKCU' : 'HKLM'
  rec.PSProvider = 'Microsoft.PowerShell.Core\\Registry'
  return obj([rec], Object.keys(rec), true)
}

export const getItemPropertyValue: Handler = (e, args) => {
  const a = psArgs(args)
  const p = argOrPos(a, 0, 'path')
  const name = arg(a, 'name') ?? a.pos[1]
  if (!p || !name) return psError(e, 'Pfad und -Name angeben.')
  const v = getRegValue(e.ep, p, name)
  return v ? String(v.data) : psError(e, `Die Eigenschaft "${name}" ist im Pfad "${p}" nicht vorhanden.`, 'InvalidArgument')
}

const PS_TYPES: Record<string, RegType> = { string: 'REG_SZ', expandstring: 'REG_EXPAND_SZ', dword: 'REG_DWORD', qword: 'REG_QWORD', multistring: 'REG_MULTI_SZ', binary: 'REG_BINARY' }

export const setItemProperty: Handler = (e, args) => {
  const a = psArgs(args, ['force'])
  const p = argOrPos(a, 0, 'path')
  const name = arg(a, 'name') ?? a.pos[1]
  const value = arg(a, 'value') ?? a.pos[2]
  if (!p || name === undefined || value === undefined) return psError(e, 'Beispiel: Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" -Name ProxyEnable -Value 0', 'InvalidArgument')
  if (!isReg(p)) return psError(e, 'Im Simulator werden nur Registry-Pfade (HKCU:\\…, HKLM:\\…) unterstützt.')
  if (/^hklm|^hkey_local/i.test(p) && !e.admin) return elevationMsg(e)
  const isNew = /^new-itemproperty$/i.test(e.cmd)
  if (!isNew && !getRegKey(e.ep, p)) return psError(e, `Der Pfad "${p}" kann nicht gefunden werden, da er nicht vorhanden ist.`, 'ObjectNotFound')
  const existing = getRegValue(e.ep, p, name)
  const t = PS_TYPES[(arg(a, 'propertytype', 'type') ?? '').toLowerCase()] ?? existing?.type ?? (isNew && /^\d+$/.test(value) ? 'REG_DWORD' : 'REG_SZ')
  const data = t === 'REG_DWORD' || t === 'REG_QWORD' ? (value.toLowerCase().startsWith('0x') ? parseInt(value, 16) : Number(value.replace(/^\$true$/i, '1').replace(/^\$false$/i, '0'))) : value
  if (typeof data === 'number' && Number.isNaN(data)) return psError(e, `Der Wert "${value}" kann nicht in den Typ DWORD konvertiert werden.`, 'InvalidArgument')
  setRegValue(e.ep, p, name, t, data)
  act(e, A.registryChanged, e.host, `${fullRegPath(p)}\\${name} = ${fmtRegData(t, data)}`)
  return ''
}

export const removeItemProperty: Handler = (e, args) => {
  const a = psArgs(args, ['force'])
  const p = argOrPos(a, 0, 'path')
  const name = arg(a, 'name') ?? a.pos[1]
  if (!p || !name) return psError(e, 'Pfad und -Name angeben.')
  if (/^hklm|^hkey_local/i.test(p) && !e.admin) return elevationMsg(e)
  if (!deleteRegValue(e.ep, p, name)) return psError(e, `Die Eigenschaft "${name}" ist im Pfad "${p}" nicht vorhanden.`, 'InvalidArgument')
  act(e, A.registryChanged, e.host, `Gelöscht: ${fullRegPath(p)}\\${name}`)
  return ''
}
