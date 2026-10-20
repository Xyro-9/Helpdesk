// Ereignisanzeige: Windows-Protokolle, Liste, Detailbereich, Filter, Aktualisieren.

import { BookOpen, ChevronDown, CircleX, Filter, FolderOpen, Info, RefreshCw, ScrollText, ShieldCheck, ShieldX, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { Endpoint, EventLevel, EventLogName, WinEvent } from '@/core/types'
import { cx } from '@/ui'
import { useEp } from '../desk'
import { AppLoading, fmtDT, listCls, MenuBar, rowCls, SortTh, WBtn, WCheck, WDialog, WInput, WSelect } from '../ui'
import type { AppProps } from './types'

type LogView = EventLogName | 'Administrative Ereignisse'

const LOGS: EventLogName[] = ['Anwendung', 'Sicherheit', 'Setup', 'System', 'Weitergeleitete Ereignisse']
const LEVELS: EventLevel[] = ['Kritisch', 'Fehler', 'Warnung', 'Informationen', 'Überprüfung erfolgreich', 'Überprüfung fehlgeschlagen']

interface EvFilter {
  levels: EventLevel[]
  ids: string
  source: string
}
const EMPTY: EvFilter = { levels: [], ids: '', source: '' }

export function LevelIcon({ level, size = 14 }: { level: EventLevel; size?: number }) {
  switch (level) {
    case 'Kritisch':
    case 'Fehler':
      return <CircleX size={size} className="shrink-0 fill-rose-600 text-white" />
    case 'Warnung':
      return <TriangleAlert size={size} className="shrink-0 fill-amber-400 text-slate-800" />
    case 'Überprüfung erfolgreich':
      return <ShieldCheck size={size} className="shrink-0 text-amber-600" />
    case 'Überprüfung fehlgeschlagen':
      return <ShieldX size={size} className="shrink-0 text-rose-600" />
    default:
      return <Info size={size} className="shrink-0 fill-[#005fb8] text-white" />
  }
}

function idMatcher(spec: string): ((id: number) => boolean) | null {
  const parts = spec
    .split(/[,;\s]+/)
    .map((p) => p.trim())
    .filter(Boolean)
  if (!parts.length) return null
  const incl: ((id: number) => boolean)[] = []
  const excl: ((id: number) => boolean)[] = []
  for (const p of parts) {
    const neg = p.startsWith('-')
    const body = neg ? p.slice(1) : p
    const m = body.match(/^(\d+)(?:-(\d+))?$/)
    if (!m) continue
    const a = +m[1]
    const b = m[2] ? +m[2] : a
    ;(neg ? excl : incl).push((id) => id >= a && id <= b)
  }
  return (id) => (incl.length === 0 || incl.some((f) => f(id))) && !excl.some((f) => f(id))
}

export function EventViewerApp({ host }: AppProps) {
  const ep = useEp(host)
  if (!ep) return <AppLoading />
  return <EventViewer ep={ep} />
}

function EventViewer({ ep }: { ep: Endpoint }) {
  const [log, setLog] = useState<LogView>('System')
  const [refreshedAt, setRefreshedAt] = useState(() => Date.now())
  const [filters, setFilters] = useState<Partial<Record<LogView, EvFilter>>>({})
  const [sel, setSel] = useState<string>()
  const [showFilter, setShowFilter] = useState(false)
  const [sort, setSort] = useState<{ k: string; dir: 1 | -1 }>({ k: 'time', dir: -1 })
  const [winOpen, setWinOpen] = useState(true)
  const filter = filters[log] ?? EMPTY

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const e of ep.events) if (new Date(e.time).getTime() <= refreshedAt) c[e.log] = (c[e.log] ?? 0) + 1
    return c
  }, [ep.events, refreshedAt])

  const list = useMemo(() => {
    const idm = idMatcher(filter.ids)
    const base = ep.events.filter((e) => {
      if (new Date(e.time).getTime() > refreshedAt) return false
      if (log === 'Administrative Ereignisse') {
        if (!['Kritisch', 'Fehler', 'Warnung'].includes(e.level)) return false
      } else if (e.log !== log) return false
      if (filter.levels.length && !filter.levels.includes(e.level)) return false
      if (idm && !idm(e.eventId)) return false
      if (filter.source && e.source !== filter.source) return false
      return true
    })
    const k = sort.k as keyof WinEvent
    return [...base].sort((a, b) => {
      const va = a[k] ?? ''
      const vb = b[k] ?? ''
      return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'de')) * sort.dir
    })
  }, [ep.events, log, filter, refreshedAt, sort])

  const sources = useMemo(() => [...new Set(ep.events.filter((e) => log === 'Administrative Ereignisse' || e.log === log).map((e) => e.source))].sort(), [ep.events, log])
  const selected = list.find((e) => e.id === sel)
  const filtered = filter !== EMPTY && (filter.levels.length > 0 || !!filter.ids.trim() || !!filter.source)
  const total = log === 'Administrative Ereignisse' ? list.length : (counts[log] ?? 0)

  const refresh = () => setRefreshedAt(Date.now())

  return (
    <div className="flex h-full flex-col text-[12px]">
      <MenuBar
        menus={[
          { label: 'Datei', items: [{ label: 'Beenden', disabled: true }] },
          {
            label: 'Aktion',
            items: [
              { label: 'Aktuelles Protokoll filtern…', onClick: () => setShowFilter(true) },
              { label: 'Filter löschen', disabled: !filtered, onClick: () => setFilters({ ...filters, [log]: EMPTY }) },
              { sep: true },
              { label: 'Aktualisieren', shortcut: 'F5', onClick: refresh },
            ],
          },
          { label: 'Ansicht', items: [{ label: 'Vorschaubereich', checked: true }] },
        ]}
      />
      <div className="flex min-h-0 flex-1">
        {/* Navigationsbaum */}
        <div className="w-52 shrink-0 overflow-auto border-r border-[#e5e5e5] bg-white p-1.5">
          <div className="flex items-center gap-1.5 px-1 py-0.5">
            <BookOpen size={13} className="text-slate-600" /> Ereignisanzeige (Lokal)
          </div>
          <div className="pl-3">
            <div className="flex items-center gap-1 px-1 py-0.5">
              <ChevronDown size={11} /> <FolderOpen size={13} className="text-amber-500" /> Benutzerdefinierte Ansichten
            </div>
            <NavItem active={log === 'Administrative Ereignisse'} onClick={() => setLog('Administrative Ereignisse')} indent>
              Administrative Ereignisse
            </NavItem>
            <button type="button" className="flex items-center gap-1 px-1 py-0.5" onClick={() => setWinOpen(!winOpen)}>
              <ChevronDown size={11} className={cx(!winOpen && '-rotate-90')} /> <FolderOpen size={13} className="text-amber-500" /> Windows-Protokolle
            </button>
            {winOpen &&
              LOGS.map((l) => (
                <NavItem key={l} active={log === l} onClick={() => setLog(l)} indent>
                  {l}
                </NavItem>
              ))}
            <div className="flex items-center gap-1 px-1 py-0.5 text-slate-500">
              <ChevronDown size={11} className="-rotate-90" /> <FolderOpen size={13} className="text-amber-500" /> Anwendungs- und Dienstprotokolle
            </div>
          </div>
        </div>
        {/* Liste + Details */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b border-[#e5e5e5] bg-[#f7f7f7] px-2 py-1">
            <span className="font-semibold">{log}</span>
            <span className="text-slate-500">Anzahl von Ereignissen: {total.toLocaleString('de-DE')}</span>
            {filtered && <span className="rounded bg-amber-100 px-1.5 text-amber-800">Gefiltert: {list.length} Ereignisse</span>}
          </div>
          <div className="min-h-0 flex-[3] overflow-auto">
            <table className={listCls}>
              <thead>
                <tr>
                  <SortTh label="Ebene" k="level" sort={sort} setSort={setSort} />
                  <SortTh label="Datum und Uhrzeit" k="time" sort={sort} setSort={setSort} />
                  <SortTh label="Quelle" k="source" sort={sort} setSort={setSort} />
                  <SortTh label="Ereignis-ID" k="eventId" sort={sort} setSort={setSort} />
                  <SortTh label="Aufgabenkategorie" k="task" sort={sort} setSort={setSort} />
                </tr>
              </thead>
              <tbody>
                {list.map((e) => (
                  <tr key={e.id} className={rowCls(sel === e.id)} onClick={() => setSel(e.id)}>
                    <td>
                      <span className="inline-flex items-center gap-1.5">
                        <LevelIcon level={e.level} />
                        {e.level}
                      </span>
                    </td>
                    <td>{fmtDT(e.time)}</td>
                    <td className="max-w-[220px]">{e.source}</td>
                    <td>{e.eventId}</td>
                    <td>{e.task ?? 'Keine'}</td>
                  </tr>
                ))}
                {!list.length && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-400">
                      Keine Ereignisse vorhanden.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex min-h-0 flex-[2] flex-col border-t-4 border-[#e9e9e9]">
            {selected ? (
              <>
                <div className="border-b border-[#e5e5e5] bg-[#f7f7f7] px-2 py-1 font-semibold">
                  Ereignis {selected.eventId}, {selected.source}
                </div>
                <div className="min-h-0 flex-1 overflow-auto p-2">
                  <div className="mb-2 min-h-[48px] rounded-[4px] border border-[#d6d6d6] bg-white p-2 whitespace-pre-wrap select-text">{selected.message}</div>
                  <div className="grid grid-cols-[110px_1fr_110px_1fr] gap-x-3 gap-y-0.5">
                    <span className="text-slate-500">Protokollname:</span>
                    <span>{selected.log}</span>
                    <span className="text-slate-500">Quelle:</span>
                    <span className="truncate">{selected.source}</span>
                    <span className="text-slate-500">Ereignis-ID:</span>
                    <span>{selected.eventId}</span>
                    <span className="text-slate-500">Protokolliert:</span>
                    <span>{fmtDT(selected.time)}</span>
                    <span className="text-slate-500">Ebene:</span>
                    <span>{selected.level}</span>
                    <span className="text-slate-500">Aufgabenkategorie:</span>
                    <span>{selected.task ?? 'Keine'}</span>
                    <span className="text-slate-500">Benutzer:</span>
                    <span>{selected.user ? `MUSTERWERK\\${selected.user}` : 'SYSTEM'}</span>
                    <span className="text-slate-500">Computer:</span>
                    <span>{selected.computer}</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="p-3 text-slate-400">Wählen Sie ein Ereignis aus, um Details anzuzeigen.</div>
            )}
          </div>
        </div>
        {/* Aktionen */}
        <div className="hidden w-48 shrink-0 border-l border-[#e5e5e5] bg-[#fafafa] xl:block">
          <div className="border-b border-[#e5e5e5] bg-[#eef2f8] px-2 py-1 font-semibold">Aktionen</div>
          <div className="px-2 py-1 text-slate-500">{log}</div>
          <ActionLink icon={<Filter size={13} />} onClick={() => setShowFilter(true)}>
            Aktuelles Protokoll filtern…
          </ActionLink>
          <ActionLink icon={<Filter size={13} className="text-rose-500" />} onClick={() => setFilters({ ...filters, [log]: EMPTY })} disabled={!filtered}>
            Filter löschen
          </ActionLink>
          <ActionLink icon={<RefreshCw size={13} />} onClick={refresh}>
            Aktualisieren
          </ActionLink>
        </div>
      </div>
      {showFilter && (
        <FilterDialog
          log={log}
          initial={filter}
          sources={sources}
          onClose={() => setShowFilter(false)}
          onApply={(f) => {
            setFilters({ ...filters, [log]: f })
            setShowFilter(false)
          }}
        />
      )}
    </div>
  )
}

function NavItem({ children, active, onClick, indent }: { children: string; active: boolean; onClick: () => void; indent?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={cx('flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left', indent && 'pl-5', active ? 'bg-[#cce4f7]' : 'hover:bg-[#e5f1fb]')}>
      <ScrollText size={13} className="shrink-0 text-slate-500" />
      <span className="truncate">{children}</span>
    </button>
  )
}

function ActionLink({ children, icon, onClick, disabled }: { children: string; icon: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="flex w-full items-center gap-1.5 px-2 py-1 text-left hover:bg-[#e5f1fb] disabled:opacity-40">
      {icon}
      {children}
    </button>
  )
}

function FilterDialog({ log, initial, sources, onClose, onApply }: { log: LogView; initial: EvFilter; sources: string[]; onClose: () => void; onApply: (f: EvFilter) => void }) {
  const [f, setF] = useState<EvFilter>(initial)
  const levels = log === 'Sicherheit' ? LEVELS : LEVELS.filter((l) => !l.startsWith('Überprüfung'))
  return (
    <WDialog
      title={`Aktuelles Protokoll filtern – ${log}`}
      onClose={onClose}
      width={460}
      footer={
        <>
          <WBtn onClick={() => setF(EMPTY)}>Löschen</WBtn>
          <WBtn primary onClick={() => onApply(f)}>
            OK
          </WBtn>
          <WBtn onClick={onClose}>Abbrechen</WBtn>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <div className="mb-1 text-slate-600">Ereignisebene:</div>
          <div className="grid grid-cols-2 gap-1">
            {levels.map((l) => (
              <WCheck key={l} label={l} checked={f.levels.includes(l)} onChange={(v) => setF({ ...f, levels: v ? [...f.levels, l] : f.levels.filter((x) => x !== l) })} />
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1 text-slate-600">Ereignisquellen:</div>
          <WSelect value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}>
            <option value="">(Alle Quellen)</option>
            {sources.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </WSelect>
        </div>
        <div>
          <div className="mb-1 text-slate-600">Ereignis-IDs ein-/ausschließen (z.B. 1,3,5-99,-76):</div>
          <WInput value={f.ids} onChange={(e) => setF({ ...f, ids: e.target.value })} placeholder="<Alle Ereignis-IDs>" />
        </div>
      </div>
    </WDialog>
  )
}
