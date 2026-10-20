// Eigenschaften eines Computerkontos inkl. BitLocker-Wiederherstellung und LAPS

import { Boxes, FolderInput, KeyRound, Monitor, Power, PowerOff, RotateCw, ShieldAlert } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { A } from '@/core/actions'
import { findComputer } from '@/core/ops/ad'
import { useStore } from '@/core/store'
import type { AdComputer } from '@/core/types'
import { fmtDateTime, fmtRelative, nowIso } from '@/core/util'
import { Badge, Button, Field, Input, Modal, Tabs } from '@/ui'
import { computerVariant, diffObject, dnToPath } from './lib'
import { KV, ObjIcon, PickerDialog, SecretValue, SectionTitle, Warn, useAdCtx, useRun } from './parts'
import { MemberOfTab } from './UserProperties'
import { useAdActions } from './useAdActions'

type CompTab = 'allgemein' | 'os' | 'mitglied' | 'bitlocker' | 'laps'

const EDIT_KEYS = ['description', 'location', 'managedBy'] as const satisfies readonly (keyof AdComputer)[]
const LABELS: Record<(typeof EDIT_KEYS)[number], string> = { description: 'Beschreibung', location: 'Standort', managedBy: 'Verwaltet von' }

export function ComputerProperties({ name, initialTab, onClose }: { name: string; initialTab?: string; onClose: () => void }) {
  const comp = useStore((s) => s.world.computers.find((c) => c.name === name))
  if (!comp)
    return (
      <Modal title="Objekt nicht gefunden" onClose={onClose} size="sm" footer={<Button onClick={onClose}>Schließen</Button>}>
        <p className="text-sm text-slate-600">Das Computerobjekt „{name}“ ist nicht (mehr) vorhanden.</p>
      </Modal>
    )
  return <Inner key={comp.name} comp={comp} initialTab={(initialTab as CompTab) ?? 'allgemein'} onClose={onClose} />
}

function Inner({ comp, initialTab, onClose }: { comp: AdComputer; initialTab: CompTab; onClose: () => void }) {
  const [tab, setTab] = useState<CompTab>(initialTab)
  const [orig, setOrig] = useState(comp)
  const [draft, setDraft] = useState(comp)
  const [pickMgr, setPickMgr] = useState(false)
  const users = useStore((s) => s.world.users)
  const run = useRun()
  const actions = useAdActions()
  const { openAction, openProps } = useAdCtx()
  const patch = useMemo(() => diffObject(orig, draft, EDIT_KEYS), [orig, draft])
  const dirty = Object.keys(patch).length > 0
  const mgr = draft.managedBy ? users.find((u) => u.sam === draft.managedBy) : undefined
  const save = (): boolean => {
    if (!dirty) return true
    const clean: Partial<AdComputer> = { ...patch }
    if ('managedBy' in clean && !clean.managedBy) clean.managedBy = undefined
    const keys = Object.keys(clean) as (typeof EDIT_KEYS)[number][]
    const ok = run(
      (w) => {
        const c = findComputer(w, comp.name)
        if (!c) return 'Computer nicht gefunden.'
        Object.assign(c, clean)
        return null
      },
      { type: A.adComputerUpdated, target: comp.name, detail: keys.map((k) => `${LABELS[k]}${k === 'managedBy' ? `=${clean.managedBy ?? '(leer)'}` : ''}`).join(', ') },
      `Änderungen an „${comp.name}“ wurden gespeichert.`,
    )
    if (ok) setOrig(draft)
    return ok
  }
  const tabs: { id: CompTab; label: ReactNode }[] = [
    { id: 'allgemein', label: 'Allgemein' },
    { id: 'os', label: 'Betriebssystem' },
    { id: 'mitglied', label: 'Mitglied von' },
    { id: 'bitlocker', label: 'BitLocker-Wiederherstellung' },
    { id: 'laps', label: 'LAPS' },
  ]
  return (
    <Modal
      size="xl"
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <ObjIcon kind="computer" variant={computerVariant(comp)} disabled={!comp.enabled} size={18} /> Eigenschaften von {comp.name}
          {!comp.enabled && <Badge>Deaktiviert</Badge>}
        </span>
      }
      footer={
        <>
          <span className="mr-auto self-center text-xs text-slate-500">{dirty ? 'Ungespeicherte Änderungen' : dnToPath(comp.ou)}</span>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button disabled={!dirty} onClick={() => save()}>
            Übernehmen
          </Button>
          <Button variant="primary" onClick={() => save() && onClose()}>
            OK
          </Button>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap gap-1.5">
        <Button size="sm" icon={<Monitor size={13} />} onClick={() => actions.rdpComputer(comp.name)}>
          Remote-Desktop
        </Button>
        <Button size="sm" icon={<Boxes size={13} />} onClick={() => actions.inventory(comp.name)}>
          Im Inventar anzeigen
        </Button>
        {comp.enabled ? (
          <Button size="sm" icon={<PowerOff size={13} />} onClick={() => actions.setComputerEnabled(comp.name, false)}>
            Konto deaktivieren
          </Button>
        ) : (
          <Button size="sm" icon={<Power size={13} />} onClick={() => actions.setComputerEnabled(comp.name, true)}>
            Konto aktivieren
          </Button>
        )}
        <Button size="sm" icon={<FolderInput size={13} />} onClick={() => openAction({ t: 'move', kind: 'computer', id: comp.name })}>
          Verschieben…
        </Button>
        <Button size="sm" variant="ghost" className="text-rose-700 hover:bg-rose-50" icon={<RotateCw size={13} />} onClick={() => openAction({ t: 'computerReset', name: comp.name })}>
          Konto zurücksetzen…
        </Button>
      </div>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      <div className="min-h-[22rem] pt-4">
        {tab === 'allgemein' && (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-3">
              <Field label="Computername (Prä-Windows 2000)">
                <Input value={comp.name} disabled />
              </Field>
              <Field label="DNS-Name">
                <Input value={comp.dnsHostName} disabled />
              </Field>
              <Field label="Beschreibung">
                <Input value={draft.description ?? ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              </Field>
              <Field label="Standort">
                <Input value={draft.location ?? ''} onChange={(e) => setDraft({ ...draft, location: e.target.value })} />
              </Field>
            </div>
            <div className="space-y-3">
              <Field label="Verwaltet von" hint="Ordnet den Computer einem Benutzer zu (primäres Gerät, Remote-Desktop aus dem Benutzerkonto).">
                <div className="flex gap-2">
                  <Input value={mgr ? `${mgr.displayName} (${mgr.sam})` : (draft.managedBy ?? '')} disabled />
                  <Button onClick={() => setPickMgr(true)}>Ändern…</Button>
                  <Button disabled={!mgr} onClick={() => mgr && openProps({ kind: 'user', id: mgr.sam })}>
                    Eigenschaften
                  </Button>
                  <Button variant="ghost" disabled={!draft.managedBy} onClick={() => setDraft({ ...draft, managedBy: undefined })}>
                    Löschen
                  </Button>
                </div>
              </Field>
              <KV
                rows={[
                  ['Status', comp.enabled ? <Badge tone="green">Aktiviert</Badge> : <Badge>Deaktiviert</Badge>],
                  ['Ordner', dnToPath(comp.ou)],
                  ['Letzte Anmeldung', comp.lastLogon ? `${fmtDateTime(comp.lastLogon)} (${fmtRelative(comp.lastLogon)})` : 'nie'],
                  ['Erstellt', fmtDateTime(comp.created)],
                  ['Rolle', computerVariant(comp) === 'server' ? 'Server' : 'Arbeitsstation'],
                ]}
              />
            </div>
          </div>
        )}
        {tab === 'os' && (
          <KV
            className="max-w-xl"
            rows={[
              ['Name', comp.os],
              ['Version', comp.osVersion],
              ['Service Pack', ''],
              ['Gerätetyp', computerVariant(comp) === 'notebook' ? 'Notebook' : computerVariant(comp) === 'server' ? 'Server' : 'Desktop'],
            ]}
          />
        )}
        {tab === 'mitglied' && <MemberOfTab member={`${comp.name}$`} memberLabel={comp.name} />}
        {tab === 'bitlocker' && <BitlockerTab comp={comp} />}
        {tab === 'laps' && <LapsTab comp={comp} />}
      </div>
      {pickMgr && <PickerDialog title="Verwaltet von – Benutzer auswählen" kinds={['user']} onPick={(e) => setDraft({ ...draft, managedBy: e.id })} onClose={() => setPickMgr(false)} />}
    </Modal>
  )
}

function BitlockerTab({ comp }: { comp: AdComputer }) {
  const log = useStore((s) => s.log)
  const [revealed, setRevealed] = useState<Record<string, boolean>>({})
  const keys = useMemo(() => [...comp.bitlockerKeys].sort((a, b) => b.created.localeCompare(a.created)), [comp.bitlockerKeys])
  const reveal = (keyId: string) => {
    setRevealed((r) => ({ ...r, [keyId]: true }))
    log({ type: A.adBitlockerViewed, target: comp.name, detail: `Kennwort-ID ${keyId}` })
  }
  return (
    <div className="space-y-4">
      <Warn tone="amber">
        <ShieldAlert size={16} className="mt-0.5 shrink-0" />
        <span>
          Wiederherstellungsschlüssel sind <strong>hochvertraulich</strong>. Vor dem Anzeigen die Identität des Anrufers prüfen und die Kennwort-ID vom Bildschirm des Benutzers abgleichen. Jeder Zugriff wird protokolliert.
        </span>
      </Warn>
      {!keys.length ? (
        <p className="text-sm text-slate-500">Für diesen Computer sind keine BitLocker-Wiederherstellungsinformationen im Active Directory gespeichert.</p>
      ) : (
        <div className="space-y-3">
          {keys.map((k) => {
            const shown = !!revealed[k.keyId]
            return (
              <div key={k.keyId} className="rounded-md border border-slate-200 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
                    <KeyRound size={15} className="text-amber-600" /> Wiederherstellungsinformationen vom {fmtDateTime(k.created)}
                  </div>
                  {!shown && (
                    <Button size="sm" variant="primary" onClick={() => reveal(k.keyId)}>
                      Anzeigen
                    </Button>
                  )}
                </div>
                <KV
                  rows={[
                    ['Kennwort-ID', shown ? <span className="font-mono">{k.keyId}-…</span> : <span className="font-mono tracking-widest text-slate-400">••••••••</span>],
                    ['Wiederherstellungskennwort', <SecretValue value={k.recoveryPassword} revealed={shown} onReveal={() => reveal(k.keyId)} />],
                    ['Computer', comp.name],
                  ]}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function LapsTab({ comp }: { comp: AdComputer }) {
  const log = useStore((s) => s.log)
  const run = useRun()
  const [shown, setShown] = useState(false)
  if (!comp.laps) return <p className="text-sm text-slate-500">Für diesen Computer ist kein LAPS-Kennwort gespeichert (LAPS nicht aktiv, z. B. Domänencontroller).</p>
  const expired = new Date(comp.laps.expires).getTime() < Date.now()
  return (
    <div className="max-w-2xl space-y-4">
      <Warn tone="amber">
        <ShieldAlert size={16} className="mt-0.5 shrink-0" />
        <span>Das lokale Administratorkennwort nur für eigene Arbeiten am Gerät verwenden – niemals an Anwender weitergeben. Nach Verwendung den Ablauf erzwingen, damit ein neues Kennwort gesetzt wird.</span>
      </Warn>
      <SectionTitle>Lokales Administratorkennwort (Windows LAPS)</SectionTitle>
      <KV
        rows={[
          ['Kontoname', '.\\Administrator'],
          [
            'Kennwort',
            <SecretValue
              value={comp.laps.password}
              revealed={shown}
              onReveal={() => {
                setShown(true)
                log({ type: A.adLapsViewed, target: comp.name })
              }}
            />,
          ],
          ['Läuft ab', <span className={expired ? 'text-rose-700' : ''}>{fmtDateTime(comp.laps.expires)} ({fmtRelative(comp.laps.expires)})</span>],
        ]}
      />
      <Button
        size="sm"
        onClick={() =>
          run(
            (w) => {
              const c = findComputer(w, comp.name)
              if (!c?.laps) return 'Kein LAPS-Kennwort vorhanden.'
              c.laps.expires = nowIso()
              return null
            },
            { type: A.adComputerUpdated, target: comp.name, detail: 'LAPS-Kennwortablauf erzwungen' },
            'Ablauf festgelegt. Der Client setzt bei der nächsten Gruppenrichtlinienaktualisierung ein neues Kennwort.',
          )
        }
      >
        Ablauf jetzt erzwingen
      </Button>
    </div>
  )
}
