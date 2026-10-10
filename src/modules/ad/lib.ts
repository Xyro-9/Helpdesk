// Reine Hilfsfunktionen der AD-Konsole (ohne React) – testbar mit Vitest.

import type { AdComputer, AdGroup, AdOu, AdUser } from '@/core/types'

// ─────────────── OU-Hierarchie ───────────────

/** DN des übergeordneten Containers ("OU=Vertrieb,OU=Benutzer,DC=x" → "OU=Benutzer,DC=x") */
export function parentDn(dn: string): string {
  const idx = dn.indexOf(',')
  return idx < 0 ? '' : dn.slice(idx + 1)
}

export interface OuNode {
  ou: AdOu
  children: OuNode[]
}

const ouSortKey = (o: AdOu) => `${o.kind === 'container' ? '1' : '0'}${o.name.toLowerCase()}`

/** Baut aus der flachen OU-Liste einen Baum (Wurzel = Domäne). OUs ohne bekannten Elternknoten hängen an der Wurzel. */
export function buildOuTree(ous: readonly AdOu[]): OuNode[] {
  const byDn = new Map<string, OuNode>()
  for (const o of ous) byDn.set(o.dn.toLowerCase(), { ou: o, children: [] })
  const roots: OuNode[] = []
  for (const node of byDn.values()) {
    const parent = byDn.get(parentDn(node.ou.dn).toLowerCase())
    if (parent && parent !== node) parent.children.push(node)
    else roots.push(node)
  }
  const sortRec = (list: OuNode[]) => {
    list.sort((a, b) => ouSortKey(a.ou).localeCompare(ouSortKey(b.ou), 'de'))
    list.forEach((n) => sortRec(n.children))
  }
  sortRec(roots)
  return roots
}

/** Alle Vorfahren-DNs eines DN (ohne den DN selbst), vom nächsten zum entferntesten */
export function ancestorDns(dn: string): string[] {
  const out: string[] = []
  let p = parentDn(dn)
  while (p) {
    out.push(p)
    p = parentDn(p)
  }
  return out
}

// ─────────────── Objektliste / Suche ───────────────

export type DirKind = 'ou' | 'user' | 'group' | 'computer'

export interface DirEntry {
  kind: DirKind
  /** sam / Gruppenname / Computername / DN */
  id: string
  name: string
  typeLabel: string
  description: string
  ou: string
  disabled?: boolean
  locked?: boolean
  /** Zusatz für Computer (Notebook/Server) */
  variant?: 'notebook' | 'server' | 'desktop' | 'service' | 'container' | 'domain'
}

export interface DirData {
  ous: readonly AdOu[]
  users: readonly AdUser[]
  groups: readonly AdGroup[]
  computers: readonly AdComputer[]
}

export const groupTypeLabel = (g: AdGroup) => `${g.type === 'Sicherheit' ? 'Sicherheitsgruppe' : 'Verteilergruppe'} – ${g.scope}`

export function computerVariant(c: AdComputer): DirEntry['variant'] {
  if (/server/i.test(c.os)) return 'server'
  if (c.name.startsWith('NB-')) return 'notebook'
  return 'desktop'
}

export const userEntry = (u: AdUser): DirEntry => ({
  kind: 'user',
  id: u.sam,
  name: u.displayName || u.sam,
  typeLabel: u.isServiceAccount ? 'Benutzer (Dienstkonto)' : 'Benutzer',
  description: u.description ?? (u.title ? `${u.title}${u.department ? ' – ' + u.department : ''}` : ''),
  ou: u.ou,
  disabled: !u.enabled,
  locked: u.lockedOut,
  variant: u.isServiceAccount ? 'service' : undefined,
})

export const groupEntry = (g: AdGroup): DirEntry => ({ kind: 'group', id: g.name, name: g.name, typeLabel: groupTypeLabel(g), description: g.description, ou: g.ou })

export const computerEntry = (c: AdComputer): DirEntry => ({
  kind: 'computer',
  id: c.name,
  name: c.name,
  typeLabel: 'Computer',
  description: c.description ?? '',
  ou: c.ou,
  disabled: !c.enabled,
  variant: computerVariant(c),
})

export const ouEntry = (o: AdOu): DirEntry => ({
  kind: 'ou',
  id: o.dn,
  name: o.name,
  typeLabel: o.kind === 'container' ? 'Container' : o.kind === 'domain' ? 'Domäne' : 'Organisationseinheit',
  description: o.description ?? '',
  ou: parentDn(o.dn),
  variant: o.kind === 'container' ? 'container' : o.kind === 'domain' ? 'domain' : undefined,
})

const kindOrder: Record<DirKind, number> = { ou: 0, user: 1, group: 2, computer: 3 }

export function sortEntries(list: DirEntry[]): DirEntry[] {
  return list.sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind] || a.name.localeCompare(b.name, 'de'))
}

/** Inhalt eines Containers: untergeordnete OUs + Benutzer, Gruppen, Computer */
export function listContainer(d: DirData, dn: string): DirEntry[] {
  const key = dn.toLowerCase()
  const out: DirEntry[] = []
  for (const o of d.ous) if (parentDn(o.dn).toLowerCase() === key && o.dn.toLowerCase() !== key) out.push(ouEntry(o))
  for (const u of d.users) if (u.ou.toLowerCase() === key) out.push(userEntry(u))
  for (const g of d.groups) if (g.ou.toLowerCase() === key) out.push(groupEntry(g))
  for (const c of d.computers) if (c.ou.toLowerCase() === key) out.push(computerEntry(c))
  return sortEntries(out)
}

/** Vereinheitlicht Text für die Suche (Groß/klein, Umlaute, Leerzeichen in Telefonnummern) */
export function foldSearch(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

const digitsOnly = (s: string) => s.replace(/\D/g, '')

/** Domänenweite Suche: Name, Anmeldename, UPN/Mail, Personalnummer, Telefon/Mobil, Computername, Gruppenname */
export function searchDirectory(d: DirData, query: string): DirEntry[] {
  const q = foldSearch(query.trim())
  if (!q) return []
  const qDigits = digitsOnly(query)
  const matchText = (...vals: (string | undefined)[]) => vals.some((v) => !!v && foldSearch(v).includes(q))
  const matchPhone = (...vals: (string | undefined)[]) => qDigits.length >= 3 && vals.some((v) => !!v && digitsOnly(v).includes(qDigits))
  const out: DirEntry[] = []
  for (const u of d.users) {
    if (matchText(u.displayName, u.sam, u.upn, u.mail, u.givenName, u.surname, `${u.surname} ${u.givenName}`, u.employeeId, u.department) || matchPhone(u.phone, u.mobile) || (qDigits.length >= 3 && u.employeeId === qDigits))
      out.push(userEntry(u))
  }
  for (const g of d.groups) if (matchText(g.name, g.description, g.mail)) out.push(groupEntry(g))
  for (const c of d.computers) if (matchText(c.name, c.dnsHostName, c.description, c.location)) out.push(computerEntry(c))
  return sortEntries(out)
}

// ─────────────── Benutzer anlegen ───────────────

/** Anmeldename-Vorschlag "v.nachname" (Umlaute ersetzen, Akzente entfernen, max. 20 Zeichen) */
export function suggestSam(given: string, surname: string): string {
  const clean = (s: string) => foldSearch(s).replace(/[^a-z0-9-]/g, '')
  const g = clean(given)
  const s = clean(surname)
  if (!g && !s) return ''
  if (!g) return s.slice(0, 20)
  if (!s) return g.slice(0, 20)
  return `${g[0]}.${s}`.slice(0, 20)
}

/** Erzeugt ein Kennwort, das die Domänenrichtlinie erfüllt (4 Zeichenklassen, ohne Teile des Anmeldenamens) */
export function generatePassword(minLength = 12, rand: () => number = Math.random): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower = 'abcdefghijkmnpqrstuvwxyz'
  const digits = '23456789'
  const symbols = '!?#%+-=*'
  const all = upper + lower + digits + symbols
  const len = Math.max(12, minLength)
  const pickFrom = (set: string) => set[Math.floor(rand() * set.length) % set.length]
  const chars = [pickFrom(upper), pickFrom(lower), pickFrom(digits), pickFrom(symbols)]
  while (chars.length < len) chars.push(pickFrom(all))
  // Fisher-Yates
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1)) % (i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

// ─────────────── Bearbeiten ───────────────

/** Ermittelt geänderte Felder zwischen Original und Entwurf (flacher Vergleich, Objekte per JSON) */
export function diffObject<T extends object>(orig: T, draft: T, keys: readonly (keyof T)[]): Partial<T> {
  const patch: Partial<T> = {}
  for (const k of keys) {
    const a = orig[k]
    const b = draft[k]
    const same = typeof a === 'object' || typeof b === 'object' ? JSON.stringify(a ?? null) === JSON.stringify(b ?? null) : (a ?? '') === (b ?? '')
    if (!same) patch[k] = b
  }
  return patch
}

/** Gruppen, deren Änderung nur mit Freigabe der IT-Leitung erfolgen darf */
export const PRIVILEGED_GROUPS = ['domänen-admins', 'organisations-admins', 'gg_lokale_admins', 'administratoren', 'schema-admins']
export const isPrivilegedGroup = (name: string) => PRIVILEGED_GROUPS.includes(name.trim().toLowerCase())

/** userAccountControl als lesbare Flags (für den Attribut-Editor) */
export function uacFlags(u: AdUser): string {
  const flags: string[] = []
  if (!u.enabled) flags.push('ACCOUNTDISABLE')
  if (u.lockedOut) flags.push('LOCKOUT')
  if (u.cannotChangePassword) flags.push('PASSWD_CANT_CHANGE')
  flags.push('NORMAL_ACCOUNT')
  if (u.passwordNeverExpires) flags.push('DONT_EXPIRE_PASSWORD')
  if (u.passwordExpired) flags.push('PASSWORD_EXPIRED')
  let value = 0x200
  if (!u.enabled) value |= 0x2
  if (u.lockedOut) value |= 0x10
  if (u.cannotChangePassword) value |= 0x40
  if (u.passwordNeverExpires) value |= 0x10000
  if (u.passwordExpired) value |= 0x800000
  return `0x${value.toString(16)} = (${flags.join(' | ')})`
}

/** Abgeleiteter Kennwortstatus für die Anzeige */
export function passwordState(u: AdUser, maxAgeDays: number): { label: string; tone: 'green' | 'amber' | 'red' | 'gray' } {
  if (u.mustChangePassword) return { label: 'Muss bei nächster Anmeldung geändert werden', tone: 'amber' }
  if (u.passwordExpired) return { label: 'Abgelaufen', tone: 'red' }
  if (u.passwordNeverExpires) return { label: 'Läuft nie ab', tone: 'gray' }
  const age = (Date.now() - new Date(u.pwdLastSet).getTime()) / 86_400_000
  const left = Math.round(maxAgeDays - age)
  if (left <= 0) return { label: 'Abgelaufen', tone: 'red' }
  if (left <= 7) return { label: `Läuft in ${left} Tag(en) ab`, tone: 'amber' }
  return { label: `Gültig (noch ${left} Tage)`, tone: 'green' }
}

/** Kurzer DN-Anzeigename: "musterwerk.local/Musterwerk/Benutzer" */
export function dnToPath(dn: string): string {
  const parts = dn.split(',')
  const dcs = parts.filter((p) => /^DC=/i.test(p)).map((p) => p.slice(3))
  const rest = parts.filter((p) => !/^DC=/i.test(p)).map((p) => p.replace(/^(OU|CN)=/i, '')).reverse()
  return [dcs.join('.'), ...rest].join('/')
}

/** Ist der Container für Benutzerkonten geeignet? (nicht Domäne/Domain Controllers) */
export const isUserContainer = (o: AdOu) => o.kind !== 'domain' && !/^OU=Domain Controllers/i.test(o.dn)

/** Maskiert eine Personalnummer/ein Datum für die Listenanzeige */
export const maskSecret = (s: string) => (s ? '•'.repeat(Math.min(12, Math.max(6, s.length))) : '–')

/** "1984-03-07" → "07.03.1984" (ohne Zeitzonen-Verschiebung) */
export function fmtYmd(ymd?: string): string {
  if (!ymd) return '–'
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}.${m[2]}.${m[1]}` : ymd
}
