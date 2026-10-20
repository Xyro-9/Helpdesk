// Datei-Explorer: Dieser PC, lokale Laufwerke (ep.fs), Netzlaufwerke/UNC (shareAccess, infra.shares),
// Papierkorb, Adressleiste, Löschen, Neuer Ordner, Dateien öffnen, Netzlaufwerk verbinden/trennen.

import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Download,
  Eraser,
  File,
  FileCode,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderPlus,
  HardDrive,
  Image,
  Laptop,
  Monitor,
  Network,
  RefreshCw,
  Search,
  Server,
  Trash2,
  Unplug,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { A } from '@/core/actions'
import { deleteFs, emptyDir, expandEnv, freeGb, makeDir, mapDrive, nodeSizeMb, parseUnc, resolveFs, shareAccess, unmapDrive } from '@/core/ops/endpoint'
import { useStore } from '@/core/store'
import type { Endpoint, FsNode, World } from '@/core/types'
import { hashString, nowIso } from '@/core/util'
import { cx } from '@/ui'
import { useDesk, useEp, useEpOps, useWin } from '../desk'
import { isTextFile } from '../run'
import { useRdp } from '../store'
import { AppLoading, Bar, ContextMenu, fmtDTShort, fmtSize, listCls, rowCls, StatusBar, ToolBar, ToolBtn, ToolSep, useContextMenu, WBtn, WCheck, WDialog, WInput, WSelect, type MenuItem } from '../ui'
import type { AppProps } from './types'

const PC = 'Dieser PC'
const BIN = 'Papierkorb'

interface Item {
  name: string
  type: 'dir' | 'file' | 'drive' | 'share'
  modified?: string
  sizeMb?: number
  hidden?: boolean
  system?: boolean
}

type Loc =
  | { kind: 'pc' }
  | { kind: 'bin' }
  | { kind: 'local'; path: string; node: FsNode }
  | { kind: 'net'; path: string; unc: string; items: Item[]; access: string; readOnly: true }
  | { kind: 'error'; message: string }

const EXT_TYPE: Record<string, string> = {
  txt: 'Textdokument',
  log: 'Textdokument',
  ini: 'Konfigurationseinstellungen',
  docx: 'Dokument',
  xlsx: 'Arbeitsblatt',
  pptx: 'Präsentation',
  pdf: 'PDF-Dokument',
  exe: 'Anwendung',
  lnk: 'Verknüpfung',
  tmp: 'TMP-Datei',
  cab: 'Archivdatei (CAB)',
  jpg: 'JPG-Datei',
  png: 'PNG-Datei',
  xml: 'XML-Dokument',
  ost: 'Offline-Datendatei',
  zip: 'ZIP-komprimierter Ordner',
  csv: 'CSV-Datei',
}
const extOf = (n: string) => (n.includes('.') ? n.split('.').pop()!.toLowerCase() : '')
const typeOf = (it: Item) => (it.type === 'dir' ? 'Dateiordner' : it.type === 'drive' ? 'Laufwerk' : it.type === 'share' ? 'Freigabe' : (EXT_TYPE[extOf(it.name)] ?? (extOf(it.name) ? `${extOf(it.name).toUpperCase()}-Datei` : 'Datei')))

function iconFor(it: Item): { Icon: LucideIcon; cls: string } {
  if (it.type === 'dir' || it.type === 'share') return { Icon: Folder, cls: 'fill-amber-300 text-amber-500' }
  if (it.type === 'drive') return { Icon: HardDrive, cls: 'text-slate-600' }
  const e = extOf(it.name)
  if (['txt', 'log', 'ini', 'docx', 'pdf', ''].includes(e)) return { Icon: FileText, cls: 'text-sky-700' }
  if (['xlsx', 'csv'].includes(e)) return { Icon: FileSpreadsheet, cls: 'text-emerald-700' }
  if (['jpg', 'png'].includes(e)) return { Icon: Image, cls: 'text-violet-600' }
  if (['exe', 'xml', 'cab'].includes(e)) return { Icon: FileCode, cls: 'text-slate-600' }
  return { Icon: File, cls: 'text-slate-500' }
}

/** Erzeugte Beispieldateien in Freigabe-Ordnern (deterministisch, nur Anzeige) */
function shareFiles(seed: string): Item[] {
  const pool = ['Protokoll_2026-09.docx', 'Übersicht_Q3.xlsx', 'Präsentation_Kunde.pptx', 'Ablauf.pdf', 'Liste_Ansprechpartner.xlsx', 'Notizen.txt', 'Entwurf_v2.docx', 'Foto_Messestand.jpg']
  const h = hashString(seed)
  const n = 2 + (h % 4)
  return Array.from({ length: n }, (_, i) => pool[(h >>> (i * 3)) % pool.length])
    .filter((v, i, a) => a.indexOf(v) === i)
    .map((name, i) => ({ name, type: 'file' as const, sizeMb: ((h >>> i) % 4000) / 1000 + 0.02, modified: new Date(Date.now() - ((h >>> (i + 2)) % 60) * 86400000).toISOString() }))
}

function normalizePath(ep: Endpoint, raw: string): string {
  let p = raw.trim().replace(/\//g, '\\').replace(/^"|"$/g, '')
  if (!p || /^(dieser pc|computer|arbeitsplatz)$/i.test(p)) return PC
  if (/^papierkorb$/i.test(p)) return BIN
  p = expandEnv(ep, p)
  if (/^[a-z]:$/i.test(p)) return `${p.toUpperCase()}\\`
  if (/^[a-z]:\\/i.test(p)) p = p[0].toUpperCase() + p.slice(1)
  if (p.length > 3) p = p.replace(/\\+$/, '')
  return p
}

function resolveLoc(w: World, ep: Endpoint, path: string): Loc {
  if (path === PC) return { kind: 'pc' }
  if (path === BIN) return { kind: 'bin' }
  const letter = path.slice(0, 2).toUpperCase()
  let unc = ''
  if (/^[A-Z]:/.test(letter)) {
    if (ep.fs[letter]) {
      const node = resolveFs(ep, path)
      if (!node) return { kind: 'error', message: `"${path}" wurde nicht gefunden. Überprüfen Sie die Schreibweise, und wiederholen Sie den Vorgang.` }
      if (node.type !== 'dir') return { kind: 'error', message: `"${path}" ist kein Ordner.` }
      return { kind: 'local', path, node }
    }
    const m = ep.mappedDrives.find((d) => d.letter === letter)
    if (!m) return { kind: 'error', message: `"${path}" wurde nicht gefunden. Überprüfen Sie die Schreibweise, und wiederholen Sie den Vorgang.` }
    unc = m.path + path.slice(2).replace(/^\\?/, '\\').replace(/\\$/, '')
  } else if (path.startsWith('\\\\')) unc = path
  else return { kind: 'error', message: `"${path}" wurde nicht gefunden. Überprüfen Sie die Schreibweise, und wiederholen Sie den Vorgang.` }

  const bare = unc.match(/^\\\\([^\\]+)\\?$/)
  if (bare) {
    const srvName = bare[1].toUpperCase().replace(/\.MUSTERWERK\.LOCAL$/, '')
    const srv = w.infra.servers.find((s) => s.name === srvName)
    if (!srv || !srv.online) return { kind: 'error', message: `Auf \\\\${bare[1]} kann nicht zugegriffen werden.\n\nFehlercode: 0x80070035\nDer Netzwerkpfad wurde nicht gefunden.` }
    const items = w.infra.shares.filter((s) => s.server === srvName && !s.name.endsWith('$')).map((s) => ({ name: s.name, type: 'share' as const }))
    return { kind: 'net', path, unc, items, access: 'Lesen', readOnly: true }
  }
  const u = parseUnc(unc)
  if (!u) return { kind: 'error', message: `"${path}" wurde nicht gefunden.` }
  const acc = shareAccess(w, ep, `\\\\${u.server}\\${u.share}`)
  if (!acc.ok) return { kind: 'error', message: `Auf ${path} kann nicht zugegriffen werden. Sie haben eventuell keine Berechtigung zur Verwendung dieser Netzwerkressource. Wenden Sie sich an den Administrator des Servers, um herauszufinden, ob Sie über Zugriffsberechtigungen verfügen.\n\n${acc.error}` }
  const share = w.infra.shares.find((s) => s.server === u.server && s.name.toLowerCase() === u.share.toLowerCase())!
  const sub = u.sub.split('\\').filter(Boolean)
  let items: Item[]
  if (sub.length === 0) items = share.name === 'home$' ? [] : share.folders.map((f) => ({ name: f, type: 'dir' as const, modified: new Date(Date.now() - (hashString(f) % 90) * 86400000).toISOString() }))
  else if (sub.length === 1 && (share.folders.some((f) => f.toLowerCase() === sub[0].toLowerCase()) || share.name === 'home$')) items = shareFiles(`${share.name}\\${sub[0]}`)
  else if (sub.length === 1) return { kind: 'error', message: `"${path}" wurde nicht gefunden.` }
  else items = []
  return { kind: 'net', path, unc, items, access: acc.access ?? 'Lesen', readOnly: true }
}

export function ExplorerApp({ host, args }: AppProps) {
  const ep = useEp(host)
  if (!ep) return <AppLoading />
  return <Explorer host={host} ep={ep} initial={args.path} />
}

function Explorer({ host, ep, initial }: { host: string; ep: Endpoint; initial?: string }) {
  const desk = useDesk()
  const win = useWin()
  const ops = useEpOps(host)
  const world = useStore((s) => s.world)
  const recycle = useRdp((s) => s.sessions[desk.sessionKey]?.recycle)
  const [hist, setHist] = useState<{ list: string[]; i: number }>(() => ({ list: [initial ? normalizePath(ep, initial) : PC], i: 0 }))
  const path = hist.list[hist.i]
  const [addr, setAddr] = useState(path)
  const [sel, setSel] = useState<string | null>(null)
  const [hidden, setHidden] = useState(false)
  const [filter, setFilter] = useState('')
  const [mapDlg, setMapDlg] = useState(false)
  const [sort, setSort] = useState<{ k: 'name' | 'modified' | 'type' | 'size'; dir: 1 | -1 }>({ k: 'name', dir: 1 })
  const ctx = useContextMenu<Item | null>()

  const loc = useMemo(() => resolveLoc(world, ep, path), [world, ep, path])
  useEffect(() => {
    setAddr(path)
    setSel(null)
    setFilter('')
  }, [path])
  const title = path === PC ? PC : path === BIN ? BIN : path.length <= 3 ? path : (path.split('\\').filter(Boolean).pop() ?? path)
  useEffect(() => win.setTitle(title), [win, title])

  const navigate = (raw: string) => {
    const p = normalizePath(ep, raw)
    const l = resolveLoc(world, ep, p)
    if (l.kind === 'error') {
      void desk.alert(l.message, { title: 'Datei-Explorer', icon: 'error' })
      setAddr(path)
      return
    }
    if (p === path) return
    setHist({ list: [...hist.list.slice(0, hist.i + 1), p], i: hist.i + 1 })
  }
  const up = () => {
    if (path === PC || path === BIN) return
    if (/^[A-Z]:\\$/.test(path)) return navigate(PC)
    const m = path.match(/^\\\\[^\\]+\\?$/)
    if (m) return navigate(PC)
    const parent = path.replace(/\\[^\\]+$/, '')
    navigate(/^[A-Z]:$/.test(parent) ? parent + '\\' : parent)
  }
  const join = (name: string) => (path.endsWith('\\') ? path + name : `${path}\\${name}`)

  // Elemente der aktuellen Ansicht
  const items: Item[] = useMemo(() => {
    let list: Item[] = []
    if (loc.kind === 'local') list = (loc.node.children ?? []).map((c) => ({ name: c.name, type: c.type, modified: c.modified, sizeMb: c.type === 'file' ? c.sizeMb : undefined, hidden: c.hidden, system: c.system }))
    else if (loc.kind === 'net') list = loc.items
    else if (loc.kind === 'bin') list = (recycle ?? []).map((r) => ({ name: r.name, type: 'file', modified: r.deletedAt, sizeMb: r.sizeMb }))
    const f = filter.trim().toLowerCase()
    list = list.filter((x) => (hidden || !x.hidden) && (!f || x.name.toLowerCase().includes(f)))
    return [...list].sort((a, b) => {
      if (a.type === 'dir' && b.type !== 'dir') return -1
      if (b.type === 'dir' && a.type !== 'dir') return 1
      const v = sort.k === 'name' ? a.name.localeCompare(b.name, 'de') : sort.k === 'modified' ? (a.modified ?? '').localeCompare(b.modified ?? '') : sort.k === 'type' ? typeOf(a).localeCompare(typeOf(b), 'de') : (a.sizeMb ?? 0) - (b.sizeMb ?? 0)
      return v * sort.dir
    })
  }, [loc, recycle, filter, hidden, sort])

  const open = (it: Item, admin = false) => {
    if (it.type === 'dir' || it.type === 'share') return navigate(join(it.name))
    if (loc.kind === 'bin') return
    const full = join(it.name)
    if (isTextFile(it.name)) {
      if (loc.kind === 'net') return void desk.alert(`„${it.name}“ befindet sich auf einem Netzlaufwerk und kann in der Simulation nicht geöffnet werden.`, { title: 'Datei-Explorer', icon: 'info' })
      return desk.openApp('notepad', admin ? { path: full, admin: '1' } : { path: full })
    }
    const e = extOf(it.name)
    if (it.name.toLowerCase() === 'notepad.exe') return desk.openApp('notepad')
    if (it.name.toLowerCase() === 'cmd.exe') return desk.openApp('cmd')
    if (e === 'exe' || e === 'lnk') return void desk.alert(`„${it.name}“ wurde gestartet.\n\n(In der Simulation öffnet das Programm kein eigenes Fenster.)`, { title: it.name, icon: 'info' })
    void desk.alert(`Für „${it.name}“ ist in dieser Remotesitzung keine passende App verfügbar.`, { title: 'Wie soll diese Datei geöffnet werden?', icon: 'info' })
  }

  const del = async (it: Item) => {
    if (loc.kind !== 'local') return
    const full = join(it.name)
    const ok = await desk.confirm(`Möchten Sie ${it.type === 'dir' ? 'diesen Ordner' : 'diese Datei'} wirklich in den Papierkorb verschieben?\n\n${it.name}`, { title: it.type === 'dir' ? 'Ordner löschen' : 'Datei löschen', icon: 'warning', ok: 'Ja', cancel: 'Nein' })
    if (!ok) return
    const node = resolveFs(ep, full)
    const size = node ? nodeSizeMb(node) : 0
    const done = ops.run((e) => deleteFs(e, full), { type: A.fileChanged, detail: `${full} gelöscht` }, { errorTitle: 'Datei-Explorer' })
    if (done) useRdp.getState().addRecycle(desk.sessionKey, { name: it.name, path: full, sizeMb: size, deletedAt: nowIso() })
  }

  const newFolder = async () => {
    if (loc.kind !== 'local') return
    const name = await desk.prompt({ title: 'Neuer Ordner', label: 'Name des neuen Ordners:', value: 'Neuer Ordner' })
    if (!name?.trim()) return
    if (/[\\/:*?"<>|]/.test(name)) return void desk.alert('Ein Dateiname darf keines der folgenden Zeichen enthalten:\n\\ / : * ? " < > |', { title: 'Datei-Explorer', icon: 'error' })
    const full = join(name.trim())
    ops.run((e) => makeDir(e, full), { type: A.fileChanged, detail: `${full} (Ordner erstellt)` }, { errorTitle: 'Datei-Explorer' })
  }

  const disconnect = async (letter: string) => {
    const m = ep.mappedDrives.find((d) => d.letter === letter)
    if (!m) return
    const ok = await desk.confirm(`Netzlaufwerk ${letter} (${m.path}) trennen?${m.viaGpo ? '\n\nHinweis: Dieses Laufwerk wird per Gruppenrichtlinie verbunden und kehrt bei der nächsten Richtlinienaktualisierung zurück.' : ''}`, { title: 'Netzlaufwerk trennen', icon: 'question', ok: 'Ja', cancel: 'Nein' })
    if (ok) ops.run((e) => unmapDrive(e, letter), { type: A.networkChanged, detail: `Netzlaufwerk ${letter} getrennt (${m.path})` }, { errorTitle: 'Datei-Explorer' })
  }

  const selItem = items.find((x) => x.name === sel)
  const isLocal = loc.kind === 'local'

  const itemMenu = (it: Item | null): MenuItem[] => {
    if (!it)
      return [
        { label: 'Aktualisieren', onClick: () => {} },
        { label: 'Neu → Ordner', disabled: !isLocal, onClick: () => void newFolder() },
        { sep: true },
        { label: 'Ausgeblendete Elemente', checked: hidden, onClick: () => setHidden(!hidden) },
      ]
    if (it.type === 'drive') {
      const letter = it.name.slice(-3, -1)
      const mapped = ep.mappedDrives.find((d) => d.letter === letter)
      return [
        { label: 'Öffnen', bold: true, onClick: () => navigate(letter + '\\') },
        { sep: true },
        ...(mapped ? [{ label: 'Trennen', onClick: () => void disconnect(letter) }] : [{ label: 'Datenträgerbereinigung…', onClick: () => desk.openApp('cleanmgr', { drive: letter }) }]),
      ]
    }
    return [
      { label: 'Öffnen', bold: true, onClick: () => open(it) },
      ...(it.type === 'file' && isTextFile(it.name) && isLocal ? [{ label: 'Mit Editor bearbeiten', onClick: () => open(it) }, { label: 'Mit Editor bearbeiten (als Administrator)', onClick: () => void desk.uac('Editor').then((y) => y && open(it, true)) }] : []),
      { sep: true },
      { label: 'Pfad kopieren', onClick: () => void navigator.clipboard?.writeText(join(it.name)) },
      { label: 'Löschen', disabled: !isLocal, onClick: () => void del(it) },
    ]
  }

  const quick = [
    { label: 'Desktop', icon: Monitor, path: '%USERPROFILE%\\Desktop' },
    { label: 'Downloads', icon: Download, path: '%USERPROFILE%\\Downloads' },
    { label: 'Dokumente', icon: FileText, path: '%USERPROFILE%\\Documents' },
    { label: 'Bilder', icon: Image, path: '%USERPROFILE%\\Pictures' },
  ]

  return (
    <div className="flex h-full flex-col text-[12px]">
      <ToolBar className="gap-1">
        <ToolBtn icon={<ArrowLeft size={15} />} title="Zurück" disabled={hist.i === 0} onClick={() => setHist({ ...hist, i: hist.i - 1 })} />
        <ToolBtn icon={<ArrowRight size={15} />} title="Vor" disabled={hist.i >= hist.list.length - 1} onClick={() => setHist({ ...hist, i: hist.i + 1 })} />
        <ToolBtn icon={<ArrowUp size={15} />} title="Nach oben" disabled={path === PC || path === BIN} onClick={up} />
        <ToolBtn icon={<RefreshCw size={14} />} title="Aktualisieren" onClick={() => {}} />
        <WInput value={addr} onChange={(e) => setAddr(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && navigate(addr)} onFocus={(e) => e.target.select()} className="mx-1 flex-1" />
        <div className="relative w-44">
          <Search size={12} className="absolute top-2 left-2 text-slate-400" />
          <WInput value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={`${title} durchsuchen`} className="pl-6" />
        </div>
      </ToolBar>
      <ToolBar>
        <ToolBtn icon={<FolderPlus size={14} className="text-amber-600" />} label="Neu" disabled={!isLocal} onClick={() => void newFolder()} />
        <ToolBtn icon={<Trash2 size={14} />} label="Löschen" disabled={!isLocal || !selItem} onClick={() => selItem && void del(selItem)} />
        <ToolSep />
        {loc.kind === 'pc' && (
          <>
            <ToolBtn icon={<Network size={14} />} label="Netzlaufwerk verbinden" onClick={() => setMapDlg(true)} />
            <ToolBtn icon={<Unplug size={14} />} label="Trennen" disabled={!sel || !ep.mappedDrives.some((d) => sel.endsWith(`(${d.letter})`))} onClick={() => sel && void disconnect(sel.slice(-3, -1))} />
            <ToolBtn icon={<Eraser size={14} />} label="Bereinigen" onClick={() => desk.openApp('cleanmgr', { drive: 'C:' })} />
          </>
        )}
        {loc.kind === 'bin' && <ToolBtn icon={<Trash2 size={14} />} label="Papierkorb leeren" disabled={!recycle?.length} onClick={() => useRdp.getState().clearRecycle(desk.sessionKey)} />}
        <span className="ml-auto" />
        <WCheck label="Ausgeblendete Elemente" checked={hidden} onChange={setHidden} className="mr-2" />
      </ToolBar>
      <div className="flex min-h-0 flex-1">
        {/* Navigationsbereich */}
        <div className="w-48 shrink-0 overflow-auto border-r border-[#eee] py-1.5">
          {quick.map((q) => (
            <NavBtn key={q.label} icon={q.icon} label={q.label} active={path === normalizePath(ep, q.path)} onClick={() => navigate(q.path)} />
          ))}
          <div className="my-1.5 h-px bg-[#eee]" />
          <NavBtn icon={Laptop} label={PC} active={path === PC} onClick={() => navigate(PC)} />
          {Object.keys(ep.fs)
            .sort()
            .map((d) => (
              <NavBtn key={d} icon={HardDrive} label={`${d === 'C:' ? 'Lokaler Datenträger' : 'Volume'} (${d})`} active={path.startsWith(d)} onClick={() => navigate(d + '\\')} indent />
            ))}
          {ep.mappedDrives.map((m) => (
            <NavBtn key={m.letter} icon={Server} label={`${m.path.split('\\').pop()} (${m.letter})`} active={path.startsWith(m.letter)} onClick={() => navigate(m.letter + '\\')} indent />
          ))}
          <div className="my-1.5 h-px bg-[#eee]" />
          <NavBtn icon={Network} label="Netzwerk › FS01" active={path.toUpperCase().startsWith('\\\\FS01')} onClick={() => navigate('\\\\FS01')} />
          <NavBtn icon={Trash2} label={BIN} active={path === BIN} onClick={() => navigate(BIN)} />
        </div>
        {/* Inhalt */}
        <div className="min-w-0 flex-1 overflow-auto" onClick={() => setSel(null)} onContextMenu={(e) => ctx.open(e, null)}>
          {loc.kind === 'pc' ? (
            <ThisPc ep={ep} world={world} sel={sel} setSel={setSel} onOpen={(l) => navigate(l + '\\')} onMenu={(e, it) => ctx.open(e, it)} />
          ) : loc.kind === 'error' ? (
            <div className="p-4 whitespace-pre-wrap text-rose-700">{loc.message}</div>
          ) : (
            <table className={listCls}>
              <thead>
                <tr>
                  {(
                    [
                      ['name', 'Name'],
                      ['modified', loc.kind === 'bin' ? 'Löschdatum' : 'Änderungsdatum'],
                      ['type', 'Typ'],
                      ['size', 'Größe'],
                    ] as const
                  ).map(([k, l]) => (
                    <th key={k} className={cx('cursor-default hover:bg-[#f0f0f0]', k === 'name' && 'w-[45%]')} onClick={(e) => { e.stopPropagation(); setSort({ k, dir: sort.k === k ? (sort.dir === 1 ? -1 : 1) : 1 }) }}>
                      {l}
                      {sort.k === k && <span className="ml-1 text-[10px] text-slate-400">{sort.dir === 1 ? '▲' : '▼'}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const { Icon, cls } = iconFor(it)
                  return (
                    <tr
                      key={it.name}
                      className={cx(rowCls(sel === it.name), it.hidden && 'opacity-60')}
                      onClick={(e) => {
                        e.stopPropagation()
                        setSel(it.name)
                      }}
                      onDoubleClick={() => open(it)}
                      onContextMenu={(e) => {
                        setSel(it.name)
                        ctx.open(e, it)
                      }}
                    >
                      <td className="max-w-[320px]">
                        <span className="inline-flex items-center gap-1.5">
                          <Icon size={15} className={cls} />
                          {it.name}
                        </span>
                      </td>
                      <td className="text-slate-600">{fmtDTShort(it.modified)}</td>
                      <td className="text-slate-600">{typeOf(it)}</td>
                      <td className="text-right text-slate-600">{it.type === 'file' ? fmtSize(it.sizeMb) : ''}</td>
                    </tr>
                  )
                })}
                {!items.length && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-400">
                      {loc.kind === 'bin' ? 'Der Papierkorb ist leer.' : 'Dieser Ordner ist leer.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <StatusBar>
        <span>{loc.kind === 'pc' ? `${Object.keys(ep.fs).length + ep.mappedDrives.length} Elemente` : `${items.length} Elemente`}</span>
        {selItem && <span>1 Element ausgewählt{selItem.sizeMb !== undefined && selItem.type === 'file' ? ` · ${fmtSize(selItem.sizeMb)}` : ''}</span>}
        {loc.kind === 'net' && <span>Netzwerk · Ihre Berechtigung: {loc.access}</span>}
      </StatusBar>
      {ctx.menu && <ContextMenu x={ctx.menu.x} y={ctx.menu.y} onClose={ctx.close} items={itemMenu(ctx.menu.data)} />}
      {mapDlg && (
        <MapDriveDialog
          host={host}
          ep={ep}
          onClose={() => setMapDlg(false)}
          onMapped={(l) => {
            setMapDlg(false)
            navigate(l + '\\')
          }}
        />
      )}
    </div>
  )
}

function NavBtn({ icon: Icon, label, active, onClick, indent }: { icon: LucideIcon; label: string; active: boolean; onClick: () => void; indent?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={cx('flex w-full items-center gap-2 py-1 pr-2 text-left', indent ? 'pl-6' : 'pl-2.5', active ? 'bg-[#cce4f7]' : 'hover:bg-[#e5f1fb]')}>
      <Icon size={14} className="shrink-0 text-slate-600" />
      <span className="truncate">{label}</span>
    </button>
  )
}

function ThisPc({ ep, world, sel, setSel, onOpen, onMenu }: { ep: Endpoint; world: World; sel: string | null; setSel: (s: string) => void; onOpen: (letter: string) => void; onMenu: (e: React.MouseEvent, it: Item) => void }) {
  const locals = Object.keys(ep.fs).sort()
  const tile = (name: string, letter: string, sizeGb: number, free: number, net: boolean, broken?: string) => {
    const pct = sizeGb ? ((sizeGb - free) / sizeGb) * 100 : 0
    return (
      <div
        key={letter}
        className={cx('flex w-64 cursor-default items-center gap-3 rounded-[4px] border p-2 select-none', sel === name ? 'border-[#99c9ef] bg-[#cce4f7]' : 'border-transparent hover:bg-[#e5f1fb]')}
        onClick={(e) => {
          e.stopPropagation()
          setSel(name)
        }}
        onDoubleClick={() => onOpen(letter)}
        onContextMenu={(e) => {
          setSel(name)
          onMenu(e, { name, type: 'drive' })
        }}
      >
        <span className="relative">
          {net ? <Server size={34} className="text-slate-600" strokeWidth={1.3} /> : <HardDrive size={34} className="text-slate-600" strokeWidth={1.3} />}
          {broken && <span className="absolute -right-1 -bottom-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-600 text-[10px] font-bold text-white">×</span>}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate">{name}</div>
          {broken ? (
            <div className="truncate text-[11px] text-rose-700">Nicht verfügbar</div>
          ) : (
            <>
              <Bar pct={pct} className="my-0.5" />
              <div className="text-[11px] text-slate-500">
                {free.toLocaleString('de-DE', { maximumFractionDigits: 1 })} GB frei von {sizeGb.toLocaleString('de-DE', { maximumFractionDigits: 0 })} GB
              </div>
            </>
          )}
        </div>
      </div>
    )
  }
  return (
    <div className="p-3">
      <div className="mb-2 font-semibold text-slate-700">Geräte und Laufwerke</div>
      <div className="mb-5 flex flex-wrap gap-2">
        {locals.map((d) => {
          const part = ep.disks.flatMap((x) => x.partitions).find((p) => `${p.letter}:` === d)
          return tile(`${d === 'C:' ? 'Lokaler Datenträger' : (part?.label ?? 'Volume')} (${d})`, d, part?.sizeGb ?? 0, freeGb(ep, d), false)
        })}
      </div>
      <div className="mb-2 font-semibold text-slate-700">Netzwerkadressen</div>
      <div className="flex flex-wrap gap-2">
        {ep.mappedDrives.map((m) => {
          const u = parseUnc(m.path)
          const share = u && world.infra.shares.find((s) => s.server === u.server && s.name.toLowerCase() === u.share.toLowerCase())
          const acc = shareAccess(world, ep, u ? `\\\\${u.server}\\${u.share}` : m.path)
          const label = world.infra.gpo.driveMaps.find((g) => g.letter === m.letter && g.path.toLowerCase() === m.path.toLowerCase())?.label ?? u?.share ?? m.path
          const size = share?.quotaGb ?? 1000
          return tile(`${label} (${m.path.replace(/^\\\\/, '\\\\')}) (${m.letter})`, m.letter, size, Math.max(0, size - (share?.sizeGb ?? 0)), true, acc.ok ? undefined : acc.error)
        })}
        {!ep.mappedDrives.length && <div className="text-slate-400">Keine Netzlaufwerke verbunden.</div>}
      </div>
    </div>
  )
}

function MapDriveDialog({ host, ep, onClose, onMapped }: { host: string; ep: Endpoint; onClose: () => void; onMapped: (letter: string) => void }) {
  const ops = useEpOps(host)
  const used = new Set([...Object.keys(ep.fs), ...ep.mappedDrives.map((m) => m.letter), ...ep.disks.flatMap((d) => d.partitions).filter((p) => p.letter).map((p) => `${p.letter}:`)])
  const letters = 'ZYXWVUTSRQPONMLKJIHGFED'.split('').map((l) => `${l}:`)
  const [letter, setLetter] = useState(letters.find((l) => !used.has(l)) ?? 'Z:')
  const [path, setPath] = useState('\\\\FS01\\')
  const [persist, setPersist] = useState(true)
  const go = () => {
    const p = path.trim().replace(/\\+$/, '')
    const ok = ops.run((e, w) => mapDrive(w, e, letter, p, persist), { type: A.networkChanged, detail: `Netzlaufwerk ${letter} → ${p}${persist ? ' (bei Anmeldung wiederherstellen)' : ''}` }, { errorTitle: 'Netzlaufwerk verbinden', errorPrefix: `Auf ${p} kann nicht zugegriffen werden.` })
    if (ok) onMapped(letter)
  }
  return (
    <WDialog
      title="Netzlaufwerk verbinden"
      onClose={onClose}
      width={460}
      footer={
        <>
          <WBtn primary disabled={!/^\\\\[^\\]+\\[^\\]+/.test(path.trim())} onClick={go}>
            Fertig stellen
          </WBtn>
          <WBtn onClick={onClose}>Abbrechen</WBtn>
        </>
      }
    >
      <div className="mb-2 text-[14px] font-semibold">Welcher Netzwerkordner soll zugeordnet werden?</div>
      <p className="mb-3 text-slate-600">Bestimmen Sie den Laufwerkbuchstaben für die Verbindung und den Ordner, mit dem die Verbindung hergestellt werden soll:</p>
      <div className="grid grid-cols-[80px_1fr] items-center gap-2">
        <span>Laufwerk:</span>
        <WSelect value={letter} onChange={(e) => setLetter(e.target.value)} className="w-24">
          {letters.map((l) => (
            <option key={l} disabled={used.has(l)}>
              {l}
              {used.has(l) ? ' (belegt)' : ''}
            </option>
          ))}
        </WSelect>
        <span>Ordner:</span>
        <WInput value={path} onChange={(e) => setPath(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} className="font-mono" autoFocus />
        <span />
        <span className="text-[11px] text-slate-500">Beispiel: \\FS01\Vertrieb</span>
      </div>
      <div className="mt-3 flex flex-col gap-1.5">
        <WCheck label="Verbindung bei Anmeldung wiederherstellen" checked={persist} onChange={setPersist} />
        <WCheck label="Verbindung mit anderen Anmeldeinformationen herstellen" checked={false} onChange={() => {}} />
      </div>
    </WDialog>
  )
}

// ─────────────── Datenträgerbereinigung ───────────────

export function CleanupApp({ host, args }: AppProps) {
  const ep = useEp(host)
  if (!ep) return <AppLoading />
  return <Cleanup host={host} ep={ep} drive={(args.drive ?? 'C:').toUpperCase()} />
}

function Cleanup({ host, ep, drive }: { host: string; ep: Endpoint; drive: string }) {
  const desk = useDesk()
  const win = useWin()
  const ops = useEpOps(host)
  const user = ep.loggedOnUser ?? 'azubi'
  const cats = useMemo(
    () => [
      { id: 'temp', label: 'Temporäre Dateien', path: '%TEMP%', def: true, desc: 'Von Programmen abgelegte temporäre Dateien im Benutzerprofil (%TEMP%).' },
      { id: 'wtemp', label: 'Temporäre Windows-Dateien', path: 'C:\\Windows\\Temp', def: true, desc: 'Temporäre Dateien des Systems (C:\\Windows\\Temp).' },
      { id: 'wu', label: 'Windows Update-Bereinigung', path: 'C:\\Windows\\SoftwareDistribution\\Download', def: true, desc: 'Bereits installierte Update-Pakete im Download-Cache von Windows Update.' },
      { id: 'dl', label: 'Downloads', path: `C:\\Users\\${user}\\Downloads`, def: false, desc: 'Achtung: Dateien im Download-Ordner des Benutzers. Nur nach Rücksprache löschen!' },
    ],
    [user],
  )
  const [checked, setChecked] = useState<Record<string, boolean>>(() => Object.fromEntries(cats.map((c) => [c.id, c.def])))
  const [sel, setSel] = useState('temp')
  const sizes = cats.map((c) => {
    const n = resolveFs(ep, expandEnv(ep, c.path))
    return n ? nodeSizeMb({ ...n, children: (n.children ?? []).filter((x) => !x.system) }) : 0
  })
  const total = cats.reduce((s, c, i) => s + (checked[c.id] ? sizes[i] : 0), 0)
  useEffect(() => win.setTitle(`Datenträgerbereinigung für (${drive})`), [win, drive])
  if (drive !== 'C:')
    return <div className="p-4 text-[12px]">Für Laufwerk {drive} wurden keine bereinigbaren Dateien gefunden.</div>
  const run = async () => {
    const ok = await desk.confirm('Möchten Sie diese Dateien wirklich endgültig löschen?', { title: 'Datenträgerbereinigung', icon: 'question', ok: 'Dateien löschen', cancel: 'Abbrechen' })
    if (!ok) return
    let freed = 0
    const done = cats.filter((c) => checked[c.id])
    ops.mutate(
      (e) => {
        for (const c of done) freed += emptyDir(e, expandEnv(e, c.path))
      },
      { type: A.diskChanged, detail: `Datenträgerbereinigung ${drive}: ${fmtSize(total)} freigegeben (${done.map((c) => c.label).join(', ') || '–'})` },
    )
    await desk.alert(`Die Datenträgerbereinigung hat ${fmtSize(freed)} Speicherplatz auf ${drive} freigegeben.\n\nFreier Speicher jetzt: ${freeGb(useStore.getState().world.endpoints[host] ?? ep, drive).toLocaleString('de-DE')} GB`, { title: 'Datenträgerbereinigung', icon: 'info' })
    win.close()
  }
  const cur = cats.find((c) => c.id === sel)!
  return (
    <div className="flex h-full flex-col bg-[#f3f3f3] p-3 text-[12px]">
      <div className="mb-2 flex items-start gap-3">
        <Eraser size={32} className="text-[#005fb8]" strokeWidth={1.3} />
        <p>Mit der Datenträgerbereinigung können Sie bis zu {fmtSize(sizes.reduce((a, b) => a + b, 0))} Speicherplatz auf ({drive}) freigeben. Aktuell frei: {freeGb(ep, drive).toLocaleString('de-DE')} GB.</p>
      </div>
      <div className="mb-1">Zu löschende Dateien:</div>
      <div className="mb-2 rounded-[4px] border border-[#d0d0d0] bg-white">
        {cats.map((c, i) => (
          <div key={c.id} className={cx('flex cursor-default items-center gap-2 px-2 py-1', sel === c.id && 'bg-[#cce4f7]')} onClick={() => setSel(c.id)}>
            <input type="checkbox" className="accent-[#005fb8]" checked={!!checked[c.id]} onChange={(e) => setChecked({ ...checked, [c.id]: e.target.checked })} />
            <span className="flex-1">{c.label}</span>
            <span className="text-slate-600">{fmtSize(sizes[i]) || '0 KB'}</span>
          </div>
        ))}
      </div>
      <div className="mb-2">Gesamter freizugebender Speicherplatz: {fmtSize(total) || '0 KB'}</div>
      <div className="mb-3 min-h-[48px] rounded-[4px] border border-[#d6d6d6] bg-white p-2">
        <div className="mb-0.5 font-semibold">Beschreibung</div>
        {cur.desc}
      </div>
      <div className="mt-auto flex justify-end gap-2">
        <WBtn primary disabled={total <= 0} onClick={() => void run()}>
          OK
        </WBtn>
        <WBtn onClick={() => win.close()}>Abbrechen</WBtn>
      </div>
    </div>
  )
}
