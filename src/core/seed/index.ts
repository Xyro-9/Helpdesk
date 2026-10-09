// Baut die komplette Ausgangswelt der Simulation.

import { KB_ARTICLES } from '@/content/kb'
import type { MailMessage, Ticket, World } from '../types'
import { daysAgo, minutesFromNow, nowIso, uid } from '../util'
import { buildAssets, buildShipments } from './assets'
import { buildCloud } from './cloud'
import { buildGroups, buildOus, buildPeople, buildServerComputers, deptByName, DOMAIN } from './company'
import { buildInfra, nextFreeIp } from './infra'

export const WORLD_VERSION = 3

export function createInitialWorld(traineeName = 'Azubi IT'): World {
  const { users, computers: clientComputers } = buildPeople(traineeName)
  const computers = [...buildServerComputers(), ...clientComputers]
  const groups = buildGroups(users)

  // IP-Vergabe (DHCP-Leases) für alle Clients, die im Büro stehen
  const ipByName: Record<string, string> = { DC01: '10.10.0.10', DC02: '10.10.0.11', FS01: '10.10.0.20', PRINT01: '10.10.0.30', APP01: '10.10.0.40', SYNC01: '10.10.0.50' }
  const infra = buildInfra(computers, (name) => ipByName[name])
  for (const c of clientComputers) {
    const user = users.find((u) => u.sam === c.managedBy)
    if (!user) continue
    const nb = c.name.startsWith('NB-')
    if (user.homeOffice && nb) continue
    const scopeId = nb ? '10.10.60.0' : (deptByName(user.department)?.network ?? '10.10.10.0')
    const scope = infra.dhcpScopes.find((s) => s.id === scopeId)!
    const ip = nextFreeIp(scope)!
    scope.leases.push({ ip, mac: '', hostname: `${c.name.toLowerCase()}.musterwerk.local`, expires: minutesFromNow(60 * 24 * 6), state: 'Aktiv' })
    ipByName[c.name] = ip
  }
  // DNS neu aufbauen, jetzt mit Client-IPs
  const rebuilt = buildInfra(computers, (name) => ipByName[name])
  infra.dnsZones = rebuilt.dnsZones

  const cloud = buildCloud(users)
  const assets = buildAssets(users, clientComputers)
  for (const a of assets) {
    if (a.hostname) {
      const ad = computers.find((c) => c.name === a.hostname)
      if (ad) ad.description = `${ad.description ?? ''} – Inventar ${a.tag}`.trim()
    }
  }
  const shipments = buildShipments(users, assets)

  const tech = { name: traineeName, sam: 'azubi', workstation: 'IT-ADM-01' }

  const welcome: MailMessage = {
    id: uid('mail'),
    folder: 'Posteingang',
    from: { name: 'Oliver Keller', address: 'o.keller@musterwerk.example' },
    to: ['helpdesk@musterwerk.example'],
    cc: [],
    subject: 'Willkommen im Helpdesk-Team!',
    body: `Hallo ${traineeName},

herzlich willkommen im IT-Service-Desk der Musterwerk AG!

Ein paar Hinweise für den Start:
• Tickets kommen per Telefon, E-Mail, Chat und über das Self-Service-Portal rein. Übernimm ein Ticket, bevor du daran arbeitest.
• Prüfe bei Kennwort-, MFA- oder BitLocker-Anfragen IMMER die Identität (Personalnummer + Geburtsdatum aus dem AD vergleichen).
• Dokumentiere jede Maßnahme in den Arbeitsnotizen: Symptom, Ursache, Lösung. Kennwörter gehören NIE ins Ticket.
• Kennwörter werden nur telefonisch nach Identitätsprüfung mitgeteilt – nie per E-Mail oder Chat.
• Die Wissensdatenbank (KB) hilft dir bei Standardfällen. Wenn du nicht weiterkommst: an den 2nd Level eskalieren.
• Admin-Rechte für Anwender, Domänen-Admin-Mitgliedschaften o.ä. werden nicht ohne Freigabe der IT-Leitung vergeben.

Du hast delegierte Rechte (Gruppe GG_IT_Helpdesk) für Kontenpflege, Remote-Zugriff auf Clients und das Cloud Admin Center.

Viel Erfolg!
Oliver Keller
IT-Leiter`,
    date: daysAgo(0.01),
    read: false,
    flagged: true,
    attachments: [],
  }

  const historical: Ticket[] = [
    hist('T-10012', 'Offboarding Uwe Seidel', 'Mitarbeiter scheidet zum 31.08. aus. Konto deaktivieren, Postfach an Vorgesetzten.', 'a.wolf', 'Onboarding/Offboarding', 'Serviceanfrage', 'Konto deaktiviert, in OU Deaktiviert verschoben, Gruppen entfernt, Postfach-Vollzugriff für a.wolf. Notebook zurückgenommen (MW-NB-0009).', 38),
    hist('T-10187', 'Drucker 1. OG druckt nur Hieroglyphen', 'Ausdrucke auf 1OG-SW bestehen aus Sonderzeichen.', 'l.schulz', 'Drucker', 'Störung', 'Falscher Treiber (PostScript statt PCL6) auf Druckserver – Treiber der Queue korrigiert, Testseite ok.', 12),
    hist('T-10201', 'VPN-Zugang für neue Außendienstmitarbeiterin', 'Bitte VPN für n.krause freischalten.', 'm.becker', 'Konto & Zugriff', 'Serviceanfrage', 'n.krause zur Gruppe GG_VPN_Benutzer hinzugefügt (Freigabe M. Becker liegt vor).', 6),
  ]

  return {
    version: WORLD_VERSION,
    createdAt: nowIso(),
    company: {
      name: 'Musterwerk',
      legalName: 'Musterwerk AG',
      address: 'Am Werkhafen 12, 21079 Hamburg',
      phone: '+49 40 5550-0',
      helpdeskPhone: '+49 40 5550-999',
      helpdeskMail: 'helpdesk@musterwerk.example',
    },
    tech,
    domain: DOMAIN,
    ous: buildOus(),
    users,
    groups,
    computers,
    endpoints: {},
    infra,
    cloud,
    assets,
    shipments,
    kb: KB_ARTICLES.map((a) => ({ ...a })),
    tickets: historical,
    mails: [welcome],
    chats: [],
    calls: [],
    actionLog: [],
    shift: { active: false, difficulty: 0, intervalMin: 4, spawned: [], maxTickets: 8 },
    counters: { ticket: 10240, shipment: 32, pid: 9000, asset: 900, misc: 1 },
  }

  function hist(id: string, title: string, description: string, requester: string, category: Ticket['category'], kind: Ticket['kind'], resolution: string, d: number): Ticket {
    return {
      id,
      kind,
      title,
      description,
      requester,
      channel: 'E-Mail',
      category,
      impact: 3,
      urgency: 2,
      priority: 'P3 – Mittel',
      status: 'Geschlossen',
      assignee: 'Marie Frank',
      assignmentGroup: '1st Level Support',
      createdAt: daysAgo(d),
      updatedAt: daysAgo(d - 1),
      firstResponseAt: daysAgo(d - 0.02),
      slaResponseDue: daysAgo(d - 0.1),
      slaResolveDue: daysAgo(d - 2),
      resolvedAt: daysAgo(d - 0.5),
      resolutionCode: kind === 'Störung' ? 'Gelöst (dauerhaft)' : 'Anfrage erfüllt',
      resolutionNote: resolution,
      workNotes: [{ id: uid('n'), author: 'Marie Frank', text: resolution, time: daysAgo(d - 0.5) }],
      comments: [],
      attachments: [],
      linkedAssets: [],
      linkedKb: [],
      timeSpentMin: 20,
      historical: true,
      tags: [],
    }
  }
}
