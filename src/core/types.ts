// Zentrales Datenmodell der simulierten Firma "Musterwerk AG".
// Alle Module lesen/schreiben ausschließlich über diese Typen (siehe store.ts → updateWorld).

export type ISODate = string

// ───────────────────────────── Active Directory ─────────────────────────────

export interface AdDomain {
  dnsName: string // musterwerk.local
  netbios: string // MUSTERWERK
  upnSuffix: string // musterwerk.example
  baseDn: string // DC=musterwerk,DC=local
  lockoutThreshold: number
  lockoutDurationMin: number
  maxPasswordAgeDays: number
  minPasswordLength: number
  complexity: boolean
}

export interface AdOu {
  dn: string
  name: string
  description?: string
  protected: boolean
  /** "container" für CN=Users / CN=Computers / Builtin */
  kind: 'ou' | 'container' | 'domain'
}

export interface AdUser {
  sam: string // sAMAccountName, z.B. "m.becker"
  givenName: string
  surname: string
  displayName: string
  upn: string
  mail: string
  employeeId: string // Personalnummer – für Identitätsprüfung
  birthDate: string // YYYY-MM-DD – für Identitätsprüfung
  department: string
  title: string
  company: string
  office: string // Standort / Raum
  phone: string // Durchwahl
  mobile?: string
  manager?: string // sam des Vorgesetzten
  ou: string // DN des Containers
  enabled: boolean
  lockedOut: boolean
  lockoutTime?: ISODate
  /** Computer, von dem die fehlerhaften Anmeldungen kamen (sichtbar im DC-Sicherheitsprotokoll, Ereignis 4740) */
  lockoutSource?: string
  badPwdCount: number
  /** Simuliertes Kennwort (nur Training!) */
  password: string
  pwdLastSet: ISODate
  passwordExpired: boolean
  mustChangePassword: boolean
  passwordNeverExpires: boolean
  cannotChangePassword: boolean
  accountExpires?: ISODate
  lastLogon?: ISODate
  description?: string
  homeDrive?: string // "H:"
  homeDirectory?: string // \\FS01\home$\m.becker
  logonScript?: string
  homeAddress?: { street: string; postalCode: string; city: string }
  homeOffice: boolean
  created: ISODate
  modified: ISODate
  isServiceAccount?: boolean
  /** Freie Notizen/Attribute (extensionAttributes etc.) */
  extra?: Record<string, string>
}

export type GroupScope = 'Global' | 'Lokal (Domäne)' | 'Universal'
export type GroupType = 'Sicherheit' | 'Verteilung'

export interface AdGroup {
  name: string
  description: string
  scope: GroupScope
  type: GroupType
  ou: string
  managedBy?: string
  /** Mitglieder: Benutzer-sam, Computername (mit $) oder Gruppenname */
  members: string[]
  mail?: string
  builtin?: boolean
}

export interface BitlockerKey {
  keyId: string // 8-stellige ID (erste Gruppe der GUID)
  recoveryPassword: string // 48 Ziffern in 8er-Blöcken
  created: ISODate
}

export interface AdComputer {
  name: string // ohne $
  ou: string
  os: string
  osVersion: string
  enabled: boolean
  description?: string
  managedBy?: string // sam
  dnsHostName: string
  lastLogon?: ISODate
  created: ISODate
  bitlockerKeys: BitlockerKey[]
  laps?: { password: string; expires: ISODate }
  /** Simulation: Computerkonto-Kennwort passt nicht mehr zum Client (Vertrauensstellung defekt) */
  secureChannelBroken?: boolean
  location?: string
}

// ───────────────────────────── Windows-Endpunkte ─────────────────────────────

export interface NetAdapter {
  name: string // "Ethernet", "WLAN"
  description: string
  mac: string
  kind: 'Ethernet' | 'WLAN' | 'VPN'
  enabled: boolean
  /** Kabel gesteckt / WLAN verbunden */
  mediaConnected: boolean
  dhcp: boolean
  /** Statische Werte (dhcp=false) bzw. zuletzt erhaltene Lease (dhcp=true) */
  ip: string
  mask: string
  gateway: string
  dnsServers: string[]
  /** DNS wird per DHCP bezogen */
  dnsFromDhcp: boolean
  ssid?: string
  speedMbps?: number
  /** Physisches Netz, an dem der Adapter hängt: DHCP-Scope-ID (z.B. "10.10.20.0"), "home" (Heimrouter) oder "none" */
  network: string
}

export type ServiceStatus = 'Wird ausgeführt' | 'Beendet' | 'Angehalten'
export type StartType = 'Automatisch' | 'Automatisch (Verzögerter Start)' | 'Manuell' | 'Deaktiviert'

export interface WinService {
  name: string // Dienstname (z.B. "Spooler")
  displayName: string
  description: string
  status: ServiceStatus
  startType: StartType
  account: string
  dependsOn?: string[]
  /** Wenn gesetzt, schlägt der Start mit dieser Meldung fehl (bis Ursache behoben ist) */
  startError?: string
}

export interface WinProcess {
  pid: number
  name: string // "chrome.exe"
  description: string
  user: string
  cpu: number // Prozent
  memMb: number
  /** Prozess startet nach Beenden sofort neu (z.B. Dienst), solange Ursache nicht behoben */
  respawn?: boolean
  service?: string
}

export interface StartupItem {
  name: string
  publisher: string
  command: string
  enabled: boolean
  impact: 'Hoch' | 'Mittel' | 'Niedrig' | 'Nicht gemessen'
}

export type PrintJobStatus = 'Wird gedruckt' | 'In Warteschlange' | 'Fehler' | 'Angehalten' | 'Wird gelöscht'

export interface PrintJob {
  id: number
  document: string
  owner: string
  pages: number
  sizeKb: number
  status: PrintJobStatus
  submitted: ISODate
}

export interface LocalPrinter {
  name: string // "\\PRINT01\3OG-Farbe" oder "Microsoft Print to PDF"
  driver: string
  port: string // "IP_10.10.20.51", "PORTPROMPT:", "\\PRINT01\3OG-Farbe"
  /** Verbindung zu einer Druckwarteschlange auf dem Druckserver */
  serverQueue?: string // Name der Queue auf PRINT01
  isDefault: boolean
  status: 'Bereit' | 'Offline' | 'Fehler' | 'Angehalten' | 'Treiber nicht verfügbar'
  jobs: PrintJob[]
}

export interface Partition {
  id: string
  type: 'EFI' | 'Wiederherstellung' | 'Primär' | 'Nicht zugeordnet'
  sizeGb: number
  usedGb: number
  letter?: string // "C"
  label?: string
  fs?: 'NTFS' | 'FAT32' | 'exFAT' | 'RAW'
  bitlocker?: 'Ein' | 'Aus' | 'Angehalten'
  health: 'Fehlerfrei' | 'Fehlerhaft' | 'Unbekannt'
}

export interface Disk {
  number: number
  model: string
  sizeGb: number
  kind: 'SSD' | 'HDD' | 'USB'
  status: 'Online' | 'Offline' | 'Nicht initialisiert'
  partitionStyle: 'GPT' | 'MBR' | 'Unbekannt'
  smart: 'OK' | 'Warnung' | 'Fehler'
  partitions: Partition[]
}

export interface FsNode {
  name: string
  type: 'dir' | 'file'
  sizeMb?: number
  content?: string
  hidden?: boolean
  system?: boolean
  readOnly?: boolean
  modified: ISODate
  children?: FsNode[]
}

export interface MappedDrive {
  letter: string // "S:"
  path: string // \\FS01\Vertrieb
  persistent: boolean
  /** per Anmeldeskript/GPO verbunden */
  viaGpo?: boolean
}

export type RegType = 'REG_SZ' | 'REG_EXPAND_SZ' | 'REG_DWORD' | 'REG_QWORD' | 'REG_MULTI_SZ' | 'REG_BINARY'

export interface RegValue {
  name: string // "" = (Standard)
  type: RegType
  data: string | number
}

export interface RegKey {
  name: string
  values: RegValue[]
  subkeys: RegKey[]
}

export type EventLevel = 'Informationen' | 'Warnung' | 'Fehler' | 'Kritisch' | 'Überprüfung erfolgreich' | 'Überprüfung fehlgeschlagen'
export type EventLogName = 'Anwendung' | 'Sicherheit' | 'Setup' | 'System' | 'Weitergeleitete Ereignisse'

export interface WinEvent {
  id: string
  log: EventLogName
  eventId: number
  level: EventLevel
  source: string
  time: ISODate
  message: string
  user?: string
  computer: string
  task?: string
}

export interface Device {
  id: string
  name: string
  category: string // "Netzwerkadapter", "Kameras", "Audio", "Grafikkarten", "Laufwerke", "USB-Controller", "Bluetooth", "Monitore", "Tastaturen", "Mäuse", "Drucker", "Prozessoren"
  status: 'OK' | 'Deaktiviert' | 'Fehler' | 'Treiber fehlt'
  driverVersion: string
  driverDate: string
  manufacturer: string
  errorCode?: number // Geräte-Manager-Code, z.B. 22 (deaktiviert), 28 (kein Treiber), 43
}

export interface InstalledApp {
  name: string
  publisher: string
  version: string
  installed: string
  sizeMb: number
}

export interface Endpoint {
  hostname: string
  kind: 'Desktop' | 'Notebook' | 'Server'
  os: string
  osBuild: string
  manufacturer: string
  model: string
  serial: string
  assetTag?: string
  cpu: string
  ramGb: number
  /** Angemeldeter Benutzer (sam) */
  loggedOnUser?: string
  domainJoined: boolean
  /** Uhrzeitabweichung zum DC in Minuten (Kerberos > 5 min schlägt fehl) */
  timeOffsetMin: number
  timeZone: string
  online: boolean
  locked: boolean
  adapters: NetAdapter[]
  /** DNS-Client-Cache: name -> ip (veraltete Einträge möglich) */
  dnsCache: Record<string, string>
  services: WinService[]
  processes: WinProcess[]
  startupApps: StartupItem[]
  printers: LocalPrinter[]
  disks: Disk[]
  /** Laufwerksbuchstabe ("C:") -> Wurzelverzeichnis */
  fs: Record<string, FsNode>
  mappedDrives: MappedDrive[]
  /** Wurzel "Computer" mit den Hives als Unterschlüssel */
  registry: RegKey
  events: WinEvent[]
  devices: Device[]
  installedApps: InstalledApp[]
  firewall: { domain: boolean; private: boolean; public: boolean }
  /** Gruppenrichtlinien: wann zuletzt angewendet; pending = Änderungen warten auf gpupdate */
  gpo: { lastApplied: ISODate; pending: boolean }
  /** Gruppen im Anmelde-Token (Snapshot bei Anmeldung / klist purge / Neustart).
   *  Weicht vom AD ab, wenn Mitgliedschaften nach der Anmeldung geändert wurden. */
  tokenGroups: string[]
  pendingReboot: boolean
  lastBoot: ISODate
  vpn: { installed: boolean; connected: boolean; profile: string; lastError?: string }
  outlook: { configured: boolean; lastError?: string }
  /** Freie Szenario-Flags (z.B. "malwarePopup": "1") */
  flags: Record<string, string>
}

// ───────────────────────────── Infrastruktur ─────────────────────────────

export interface Server {
  name: string
  roles: string[]
  ip: string
  os: string
  online: boolean
  cpu: number
  ramUsedPct: number
  ramGb: number
  volumes: { letter: string; label: string; sizeGb: number; freeGb: number }[]
  services: WinService[]
  events: WinEvent[]
  uptimeDays: number
  location: string
}

export interface DnsRecord {
  name: string // "@" oder Hostname relativ zur Zone
  type: 'A' | 'AAAA' | 'CNAME' | 'MX' | 'SRV' | 'PTR' | 'TXT' | 'NS' | 'SOA'
  value: string
  ttl: number
  dynamic?: boolean
}

export interface DnsZone {
  name: string
  type: 'Primär' | 'AD-integriert' | 'Weiterleitung'
  records: DnsRecord[]
}

export interface DhcpLease {
  ip: string
  mac: string
  hostname: string
  expires: ISODate
  state: 'Aktiv' | 'Abgelaufen' | 'Reservierung' | 'BAD_ADDRESS'
}

export interface DhcpScope {
  id: string // Netzwerkadresse, z.B. 10.10.20.0
  name: string
  mask: string
  rangeStart: string
  rangeEnd: string
  router: string
  dnsServers: string[]
  domainName: string
  leaseHours: number
  active: boolean
  exclusions: { start: string; end: string }[]
  reservations: { ip: string; mac: string; name: string }[]
  leases: DhcpLease[]
}

export interface SharePermission {
  principal: string // Gruppe oder Benutzer
  access: 'Lesen' | 'Ändern' | 'Vollzugriff' | 'Verweigern'
}

export interface FileShare {
  name: string // "Vertrieb"
  server: string
  localPath: string
  description: string
  permissions: SharePermission[]
  sizeGb: number
  quotaGb?: number
  /** Ordnerstruktur zur Anzeige in Explorer/Server */
  folders: string[]
}

export interface PrintQueue {
  name: string // Freigabename "3OG-Farbe"
  server: string
  driver: string
  location: string
  deviceId: string // -> PrinterDevice
  status: 'Bereit' | 'Angehalten' | 'Fehler' | 'Offline'
  shared: boolean
  published: boolean
  jobs: PrintJob[]
  /** Gruppe, die per GPO verbindet */
  deployedTo?: string
}

export interface PrinterDevice {
  id: string
  name: string
  model: string
  ip: string
  hostname: string
  mac: string
  location: string
  serial: string
  status: 'Bereit' | 'Papierstau' | 'Toner leer' | 'Papier leer' | 'Offline' | 'Fehler' | 'Energiesparmodus'
  statusDetail?: string
  toner: { black: number; cyan?: number; magenta?: number; yellow?: number }
  trays: { name: string; size: string; levelPct: number }[]
  pageCount: number
  adminPassword: string
  dhcp: boolean
  /** Netzwerk-Log der Geräteoberfläche */
  log: { time: ISODate; message: string }[]
  color: boolean
}

export interface NetworkSite {
  name: string
  subnet: string // 10.10.20.0/24
  gateway: string
  vlan: number
  description: string
}

export interface Infrastructure {
  servers: Server[]
  dnsZones: DnsZone[]
  /** Externe DNS-Forwarder erreichbar? */
  dnsForwardersOk: boolean
  dhcpScopes: DhcpScope[]
  shares: FileShare[]
  printQueues: PrintQueue[]
  printers: PrinterDevice[]
  networks: NetworkSite[]
  internetUp: boolean
  proxy: { host: string; port: number; online: boolean }
  /** Hybrid-Sync AD -> Cloud */
  sync: { lastRun: ISODate; enabled: boolean; intervalMin: number; errors: string[] }
  vpnGateway: { online: boolean; host: string; allowedGroup: string; activeSessions: string[] }
  /** Gruppenrichtlinien (vereinfacht): Laufwerks- und Druckerzuordnungen nach Gruppe */
  gpo: {
    driveMaps: { group: string; letter: string; path: string; label: string }[]
    printerMaps: { group: string; queue: string; setDefault?: boolean }[]
  }
}

// ───────────────────────────── Cloud (fiktives "Cloud Admin Center") ─────────────────────────────

export interface MfaMethod {
  id: string
  type: 'Authenticator-App' | 'SMS' | 'Anruf' | 'FIDO2-Schlüssel' | 'E-Mail'
  detail: string // z.B. "iPhone 12 von M. Becker" / "+49 151 ****123"
  isDefault: boolean
  registered: ISODate
}

export interface SignIn {
  id: string
  time: ISODate
  app: string
  ip: string
  location: string
  client: string
  status: 'Erfolgreich' | 'Fehlgeschlagen' | 'Unterbrochen (MFA)' | 'Blockiert'
  failureReason?: string
  risk: 'keines' | 'niedrig' | 'mittel' | 'hoch'
}

export interface Mailbox {
  type: 'Benutzer' | 'Freigegeben' | 'Raum'
  sizeGb: number
  quotaGb: number
  fullAccess: string[] // UPNs
  sendAs: string[]
  sendOnBehalf: string[]
  forwardingTo?: string
  autoReply?: { enabled: boolean; internal: string; external: string }
  inboxRules: { name: string; description: string; enabled: boolean; suspicious?: boolean }[]
  litigationHold: boolean
  archiveEnabled: boolean
}

export interface CloudUser {
  upn: string
  displayName: string
  /** Verknüpfter AD-Benutzer (Hybrid-Sync). Leer bei reinen Cloud-Objekten (z.B. freigegebene Postfächer) */
  sam?: string
  synced: boolean
  signInBlocked: boolean
  licenses: string[] // SKU-IDs
  mfa: { enforced: boolean; methods: MfaMethod[]; requireReRegister: boolean }
  mailbox?: Mailbox
  sessionsRevokedAt?: ISODate
  signIns: SignIn[]
  /** Benutzer hat Kennwort auf Phishing-Seite eingegeben etc. */
  riskState: 'keines' | 'gefährdet' | 'behoben'
  lastPasswordChange?: ISODate
  devices: { name: string; os: string; registered: ISODate; compliant: boolean }[]
  usageLocation: string
}

export interface LicenseSku {
  id: string
  name: string
  total: number
  services: string[]
}

export interface CloudTenant {
  name: string
  domain: string
  skus: LicenseSku[]
  users: CloudUser[]
  /** Gesperrte Absender / Domänen (Mail-Sicherheit) */
  blockedSenders: string[]
  /** Quarantäne / gemeldete Nachrichten */
  quarantine: { id: string; from: string; subject: string; received: ISODate; reason: string; released: boolean; deleted: boolean }[]
}

// ───────────────────────────── Assets & Versand ─────────────────────────────

export type AssetType = 'Notebook' | 'Desktop' | 'Monitor' | 'Dockingstation' | 'Smartphone' | 'Headset' | 'Tastatur/Maus' | 'Drucker' | 'Tablet' | 'Sonstiges'
export type AssetStatus = 'In Benutzung' | 'Lager' | 'In Reparatur' | 'Bestellt' | 'Ausgemustert' | 'Im Versand' | 'Verloren/Gestohlen'

export interface Asset {
  tag: string // "MW-NB-0042"
  type: AssetType
  manufacturer: string
  model: string
  serial: string
  status: AssetStatus
  assignedTo?: string // sam
  location: string
  hostname?: string
  purchaseDate: string
  warrantyUntil: string
  costEur: number
  notes: string
  history: { time: ISODate; text: string }[]
}

export type ShipmentStatus = 'Entwurf' | 'Beauftragt' | 'Abgeholt' | 'Unterwegs' | 'Zugestellt' | 'Problem' | 'Storniert'

export interface Shipment {
  id: string // "SH-2026-00012"
  direction: 'Ausgehend' | 'Rücksendung'
  ticketId?: string
  recipientName: string
  recipientSam?: string
  address: { street: string; postalCode: string; city: string; country: string }
  items: string[] // Asset-Tags
  carrier: 'DHL' | 'UPS' | 'DPD' | 'GLS' | 'Hauspost'
  service: 'Standard' | 'Express' | 'Overnight'
  tracking?: string
  status: ShipmentStatus
  created: ISODate
  updated: ISODate
  notes: string
  events: { time: ISODate; text: string }[]
}

// ───────────────────────────── Wissensdatenbank ─────────────────────────────

export interface KbArticle {
  id: string // "KB0001"
  title: string
  category: string
  tags: string[]
  /** Inhalt in einfachem Markdown (#, ##, -, 1., **fett**, `code`, > Hinweis) */
  body: string
  author: string
  updated: ISODate
  views: number
  helpful: number
  /** vom Azubi erstellt */
  custom?: boolean
}

// ───────────────────────────── Tickets & Kommunikation ─────────────────────────────

export type Channel = 'Telefon' | 'E-Mail' | 'Chat' | 'Portal' | 'Vor Ort'
export type TicketKind = 'Störung' | 'Serviceanfrage' | 'Änderung'
export type TicketCategory =
  | 'Konto & Zugriff'
  | 'Hardware'
  | 'Netzwerk'
  | 'Drucker'
  | 'Software'
  | 'E-Mail & Cloud'
  | 'Sicherheit'
  | 'Onboarding/Offboarding'
  | 'Sonstiges'
export type Priority = 'P1 – Kritisch' | 'P2 – Hoch' | 'P3 – Mittel' | 'P4 – Niedrig'
export type TicketStatus = 'Neu' | 'In Bearbeitung' | 'Wartet auf Benutzer' | 'Wartet auf Dritte' | 'Gelöst' | 'Geschlossen'
export type AssignmentGroup = '1st Level Support' | '2nd Level Support' | 'Netzwerk & Infrastruktur' | 'Vor-Ort-Service' | 'Informationssicherheit'
export type ResolutionCode =
  | 'Gelöst (dauerhaft)'
  | 'Gelöst (Workaround)'
  | 'Anfrage erfüllt'
  | 'Weitergeleitet / eskaliert'
  | 'Kein Fehler feststellbar'
  | 'Duplikat'
  | 'Vom Benutzer zurückgezogen'

export interface TicketNote {
  id: string
  author: string // "Azubi" / Anzeigename / "System"
  text: string
  time: ISODate
}

export interface Ticket {
  id: string // "T-10234"
  kind: TicketKind
  title: string
  description: string
  requester: string // sam
  channel: Channel
  category: TicketCategory
  impact: 1 | 2 | 3 // 1 = hoch (viele betroffen)
  urgency: 1 | 2 | 3 // 1 = hoch
  priority: Priority
  status: TicketStatus
  assignee?: string // "trainee" oder Name
  assignmentGroup: AssignmentGroup
  createdAt: ISODate
  updatedAt: ISODate
  firstResponseAt?: ISODate
  slaResponseDue: ISODate
  slaResolveDue: ISODate
  resolvedAt?: ISODate
  resolutionCode?: ResolutionCode
  resolutionNote?: string
  workNotes: TicketNote[] // intern
  comments: TicketNote[] // an den Benutzer (wird als Mail verschickt)
  attachments: { name: string; content: string }[]
  linkedAssets: string[]
  linkedKb: string[]
  /** Verknüpfung zum Trainingsszenario */
  scenarioId?: string
  scenarioCtx?: ScenarioCtx
  score?: ScoreResult
  timeSpentMin: number
  /** Tickets aus Seed-Daten (Historie), nicht bewertbar */
  historical?: boolean
  tags: string[]
}

export interface ScenarioCtx {
  ticketId: string
  startedAt: ISODate
  requester: string
  /** Vom Setup erzeugte Werte (z.B. BitLocker-Key, Ziel-Asset, neues Kennwort) */
  vars: Record<string, string>
  hintsUsed: number
}

export interface MailMessage {
  id: string
  folder: 'Posteingang' | 'Gesendet' | 'Archiv' | 'Papierkorb'
  from: { name: string; address: string }
  to: string[]
  cc: string[]
  subject: string
  body: string
  date: ISODate
  read: boolean
  flagged: boolean
  ticketId?: string
  attachments: { name: string; sizeKb: number; content?: string }[]
  /** Phishing-Training: Mail ist bösartig */
  malicious?: boolean
  headers?: Record<string, string>
}

export interface ChatMessage {
  id: string
  from: 'tech' | 'user' | 'system'
  text: string
  time: ISODate
}

export interface ChatThread {
  id: string
  with: string // sam
  ticketId?: string
  scenarioId?: string
  messages: ChatMessage[]
  unread: number
  open: boolean
  /** Benutzer tippt gerade (UI) */
  typing?: boolean
}

export interface Call {
  id: string
  from: string // sam
  number: string
  ticketId?: string
  scenarioId?: string
  state: 'klingelt' | 'aktiv' | 'gehalten' | 'beendet' | 'verpasst'
  ringingSince: ISODate
  startedAt?: ISODate
  endedAt?: ISODate
  transcript: ChatMessage[]
  direction: 'eingehend' | 'ausgehend'
}

// ───────────────────────────── Bewertung ─────────────────────────────

export interface ScoreItem {
  label: string
  ok: boolean
  points: number // erreichte Punkte (bei Abzügen negativ)
  max: number
  hint?: string
}

export interface ScoreSection {
  key: 'technik' | 'dokumentation' | 'kommunikation' | 'prozess' | 'abzuege'
  label: string
  earned: number
  max: number
  items: ScoreItem[]
}

export interface ScoreResult {
  ticketId: string
  scenarioId: string
  scenarioTitle: string
  earned: number
  max: number
  percent: number
  grade: 'Sehr gut' | 'Gut' | 'Befriedigend' | 'Ausreichend' | 'Mangelhaft' | 'Ungenügend'
  passed: boolean
  sections: ScoreSection[]
  feedback: string[]
  durationMin: number
  hintsUsed: number
  evaluatedAt: ISODate
  solution: string[]
}

// ───────────────────────────── Aktionsprotokoll ─────────────────────────────

export interface ActionEntry {
  id: string
  time: ISODate
  type: string // siehe core/actions.ts
  /** Ticket, an dem gerade gearbeitet wurde */
  ticketId?: string
  target?: string
  detail?: string
}

// ───────────────────────────── Welt ─────────────────────────────

export interface Person {
  /** Technikerprofil des Azubis */
  name: string
  sam: string
  workstation: string
}

export interface ShiftState {
  active: boolean
  startedAt?: ISODate
  difficulty: 1 | 2 | 3 | 0 // 0 = gemischt
  nextArrivalAt?: ISODate
  intervalMin: number
  spawned: string[] // Szenario-IDs dieser Schicht
  maxTickets: number
}

export interface World {
  version: number
  createdAt: ISODate
  company: { name: string; legalName: string; address: string; phone: string; helpdeskPhone: string; helpdeskMail: string }
  tech: Person
  domain: AdDomain
  ous: AdOu[]
  users: AdUser[]
  groups: AdGroup[]
  computers: AdComputer[]
  /** Materialisierte Endpunkte (lazy erzeugt über ensureEndpoint) */
  endpoints: Record<string, Endpoint>
  infra: Infrastructure
  cloud: CloudTenant
  assets: Asset[]
  shipments: Shipment[]
  kb: KbArticle[]
  tickets: Ticket[]
  mails: MailMessage[]
  chats: ChatThread[]
  calls: Call[]
  actionLog: ActionEntry[]
  shift: ShiftState
  counters: { ticket: number; shipment: number; pid: number; asset: number; misc: number }
}
