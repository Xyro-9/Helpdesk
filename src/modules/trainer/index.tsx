// Trainer-Modus (PIN-geschützt): Einstellungen, Ergebnisse & Protokoll, Szenario-Editor, Welt & Daten

import { Database, FlaskConical, Lock, ListChecks, Settings2, ShieldCheck, Unlock } from 'lucide-react'
import { useState } from 'react'
import { useStore } from '@/core/store'
import { Button, cx, Input, PageHeader, Tabs } from '@/ui'
import { DataTab } from './DataTab'
import { ResultsTab } from './ResultsTab'
import { ScenarioEditorTab } from './ScenarioEditor'
import { SettingsTab } from './SettingsTab'

type Tab = 'settings' | 'results' | 'editor' | 'data'

export function TrainerView() {
  // Freischaltung bewusst nur im Komponentenzustand: beim Verlassen der Ansicht wird wieder gesperrt.
  const [unlocked, setUnlocked] = useState(false)
  const [tab, setTab] = useState<Tab>('settings')
  const customCount = useStore((s) => s.customScenarios.length)
  const resultsCount = useStore((s) => s.results.length)

  if (!unlocked) return <PinGate onUnlock={() => setUnlocked(true)} />

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Trainer-Modus"
        subtitle="Für Ausbilderinnen und Ausbilder – Einstellungen, Auswertung und eigene Szenarien"
        icon={<ShieldCheck size={20} />}
        actions={
          <Button icon={<Lock size={15} />} onClick={() => setUnlocked(false)}>
            Sperren
          </Button>
        }
      />
      <div className="bg-white px-5">
        <Tabs<Tab>
          tabs={[
            { id: 'settings', label: <span className="flex items-center gap-1.5"><Settings2 size={15} /> Einstellungen</span> },
            { id: 'results', label: <span className="flex items-center gap-1.5"><ListChecks size={15} /> Ergebnisse & Protokoll</span>, badge: resultsCount ? <span className="rounded-full bg-slate-200 px-1.5 text-[11px]">{resultsCount}</span> : undefined },
            { id: 'editor', label: <span className="flex items-center gap-1.5"><FlaskConical size={15} /> Szenario-Editor</span>, badge: customCount ? <span className="rounded-full bg-violet-100 px-1.5 text-[11px] text-violet-800">{customCount}</span> : undefined },
            { id: 'data', label: <span className="flex items-center gap-1.5"><Database size={15} /> Welt & Daten</span> },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>
      <div className="flex-1 p-5">
        {tab === 'settings' && <SettingsTab />}
        {tab === 'results' && <ResultsTab />}
        {tab === 'editor' && <ScenarioEditorTab />}
        {tab === 'data' && <DataTab />}
      </div>
    </div>
  )
}

function PinGate({ onUnlock }: { onUnlock: () => void }) {
  const pin = useStore((s) => s.settings.trainerPin)
  const [value, setValue] = useState('')
  const [error, setError] = useState(false)
  const [attempts, setAttempts] = useState(0)

  const submit = () => {
    if (value === pin) {
      onUnlock()
      return
    }
    setAttempts((a) => a + 1)
    setError(true)
    setValue('')
    setTimeout(() => setError(false), 600)
  }

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader title="Trainer-Modus" icon={<ShieldCheck size={20} />} />
      <div className="flex flex-1 items-center justify-center p-6">
        <form
          className={cx('w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm', error && 'animate-[shake_0.4s]')}
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <style>{'@keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}}'}</style>
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-600">
            <Lock size={22} />
          </div>
          <h2 className="font-semibold text-slate-900">Bereich für Ausbilder</h2>
          <p className="mt-1 text-sm text-slate-500">Bitte die Trainer-PIN eingeben.</p>
          <Input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/\D/g, '').slice(0, 8))}
            className="mt-4 text-center text-lg tracking-[0.5em]"
            aria-label="PIN"
          />
          {attempts > 0 && <p className="mt-2 text-xs text-rose-700">Falsche PIN{attempts >= 3 ? ' – die PIN kann im Trainer-Modus geändert werden (Standard: siehe Handbuch).' : '.'}</p>}
          <Button type="submit" variant="primary" icon={<Unlock size={15} />} className="mt-4 w-full" disabled={!value}>
            Freischalten
          </Button>
        </form>
      </div>
    </div>
  )
}
