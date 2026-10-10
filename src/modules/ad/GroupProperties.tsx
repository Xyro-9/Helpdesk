// Eigenschaften einer Gruppe

import { ChevronDown, ChevronRight, Plus, ShieldAlert } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { A } from '@/core/actions'
import { addGroupMember, effectiveUserMembers, findComputer, findGroup, findUser, removeGroupMember } from '@/core/ops/ad'
import { useStore } from '@/core/store'
import type { AdGroup, GroupScope, GroupType, World } from '@/core/types'
import { Badge, Button, Checkbox, Field, Input, Modal, Tabs, cx, tableCls } from '@/ui'
import { computerVariant, diffObject, dnToPath, isPrivilegedGroup, type DirKind } from './lib'
import { KV, ObjIcon, PickerDialog, SectionTitle, Warn, useAdCtx, usePrivilegedGuard, useRun } from './parts'
import { MemberOfTab } from './UserProperties'
import { AD_GROUP_UPDATED } from './useAdActions'

type GroupTab = 'allgemein' | 'mitglieder' | 'mitglied' | 'verwaltet'

const EDIT_KEYS = ['description', 'scope', 'type', 'mail', 'managedBy'] as const satisfies readonly (keyof AdGroup)[]

export function GroupProperties({ name, initialTab, onClose }: { name: string; initialTab?: string; onClose: () => void }) {
  const group = useStore((s) => s.world.groups.find((g) => g.name === name))
  if (!group)
    return (
      <Modal title="Objekt nicht gefunden" onClose={onClose} size="sm" footer={<Button onClick={onClose}>Schließen</Button>}>
        <p className="text-sm text-slate-600">Die Gruppe „{name}“ ist nicht (mehr) vorhanden.</p>
      </Modal>
    )
  return <GroupPropertiesInner key={group.name} group={group} initialTab={(initialTab as GroupTab) ?? 'allgemein'} onClose={onClose} />
}

function GroupPropertiesInner({ group, initialTab, onClose }: { group: AdGroup; initialTab: GroupTab; onClose: () => void }) {
  const [tab, setTab] = useState<GroupTab>(initialTab)
  const [orig, setOrig] = useState(group)
  const [draft, setDraft] = useState(group)
  const run = useRun()
  const patch = useMemo(() => diffObject(orig, draft, EDIT_KEYS), [orig, draft])
  const dirty = Object.keys(patch).length > 0
  const save = (): boolean => {
    if (!dirty) return true
    const clean: Partial<AdGroup> = { ...patch }
    if ('mail' in clean && !clean.mail) clean.mail = undefined
    if ('managedBy' in clean && !clean.managedBy) clean.managedBy = undefined
    const ok = run(
      (w) => {
        const g = findGroup(w, group.name)
        if (!g) return 'Gruppe nicht gefunden.'
        if (g.builtin && ('scope' in clean || 'type' in clean)) return 'Bereich und Typ integrierter Gruppen können nicht geändert werden.'
        Object.assign(g, clean)
        return null
      },
      { type: AD_GROUP_UPDATED, target: group.name, detail: Object.keys(clean).join(', ') },
      `Änderungen an „${group.name}“ wurden gespeichert.`,
    )
    if (ok) setOrig(draft)
    return ok
  }
  const tabs: { id: GroupTab; label: ReactNode }[] = [
    { id: 'allgemein', label: 'Allgemein' },
    { id: 'mitglieder', label: `Mitglieder (${group.members.length})` },
    { id: 'mitglied', label: 'Mitglied von' },
    { id: 'verwaltet', label: 'Verwaltet von' },
  ]
  return (
    <Modal
      size="xl"
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <ObjIcon kind="group" size={18} /> Eigenschaften von {group.name}
          {isPrivilegedGroup(group.name) && <Badge tone="red">privilegiert</Badge>}
          {group.builtin && <Badge>integriert</Badge>}
        </span>
      }
      footer={
        <>
          <span className="mr-auto self-center text-xs text-slate-500">{dirty ? 'Ungespeicherte Änderungen' : dnToPath(group.ou)}</span>
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
      {isPrivilegedGroup(group.name) && (
        <div className="mb-3">
          <Warn tone="red">
            <ShieldAlert size={16} className="mt-0.5 shrink-0" />
            <span>
              Privilegierte Gruppe – Mitgliedschaften <strong>nur mit Freigabe der IT-Leitung</strong> ändern.
            </span>
          </Warn>
        </div>
      )}
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      <div className="min-h-[22rem] pt-4">
        {tab === 'allgemein' && (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Gruppenname (Prä-Windows 2000)">
              <Input value={group.name} disabled />
            </Field>
            <Field label="E-Mail">
              <Input value={draft.mail ?? ''} onChange={(e) => setDraft({ ...draft, mail: e.target.value })} />
            </Field>
            <Field label="Beschreibung" className="md:col-span-2">
              <Input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </Field>
            <fieldset className="rounded-md border border-slate-200 p-3 text-sm" disabled={group.builtin}>
              <legend className="px-1 text-xs font-medium text-slate-600">Gruppenbereich</legend>
              {(['Lokal (Domäne)', 'Global', 'Universal'] as GroupScope[]).map((s) => (
                <label key={s} className="flex items-center gap-2 py-0.5">
                  <input type="radio" className="accent-sky-600" checked={draft.scope === s} onChange={() => setDraft({ ...draft, scope: s })} />
                  {s}
                </label>
              ))}
            </fieldset>
            <fieldset className="rounded-md border border-slate-200 p-3 text-sm" disabled={group.builtin}>
              <legend className="px-1 text-xs font-medium text-slate-600">Gruppentyp</legend>
              {(['Sicherheit', 'Verteilung'] as GroupType[]).map((t) => (
                <label key={t} className="flex items-center gap-2 py-0.5">
                  <input type="radio" className="accent-sky-600" checked={draft.type === t} onChange={() => setDraft({ ...draft, type: t })} />
                  {t === 'Sicherheit' ? 'Sicherheitsgruppe' : 'Verteilergruppe'}
                </label>
              ))}
            </fieldset>
            <div className="md:col-span-2">
              <KV
                rows={[
                  ['Ordner', dnToPath(group.ou)],
                  ['Direkte Mitglieder', String(group.members.length)],
                ]}
              />
            </div>
          </div>
        )}
        {tab === 'mitglieder' && <MembersTab group={group} />}
        {tab === 'mitglied' && <MemberOfTab member={group.name} memberLabel={group.name} />}
        {tab === 'verwaltet' && <ManagedByTab draft={draft} setDraft={setDraft} />}
      </div>
    </Modal>
  )
}

function ManagedByTab({ draft, setDraft }: { draft: AdGroup; setDraft: (g: AdGroup) => void }) {
  const users = useStore((s) => s.world.users)
  const { openProps } = useAdCtx()
  const [pick, setPick] = useState(false)
  const mgr = draft.managedBy ? users.find((u) => u.sam === draft.managedBy) : undefined
  return (
    <div className="max-w-xl space-y-4">
      <Field label="Verwaltet von (Name)">
        <div className="flex gap-2">
          <Input value={mgr ? `${mgr.displayName} (${mgr.sam})` : (draft.managedBy ?? '')} disabled />
          <Button onClick={() => setPick(true)}>Ändern…</Button>
          <Button disabled={!mgr} onClick={() => mgr && openProps({ kind: 'user', id: mgr.sam })}>
            Eigenschaften
          </Button>
          <Button variant="ghost" disabled={!draft.managedBy} onClick={() => setDraft({ ...draft, managedBy: undefined })}>
            Löschen
          </Button>
        </div>
      </Field>
      {mgr && (
        <KV
          rows={[
            ['Büro', mgr.office],
            ['Abteilung', mgr.department],
            ['Telefon', mgr.phone],
            ['E-Mail', mgr.mail],
          ]}
        />
      )}
      <p className="text-xs text-slate-500">Der Verantwortliche einer Gruppe gibt neue Mitgliedschaften frei (z. B. Projektlaufwerke). Freigabe im Ticket dokumentieren.</p>
      {pick && <PickerDialog title="Verantwortlichen auswählen" kinds={['user']} onPick={(e) => setDraft({ ...draft, managedBy: e.id })} onClose={() => setPick(false)} />}
    </div>
  )
}

interface MemberInfo {
  raw: string
  kind: Exclude<DirKind, 'ou'> | 'unknown'
  name: string
  sub: string
  disabled?: boolean
  locked?: boolean
  variant?: 'notebook' | 'server' | 'desktop' | 'service'
}

function describeMember(ww: World, raw: string): MemberInfo {
  const u = findUser(ww, raw)
  if (u) return { raw, kind: 'user', name: u.displayName, sub: u.sam, disabled: !u.enabled, locked: u.lockedOut, variant: u.isServiceAccount ? 'service' : undefined }
  const g = findGroup(ww, raw)
  if (g) return { raw, kind: 'group', name: g.name, sub: `${g.type === 'Sicherheit' ? 'Sicherheitsgruppe' : 'Verteiler'} – ${g.scope}` }
  const c = findComputer(ww, raw)
  if (c) return { raw, kind: 'computer', name: c.name, sub: 'Computer', disabled: !c.enabled, variant: computerVariant(c) as MemberInfo['variant'] }
  return { raw, kind: 'unknown', name: raw, sub: 'Unbekanntes Objekt (verwaist)' }
}

function MembersTab({ group }: { group: AdGroup }) {
  const world = useStore((s) => s.world)
  const run = useRun()
  const { openProps } = useAdCtx()
  const { guard, dialog } = usePrivilegedGuard()
  const [pick, setPick] = useState(false)
  const [sel, setSel] = useState<string | null>(null)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [showEffective, setShowEffective] = useState(false)
  const effective = useMemo(() => (showEffective ? effectiveUserMembers(world, group.name) : []), [world, group.name, showEffective])

  const add = (kind: string, id: string, label: string) => {
    const target = kind === 'computer' ? `${id}$` : id
    guard(group.name, label, () => run((w) => addGroupMember(w, group.name, target), { type: A.adGroupAdd, target, detail: group.name }, `„${label}“ wurde der Gruppe „${group.name}“ hinzugefügt.`))
  }
  const remove = (raw: string) => {
    if (run((w) => removeGroupMember(w, group.name, raw), { type: A.adGroupRemove, target: raw, detail: group.name }, `„${raw}“ wurde aus „${group.name}“ entfernt.`)) setSel(null)
  }
  const openObj = (m: MemberInfo) => {
    if (m.kind === 'user') openProps({ kind: 'user', id: m.sub })
    else if (m.kind === 'group') openProps({ kind: 'group', id: m.name })
    else if (m.kind === 'computer') openProps({ kind: 'computer', id: m.name })
  }

  const rows: ReactNode[] = []
  const walk = (members: string[], depth: number, path: string, seen: Set<string>) => {
    const infos = members.map((m) => describeMember(world, m)).sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name, 'de'))
    for (const m of infos) {
      const key = `${path}/${m.raw}`
      const isGroup = m.kind === 'group'
      const expanded = isGroup && open.has(key)
      const direct = depth === 0
      rows.push(
        <tr
          key={key}
          className={cx(direct ? 'cursor-pointer' : 'text-slate-500', direct && sel === m.raw ? 'bg-sky-100' : direct && 'hover:bg-slate-50')}
          onClick={() => direct && setSel(m.raw)}
          onDoubleClick={() => openObj(m)}
        >
          <td>
            <span className="flex items-center gap-1.5" style={{ paddingLeft: depth * 18 }}>
              {isGroup ? (
                <button
                  type="button"
                  className="text-slate-400 hover:text-slate-700"
                  onClick={(e) => {
                    e.stopPropagation()
                    setOpen((s) => {
                      const n = new Set(s)
                      if (n.has(key)) n.delete(key)
                      else n.add(key)
                      return n
                    })
                  }}
                  aria-label="Verschachtelte Mitglieder anzeigen"
                >
                  {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
              ) : (
                <span className="w-3.5" />
              )}
              {m.kind === 'unknown' ? <span className="text-rose-500">?</span> : <ObjIcon kind={m.kind} variant={m.variant} disabled={m.disabled} locked={m.locked} />}
              <span>{m.name}</span>
              {!direct && <span className="text-[11px] text-slate-400">(indirekt)</span>}
            </span>
          </td>
          <td className="text-xs text-slate-500">{m.sub}</td>
        </tr>,
      )
      if (expanded && !seen.has(m.name.toLowerCase())) {
        const g = world.groups.find((x) => x.name === m.name)
        if (g) walk(g.members, depth + 1, key, new Set([...seen, m.name.toLowerCase()]))
      }
    }
  }
  walk(group.members, 0, '', new Set([group.name.toLowerCase()]))

  return (
    <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
      <div>
        <SectionTitle>Mitglieder (Gruppen aufklappbar für verschachtelte Mitglieder)</SectionTitle>
        <div className="max-h-96 overflow-auto rounded-md border border-slate-200">
          <table className={tableCls}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Typ / Anmeldename</th>
              </tr>
            </thead>
            <tbody>
              {rows}
              {!group.members.length && (
                <tr>
                  <td colSpan={2} className="py-4 text-center text-slate-400">
                    Diese Gruppe hat keine Mitglieder.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex gap-2">
          <Button size="sm" icon={<Plus size={13} />} onClick={() => setPick(true)}>
            Hinzufügen…
          </Button>
          <Button size="sm" disabled={!sel} onClick={() => sel && remove(sel)}>
            Entfernen
          </Button>
        </div>
      </div>
      <div>
        <Checkbox label="Alle effektiven Benutzer anzeigen (aufgelöst)" checked={showEffective} onChange={setShowEffective} />
        {showEffective && (
          <ul className="mt-2 max-h-96 space-y-1 overflow-auto rounded-md border border-slate-200 p-2 text-sm">
            {effective.map((sam) => {
              const u = world.users.find((x) => x.sam === sam)
              return (
                <li key={sam} className="flex items-center gap-2">
                  <ObjIcon kind="user" disabled={u ? !u.enabled : false} size={14} />
                  {u?.displayName ?? sam} <span className="text-xs text-slate-400">{sam}</span>
                </li>
              )
            })}
            {!effective.length && <li className="py-2 text-center text-slate-400">Keine Benutzer</li>}
          </ul>
        )}
      </div>
      {pick && (
        <PickerDialog
          title={`Mitglieder zu „${group.name}“ hinzufügen`}
          kinds={['user', 'group', 'computer']}
          exclude={[group.name, ...group.members]}
          onPick={(e) => add(e.kind, e.id, e.name)}
          onClose={() => setPick(false)}
          hint={
            isPrivilegedGroup(group.name) ? (
              <Warn tone="red">
                <ShieldAlert size={16} className="mt-0.5 shrink-0" />
                <span>Nur mit Freigabe der IT-Leitung!</span>
              </Warn>
            ) : undefined
          }
        />
      )}
      {dialog}
    </div>
  )
}
