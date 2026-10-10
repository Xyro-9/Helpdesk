// ActiveDirectory- und Sync-Cmdlets (nur Admin-Arbeitsplatz IT-ADM-01)

import { A } from '@/core/actions'
import { addGroupMember, createUser, directGroupsOf, effectiveUserMembers, findComputer, findGroup, findUser, moveObject, removeGroupMember, resetPassword, setComputerEnabled, setUserEnabled, unlockUser, updateUser } from '@/core/ops/ad'
import { syncCloud } from '@/core/ops/cloud'
import { OU } from '@/core/seed/company'
import type { AdComputer, AdGroup, AdUser } from '@/core/types'
import { hashString } from '@/core/util'
import { sid } from './sys'
import { act, arg, argOrPos, boolArg, fmtDT, has, isObj, list, obj, psArgs, psError, wildToRe, type Env, type Handler, type Rec } from './shell'

const BASE = 'DC=musterwerk,DC=local'
const guid = (s: string) => {
  const h = (n: number) => (hashString(s + n) >>> 0).toString(16).padStart(8, '0')
  return `${h(1)}-${h(2).slice(0, 4)}-${h(3).slice(0, 4)}-${h(4).slice(0, 4)}-${h(5)}${h(6).slice(0, 4)}`
}
const userDn = (u: AdUser) => `CN=${u.displayName},${u.ou}`
const groupDn = (g: AdGroup) => `CN=${g.name},${g.ou}`
const compDn = (c: AdComputer) => `CN=${c.name},${c.ou}`

const notFound = (e: Env, id: string) => psError(e, `Ein Objekt mit der Identität "${id}" wurde unter "${BASE}" nicht gefunden.`, 'ObjectNotFound')

/** Identität aus -Identity, Positionsargument, DN "CN=…" oder Pipeline */
function identity(e: Env, a: ReturnType<typeof psArgs>, ...names: string[]): string | undefined {
  const v = argOrPos(a, 0, 'identity', ...names) ?? (isObj(e.input) ? String(e.input.objs[0]?.SamAccountName ?? e.input.objs[0]?.Name ?? '') : undefined)
  return v?.replace(/^CN=([^,]+),.*$/i, '$1')
}

function inputIds(e: Env): string[] {
  return isObj(e.input) ? e.input.objs.map((o) => String(o.SamAccountName ?? o.Name ?? '')).filter(Boolean) : []
}

const ALL_USER_PROPS = ['AccountExpirationDate', 'BadLogonCount', 'CannotChangePassword', 'City', 'Company', 'Created', 'Department', 'Description', 'DisplayName', 'EmailAddress', 'EmployeeID', 'HomeDirectory', 'HomeDrive', 'LastBadPasswordAttempt', 'LastLogonDate', 'LockedOut', 'lockoutTime', 'Manager', 'MemberOf', 'MobilePhone', 'Modified', 'Office', 'OfficePhone', 'PasswordExpired', 'PasswordLastSet', 'PasswordNeverExpires', 'pwdLastSet', 'Title']

function userRec(e: Env, u: AdUser): Rec {
  const mgr = u.manager ? findUser(e.w, u.manager) : undefined
  return {
    DistinguishedName: userDn(u),
    Enabled: u.enabled,
    GivenName: u.givenName,
    Name: u.displayName,
    ObjectClass: 'user',
    ObjectGUID: guid(u.sam),
    SamAccountName: u.sam,
    SID: sid(u.sam),
    Surname: u.surname,
    UserPrincipalName: u.upn,
    AccountExpirationDate: u.accountExpires ? fmtDT(u.accountExpires) : '',
    BadLogonCount: u.badPwdCount,
    CannotChangePassword: u.cannotChangePassword,
    City: u.homeAddress?.city ?? '',
    Company: u.company,
    Created: fmtDT(u.created),
    Department: u.department,
    Description: u.description ?? '',
    DisplayName: u.displayName,
    EmailAddress: u.mail,
    EmployeeID: u.employeeId,
    HomeDirectory: u.homeDirectory ?? '',
    HomeDrive: u.homeDrive ?? '',
    LastBadPasswordAttempt: u.lockoutTime ? fmtDT(u.lockoutTime) : '',
    LastLogonDate: u.lastLogon ? fmtDT(u.lastLogon) : '',
    LockedOut: u.lockedOut,
    lockoutTime: u.lockedOut ? 133700000000000000 : 0,
    Manager: mgr ? userDn(mgr) : '',
    MemberOf: directGroupsOf(e.w, u.sam).filter((g) => g !== 'Domänen-Benutzer').map((g) => { const gg = findGroup(e.w, g); return gg ? groupDn(gg) : g }),
    MobilePhone: u.mobile ?? '',
    Modified: fmtDT(u.modified),
    Office: u.office,
    OfficePhone: u.phone,
    PasswordExpired: u.passwordExpired,
    PasswordLastSet: u.mustChangePassword ? '' : fmtDT(u.pwdLastSet),
    PasswordNeverExpires: u.passwordNeverExpires,
    pwdLastSet: u.mustChangePassword ? 0 : 134000000000000000,
    Title: u.title,
  }
}

const DEFAULT_USER = ['DistinguishedName', 'Enabled', 'GivenName', 'Name', 'ObjectClass', 'ObjectGUID', 'SamAccountName', 'SID', 'Surname', 'UserPrincipalName']

function propCols(defaults: string[], all: string[], props: string | undefined) {
  if (!props) return defaults
  const ps = list(props)
  if (ps.includes('*')) return [...defaults, ...all]
  const extra = ps.map((p) => all.find((x) => x.toLowerCase() === p.toLowerCase()) ?? p).filter((p) => !defaults.includes(p))
  return [...defaults, ...extra].sort((x, y) => x.localeCompare(y))
}

/** -Filter "Name -like '*schulz*'" / {Department -eq 'Vertrieb'} / * */
function filterFn(filter: string | undefined): ((r: Rec) => boolean) | undefined {
  if (!filter) return undefined
  const f = filter.replace(/^[{(]|[})]$/g, '').trim()
  if (f === '*') return () => true
  const conds = [...f.matchAll(/(\w+)\s+-(eq|ne|like|notlike)\s+(?:'([^']*)'|"([^"]*)"|(\$\w+|\S+))/gi)].map((m) => ({ prop: m[1], op: m[2].toLowerCase(), val: (m[3] ?? m[4] ?? m[5] ?? '').replace(/^\$true$/i, 'True').replace(/^\$false$/i, 'False') }))
  if (!conds.length) return () => false
  const or = /-or/i.test(f)
  return (r) => {
    const test = (c: (typeof conds)[number]) => {
      const key = Object.keys(r).find((k) => k.toLowerCase() === c.prop.toLowerCase())
      const raw = key ? r[key] : undefined
      const v = typeof raw === 'boolean' ? (raw ? 'True' : 'False') : String(raw ?? '')
      if (c.op === 'eq') return v.toLowerCase() === c.val.toLowerCase()
      if (c.op === 'ne') return v.toLowerCase() !== c.val.toLowerCase()
      if (c.op === 'like') return wildToRe(c.val).test(v)
      return !wildToRe(c.val).test(v)
    }
    return or ? conds.some(test) : conds.every(test)
  }
}

export const getADUser: Handler = (e, args) => {
  const a = psArgs(args)
  const cols = propCols(DEFAULT_USER, ALL_USER_PROPS, arg(a, 'properties', 'property'))
  const f = filterFn(arg(a, 'filter') ?? arg(a, 'ldapfilter')?.replace(/\(sAMAccountName=([^)]+)\)/i, "SamAccountName -like '$1'"))
  if (f) {
    const recs = e.w.users.map((u) => userRec(e, u)).filter(f)
    return obj(recs, cols, true)
  }
  const id = identity(e, a)
  if (!id) return psError(e, 'Geben Sie -Identity <sAMAccountName> oder -Filter an. Beispiel: Get-ADUser l.schulz -Properties LockedOut', 'InvalidArgument')
  const u = findUser(e.w, id)
  if (!u) return notFound(e, id)
  return obj([userRec(e, u)], cols, true)
}

export const searchADAccount: Handler = (e, args) => {
  const a = psArgs(args, ['lockedout', 'accountdisabled', 'passwordexpired', 'accountexpired', 'accountinactive', 'passwordneverexpires', 'usersonly', 'computersonly'])
  let users = e.w.users
  if (has(a, 'lockedout')) users = users.filter((u) => u.lockedOut)
  else if (has(a, 'accountdisabled')) users = users.filter((u) => !u.enabled)
  else if (has(a, 'passwordexpired')) users = users.filter((u) => u.passwordExpired)
  else if (has(a, 'passwordneverexpires')) users = users.filter((u) => u.passwordNeverExpires)
  else if (has(a, 'accountexpired')) users = users.filter((u) => u.accountExpires && u.accountExpires < new Date().toISOString())
  else if (has(a, 'accountinactive')) users = users.filter((u) => !u.lastLogon || Date.now() - new Date(u.lastLogon).getTime() > 90 * 86400000)
  else return psError(e, 'Geben Sie einen Suchparameter an, z.B. -LockedOut, -AccountDisabled, -PasswordExpired.', 'InvalidArgument')
  if (!users.length) return ''
  return obj(users.map((u) => ({ ...userRec(e, u), LastLogonDate: u.lastLogon ? fmtDT(u.lastLogon) : '' })), ['Name', 'SamAccountName', 'Enabled', 'LockedOut', 'PasswordExpired', 'LastLogonDate', 'DistinguishedName'])
}

export const unlockADAccount: Handler = (e, args) => {
  const a = psArgs(args, ['confirm', 'passthru'])
  const ids = [identity(e, a)].filter((x): x is string => !!x)
  for (const extra of inputIds(e)) if (!ids.includes(extra)) ids.push(extra)
  if (!ids.length) return psError(e, 'Der Parameter "-Identity" fehlt.', 'InvalidArgument')
  const out: string[] = []
  for (const id of ids) {
    const u = findUser(e.w, id)
    if (!u) {
      out.push(notFound(e, id))
      continue
    }
    unlockUser(e.w, u.sam)
    act(e, A.adUnlock, u.sam, 'Unlock-ADAccount')
  }
  return out.join('\n')
}

/** Kennwort aus (ConvertTo-SecureString "…" -AsPlainText -Force) oder "…" */
function parseSecure(v: string | undefined): string | undefined {
  if (!v) return undefined
  const m = v.match(/ConvertTo-SecureString\s+(?:-String\s+)?(?:"([^"]*)"|'([^']*)'|(\S+))/i)
  if (m) return m[1] ?? m[2] ?? m[3]
  if (/^\(/.test(v)) return undefined
  return v
}

export const setADAccountPassword: Handler = (e, args) => {
  const a = psArgs(args, ['reset', 'confirm', 'passthru'])
  const id = identity(e, a)
  if (!id) return psError(e, 'Der Parameter "-Identity" fehlt.', 'InvalidArgument')
  const u = findUser(e.w, id)
  if (!u) return notFound(e, id)
  if (!has(a, 'reset')) return psError(e, 'Ohne -Reset muss das alte Kennwort (-OldPassword) angegeben werden. Für einen Admin-Reset: -Reset -NewPassword (ConvertTo-SecureString "…" -AsPlainText -Force)', 'InvalidArgument')
  const raw = arg(a, 'newpassword')
  const pw = parseSecure(raw)
  if (!pw) return psError(e, 'Bitte -NewPassword (ConvertTo-SecureString "NeuesKennwort" -AsPlainText -Force) angeben. (Interaktive Eingabe wird im Simulator nicht unterstützt.)', 'InvalidArgument')
  const err = resetPassword(e.w, u.sam, pw, { mustChange: u.mustChangePassword })
  if (err) return psError(e, `Das Kennwort entspricht nicht den Anforderungen bzgl. Länge, Komplexität oder Verlauf der Domänenkennwortrichtlinie. (${err})`, 'InvalidData')
  act(e, A.adPasswordReset, u.sam, `Set-ADAccountPassword -Reset${u.mustChangePassword ? ' (Änderung bei Anmeldung)' : ''}`)
  return ''
}

export const setADUser: Handler = (e, args) => {
  const a = psArgs(args, ['confirm', 'passthru'])
  const id = identity(e, a)
  if (!id) return psError(e, 'Der Parameter "-Identity" fehlt.', 'InvalidArgument')
  const u = findUser(e.w, id)
  if (!u) return notFound(e, id)
  const patch: Partial<AdUser> = {}
  const map: [string[], keyof AdUser][] = [
    [['department'], 'department'],
    [['title'], 'title'],
    [['office'], 'office'],
    [['officephone'], 'phone'],
    [['mobilephone'], 'mobile'],
    [['description'], 'description'],
    [['emailaddress'], 'mail'],
    [['givenname'], 'givenName'],
    [['surname'], 'surname'],
    [['displayname'], 'displayName'],
    [['company'], 'company'],
    [['employeeid'], 'employeeId'],
    [['homedirectory'], 'homeDirectory'],
    [['homedrive'], 'homeDrive'],
    [['scriptpath'], 'logonScript'],
  ]
  for (const [names, key] of map) {
    const v = arg(a, ...names)
    if (v !== undefined) (patch as Record<string, unknown>)[key] = v.replace(/^\$null$/i, '')
  }
  const mgr = arg(a, 'manager')
  if (mgr !== undefined) {
    const m = findUser(e.w, mgr.replace(/^CN=([^,]+),.*$/i, '$1'))
    if (!m) return notFound(e, mgr)
    patch.manager = m.sam
  }
  const bools: [string, keyof AdUser][] = [['changepasswordatlogon', 'mustChangePassword'], ['passwordneverexpires', 'passwordNeverExpires'], ['cannotchangepassword', 'cannotChangePassword'], ['enabled', 'enabled']]
  for (const [n, key] of bools) {
    const v = boolArg(arg(a, n))
    if (v !== undefined) (patch as Record<string, unknown>)[key] = v
  }
  if (patch.mustChangePassword && u.passwordNeverExpires && patch.passwordNeverExpires !== false) return psError(e, 'Das Kennwort kann nicht bei der nächsten Anmeldung geändert werden, wenn "Kennwort läuft nie ab" gesetzt ist.', 'InvalidOperation')
  if (!Object.keys(patch).length) return psError(e, 'Keine änderbaren Parameter angegeben (z.B. -Department, -Title, -Manager, -ChangePasswordAtLogon $true).', 'InvalidArgument')
  const enabled = patch.enabled
  delete patch.enabled
  if (Object.keys(patch).length) {
    updateUser(e.w, u.sam, patch)
    act(e, A.adUserUpdated, u.sam, Object.entries(patch).map(([k, v]) => `${k}=${v}`).join(', '))
  }
  if (enabled !== undefined && enabled !== u.enabled) {
    setUserEnabled(e.w, u.sam, enabled)
    act(e, enabled ? A.adUserEnabled : A.adUserDisabled, u.sam)
  }
  return ''
}

const enableAccount = (enabled: boolean): Handler => (e, args) => {
  const a = psArgs(args, ['confirm', 'passthru'])
  const id = identity(e, a)
  if (!id) return psError(e, 'Der Parameter "-Identity" fehlt.', 'InvalidArgument')
  const u = findUser(e.w, id)
  if (u) {
    setUserEnabled(e.w, u.sam, enabled)
    act(e, enabled ? A.adUserEnabled : A.adUserDisabled, u.sam)
    return ''
  }
  const c = findComputer(e.w, id)
  if (c) {
    setComputerEnabled(e.w, c.name, enabled)
    act(e, A.adComputerUpdated, c.name, enabled ? 'aktiviert' : 'deaktiviert')
    return ''
  }
  return notFound(e, id)
}
export const enableADAccount = enableAccount(true)
export const disableADAccount = enableAccount(false)

const memberRec = (e: Env, m: string): Rec => {
  const u = findUser(e.w, m)
  if (u) return { distinguishedName: userDn(u), name: u.displayName, objectClass: 'user', SamAccountName: u.sam, SID: sid(u.sam) }
  const g = findGroup(e.w, m)
  if (g) return { distinguishedName: groupDn(g), name: g.name, objectClass: 'group', SamAccountName: g.name, SID: sid(g.name) }
  const c = findComputer(e.w, m)
  return { distinguishedName: c ? compDn(c) : m, name: c?.name ?? m, objectClass: 'computer', SamAccountName: c ? `${c.name}$` : m, SID: sid(m) }
}

export const getADGroupMember: Handler = (e, args) => {
  const a = psArgs(args, ['recursive'])
  const id = identity(e, a)
  if (!id) return psError(e, 'Der Parameter "-Identity" fehlt.', 'InvalidArgument')
  const g = findGroup(e.w, id)
  if (!g) return notFound(e, id)
  const members = has(a, 'recursive') ? effectiveUserMembers(e.w, g.name) : g.members
  return obj(members.map((m) => memberRec(e, m)), ['distinguishedName', 'name', 'objectClass', 'SamAccountName', 'SID'], true)
}

const PROTECTED = ['domänen-admins', 'organisations-admins', 'schema-admins', 'administratoren']

export const addADGroupMember: Handler = (e, args) => {
  const a = psArgs(args, ['confirm', 'passthru'])
  const id = identity(e, a)
  const members = list(arg(a, 'members', 'member') ?? a.pos.slice(1).join(','))
  if (!id || !members.length) return psError(e, 'Beispiel: Add-ADGroupMember -Identity GG_VPN_Benutzer -Members p.braun', 'InvalidArgument')
  const g = findGroup(e.w, id)
  if (!g) return notFound(e, id)
  if (PROTECTED.includes(g.name.toLowerCase())) return psError(e, 'Unzureichende Zugriffsrechte zum Ausführen des Vorgangs. (Geschützte Administratorgruppe – nur nach Freigabe der IT-Leitung durch den 2nd Level.)', 'PermissionDenied')
  const out: string[] = []
  for (const m of members) {
    const err = addGroupMember(e.w, g.name, m)
    if (err) {
      out.push(err.includes('bereits Mitglied') ? psError(e, `Das angegebene Konto ist bereits Mitglied der Gruppe. (${err})`, 'ResourceExists') : notFound(e, m))
      continue
    }
    act(e, A.adGroupAdd, findUser(e.w, m)?.sam ?? findGroup(e.w, m)?.name ?? m, g.name)
  }
  return out.join('\n')
}

export const removeADGroupMember: Handler = (e, args) => {
  const a = psArgs(args, ['confirm', 'passthru'])
  const id = identity(e, a)
  const members = list(arg(a, 'members', 'member') ?? a.pos.slice(1).join(','))
  if (!id || !members.length) return psError(e, 'Beispiel: Remove-ADGroupMember -Identity GG_Vertrieb -Members t.richter -Confirm:$false', 'InvalidArgument')
  const g = findGroup(e.w, id)
  if (!g) return notFound(e, id)
  const out: string[] = []
  if (!('confirm' in a.named)) out.push(`Bestätigung\nMöchten Sie die Mitglieder aus der Gruppe "${g.name}" entfernen?\n[J] Ja  [A] Ja, alle  [N] Nein  (Standard ist "J"): J`)
  for (const m of members) {
    const canonical = findUser(e.w, m)?.sam ?? findGroup(e.w, m)?.name ?? m
    const err = removeGroupMember(e.w, g.name, canonical)
    if (err) {
      out.push(psError(e, err, 'ObjectNotFound'))
      continue
    }
    act(e, A.adGroupRemove, canonical, g.name)
  }
  return out.join('\n')
}

const scopeEn = (g: AdGroup) => (g.scope === 'Global' ? 'Global' : g.scope === 'Universal' ? 'Universal' : 'DomainLocal')
const groupRec = (g: AdGroup): Rec => ({ DistinguishedName: groupDn(g), GroupCategory: g.type === 'Sicherheit' ? 'Security' : 'Distribution', GroupScope: scopeEn(g), Name: g.name, ObjectClass: 'group', ObjectGUID: guid(g.name), SamAccountName: g.name, SID: sid(g.name), Description: g.description, Members: g.members, ManagedBy: g.managedBy ?? '', mail: g.mail ?? '' })

export const getADPrincipalGroupMembership: Handler = (e, args) => {
  const a = psArgs(args)
  const id = identity(e, a)
  if (!id) return psError(e, 'Der Parameter "-Identity" fehlt.', 'InvalidArgument')
  const u = findUser(e.w, id)
  const c = u ? undefined : findComputer(e.w, id)
  const g = u || c ? undefined : findGroup(e.w, id)
  if (!u && !c && !g) return notFound(e, id)
  const member = u?.sam ?? (c ? `${c.name}$` : g!.name)
  const groups = directGroupsOf(e.w, member).map((n) => findGroup(e.w, n)).filter((x): x is AdGroup => !!x)
  return obj(groups.map(groupRec), ['Name', 'GroupCategory', 'GroupScope', 'SamAccountName', 'DistinguishedName'], true)
}

export const getADGroup: Handler = (e, args) => {
  const a = psArgs(args)
  const cols = propCols(['DistinguishedName', 'GroupCategory', 'GroupScope', 'Name', 'ObjectClass', 'ObjectGUID', 'SamAccountName', 'SID'], ['Description', 'Members', 'ManagedBy', 'mail'], arg(a, 'properties'))
  const f = filterFn(arg(a, 'filter'))
  if (f) return obj(e.w.groups.map(groupRec).filter(f), cols, true)
  const id = identity(e, a)
  if (!id) return psError(e, 'Geben Sie -Identity oder -Filter an.', 'InvalidArgument')
  const g = findGroup(e.w, id)
  return g ? obj([groupRec(g)], cols, true) : notFound(e, id)
}

const compRec = (c: AdComputer): Rec => ({ DistinguishedName: compDn(c), DNSHostName: c.dnsHostName, Enabled: c.enabled, Name: c.name, ObjectClass: 'computer', ObjectGUID: guid(c.name), SamAccountName: `${c.name}$`, SID: sid(c.name), UserPrincipalName: '', OperatingSystem: c.os, OperatingSystemVersion: c.osVersion, Description: c.description ?? '', LastLogonDate: c.lastLogon ? fmtDT(c.lastLogon) : '', Location: c.location ?? '', ManagedBy: c.managedBy ?? '', Created: fmtDT(c.created) })

export const getADComputer: Handler = (e, args) => {
  const a = psArgs(args)
  const cols = propCols(['DistinguishedName', 'DNSHostName', 'Enabled', 'Name', 'ObjectClass', 'ObjectGUID', 'SamAccountName', 'SID', 'UserPrincipalName'], ['OperatingSystem', 'OperatingSystemVersion', 'Description', 'LastLogonDate', 'Location', 'ManagedBy', 'Created'], arg(a, 'properties'))
  const f = filterFn(arg(a, 'filter'))
  if (f) return obj(e.w.computers.map(compRec).filter(f), cols, true)
  const id = identity(e, a)
  if (!id) return psError(e, 'Geben Sie -Identity oder -Filter an.', 'InvalidArgument')
  const c = findComputer(e.w, id)
  return c ? obj([compRec(c)], cols, true) : notFound(e, id)
}

export const moveADObject: Handler = (e, args) => {
  const a = psArgs(args, ['confirm'])
  const id = argOrPos(a, 0, 'identity')
  const target = arg(a, 'targetpath') ?? a.pos[1]
  if (!id || !target) return psError(e, 'Beispiel: Move-ADObject -Identity "CN=Uwe Seidel,OU=Einkauf,…" -TargetPath "OU=Deaktiviert,OU=Musterwerk,DC=musterwerk,DC=local"', 'InvalidArgument')
  const name = id.replace(/^CN=([^,]+),.*$/i, '$1')
  const kind = findUser(e.w, name) ? 'user' : findComputer(e.w, name) ? 'computer' : findGroup(e.w, name) ? 'group' : undefined
  if (!kind) return notFound(e, id)
  const err = moveObject(e.w, kind, kind === 'user' ? findUser(e.w, name)!.sam : name, target)
  if (err) return psError(e, err === 'Ziel-OU existiert nicht.' ? `Das Zielobjekt "${target}" ist nicht vorhanden.` : err, 'ObjectNotFound')
  act(e, kind === 'user' ? A.adUserMoved : A.adComputerUpdated, kind === 'user' ? findUser(e.w, name)!.sam : name, target)
  return ''
}

export const newADUser: Handler = (e, args) => {
  const a = psArgs(args, ['passthru'])
  const name = argOrPos(a, 0, 'name')
  const given = arg(a, 'givenname') ?? name?.split(' ')[0] ?? ''
  const sur = arg(a, 'surname') ?? name?.split(' ').slice(1).join(' ') ?? ''
  const sam = arg(a, 'samaccountname') ?? arg(a, 'userprincipalname')?.split('@')[0]
  const pw = parseSecure(arg(a, 'accountpassword'))
  if (!sam) return psError(e, 'Bitte -SamAccountName angeben (z.B. -SamAccountName m.mustermann).', 'InvalidArgument')
  if (!pw) return psError(e, 'Bitte -AccountPassword (ConvertTo-SecureString "Start…" -AsPlainText -Force) angeben.', 'InvalidArgument')
  const dept = arg(a, 'department')
  const path = arg(a, 'path') ?? (dept && e.w.ous.some((o) => o.dn === OU.dept(dept)) ? OU.dept(dept) : OU.builtinUsers)
  const err = createUser(e.w, { givenName: given, surname: sur, sam, password: pw, ou: path, department: dept, title: arg(a, 'title'), office: arg(a, 'office'), phone: arg(a, 'officephone'), manager: arg(a, 'manager'), description: arg(a, 'description'), enabled: boolArg(arg(a, 'enabled')) ?? false, mustChangePassword: boolArg(arg(a, 'changepasswordatlogon')) ?? true })
  if (err) return psError(e, err, 'InvalidOperation')
  act(e, A.adUserCreated, sam.toLowerCase(), path)
  return boolArg(arg(a, 'enabled')) ? '' : 'WARNUNG (Simulator): Das Konto wurde deaktiviert angelegt. Mit -Enabled $true oder Enable-ADAccount aktivieren.'
}

export const getADDefaultDomainPasswordPolicy: Handler = (e) => {
  const d = e.w.domain
  return obj([{ ComplexityEnabled: d.complexity, DistinguishedName: BASE, LockoutDuration: `00:${String(d.lockoutDurationMin).padStart(2, '0')}:00`, LockoutObservationWindow: `00:${String(d.lockoutDurationMin).padStart(2, '0')}:00`, LockoutThreshold: d.lockoutThreshold, MaxPasswordAge: `${d.maxPasswordAgeDays}.00:00:00`, MinPasswordAge: '1.00:00:00', MinPasswordLength: d.minPasswordLength, PasswordHistoryCount: 24, ReversibleEncryptionEnabled: false }], ['ComplexityEnabled', 'DistinguishedName', 'LockoutDuration', 'LockoutObservationWindow', 'LockoutThreshold', 'MaxPasswordAge', 'MinPasswordAge', 'MinPasswordLength', 'PasswordHistoryCount', 'ReversibleEncryptionEnabled'], true)
}

export const getADDomain: Handler = (e) => obj([{ DNSRoot: e.w.domain.dnsName, NetBIOSName: e.w.domain.netbios, DistinguishedName: BASE, DomainMode: 'Windows2016Domain', PDCEmulator: 'DC01.musterwerk.local', RIDMaster: 'DC01.musterwerk.local', InfrastructureMaster: 'DC01.musterwerk.local', ReplicaDirectoryServers: '{DC01.musterwerk.local, DC02.musterwerk.local}', UsersContainer: OU.builtinUsers, ComputersContainer: OU.builtinComputers }], ['DNSRoot', 'NetBIOSName', 'DistinguishedName', 'DomainMode', 'PDCEmulator', 'RIDMaster', 'InfrastructureMaster', 'ReplicaDirectoryServers', 'UsersContainer', 'ComputersContainer'], true)

export const getADReplicationFailure: Handler = (e) => {
  const down = e.w.infra.servers.filter((s) => (s.name === 'DC01' || s.name === 'DC02') && !s.online)
  if (!down.length) return ''
  return obj(down.map((s) => ({ FailureCount: 3, FailureType: 'Link', FirstFailureTime: fmtDT(new Date(Date.now() - 3600_000).toISOString()), LastError: 1722, Partner: `CN=NTDS Settings,CN=${s.name}`, Server: s.name === 'DC01' ? 'DC02' : 'DC01' })), ['FailureCount', 'FailureType', 'FirstFailureTime', 'LastError', 'Partner', 'Server'], true)
}

export const startADSyncSyncCycle: Handler = (e, args) => {
  const a = psArgs(args)
  const type = arg(a, 'policytype') ?? 'Delta'
  if (!/^(delta|initial)$/i.test(type)) return psError(e, 'Ungültiger -PolicyType. Gültig: Delta, Initial.', 'InvalidArgument')
  const before = e.w.infra.sync.errors.length
  const r = syncCloud(e.w)
  const failed = e.w.infra.sync.errors.length > before
  act(e, A.cloudSync, undefined, `${type}${failed ? ' (fehlgeschlagen)' : ` – neu: ${r.created.length}, aktualisiert: ${r.updated.length}, gesperrt: ${r.blocked.length}`}`)
  if (failed) return psError(e, 'Die Synchronisierung konnte nicht gestartet werden: Der Synchronisierungsdienst auf SYNC01 ist nicht erreichbar oder deaktiviert.', 'ConnectionError')
  return `\nResult\n------\nSuccess\n\n(Simulator: ${r.created.length} neu angelegt, ${r.updated.length} aktualisiert, ${r.blocked.length} für Anmeldung gesperrt)`
}

export const AD_CMDLETS = [
  'get-aduser', 'search-adaccount', 'unlock-adaccount', 'set-adaccountpassword', 'set-aduser', 'enable-adaccount', 'disable-adaccount', 'get-adgroupmember', 'add-adgroupmember', 'remove-adgroupmember', 'get-adprincipalgroupmembership', 'get-adgroup', 'get-adcomputer', 'move-adobject', 'new-aduser', 'get-addefaultdomainpasswordpolicy', 'get-addomain', 'get-adreplicationfailure', 'start-adsyncsynccycle',
]
