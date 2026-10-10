// Drucker & Scanner: Liste mit effektivem Status, Standard, Hinzufügen (\\PRINT01\…), Entfernen,
// Testseite, Druckwarteschlange.

import { Printer, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { A } from '@/core/actions'
import { connectPrinter, printDocument, printerEffectiveStatus, printServerOk, removePrinter, setDefaultPrinter } from '@/core/ops/endpoint'
import { useStore } from '@/core/store'
import type { Endpoint, LocalPrinter } from '@/core/types'
import { cx } from '@/ui'
import { useDesk, useEp, useEpOps, useWin } from '../desk'
import { AppLoading, fmtDTShort, listCls, MenuBar, rowCls, StatusBar, WBtn, WCheck, WDialog, WInput } from '../ui'
import type { AppProps } from './types'

export function PrintersApp({ host }: AppProps) {
  const ep = useEp(host)
  if (!ep) return <AppLoading />
  return (
    <div className="h-full overflow-auto bg-[#f3f3f3] p-5 text-[12px]">
      <h2 className="mb-4 text-[22px] font-semibold">Bluetooth und Geräte › Drucker und Scanner</h2>
      <PrintersPanel host={host} ep={ep} />
    </div>
  )
}

const shortName = (p: LocalPrinter) => (p.serverQueue ? `${p.serverQueue} auf PRINT01` : p.name)

export function PrintersPanel({ host, ep }: { host: string; ep: Endpoint }) {
  const desk = useDesk()
  const ops = useEpOps(host)
  const world = useStore((s) => s.world)
  const [sel, setSel] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const test = (p: LocalPrinter) => {
    let res = { ok: false, message: '' }
    ops.mutate((e, w) => {
      res = printDocument(w, e, p.name, 'Testseite')
    }, { type: A.printerChanged, detail: `Testseite ${p.name}` })
    void desk.alert(res.ok ? `Eine Testseite wurde an „${shortName(p)}“ gesendet.\n\n${res.message}` : `Die Testseite konnte nicht gedruckt werden.\n\n${res.message}`, { title: 'Drucker', icon: res.ok ? 'info' : 'error' })
  }
  const remove = async (p: LocalPrinter) => {
    const ok = await desk.confirm(`Möchten Sie das Gerät „${shortName(p)}“ wirklich entfernen?`, { title: 'Gerät entfernen', icon: 'question', ok: 'Ja', cancel: 'Nein' })
    if (ok) ops.run((e) => removePrinter(e, p.name), { type: A.printerChanged, detail: `Drucker entfernt: ${p.name}` }, { errorTitle: 'Drucker' })
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between rounded-[6px] border border-[#e5e5e5] bg-white p-4">
        <span className="font-medium">Drucker oder Scanner hinzufügen</span>
        <WBtn primary onClick={() => setAdding(true)}>
          Gerät hinzufügen
        </WBtn>
      </div>
      {ep.printers.map((p) => {
        const st = printerEffectiveStatus(world, ep, p)
        const open = sel === p.name
        return (
          <div key={p.name} className="mb-1 rounded-[6px] border border-[#e5e5e5] bg-white">
            <button type="button" className="flex w-full items-center gap-3 p-3 text-left" onClick={() => setSel(open ? null : p.name)}>
              <Printer size={26} className={cx(st.ok ? 'text-slate-600' : 'text-slate-400')} strokeWidth={1.4} />
              <div className="flex-1">
                <div className="font-medium">{shortName(p)}</div>
                <div className={cx(st.ok ? 'text-slate-500' : 'text-rose-700')}>
                  {p.isDefault ? 'Standard, ' : ''}
                  {st.status}
                  {p.jobs.length ? ` · ${p.jobs.length} Dokument(e) in der Warteschlange` : ''}
                </div>
              </div>
            </button>
            {open && (
              <div className="border-t border-[#eee] px-3 py-2.5">
                {st.reason && <div className="mb-2 text-slate-600">Status-Details: {st.reason}</div>}
                <div className="mb-2 grid grid-cols-[110px_1fr] gap-y-0.5 text-slate-600">
                  <span>Treiber</span>
                  <span>{p.driver}</span>
                  <span>Anschluss</span>
                  <span>{p.port}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <WBtn onClick={() => desk.openApp('printqueue', { printer: p.name })}>Druckwarteschlange öffnen</WBtn>
                  <WBtn onClick={() => test(p)}>Testseite drucken</WBtn>
                  <WBtn disabled={p.isDefault} onClick={() => ops.run((e) => setDefaultPrinter(e, p.name), { type: A.printerChanged, detail: `Standarddrucker: ${p.name}` }, { errorTitle: 'Drucker' })}>
                    Als Standard festlegen
                  </WBtn>
                  <WBtn onClick={() => void remove(p)}>Entfernen</WBtn>
                </div>
              </div>
            )}
          </div>
        )
      })}
      {adding && <AddPrinter host={host} onClose={() => setAdding(false)} />}
    </div>
  )
}

function AddPrinter({ host, onClose }: { host: string; onClose: () => void }) {
  const ops = useEpOps(host)
  const queues = useStore((s) => s.world.infra.printQueues)
  const serverOk = useStore((s) => printServerOk(s.world))
  const [unc, setUnc] = useState('\\\\PRINT01\\')
  const [def, setDef] = useState(false)
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')
  const list = useMemo(() => queues.filter((x) => x.shared && (!q || x.name.toLowerCase().includes(q.toLowerCase()) || x.location.toLowerCase().includes(q.toLowerCase()))), [queues, q])
  const add = async () => {
    setBusy(true)
    await new Promise((r) => setTimeout(r, 900))
    setBusy(false)
    const ok = ops.run((e, w) => connectPrinter(w, e, unc.trim(), def), { type: A.printerChanged, detail: `Drucker verbunden: ${unc.trim()}` }, { errorTitle: 'Drucker hinzufügen' })
    if (ok) {
      useStore.getState().toast(`Drucker ${unc.trim()} wurde hinzugefügt.`, 'success')
      onClose()
    }
  }
  return (
    <WDialog
      title="Drucker hinzufügen"
      onClose={onClose}
      width={520}
      footer={
        <>
          <WBtn primary disabled={busy || !/^\\\\[^\\]+\\.+/.test(unc)} onClick={() => void add()}>
            {busy ? 'Verbindung wird hergestellt …' : 'Weiter'}
          </WBtn>
          <WBtn onClick={onClose}>Abbrechen</WBtn>
        </>
      }
    >
      <div className="mb-2 text-[14px] font-semibold">Drucker anhand des Namens oder der TCP/IP-Adresse suchen</div>
      <label className="mb-3 block">
        <span className="mb-1 block">Freigegebenen Drucker über den Namen auswählen:</span>
        <WInput value={unc} onChange={(e) => setUnc(e.target.value)} placeholder="\\Computername\Druckername" className="font-mono" />
      </label>
      <div className="mb-1 flex items-center gap-2">
        <span>Freigegebene Drucker auf \\PRINT01:</span>
        <div className="relative ml-auto w-44">
          <Search size={12} className="absolute top-2 left-2 text-slate-400" />
          <WInput value={q} onChange={(e) => setQ(e.target.value)} className="pl-6" placeholder="Filtern" />
        </div>
      </div>
      <div className="mb-3 h-40 overflow-auto rounded-[4px] border border-[#d0d0d0]">
        {serverOk ? (
          <table className={listCls}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Standort</th>
                <th>Modell</th>
              </tr>
            </thead>
            <tbody>
              {list.map((x) => {
                const path = `\\\\PRINT01\\${x.name}`
                return (
                  <tr key={x.name} className={rowCls(unc.toLowerCase() === path.toLowerCase())} onClick={() => setUnc(path)} onDoubleClick={() => { setUnc(path) }}>
                    <td>{x.name}</td>
                    <td>{x.location}</td>
                    <td>{x.driver}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <div className="p-3 text-rose-700">Auf \\PRINT01 kann nicht zugegriffen werden. Der Netzwerkpfad wurde nicht gefunden.</div>
        )}
      </div>
      <WCheck label="Als Standarddrucker festlegen" checked={def} onChange={setDef} />
    </WDialog>
  )
}

export function PrintQueueApp({ host, args }: AppProps) {
  const ep = useEp(host)
  if (!ep) return <AppLoading />
  return <PrintQueue host={host} ep={ep} name={args.printer ?? ''} />
}

function PrintQueue({ host, ep, name }: { host: string; ep: Endpoint; name: string }) {
  const ops = useEpOps(host)
  const win = useWin()
  const world = useStore((s) => s.world)
  const [sel, setSel] = useState<number | null>(null)
  const p = ep.printers.find((x) => x.name.toLowerCase() === name.toLowerCase())
  const st = p ? printerEffectiveStatus(world, ep, p) : undefined
  const title = p ? `${shortName(p)}${st && !st.ok ? ` – ${st.status}` : ''}` : name
  if (win.focused !== undefined) queueMicrotask(() => win.setTitle(title))
  if (!p) return <div className="p-4 text-[12px] text-slate-500">Der Drucker „{name}“ ist nicht mehr vorhanden.</div>
  const cancel = (ids: number[] | 'all') =>
    ops.mutate(
      (e) => {
        const x = e.printers.find((y) => y.name === p.name)
        if (x) x.jobs = ids === 'all' ? [] : x.jobs.filter((j) => !ids.includes(j.id))
      },
      { type: A.printerChanged, detail: ids === 'all' ? `Alle Druckaufträge abgebrochen: ${p.name}` : `Druckauftrag abgebrochen: ${p.name}` },
    )
  const togglePause = () =>
    ops.mutate(
      (e) => {
        const x = e.printers.find((y) => y.name === p.name)
        if (x) x.status = x.status === 'Angehalten' ? 'Bereit' : 'Angehalten'
      },
      { type: A.printerChanged, detail: `Drucker ${p.status === 'Angehalten' ? 'fortgesetzt' : 'angehalten'}: ${p.name}` },
    )
  return (
    <div className="flex h-full flex-col text-[12px]">
      <MenuBar
        menus={[
          {
            label: 'Drucker',
            items: [
              { label: 'Als Standarddrucker festlegen', checked: p.isDefault, onClick: () => ops.run((e) => setDefaultPrinter(e, p.name), { type: A.printerChanged, detail: `Standarddrucker: ${p.name}` }) },
              { label: 'Drucker anhalten', checked: p.status === 'Angehalten', onClick: togglePause },
              { label: 'Alle Dokumente abbrechen', disabled: !p.jobs.length, onClick: () => cancel('all') },
              { sep: true },
              { label: 'Schließen', onClick: () => win.close() },
            ],
          },
          { label: 'Dokument', items: [{ label: 'Abbrechen', disabled: sel === null, onClick: () => sel !== null && cancel([sel]) }] },
        ]}
      />
      <div className="min-h-0 flex-1 overflow-auto">
        <table className={listCls}>
          <thead>
            <tr>
              <th>Dokumentname</th>
              <th>Status</th>
              <th>Besitzer</th>
              <th>Seiten</th>
              <th>Größe</th>
              <th>Übermittelt</th>
            </tr>
          </thead>
          <tbody>
            {p.jobs.map((j) => (
              <tr key={j.id} className={rowCls(sel === j.id)} onClick={() => setSel(j.id)}>
                <td>{j.document}</td>
                <td className={cx(j.status === 'Fehler' && 'text-rose-700')}>{j.status === 'Fehler' ? 'Fehler – Wird gedruckt' : j.status}</td>
                <td>{j.owner}</td>
                <td>{j.pages}</td>
                <td>{j.sizeKb} KB</td>
                <td>{fmtDTShort(j.submitted)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <StatusBar>
        {p.jobs.length} Dokument(e) in der Warteschlange · {st?.status}
        {st?.reason ? ` – ${st.reason}` : ''}
      </StatusBar>
    </div>
  )
}
