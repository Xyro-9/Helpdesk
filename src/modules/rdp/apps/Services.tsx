// Dienste (services.msc): Liste, Suche, Eigenschaften, Starten/Beenden/Anhalten, Starttyp.

import { Cog, Pause, Play, RotateCw, Search, Square } from 'lucide-react'
import { useMemo, useState } from 'react'
import { A } from '@/core/actions'
import { findService, startService, stopService, setServiceStartType } from '@/core/ops/endpoint'
import type { Endpoint, StartType, WinService } from '@/core/types'
import { cx } from '@/ui'
import { useDesk, useEp, useEpOps, useWin } from '../desk'
import { AppLoading, listCls, MenuBar, ProgressDialog, rowCls, SortTh, StatusBar, ToolBar, ToolBtn, ToolSep, useContextMenu, ContextMenu, WBtn, WDialog, WInput, WSelect, WTabs } from '../ui'
import { delay, type AppProps } from './types'

const PAUSABLE = ['LanmanServer', 'LanmanWorkstation', 'Netlogon', 'Winmgmt', 'WinRM']
const START_TYPES: StartType[] = ['Automatisch (Verzögerter Start)', 'Automatisch', 'Manuell', 'Deaktiviert']

export function ServicesApp({ host }: AppProps) {
  const ep = useEp(host)
  if (!ep) return <AppLoading />
  return <Services host={host} ep={ep} />
}

/** Gemeinsame Dienst-Aktionen (auch vom Task-Manager genutzt) */
export function useServiceActions(host: string, ep: Endpoint) {
  const ops = useEpOps(host)
  const desk = useDesk()
  const [busy, setBusy] = useState<string | null>(null)

  const start = async (name: string) => {
    const s = findService(ep.services, name)
    if (!s) return
    setBusy(`Windows versucht, den folgenden Dienst auf "Lokaler Computer" zu starten …\n\n${s.displayName}`)
    await delay(650)
    setBusy(null)
    ops.run((e) => startService(e, s.name), { type: A.serviceChanged, detail: `${s.name} gestartet` }, { errorTitle: 'Dienste', errorPrefix: `Der Dienst "${s.displayName}" auf "Lokaler Computer" konnte nicht gestartet werden.` })
  }
  const stop = async (name: string) => {
    const s = findService(ep.services, name)
    if (!s) return
    const dependents = ep.services.filter((o) => o.dependsOn?.some((d) => d.toLowerCase() === s.name.toLowerCase()) && o.status !== 'Beendet')
    if (dependents.length) {
      const ok = await desk.confirm(`Wenn "${s.displayName}" beendet wird, werden auch diese Dienste beendet:\n\n${dependents.map((d) => d.displayName).join('\n')}\n\nMöchten Sie diese Dienste beenden?`, { title: 'Andere Dienste beenden', icon: 'question', ok: 'Ja', cancel: 'Nein' })
      if (!ok) return
    }
    setBusy(`Windows versucht, den folgenden Dienst auf "Lokaler Computer" zu beenden …\n\n${s.displayName}`)
    await delay(500)
    setBusy(null)
    ops.run((e) => stopService(e, s.name), { type: A.serviceChanged, detail: `${s.name} beendet` }, { errorTitle: 'Dienste' })
  }
  const restart = async (name: string) => {
    await stop(name)
    await start(name)
  }
  const pause = (name: string) =>
    ops.mutate(
      (e) => {
        const s = findService(e.services, name)
        if (s && s.status === 'Wird ausgeführt') s.status = 'Angehalten'
      },
      { type: A.serviceChanged, detail: `${name} angehalten` },
    )
  const resume = (name: string) =>
    ops.mutate(
      (e) => {
        const s = findService(e.services, name)
        if (s && s.status === 'Angehalten') s.status = 'Wird ausgeführt'
      },
      { type: A.serviceChanged, detail: `${name} fortgesetzt` },
    )
  const setStartType = (name: string, t: StartType) => ops.run((e) => setServiceStartType(e, name, t), { type: A.serviceChanged, detail: `${name} Starttyp: ${t}` }, { errorTitle: 'Dienste' })
  return { busy, start, stop, restart, pause, resume, setStartType }
}

function Services({ host, ep }: { host: string; ep: Endpoint }) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<string>()
  const [sort, setSort] = useState<{ k: string; dir: 1 | -1 }>({ k: 'displayName', dir: 1 })
  const [propsOf, setPropsOf] = useState<string | null>(null)
  const act = useServiceActions(host, ep)
  const ctx = useContextMenu<string>()
  const win = useWin()

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const f = ep.services.filter((s) => !needle || s.displayName.toLowerCase().includes(needle) || s.name.toLowerCase().includes(needle) || s.description.toLowerCase().includes(needle))
    const key = sort.k as keyof WinService
    return [...f].sort((a, b) => String(a[key] ?? '').localeCompare(String(b[key] ?? ''), 'de') * sort.dir)
  }, [ep.services, q, sort])
  const s = sel ? findService(ep.services, sel) : undefined

  const canStart = (x?: WinService) => !!x && x.status === 'Beendet' && x.startType !== 'Deaktiviert'
  const canStop = (x?: WinService) => !!x && x.status !== 'Beendet'
  const canPause = (x?: WinService) => !!x && x.status === 'Wird ausgeführt' && PAUSABLE.includes(x.name)
  const canResume = (x?: WinService) => !!x && x.status === 'Angehalten'

  return (
    <div className="flex h-full flex-col text-[12px]">
      <MenuBar
        menus={[
          { label: 'Datei', items: [{ label: 'Beenden', onClick: () => win.close() }] },
          {
            label: 'Aktion',
            items: [
              { label: 'Starten', disabled: !canStart(s), onClick: () => s && void act.start(s.name) },
              { label: 'Beenden', disabled: !canStop(s), onClick: () => s && void act.stop(s.name) },
              { label: 'Anhalten', disabled: !canPause(s), onClick: () => s && act.pause(s.name) },
              { label: 'Fortsetzen', disabled: !canResume(s), onClick: () => s && act.resume(s.name) },
              { label: 'Neu starten', disabled: !canStop(s), onClick: () => s && void act.restart(s.name) },
              { sep: true },
              { label: 'Eigenschaften', disabled: !s, onClick: () => s && setPropsOf(s.name) },
            ],
          },
          { label: 'Ansicht', items: [{ label: 'Erweitert', checked: true }] },
        ]}
      />
      <ToolBar>
        <ToolBtn icon={<Play size={14} className="text-emerald-600" />} title="Dienst starten" disabled={!canStart(s) && !canResume(s)} onClick={() => s && (canResume(s) ? act.resume(s.name) : void act.start(s.name))} />
        <ToolBtn icon={<Square size={12} className="fill-slate-700 text-slate-700" />} title="Dienst beenden" disabled={!canStop(s)} onClick={() => s && void act.stop(s.name)} />
        <ToolBtn icon={<Pause size={14} />} title="Dienst anhalten" disabled={!canPause(s)} onClick={() => s && act.pause(s.name)} />
        <ToolBtn icon={<RotateCw size={14} />} title="Dienst neu starten" disabled={!canStop(s)} onClick={() => s && void act.restart(s.name)} />
        <ToolSep />
        <div className="relative ml-auto w-56">
          <Search size={13} className="absolute top-1.5 left-2 text-slate-400" />
          <WInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Dienste durchsuchen" className="pl-7" />
        </div>
      </ToolBar>
      <div className="flex min-h-0 flex-1">
        <div className="w-44 shrink-0 border-r border-[#e5e5e5] bg-white p-2">
          <div className="flex items-center gap-1.5 rounded bg-[#cce4f7] px-1.5 py-1">
            <Cog size={14} className="text-slate-600" /> Dienste (Lokal)
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1">
            <div className="hidden w-52 shrink-0 overflow-auto border-r border-[#eee] p-3 lg:block">
              {s ? (
                <>
                  <div className="mb-2 text-[14px] font-semibold text-slate-900">{s.displayName}</div>
                  <div className="mb-3 space-y-1">
                    {canStart(s) && <LinkBtn onClick={() => void act.start(s.name)}>Den Dienst starten</LinkBtn>}
                    {canStop(s) && <LinkBtn onClick={() => void act.stop(s.name)}>Den Dienst beenden</LinkBtn>}
                    {canPause(s) && <LinkBtn onClick={() => act.pause(s.name)}>Den Dienst anhalten</LinkBtn>}
                    {canResume(s) && <LinkBtn onClick={() => act.resume(s.name)}>Den Dienst fortsetzen</LinkBtn>}
                    {canStop(s) && <LinkBtn onClick={() => void act.restart(s.name)}>Den Dienst neu starten</LinkBtn>}
                  </div>
                  <div className="text-slate-500">Beschreibung:</div>
                  <div className="text-slate-800">{s.description}</div>
                </>
              ) : (
                <div className="text-slate-500">Wählen Sie ein Element aus, um die Beschreibung anzuzeigen.</div>
              )}
            </div>
            <div className="min-w-0 flex-1 overflow-auto">
              <table className={listCls}>
                <thead>
                  <tr>
                    <SortTh label="Name" k="displayName" sort={sort} setSort={setSort} className="w-[30%]" />
                    <SortTh label="Beschreibung" k="description" sort={sort} setSort={setSort} />
                    <SortTh label="Status" k="status" sort={sort} setSort={setSort} />
                    <SortTh label="Starttyp" k="startType" sort={sort} setSort={setSort} />
                    <SortTh label="Anmelden als" k="account" sort={sort} setSort={setSort} />
                  </tr>
                </thead>
                <tbody>
                  {list.map((x) => (
                    <tr
                      key={x.name}
                      className={rowCls(sel === x.name)}
                      onClick={() => setSel(x.name)}
                      onDoubleClick={() => setPropsOf(x.name)}
                      onContextMenu={(e) => {
                        setSel(x.name)
                        ctx.open(e, x.name)
                      }}
                    >
                      <td className="max-w-[260px]">
                        <span className="inline-flex items-center gap-1.5">
                          <Cog size={13} className="shrink-0 text-slate-500" />
                          {x.displayName}
                        </span>
                      </td>
                      <td className="max-w-[260px] text-slate-600">{x.description}</td>
                      <td className={cx(x.status === 'Angehalten' && 'text-amber-700')}>{x.status === 'Beendet' ? '' : x.status}</td>
                      <td className={cx(x.startType === 'Deaktiviert' && 'text-slate-500')}>{x.startType}</td>
                      <td>{x.account}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <StatusBar>
            {list.length} Dienste{q && ` (gefiltert)`}
          </StatusBar>
        </div>
      </div>
      {ctx.menu &&
        (() => {
          const x = findService(ep.services, ctx.menu.data)
          return (
            <ContextMenu
              x={ctx.menu.x}
              y={ctx.menu.y}
              onClose={ctx.close}
              items={[
                { label: 'Starten', disabled: !canStart(x), onClick: () => x && void act.start(x.name) },
                { label: 'Beenden', disabled: !canStop(x), onClick: () => x && void act.stop(x.name) },
                { label: 'Anhalten', disabled: !canPause(x), onClick: () => x && act.pause(x.name) },
                { label: 'Fortsetzen', disabled: !canResume(x), onClick: () => x && act.resume(x.name) },
                { label: 'Neu starten', disabled: !canStop(x), onClick: () => x && void act.restart(x.name) },
                { sep: true },
                { label: 'Eigenschaften', bold: true, onClick: () => x && setPropsOf(x.name) },
              ]}
            />
          )
        })()}
      {propsOf && <ServiceProps ep={ep} name={propsOf} act={act} onClose={() => setPropsOf(null)} />}
      {act.busy && <ProgressDialog title="Dienststeuerung" text={act.busy} />}
    </div>
  )
}

function LinkBtn({ children, onClick }: { children: string; onClick: () => void }) {
  return (
    <button type="button" className="block text-left text-[#005fb8] hover:underline" onClick={onClick}>
      {children}
    </button>
  )
}

function ServiceProps({ ep, name, act, onClose }: { ep: Endpoint; name: string; act: ReturnType<typeof useServiceActions>; onClose: () => void }) {
  const s = findService(ep.services, name)
  const [tab, setTab] = useState<'general' | 'logon' | 'deps'>('general')
  const [startType, setStartType] = useState<StartType>(s?.startType ?? 'Manuell')
  if (!s) return null
  const dirty = startType !== s.startType
  const dependents = ep.services.filter((o) => o.dependsOn?.some((d) => d.toLowerCase() === s.name.toLowerCase()))
  const apply = () => {
    if (dirty) act.setStartType(s.name, startType)
  }
  const exe = s.name === 'Spooler' ? 'C:\\Windows\\System32\\spoolsv.exe' : s.name === 'SecureLinkVPN' ? '"C:\\Program Files\\SecureLink\\slvpnsvc.exe"' : s.name === 'MWInventory' ? '"C:\\Program Files\\Musterwerk\\Inventory\\mwinv.exe"' : `C:\\Windows\\system32\\svchost.exe -k ${s.account === 'Lokales System' ? 'netsvcs' : 'LocalServiceNetworkRestricted'} -p`
  return (
    <WDialog
      title={`Eigenschaften von ${s.displayName} (Lokaler Computer)`}
      onClose={onClose}
      width={440}
      footer={
        <>
          <WBtn
            primary
            onClick={() => {
              apply()
              onClose()
            }}
          >
            OK
          </WBtn>
          <WBtn onClick={onClose}>Abbrechen</WBtn>
          <WBtn disabled={!dirty} onClick={apply}>
            Übernehmen
          </WBtn>
        </>
      }
    >
      <WTabs
        tabs={[
          { id: 'general', label: 'Allgemein' },
          { id: 'logon', label: 'Anmelden' },
          { id: 'deps', label: 'Abhängigkeiten' },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div className="pt-3">
        {tab === 'general' && (
          <div className="space-y-2.5">
            <Row label="Dienstname:">{s.name}</Row>
            <Row label="Anzeigename:">
              <WInput value={s.displayName} readOnly />
            </Row>
            <Row label="Beschreibung:">
              <div className="h-14 overflow-auto rounded-[4px] border border-[#d0d0d0] bg-[#fafafa] p-1.5">{s.description}</div>
            </Row>
            <div>
              <div className="mb-1 text-slate-600">Pfad zur EXE-Datei:</div>
              <WInput value={exe} readOnly className="bg-[#f6f6f6]" />
            </div>
            <Row label="Starttyp:">
              <WSelect value={startType} onChange={(e) => setStartType(e.target.value as StartType)}>
                {START_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </WSelect>
            </Row>
            <hr className="border-[#e5e5e5]" />
            <Row label="Dienststatus:">
              <span className={cx(s.status === 'Wird ausgeführt' ? 'text-emerald-700' : s.status === 'Angehalten' ? 'text-amber-700' : 'text-slate-700')}>{s.status}</span>
            </Row>
            <div className="flex flex-wrap gap-1.5">
              <WBtn disabled={!(s.status === 'Beendet' && s.startType !== 'Deaktiviert')} onClick={() => void act.start(s.name)}>
                Starten
              </WBtn>
              <WBtn disabled={s.status === 'Beendet'} onClick={() => void act.stop(s.name)}>
                Beenden
              </WBtn>
              <WBtn disabled={!(s.status === 'Wird ausgeführt' && PAUSABLE.includes(s.name))} onClick={() => act.pause(s.name)}>
                Anhalten
              </WBtn>
              <WBtn disabled={s.status !== 'Angehalten'} onClick={() => act.resume(s.name)}>
                Fortsetzen
              </WBtn>
            </div>
            {s.startType === 'Deaktiviert' && <p className="text-[11px] text-slate-500">Hinweis: Ein deaktivierter Dienst kann erst gestartet werden, nachdem ein anderer Starttyp übernommen wurde.</p>}
            <div className="text-slate-600">
              Startparameter:
              <WInput disabled className="mt-1" />
            </div>
          </div>
        )}
        {tab === 'logon' && (
          <div className="space-y-2">
            <div>Anmelden als:</div>
            <label className="flex items-center gap-2">
              <input type="radio" checked={s.account === 'Lokales System'} readOnly className="accent-[#005fb8]" /> Lokales Systemkonto
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={s.account !== 'Lokales System'} readOnly className="accent-[#005fb8]" /> Dieses Konto:
              <WInput value={s.account === 'Lokales System' ? '' : `NT-AUTORITÄT\\${s.account}`} readOnly className="w-56" />
            </label>
          </div>
        )}
        {tab === 'deps' && (
          <div className="space-y-3">
            <p className="text-slate-600">Einige Dienste hängen von anderen Diensten, Systemtreibern oder Ladereihenfolgegruppen ab.</p>
            <div>
              <div className="mb-1">Dieser Dienst ist von folgenden Systemkomponenten abhängig:</div>
              <div className="min-h-12 rounded-[4px] border border-[#d0d0d0] p-1.5">
                {(s.dependsOn ?? []).length ? (
                  (s.dependsOn ?? []).map((d) => {
                    const ds = findService(ep.services, d)
                    return (
                      <div key={d} className="flex items-center gap-1.5">
                        <Cog size={12} className="text-slate-500" />
                        {ds?.displayName ?? d} <span className="text-slate-400">({ds?.status ?? 'unbekannt'})</span>
                      </div>
                    )
                  })
                ) : (
                  <span className="text-slate-400">&lt;Keine Abhängigkeiten&gt;</span>
                )}
              </div>
            </div>
            <div>
              <div className="mb-1">Folgende Systemkomponenten sind von diesem Dienst abhängig:</div>
              <div className="min-h-12 rounded-[4px] border border-[#d0d0d0] p-1.5">
                {dependents.length ? (
                  dependents.map((d) => (
                    <div key={d.name} className="flex items-center gap-1.5">
                      <Cog size={12} className="text-slate-500" />
                      {d.displayName}
                    </div>
                  ))
                ) : (
                  <span className="text-slate-400">&lt;Keine Abhängigkeiten&gt;</span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </WDialog>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-28 shrink-0 pt-1 text-slate-600">{label}</span>
      <div className="min-w-0 flex-1 pt-0.5">{children}</div>
    </div>
  )
}
