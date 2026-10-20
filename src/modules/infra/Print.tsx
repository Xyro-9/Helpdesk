// Druckverwaltung PRINT01: Warteschlangen, Aufträge, Geräte, Spooler

import { ExternalLink, Pause, Play, Printer, Share2, Trash2, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { A } from '@/core/actions'
import { useStore } from '@/core/store'
import type { PrintQueue, PrinterDevice } from '@/core/types'
import { fmtDateTime } from '@/core/util'
import { Badge, Button, Card, Select, Tabs, cx, tableCls } from '@/ui'
import { KNOWN_DRIVERS, cancelJob, clearQueue } from './lib'
import { Meter, ServiceButtons, ServiceStatusBadge, useRun } from './shared'

const STUCK_MSG = 'Der Auftrag hängt (Status „Fehler“) und lässt sich nicht löschen. Lösung: Dienst „Druckwarteschlange“ (Spooler) auf PRINT01 neu starten.'

export function PrintPanel() {
  const queues = useStore((s) => s.world.infra.printQueues)
  const devices = useStore((s) => s.world.infra.printers)
  const print01 = useStore((s) => s.world.infra.servers.find((x) => x.name === 'PRINT01'))
  const [tab, setTab] = useState<'queues' | 'devices'>('queues')
  const [sel, setSel] = useState(queues[0]?.name)
  const spooler = print01?.services.find((s) => s.name === 'Spooler')
  const stuck = queues.reduce((a, q) => a + q.jobs.filter((j) => j.status === 'Fehler').length, 0)
  const queue = queues.find((q) => q.name === sel)
  return (
    <div className="space-y-4">
      <div className={cx('flex flex-wrap items-center gap-3 rounded-lg border bg-white px-4 py-3 shadow-sm', spooler?.status === 'Wird ausgeführt' && print01?.online ? 'border-slate-200' : 'border-rose-300 bg-rose-50/40')}>
        <Printer size={18} className="text-sky-600" />
        <div className="text-sm">
          <div className="font-medium">Druckserver PRINT01 (10.10.0.30)</div>
          <div className="text-xs text-slate-500">Dienst „Druckwarteschlange“ (Spooler) · Server {print01?.online ? 'online' : 'offline'}</div>
        </div>
        {spooler && <ServiceStatusBadge status={spooler.status} />}
        {stuck > 0 && (
          <Badge tone="red">
            <TriangleAlert size={12} /> {stuck} hängende(r) Auftrag/Aufträge
          </Badge>
        )}
        <div className="flex-1" />
        {spooler && print01 && <ServiceButtons server="PRINT01" svc={spooler} disabled={!print01.online} />}
      </div>
      <Tabs
        tabs={[
          { id: 'queues', label: `Drucker-Warteschlangen (${queues.length})` },
          { id: 'devices', label: `Geräte (${devices.length})` },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'queues' && (
        <>
          <div className="overflow-auto rounded-md border border-slate-200 bg-white">
            <table className={tableCls}>
              <thead>
                <tr>
                  <th>Druckername</th>
                  <th>Status</th>
                  <th>Aufträge</th>
                  <th>Treiber</th>
                  <th>Standort</th>
                  <th>Gerät</th>
                  <th>Freigegeben</th>
                  <th>GPO</th>
                </tr>
              </thead>
              <tbody>
                {queues.map((q) => {
                  const dev = devices.find((d) => d.id === q.deviceId)
                  const err = q.jobs.some((j) => j.status === 'Fehler')
                  return (
                    <tr key={q.name} className={cx('cursor-pointer', sel === q.name ? 'bg-sky-100' : 'hover:bg-slate-50')} onClick={() => setSel(q.name)}>
                      <td className="font-medium">{q.name}</td>
                      <td>
                        <Badge tone={q.status === 'Bereit' && !err ? 'green' : q.status === 'Angehalten' ? 'amber' : 'red'}>{err && q.status === 'Bereit' ? 'Fehler – Auftrag hängt' : q.status}</Badge>
                      </td>
                      <td>{q.jobs.length}</td>
                      <td className="text-xs">{q.driver}</td>
                      <td className="text-xs text-slate-500">{q.location}</td>
                      <td className="text-xs">
                        {dev ? (
                          <span>
                            {dev.id} <span className={cx(dev.status === 'Bereit' || dev.status === 'Energiesparmodus' ? 'text-slate-400' : 'text-rose-600')}>({dev.status})</span>
                          </span>
                        ) : (
                          '–'
                        )}
                      </td>
                      <td>{q.shared ? <Badge tone="green">Ja</Badge> : <Badge>Nein</Badge>}</td>
                      <td className="text-xs text-slate-500">{q.deployedTo ?? '–'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {queue && <QueueDetail key={queue.name} queue={queue} />}
        </>
      )}
      {tab === 'devices' && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {devices.map((d) => (
            <DeviceCard key={d.id} dev={d} />
          ))}
        </div>
      )}
    </div>
  )
}

function QueueDetail({ queue }: { queue: PrintQueue }) {
  const run = useRun()
  const toast = useStore((s) => s.toast)
  const mutate = (fn: (q: PrintQueue) => string | null | void, detail: string, success?: string) =>
    run(
      (w) => {
        const q = w.infra.printQueues.find((x) => x.name === queue.name)
        if (!q) return 'Warteschlange nicht gefunden.'
        return fn(q) ?? null
      },
      { type: A.printQueueChanged, target: queue.name, detail },
      success,
    )
  const cancel = (id: number, doc: string) => {
    const box = { r: '' }
    const ok = mutate(
      (q) => {
        const r = cancelJob(q, id)
        box.r = r
        if (r === 'notfound') return 'Auftrag nicht gefunden.'
        if (r === 'stuck') return STUCK_MSG
      },
      `Auftrag ${id} (${doc}) gelöscht`,
    )
    if (ok) toast(`Auftrag „${doc}“ wurde abgebrochen.`, 'success')
  }
  return (
    <Card
      title={`Warteschlange \\\\PRINT01\\${queue.name}`}
      actions={
        <>
          {queue.status === 'Angehalten' ? (
            <Button size="sm" icon={<Play size={13} />} onClick={() => mutate((q) => void (q.status = 'Bereit'), 'Drucken fortgesetzt', 'Warteschlange fortgesetzt.')}>
              Fortsetzen
            </Button>
          ) : (
            <Button size="sm" icon={<Pause size={13} />} onClick={() => mutate((q) => void (q.status = 'Angehalten'), 'Drucken angehalten', 'Warteschlange angehalten.')}>
              Anhalten
            </Button>
          )}
          <Button size="sm" icon={<Share2 size={13} />} onClick={() => mutate((q) => void (q.shared = !q.shared), queue.shared ? 'Freigabe deaktiviert' : 'Freigabe aktiviert', queue.shared ? 'Drucker wird nicht mehr freigegeben.' : 'Drucker ist freigegeben.')}>
            {queue.shared ? 'Freigabe aufheben' : 'Freigeben'}
          </Button>
          <Button
            size="sm"
            icon={<Trash2 size={13} />}
            disabled={!queue.jobs.length}
            onClick={() => {
              const box = { removed: 0, stuck: 0 }
              const ok = mutate(
                (q) => {
                  const r = clearQueue(q)
                  box.removed = r.removed
                  box.stuck = r.stuck
                },
                `Alle Aufträge gelöscht (${queue.jobs.length})`,
              )
              if (ok) toast(`${box.removed} Auftrag/Aufträge gelöscht.${box.stuck ? ' ' + STUCK_MSG : ''}`, box.stuck ? 'warning' : 'success')
            }}
          >
            Alle Aufträge löschen
          </Button>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-500">Treiber:</span>
        <Select
          className="h-8 w-64"
          value={queue.driver}
          onChange={(e) => {
            const d = e.target.value
            mutate((q) => void (q.driver = d), `Treiber: ${queue.driver} → ${d}`, `Treiber auf „${d}“ geändert.`)
          }}
        >
          {Array.from(new Set([queue.driver, ...KNOWN_DRIVERS])).map((d) => (
            <option key={d}>{d}</option>
          ))}
        </Select>
        <span className="text-xs text-slate-500">Standort: {queue.location}</span>
      </div>
      <table className={tableCls}>
        <thead>
          <tr>
            <th>Dokumentname</th>
            <th>Status</th>
            <th>Besitzer</th>
            <th>Seiten</th>
            <th>Größe</th>
            <th>Übermittelt</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {queue.jobs.map((j) => (
            <tr key={j.id} className={cx(j.status === 'Fehler' && 'bg-rose-50')}>
              <td>{j.document}</td>
              <td>
                <Badge tone={j.status === 'Fehler' ? 'red' : j.status === 'Wird gedruckt' ? 'sky' : j.status === 'Angehalten' ? 'amber' : 'gray'}>{j.status}</Badge>
              </td>
              <td className="text-xs">{j.owner}</td>
              <td>{j.pages}</td>
              <td className="text-xs">{j.sizeKb} KB</td>
              <td className="text-xs">{fmtDateTime(j.submitted)}</td>
              <td className="text-right">
                <Button size="sm" variant="ghost" icon={<Trash2 size={12} />} onClick={() => cancel(j.id, j.document)}>
                  Abbrechen
                </Button>
              </td>
            </tr>
          ))}
          {!queue.jobs.length && (
            <tr>
              <td colSpan={7} className="py-5 text-center text-slate-400">
                Keine Druckaufträge.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Card>
  )
}

function DeviceCard({ dev }: { dev: PrinterDevice }) {
  const openBrowser = useStore((s) => s.openBrowser)
  const ok = dev.status === 'Bereit' || dev.status === 'Energiesparmodus'
  const toner: [string, number | undefined, string][] = [
    ['Schwarz', dev.toner.black, 'slate'],
    ['Cyan', dev.toner.cyan, 'sky'],
    ['Magenta', dev.toner.magenta, 'red'],
    ['Gelb', dev.toner.yellow, 'amber'],
  ]
  return (
    <div className={cx('space-y-3 rounded-lg border bg-white p-4 shadow-sm', ok ? 'border-slate-200' : 'border-rose-300')}>
      <div className="flex items-start gap-2">
        <Printer size={18} className={ok ? 'text-slate-600' : 'text-rose-600'} />
        <div className="min-w-0 flex-1">
          <div className="font-medium">{dev.name}</div>
          <div className="text-xs text-slate-500">
            {dev.model} · {dev.location}
          </div>
        </div>
        <Badge tone={ok ? 'green' : 'red'}>{dev.status}</Badge>
      </div>
      {dev.statusDetail && <div className="text-xs text-rose-700">{dev.statusDetail}</div>}
      <dl className="grid grid-cols-[6rem_1fr] gap-y-0.5 text-xs">
        <dt className="text-slate-500">IP-Adresse</dt>
        <dd className="font-mono">{dev.ip}</dd>
        <dt className="text-slate-500">Hostname</dt>
        <dd className="font-mono">{dev.hostname}</dd>
        <dt className="text-slate-500">MAC</dt>
        <dd className="font-mono">{dev.mac}</dd>
        <dt className="text-slate-500">Seitenzähler</dt>
        <dd>{dev.pageCount.toLocaleString('de-DE')}</dd>
      </dl>
      <div className="space-y-1">
        {toner
          .filter(([, v]) => v !== undefined)
          .map(([label, v, tone]) => (
            <div key={label} className="flex items-center gap-2 text-xs">
              <span className="w-16 text-slate-500">{label}</span>
              <Meter pct={v!} tone={v! <= 10 ? 'red' : (tone as 'slate' | 'sky' | 'red' | 'amber')} />
              <span className="w-9 text-right">{v} %</span>
            </div>
          ))}
      </div>
      <div className="space-y-1">
        {dev.trays.map((t) => (
          <div key={t.name} className="flex items-center gap-2 text-xs">
            <span className="w-16 text-slate-500">{t.name}</span>
            <Meter pct={t.levelPct} tone={t.levelPct === 0 ? 'red' : 'green'} />
            <span className="w-16 text-right">
              {t.size} {t.levelPct} %
            </span>
          </div>
        ))}
      </div>
      <Button size="sm" icon={<ExternalLink size={13} />} onClick={() => openBrowser(`http://${dev.ip}`)}>
        Weboberfläche öffnen
      </Button>
    </div>
  )
}
