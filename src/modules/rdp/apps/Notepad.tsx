// Editor (Notepad) – Textdateien öffnen/speichern, z.B. die hosts-Datei.

import { useEffect, useRef, useState } from 'react'
import { A } from '@/core/actions'
import { expandEnv, readFile, resolveFs, writeFile } from '@/core/ops/endpoint'
import type { Endpoint } from '@/core/types'
import { useDesk, useEp, useEpOps, useWin } from '../desk'
import { AppLoading, MenuBar, StatusBar } from '../ui'
import { needsAdmin, type AppProps } from './types'

export function NotepadApp({ host, args }: AppProps) {
  const ep = useEp(host)
  if (!ep) return <AppLoading />
  return <Notepad host={host} ep={ep} initialPath={args.path} admin={args.admin === '1'} />
}

function Notepad({ host, ep, initialPath, admin }: { host: string; ep: Endpoint; initialPath?: string; admin: boolean }) {
  const win = useWin()
  const desk = useDesk()
  const ops = useEpOps(host)
  const initial = initialPath ? expandEnv(ep, initialPath.replace(/^"|"$/g, '')) : ''
  const [path, setPath] = useState(initial)
  const [text, setText] = useState(() => (initial ? (readFile(ep, initial) ?? '') : ''))
  const [saved, setSaved] = useState(text)
  const [wrap, setWrap] = useState(false)
  const [pos, setPos] = useState({ line: 1, col: 1 })
  const ta = useRef<HTMLTextAreaElement>(null)
  const checked = useRef(false)

  // Datei existiert nicht → wie im Original nachfragen
  useEffect(() => {
    if (checked.current || !initial) return
    checked.current = true
    const node = resolveFs(ep, initial)
    if (node?.type === 'dir') {
      void desk.alert(`Der Pfad "${initial}" ist ein Ordner.`, { title: 'Editor', icon: 'error' })
      setPath('')
    } else if (!node) {
      void desk.confirm(`Die Datei "${initial}" wurde nicht gefunden.\n\nMöchten Sie eine neue Datei erstellen?`, { title: 'Editor', icon: 'question', ok: 'Ja', cancel: 'Nein' }).then((yes) => {
        if (!yes) setPath('')
      })
    }
  }, [ep, initial, desk])

  const name = path ? (path.split('\\').pop() ?? path) : 'Unbenannt'
  const dirty = text !== saved
  useEffect(() => {
    win.setTitle(`${dirty ? '*' : ''}${name} – Editor${admin ? ' (Administrator)' : ''}`)
  }, [win, dirty, name, admin])

  const saveTo = (target: string) => {
    const p = expandEnv(ep, target.trim().replace(/^"|"$/g, ''))
    if (!/^[a-z]:\\/i.test(p)) {
      void desk.alert(`Ungültiger Pfad: "${target}"`, { title: 'Editor', icon: 'error' })
      return
    }
    if (needsAdmin(p) && !admin) {
      void desk.alert(`Zugriff auf "${p}" wurde verweigert.\n\nSie haben keine Berechtigung, an diesem Speicherort zu speichern. Wenden Sie sich an den Administrator, um die Berechtigung zu erhalten.\n\n(Tipp: Editor über „Als Administrator ausführen“ starten.)`, { title: 'Editor', icon: 'error' })
      return
    }
    const ok = ops.run((e) => writeFile(e, p, text), { type: A.fileChanged, detail: p }, { errorTitle: 'Editor' })
    if (ok) {
      setSaved(text)
      setPath(p)
    }
  }

  const save = async () => {
    if (path) saveTo(path)
    else await saveAs()
  }
  const saveAs = async () => {
    const p = await desk.prompt({ title: 'Speichern unter', label: 'Dateiname (vollständiger Pfad):', value: path || `C:\\Users\\${ep.loggedOnUser ?? 'azubi'}\\Documents\\Neues Textdokument.txt` })
    if (p) saveTo(p)
  }
  const open = async () => {
    const p = await desk.prompt({ title: 'Öffnen', label: 'Dateiname (vollständiger Pfad):', value: path || 'C:\\Windows\\System32\\drivers\\etc\\hosts' })
    if (!p) return
    const full = expandEnv(ep, p.trim().replace(/^"|"$/g, ''))
    const content = readFile(ep, full)
    if (content === undefined) {
      void desk.alert(`${full}\nDie Datei wurde nicht gefunden.\nÜberprüfen Sie den Dateinamen, und wiederholen Sie den Vorgang.`, { title: 'Öffnen', icon: 'warning' })
      return
    }
    setPath(full)
    setText(content)
    setSaved(content)
  }

  const updatePos = () => {
    const el = ta.current
    if (!el) return
    const before = el.value.slice(0, el.selectionStart)
    const lines = before.split('\n')
    setPos({ line: lines.length, col: lines[lines.length - 1].length + 1 })
  }

  return (
    <div className="flex h-full flex-col">
      <MenuBar
        menus={[
          {
            label: 'Datei',
            items: [
              {
                label: 'Neu',
                shortcut: 'Strg+N',
                onClick: () => {
                  setPath('')
                  setText('')
                  setSaved('')
                },
              },
              { label: 'Öffnen…', shortcut: 'Strg+O', onClick: () => void open() },
              { label: 'Speichern', shortcut: 'Strg+S', onClick: () => void save() },
              { label: 'Speichern unter…', shortcut: 'Strg+Umschalt+S', onClick: () => void saveAs() },
              { sep: true },
              { label: 'Beenden', onClick: () => win.close() },
            ],
          },
          {
            label: 'Bearbeiten',
            items: [
              { label: 'Alles markieren', shortcut: 'Strg+A', onClick: () => ta.current?.select() },
              {
                label: 'Uhrzeit/Datum einfügen',
                shortcut: 'F5',
                onClick: () => setText((t) => t + new Date(Date.now() + ep.timeOffsetMin * 60000).toLocaleString('de-DE')),
              },
            ],
          },
          { label: 'Format', items: [{ label: 'Zeilenumbruch', checked: wrap, onClick: () => setWrap(!wrap) }] },
          { label: 'Ansicht', items: [{ label: 'Statusleiste', checked: true }] },
        ]}
      />
      <textarea
        ref={ta}
        value={text}
        spellCheck={false}
        wrap={wrap ? 'soft' : 'off'}
        onChange={(e) => {
          setText(e.target.value)
          updatePos()
        }}
        onKeyUp={updatePos}
        onClick={updatePos}
        onKeyDown={(e) => {
          if (e.ctrlKey && e.key.toLowerCase() === 's') {
            e.preventDefault()
            if (e.shiftKey) void saveAs()
            else void save()
          } else if (e.ctrlKey && e.key.toLowerCase() === 'o') {
            e.preventDefault()
            void open()
          }
        }}
        className="min-h-0 flex-1 resize-none border-0 bg-white p-2 font-mono text-[13px] leading-5 text-slate-900 outline-none"
      />
      <StatusBar>
        <span className="flex-1 truncate">{path || 'Unbenannt'}</span>
        <span>
          Zeile {pos.line}, Spalte {pos.col}
        </span>
        <span>100 %</span>
        <span>Windows (CRLF)</span>
        <span>UTF-8</span>
      </StatusBar>
    </div>
  )
}
