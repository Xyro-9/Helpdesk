// Gemeinsame Active-Directory-Operationen.
// Werden von der AD-Konsole, der Admin-PowerShell und den Szenarien gleichermaßen genutzt,
// damit alle Wege denselben Weltzustand erzeugen.

import type { AdComputer, AdGroup, AdUser, WinEvent, World } from '../types'
import { checkPasswordPolicy, nowIso, uid } from '../util'

// ─────────────── Lesen ───────────────

export const findUser = (w: World, q: string): AdUser | undefined => {
  const s = q.trim().toLowerCase().replace(/^musterwerk\\/, '')
  return w.users.find((u) => u.sam.toLowerCase() === s || u.upn.toLowerCase() === s || u.mail.toLowerCase() === s || u.displayName.toLowerCase() === s)
}

export const findGroup = (w: World, name: string): AdGroup | undefined => w.groups.find((g) => g.name.toLowerCase() === name.trim().toLowerCase())

export const findComputer = (w: World, name: string): AdComputer | undefined => {
  const s = name.trim().toLowerCase().replace(/\$$/, '').replace(/\.musterwerk\.local$/, '')
  return w.computers.find((c) => c.name.toLowerCase() === s)
}

/** Direkte Gruppenmitgliedschaften (Gruppennamen) eines Benutzers, Computers oder einer Gruppe */
export const directGroupsOf = (w: World, member: string): string[] =>
  w.groups.filter((g) => g.members.some((m) => m.toLowerCase() === member.toLowerCase())).map((g) => g.name)

/** Effektive (verschachtelte) Gruppenmitgliedschaften */
export function effectiveGroupsOf(w: World, member: string): string[] {
  const result = new Set<string>()
  const queue = [member]
  while (queue.length) {
    const m = queue.shift()!
    for (const g of directGroupsOf(w, m)) {
      if (!result.has(g)) {
        result.add(g)
        queue.push(g)
      }
    }
  }
  return [...result]
}

export const isMemberOf = (w: World, member: string, group: string, nested = true) =>
  (nested ? effectiveGroupsOf(w, member) : directGroupsOf(w, member)).some((g) => g.toLowerCase() === group.toLowerCase())

/** Alle Benutzer (aufgelöst), die effektiv Mitglied einer Gruppe sind */
export function effectiveUserMembers(w: World, group: string): string[] {
  const g = findGroup(w, group)
  if (!g) return []
  const out = new Set<string>()
  const seen = new Set<string>()
  const walk = (grp: AdGroup) => {
    if (seen.has(grp.name)) return
    seen.add(grp.name)
    for (const m of grp.members) {
      const sub = findGroup(w, m)
      if (sub) walk(sub)
      else if (findUser(w, m)) out.add(m)
    }
  }
  walk(g)
  return [...out]
}

export const primaryComputerOf = (w: World, sam: string): AdComputer | undefined => w.computers.find((c) => c.managedBy === sam && c.enabled) ?? w.computers.find((c) => c.managedBy === sam)

export const managerOf = (w: World, sam: string) => {
  const u = findUser(w, sam)
  return u?.manager ? findUser(w, u.manager) : undefined
}

export const ouName = (dn: string) => dn.split(',')[0].replace(/^(OU|CN|DC)=/, '')

/** Lesbarer Pfad "musterwerk.local/Musterwerk/Benutzer/Vertrieb" */
export function ouPath(dn: string) {
  const parts = dn.split(',')
  const dcs = parts.filter((p) => p.startsWith('DC=')).map((p) => p.slice(3))
  const rest = parts.filter((p) => !p.startsWith('DC=')).map((p) => p.slice(3)).reverse()
  return [dcs.join('.'), ...rest].join('/')
}

// ─────────────── DC-Sicherheitsprotokoll ───────────────

export function dcEvent(w: World, eventId: number, message: string, level: WinEvent['level'] = 'Überprüfung erfolgreich', task = 'Benutzerkontenverwaltung') {
  const dc = w.infra.servers.find((s) => s.name === 'DC01')
  if (!dc) return
  dc.events.unshift({ id: uid('ev'), log: 'Sicherheit', eventId, level, source: 'Microsoft-Windows-Security-Auditing', time: nowIso(), message, computer: 'DC01.musterwerk.local', task })
  if (dc.events.length > 400) dc.events.length = 400
}

const actor = (w: World) => `MUSTERWERK\\${w.tech.sam}`

// ─────────────── Schreiben ───────────────

export function touchUser(u: AdUser) {
  u.modified = nowIso()
}

export function unlockUser(w: World, sam: string): string | null {
  const u = findUser(w, sam)
  if (!u) return 'Benutzer nicht gefunden.'
  u.lockedOut = false
  u.badPwdCount = 0
  u.lockoutTime = undefined
  touchUser(u)
  dcEvent(w, 4767, `Ein Benutzerkonto wurde entsperrt.\n\nAntragsteller: ${actor(w)}\nZielkonto: MUSTERWERK\\${u.sam}`)
  return null
}

export function lockUser(w: World, sam: string, source: string, failures = 5) {
  const u = findUser(w, sam)
  if (!u) return
  u.lockedOut = true
  u.badPwdCount = failures
  u.lockoutTime = nowIso()
  u.lockoutSource = source
  for (let i = 0; i < Math.min(failures, 3); i++)
    dcEvent(w, 4625, `Fehler beim Anmelden eines Kontos.\n\nKontoname: ${u.sam}\nFehlerursache: Unbekannter Benutzername oder ungültiges Kennwort.\nArbeitsstationsname: ${source}\nQuellnetzwerkadresse: -`, 'Überprüfung fehlgeschlagen', 'Anmelden')
  dcEvent(w, 4740, `Ein Benutzerkonto wurde gesperrt.\n\nGesperrtes Konto: MUSTERWERK\\${u.sam}\nAufrufername des Computers: ${source}`)
}

export interface ResetPasswordOpts {
  mustChange?: boolean
  unlock?: boolean
  /** Richtlinie ignorieren (z.B. Szenario-Setup) */
  skipPolicy?: boolean
}

export function resetPassword(w: World, sam: string, password: string, opts: ResetPasswordOpts = {}): string | null {
  const u = findUser(w, sam)
  if (!u) return 'Benutzer nicht gefunden.'
  if (!opts.skipPolicy) {
    const err = checkPasswordPolicy(password, w.domain.minPasswordLength, w.domain.complexity, u.sam)
    if (err) return err
  }
  u.password = password
  u.pwdLastSet = nowIso()
  u.passwordExpired = false
  u.mustChangePassword = !!opts.mustChange
  if (opts.unlock) {
    u.lockedOut = false
    u.badPwdCount = 0
    u.lockoutTime = undefined
  }
  touchUser(u)
  dcEvent(w, 4724, `Es wurde versucht, das Kennwort eines Kontos zurückzusetzen.\n\nAntragsteller: ${actor(w)}\nZielkonto: MUSTERWERK\\${u.sam}`)
  // Kennwort-Hash-Synchronisierung in die Cloud (sofort)
  const cu = w.cloud.users.find((c) => c.sam === u.sam)
  if (cu) cu.lastPasswordChange = u.pwdLastSet
  return null
}

export function setUserEnabled(w: World, sam: string, enabled: boolean): string | null {
  const u = findUser(w, sam)
  if (!u) return 'Benutzer nicht gefunden.'
  u.enabled = enabled
  touchUser(u)
  dcEvent(w, enabled ? 4722 : 4725, `Ein Benutzerkonto wurde ${enabled ? 'aktiviert' : 'deaktiviert'}.\n\nAntragsteller: ${actor(w)}\nZielkonto: MUSTERWERK\\${u.sam}`)
  return null
}

export function updateUser(w: World, sam: string, patch: Partial<AdUser>): string | null {
  const u = findUser(w, sam)
  if (!u) return 'Benutzer nicht gefunden.'
  Object.assign(u, patch)
  if (patch.givenName !== undefined || patch.surname !== undefined) {
    if (!patch.displayName) u.displayName = `${u.givenName} ${u.surname}`.trim()
  }
  touchUser(u)
  dcEvent(w, 4738, `Ein Benutzerkonto wurde geändert.\n\nAntragsteller: ${actor(w)}\nZielkonto: MUSTERWERK\\${u.sam}\nGeänderte Attribute: ${Object.keys(patch).join(', ')}`)
  return null
}

export function moveObject(w: World, kind: 'user' | 'computer' | 'group', name: string, targetOu: string): string | null {
  if (!w.ous.some((o) => o.dn === targetOu)) return 'Ziel-OU existiert nicht.'
  if (kind === 'user') {
    const u = findUser(w, name)
    if (!u) return 'Benutzer nicht gefunden.'
    u.ou = targetOu
    touchUser(u)
  } else if (kind === 'computer') {
    const c = findComputer(w, name)
    if (!c) return 'Computer nicht gefunden.'
    c.ou = targetOu
  } else {
    const g = findGroup(w, name)
    if (!g) return 'Gruppe nicht gefunden.'
    g.ou = targetOu
  }
  return null
}

export function addGroupMember(w: World, group: string, member: string): string | null {
  const g = findGroup(w, group)
  if (!g) return `Gruppe "${group}" nicht gefunden.`
  const exists = findUser(w, member) || findGroup(w, member) || findComputer(w, member)
  if (!exists) return `Objekt "${member}" nicht gefunden.`
  const canonical = findUser(w, member)?.sam ?? findGroup(w, member)?.name ?? `${findComputer(w, member)!.name}$`
  if (g.members.some((m) => m.toLowerCase() === canonical.toLowerCase())) return `"${canonical}" ist bereits Mitglied von "${g.name}".`
  if (canonical.toLowerCase() === g.name.toLowerCase()) return 'Eine Gruppe kann nicht Mitglied von sich selbst sein.'
  g.members.push(canonical)
  dcEvent(w, g.scope === 'Global' ? 4728 : g.scope === 'Universal' ? 4756 : 4732, `Ein Mitglied wurde einer sicherheitsaktivierten Gruppe hinzugefügt.\n\nAntragsteller: ${actor(w)}\nMitglied: ${canonical}\nGruppe: ${g.name}`)
  return null
}

export function removeGroupMember(w: World, group: string, member: string): string | null {
  const g = findGroup(w, group)
  if (!g) return `Gruppe "${group}" nicht gefunden.`
  const idx = g.members.findIndex((m) => m.toLowerCase() === member.toLowerCase() || m.toLowerCase() === `${member.toLowerCase()}$`)
  if (idx < 0) return `"${member}" ist kein Mitglied von "${g.name}".`
  const [removed] = g.members.splice(idx, 1)
  dcEvent(w, g.scope === 'Global' ? 4729 : g.scope === 'Universal' ? 4757 : 4733, `Ein Mitglied wurde aus einer sicherheitsaktivierten Gruppe entfernt.\n\nAntragsteller: ${actor(w)}\nMitglied: ${removed}\nGruppe: ${g.name}`)
  return null
}

export interface NewUserInput {
  givenName: string
  surname: string
  sam: string
  password: string
  ou: string
  mustChangePassword?: boolean
  enabled?: boolean
  department?: string
  title?: string
  office?: string
  phone?: string
  manager?: string
  employeeId?: string
  birthDate?: string
  description?: string
  homeOffice?: boolean
  homeAddress?: AdUser['homeAddress']
}

export function createUser(w: World, input: NewUserInput): string | null {
  const sam = input.sam.trim().toLowerCase()
  if (!/^[a-z0-9._-]{2,20}$/.test(sam)) return 'Ungültiger Anmeldename (Prä-Windows-2000): nur a-z, 0-9, Punkt, Bindestrich, max. 20 Zeichen.'
  if (findUser(w, sam)) return `Ein Objekt mit dem Namen "${sam}" ist bereits vorhanden.`
  const err = checkPasswordPolicy(input.password, w.domain.minPasswordLength, w.domain.complexity, sam)
  if (err) return err
  const now = nowIso()
  const u: AdUser = {
    sam,
    givenName: input.givenName,
    surname: input.surname,
    displayName: `${input.givenName} ${input.surname}`.trim(),
    upn: `${sam}@${w.domain.upnSuffix}`,
    mail: `${sam}@${w.domain.upnSuffix}`,
    employeeId: input.employeeId ?? '',
    birthDate: input.birthDate ?? '',
    department: input.department ?? '',
    title: input.title ?? '',
    company: 'Musterwerk AG',
    office: input.office ?? '',
    phone: input.phone ?? '',
    manager: input.manager,
    ou: input.ou,
    enabled: input.enabled ?? true,
    lockedOut: false,
    badPwdCount: 0,
    password: input.password,
    pwdLastSet: now,
    passwordExpired: false,
    mustChangePassword: input.mustChangePassword ?? true,
    passwordNeverExpires: false,
    cannotChangePassword: false,
    description: input.description,
    homeDrive: 'H:',
    homeDirectory: `\\\\FS01\\home$\\${sam}`,
    homeOffice: !!input.homeOffice,
    homeAddress: input.homeAddress,
    created: now,
    modified: now,
  }
  w.users.push(u)
  const du = findGroup(w, 'Domänen-Benutzer')
  if (du && !du.members.includes(sam)) du.members.push(sam)
  dcEvent(w, 4720, `Ein Benutzerkonto wurde erstellt.\n\nAntragsteller: ${actor(w)}\nNeues Konto: MUSTERWERK\\${sam}`)
  return null
}

/** Gruppenmitgliedschaften (ohne Standardgruppen) von einem Vorlagenbenutzer kopieren */
export function copyGroupsFrom(w: World, templateSam: string, targetSam: string): string[] {
  const added: string[] = []
  for (const g of directGroupsOf(w, templateSam)) {
    if (g === 'Domänen-Benutzer') continue
    if (!addGroupMember(w, g, targetSam)) added.push(g)
  }
  return added
}

export function deleteUser(w: World, sam: string): string | null {
  const idx = w.users.findIndex((u) => u.sam === sam)
  if (idx < 0) return 'Benutzer nicht gefunden.'
  w.users.splice(idx, 1)
  for (const g of w.groups) g.members = g.members.filter((m) => m !== sam)
  dcEvent(w, 4726, `Ein Benutzerkonto wurde gelöscht.\n\nAntragsteller: ${actor(w)}\nZielkonto: MUSTERWERK\\${sam}`)
  return null
}

export function createGroup(w: World, g: Omit<AdGroup, 'members'> & { members?: string[] }): string | null {
  if (findGroup(w, g.name)) return 'Gruppe existiert bereits.'
  w.groups.push({ ...g, members: g.members ?? [] })
  dcEvent(w, 4727, `Eine sicherheitsaktivierte Gruppe wurde erstellt.\n\nAntragsteller: ${actor(w)}\nGruppe: ${g.name}`)
  return null
}

/** Computerkonto zurücksetzen (bricht die Vertrauensstellung, bis der Client neu beitritt / repariert wird) */
export function resetComputerAccount(w: World, name: string): string | null {
  const c = findComputer(w, name)
  if (!c) return 'Computer nicht gefunden.'
  c.secureChannelBroken = true
  dcEvent(w, 4742, `Ein Computerkonto wurde geändert (Kennwort zurückgesetzt).\n\nAntragsteller: ${actor(w)}\nComputer: ${c.name}$`)
  return null
}

export function setComputerEnabled(w: World, name: string, enabled: boolean): string | null {
  const c = findComputer(w, name)
  if (!c) return 'Computer nicht gefunden.'
  c.enabled = enabled
  dcEvent(w, 4742, `Ein Computerkonto wurde ${enabled ? 'aktiviert' : 'deaktiviert'}.\n\nAntragsteller: ${actor(w)}\nComputer: ${c.name}$`)
  return null
}
