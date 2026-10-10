// Active Directory-Benutzer und -Computer (eigene Gestaltung)
// Links OU-Baum, Mitte Objektliste, Eigenschaftenfenster als Modal. Alle Änderungen über updateWorld + Aktionsprotokoll.

import {
  ArrowDownUp,
  Boxes,
  Building2,
  FolderInput,
  KeyRound,
  LockOpen,
  Monitor,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  RotateCw,
  Search,
  Settings2,
  Trash2,
  User,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { findComputer, findGroup, findUser } from '@/core/ops/ad'
import { useStore } from '@/core/store'
import { Badge, Button, IconButton, Input, cx } from '@/ui'
import { ComputerProperties } from './ComputerProperties'
import { ActionDialogHost } from './dialogs'
import { GroupProperties } from './GroupProperties'
import { ancestorDns, dnToPath, listContainer, searchDirectory, type DirEntry } from './lib'
import { AdCtx, ContextMenu, DropdownButton, ObjIcon, OuTree, type ActionDialog, type AdCtxValue, type MenuItem, type PropsTarget } from './parts'
import { UserProperties } from './UserProperties'
import { useAdActions } from './useAdActions'

type SortKey = 'name' | 'type' | 'description'

export function AdView() {
  const ous = useStore((s) => s.world.ous)
  const users = useStore((s) => s.world.users)
  const groups = useStore((s) => s.world.groups)
  const computers = useStore((s) => s.world.computers)
  const domain = useStore((s) => s.world.domain)
  const params = useStore((s) => s.ui.params)
  const view = useStore((s) => s.ui.view)
  const toast = useStore((s) => s.toast)
  const actions = useAdActions()

  const [currentOu, setCurrentOu] = useState(`OU=Benutzer,OU=Musterwerk,${domain.baseDn}`)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([domain.baseDn, `OU=Musterwerk,${domain.baseDn}`, `OU=Benutzer,OU=Musterwerk,${domain.baseDn}`].map((d) => d.toLowerCase())))
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<{ kind: DirEntry['kind']; id: string } | null>(null)
  const [stack, setStack] = useState<PropsTarget[]>([])
  const [action, setAction] = useState<ActionDialog | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; entry: DirEntry } | null>(null)
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: 'name', asc: true })
  const [refreshTick, setRefreshTick] = useState(0)

  const showOu = useCallback((dn: string) => {
    setCurrentOu(dn)
    setQuery('')
    setExpanded((prev) => {
      const n = new Set(prev)
      for (const a of ancestorDns(dn)) n.add(a.toLowerCase())
      return n
    })
  }, [])

  /** Eigenschaftenfenster werden gestapelt (z. B. Benutzer → Gruppe → zurück zum Benutzer) */
  const openProps = useCallback((p: PropsTarget) => setStack((s) => [...s.filter((x) => !(x.kind === p.kind && x.id === p.id)), p]), [])
  const closeProps = (p: PropsTarget) => setStack((s) => s.filter((x) => x !== p))
  const ctx = useMemo<AdCtxValue>(() => ({ openProps, openAction: (d) => setAction(d), showOu }), [showOu, openProps])

  // Direktaufruf aus anderen Modulen: navigate('ad', { sam }) / { computer } / { group } / { q }
  useEffect(() => {
    if (view !== 'ad') return
    const w = useStore.getState().world
    if (params.sam) {
      const u = findUser(w, params.sam)
      if (!u) return toast(`Benutzer „${params.sam}“ wurde im Active Directory nicht gefunden.`, 'warning')
      showOu(u.ou)
      setSelected({ kind: 'user', id: u.sam })
      setStack([{ kind: 'user', id: u.sam, tab: params.tab }])
    } else if (params.computer) {
      const c = findComputer(w, params.computer)
      if (!c) return toast(`Computer „${params.computer}“ wurde im Active Directory nicht gefunden.`, 'warning')
      showOu(c.ou)
      setSelected({ kind: 'computer', id: c.name })
      setStack([{ kind: 'computer', id: c.name, tab: params.tab }])
    } else if (params.group) {
      const g = findGroup(w, params.group)
      if (!g) return toast(`Gruppe „${params.group}“ wurde nicht gefunden.`, 'warning')
      showOu(g.ou)
      setSelected({ kind: 'group', id: g.name })
      setStack([{ kind: 'group', id: g.name, tab: params.tab }])
    } else if (params.q) {
      setQuery(params.q)
    }
  }, [params, view, showOu, toast])

  const searching = query.trim().length > 0
  const entries = useMemo(() => {
    void refreshTick
    const data = { ous, users, groups, computers }
    const list = searching ? searchDirectory(data, query) : listContainer(data, currentOu)
    const dir = sort.asc ? 1 : -1
    const val = (e: DirEntry) => (sort.key === 'name' ? e.name : sort.key === 'type' ? e.typeLabel : e.description)
    if (sort.key !== 'name' || !sort.asc) list.sort((a, b) => (a.kind === 'ou' ? -1 : 0) - (b.kind === 'ou' ? -1 : 0) || val(a).localeCompare(val(b), 'de') * dir)
    return list
  }, [ous, users, groups, computers, currentOu, query, searching, sort, refreshTick])

  const currentOuObj = ous.find((o) => o.dn === currentOu)
  const sel = selected ? entries.find((e) => e.kind === selected.kind && e.id === selected.id) : undefined

  const toggle = (dn: string) =>
    setExpanded((prev) => {
      const n = new Set(prev)
      const k = dn.toLowerCase()
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })

  const openEntry = (e: DirEntry) => {
    if (e.kind === 'ou') showOu(e.id)
    else openProps({ kind: e.kind, id: e.id })
  }

  const itemsFor = (e: DirEntry): MenuItem[] => {
    if (e.kind === 'ou')
      return [
        { label: 'Öffnen', bold: true, onClick: () => showOu(e.id) },
        { label: 'Neuer Benutzer…', icon: <UserPlus size={14} />, onClick: () => setAction({ t: 'newUser', ou: e.id }), separatorBefore: true },
        { label: 'Neue Gruppe…', icon: <Users size={14} />, onClick: () => setAction({ t: 'newGroup', ou: e.id }) },
      ]
    if (e.kind === 'user')
      return [
        { label: 'Eigenschaften', bold: true, icon: <Settings2 size={14} />, onClick: () => openEntry(e) },
        { label: 'Kennwort zurücksetzen…', icon: <KeyRound size={14} />, onClick: () => setAction({ t: 'reset', sam: e.id }), separatorBefore: true },
        { label: 'Konto entsperren', icon: <LockOpen size={14} />, onClick: () => actions.unlock(e.id), disabled: !e.locked },
        e.disabled ? { label: 'Konto aktivieren', icon: <Power size={14} />, onClick: () => actions.setUserEnabled(e.id, true) } : { label: 'Konto deaktivieren', icon: <PowerOff size={14} />, onClick: () => actions.setUserEnabled(e.id, false) },
        { label: 'Kopieren…', icon: <UserPlus size={14} />, onClick: () => setAction({ t: 'newUser', ou: e.ou, template: e.id }) },
        { label: 'Verschieben…', icon: <FolderInput size={14} />, onClick: () => setAction({ t: 'move', kind: 'user', id: e.id }) },
        { label: 'Mitglied von…', icon: <Users size={14} />, onClick: () => openProps({ kind: 'user', id: e.id, tab: 'mitglied' }) },
        { label: 'Remote-Desktop zum PC', icon: <Monitor size={14} />, onClick: () => actions.rdpUser(e.id), separatorBefore: true },
        { label: 'Löschen', icon: <Trash2 size={14} />, danger: true, onClick: () => setAction({ t: 'deleteUser', sam: e.id }), separatorBefore: true },
      ]
    if (e.kind === 'group')
      return [
        { label: 'Eigenschaften', bold: true, icon: <Settings2 size={14} />, onClick: () => openEntry(e) },
        { label: 'Mitglieder…', icon: <Users size={14} />, onClick: () => openProps({ kind: 'group', id: e.id, tab: 'mitglieder' }), separatorBefore: true },
        { label: 'Verschieben…', icon: <FolderInput size={14} />, onClick: () => setAction({ t: 'move', kind: 'group', id: e.id }) },
      ]
    return [
      { label: 'Eigenschaften', bold: true, icon: <Settings2 size={14} />, onClick: () => openEntry(e) },
      { label: 'BitLocker-Wiederherstellung', icon: <KeyRound size={14} />, onClick: () => openProps({ kind: 'computer', id: e.id, tab: 'bitlocker' }), separatorBefore: true },
      { label: 'LAPS-Kennwort', icon: <KeyRound size={14} />, onClick: () => openProps({ kind: 'computer', id: e.id, tab: 'laps' }) },
      { label: 'Remote-Desktop', icon: <Monitor size={14} />, onClick: () => actions.rdpComputer(e.id) },
      { label: 'Im Inventar anzeigen', icon: <Boxes size={14} />, onClick: () => actions.inventory(e.id) },
      e.disabled ? { label: 'Konto aktivieren', icon: <Power size={14} />, onClick: () => actions.setComputerEnabled(e.id, true), separatorBefore: true } : { label: 'Konto deaktivieren', icon: <PowerOff size={14} />, onClick: () => actions.setComputerEnabled(e.id, false), separatorBefore: true },
      { label: 'Verschieben…', icon: <FolderInput size={14} />, onClick: () => setAction({ t: 'move', kind: 'computer', id: e.id }) },
      { label: 'Konto zurücksetzen…', icon: <RotateCw size={14} />, danger: true, onClick: () => setAction({ t: 'computerReset', name: e.id }) },
    ]
  }

  const newOu = searching ? `OU=Benutzer,OU=Musterwerk,${domain.baseDn}` : currentOu
  const sortHeader = (key: SortKey, label: string) => (
    <th>
      <button type="button" className="flex items-center gap-1 hover:text-slate-800" onClick={() => setSort((s) => ({ key, asc: s.key === key ? !s.asc : true }))}>
        {label}
        {sort.key === key && <ArrowDownUp size={11} className={cx(!sort.asc && 'rotate-180')} />}
      </button>
    </th>
  )

  return (
    <AdCtx.Provider value={ctx}>
      <div className="flex h-full min-h-0 flex-col bg-slate-50">
        {/* Kopf */}
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
              <Users size={19} />
            </div>
            <div className="leading-tight">
              <h1 className="text-base font-semibold text-slate-900">Active Directory-Benutzer und -Computer</h1>
              <p className="text-xs text-slate-500">
                {domain.dnsName} · angemeldet als {domain.netbios}\azubi (GG_IT_Helpdesk)
              </p>
            </div>
          </div>
          <div className="flex-1" />
          <Button size="sm" variant="ghost" icon={<Building2 size={14} />} onClick={() => setAction({ t: 'domain' })}>
            Domäneninfo &amp; Kennwortrichtlinie
          </Button>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
          <div className="relative w-80 max-w-full">
            <Search size={15} className="absolute top-2.5 left-2.5 text-slate-400" />
            <Input
              className="pr-8 pl-8"
              placeholder="Domäne durchsuchen: Name, Anmeldename, Personalnr., Telefon, Computer …"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setQuery('')
                if (e.key === 'Enter' && entries.length === 1) openEntry(entries[0])
              }}
            />
            {query && (
              <button type="button" className="absolute top-2 right-2 text-slate-400 hover:text-slate-700" onClick={() => setQuery('')} aria-label="Suche löschen">
                <X size={16} />
              </button>
            )}
          </div>
          <DropdownButton
            label="Neu"
            icon={<Plus size={15} />}
            variant="primary"
            items={[
              { label: 'Benutzer…', icon: <User size={14} />, onClick: () => setAction({ t: 'newUser', ou: newOu }) },
              { label: 'Gruppe…', icon: <Users size={14} />, onClick: () => setAction({ t: 'newGroup', ou: searching ? `OU=Gruppen,OU=Musterwerk,${domain.baseDn}` : currentOu }) },
            ]}
          />
          <Button
            icon={<RefreshCw size={15} />}
            onClick={() => {
              setRefreshTick((t) => t + 1)
              toast('Ansicht aktualisiert.', 'info')
            }}
          >
            Aktualisieren
          </Button>
          <Button icon={<KeyRound size={15} />} onClick={() => setAction({ t: 'bitlocker' })}>
            BitLocker-Schlüssel suchen…
          </Button>
          <div className="mx-1 h-6 w-px bg-slate-200" />
          {sel && sel.kind !== 'ou' ? (
            <div className="flex flex-wrap items-center gap-1">
              <span className="mr-1 flex items-center gap-1.5 text-sm text-slate-600">
                <ObjIcon kind={sel.kind} variant={sel.variant} disabled={sel.disabled} locked={sel.locked} size={14} />
                <span className="max-w-40 truncate font-medium">{sel.name}</span>
              </span>
              <IconButton title="Eigenschaften" onClick={() => openEntry(sel)}>
                <Settings2 size={16} />
              </IconButton>
              {sel.kind === 'user' && (
                <>
                  <IconButton title="Kennwort zurücksetzen…" onClick={() => setAction({ t: 'reset', sam: sel.id })}>
                    <KeyRound size={16} />
                  </IconButton>
                  <IconButton title="Konto entsperren" disabled={!sel.locked} onClick={() => actions.unlock(sel.id)}>
                    <LockOpen size={16} />
                  </IconButton>
                  <IconButton title={sel.disabled ? 'Konto aktivieren' : 'Konto deaktivieren'} onClick={() => actions.setUserEnabled(sel.id, !!sel.disabled)}>
                    {sel.disabled ? <Power size={16} /> : <PowerOff size={16} />}
                  </IconButton>
                  <IconButton title="Remote-Desktop zum PC" onClick={() => actions.rdpUser(sel.id)}>
                    <Monitor size={16} />
                  </IconButton>
                </>
              )}
              {sel.kind === 'computer' && (
                <IconButton title="Remote-Desktop" onClick={() => actions.rdpComputer(sel.id)}>
                  <Monitor size={16} />
                </IconButton>
              )}
              <IconButton title="Weitere Aktionen" onClick={(ev) => setMenu({ x: ev.clientX, y: ev.clientY + 12, entry: sel })}>
                <span className="text-lg leading-none">⋯</span>
              </IconButton>
            </div>
          ) : (
            <span className="text-xs text-slate-400">Objekt auswählen – Rechtsklick für Aktionen, Doppelklick für Eigenschaften</span>
          )}
        </div>

        {/* Arbeitsbereich */}
        <div className="flex min-h-0 flex-1">
          <aside className="w-64 shrink-0 overflow-auto border-r border-slate-200 bg-white p-2">
            <div className="mb-1 px-1 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">Verzeichnis</div>
            <OuTree
              selected={searching ? '' : currentOu}
              onSelect={(dn) => {
                setCurrentOu(dn)
                setQuery('')
                setSelected(null)
              }}
              expanded={expanded}
              onToggle={toggle}
            />
          </aside>
          <section className="flex min-w-0 flex-1 flex-col">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2 text-sm">
              {searching ? (
                <>
                  <Search size={15} className="text-slate-400" />
                  <span>
                    Suchergebnisse in <strong>{domain.dnsName}</strong> für „{query}“
                  </span>
                </>
              ) : (
                <>
                  <ObjIcon kind="ou" variant={currentOuObj?.kind === 'domain' ? 'domain' : currentOuObj?.kind === 'container' ? 'container' : undefined} open />
                  <span className="font-medium text-slate-800">{currentOuObj?.name ?? currentOu}</span>
                  <span className="truncate text-xs text-slate-400">{dnToPath(currentOu)}</span>
                  {currentOuObj?.description && <span className="text-xs text-slate-500">– {currentOuObj.description}</span>}
                </>
              )}
            </div>
            {!searching && currentOuObj?.kind === 'domain' && (
              <div className="border-b border-slate-200 bg-sky-50/60 px-4 py-2 text-xs text-slate-600">
                Domäne <strong>{domain.dnsName}</strong> ({domain.netbios}) · Kennwortrichtlinie: mind. {domain.minPasswordLength} Zeichen, Komplexität {domain.complexity ? 'aktiviert' : 'deaktiviert'}, max. Alter {domain.maxPasswordAgeDays} Tage · Kontosperrung nach {domain.lockoutThreshold} Fehlversuchen für {domain.lockoutDurationMin} Min.{' '}
                <button type="button" className="text-sky-700 underline" onClick={() => setAction({ t: 'domain' })}>
                  Details
                </button>
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-auto bg-white">
              <table className="w-full text-left text-sm [&_td]:px-3 [&_td]:py-1.5 [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-slate-50 [&_th]:px-3 [&_th]:py-2 [&_th]:text-xs [&_th]:font-medium [&_th]:text-slate-500">
                <thead>
                  <tr>
                    {sortHeader('name', 'Name')}
                    {sortHeader('type', 'Typ')}
                    {sortHeader('description', 'Beschreibung')}
                    {searching && <th>Ordner</th>}
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => {
                    const isSel = selected?.kind === e.kind && selected.id === e.id
                    return (
                      <tr
                        key={e.kind + ':' + e.id}
                        tabIndex={0}
                        className={cx('cursor-default border-t border-slate-100 outline-none', isSel ? 'bg-sky-100' : 'hover:bg-slate-50', e.disabled && 'text-slate-500')}
                        onClick={() => setSelected({ kind: e.kind, id: e.id })}
                        onDoubleClick={() => openEntry(e)}
                        onKeyDown={(ev) => {
                          if (ev.key === 'Enter') openEntry(e)
                        }}
                        onContextMenu={(ev) => {
                          ev.preventDefault()
                          setSelected({ kind: e.kind, id: e.id })
                          setMenu({ x: ev.clientX, y: ev.clientY, entry: e })
                        }}
                      >
                        <td>
                          <span className="flex items-center gap-2">
                            <ObjIcon kind={e.kind} variant={e.variant} disabled={e.disabled} locked={e.locked} />
                            <span className={cx(e.kind === 'ou' && 'font-medium')}>{e.name}</span>
                            {e.kind === 'user' && e.name !== e.id && <span className="text-xs text-slate-400">{e.id}</span>}
                            {e.locked && <Badge tone="amber">gesperrt</Badge>}
                            {e.disabled && <Badge>deaktiviert</Badge>}
                          </span>
                        </td>
                        <td className="text-xs whitespace-nowrap text-slate-500">{e.typeLabel}</td>
                        <td className="max-w-md truncate text-xs text-slate-600" title={e.description}>
                          {e.description}
                        </td>
                        {searching && <td className="text-xs whitespace-nowrap text-slate-500">{dnToPath(e.ou).split('/').slice(1).join('/')}</td>}
                      </tr>
                    )
                  })}
                  {!entries.length && (
                    <tr>
                      <td colSpan={searching ? 4 : 3} className="py-10 text-center text-slate-400">
                        {searching ? 'Keine Objekte gefunden. Tipp: Nachname, Anmeldename, Personalnummer, Durchwahl oder Computername eingeben.' : 'In diesem Container befinden sich keine Objekte.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-4 border-t border-slate-200 bg-white px-4 py-1.5 text-xs text-slate-500">
              <span>{entries.length} Objekt(e)</span>
              {sel && <span>Ausgewählt: {sel.name}</span>}
              <span className="ml-auto">Domänencontroller: DC01 · Rechte: delegiert (Helpdesk)</span>
            </div>
          </section>
        </div>

        {menu && <ContextMenu x={menu.x} y={menu.y} items={itemsFor(menu.entry)} onClose={() => setMenu(null)} />}
        {stack.map((p) =>
          p.kind === 'user' ? (
            <UserProperties key={'u:' + p.id} sam={p.id} initialTab={p.tab} onClose={() => closeProps(p)} />
          ) : p.kind === 'group' ? (
            <GroupProperties key={'g:' + p.id} name={p.id} initialTab={p.tab} onClose={() => closeProps(p)} />
          ) : (
            <ComputerProperties key={'c:' + p.id} name={p.id} initialTab={p.tab} onClose={() => closeProps(p)} />
          ),
        )}
        <ActionDialogHost
          dialog={action}
          onClose={() => setAction(null)}
          onUserDeleted={(sam) => {
            setStack((st) => st.filter((x) => !(x.kind === 'user' && x.id === sam)))
            if (selected?.id === sam) setSelected(null)
          }}
        />
      </div>
    </AdCtx.Provider>
  )
}
