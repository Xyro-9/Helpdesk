// Suche nach AD-Benutzern (für Zuweisung und Versand)

import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useStore } from '@/core/store'
import type { AdUser } from '@/core/types'
import { normalize } from '@/core/util'
import { cx, Input } from '@/ui'

export function UserPicker({ value, onPick, placeholder = 'Name, Benutzername oder Abteilung …', autoFocus }: { value?: string; onPick: (u: AdUser) => void; placeholder?: string; autoFocus?: boolean }) {
  const users = useStore((s) => s.world.users)
  const [q, setQ] = useState('')
  const list = useMemo(() => {
    const n = normalize(q.trim())
    return users
      .filter((u) => u.enabled && !u.isServiceAccount && u.sam !== 'azubi')
      .filter((u) => !n || normalize(`${u.displayName} ${u.sam} ${u.department} ${u.office}`).includes(n))
      .slice(0, n ? 12 : 8)
  }, [users, q])
  return (
    <div>
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute top-2.5 left-2.5 text-slate-400" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className="pl-8" autoFocus={autoFocus} aria-label="Benutzer suchen" />
      </div>
      <ul className="mt-1 max-h-56 overflow-y-auto rounded-md border border-slate-200">
        {list.map((u) => (
          <li key={u.sam}>
            <button type="button" onClick={() => onPick(u)} className={cx('flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-sky-50', value === u.sam && 'bg-sky-50')}>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[11px] font-semibold text-slate-600">
                {u.givenName[0]}
                {u.surname[0]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-slate-800">{u.displayName}</span>
                <span className="block truncate text-xs text-slate-500">
                  {u.sam} · {u.department} · {u.homeOffice ? `Homeoffice ${u.homeAddress?.city ?? ''}` : u.office}
                </span>
              </span>
            </button>
          </li>
        ))}
        {!list.length && <li className="px-3 py-2 text-sm text-slate-500">Kein Benutzer gefunden.</li>}
      </ul>
    </div>
  )
}
