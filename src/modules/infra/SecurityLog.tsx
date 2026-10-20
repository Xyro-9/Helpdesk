// DC-Sicherheitsprotokoll (Ereignisanzeige für DC01, Protokoll „Sicherheit“)

import { Lightbulb, RefreshCw, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useStore } from '@/core/store'
import { Button, Input, cx } from '@/ui'
import { filterEvents, parseIdList } from './lib'
import { EventViewer } from './shared'

const QUICK: { label: string; ids: number[] }[] = [
  { label: 'Alle', ids: [] },
  { label: '4740 Kontosperrung', ids: [4740] },
  { label: '4625 Fehlanmeldung', ids: [4625] },
  { label: '4767 Entsperrung', ids: [4767] },
  { label: '4724 Kennwort-Reset', ids: [4724] },
  { label: '4720 Konto erstellt', ids: [4720] },
  { label: '4728/4729 Gruppe', ids: [4728, 4729, 4732, 4733, 4756, 4757] },
  { label: '4722/4725 (De-)Aktivierung', ids: [4722, 4725] },
  { label: '4738 Konto geändert', ids: [4738] },
]

export function SecurityLog() {
  const dc = useStore((s) => s.world.infra.servers.find((x) => x.name === 'DC01'))
  const toast = useStore((s) => s.toast)
  const [ids, setIds] = useState<number[]>([])
  const [idText, setIdText] = useState('')
  const [account, setAccount] = useState('')
  const [sel, setSel] = useState<string | undefined>()
  const [tick, setTick] = useState(0)
  const all = dc?.events
  const events = useMemo(() => {
    void tick
    return all && dc?.online ? filterEvents(all, { log: 'Sicherheit', ids, query: account }) : []
  }, [all, dc?.online, ids, account, tick])
  const total = useMemo(() => (all ?? []).filter((e) => e.log === 'Sicherheit').length, [all])
  const activeQuick = QUICK.find((qk) => qk.ids.join() === ids.join())

  if (!dc) return <p className="text-sm text-slate-500">DC01 nicht gefunden.</p>
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-slate-700">Ereignisanzeige (DC01.musterwerk.local) → Windows-Protokolle → Sicherheit</span>
        <span className="text-xs text-slate-500">
          {total} Ereignisse · gefiltert: {events.length}
        </span>
        <div className="flex-1" />
        <Button
          size="sm"
          icon={<RefreshCw size={13} />}
          onClick={() => {
            setTick((t) => t + 1)
            toast('Protokoll aktualisiert.', 'info')
          }}
        >
          Aktualisieren
        </Button>
      </div>
      {!dc.online && <div className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800">DC01 ist nicht erreichbar – das Sicherheitsprotokoll kann nicht gelesen werden.</div>}
      <div className="flex flex-wrap gap-1.5">
        {QUICK.map((qk) => (
          <button
            key={qk.label}
            type="button"
            onClick={() => {
              setIds(qk.ids)
              setIdText(qk.ids.join(', '))
              setSel(undefined)
            }}
            className={cx('rounded-full px-2.5 py-1 text-xs ring-1', activeQuick === qk ? 'bg-sky-600 text-white ring-sky-600' : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50')}
          >
            {qk.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Ereignis-IDs:
          <Input
            className="w-48"
            placeholder="z. B. 4740, 4625"
            value={idText}
            onChange={(e) => {
              setIdText(e.target.value)
              setIds(parseIdList(e.target.value))
              setSel(undefined)
            }}
          />
        </label>
        <div className="relative w-72">
          <Search size={14} className="absolute top-2.5 left-2.5 text-slate-400" />
          <Input
            className="pl-8"
            placeholder="Kontoname / Text suchen (z. B. l.schulz)"
            value={account}
            onChange={(e) => {
              setAccount(e.target.value)
              setSel(undefined)
            }}
          />
        </div>
      </div>
      <EventViewer events={events} selected={sel} onSelect={setSel} />
      <div className="flex items-start gap-2 rounded-md bg-sky-50 px-3 py-2 text-xs text-sky-900 ring-1 ring-sky-200">
        <Lightbulb size={14} className="mt-0.5 shrink-0" />
        <span>
          Wiederholte Kontosperrungen? Im Ereignis <strong>4740</strong> steht unter „Aufrufername des Computers“, von welchem Gerät die fehlerhaften Anmeldungen kamen (z. B. altes Kennwort auf Smartphone, gespeicherte Anmeldeinformationen, verbundenes Netzlaufwerk). Erst die Ursache beseitigen, dann entsperren.
        </span>
      </div>
    </div>
  )
}
