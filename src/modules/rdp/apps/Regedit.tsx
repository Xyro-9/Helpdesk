// Registrierungs-Editor: Baum, Werte, Bearbeiten, Neu, Löschen, Adressleiste, Suche (Strg+F / F3).

import { Binary, Folder, FolderOpen, Monitor, Type } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { A } from '@/core/actions'
import { deleteRegKey, deleteRegValue, ensureRegKey, getRegKey, regPathParts, setRegValue } from '@/core/ops/endpoint'
import type { Endpoint, RegKey, RegType, RegValue } from '@/core/types'
import { cx } from '@/ui'
import { useDesk, useEp, useEpOps } from '../desk'
import { AppLoading, ContextMenu, listCls, MenuBar, rowCls, StatusBar, TreeToggle, useContextMenu, WBtn, WCheck, WDialog, WInput, WRadio, type MenuItem } from '../ui'
import type { AppProps } from './types'

const TYPE_LABEL: Record<RegType, string> = {
  REG_SZ: 'Zeichenfolge',
  REG_EXPAND_SZ: 'Erweiterbare Zeichenfolge',
  REG_DWORD: 'DWORD-Wert (32-Bit)',
  REG_QWORD: 'QWORD-Wert (64-Bit)',
  REG_MULTI_SZ: 'Mehrteilige Zeichenfolge',
  REG_BINARY: 'Binärwert',
}

const isNum = (t: RegType) => t === 'REG_DWORD' || t === 'REG_QWORD'

export function fmtRegData(v: RegValue): string {
  if (isNum(v.type)) {
    const n = Number(v.data) || 0
    return `0x${n.toString(16).padStart(v.type === 'REG_DWORD' ? 8 : 16, '0')} (${n})`
  }
  if (v.type === 'REG_MULTI_SZ') return String(v.data).split('\n').join(' ')
  return String(v.data)
}

const joinPath = (parts: string[]) => parts.join('\\')
/** Lesbarer Pfad ohne "Computer\" */
const displayPath = (parts: string[]) => (parts.length ? `Computer\\${joinPath(parts)}` : 'Computer')

export function RegeditApp({ host }: AppProps) {
  const ep = useEp(host)
  if (!ep) return <AppLoading />
  return <Regedit host={host} ep={ep} />
}

interface EditState {
  mode: 'edit' | 'new'
  type: RegType
  name: string
  data: string
  base: 'hex' | 'dec'
}

function Regedit({ host, ep }: { host: string; ep: Endpoint }) {
  const desk = useDesk()
  const ops = useEpOps(host)
  const [sel, setSel] = useState<string[]>([])
  const [open, setOpen] = useState<Set<string>>(() => new Set(['']))
  const [addr, setAddr] = useState('Computer')
  const [selVal, setSelVal] = useState<string | null>(null)
  const [edit, setEdit] = useState<EditState | null>(null)
  const [find, setFind] = useState<{ open: boolean; q: string; keys: boolean; values: boolean; data: boolean; whole: boolean }>({ open: false, q: '', keys: true, values: true, data: true, whole: false })
  const [searching, setSearching] = useState(false)
  const keyCtx = useContextMenu<string[]>()
  const valCtx = useContextMenu<string | null>()
  const rootRef = useRef<HTMLDivElement>(null)

  const key = useMemo(() => (sel.length ? getRegKey(ep, joinPath(sel)) : ep.registry), [ep, sel])
  useEffect(() => setAddr(displayPath(sel)), [sel])
  // Schlüssel wurde gelöscht → auf Elternschlüssel springen
  useEffect(() => {
    if (sel.length && !key) setSel(sel.slice(0, -1))
  }, [key, sel])

  const select = (parts: string[]) => {
    setSel(parts)
    setSelVal(null)
    setOpen((o) => {
      const n = new Set(o)
      for (let i = 0; i < parts.length; i++) n.add(joinPath(parts.slice(0, i)))
      return n
    })
  }

  const values = useMemo(() => {
    const vals = key?.values ?? []
    const def = vals.find((v) => v.name === '')
    const rest = [...vals.filter((v) => v.name !== '')].sort((a, b) => a.name.localeCompare(b.name, 'de'))
    return [def ?? null, ...rest]
  }, [key])

  const path = joinPath(sel)
  const logDetail = (name: string, data: string) => `${path}\\${name || '(Standard)'}=${data}`

  const saveValue = (st: EditState) => {
    if (!sel.length) return
    const name = st.name.trim()
    if (st.mode === 'new') {
      if (!name) {
        void desk.alert('Der Wertname darf nicht leer sein.', { title: 'Fehler beim Erstellen des Werts', icon: 'error' })
        return
      }
      if (key?.values.some((v) => v.name.toLowerCase() === name.toLowerCase())) {
        void desk.alert(`Der Wert "${name}" kann nicht erstellt werden. Der angegebene Wertname ist bereits vorhanden. Geben Sie einen anderen Namen ein, und wiederholen Sie den Vorgang.`, { title: 'Fehler beim Erstellen des Werts', icon: 'error' })
        return
      }
    }
    let data: string | number = st.data
    if (isNum(st.type)) {
      const raw = st.data.trim() || '0'
      const n = st.base === 'hex' ? parseInt(raw, 16) : parseInt(raw, 10)
      if (!/^[0-9a-f]+$/i.test(raw) || Number.isNaN(n) || (st.base === 'dec' && !/^\d+$/.test(raw)) || (st.type === 'REG_DWORD' && n > 0xffffffff)) {
        void desk.alert('Ungültiger Wert. Bitte geben Sie eine gültige Zahl ein.', { title: 'DWORD-Wert bearbeiten', icon: 'error' })
        return
      }
      data = n
    }
    const vName = st.mode === 'new' ? name : st.name
    ops.mutate((e) => setRegValue(e, path, vName, st.type, data), { type: A.registryChanged, detail: logDetail(vName, String(data)) })
    setSelVal(vName)
    setEdit(null)
  }

  const deleteValue = async (name: string) => {
    const ok = await desk.confirm('Das Löschen bestimmter Registrierungswerte kann zu einer Instabilität des Systems führen. Möchten Sie diesen Wert wirklich endgültig löschen?', { title: 'Löschen des Werts bestätigen', icon: 'warning', ok: 'Ja', cancel: 'Nein' })
    if (!ok) return
    ops.run((e) => (deleteRegValue(e, path, name) ? null : 'Der Wert kann nicht gelöscht werden.'), { type: A.registryChanged, detail: `${path}\\${name || '(Standard)'} gelöscht` }, { errorTitle: 'Fehler beim Löschen des Werts' })
    setSelVal(null)
  }

  const deleteKey = async (parts: string[]) => {
    if (parts.length <= 1) {
      void desk.alert('Der Schlüssel kann nicht gelöscht werden: Fehler beim Löschen des Schlüssels.', { title: 'Fehler beim Löschen des Schlüssels', icon: 'error' })
      return
    }
    const ok = await desk.confirm('Möchten Sie diesen Schlüssel und alle Unterschlüssel endgültig löschen?', { title: 'Löschen des Schlüssels bestätigen', icon: 'warning', ok: 'Ja', cancel: 'Nein' })
    if (!ok) return
    const p = joinPath(parts)
    const done = ops.run((e) => (deleteRegKey(e, p) ? null : 'Fehler beim Löschen des Schlüssels.'), { type: A.registryChanged, detail: `${p} (Schlüssel gelöscht)` }, { errorTitle: 'Fehler beim Löschen des Schlüssels' })
    if (done) select(parts.slice(0, -1))
  }

  const newKey = async () => {
    if (!sel.length) return
    const name = await desk.prompt({ title: 'Neuer Schlüssel', label: `Name des neuen Schlüssels unter ${sel[sel.length - 1]}:`, value: 'Neuer Schlüssel #1' })
    if (!name?.trim()) return
    if (/\\/.test(name)) {
      void desk.alert('Der Schlüsselname darf keinen umgekehrten Schrägstrich enthalten.', { title: 'Fehler', icon: 'error' })
      return
    }
    if (key?.subkeys.some((k) => k.name.toLowerCase() === name.trim().toLowerCase())) {
      void desk.alert(`Der Schlüssel "${name}" kann nicht erstellt werden: Der angegebene Schlüsselname ist bereits vorhanden.`, { title: 'Fehler beim Erstellen des Schlüssels', icon: 'error' })
      return
    }
    const p = `${path}\\${name.trim()}`
    ops.mutate((e) => void ensureRegKey(e, p), { type: A.registryChanged, detail: `${p} (Schlüssel erstellt)` })
    select([...sel, name.trim()])
  }

  const newValue = (type: RegType) => {
    if (!sel.length) return
    let i = 1
    while (key?.values.some((v) => v.name === `Neuer Wert #${i}`)) i++
    setEdit({ mode: 'new', type, name: `Neuer Wert #${i}`, data: isNum(type) ? '0' : '', base: 'hex' })
  }

  const editValue = (v: RegValue | null) => {
    if (!sel.length) return
    const vv = v ?? { name: '', type: 'REG_SZ' as RegType, data: '' }
    setSelVal(vv.name)
    setEdit({ mode: 'edit', type: vv.type, name: vv.name, data: isNum(vv.type) ? (Number(vv.data) || 0).toString(16) : String(vv.data), base: 'hex' })
  }

  // Suche: Tiefensuche ab aktueller Position
  const runFind = (q = find.q) => {
    const needle = q.trim().toLowerCase()
    if (!needle) return
    setSearching(true)
    const match = (s: string) => (find.whole ? s.toLowerCase() === needle : s.toLowerCase().includes(needle))
    // Alle Schlüssel und Werte in Baumreihenfolge; Suche beginnt hinter der aktuellen Auswahl
    const entries: { parts: string[]; value?: string; hit: boolean }[] = []
    const walk = (k: RegKey, parts: string[]) => {
      entries.push({ parts, hit: parts.length > 0 && find.keys && match(k.name) })
      for (const v of k.values) entries.push({ parts, value: v.name, hit: (find.values && !!v.name && match(v.name)) || (find.data && match(String(v.data))) })
      for (const s of k.subkeys) walk(s, [...parts, s.name])
    }
    walk(ep.registry, [])
    const cur = joinPath(sel)
    const start = entries.findIndex((en) => joinPath(en.parts) === cur && (selVal === null ? en.value === undefined : en.value === selVal))
    const next = entries.slice(start + 1).find((en) => en.hit)
    setTimeout(() => {
      setSearching(false)
      if (!next) {
        void desk.alert('Durchsuchen der Registrierung beendet.', { title: 'Registrierungs-Editor', icon: 'info' })
        return
      }
      select(next.parts)
      setSelVal(next.value ?? null)
    }, 350)
  }

  const goAddr = () => {
    const raw = addr.trim().replace(/^Computer\\?/i, '')
    if (!raw) {
      select([])
      return
    }
    const parts = regPathParts(raw)
    // Schreibweise aus dem Baum übernehmen
    const real: string[] = []
    let k: RegKey | undefined = ep.registry
    for (const p of parts) {
      k = k?.subkeys.find((s) => s.name.toLowerCase() === p.toLowerCase())
      if (!k) break
      real.push(k.name)
    }
    if (real.length) select(real)
    if (real.length < parts.length) setAddr(displayPath(real))
  }

  const keyMenuItems = (parts: string[]): MenuItem[] => [
    { label: open.has(joinPath(parts)) ? 'Reduzieren' : 'Erweitern', onClick: () => toggle(joinPath(parts)) },
    { sep: true },
    { label: 'Neu → Schlüssel', disabled: !parts.length, onClick: () => void newKey() },
    { label: 'Neu → Zeichenfolge', disabled: !parts.length, onClick: () => newValue('REG_SZ') },
    { label: 'Neu → DWORD-Wert (32-Bit)', disabled: !parts.length, onClick: () => newValue('REG_DWORD') },
    { sep: true },
    { label: 'Suchen…', shortcut: 'Strg+F', onClick: () => setFind({ ...find, open: true }) },
    { label: 'Löschen', disabled: parts.length <= 1, onClick: () => void deleteKey(parts) },
    { sep: true },
    { label: 'Schlüsselnamen kopieren', onClick: () => void navigator.clipboard?.writeText(displayPath(parts)) },
  ]

  const toggle = (p: string) =>
    setOpen((o) => {
      const n = new Set(o)
      if (n.has(p)) n.delete(p)
      else n.add(p)
      return n
    })

  const selectedValue = selVal !== null ? (key?.values.find((v) => v.name === selVal) ?? (selVal === '' ? null : undefined)) : undefined

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      className="flex h-full flex-col text-[12px] outline-none"
      onKeyDown={(e) => {
        if (e.ctrlKey && e.key.toLowerCase() === 'f') {
          e.preventDefault()
          setFind({ ...find, open: true })
        } else if (e.key === 'F3') {
          e.preventDefault()
          if (find.q) runFind()
          else setFind({ ...find, open: true })
        } else if (e.key === 'Delete' && !(e.target instanceof HTMLInputElement)) {
          if (selVal !== null && selectedValue !== undefined) void deleteValue(selVal)
        }
      }}
    >
      <MenuBar
        menus={[
          { label: 'Datei', items: [{ label: 'Importieren…', disabled: true }, { label: 'Exportieren…', disabled: true }] },
          {
            label: 'Bearbeiten',
            items: [
              { label: 'Ändern…', disabled: selVal === null, onClick: () => editValue(selectedValue ?? null) },
              { sep: true },
              { label: 'Neu → Schlüssel', disabled: !sel.length, onClick: () => void newKey() },
              { label: 'Neu → Zeichenfolge', disabled: !sel.length, onClick: () => newValue('REG_SZ') },
              { label: 'Neu → Binärwert', disabled: !sel.length, onClick: () => newValue('REG_BINARY') },
              { label: 'Neu → DWORD-Wert (32-Bit)', disabled: !sel.length, onClick: () => newValue('REG_DWORD') },
              { label: 'Neu → QWORD-Wert (64-Bit)', disabled: !sel.length, onClick: () => newValue('REG_QWORD') },
              { label: 'Neu → Mehrteilige Zeichenfolge', disabled: !sel.length, onClick: () => newValue('REG_MULTI_SZ') },
              { label: 'Neu → Erweiterbare Zeichenfolge', disabled: !sel.length, onClick: () => newValue('REG_EXPAND_SZ') },
              { sep: true },
              { label: 'Löschen', shortcut: 'Entf', disabled: selVal === null ? sel.length <= 1 : selectedValue === undefined, onClick: () => (selVal !== null ? void deleteValue(selVal) : void deleteKey(sel)) },
              { sep: true },
              { label: 'Suchen…', shortcut: 'Strg+F', onClick: () => setFind({ ...find, open: true }) },
              { label: 'Weitersuchen', shortcut: 'F3', disabled: !find.q, onClick: () => runFind() },
            ],
          },
          { label: 'Ansicht', items: [{ label: 'Statusleiste', checked: true }, { label: 'Adressleiste', checked: true }] },
          { label: 'Favoriten', items: [{ label: 'Internet Settings (HKCU)', onClick: () => select(['HKEY_CURRENT_USER', 'Software', 'Microsoft', 'Windows', 'CurrentVersion', 'Internet Settings']) }, { label: 'Run (HKLM)', onClick: () => select(['HKEY_LOCAL_MACHINE', 'SOFTWARE', 'Microsoft', 'Windows', 'CurrentVersion', 'Run']) }] },
        ]}
      />
      <div className="border-b border-[#e5e5e5] px-1 py-1">
        <WInput value={addr} onChange={(e) => setAddr(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && goAddr()} className="h-6 font-mono text-[11px]" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="w-[40%] max-w-[360px] min-w-[180px] shrink-0 overflow-auto border-r border-[#e5e5e5] py-1">
          <TreeNode node={ep.registry} parts={[]} sel={sel} open={open} toggle={toggle} select={select} onMenu={(e, p) => keyCtx.open(e, p)} isRoot />
        </div>
        <div className="min-w-0 flex-1 overflow-auto" onContextMenu={(e) => sel.length && valCtx.open(e, null)}>
          <table className={listCls}>
            <thead>
              <tr>
                <th className="w-[34%]">Name</th>
                <th className="w-[22%]">Typ</th>
                <th>Daten</th>
              </tr>
            </thead>
            <tbody>
              {sel.length > 0 &&
                values.map((v, i) => {
                  const name = v ? v.name : ''
                  return (
                    <tr
                      key={i === 0 ? '(def)' : name}
                      className={rowCls(selVal === name)}
                      onClick={() => setSelVal(name)}
                      onDoubleClick={() => editValue(v)}
                      onContextMenu={(e) => {
                        setSelVal(name)
                        valCtx.open(e, name)
                      }}
                    >
                      <td>
                        <span className="inline-flex items-center gap-1.5">
                          {v && isNum(v.type) ? <Binary size={13} className="text-sky-700" /> : v?.type === 'REG_BINARY' ? <Binary size={13} className="text-sky-700" /> : <Type size={13} className="text-rose-600" />}
                          {name || '(Standard)'}
                        </span>
                      </td>
                      <td>{v?.type ?? 'REG_SZ'}</td>
                      <td className="max-w-[320px]">{v ? fmtRegData(v) : '(Wert nicht festgelegt)'}</td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      </div>
      <StatusBar>{searching ? 'Registrierung wird durchsucht …' : displayPath(sel)}</StatusBar>

      {keyCtx.menu && <ContextMenu x={keyCtx.menu.x} y={keyCtx.menu.y} onClose={keyCtx.close} items={keyMenuItems(keyCtx.menu.data)} />}
      {valCtx.menu && (
        <ContextMenu
          x={valCtx.menu.x}
          y={valCtx.menu.y}
          onClose={valCtx.close}
          items={
            valCtx.menu.data !== null
              ? [
                  { label: 'Ändern…', bold: true, onClick: () => editValue(key?.values.find((v) => v.name === valCtx.menu!.data) ?? null) },
                  { sep: true },
                  { label: 'Löschen', disabled: !key?.values.some((v) => v.name === valCtx.menu!.data), onClick: () => void deleteValue(valCtx.menu!.data!) },
                ]
              : [
                  { label: 'Neu → Schlüssel', onClick: () => void newKey() },
                  { sep: true },
                  { label: 'Neu → Zeichenfolge', onClick: () => newValue('REG_SZ') },
                  { label: 'Neu → Binärwert', onClick: () => newValue('REG_BINARY') },
                  { label: 'Neu → DWORD-Wert (32-Bit)', onClick: () => newValue('REG_DWORD') },
                  { label: 'Neu → QWORD-Wert (64-Bit)', onClick: () => newValue('REG_QWORD') },
                  { label: 'Neu → Mehrteilige Zeichenfolge', onClick: () => newValue('REG_MULTI_SZ') },
                  { label: 'Neu → Erweiterbare Zeichenfolge', onClick: () => newValue('REG_EXPAND_SZ') },
                ]
          }
        />
      )}
      {edit && <ValueDialog st={edit} setSt={setEdit} onSave={() => saveValue(edit)} />}
      {find.open && (
        <WDialog
          title="Suchen"
          onClose={() => setFind({ ...find, open: false })}
          width={420}
          footer={
            <>
              <WBtn
                primary
                disabled={!find.q.trim()}
                onClick={() => {
                  setFind({ ...find, open: false })
                  runFind()
                }}
              >
                Weitersuchen
              </WBtn>
              <WBtn onClick={() => setFind({ ...find, open: false })}>Abbrechen</WBtn>
            </>
          }
        >
          <div className="space-y-3">
            <label className="flex items-center gap-2">
              Suchen nach:
              <WInput
                autoFocus
                value={find.q}
                onChange={(e) => setFind({ ...find, q: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && find.q.trim()) {
                    setFind({ ...find, open: false })
                    runFind()
                  }
                }}
              />
            </label>
            <div className="flex gap-6">
              <div className="flex flex-col gap-1">
                <span className="text-slate-600">Suchen in</span>
                <WCheck label="Schlüssel" checked={find.keys} onChange={(v) => setFind({ ...find, keys: v })} />
                <WCheck label="Werte" checked={find.values} onChange={(v) => setFind({ ...find, values: v })} />
                <WCheck label="Daten" checked={find.data} onChange={(v) => setFind({ ...find, data: v })} />
              </div>
              <div className="pt-5">
                <WCheck label="Ganze Zeichenfolge vergleichen" checked={find.whole} onChange={(v) => setFind({ ...find, whole: v })} />
              </div>
            </div>
          </div>
        </WDialog>
      )}
    </div>
  )
}

function TreeNode({
  node,
  parts,
  sel,
  open,
  toggle,
  select,
  onMenu,
  isRoot,
}: {
  node: RegKey
  parts: string[]
  sel: string[]
  open: Set<string>
  toggle: (p: string) => void
  select: (p: string[]) => void
  onMenu: (e: React.MouseEvent, p: string[]) => void
  isRoot?: boolean
}) {
  const p = joinPath(parts)
  const isOpen = open.has(p)
  const isSel = joinPath(sel) === p
  return (
    <div>
      <div
        className={cx('flex cursor-default items-center gap-1 pr-2 whitespace-nowrap select-none', isSel ? 'bg-[#cce4f7]' : 'hover:bg-[#e5f1fb]')}
        style={{ paddingLeft: parts.length * 14 + 2 }}
        onClick={() => select(parts)}
        onDoubleClick={() => toggle(p)}
        onContextMenu={(e) => {
          select(parts)
          onMenu(e, parts)
        }}
      >
        <TreeToggle open={isOpen} onClick={() => toggle(p)} hidden={!node.subkeys.length} />
        {isRoot ? <Monitor size={13} className="text-sky-700" /> : isOpen ? <FolderOpen size={13} className="text-amber-500" /> : <Folder size={13} className="fill-amber-300 text-amber-500" />}
        <span>{node.name}</span>
      </div>
      {isOpen &&
        [...node.subkeys]
          .sort((a, b) => (isRoot ? 0 : a.name.localeCompare(b.name, 'de')))
          .map((k) => <TreeNode key={k.name} node={k} parts={[...parts, k.name]} sel={sel} open={open} toggle={toggle} select={select} onMenu={onMenu} />)}
    </div>
  )
}

function ValueDialog({ st, setSt, onSave }: { st: EditState; setSt: (s: EditState | null) => void; onSave: () => void }) {
  const num = isNum(st.type)
  const title = st.mode === 'new' ? `Neuer Wert: ${TYPE_LABEL[st.type]}` : num ? `${st.type === 'REG_DWORD' ? 'DWORD-Wert (32-Bit)' : 'QWORD-Wert (64-Bit)'} bearbeiten` : st.type === 'REG_MULTI_SZ' ? 'Mehrteilige Zeichenfolge bearbeiten' : st.type === 'REG_BINARY' ? 'Binärwert bearbeiten' : 'Zeichenfolge bearbeiten'
  const switchBase = (b: 'hex' | 'dec') => {
    if (b === st.base) return
    const n = st.base === 'hex' ? parseInt(st.data || '0', 16) : parseInt(st.data || '0', 10)
    setSt({ ...st, base: b, data: Number.isNaN(n) ? st.data : b === 'hex' ? n.toString(16) : String(n) })
  }
  return (
    <WDialog
      title={title}
      onClose={() => setSt(null)}
      width={num ? 400 : 420}
      footer={
        <>
          <WBtn primary onClick={onSave}>
            OK
          </WBtn>
          <WBtn onClick={() => setSt(null)}>Abbrechen</WBtn>
        </>
      }
    >
      <div className="space-y-2.5">
        <div>
          <div className="mb-1">Name:</div>
          <WInput value={st.mode === 'edit' && !st.name ? '(Standard)' : st.name} readOnly={st.mode === 'edit'} onChange={(e) => setSt({ ...st, name: e.target.value })} className={cx(st.mode === 'edit' && 'bg-[#f6f6f6]')} autoFocus={st.mode === 'new'} />
        </div>
        <div className={cx(num && 'flex gap-4')}>
          <div className="flex-1">
            <div className="mb-1">Wert:</div>
            {st.type === 'REG_MULTI_SZ' ? (
              <textarea value={st.data} onChange={(e) => setSt({ ...st, data: e.target.value })} className="h-28 w-full resize-none rounded-[4px] border border-[#d0d0d0] p-1.5 font-mono text-[12px] outline-none focus:border-[#005fb8]" />
            ) : (
              <WInput
                value={st.data}
                autoFocus={st.mode === 'edit'}
                onChange={(e) => setSt({ ...st, data: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && onSave()}
                className="font-mono"
              />
            )}
          </div>
          {num && (
            <div className="rounded-[4px] border border-[#d6d6d6] px-3 py-1.5">
              <div className="mb-1 text-slate-600">Basis</div>
              <div className="flex flex-col gap-1">
                <WRadio name="base" label="Hexadezimal" checked={st.base === 'hex'} onChange={() => switchBase('hex')} />
                <WRadio name="base" label="Dezimal" checked={st.base === 'dec'} onChange={() => switchBase('dec')} />
              </div>
            </div>
          )}
        </div>
      </div>
    </WDialog>
  )
}
