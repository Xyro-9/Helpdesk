// Gemeinsame Bausteine der AD-Konsole: Aktions-Hook, Objekt-Icons, Auswahl-Dialoge, Bestätigung, Kontextmenü

import { Ban, Building2, ChevronDown, ChevronRight, Copy, Eye, EyeOff, Folder, FolderOpen, Laptop, Lock, Monitor, Search, Server, ShieldAlert, User, UserCog, Users } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useStore } from '@/core/store'
import type { ActionEntry, World } from '@/core/types'
import { Button, Input, Modal, cx, tableCls } from '@/ui'
import { buildOuTree, dnToPath, isPrivilegedGroup, searchDirectory, sortEntries, userEntry, groupEntry, computerEntry, type DirEntry, type DirKind, type OuNode } from './lib'

// ─────────────── Weltänderungen mit Fehlerbehandlung ───────────────

export type LogEntry = Omit<ActionEntry, 'id' | 'time'>

class AbortAction extends Error {}

/**
 * Führt eine Änderung über updateWorld aus. Liefert die ops-Funktion einen Fehlertext,
 * wird die Änderung verworfen (inkl. Protokolleintrag) und der Fehler als Toast angezeigt.
 */
export function useRun() {
  const updateWorld = useStore((s) => s.updateWorld)
  const toast = useStore((s) => s.toast)
  return useCallback(
    (recipe: (w: World) => string | null | undefined | void, entry?: LogEntry, success?: string): boolean => {
      const box: { err: string | null } = { err: null }
      try {
        updateWorld((w) => {
          const r = recipe(w)
          if (typeof r === 'string' && r) {
            box.err = r
            throw new AbortAction(r)
          }
        }, entry)
      } catch (e) {
        if (!(e instanceof AbortAction)) {
          toast(`Unerwarteter Fehler: ${(e as Error).message}`, 'error')
          return false
        }
      }
      if (box.err) {
        toast(box.err, 'error')
        return false
      }
      if (success) toast(success, 'success')
      return true
    },
    [updateWorld, toast],
  )
}

// ─────────────── Kontext der Konsole (Dialoge öffnen) ───────────────

export type PropsTarget = { kind: 'user' | 'group' | 'computer'; id: string; tab?: string }

export type ActionDialog =
  | { t: 'newUser'; ou: string; template?: string }
  | { t: 'newGroup'; ou: string }
  | { t: 'reset'; sam: string }
  | { t: 'move'; kind: 'user' | 'computer' | 'group'; id: string }
  | { t: 'deleteUser'; sam: string }
  | { t: 'computerReset'; name: string }
  | { t: 'bitlocker' }
  | { t: 'domain' }

export interface AdCtxValue {
  openProps: (p: PropsTarget) => void
  openAction: (d: ActionDialog) => void
  showOu: (dn: string) => void
}

export const AdCtx = createContext<AdCtxValue>({ openProps: () => {}, openAction: () => {}, showOu: () => {} })
export const useAdCtx = () => useContext(AdCtx)

// ─────────────── Icons ───────────────

export function ObjIcon({ kind, variant, disabled, locked, size = 16, open }: { kind: DirKind; variant?: DirEntry['variant']; disabled?: boolean; locked?: boolean; size?: number; open?: boolean }) {
  let icon: ReactNode
  if (kind === 'user') icon = variant === 'service' ? <UserCog size={size} className="text-slate-600" /> : <User size={size} className="text-sky-700" />
  else if (kind === 'group') icon = <Users size={size} className="text-violet-700" />
  else if (kind === 'computer') icon = variant === 'server' ? <Server size={size} className="text-slate-700" /> : variant === 'notebook' ? <Laptop size={size} className="text-slate-700" /> : <Monitor size={size} className="text-slate-700" />
  else if (variant === 'domain') icon = <Building2 size={size} className="text-sky-700" />
  else if (variant === 'container') icon = <Folder size={size} className="text-slate-400" />
  else icon = open ? <FolderOpen size={size} className="text-amber-500" /> : <Folder size={size} className="fill-amber-100 text-amber-500" />
  return (
    <span className="relative inline-flex shrink-0">
      {icon}
      {disabled && (
        <span className="absolute -right-1 -bottom-1 rounded-full bg-white" title="Deaktiviert">
          <Ban size={Math.max(9, size * 0.6)} className="text-slate-600" />
        </span>
      )}
      {locked && (
        <span className="absolute -top-1 -right-1 rounded-full bg-amber-100" title="Gesperrt">
          <Lock size={Math.max(9, size * 0.6)} className="text-amber-700" />
        </span>
      )}
    </span>
  )
}

// ─────────────── Kleine Anzeige-Bausteine ───────────────

export function KV({ rows, className }: { rows: [ReactNode, ReactNode][]; className?: string }) {
  return (
    <dl className={cx('grid grid-cols-[minmax(9rem,auto)_1fr] gap-x-4 gap-y-1.5 text-sm', className)}>
      {rows.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-slate-500">{k}</dt>
          <dd className="min-w-0 break-words text-slate-800">{v === '' || v === undefined || v === null ? <span className="text-slate-400">–</span> : v}</dd>
        </div>
      ))}
    </dl>
  )
}

export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h4 className={cx('mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500', className)}>{children}</h4>
}

/** Verdeckter Wert mit "Anzeigen" (onReveal protokolliert den Zugriff) */
export function SecretValue({ value, revealed, onReveal, label = 'Anzeigen', mono = true }: { value: string; revealed: boolean; onReveal: () => void; label?: string; mono?: boolean }) {
  const toast = useStore((s) => s.toast)
  const [hidden, setHidden] = useState(false)
  if (!revealed)
    return (
      <span className="inline-flex items-center gap-2">
        <span className="font-mono tracking-widest text-slate-400">••••••••••••</span>
        <Button size="sm" icon={<Eye size={13} />} onClick={onReveal}>
          {label}
        </Button>
      </span>
    )
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className={cx('rounded bg-amber-50 px-1.5 py-0.5 text-slate-900 ring-1 ring-amber-200', mono && 'font-mono')}>{hidden ? '••••••••••••' : value}</span>
      <button type="button" className="text-slate-500 hover:text-slate-800" title={hidden ? 'Einblenden' : 'Ausblenden'} onClick={() => setHidden((h) => !h)}>
        {hidden ? <Eye size={14} /> : <EyeOff size={14} />}
      </button>
      <button
        type="button"
        className="text-slate-500 hover:text-slate-800"
        title="In Zwischenablage kopieren"
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(
            () => toast('In die Zwischenablage kopiert.', 'info'),
            () => toast('Kopieren nicht möglich.', 'warning'),
          )
        }}
      >
        <Copy size={14} />
      </button>
    </span>
  )
}

export function Warn({ children, tone = 'amber' }: { children: ReactNode; tone?: 'amber' | 'red' | 'sky' }) {
  const cls = { amber: 'border-amber-300 bg-amber-50 text-amber-900', red: 'border-rose-300 bg-rose-50 text-rose-900', sky: 'border-sky-200 bg-sky-50 text-sky-900' }[tone]
  return <div className={cx('flex items-start gap-2 rounded-md border px-3 py-2 text-sm', cls)}>{children}</div>
}

// ─────────────── Bestätigung ───────────────

export function ConfirmDialog({ title, children, confirmLabel = 'Ja', danger, onConfirm, onClose }: { title: ReactNode; children: ReactNode; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-slate-700">{children}</div>
    </Modal>
  )
}

/** Bestätigung bei privilegierten Gruppen ("Nur mit Freigabe der IT-Leitung!") */
export function usePrivilegedGuard() {
  const [pending, setPending] = useState<{ group: string; member: string; go: () => void } | null>(null)
  const guard = useCallback((group: string, member: string, go: () => void) => {
    if (isPrivilegedGroup(group)) setPending({ group, member, go })
    else go()
  }, [])
  const dialog = pending ? (
    <ConfirmDialog title="Privilegierte Gruppe" confirmLabel="Trotzdem hinzufügen" danger onConfirm={pending.go} onClose={() => setPending(null)}>
      <Warn tone="red">
        <ShieldAlert size={18} className="mt-0.5 shrink-0" />
        <div>
          <strong>Nur mit Freigabe der IT-Leitung!</strong>
          <p className="mt-1">
            „{pending.member}“ soll Mitglied von <strong>{pending.group}</strong> werden. Diese Gruppe verleiht weitreichende administrative Rechte. Ohne dokumentierte Freigabe ist das ein Sicherheitsverstoß.
          </p>
        </div>
      </Warn>
      <p>Liegt eine schriftliche Freigabe vor (im Ticket dokumentiert)?</p>
    </ConfirmDialog>
  ) : null
  return { guard, dialog }
}

// ─────────────── Objekt-Auswahl ───────────────

export function PickerDialog({
  title,
  kinds,
  exclude = [],
  onPick,
  onClose,
  hint,
}: {
  title: ReactNode
  kinds: Exclude<DirKind, 'ou'>[]
  exclude?: string[]
  onPick: (e: DirEntry) => void
  onClose: () => void
  hint?: ReactNode
}) {
  const ous = useStore((s) => s.world.ous)
  const users = useStore((s) => s.world.users)
  const groups = useStore((s) => s.world.groups)
  const computers = useStore((s) => s.world.computers)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<DirEntry | null>(null)
  const excl = useMemo(() => new Set(exclude.map((x) => x.toLowerCase().replace(/\$$/, ''))), [exclude])
  const results = useMemo(() => {
    const data = { ous, users, groups, computers }
    let list: DirEntry[]
    if (q.trim()) list = searchDirectory(data, q)
    else
      list = sortEntries([
        ...(kinds.includes('user') ? users.map(userEntry) : []),
        ...(kinds.includes('group') ? groups.map(groupEntry) : []),
        ...(kinds.includes('computer') ? computers.map(computerEntry) : []),
      ])
    return list.filter((e) => e.kind !== 'ou' && kinds.includes(e.kind) && !excl.has(e.id.toLowerCase())).slice(0, 300)
  }, [q, ous, users, groups, computers, kinds, excl])
  const typeNames = kinds.map((k) => ({ user: 'Benutzer', group: 'Gruppen', computer: 'Computer' })[k]).join(', ')
  const choose = (e: DirEntry | null) => {
    if (!e) return
    onPick(e)
    onClose()
  }
  return (
    <Modal
      title={title}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" disabled={!sel} onClick={() => choose(sel)}>
            OK
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="text-xs text-slate-500">
          Objekttypen: <strong>{typeNames}</strong> · Suchbereich: <strong>musterwerk.local</strong>
        </div>
        <div className="relative">
          <Search size={15} className="absolute top-2.5 left-2.5 text-slate-400" />
          <Input autoFocus className="pl-8" placeholder="Namen eingeben (z. B. Nachname, Anmeldename, Gruppenname) …" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && results.length === 1 && choose(results[0])} />
        </div>
        {hint}
        <div className="max-h-80 overflow-auto rounded-md border border-slate-200">
          <table className={tableCls}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Typ</th>
                <th>Ordner</th>
              </tr>
            </thead>
            <tbody>
              {results.map((e) => (
                <tr
                  key={e.kind + e.id}
                  className={cx('cursor-pointer', sel?.id === e.id && sel.kind === e.kind ? 'bg-sky-100' : 'hover:bg-slate-50')}
                  onClick={() => setSel(e)}
                  onDoubleClick={() => choose(e)}
                >
                  <td>
                    <span className="flex items-center gap-2">
                      <ObjIcon kind={e.kind} variant={e.variant} disabled={e.disabled} />
                      <span>{e.name}</span>
                      {e.kind === 'user' && e.name !== e.id && <span className="text-xs text-slate-400">({e.id})</span>}
                    </span>
                  </td>
                  <td className="text-xs text-slate-500">{e.typeLabel}</td>
                  <td className="text-xs text-slate-500">{dnToPath(e.ou).split('/').slice(1).join('/')}</td>
                </tr>
              ))}
              {!results.length && (
                <tr>
                  <td colSpan={3} className="py-6 text-center text-slate-500">
                    Keine passenden Objekte gefunden.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  )
}

// ─────────────── OU-Baum (wiederverwendbar) ───────────────

export function OuTree({ selected, onSelect, expanded, onToggle, filter }: { selected: string; onSelect: (dn: string) => void; expanded: Set<string>; onToggle: (dn: string) => void; filter?: (dn: string) => boolean }) {
  const ous = useStore((s) => s.world.ous)
  const tree = useMemo(() => buildOuTree(ous), [ous])
  const render = (n: OuNode, depth: number): ReactNode => {
    const dnKey = n.ou.dn.toLowerCase()
    const isOpen = expanded.has(dnKey)
    const isSel = selected.toLowerCase() === dnKey
    const selectable = !filter || filter(n.ou.dn)
    return (
      <div key={n.ou.dn}>
        <div
          className={cx('group flex cursor-pointer items-center gap-1 rounded py-0.5 pr-2 text-sm', isSel ? 'bg-sky-100 text-sky-900' : 'hover:bg-slate-100', !selectable && 'opacity-50')}
          style={{ paddingLeft: depth * 14 + 2 }}
          onClick={() => {
            if (selectable) onSelect(n.ou.dn)
            if (!isOpen && n.children.length) onToggle(n.ou.dn)
          }}
          title={n.ou.description ?? dnToPath(n.ou.dn)}
        >
          <button
            type="button"
            className={cx('flex h-4 w-4 items-center justify-center text-slate-400', !n.children.length && 'invisible')}
            onClick={(e) => {
              e.stopPropagation()
              onToggle(n.ou.dn)
            }}
            aria-label={isOpen ? 'Zuklappen' : 'Aufklappen'}
          >
            {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          <ObjIcon kind="ou" variant={n.ou.kind === 'domain' ? 'domain' : n.ou.kind === 'container' ? 'container' : undefined} open={isOpen && n.children.length > 0} />
          <span className="truncate">{n.ou.name}</span>
        </div>
        {isOpen && n.children.map((c) => render(c, depth + 1))}
      </div>
    )
  }
  return <div className="select-none">{tree.map((n) => render(n, 0))}</div>
}

/** Auswahl einer Ziel-OU (Verschieben, Neuer Benutzer) */
export function OuPickerDialog({ title, initial, onPick, onClose, filter, okLabel = 'OK' }: { title: ReactNode; initial?: string; onPick: (dn: string) => void; onClose: () => void; filter?: (dn: string) => boolean; okLabel?: string }) {
  const domainDn = useStore((s) => s.world.domain.baseDn)
  const [sel, setSel] = useState(initial ?? '')
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const s = new Set<string>([domainDn.toLowerCase()])
    let p = initial ?? ''
    while (p) {
      s.add(p.toLowerCase())
      const i = p.indexOf(',')
      p = i < 0 ? '' : p.slice(i + 1)
    }
    return s
  })
  const toggle = (dn: string) =>
    setExpanded((prev) => {
      const n = new Set(prev)
      const k = dn.toLowerCase()
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })
  return (
    <Modal
      title={title}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button
            variant="primary"
            disabled={!sel || (filter && !filter(sel))}
            onClick={() => {
              onPick(sel)
              onClose()
            }}
          >
            {okLabel}
          </Button>
        </>
      }
    >
      <div className="max-h-96 overflow-auto rounded-md border border-slate-200 p-2">
        <OuTree selected={sel} onSelect={setSel} expanded={expanded} onToggle={toggle} filter={filter} />
      </div>
      {sel && <div className="mt-2 truncate text-xs text-slate-500">Ziel: {dnToPath(sel)}</div>}
    </Modal>
  )
}

// ─────────────── Kontext-/Dropdown-Menü ───────────────

export interface MenuItem {
  label: string
  icon?: ReactNode
  onClick: () => void
  danger?: boolean
  disabled?: boolean
  separatorBefore?: boolean
  bold?: boolean
}

export function MenuList({ items, onDone }: { items: MenuItem[]; onDone: () => void }) {
  return (
    <div className="min-w-52 rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg" role="menu">
      {items.map((it, i) => (
        <div key={i}>
          {it.separatorBefore && <div className="my-1 border-t border-slate-100" />}
          <button
            type="button"
            role="menuitem"
            disabled={it.disabled}
            className={cx('flex w-full items-center gap-2 px-3 py-1.5 text-left disabled:opacity-40', it.danger ? 'text-rose-700 hover:bg-rose-50' : 'text-slate-700 hover:bg-slate-100', it.bold && 'font-semibold')}
            onClick={() => {
              onDone()
              it.onClick()
            }}
          >
            <span className="flex w-4 justify-center">{it.icon}</span>
            {it.label}
          </button>
        </div>
      ))}
    </div>
  )
}

export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })
  useEffect(() => {
    const el = ref.current
    if (el) {
      const r = el.getBoundingClientRect()
      setPos({ x: Math.min(x, window.innerWidth - r.width - 8), y: Math.min(y, window.innerHeight - r.height - 8) })
    }
    const close = (e: Event) => {
      if (e.type === 'keydown' && (e as KeyboardEvent).key !== 'Escape') return
      if (e.type === 'mousedown' && ref.current?.contains(e.target as Node)) return
      onClose()
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', close)
    window.addEventListener('resize', close)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', close)
      window.removeEventListener('resize', close)
      window.removeEventListener('blur', close)
    }
  }, [x, y, onClose])
  return (
    <div ref={ref} className="fixed z-[70]" style={{ left: pos.x, top: pos.y }}>
      <MenuList items={items} onDone={onClose} />
    </div>
  )
}

/** Button mit aufklappendem Menü */
export function DropdownButton({ label, icon, items, variant = 'secondary' }: { label: ReactNode; icon?: ReactNode; items: MenuItem[]; variant?: 'primary' | 'secondary' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])
  return (
    <div className="relative" ref={ref}>
      <Button variant={variant} icon={icon} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        {label}
        <ChevronDown size={14} />
      </Button>
      {open && (
        <div className="absolute top-full left-0 z-40 mt-1">
          <MenuList items={items} onDone={() => setOpen(false)} />
        </div>
      )}
    </div>
  )
}
