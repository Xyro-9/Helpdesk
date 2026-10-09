// Seed: fiktive Firma "Musterwerk AG" – Personen, OUs, Gruppen, Computer.
// Alle Namen, Adressen und Telefonnummern sind frei erfunden.

import type { AdComputer, AdDomain, AdGroup, AdOu, AdUser, BitlockerKey } from '../types'
import { daysAgo, hashString, normalize, rng } from '../util'

export const DOMAIN: AdDomain = {
  dnsName: 'musterwerk.local',
  netbios: 'MUSTERWERK',
  upnSuffix: 'musterwerk.example',
  baseDn: 'DC=musterwerk,DC=local',
  lockoutThreshold: 5,
  lockoutDurationMin: 30,
  maxPasswordAgeDays: 90,
  minPasswordLength: 10,
  complexity: true,
}

const B = DOMAIN.baseDn
export const OU = {
  root: `OU=Musterwerk,${B}`,
  users: `OU=Benutzer,OU=Musterwerk,${B}`,
  groups: `OU=Gruppen,OU=Musterwerk,${B}`,
  computers: `OU=Computer,OU=Musterwerk,${B}`,
  desktops: `OU=Desktops,OU=Computer,OU=Musterwerk,${B}`,
  notebooks: `OU=Notebooks,OU=Computer,OU=Musterwerk,${B}`,
  servers: `OU=Server,OU=Musterwerk,${B}`,
  disabled: `OU=Deaktiviert,OU=Musterwerk,${B}`,
  service: `OU=Dienstkonten,OU=Musterwerk,${B}`,
  builtinUsers: `CN=Users,${B}`,
  builtinComputers: `CN=Computers,${B}`,
  dcs: `OU=Domain Controllers,${B}`,
  dept: (dept: string) => `OU=${dept},OU=Benutzer,OU=Musterwerk,${B}`,
}

export interface DeptInfo {
  name: string
  code: string
  network: string // DHCP-Scope
  office: string
  share: string
}

export const DEPARTMENTS: DeptInfo[] = [
  { name: 'Geschäftsführung', code: 'GF', network: '10.10.10.0', office: 'Verwaltung EG', share: 'Geschaeftsfuehrung' },
  { name: 'Vertrieb', code: 'VT', network: '10.10.20.0', office: 'Bürotrakt 1. OG', share: 'Vertrieb' },
  { name: 'Einkauf', code: 'EK', network: '10.10.20.0', office: 'Bürotrakt 1. OG', share: 'Einkauf' },
  { name: 'Buchhaltung', code: 'BH', network: '10.10.10.0', office: 'Verwaltung EG', share: 'Buchhaltung' },
  { name: 'Personal', code: 'HR', network: '10.10.10.0', office: 'Verwaltung EG', share: 'Personal' },
  { name: 'Marketing', code: 'MK', network: '10.10.20.0', office: 'Bürotrakt 1. OG', share: 'Marketing' },
  { name: 'Logistik', code: 'LG', network: '10.10.30.0', office: 'Halle 2 – Lager', share: 'Logistik' },
  { name: 'Produktion', code: 'PR', network: '10.10.30.0', office: 'Halle 1 – Fertigung', share: 'Produktion' },
  { name: 'Kundenservice', code: 'KS', network: '10.10.20.0', office: 'Bürotrakt 1. OG', share: 'Kundenservice' },
  { name: 'IT', code: 'IT', network: '10.10.10.0', office: 'Verwaltung EG – Raum 012', share: 'IT' },
]

export const deptByName = (name: string) => DEPARTMENTS.find((d) => d.name === name)

interface PersonSeed {
  given: string
  sur: string
  dept: string
  title: string
  manager?: string // sam
  notebook?: boolean
  homeOffice?: boolean
  mobile?: boolean
  city?: [string, string, string] // Straße, PLZ, Ort
}

// sam wird automatisch aus Vorname/Nachname gebildet: v.nachname
const PEOPLE: PersonSeed[] = [
  { given: 'Thomas', sur: 'Brandt', dept: 'Geschäftsführung', title: 'Vorstand', notebook: true, mobile: true, city: ['Elbchaussee 211', '22605', 'Hamburg'] },
  { given: 'Sabine', sur: 'Kühn', dept: 'Geschäftsführung', title: 'Assistentin des Vorstands', manager: 't.brandt', city: ['Lindenweg 4', '21075', 'Hamburg'] },
  { given: 'Markus', sur: 'Becker', dept: 'Vertrieb', title: 'Vertriebsleiter', manager: 't.brandt', notebook: true, mobile: true, city: ['Am Mühlenteich 7', '21244', 'Buchholz'] },
  { given: 'Julia', sur: 'Hoffmann', dept: 'Vertrieb', title: 'Key Account Managerin', manager: 'm.becker', notebook: true, homeOffice: true, mobile: true, city: ['Rosenstraße 18', '23552', 'Lübeck'] },
  { given: 'Jonas', sur: 'Wagner', dept: 'Vertrieb', title: 'Außendienstmitarbeiter', manager: 'm.becker', notebook: true, homeOffice: true, mobile: true, city: ['Kastanienallee 3', '24103', 'Kiel'] },
  { given: 'Lea', sur: 'Schulz', dept: 'Vertrieb', title: 'Vertriebsinnendienst', manager: 'm.becker', city: ['Bahnhofstraße 22', '21423', 'Winsen'] },
  { given: 'Tim', sur: 'Richter', dept: 'Vertrieb', title: 'Vertriebsinnendienst', manager: 'm.becker', city: ['Feldweg 9', '21218', 'Seevetal'] },
  { given: 'Nina', sur: 'Krause', dept: 'Vertrieb', title: 'Außendienstmitarbeiterin', manager: 'm.becker', notebook: true, homeOffice: true, mobile: true, city: ['Hafenstraße 41', '27568', 'Bremerhaven'] },
  { given: 'Andreas', sur: 'Wolf', dept: 'Einkauf', title: 'Leiter Einkauf', manager: 't.brandt', notebook: true, mobile: true, city: ['Birkenring 12', '21029', 'Hamburg'] },
  { given: 'Katrin', sur: 'Neumann', dept: 'Einkauf', title: 'Einkäuferin', manager: 'a.wolf', city: ['Uferweg 5', '21481', 'Lauenburg'] },
  { given: 'Stefan', sur: 'Schwarz', dept: 'Einkauf', title: 'Einkäufer', manager: 'a.wolf', city: ['Schulstraße 30', '21357', 'Bardowick'] },
  { given: 'Claudia', sur: 'Zimmermann', dept: 'Buchhaltung', title: 'Leiterin Finanzen', manager: 't.brandt', notebook: true, city: ['Parkallee 2', '21335', 'Lüneburg'] },
  { given: 'Petra', sur: 'Braun', dept: 'Buchhaltung', title: 'Buchhalterin', manager: 'c.zimmermann', city: ['Dorfstraße 14', '21217', 'Seevetal'] },
  { given: 'Michael', sur: 'Hartmann', dept: 'Buchhaltung', title: 'Lohnbuchhalter', manager: 'c.zimmermann', city: ['Gartenweg 8', '21079', 'Hamburg'] },
  { given: 'Sandra', sur: 'Lange', dept: 'Buchhaltung', title: 'Kreditorenbuchhalterin', manager: 'c.zimmermann', homeOffice: true, notebook: true, city: ['Ahornweg 21', '21271', 'Hanstedt'] },
  { given: 'Birgit', sur: 'Schmitt', dept: 'Personal', title: 'Personalleiterin', manager: 't.brandt', notebook: true, city: ['Lerchenfeld 6', '22081', 'Hamburg'] },
  { given: 'Laura', sur: 'Werner', dept: 'Personal', title: 'Personalreferentin', manager: 'b.schmitt', city: ['Mühlenstraße 11', '21376', 'Salzhausen'] },
  { given: 'Daniel', sur: 'Krüger', dept: 'Personal', title: 'Recruiter', manager: 'b.schmitt', notebook: true, city: ['Tannenweg 3', '21220', 'Seevetal'] },
  { given: 'Sophie', sur: 'Meier', dept: 'Marketing', title: 'Marketingleiterin', manager: 't.brandt', notebook: true, mobile: true, city: ['Am Stadtpark 19', '22303', 'Hamburg'] },
  { given: 'Lukas', sur: 'Lehmann', dept: 'Marketing', title: 'Grafikdesigner', manager: 's.meier', city: ['Kirchweg 25', '21073', 'Hamburg'] },
  { given: 'Anna', sur: 'Köhler', dept: 'Marketing', title: 'Social-Media-Managerin', manager: 's.meier', notebook: true, homeOffice: true, city: ['Wiesengrund 10', '25421', 'Pinneberg'] },
  { given: 'Frank', sur: 'Schröder', dept: 'Logistik', title: 'Leiter Logistik', manager: 't.brandt', notebook: true, mobile: true, city: ['Deichstraße 33', '21129', 'Hamburg'] },
  { given: 'Dennis', sur: 'Möller', dept: 'Logistik', title: 'Lagerist', manager: 'f.schroeder', city: ['Moorweg 2', '21423', 'Winsen'] },
  { given: 'Mehmet', sur: 'Yilmaz', dept: 'Logistik', title: 'Disponent', manager: 'f.schroeder', city: ['Hauptstraße 70', '21109', 'Hamburg'] },
  { given: 'Olga', sur: 'Nowak', dept: 'Logistik', title: 'Versandmitarbeiterin', manager: 'f.schroeder', city: ['Fliederweg 15', '21107', 'Hamburg'] },
  { given: 'Ralf', sur: 'König', dept: 'Produktion', title: 'Produktionsleiter', manager: 't.brandt', notebook: true, mobile: true, city: ['Eichenhof 4', '21224', 'Rosengarten'] },
  { given: 'Sven', sur: 'Peters', dept: 'Produktion', title: 'Schichtleiter', manager: 'r.koenig', city: ['Lindenallee 27', '21255', 'Tostedt'] },
  { given: 'Kevin', sur: 'Fuchs', dept: 'Produktion', title: 'Maschinenführer', manager: 's.peters', city: ['Heideweg 13', '21266', 'Jesteburg'] },
  { given: 'Ayşe', sur: 'Demir', dept: 'Produktion', title: 'Qualitätssicherung', manager: 'r.koenig', city: ['Sandstraße 6', '21075', 'Hamburg'] },
  { given: 'Melanie', sur: 'Scholz', dept: 'Kundenservice', title: 'Teamleiterin Kundenservice', manager: 't.brandt', city: ['Bergstraße 44', '21614', 'Buxtehude'] },
  { given: 'Patrick', sur: 'Jung', dept: 'Kundenservice', title: 'Kundenberater', manager: 'm.scholz', city: ['Weidenstieg 9', '21147', 'Hamburg'] },
  { given: 'Jana', sur: 'Hahn', dept: 'Kundenservice', title: 'Kundenberaterin', manager: 'm.scholz', notebook: true, homeOffice: true, city: ['Kanalstraße 17', '21680', 'Stade'] },
  { given: 'Erik', sur: 'Vogel', dept: 'Kundenservice', title: 'Kundenberater', manager: 'm.scholz', city: ['Am Markt 1', '21423', 'Winsen'] },
  { given: 'Oliver', sur: 'Keller', dept: 'IT', title: 'IT-Leiter', manager: 't.brandt', notebook: true, mobile: true, city: ['Nordring 5', '21365', 'Adendorf'] },
  { given: 'Tobias', sur: 'Berger', dept: 'IT', title: 'Systemadministrator (2nd Level)', manager: 'o.keller', notebook: true, city: ['Seeweg 12', '21227', 'Bendestorf'] },
  { given: 'Marie', sur: 'Frank', dept: 'IT', title: 'IT-Support (1st Level)', manager: 'o.keller', city: ['Brückenstraße 8', '21073', 'Hamburg'] },
]

export const samOf = (given: string, sur: string) => `${normalize(given)[0]}.${normalize(sur).replace(/[^a-z]/g, '')}`

/** Telefonnummern im fiktiven Bereich 0 40 / 5550-xxx */
const phoneFor = (i: number) => `+49 40 5550-${(100 + i * 3).toString()}`

function birthDateFor(sam: string) {
  const r = rng(hashString(sam))
  const year = 1965 + Math.floor(r() * 38)
  const month = 1 + Math.floor(r() * 12)
  const day = 1 + Math.floor(r() * 28)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function bitlockerKeyFor(seed: string, created: string): BitlockerKey {
  const r = rng(hashString('bl' + seed))
  const hex = () => Math.floor(r() * 16).toString(16).toUpperCase()
  const keyId = Array.from({ length: 8 }, hex).join('')
  // Echte Wiederherstellungsschlüssel: 8 Blöcke à 6 Ziffern, jeder Block durch 11 teilbar
  const groups = Array.from({ length: 8 }, () => String(Math.floor(r() * 65536) * 11).padStart(6, '0'))
  return { keyId, recoveryPassword: groups.join('-'), created }
}

export function buildOus(): AdOu[] {
  const list: AdOu[] = [
    { dn: B, name: 'musterwerk.local', protected: true, kind: 'domain' },
    { dn: OU.root, name: 'Musterwerk', protected: true, kind: 'ou', description: 'Alle Objekte der Musterwerk AG' },
    { dn: OU.users, name: 'Benutzer', protected: true, kind: 'ou', description: 'Mitarbeiterkonten nach Abteilung' },
    { dn: OU.groups, name: 'Gruppen', protected: true, kind: 'ou', description: 'Sicherheits- und Verteilergruppen' },
    { dn: OU.computers, name: 'Computer', protected: true, kind: 'ou' },
    { dn: OU.desktops, name: 'Desktops', protected: true, kind: 'ou' },
    { dn: OU.notebooks, name: 'Notebooks', protected: true, kind: 'ou', description: 'BitLocker + VPN-Richtlinie' },
    { dn: OU.servers, name: 'Server', protected: true, kind: 'ou' },
    { dn: OU.disabled, name: 'Deaktiviert', protected: true, kind: 'ou', description: 'Ausgeschiedene Mitarbeiter (Aufbewahrung 90 Tage)' },
    { dn: OU.service, name: 'Dienstkonten', protected: true, kind: 'ou' },
    { dn: OU.builtinUsers, name: 'Users', protected: true, kind: 'container' },
    { dn: OU.builtinComputers, name: 'Computers', protected: true, kind: 'container' },
    { dn: OU.dcs, name: 'Domain Controllers', protected: true, kind: 'ou' },
  ]
  for (const d of DEPARTMENTS) list.push({ dn: OU.dept(d.name), name: d.name, protected: true, kind: 'ou' })
  return list
}

export function computerNameFor(p: { dept: string; notebook?: boolean }, index: number) {
  const d = deptByName(p.dept)!
  return `${p.notebook ? 'NB' : 'PC'}-${d.code}-${String(index).padStart(3, '0')}`
}

export interface SeedPeopleResult {
  users: AdUser[]
  computers: AdComputer[]
  /** sam -> Computername */
  primaryComputer: Record<string, string>
}

export function buildPeople(techName: string): SeedPeopleResult {
  const users: AdUser[] = []
  const computers: AdComputer[] = []
  const primaryComputer: Record<string, string> = {}
  const deptCounter: Record<string, number> = {}

  const mk = (p: PersonSeed, i: number): AdUser => {
    const sam = samOf(p.given, p.sur)
    const r = rng(hashString(sam))
    const created = daysAgo(200 + Math.floor(r() * 2000))
    const pwdAge = Math.floor(r() * 80)
    return {
      sam,
      givenName: p.given,
      surname: p.sur,
      displayName: `${p.given} ${p.sur}`,
      upn: `${sam}@${DOMAIN.upnSuffix}`,
      mail: `${sam}@${DOMAIN.upnSuffix}`,
      employeeId: String(10000 + ((hashString(sam) % 89999) | 0)).padStart(5, '0'),
      birthDate: birthDateFor(sam),
      department: p.dept,
      title: p.title,
      company: 'Musterwerk AG',
      office: deptByName(p.dept)!.office,
      phone: phoneFor(i),
      mobile: p.mobile ? `+49 151 ${String(20000000 + ((hashString(sam + 'm') % 7999999) | 0))}` : undefined,
      manager: p.manager,
      ou: OU.dept(p.dept),
      enabled: true,
      lockedOut: false,
      badPwdCount: 0,
      password: `Start${(hashString(sam) % 900) + 100}!Mw`,
      pwdLastSet: daysAgo(pwdAge),
      passwordExpired: false,
      mustChangePassword: false,
      passwordNeverExpires: false,
      cannotChangePassword: false,
      lastLogon: daysAgo(r() * 0.5),
      homeDrive: 'H:',
      homeDirectory: `\\\\FS01\\home$\\${sam}`,
      logonScript: '',
      homeAddress: p.city ? { street: p.city[0], postalCode: p.city[1], city: p.city[2] } : undefined,
      homeOffice: !!p.homeOffice,
      created,
      modified: daysAgo(Math.floor(r() * 30)),
    }
  }

  PEOPLE.forEach((p, i) => {
    const u = mk(p, i)
    users.push(u)
    const d = deptByName(p.dept)!
    deptCounter[d.code] = (deptCounter[d.code] ?? 0) + 1
    const name = computerNameFor(p, deptCounter[d.code])
    primaryComputer[u.sam] = name
    computers.push(makeComputer(name, !!p.notebook, u.sam, d.office))
  })

  // Azubi / Techniker
  const tech: AdUser = {
    ...mk({ given: techName.split(' ')[0] || 'Azubi', sur: techName.split(' ').slice(1).join(' ') || 'IT', dept: 'IT', title: 'Auszubildender Fachinformatiker', manager: 'o.keller' }, 40),
    sam: 'azubi',
    upn: `azubi@${DOMAIN.upnSuffix}`,
    mail: `azubi@${DOMAIN.upnSuffix}`,
    displayName: techName,
    description: 'Auszubildender – Helpdesk',
  }
  users.push(tech)
  computers.push(makeComputer('IT-ADM-01', false, 'azubi', 'Verwaltung EG – Raum 012'))
  primaryComputer['azubi'] = 'IT-ADM-01'

  // Ausgeschiedener Mitarbeiter (bereits deaktiviert)
  users.push({
    ...mk({ given: 'Uwe', sur: 'Seidel', dept: 'Einkauf', title: 'Einkäufer', manager: 'a.wolf' }, 41),
    enabled: false,
    ou: OU.disabled,
    description: 'Ausgeschieden 31.08. – Ticket T-10012',
  })

  // Dienstkonten
  for (const [sam, desc] of [
    ['svc_backup', 'Dienstkonto Datensicherung'],
    ['svc_scan', 'Scan-to-Folder Multifunktionsgeräte'],
    ['svc_erp', 'ERP-Anwendungsserver APP01'],
    ['svc_sync', 'Cloud-Synchronisierung SYNC01'],
  ] as const) {
    users.push({
      ...mk({ given: sam, sur: '', dept: 'IT', title: 'Dienstkonto' }, 50),
      sam,
      givenName: '',
      surname: '',
      displayName: sam,
      upn: `${sam}@${DOMAIN.dnsName}`,
      mail: '',
      ou: OU.service,
      description: desc,
      department: '',
      title: '',
      passwordNeverExpires: true,
      cannotChangePassword: true,
      isServiceAccount: true,
      homeDirectory: undefined,
      homeDrive: undefined,
      homeAddress: undefined,
    })
  }

  // Reserve-/Lagergeräte ohne Benutzer
  computers.push(makeComputer('NB-LAGER-001', true, undefined, 'IT-Lager'))
  computers.push(makeComputer('NB-LAGER-002', true, undefined, 'IT-Lager'))
  computers.push(makeComputer('PC-SCHULUNG-01', false, undefined, 'Schulungsraum'))
  return { users, computers, primaryComputer }
}

export function makeComputer(name: string, notebook: boolean, managedBy: string | undefined, location: string): AdComputer {
  const created = daysAgo(100 + (hashString(name) % 900))
  return {
    name,
    ou: name.startsWith('IT-') ? OU.desktops : notebook ? OU.notebooks : OU.desktops,
    os: 'Windows 11 Enterprise',
    osVersion: '10.0 (26100)',
    enabled: true,
    managedBy,
    dnsHostName: `${name.toLowerCase()}.musterwerk.local`,
    lastLogon: daysAgo(0.2),
    created,
    bitlockerKeys: notebook ? [bitlockerKeyFor(name, created)] : [],
    laps: { password: `L@ps-${(hashString(name) % 900000).toString(36)}-${name.length}X`, expires: daysAgo(-20) },
    location,
    description: managedBy ? `Arbeitsplatz ${managedBy}` : 'Reservegerät',
  }
}

export function buildServerComputers(): AdComputer[] {
  const mk = (name: string, ou: string, desc: string): AdComputer => ({
    name,
    ou,
    os: 'Windows Server 2022 Standard',
    osVersion: '10.0 (20348)',
    enabled: true,
    dnsHostName: `${name.toLowerCase()}.musterwerk.local`,
    lastLogon: daysAgo(0.05),
    created: daysAgo(1200),
    bitlockerKeys: [],
    description: desc,
    location: 'Serverraum UG',
  })
  return [
    mk('DC01', OU.dcs, 'Domänencontroller, DNS, DHCP'),
    mk('DC02', OU.dcs, 'Domänencontroller, DNS'),
    mk('FS01', OU.servers, 'Dateiserver'),
    mk('PRINT01', OU.servers, 'Druckserver'),
    mk('APP01', OU.servers, 'ERP-Anwendungsserver'),
    mk('SYNC01', OU.servers, 'Cloud-Synchronisierung'),
  ]
}

const g = (name: string, description: string, members: string[] = [], scope: AdGroup['scope'] = 'Global', type: AdGroup['type'] = 'Sicherheit', extra: Partial<AdGroup> = {}): AdGroup => ({
  name,
  description,
  scope,
  type,
  ou: OU.groups,
  members,
  ...extra,
})

export function buildGroups(users: AdUser[]): AdGroup[] {
  const staff = users.filter((u) => !u.isServiceAccount && u.enabled)
  const byDept = (dept: string) => staff.filter((u) => u.department === dept).map((u) => u.sam)
  const laptopUsers = staff.filter((u) => u.homeOffice || ['m.becker', 'a.wolf', 'c.zimmermann', 'b.schmitt', 's.meier', 'f.schroeder', 'r.koenig', 'o.keller', 't.berger', 't.brandt', 'd.krueger'].includes(u.sam)).map((u) => u.sam)

  const groups: AdGroup[] = [
    g('Domänen-Admins', 'Designierte Administratoren der Domäne', ['o.keller', 't.berger'], 'Global', 'Sicherheit', { ou: OU.builtinUsers, builtin: true }),
    g('Domänen-Benutzer', 'Alle Domänenbenutzer', users.map((u) => u.sam), 'Global', 'Sicherheit', { ou: OU.builtinUsers, builtin: true }),
    g('Organisations-Admins', 'Designierte Administratoren der Organisation', [], 'Universal', 'Sicherheit', { ou: OU.builtinUsers, builtin: true }),
    g('Remotedesktopbenutzer', 'Mitglieder dürfen sich per RDP anmelden', ['GG_IT'], 'Lokal (Domäne)', 'Sicherheit', { ou: OU.builtinUsers, builtin: true }),
    g('GG_Alle_Mitarbeiter', 'Alle aktiven Mitarbeiter', staff.filter((u) => u.sam !== 'azubi').map((u) => u.sam).concat(['azubi'])),
    g('GG_IT', 'IT-Abteilung', byDept('IT')),
    g('GG_IT_Helpdesk', 'Delegierte Rechte: Kennwort zurücksetzen, Konten entsperren, Gruppen pflegen', ['m.frank', 'azubi']),
    g('GG_Lokale_Admins', 'Lokale Administratoren auf Clients (nur IT!)', ['GG_IT']),
    g('GG_VPN_Benutzer', 'Berechtigung für VPN-Einwahl (SecureLink)', laptopUsers),
    g('GG_WLAN_Mitarbeiter', 'Zertifikatsbasiertes WLAN "MW-Office"', staff.map((u) => u.sam)),
    g('GG_ERP_Benutzer', 'Zugriff auf ERP-System (APP01)', staff.filter((u) => !['Marketing'].includes(u.department)).map((u) => u.sam)),
    g('GG_ERP_Finanzen', 'ERP-Modul Finanzbuchhaltung', byDept('Buchhaltung')),
    g('GG_Drucker_1OG_Farbe', 'GPO: verbindet \\\\PRINT01\\1OG-Farbe', [...byDept('Vertrieb'), ...byDept('Einkauf'), ...byDept('Marketing'), ...byDept('Kundenservice')]),
    g('GG_Drucker_EG', 'GPO: verbindet \\\\PRINT01\\EG-SW', [...byDept('Geschäftsführung'), ...byDept('Buchhaltung'), ...byDept('Personal'), ...byDept('IT')]),
    g('GG_Drucker_Halle', 'GPO: verbindet \\\\PRINT01\\Halle-SW und Etikettendrucker', [...byDept('Logistik'), ...byDept('Produktion')]),
    g('GG_Projekt_Messe2026', 'Projektlaufwerk Messe 2026', ['s.meier', 'l.lehmann', 'm.becker', 'j.hoffmann']),
    g('DL_Alle_Mitarbeiter', 'Verteiler alle@musterwerk.example', staff.map((u) => u.sam), 'Universal', 'Verteilung', { mail: 'alle@musterwerk.example' }),
  ]
  for (const d of DEPARTMENTS) {
    if (d.name !== 'IT') groups.push(g(`GG_${d.share}`, `Abteilung ${d.name}`, byDept(d.name)))
    groups.push(g(`FS_${d.share}_RW`, `Dateiserver: \\\\FS01\\${d.share} – Ändern`, [`GG_${d.name === 'IT' ? 'IT' : d.share}`], 'Lokal (Domäne)'))
    groups.push(g(`FS_${d.share}_R`, `Dateiserver: \\\\FS01\\${d.share} – Lesen`, d.name === 'Geschäftsführung' ? [] : d.name === 'Vertrieb' ? ['GG_Kundenservice'] : [], 'Lokal (Domäne)'))
  }
  groups.push(g('FS_Allgemein_RW', 'Dateiserver: \\\\FS01\\Allgemein – Ändern', ['GG_Alle_Mitarbeiter'], 'Lokal (Domäne)'))
  groups.push(g('FS_Messe2026_RW', 'Dateiserver: \\\\FS01\\Projekte\\Messe2026 – Ändern', ['GG_Projekt_Messe2026'], 'Lokal (Domäne)'))
  return groups
}
