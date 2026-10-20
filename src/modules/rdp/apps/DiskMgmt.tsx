// Datenträgerverwaltung: Volumes + grafische Ansicht, initialisieren, online schalten,
// neues einfaches Volume, Laufwerksbuchstaben, formatieren, Volume löschen.

import { HardDrive, Usb } from 'lucide-react'
import { useMemo, useState } from 'react'
import { A } from '@/core/actions'
import type { Disk, Endpoint, Partition } from '@/core/types'
import { nowIso, uid } from '@/core/util'
import { cx } from '@/ui'
import { useDesk, useEp, useEpOps } from '../desk'
import { AppLoading, ContextMenu, fmtGb, listCls, MenuBar, rowCls, StatusBar, useContextMenu, WBtn, WCheck, WDialog, WInput, WRadio, WSelect, type MenuItem } from '../ui'
import type { AppProps } from './types'

const LETTERS = 'DEFGHIJKLMNOPQRSTUVWXYZ'.split('')

export function DiskMgmtApp({ host }: AppProps) {
  const ep = useEp(host)
  if (!ep) return <AppLoading />
  return <DiskMgmt host={host} ep={ep} />
}

const partLabel = (p: Partition) =>
  p.type === 'EFI' ? 'EFI-Systempartition' : p.type === 'Wiederherstellung' ? 'Wiederherstellungspartition' : p.type === 'Nicht zugeordnet' ? 'Nicht zugeordnet' : `${p.label || 'Volume'}${p.letter ? ` (${p.letter}:)` : ''}`

function partStatus(p: Partition, d: Disk) {
  if (p.type === 'Nicht zugeordnet') return 'Nicht zugeordnet'
  const flags: string[] = []
  if (p.type === 'EFI') flags.push('EFI-Systempartition')
  if (p.type === 'Wiederherstellung') flags.push('OEM-Partition')
  if (p.letter === 'C') flags.push('Startpartition', 'Auslagerungsdatei', 'Absturzabbild', 'Primäre Partition')
  else if (p.type === 'Primär') flags.push('Primäre Partition')
  if (d.kind === 'USB') flags.unshift('Wechselmedium')
  const bl = p.bitlocker === 'Ein' ? 'BitLocker-verschlüsselt; ' : p.bitlocker === 'Angehalten' ? 'BitLocker angehalten; ' : ''
  return `${p.health} (${bl}${flags.join(', ')})`
}

/** Freie Laufwerksbuchstaben (lokal + Netzlaufwerke belegt) */
function freeLetters(ep: Endpoint, keep?: string) {
  const used = new Set<string>()
  for (const d of ep.disks) for (const p of d.partitions) if (p.letter) used.add(p.letter)
  for (const m of ep.mappedDrives) used.add(m.letter.replace(':', ''))
  for (const k of Object.keys(ep.fs)) used.add(k.replace(':', ''))
  return LETTERS.filter((l) => !used.has(l) || l === keep)
}

/** Benachbarte nicht zugeordnete Bereiche zusammenfassen */
function mergeUnallocated(parts: Partition[]): Partition[] {
  const out: Partition[] = []
  for (const p of parts) {
    const last = out[out.length - 1]
    if (last && last.type === 'Nicht zugeordnet' && p.type === 'Nicht zugeordnet') last.sizeGb = Math.round((last.sizeGb + p.sizeGb) * 100) / 100
    else out.push(p)
  }
  return out
}

type Sel = { disk: number; part?: string }

function DiskMgmt({ host, ep }: { host: string; ep: Endpoint }) {
  const desk = useDesk()
  const ops = useEpOps(host)
  const [sel, setSel] = useState<Sel | null>(null)
  const [dlg, setDlg] = useState<null | { kind: 'init'; disk: number } | { kind: 'letter'; disk: number; part: string } | { kind: 'newvol'; disk: number; part: string } | { kind: 'format'; disk: number; part: string }>(null)
  const ctx = useContextMenu<Sel>()

  const volumes = useMemo(() => ep.disks.flatMap((d) => d.partitions.filter((p) => p.type !== 'Nicht zugeordnet' && d.status === 'Online').map((p) => ({ d, p }))), [ep.disks])
  const findSel = (s: Sel | null) => {
    if (!s) return {}
    const d = ep.disks.find((x) => x.number === s.disk)
    const p = s.part ? d?.partitions.find((x) => x.id === s.part) : undefined
    return { d, p }
  }

  const setOnline = (num: number, online: boolean) =>
    ops.mutate(
      (e) => {
        const d = e.disks.find((x) => x.number === num)
        if (d) d.status = online ? 'Online' : 'Offline'
      },
      { type: A.diskChanged, detail: `Datenträger ${num} ${online ? 'online' : 'offline'} geschaltet` },
    )

  const deleteVolume = async (num: number, id: string) => {
    const { p } = findSel({ disk: num, part: id })
    if (!p) return
    if (p.letter === 'C' || p.type !== 'Primär') {
      void desk.alert('Das Volume kann nicht gelöscht werden: Es handelt sich um ein System- bzw. Startvolume.', { title: 'Volume löschen', icon: 'error' })
      return
    }
    const ok = await desk.confirm(`Durch das Löschen des Volumes werden alle Daten auf "${partLabel(p)}" gelöscht. Sichern Sie alle Daten, die Sie behalten möchten, bevor Sie den Vorgang fortsetzen. Möchten Sie den Vorgang fortsetzen?`, { title: 'Einfaches Volume löschen', icon: 'warning', ok: 'Ja', cancel: 'Nein' })
    if (!ok) return
    ops.mutate(
      (e) => {
        const d = e.disks.find((x) => x.number === num)
        const part = d?.partitions.find((x) => x.id === id)
        if (!d || !part) return
        if (part.letter) delete e.fs[`${part.letter}:`]
        Object.assign(part, { type: 'Nicht zugeordnet', letter: undefined, label: undefined, fs: undefined, usedGb: 0, bitlocker: undefined, health: 'Fehlerfrei' })
        d.partitions = mergeUnallocated(d.partitions)
      },
      { type: A.diskChanged, detail: `Volume ${p.letter ? p.letter + ':' : partLabel(p)} auf Datenträger ${num} gelöscht` },
    )
    setSel({ disk: num })
  }

  const diskMenu = (d: Disk): MenuItem[] => [
    { label: 'Datenträgerinitialisierung', disabled: d.status !== 'Nicht initialisiert', onClick: () => setDlg({ kind: 'init', disk: d.number }) },
    { label: 'Online', disabled: d.status !== 'Offline', onClick: () => setOnline(d.number, true) },
    { label: 'Offline', disabled: d.status !== 'Online' || d.number === 0, onClick: () => setOnline(d.number, false) },
    { sep: true },
    { label: 'Eigenschaften', onClick: () => void desk.alert(`Datenträger ${d.number}\n\nModell: ${d.model}\nTyp: ${d.kind}\nGröße: ${fmtGb(d.sizeGb)}\nPartitionsstil: ${d.partitionStyle === 'GPT' ? 'GUID-Partitionstabelle (GPT)' : d.partitionStyle === 'MBR' ? 'Master Boot Record (MBR)' : 'Unbekannt'}\nS.M.A.R.T.: ${d.smart}`, { title: `Eigenschaften von ${d.model}`, icon: 'info' }) },
  ]

  const partMenu = (d: Disk, p: Partition): MenuItem[] =>
    p.type === 'Nicht zugeordnet'
      ? [
          { label: 'Neues einfaches Volume…', disabled: d.status !== 'Online', onClick: () => setDlg({ kind: 'newvol', disk: d.number, part: p.id }) },
          { label: 'Neues übergreifendes Volume…', disabled: true },
          { label: 'Neues Stripesetvolume…', disabled: true },
          { sep: true },
          { label: 'Eigenschaften', disabled: true },
        ]
      : [
          { label: 'Öffnen', disabled: !p.letter, onClick: () => p.letter && desk.openApp('explorer', { path: `${p.letter}:\\` }) },
          { label: 'Partition als aktiv markieren', disabled: true },
          { label: 'Laufwerkbuchstaben und -pfade ändern…', disabled: p.type !== 'Primär', onClick: () => setDlg({ kind: 'letter', disk: d.number, part: p.id }) },
          { label: 'Formatieren…', disabled: p.type !== 'Primär', onClick: () => (p.letter === 'C' ? void desk.alert('Dieses Volume kann nicht formatiert werden. Es enthält die Windows-Version, die gerade ausgeführt wird. Das Formatieren dieses Volumes kann dazu führen, dass der Computer nicht mehr funktioniert.', { title: 'Datenträgerverwaltung', icon: 'error' }) : setDlg({ kind: 'format', disk: d.number, part: p.id })) },
          { sep: true },
          { label: 'Volume erweitern…', disabled: true },
          { label: 'Volume verkleinern…', disabled: true },
          { label: 'Volume löschen…', disabled: p.type !== 'Primär' || p.letter === 'C', onClick: () => void deleteVolume(d.number, p.id) },
          { sep: true },
          { label: 'Eigenschaften', onClick: () => void desk.alert(`${partLabel(p)}\n\nDateisystem: ${p.fs ?? '–'}\nKapazität: ${fmtGb(p.sizeGb)}\nBelegt: ${fmtGb(p.usedGb)}\nFrei: ${fmtGb(Math.max(0, p.sizeGb - p.usedGb))}\nBitLocker: ${p.bitlocker ?? 'Aus'}\nStatus: ${p.health}`, { title: `Eigenschaften von ${partLabel(p)}`, icon: 'info' }) },
        ]

  const { d: selDisk, p: selPart } = findSel(sel)
  const actionItems: MenuItem[] = selDisk ? (selPart ? partMenu(selDisk, selPart) : diskMenu(selDisk)) : [{ label: 'Wählen Sie einen Datenträger oder ein Volume aus.', disabled: true }]

  return (
    <div className="flex h-full flex-col text-[12px]">
      <MenuBar
        menus={[
          { label: 'Datei', items: [{ label: 'Optionen…', disabled: true }] },
          { label: 'Aktion', items: [{ label: 'Aktualisieren', onClick: () => {} }, { label: 'Datenträger neu einlesen', onClick: () => {} }, { sep: true }, ...actionItems] },
          { label: 'Ansicht', items: [{ label: 'Oben: Volumeliste', checked: true }, { label: 'Unten: Grafische Ansicht', checked: true }] },
        ]}
      />
      {/* Volumeliste */}
      <div className="min-h-[90px] flex-[2] overflow-auto border-b-4 border-[#e9e9e9]">
        <table className={listCls}>
          <thead>
            <tr>
              <th>Volume</th>
              <th>Layout</th>
              <th>Typ</th>
              <th>Dateisystem</th>
              <th>Status</th>
              <th>Kapazität</th>
              <th>Freier Speicher</th>
              <th>% frei</th>
            </tr>
          </thead>
          <tbody>
            {volumes.map(({ d, p }) => {
              const free = Math.max(0, p.sizeGb - p.usedGb)
              return (
                <tr key={p.id} className={rowCls(sel?.part === p.id)} onClick={() => setSel({ disk: d.number, part: p.id })} onContextMenu={(e) => { setSel({ disk: d.number, part: p.id }); ctx.open(e, { disk: d.number, part: p.id }) }}>
                  <td>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-3.5 border border-slate-500 bg-[#26a0da]" />
                      {p.letter ? `${p.label || 'Volume'} (${p.letter}:)` : `(Datenträger ${d.number} Partition ${d.partitions.indexOf(p) + 1})`}
                    </span>
                  </td>
                  <td>Einfach</td>
                  <td>Basis</td>
                  <td>{p.fs ?? ''}</td>
                  <td className="max-w-[320px]">{partStatus(p, d)}</td>
                  <td>{fmtGb(p.sizeGb)}</td>
                  <td>{fmtGb(free)}</td>
                  <td>{Math.round((free / p.sizeGb) * 100)} %</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {/* Grafische Ansicht */}
      <div className="min-h-0 flex-[3] overflow-auto bg-white p-2">
        <div className="space-y-2">
          {ep.disks.map((d) => (
            <div key={d.number} className="flex h-[74px] overflow-hidden border border-[#c9c9c9]">
              <div
                className={cx('flex w-36 shrink-0 cursor-default flex-col justify-center gap-0.5 border-r border-[#c9c9c9] px-2', sel?.disk === d.number && !sel.part ? 'bg-[#cce4f7]' : 'bg-[#f0f0f0]')}
                onClick={() => setSel({ disk: d.number })}
                onContextMenu={(e) => {
                  setSel({ disk: d.number })
                  ctx.open(e, { disk: d.number })
                }}
              >
                <div className="flex items-center gap-1.5 font-semibold">
                  {d.kind === 'USB' ? <Usb size={14} /> : <HardDrive size={14} />}
                  Datenträger {d.number}
                </div>
                <div>{d.status === 'Nicht initialisiert' ? 'Unbekannt' : d.kind === 'USB' ? 'Wechselmedium' : 'Basis'}</div>
                <div>{fmtGb(d.sizeGb)}</div>
                <div className={cx(d.status !== 'Online' && 'font-semibold text-rose-700')}>{d.status}</div>
              </div>
              {d.status === 'Online' ? (
                <div className="flex min-w-0 flex-1">
                  {d.partitions.map((p) => {
                    const share = Math.max(8, (p.sizeGb / d.sizeGb) * 100)
                    const un = p.type === 'Nicht zugeordnet'
                    return (
                      <div
                        key={p.id}
                        style={{ flexGrow: share, flexBasis: 0 }}
                        className={cx('flex min-w-[64px] cursor-default flex-col overflow-hidden border-r border-[#c9c9c9] last:border-r-0', sel?.part === p.id && 'outline-2 -outline-offset-2 outline-dashed outline-slate-700')}
                        onClick={() => setSel({ disk: d.number, part: p.id })}
                        onDoubleClick={() => un && setDlg({ kind: 'newvol', disk: d.number, part: p.id })}
                        onContextMenu={(e) => {
                          setSel({ disk: d.number, part: p.id })
                          ctx.open(e, { disk: d.number, part: p.id })
                        }}
                      >
                        <div className={cx('h-2.5 shrink-0', un ? 'bg-black' : 'bg-[#1f4fb5]')} />
                        <div className={cx('min-h-0 flex-1 overflow-hidden px-1.5 py-0.5 leading-tight', un ? 'bg-[repeating-linear-gradient(135deg,#fff,#fff_4px,#ececec_4px,#ececec_8px)]' : 'bg-white')}>
                          {!un && <div className="truncate font-semibold">{partLabel(p)}</div>}
                          <div className="truncate">
                            {fmtGb(p.sizeGb)} {p.fs && !un ? p.fs : ''}
                            {p.bitlocker === 'Ein' && ' (BitLocker-verschlüsselt)'}
                          </div>
                          <div className="truncate text-slate-600">{un ? 'Nicht zugeordnet' : partStatus(p, d)}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="flex flex-1 items-center bg-[repeating-linear-gradient(135deg,#fff,#fff_4px,#f3f3f3_4px,#f3f3f3_8px)] px-3 text-slate-600">
                  {d.status === 'Nicht initialisiert' ? `${fmtGb(d.sizeGb)} – Nicht initialisiert. Rechtsklick auf "Datenträger ${d.number}" → Datenträgerinitialisierung.` : `Offline – Rechtsklick auf "Datenträger ${d.number}" → Online.`}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-4 text-[11px] text-slate-600">
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-4 bg-black" /> Nicht zugeordnet
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-4 bg-[#1f4fb5]" /> Primäre Partition
          </span>
        </div>
      </div>
      <StatusBar>{ep.disks.length} Datenträger</StatusBar>

      {ctx.menu &&
        (() => {
          const { d, p } = findSel(ctx.menu.data)
          if (!d) return null
          return <ContextMenu x={ctx.menu.x} y={ctx.menu.y} onClose={ctx.close} items={p ? partMenu(d, p) : diskMenu(d)} />
        })()}

      {dlg?.kind === 'init' && <InitDialog ep={ep} disk={dlg.disk} onClose={() => setDlg(null)} host={host} />}
      {dlg?.kind === 'letter' && <LetterDialog ep={ep} disk={dlg.disk} part={dlg.part} onClose={() => setDlg(null)} host={host} />}
      {dlg?.kind === 'newvol' && <NewVolumeDialog ep={ep} disk={dlg.disk} part={dlg.part} onClose={() => setDlg(null)} host={host} />}
      {dlg?.kind === 'format' && <FormatDialog ep={ep} disk={dlg.disk} part={dlg.part} onClose={() => setDlg(null)} host={host} />}
    </div>
  )
}

function InitDialog({ host, ep, disk, onClose }: { host: string; ep: Endpoint; disk: number; onClose: () => void }) {
  const ops = useEpOps(host)
  const [style, setStyle] = useState<'GPT' | 'MBR'>('GPT')
  const d = ep.disks.find((x) => x.number === disk)
  if (!d) return null
  return (
    <WDialog
      title="Datenträgerinitialisierung"
      onClose={onClose}
      width={420}
      footer={
        <>
          <WBtn
            primary
            onClick={() => {
              ops.mutate(
                (e) => {
                  const x = e.disks.find((y) => y.number === disk)
                  if (!x) return
                  x.status = 'Online'
                  x.partitionStyle = style
                  const used = x.partitions.filter((p) => p.type !== 'Nicht zugeordnet').reduce((s, p) => s + p.sizeGb, 0)
                  if (!x.partitions.length || used === 0) x.partitions = [{ id: uid('p'), type: 'Nicht zugeordnet', sizeGb: x.sizeGb, usedGb: 0, health: 'Fehlerfrei' }]
                },
                { type: A.diskChanged, detail: `Datenträger ${disk} initialisiert (${style})` },
              )
              onClose()
            }}
          >
            OK
          </WBtn>
          <WBtn onClick={onClose}>Abbrechen</WBtn>
        </>
      }
    >
      <p className="mb-2">Ein Datenträger muss initialisiert werden, damit die logische Datenträgerverwaltung darauf zugreifen kann.</p>
      <div className="mb-2">Datenträger auswählen:</div>
      <div className="mb-3 rounded-[4px] border border-[#d0d0d0] p-1.5">
        <WCheck label={`Datenträger ${d.number} (${d.model}, ${fmtGb(d.sizeGb)})`} checked onChange={() => {}} />
      </div>
      <div className="mb-1">Folgenden Partitionsstil für die ausgewählten Datenträger verwenden:</div>
      <div className="flex flex-col gap-1 pl-2">
        <WRadio name="ps" label="MBR (Master Boot Record)" checked={style === 'MBR'} onChange={() => setStyle('MBR')} />
        <WRadio name="ps" label="GPT (GUID-Partitionstabelle)" checked={style === 'GPT'} onChange={() => setStyle('GPT')} />
      </div>
    </WDialog>
  )
}

/** Wurzelordner für ein Laufwerk anlegen/umhängen (Explorer-Ansicht) */
function moveFsRoot(e: Endpoint, from: string | undefined, to: string | undefined) {
  const node = from ? e.fs[`${from}:`] : undefined
  if (from) delete e.fs[`${from}:`]
  if (!to) return
  if (node) {
    node.name = `${to}:`
    e.fs[`${to}:`] = node
  } else e.fs[`${to}:`] = { name: `${to}:`, type: 'dir', children: [], modified: nowIso() }
}

function LetterDialog({ host, ep, disk, part, onClose }: { host: string; ep: Endpoint; disk: number; part: string; onClose: () => void }) {
  const ops = useEpOps(host)
  const desk = useDesk()
  const d = ep.disks.find((x) => x.number === disk)
  const p = d?.partitions.find((x) => x.id === part)
  const [mode, setMode] = useState<'list' | 'change'>('list')
  const letters = freeLetters(ep, p?.letter)
  const [letter, setLetter] = useState(p?.letter ?? letters[0] ?? '')
  if (!d || !p) return null
  const apply = async (newLetter: string | undefined) => {
    if (p.letter === 'C') {
      void desk.alert('Der Laufwerkbuchstabe des System- bzw. Startvolumes kann nicht geändert werden.', { title: 'Datenträgerverwaltung', icon: 'error' })
      return
    }
    if (p.letter) {
      const ok = await desk.confirm('Einige Programme, die Laufwerkbuchstaben verwenden, funktionieren eventuell nicht mehr ordnungsgemäß. Möchten Sie den Vorgang fortsetzen?', { title: 'Datenträgerverwaltung', icon: 'warning', ok: 'Ja', cancel: 'Nein' })
      if (!ok) return
    }
    const old = p.letter
    ops.mutate(
      (e) => {
        const x = e.disks.find((y) => y.number === disk)?.partitions.find((y) => y.id === part)
        if (!x) return
        x.letter = newLetter
        moveFsRoot(e, old, newLetter)
      },
      { type: A.diskChanged, detail: newLetter ? `Laufwerkbuchstabe ${old ? old + ': → ' : ''}${newLetter}: (Datenträger ${disk})` : `Laufwerkbuchstabe ${old}: entfernt (Datenträger ${disk})` },
    )
    onClose()
  }
  return (
    <WDialog title={`Laufwerkbuchstaben und -pfade für ${partLabel(p)} ändern`} onClose={onClose} width={440} footer={mode === 'list' ? <WBtn primary onClick={onClose}>OK</WBtn> : undefined}>
      {mode === 'list' ? (
        <>
          <p className="mb-2">Diesem Volume mithilfe folgender Laufwerkbuchstaben und Pfade Zugriff gewähren:</p>
          <div className="mb-3 h-20 rounded-[4px] border border-[#d0d0d0] p-1.5">{p.letter ? <div className="bg-[#cce4f7] px-1">{p.letter}:</div> : <span className="text-slate-400">(kein Laufwerkbuchstabe)</span>}</div>
          <div className="flex gap-2">
            <WBtn disabled={!!p.letter} onClick={() => setMode('change')}>
              Hinzufügen…
            </WBtn>
            <WBtn disabled={!p.letter} onClick={() => setMode('change')}>
              Ändern…
            </WBtn>
            <WBtn disabled={!p.letter} onClick={() => void apply(undefined)}>
              Entfernen
            </WBtn>
          </div>
        </>
      ) : (
        <>
          <p className="mb-3">Geben Sie einen Laufwerkbuchstaben oder einen Pfad ein.</p>
          <label className="flex items-center gap-2">
            Folgenden Laufwerkbuchstaben zuweisen:
            <WSelect value={letter} onChange={(e) => setLetter(e.target.value)} className="w-20">
              {letters.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </WSelect>
          </label>
          <div className="mt-4 flex justify-end gap-2">
            <WBtn primary disabled={!letter || letter === p.letter} onClick={() => void apply(letter)}>
              OK
            </WBtn>
            <WBtn onClick={() => setMode('list')}>Abbrechen</WBtn>
          </div>
        </>
      )}
    </WDialog>
  )
}

function NewVolumeDialog({ host, ep, disk, part, onClose }: { host: string; ep: Endpoint; disk: number; part: string; onClose: () => void }) {
  const ops = useEpOps(host)
  const d = ep.disks.find((x) => x.number === disk)
  const p = d?.partitions.find((x) => x.id === part)
  const letters = freeLetters(ep)
  const [step, setStep] = useState(0)
  const [size, setSize] = useState(String(Math.floor((p?.sizeGb ?? 0) * 1024)))
  const [letter, setLetter] = useState(letters[0] ?? '')
  const [fs, setFs] = useState<'NTFS' | 'exFAT' | 'FAT32'>(d?.kind === 'USB' ? 'exFAT' : 'NTFS')
  const [label, setLabel] = useState('Volume')
  const [quick, setQuick] = useState(true)
  if (!d || !p) return null
  const maxMb = Math.floor(p.sizeGb * 1024)
  const sizeMb = Math.min(maxMb, Math.max(8, parseInt(size, 10) || 0))
  const finish = () => {
    const gb = Math.round((sizeMb / 1024) * 100) / 100
    ops.mutate(
      (e) => {
        const x = e.disks.find((y) => y.number === disk)
        const idx = x?.partitions.findIndex((y) => y.id === part) ?? -1
        if (!x || idx < 0) return
        const un = x.partitions[idx]
        const vol: Partition = { id: uid('p'), type: 'Primär', sizeGb: gb, usedGb: 0.05, letter: letter || undefined, label, fs, health: 'Fehlerfrei', bitlocker: 'Aus' }
        const rest = Math.round((un.sizeGb - gb) * 100) / 100
        x.partitions.splice(idx, 1, vol, ...(rest > 0.01 ? [{ ...un, id: uid('p'), sizeGb: rest }] : []))
        if (letter) moveFsRoot(e, undefined, letter)
      },
      { type: A.diskChanged, detail: `Neues Volume ${letter ? letter + ': ' : ''}"${label}" (${fs}, ${fmtGb(gb)}) auf Datenträger ${disk}` },
    )
    onClose()
  }
  return (
    <WDialog
      title="Assistent zum Erstellen neuer einfacher Volumes"
      onClose={onClose}
      width={480}
      footer={
        <>
          <WBtn disabled={step === 0} onClick={() => setStep(step - 1)}>
            &lt; Zurück
          </WBtn>
          {step < 3 ? (
            <WBtn primary onClick={() => setStep(step + 1)}>
              Weiter &gt;
            </WBtn>
          ) : (
            <WBtn primary onClick={finish}>
              Fertig stellen
            </WBtn>
          )}
          <WBtn onClick={onClose}>Abbrechen</WBtn>
        </>
      }
    >
      {step === 0 && (
        <div>
          <div className="mb-2 text-[14px] font-semibold">Volumegröße festlegen</div>
          <p className="mb-3 text-slate-600">Wählen Sie eine Volumegröße zwischen dem Maximal- und Minimalwert.</p>
          <div className="grid grid-cols-[1fr_120px] items-center gap-2">
            <span>Maximaler Speicherplatz in MB:</span>
            <span>{maxMb.toLocaleString('de-DE')}</span>
            <span>Minimaler Speicherplatz in MB:</span>
            <span>8</span>
            <span>Größe des einfachen Volumes in MB:</span>
            <WInput value={size} onChange={(e) => setSize(e.target.value.replace(/\D/g, ''))} />
          </div>
        </div>
      )}
      {step === 1 && (
        <div>
          <div className="mb-2 text-[14px] font-semibold">Laufwerkbuchstaben oder -pfad zuordnen</div>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2">
              <WRadio name="nl" label="Folgenden Laufwerkbuchstaben zuweisen:" checked={!!letter} onChange={() => setLetter(letters[0] ?? '')} />
              <WSelect value={letter} onChange={(e) => setLetter(e.target.value)} className="w-20" disabled={!letter}>
                {letters.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </WSelect>
            </label>
            <WRadio name="nl" label="Keinen Laufwerkbuchstaben oder -pfad zuweisen" checked={!letter} onChange={() => setLetter('')} />
          </div>
        </div>
      )}
      {step === 2 && (
        <div>
          <div className="mb-2 text-[14px] font-semibold">Partition formatieren</div>
          <div className="grid grid-cols-[150px_1fr] items-center gap-2">
            <span>Dateisystem:</span>
            <WSelect value={fs} onChange={(e) => setFs(e.target.value as typeof fs)}>
              <option>NTFS</option>
              <option>exFAT</option>
              <option>FAT32</option>
            </WSelect>
            <span>Größe der Zuordnungseinheit:</span>
            <WSelect defaultValue="Standard">
              <option>Standard</option>
            </WSelect>
            <span>Volumebezeichnung:</span>
            <WInput value={label} onChange={(e) => setLabel(e.target.value)} maxLength={32} />
          </div>
          <div className="mt-3">
            <WCheck label="Schnellformatierung durchführen" checked={quick} onChange={setQuick} />
          </div>
        </div>
      )}
      {step === 3 && (
        <div>
          <div className="mb-2 text-[14px] font-semibold">Fertigstellen des Assistenten</div>
          <p className="mb-2">Folgende Einstellungen wurden ausgewählt:</p>
          <div className="rounded-[4px] border border-[#d0d0d0] bg-[#fafafa] p-2 leading-5">
            Volumetyp: Einfaches Volume
            <br />
            Ausgewählte Datenträger: Datenträger {disk}
            <br />
            Volumegröße: {sizeMb.toLocaleString('de-DE')} MB
            <br />
            Laufwerkbuchstabe oder -pfad: {letter ? `${letter}:` : 'Kein'}
            <br />
            Dateisystem: {fs}
            <br />
            Volumebezeichnung: {label}
            <br />
            Schnellformatierung: {quick ? 'Ja' : 'Nein'}
          </div>
        </div>
      )}
    </WDialog>
  )
}

function FormatDialog({ host, ep, disk, part, onClose }: { host: string; ep: Endpoint; disk: number; part: string; onClose: () => void }) {
  const ops = useEpOps(host)
  const desk = useDesk()
  const p = ep.disks.find((x) => x.number === disk)?.partitions.find((x) => x.id === part)
  const [label, setLabel] = useState(p?.label ?? 'Volume')
  const [fs, setFs] = useState<'NTFS' | 'exFAT' | 'FAT32'>(p?.fs === 'FAT32' || p?.fs === 'exFAT' ? p.fs : 'NTFS')
  if (!p) return null
  const go = async () => {
    const ok = await desk.confirm(`Durch das Formatieren dieses Volumes werden alle darauf befindlichen Daten gelöscht. Sichern Sie alle Daten, die Sie behalten möchten, bevor Sie das Volume formatieren. Möchten Sie den Vorgang fortsetzen?`, { title: `${partLabel(p)} formatieren`, icon: 'warning', ok: 'OK', cancel: 'Abbrechen' })
    if (!ok) return
    ops.mutate(
      (e) => {
        const x = e.disks.find((y) => y.number === disk)?.partitions.find((y) => y.id === part)
        if (!x) return
        x.fs = fs
        x.label = label
        x.usedGb = 0.05
        x.bitlocker = 'Aus'
        if (x.letter) e.fs[`${x.letter}:`] = { name: `${x.letter}:`, type: 'dir', children: [], modified: nowIso() }
      },
      { type: A.diskChanged, detail: `Volume ${p.letter ? p.letter + ':' : partLabel(p)} formatiert (${fs}, "${label}")` },
    )
    onClose()
  }
  return (
    <WDialog
      title={`${partLabel(p)} formatieren`}
      onClose={onClose}
      width={400}
      footer={
        <>
          <WBtn primary onClick={() => void go()}>
            OK
          </WBtn>
          <WBtn onClick={onClose}>Abbrechen</WBtn>
        </>
      }
    >
      <div className="grid grid-cols-[150px_1fr] items-center gap-2">
        <span>Volumebezeichnung:</span>
        <WInput value={label} onChange={(e) => setLabel(e.target.value)} />
        <span>Dateisystem:</span>
        <WSelect value={fs} onChange={(e) => setFs(e.target.value as typeof fs)}>
          <option>NTFS</option>
          <option>exFAT</option>
          <option>FAT32</option>
        </WSelect>
        <span>Größe der Zuordnungseinheit:</span>
        <WSelect defaultValue="Standard">
          <option>Standard</option>
        </WSelect>
      </div>
      <div className="mt-3">
        <WCheck label="Schnellformatierung durchführen" checked onChange={() => {}} />
      </div>
    </WDialog>
  )
}
