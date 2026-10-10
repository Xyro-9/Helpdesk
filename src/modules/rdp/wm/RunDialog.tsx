// "Ausführen" (Win+R)

import { Play } from 'lucide-react'
import { useState } from 'react'
import { useDesk } from '../desk'
import { WBtn, WCheck, WDialog, WInput } from '../ui'

const HISTORY_KEY = 'rdp-run-history'

function loadHistory(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}

export function RunDialog({ onClose }: { onClose: () => void }) {
  const desk = useDesk()
  const [hist] = useState(loadHistory)
  const [cmd, setCmd] = useState(hist[0] ?? '')
  const [admin, setAdmin] = useState(false)
  const go = () => {
    const c = cmd.trim()
    if (!c) return
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify([c, ...hist.filter((h) => h !== c)].slice(0, 12)))
    } catch {
      /* ohne Verlauf */
    }
    onClose()
    desk.runCommand(c, admin)
  }
  return (
    <WDialog
      title="Ausführen"
      onClose={onClose}
      width={400}
      modal={false}
      icon={<Play size={13} className="text-[#005fb8]" />}
      footer={
        <>
          <WBtn primary onClick={go} disabled={!cmd.trim()}>
            OK
          </WBtn>
          <WBtn onClick={onClose}>Abbrechen</WBtn>
        </>
      }
    >
      <div className="mb-3 flex gap-3">
        <Play size={30} className="shrink-0 text-[#005fb8]" strokeWidth={1.4} />
        <p>Geben Sie den Namen eines Programms, Ordners, Dokuments oder einer Internetressource an.</p>
      </div>
      <label className="flex items-center gap-2">
        Öffnen:
        <WInput
          autoFocus
          list="rdp-run-hist"
          value={cmd}
          onChange={(e) => setCmd(e.target.value)}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (e.ctrlKey && e.shiftKey) setAdmin(true)
              go()
            }
          }}
          className="font-mono"
        />
        <datalist id="rdp-run-hist">
          {hist.map((h) => (
            <option key={h} value={h} />
          ))}
        </datalist>
      </label>
      <div className="mt-3 pl-[52px]">
        <WCheck label="Diese Aufgabe mit Administratorrechten erstellen" checked={admin} onChange={setAdmin} />
      </div>
    </WDialog>
  )
}
