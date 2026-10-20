// "Remotedesktopverbindung"-Dialog: Computername mit Vorschlägen aus dem AD.

import { Laptop, Monitor, MonitorSmartphone } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useStore } from '@/core/store'
import { cx } from '@/ui'
import { isServerComputer } from './connect'
import { useRdp } from './store'
import { WBtn, WCheck, WInput } from './ui'

export function ConnectPanel({ onDone, onCancel }: { onDone?: () => void; onCancel?: () => void }) {
  const computers = useStore((s) => s.world.computers)
  const sessions = useStore((s) => s.ui.rdpSessions)
  const openRdp = useStore((s) => s.openRdp)
  const [name, setName] = useState('')
  const [focus, setFocus] = useState(false)
  const [hi, setHi] = useState(0)
  const list = useMemo(() => {
    const q = name.trim().toLowerCase()
    return computers.filter((c) => !isServerComputer(c) && (!q || c.name.toLowerCase().includes(q))).slice(0, 8)
  }, [computers, name])

  const connect = (n = name) => {
    const target = n.trim()
    if (!target) return
    const existing = sessions.find((s) => s.toLowerCase() === target.toLowerCase())
    const key = existing ?? target
    const local = useRdp.getState().sessions[key]
    if (local && local.phase !== 'connected') useRdp.getState().connectStart(key)
    openRdp(key)
    onDone?.()
  }

  return (
    <div className="w-[440px] max-w-full overflow-hidden rounded-[8px] border border-[#c8c8c8] bg-white text-[12px] shadow-2xl">
      <div className="flex items-center gap-3 bg-gradient-to-r from-[#0b4fa0] to-[#2b88d8] px-4 py-3 text-white">
        <MonitorSmartphone size={30} strokeWidth={1.4} />
        <div>
          <div className="text-[11px] opacity-80">Remotedesktop-</div>
          <div className="text-[17px] font-semibold">Verbindung</div>
        </div>
      </div>
      <div className="space-y-3 p-4">
        <div className="grid grid-cols-[110px_1fr] items-center gap-2">
          <span>Computer:</span>
          <div className="relative">
            <WInput
              autoFocus
              value={name}
              placeholder="z.B. PC-VT-001"
              onChange={(e) => {
                setName(e.target.value)
                setHi(0)
              }}
              onFocus={() => setFocus(true)}
              onBlur={() => setTimeout(() => setFocus(false), 150)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') setHi(Math.min(list.length - 1, hi + 1))
                else if (e.key === 'ArrowUp') setHi(Math.max(0, hi - 1))
                else if (e.key === 'Enter') {
                  const exact = list.find((c) => c.name.toLowerCase() === name.trim().toLowerCase())
                  connect(exact || !focus || !list[hi] || !name.trim() ? name : list[hi].name)
                } else if (e.key === 'Escape') onCancel?.()
              }}
              className="font-mono uppercase"
            />
            {focus && name.trim() && list.length > 0 && (
              <div className="absolute top-full right-0 left-0 z-10 mt-0.5 max-h-56 overflow-auto rounded-[4px] border border-[#d0d0d0] bg-white shadow-lg">
                {list.map((c, i) => (
                  <button
                    key={c.name}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setName(c.name)
                      setFocus(false)
                    }}
                    className={cx('flex w-full items-center gap-2 px-2 py-1 text-left', i === hi ? 'bg-[#cce4f7]' : 'hover:bg-[#e5f1fb]')}
                  >
                    {c.name.startsWith('NB-') ? <Laptop size={13} className="text-slate-500" /> : <Monitor size={13} className="text-slate-500" />}
                    <span className="font-mono">{c.name}</span>
                    <span className="ml-auto truncate text-[11px] text-slate-500">{c.location}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <span>Benutzername:</span>
          <WInput value="MUSTERWERK\azubi" readOnly className="bg-[#f6f6f6] font-mono" />
        </div>
        <p className="text-slate-500">Die Anmeldung erfolgt mit Ihrem Domänenkonto (einmaliges Anmelden). Holen Sie vor dem Verbinden das Einverständnis des Benutzers ein.</p>
        <WCheck label="Anmeldeinformationen speichern" checked onChange={() => {}} />
      </div>
      <div className="flex justify-end gap-2 border-t border-[#e3e3e3] bg-[#f3f3f3] px-4 py-2.5">
        <WBtn primary disabled={!name.trim()} onClick={() => connect()}>
          Verbinden
        </WBtn>
        {onCancel && <WBtn onClick={onCancel}>Abbrechen</WBtn>}
      </div>
    </div>
  )
}
