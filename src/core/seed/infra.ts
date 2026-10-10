// Seed: Server, Netzwerk, DNS, DHCP, Dateifreigaben, Drucker

import type { AdComputer, DhcpScope, DnsZone, FileShare, Infrastructure, PrintQueue, PrinterDevice, Server, WinEvent, WinService } from '../types'
import { daysAgo, intToIp, ipToInt, minutesFromNow, uid } from '../util'
import { DEPARTMENTS } from './company'

export const DNS1 = '10.10.0.10'
export const DNS2 = '10.10.0.11'

export const NETWORKS = [
  { name: 'Server', subnet: '10.10.0.0/24', gateway: '10.10.0.1', vlan: 10, description: 'Serverraum UG' },
  { name: 'Verwaltung EG', subnet: '10.10.10.0/24', gateway: '10.10.10.1', vlan: 20, description: 'GF, Buchhaltung, Personal, IT' },
  { name: 'Bürotrakt 1. OG', subnet: '10.10.20.0/24', gateway: '10.10.20.1', vlan: 30, description: 'Vertrieb, Einkauf, Marketing, Kundenservice' },
  { name: 'Hallen', subnet: '10.10.30.0/24', gateway: '10.10.30.1', vlan: 40, description: 'Produktion, Logistik' },
  { name: 'Drucker', subnet: '10.10.50.0/24', gateway: '10.10.50.1', vlan: 50, description: 'Netzwerkdrucker / MFP' },
  { name: 'WLAN MW-Office', subnet: '10.10.60.0/24', gateway: '10.10.60.1', vlan: 60, description: 'Firmen-WLAN (Zertifikat)' },
  { name: 'VPN-Clients', subnet: '10.10.99.0/24', gateway: '10.10.99.1', vlan: 99, description: 'SecureLink VPN-Pool' },
]

const svc = (name: string, displayName: string, description: string, startType: WinService['startType'] = 'Automatisch', status: WinService['status'] = 'Wird ausgeführt', account = 'LocalSystem'): WinService => ({
  name,
  displayName,
  description,
  startType,
  status,
  account,
})

export function serverBaseServices(): WinService[] {
  return [
    svc('EventLog', 'Windows-Ereignisprotokoll', 'Verwaltet Ereignisse und Ereignisprotokolle.', 'Automatisch', 'Wird ausgeführt', 'Lokaler Dienst'),
    svc('LanmanServer', 'Server', 'Unterstützt Datei-, Druck- und Named-Pipe-Freigabe über das Netzwerk.'),
    svc('LanmanWorkstation', 'Arbeitsstationsdienst', 'Erstellt und wartet Clientnetzwerkverbindungen mit Remoteservern (SMB).', 'Automatisch', 'Wird ausgeführt', 'Netzwerkdienst'),
    svc('W32Time', 'Windows-Zeitgeber', 'Synchronisiert Datum und Uhrzeit.', 'Automatisch', 'Wird ausgeführt', 'Lokaler Dienst'),
    svc('WinRM', 'Windows-Remoteverwaltung (WS-Verwaltung)', 'Ermöglicht PowerShell-Remoting.', 'Automatisch', 'Wird ausgeführt', 'Netzwerkdienst'),
    svc('TermService', 'Remotedesktopdienste', 'Ermöglicht Remotedesktopverbindungen.', 'Manuell', 'Wird ausgeführt', 'Netzwerkdienst'),
    svc('WinDefend', 'Microsoft Defender Antivirus Service', 'Schutz vor Schadsoftware.'),
    svc('wuauserv', 'Windows Update', 'Erkennung, Download und Installation von Updates.', 'Manuell', 'Beendet'),
  ]
}

function ev(computer: string, log: WinEvent['log'], eventId: number, level: WinEvent['level'], source: string, message: string, daysBack: number): WinEvent {
  return { id: uid('ev'), log, eventId, level, source, message, time: daysAgo(daysBack), computer }
}

export function buildServers(): Server[] {
  const dcServices = (name: string): WinService[] => [
    ...serverBaseServices(),
    svc('NTDS', 'Active Directory-Domänendienste', 'AD DS-Domänencontroller-Dienst.'),
    svc('DNS', 'DNS-Server', 'Ermöglicht DNS-Clients das Auflösen von DNS-Namen.'),
    svc('Netlogon', 'Anmeldedienst', 'Unterstützt Pass-Through-Authentifizierung von Kontoanmeldeereignissen.'),
    svc('Kdc', 'Kerberos-Schlüsselverteilungscenter', 'Ermöglicht Kerberos-Anmeldungen.'),
    svc('DFSR', 'DFS-Replikation', 'Repliziert SYSVOL zwischen Domänencontrollern.'),
    ...(name === 'DC01' ? [svc('DHCPServer', 'DHCP-Server', 'Vergibt IP-Adressen an DHCP-Clients.', 'Automatisch', 'Wird ausgeführt', 'Netzwerkdienst')] : []),
  ]
  const servers: Server[] = [
    {
      name: 'DC01',
      roles: ['AD DS', 'DNS', 'DHCP'],
      ip: '10.10.0.10',
      os: 'Windows Server 2022 Standard',
      online: true,
      cpu: 6,
      ramUsedPct: 41,
      ramGb: 16,
      volumes: [{ letter: 'C', label: 'System', sizeGb: 120, freeGb: 64 }],
      services: dcServices('DC01'),
      events: [
        ev('DC01', 'System', 1500, 'Informationen', 'Microsoft-Windows-GroupPolicy', 'Die Gruppenrichtlinieneinstellungen für den Computer wurden erfolgreich verarbeitet.', 0.1),
        ev('DC01', 'System', 2008, 'Informationen', 'DFSR', 'Die SYSVOL-Replikation mit DC02 wurde erfolgreich abgeschlossen.', 0.3),
        ev('DC01', 'Sicherheit', 4624, 'Überprüfung erfolgreich', 'Microsoft-Windows-Security-Auditing', 'Ein Konto wurde erfolgreich angemeldet. Konto: svc_backup', 0.2),
      ],
      uptimeDays: 23,
      location: 'Serverraum UG – Rack A',
    },
    {
      name: 'DC02',
      roles: ['AD DS', 'DNS'],
      ip: '10.10.0.11',
      os: 'Windows Server 2022 Standard',
      online: true,
      cpu: 4,
      ramUsedPct: 37,
      ramGb: 16,
      volumes: [{ letter: 'C', label: 'System', sizeGb: 120, freeGb: 70 }],
      services: dcServices('DC02'),
      events: [],
      uptimeDays: 23,
      location: 'Serverraum UG – Rack A',
    },
    {
      name: 'FS01',
      roles: ['Dateiserver', 'DFS-Namespace'],
      ip: '10.10.0.20',
      os: 'Windows Server 2022 Standard',
      online: true,
      cpu: 12,
      ramUsedPct: 58,
      ramGb: 32,
      volumes: [
        { letter: 'C', label: 'System', sizeGb: 120, freeGb: 51 },
        { letter: 'D', label: 'Daten', sizeGb: 4000, freeGb: 1310 },
      ],
      services: [...serverBaseServices(), svc('Dfs', 'DFS-Namespace', 'Fasst Freigaben zu einem Namespace zusammen.'), svc('BackupAgent', 'MW Backup Agent', 'Agent der Datensicherung.', 'Automatisch', 'Wird ausgeführt', 'MUSTERWERK\\svc_backup')],
      events: [ev('FS01', 'Anwendung', 1001, 'Informationen', 'MW Backup Agent', 'Sicherung "Täglich-Inkrementell" erfolgreich abgeschlossen (412 GB).', 0.4)],
      uptimeDays: 23,
      location: 'Serverraum UG – Rack A',
    },
    {
      name: 'PRINT01',
      roles: ['Druckserver'],
      ip: '10.10.0.30',
      os: 'Windows Server 2022 Standard',
      online: true,
      cpu: 3,
      ramUsedPct: 33,
      ramGb: 8,
      volumes: [{ letter: 'C', label: 'System', sizeGb: 80, freeGb: 39 }],
      services: [...serverBaseServices(), svc('Spooler', 'Druckwarteschlange', 'Lädt Dateien zum späteren Drucken in den Speicher.')],
      events: [],
      uptimeDays: 11,
      location: 'Serverraum UG – Rack B',
    },
    {
      name: 'APP01',
      roles: ['ERP-Anwendungsserver', 'SQL Server'],
      ip: '10.10.0.40',
      os: 'Windows Server 2022 Standard',
      online: true,
      cpu: 27,
      ramUsedPct: 71,
      ramGb: 64,
      volumes: [
        { letter: 'C', label: 'System', sizeGb: 120, freeGb: 33 },
        { letter: 'E', label: 'SQL-Daten', sizeGb: 500, freeGb: 188 },
      ],
      services: [
        ...serverBaseServices(),
        svc('MSSQLSERVER', 'SQL Server (MSSQLSERVER)', 'Datenbankmodul.', 'Automatisch', 'Wird ausgeführt', 'MUSTERWERK\\svc_erp'),
        svc('ERPAppServer', 'MW ERP Applikationsserver', 'Anwendungsdienst des ERP-Systems.', 'Automatisch', 'Wird ausgeführt', 'MUSTERWERK\\svc_erp'),
      ],
      events: [],
      uptimeDays: 23,
      location: 'Serverraum UG – Rack B',
    },
    {
      name: 'SYNC01',
      roles: ['Cloud-Synchronisierung'],
      ip: '10.10.0.50',
      os: 'Windows Server 2022 Standard',
      online: true,
      cpu: 5,
      ramUsedPct: 45,
      ramGb: 8,
      volumes: [{ letter: 'C', label: 'System', sizeGb: 80, freeGb: 40 }],
      services: [...serverBaseServices(), svc('CloudSync', 'MW Cloud Sync Service', 'Synchronisiert AD-Objekte und Kennwort-Hashes in den Cloud-Mandanten.', 'Automatisch', 'Wird ausgeführt', 'MUSTERWERK\\svc_sync')],
      events: [],
      uptimeDays: 23,
      location: 'Serverraum UG – Rack B',
    },
  ]
  return servers
}

export function buildDnsZones(computers: AdComputer[], ipOf: (name: string) => string | undefined): DnsZone[] {
  const local: DnsZone = {
    name: 'musterwerk.local',
    type: 'AD-integriert',
    records: [
      { name: '@', type: 'SOA', value: 'dc01.musterwerk.local. hostmaster.musterwerk.local.', ttl: 3600 },
      { name: '@', type: 'NS', value: 'dc01.musterwerk.local.', ttl: 3600 },
      { name: '@', type: 'NS', value: 'dc02.musterwerk.local.', ttl: 3600 },
      { name: '@', type: 'A', value: '10.10.0.10', ttl: 600 },
      { name: '@', type: 'A', value: '10.10.0.11', ttl: 600 },
      { name: '_ldap._tcp.dc._msdcs', type: 'SRV', value: '0 100 389 dc01.musterwerk.local.', ttl: 600 },
      { name: '_kerberos._tcp', type: 'SRV', value: '0 100 88 dc01.musterwerk.local.', ttl: 600 },
      { name: 'intranet', type: 'CNAME', value: 'app01.musterwerk.local.', ttl: 3600 },
      { name: 'erp', type: 'CNAME', value: 'app01.musterwerk.local.', ttl: 3600 },
      { name: 'proxy', type: 'A', value: '10.10.0.60', ttl: 3600 },
      { name: 'vpn', type: 'A', value: '10.10.0.5', ttl: 3600 },
      { name: 'kb', type: 'CNAME', value: 'app01.musterwerk.local.', ttl: 3600 },
      { name: 'status', type: 'CNAME', value: 'app01.musterwerk.local.', ttl: 3600 },
    ],
  }
  for (const c of computers) {
    const ip = ipOf(c.name)
    if (ip) local.records.push({ name: c.name.toLowerCase(), type: 'A', value: ip, ttl: 1200, dynamic: !c.name.match(/^(DC|FS|PRINT|APP|SYNC)/) })
  }
  for (const p of buildPrinters().devices) local.records.push({ name: p.hostname, type: 'A', value: p.ip, ttl: 3600 })
  const rev: DnsZone = { name: '10.10.in-addr.arpa', type: 'AD-integriert', records: [] }
  return [local, rev, { name: 'musterwerk.example', type: 'Weiterleitung', records: [{ name: '@', type: 'NS', value: 'Weiterleitung an externe DNS (Provider)', ttl: 3600 }] }]
}

export function scopeFor(network: string, name: string, gwLast = 1): DhcpScope {
  const base = network.split('.').slice(0, 3).join('.')
  return {
    id: network,
    name,
    mask: '255.255.255.0',
    rangeStart: `${base}.50`,
    rangeEnd: `${base}.199`,
    router: `${base}.${gwLast}`,
    dnsServers: ['10.10.0.10', '10.10.0.11'],
    domainName: 'musterwerk.local',
    leaseHours: 192,
    active: true,
    exclusions: [{ start: `${base}.50`, end: `${base}.59` }],
    reservations: [],
    leases: [],
  }
}

export function buildDhcpScopes(): DhcpScope[] {
  return [
    scopeFor('10.10.10.0', 'Verwaltung EG'),
    scopeFor('10.10.20.0', 'Bürotrakt 1. OG'),
    scopeFor('10.10.30.0', 'Hallen'),
    scopeFor('10.10.60.0', 'WLAN MW-Office'),
    scopeFor('10.10.99.0', 'VPN-Clients'),
  ]
}

/** Nächste freie Adresse im Scope (ohne Ausschlüsse/Reservierungen/aktive Leases) */
export function nextFreeIp(scope: DhcpScope): string | undefined {
  const used = new Set(scope.leases.filter((l) => l.state !== 'Abgelaufen').map((l) => l.ip))
  scope.reservations.forEach((r) => used.add(r.ip))
  const start = ipToInt(scope.rangeStart)
  const end = ipToInt(scope.rangeEnd)
  for (let i = start; i <= end; i++) {
    const ip = intToIp(i)
    if (used.has(ip)) continue
    if (scope.exclusions.some((e) => i >= ipToInt(e.start) && i <= ipToInt(e.end))) continue
    return ip
  }
  return undefined
}

export function buildShares(): FileShare[] {
  const shares: FileShare[] = DEPARTMENTS.map((d) => ({
    name: d.share,
    server: 'FS01',
    localPath: `D:\\Freigaben\\${d.share}`,
    description: `Abteilungslaufwerk ${d.name}`,
    permissions: [
      { principal: `FS_${d.share}_RW`, access: 'Ändern' },
      { principal: `FS_${d.share}_R`, access: 'Lesen' },
      { principal: 'Domänen-Admins', access: 'Vollzugriff' },
    ],
    sizeGb: 20 + (d.share.length * 13) % 180,
    quotaGb: 500,
    folders: ['Allgemein', 'Vorlagen', 'Projekte', 'Archiv'],
  }))
  shares.push(
    {
      name: 'Allgemein',
      server: 'FS01',
      localPath: 'D:\\Freigaben\\Allgemein',
      description: 'Abteilungsübergreifender Austausch',
      permissions: [
        { principal: 'FS_Allgemein_RW', access: 'Ändern' },
        { principal: 'Domänen-Admins', access: 'Vollzugriff' },
      ],
      sizeGb: 85,
      folders: ['Austausch', 'Formulare', 'Kantine', 'Betriebsrat'],
    },
    {
      name: 'Projekte',
      server: 'FS01',
      localPath: 'D:\\Freigaben\\Projekte',
      description: 'Projektlaufwerke',
      permissions: [
        { principal: 'FS_Messe2026_RW', access: 'Ändern' },
        { principal: 'Domänen-Admins', access: 'Vollzugriff' },
      ],
      sizeGb: 42,
      folders: ['Messe2026', 'ERP-Migration'],
    },
    {
      name: 'home$',
      server: 'FS01',
      localPath: 'D:\\Home',
      description: 'Basisordner der Benutzer (versteckte Freigabe)',
      permissions: [
        { principal: 'Domänen-Benutzer', access: 'Ändern' },
        { principal: 'Domänen-Admins', access: 'Vollzugriff' },
      ],
      sizeGb: 610,
      folders: [],
    },
    {
      name: 'Scans',
      server: 'FS01',
      localPath: 'D:\\Scans',
      description: 'Scan-to-Folder der Multifunktionsgeräte',
      permissions: [
        { principal: 'GG_Alle_Mitarbeiter', access: 'Ändern' },
        { principal: 'svc_scan', access: 'Ändern' },
      ],
      sizeGb: 12,
      folders: ['EG', '1OG', 'Halle'],
    },
  )
  return shares
}

export function buildPrinters(): { devices: PrinterDevice[]; queues: PrintQueue[] } {
  const dev = (id: string, name: string, model: string, ip: string, location: string, color: boolean): PrinterDevice => ({
    id,
    name,
    model,
    ip,
    hostname: id.toLowerCase(),
    mac: `00:1B:A9:${ip.split('.').slice(1).map((o) => (+o).toString(16).padStart(2, '0').toUpperCase()).join(':')}`,
    location,
    serial: `LT${(ipToInt(ip) % 9_000_000) + 1_000_000}`,
    status: 'Bereit',
    toner: color ? { black: 64, cyan: 48, magenta: 71, yellow: 55 } : { black: 58 },
    trays: [
      { name: 'Fach 1', size: 'A4', levelPct: 80 },
      { name: 'Fach 2', size: 'A4', levelPct: 60 },
      { name: 'Mehrzweck', size: 'A5', levelPct: 0 },
    ],
    pageCount: 30000 + (ipToInt(ip) % 90000),
    adminPassword: 'Drucker#2026',
    dhcp: false,
    log: [{ time: daysAgo(2), message: 'Gerät gestartet. Netzwerkverbindung hergestellt (1000 Mbit/s).' }],
    color,
  })
  const devices = [
    dev('PRN-EG-SW', 'EG Schwarzweiß', 'Lumatec MX-4100', '10.10.50.11', 'Verwaltung EG, Flur', false),
    dev('PRN-GF', 'Geschäftsführung Farbe', 'Lumatec CX-3300', '10.10.50.12', 'Verwaltung EG, Raum 001', true),
    dev('PRN-1OG-FARBE', '1. OG Farbe', 'Lumatec CX-5500', '10.10.50.21', 'Bürotrakt 1. OG, Kopierraum', true),
    dev('PRN-1OG-SW', '1. OG Schwarzweiß', 'Lumatec MX-4100', '10.10.50.22', 'Bürotrakt 1. OG, Kopierraum', false),
    dev('PRN-HALLE-SW', 'Halle Schwarzweiß', 'Lumatec MX-2200', '10.10.50.31', 'Halle 1, Meisterbüro', false),
    dev('PRN-ETIKETT', 'Etikettendrucker Versand', 'Labelix LP-420', '10.10.50.32', 'Halle 2, Versand', false),
  ]
  const q = (name: string, deviceId: string, driver: string, location: string, deployedTo?: string): PrintQueue => ({
    name,
    server: 'PRINT01',
    driver,
    location,
    deviceId,
    status: 'Bereit',
    shared: true,
    published: true,
    jobs: [],
    deployedTo,
  })
  const queues = [
    q('EG-SW', 'PRN-EG-SW', 'Lumatec Universal PCL6', 'Verwaltung EG, Flur', 'GG_Drucker_EG'),
    q('GF-Farbe', 'PRN-GF', 'Lumatec Universal PCL6', 'Verwaltung EG, Raum 001'),
    q('1OG-Farbe', 'PRN-1OG-FARBE', 'Lumatec Universal PCL6', 'Bürotrakt 1. OG, Kopierraum', 'GG_Drucker_1OG_Farbe'),
    q('1OG-SW', 'PRN-1OG-SW', 'Lumatec Universal PCL6', 'Bürotrakt 1. OG, Kopierraum'),
    q('Halle-SW', 'PRN-HALLE-SW', 'Lumatec Universal PCL6', 'Halle 1, Meisterbüro', 'GG_Drucker_Halle'),
    q('Etiketten', 'PRN-ETIKETT', 'Labelix ZPL', 'Halle 2, Versand', 'GG_Drucker_Halle'),
  ]
  return { devices, queues }
}

export function buildInfra(computers: AdComputer[], ipOf: (name: string) => string | undefined): Infrastructure {
  const { devices, queues } = buildPrinters()
  return {
    servers: buildServers(),
    dnsZones: buildDnsZones(computers, ipOf),
    dnsForwardersOk: true,
    dhcpScopes: buildDhcpScopes(),
    shares: buildShares(),
    printQueues: queues,
    printers: devices,
    networks: NETWORKS,
    internetUp: true,
    proxy: { host: 'proxy.musterwerk.local', port: 8080, online: true },
    sync: { lastRun: minutesFromNow(-12), enabled: true, intervalMin: 30, errors: [] },
    vpnGateway: { online: true, host: 'vpn.musterwerk.example', allowedGroup: 'GG_VPN_Benutzer', activeSessions: [] },
    gpo: {
      driveMaps: [
        ...DEPARTMENTS.map((d) => ({ group: d.name === 'IT' ? 'GG_IT' : `GG_${d.share}`, letter: 'S:', path: `\\\\FS01\\${d.share}`, label: `Abteilung (${d.name})` })),
        { group: 'GG_Alle_Mitarbeiter', letter: 'P:', path: '\\\\FS01\\Allgemein', label: 'Allgemein' },
        { group: 'GG_Projekt_Messe2026', letter: 'M:', path: '\\\\FS01\\Projekte\\Messe2026', label: 'Messe 2026' },
      ],
      printerMaps: [
        { group: 'GG_Drucker_EG', queue: 'EG-SW', setDefault: true },
        { group: 'GG_Drucker_1OG_Farbe', queue: '1OG-Farbe', setDefault: true },
        { group: 'GG_Drucker_Halle', queue: 'Halle-SW', setDefault: true },
      ],
    },
  }
}
