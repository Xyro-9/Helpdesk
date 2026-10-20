// Seed: fiktiver Cloud-Mandant (E-Mail, Lizenzen, MFA, Anmeldeprotokolle)

import type { AdUser, CloudTenant, CloudUser, LicenseSku, Mailbox, SignIn } from '../types'
import { daysAgo, hashString, rng, uid } from '../util'

export const SKUS: LicenseSku[] = [
  { id: 'CO_STANDARD', name: 'Cloud Office Standard', total: 30, services: ['E-Mail (50 GB)', 'Office-Apps', 'Chat & Besprechungen', 'Cloud-Speicher 1 TB'] },
  { id: 'CO_PREMIUM', name: 'Cloud Office Premium', total: 20, services: ['E-Mail (100 GB)', 'Office-Apps', 'Chat & Besprechungen', 'Cloud-Speicher 1 TB', 'Geräteverwaltung', 'Erweiterter Bedrohungsschutz', 'Bedingter Zugriff'] },
  { id: 'CO_FRONTLINE', name: 'Cloud Office Frontline', total: 8, services: ['E-Mail (2 GB)', 'Office im Browser', 'Chat'] },
  { id: 'CO_VISIO', name: 'Diagramm-Plan 2', total: 3, services: ['Diagramm-App'] },
]

export function mailboxFor(type: Mailbox['type'] = 'Benutzer', sizeGb = 3): Mailbox {
  return {
    type,
    sizeGb,
    quotaGb: type === 'Freigegeben' ? 50 : 50,
    fullAccess: [],
    sendAs: [],
    sendOnBehalf: [],
    inboxRules: [],
    litigationHold: false,
    archiveEnabled: false,
  }
}

function signInsFor(u: AdUser, seed: number): SignIn[] {
  const r = rng(seed)
  const list: SignIn[] = []
  const apps = ['Outlook', 'Chat & Besprechungen', 'Office-Portal', 'Cloud-Speicher']
  for (let i = 0; i < 8; i++) {
    list.push({
      id: uid('si'),
      time: daysAgo(i * 0.7 + r() * 0.3),
      app: apps[Math.floor(r() * apps.length)],
      ip: u.homeOffice ? `84.${100 + Math.floor(r() * 50)}.${Math.floor(r() * 250)}.${Math.floor(r() * 250)}` : '203.0.113.10',
      location: u.homeOffice ? u.homeAddress?.city + ', DE' : 'Hamburg, DE',
      client: i % 3 === 0 ? 'Mobile App (iOS)' : 'Windows 11 / Desktop-App',
      status: 'Erfolgreich',
      risk: 'keines',
    })
  }
  return list
}

export function cloudUserFromAd(u: AdUser): CloudUser {
  const seed = hashString(u.sam + 'cloud')
  const managerish = /leiter|vorstand|manager/i.test(u.title)
  const frontline = ['Produktion', 'Logistik'].includes(u.department) && !managerish
  const sku = frontline ? 'CO_FRONTLINE' : managerish || u.homeOffice ? 'CO_PREMIUM' : 'CO_STANDARD'
  return {
    upn: u.upn,
    displayName: u.displayName,
    sam: u.sam,
    synced: true,
    signInBlocked: !u.enabled,
    licenses: [sku],
    mfa: {
      enforced: true,
      requireReRegister: false,
      methods: [
        { id: uid('mfa'), type: 'Authenticator-App', detail: `Smartphone von ${u.givenName} ${u.surname}`, isDefault: true, registered: daysAgo(100 + (seed % 300)) },
        ...(u.mobile ? [{ id: uid('mfa'), type: 'SMS' as const, detail: u.mobile.replace(/\d(?=\d{3})/g, '*'), isDefault: false, registered: daysAgo(200) }] : []),
      ],
    },
    mailbox: mailboxFor('Benutzer', 1 + (seed % 30)),
    signIns: signInsFor(u, seed),
    riskState: 'keines',
    lastPasswordChange: u.pwdLastSet,
    devices: [{ name: `${u.sam.toUpperCase()}-Smartphone`, os: seed % 2 ? 'iOS 18' : 'Android 15', registered: daysAgo(120), compliant: true }],
    usageLocation: 'DE',
  }
}

function sharedMailbox(local: string, displayName: string, fullAccess: string[]): CloudUser {
  return {
    upn: `${local}@musterwerk.example`,
    displayName,
    synced: false,
    signInBlocked: true,
    licenses: [],
    mfa: { enforced: false, methods: [], requireReRegister: false },
    mailbox: { ...mailboxFor('Freigegeben', 7), fullAccess, sendAs: fullAccess.slice(0, 1) },
    signIns: [],
    riskState: 'keines',
    devices: [],
    usageLocation: 'DE',
  }
}

export function buildCloud(users: AdUser[]): CloudTenant {
  const people = users.filter((u) => !u.isServiceAccount && u.mail)
  const cloudUsers = people.map(cloudUserFromAd)
  const upn = (sam: string) => `${sam}@musterwerk.example`
  cloudUsers.push(
    sharedMailbox('einkauf', 'Einkauf (Team-Postfach)', [upn('a.wolf'), upn('k.neumann')]),
    sharedMailbox('info', 'Info Musterwerk', [upn('s.kuehn'), upn('m.scholz')]),
    sharedMailbox('bewerbung', 'Bewerbungen', [upn('b.schmitt'), upn('l.werner'), upn('d.krueger')]),
    sharedMailbox('kundenservice', 'Kundenservice', [upn('m.scholz'), upn('p.jung'), upn('j.hahn'), upn('e.vogel')]),
    sharedMailbox('buchhaltung', 'Buchhaltung (Rechnungseingang)', [upn('c.zimmermann'), upn('p.braun'), upn('s.lange')]),
    {
      ...sharedMailbox('besprechung-eg', 'Besprechungsraum EG', []),
      mailbox: { ...mailboxFor('Raum', 0.2) },
    },
  )
  return {
    name: 'Musterwerk AG',
    domain: 'musterwerk.example',
    skus: SKUS,
    users: cloudUsers,
    blockedSenders: ['newsletter@spam-versand.example'],
    quarantine: [
      { id: uid('q'), from: 'rechnung@paket-zustellung-info.example', subject: 'Ihre Sendung konnte nicht zugestellt werden', received: daysAgo(0.5), reason: 'Phishing (hohe Konfidenz)', released: false, deleted: false },
      { id: uid('q'), from: 'office@lieferant-nord.example', subject: 'AW: Bestellung 4500012231', received: daysAgo(1.2), reason: 'Spam (niedrige Konfidenz)', released: false, deleted: false },
    ],
  }
}
