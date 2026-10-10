// Trainer-Modus · Welt & Daten: Zurücksetzen, Tickets schließen, Export/Import, Schicht-Status

import { Database, Download, FolderX, RefreshCw, Square, Timer, Upload } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { A } from '@/core/actions'
import { allScenarios } from '@/core/scenarios/engine'
import { useStore } from '@/core/store'
import type { World } from '@/core/types'
import { fmtDateTime, fmtRelative, nowIso, uid } from '@/core/util'
import { downloadText, fileStamp } from '@/modules/progress/stats'
import { isOpenTicket } from '@/modules/training/launch'
import { Button, Card, Modal } from '@/ui'

/** Schließt alle offenen (nicht historischen) Tickets ohne Bewertung und beendet laufende Anrufe/Chats */
export function closeAllOpenTickets(w: World): number {
  const now = nowIso()
  let n = 0
  const closed = new Set<string>()
  for (const t of w.tickets) {
    if (!isOpenTicket(t)) continue
    t.status = 'Geschlossen'
    t.resolutionCode ??= 'Vom Benutzer zurückgezogen'
    t.resolvedAt ??= now
    t.updatedAt = now
    t.tags = t.tags.filter((x) => x !== 'anruf-ausstehend')
    t.workNotes.push({ id: uid('n'), author: 'System', text: 'Durch den Ausbilder geschlossen (Trainer-Modus, ohne Bewertung).', time: now })
    closed.add(t.id)
    n++
  }
  for (const c of w.calls) {
    if (c.state === 'klingelt' || c.state === 'aktiv' || c.state === 'gehalten') {
      c.state = 'beendet'
      c.endedAt = now
    }
  }
  for (const ch of w.chats) if (ch.ticketId && closed.has(ch.ticketId)) ch.open = false
  return n
}

type Confirm = 'reset' | 'close' | null

export function DataTab() {
  const world = useStore((s) => s.world)
  const custom = useStore((s) => s.customScenarios)
  const resultsCount = useStore((s) => s.results.length)
  const updateWorld = useStore((s) => s.updateWorld)
  const resetWorld = useStore((s) => s.resetWorld)
  const exportState = useStore((s) => s.exportState)
  const importState = useStore((s) => s.importState)
  const stopShift = useStore((s) => s.stopShift)
  const setActiveTicket = useStore((s) => s.setActiveTicket)
  const toast = useStore((s) => s.toast)
  const navigate = useStore((s) => s.navigate)
  const [confirm, setConfirm] = useState<Confirm>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const scenarios = useMemo(() => allScenarios(custom), [custom])

  const openTickets = useMemo(() => world.tickets.filter(isOpenTicket).length, [world.tickets])
  const shift = world.shift

  const doReset = () => {
    resetWorld()
    setConfirm(null)
    toast('Die Welt wurde in den Ausgangszustand zurückgesetzt. Ergebnisse und eigene Szenarien bleiben erhalten.', 'success')
  }

  const doClose = () => {
    let n = 0
    updateWorld(
      (w) => {
        n = closeAllOpenTickets(w)
      },
      { type: A.ticketStatus, ticketId: undefined, detail: 'Trainer: alle offenen Tickets geschlossen' },
    )
    setActiveTicket(undefined)
    setConfirm(null)
    toast(`${n} Ticket(s) geschlossen.`, 'success')
  }

  const doExport = () => {
    downloadText(`helpdesk-trainer_${world.tech.name.replace(/\s+/g, '-')}_${fileStamp()}.json`, exportState(), 'application/json')
    toast('Export erstellt (ohne API-Schlüssel).', 'success')
  }

  const onFile = (file: File | undefined) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const msg = importState(String(reader.result ?? ''))
      if (msg === null) toast('Import erfolgreich.', 'success')
      else toast(msg, msg.startsWith('Fortschritt importiert') ? 'warning' : 'error')
      if (fileRef.current) fileRef.current.value = ''
    }
    reader.onerror = () => toast('Datei konnte nicht gelesen werden.', 'error')
    reader.readAsText(file)
  }

  const stats: [string, number | string][] = [
    ['Benutzer (AD)', world.users.length],
    ['Computer (AD)', world.computers.length],
    ['Simulierte Endpunkte', Object.keys(world.endpoints).length],
    ['Tickets (offen / gesamt)', `${openTickets} / ${world.tickets.length}`],
    ['E-Mails', world.mails.length],
    ['Chats / Anrufe', `${world.chats.length} / ${world.calls.length}`],
    ['Assets / Sendungen', `${world.assets.length} / ${world.shipments.length}`],
    ['KB-Artikel', world.kb.length],
    ['Protokolleinträge', world.actionLog.length],
    ['Bewertungsergebnisse', resultsCount],
    ['Eigene Szenarien', custom.length],
    ['Welt erstellt', fmtDateTime(world.createdAt)],
  ]

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card
        title={
          <span className="flex items-center gap-2">
            <Timer size={16} /> Schicht-Status
          </span>
        }
      >
        {shift.active ? (
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2 text-emerald-800">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500" /> Schicht läuft seit {fmtDateTime(shift.startedAt)}
            </div>
            <dl className="grid grid-cols-2 gap-1">
              <dt className="text-slate-500">Schwierigkeit</dt>
              <dd>{shift.difficulty === 0 ? 'gemischt' : `Stufe ${shift.difficulty}`}</dd>
              <dt className="text-slate-500">Tickets</dt>
              <dd>
                {shift.spawned.length} / {shift.maxTickets}
              </dd>
              <dt className="text-slate-500">Abstand</dt>
              <dd>ca. {shift.intervalMin} Min.</dd>
              <dt className="text-slate-500">Nächstes Ticket</dt>
              <dd>{shift.nextArrivalAt ? fmtRelative(shift.nextArrivalAt) : '–'}</dd>
            </dl>
            {shift.spawned.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-medium text-slate-600">Bisher eingetroffen</div>
                <ol className="list-decimal space-y-0.5 pl-5 text-xs text-slate-700">
                  {shift.spawned.map((id, i) => (
                    <li key={id + i}>{scenarios.find((s) => s.id === id)?.title ?? id}</li>
                  ))}
                </ol>
              </div>
            )}
            <Button variant="danger" icon={<Square size={14} />} onClick={stopShift}>
              Schicht beenden
            </Button>
          </div>
        ) : (
          <div className="space-y-3 text-sm text-slate-600">
            <p>Zurzeit läuft keine Schicht. Eine Schicht wird in der Übersicht gestartet (Schwierigkeit, Anzahl, Abstand).</p>
            <Button onClick={() => navigate('dashboard')}>Zur Übersicht</Button>
          </div>
        )}
      </Card>

      <Card
        title={
          <span className="flex items-center gap-2">
            <Database size={16} /> Welt
          </span>
        }
      >
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
          {stats.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-slate-500">{k}</dt>
              <dd className="text-right tabular-nums text-slate-800">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          <Button icon={<FolderX size={15} />} onClick={() => setConfirm('close')} disabled={!openTickets}>
            Alle offenen Tickets schließen
          </Button>
          <Button variant="danger" icon={<RefreshCw size={15} />} onClick={() => setConfirm('reset')}>
            Welt zurücksetzen
          </Button>
        </div>
      </Card>

      <Card
        title={
          <span className="flex items-center gap-2">
            <Download size={16} /> Export & Import
          </span>
        }
        className="xl:col-span-2"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="text-sm text-slate-600">
            <p>
              Sichert Welt, Einstellungen, Ergebnisse und eigene Szenarien als JSON-Datei – z. B. für die Übergabe an eine andere Ausbilderin oder als Nachweis. Der API-Schlüssel wird <strong>nicht</strong> exportiert.
            </p>
            <Button className="mt-3" variant="primary" icon={<Download size={15} />} onClick={doExport}>
              Exportieren (JSON)
            </Button>
          </div>
          <div className="text-sm text-slate-600">
            <p>Importiert eine zuvor exportierte Datei. Der aktuelle Stand wird dabei überschrieben – vorher exportieren! Stammt die Datei aus einer älteren Version, werden nur Ergebnisse, Einstellungen und Szenarien übernommen.</p>
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            <Button className="mt-3" icon={<Upload size={15} />} onClick={() => fileRef.current?.click()}>
              Datei importieren …
            </Button>
          </div>
        </div>
      </Card>

      {confirm && (
        <Modal
          title={confirm === 'reset' ? 'Welt zurücksetzen?' : 'Alle offenen Tickets schließen?'}
          onClose={() => setConfirm(null)}
          size="sm"
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirm(null)}>
                Abbrechen
              </Button>
              <Button variant="danger" onClick={confirm === 'reset' ? doReset : doClose}>
                {confirm === 'reset' ? 'Zurücksetzen' : 'Schließen'}
              </Button>
            </>
          }
        >
          {confirm === 'reset' ? (
            <p className="text-sm text-slate-700">Alle Tickets, Mails, Chats, Änderungen an AD, Clients, Servern, Inventar und Wissensdatenbank gehen verloren. Ergebnisse, Einstellungen und eigene Szenarien bleiben erhalten.</p>
          ) : (
            <p className="text-sm text-slate-700">{openTickets} offene Ticket(s) werden ohne Bewertung geschlossen, laufende Anrufe beendet. Die eingebauten Fehler bleiben in der Welt bestehen – für einen sauberen Neustart „Welt zurücksetzen“ verwenden.</p>
          )}
        </Modal>
      )}
    </div>
  )
}
