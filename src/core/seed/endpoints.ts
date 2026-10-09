// Erzeugt den vollständigen (simulierten) Zustand eines Windows-Clients.
// Endpunkte werden lazy erzeugt (ensureEndpoint), damit der gespeicherte Zustand klein bleibt.

import type { AdComputer, AdUser, Device, Endpoint, FsNode, InstalledApp, NetAdapter, RegKey, RegValue, StartupItem, WinEvent, WinProcess, WinService } from '../types'
import { daysAgo, hashString, nowIso, rng, uid } from '../util'
import { deptByName } from './company'

const svc = (name: string, displayName: string, description: string, startType: WinService['startType'] = 'Automatisch', status: WinService['status'] = 'Wird ausgeführt', account = 'Lokales System', dependsOn?: string[]): WinService => ({
  name,
  displayName,
  description,
  startType,
  status,
  account,
  dependsOn,
})

export function clientServices(notebook: boolean): WinService[] {
  return [
    svc('Appinfo', 'Anwendungsinformationen', 'Erleichtert das Ausführen von interaktiven Anwendungen mit zusätzlichen Administratorrechten.', 'Manuell'),
    svc('AudioEndpointBuilder', 'Windows-Audio-Endpunkterstellung', 'Verwaltet Audiogeräte für den Windows-Audiodienst.'),
    svc('Audiosrv', 'Windows-Audio', 'Verwaltet die Audiowiedergabe für Windows-basierte Programme.', 'Automatisch', 'Wird ausgeführt', 'Lokaler Dienst', ['AudioEndpointBuilder']),
    svc('BITS', 'Intelligenter Hintergrundübertragungsdienst', 'Überträgt Dateien im Hintergrund unter Verwendung von Leerlaufbandbreite.', 'Manuell'),
    svc('BFE', 'Basisfiltermodul', 'Verwaltet Firewall- und IPsec-Richtlinien.', 'Automatisch', 'Wird ausgeführt', 'Lokaler Dienst'),
    svc('CryptSvc', 'Kryptografiedienste', 'Stellt Verwaltungsdienste für Zertifikate und Signaturen bereit.', 'Automatisch', 'Wird ausgeführt', 'Netzwerkdienst'),
    svc('Dhcp', 'DHCP-Client', 'Registriert und aktualisiert IP-Adressen und DNS-Einträge für diesen Computer.', 'Automatisch', 'Wird ausgeführt', 'Lokaler Dienst'),
    svc('Dnscache', 'DNS-Client', 'Speichert DNS-Namen im Cache und registriert den vollständigen Computernamen.', 'Automatisch', 'Wird ausgeführt', 'Netzwerkdienst'),
    svc('EventLog', 'Windows-Ereignisprotokoll', 'Verwaltet Ereignisse und Ereignisprotokolle.', 'Automatisch', 'Wird ausgeführt', 'Lokaler Dienst'),
    svc('gpsvc', 'Gruppenrichtlinienclient', 'Wendet vom Administrator konfigurierte Einstellungen an.'),
    svc('LanmanServer', 'Server', 'Unterstützt Datei-, Druck- und Named-Pipe-Freigabe.'),
    svc('LanmanWorkstation', 'Arbeitsstationsdienst', 'Erstellt und wartet Clientnetzwerkverbindungen mit Remoteservern (SMB). Ohne diesen Dienst sind Netzlaufwerke nicht verfügbar.', 'Automatisch', 'Wird ausgeführt', 'Netzwerkdienst'),
    svc('mpssvc', 'Windows Defender Firewall', 'Schützt den Computer vor unberechtigtem Zugriff.', 'Automatisch', 'Wird ausgeführt', 'Lokaler Dienst', ['BFE']),
    svc('Netlogon', 'Anmeldedienst', 'Unterhält einen sicheren Kanal zwischen diesem Computer und dem Domänencontroller.', 'Automatisch', 'Wird ausgeführt', 'Lokales System', ['LanmanWorkstation']),
    svc('NlaSvc', 'Netzwerklistendienst', 'Erkennt Netzwerke und Netzwerkprofile.', 'Automatisch', 'Wird ausgeführt', 'Netzwerkdienst'),
    svc('PlugPlay', 'Plug & Play', 'Ermöglicht dem Computer, Änderungen an der Hardware zu erkennen.', 'Manuell'),
    svc('RemoteRegistry', 'Remoteregistrierung', 'Ermöglicht Remotebenutzern das Ändern von Registrierungseinstellungen.', 'Deaktiviert', 'Beendet', 'Lokaler Dienst'),
    svc('Spooler', 'Druckwarteschlange', 'Lädt Dateien zum späteren Drucken in den Speicher. Ohne diesen Dienst kann nicht gedruckt werden.'),
    svc('TermService', 'Remotedesktopdienste', 'Ermöglicht Benutzern die interaktive Verbindung mit einem Remotecomputer.', 'Manuell', 'Wird ausgeführt', 'Netzwerkdienst'),
    svc('W32Time', 'Windows-Zeitgeber', 'Verwaltet die Synchronisierung von Datum und Uhrzeit mit dem Domänencontroller. Abweichungen > 5 Minuten verhindern die Kerberos-Anmeldung.', 'Manuell', 'Wird ausgeführt', 'Lokaler Dienst'),
    svc('WinDefend', 'Microsoft Defender Antivirus Service', 'Schützt Benutzer vor Schadsoftware.'),
    svc('WinRM', 'Windows-Remoteverwaltung (WS-Verwaltung)', 'Ermöglicht PowerShell-Remoting (Invoke-Command / Enter-PSSession).', 'Automatisch', 'Wird ausgeführt', 'Netzwerkdienst'),
    svc('Winmgmt', 'Windows-Verwaltungsinstrumentation', 'Stellt eine Schnittstelle für den Zugriff auf Verwaltungsinformationen bereit (WMI).'),
    svc('WSearch', 'Windows Search', 'Stellt Inhaltsindizierung und Suchergebnisse bereit.', 'Automatisch (Verzögerter Start)'),
    svc('wscsvc', 'Sicherheitscenter', 'Überwacht Sicherheitseinstellungen.', 'Automatisch (Verzögerter Start)', 'Wird ausgeführt', 'Lokaler Dienst'),
    svc('wuauserv', 'Windows Update', 'Ermöglicht Erkennung, Download und Installation von Updates.', 'Manuell', 'Beendet'),
    svc('Themes', 'Designs', 'Stellt die Verwaltung von Benutzeroberflächendesigns bereit.'),
    svc('MWInventory', 'MW Inventarisierungs-Agent', 'Meldet Hard- und Softwareinventar an die IT.', 'Automatisch (Verzögerter Start)'),
    ...(notebook
      ? [
          svc('WlanSvc', 'WLAN-AutoKonfig', 'Stellt die Logik bereit, die zum Konfigurieren von WLAN-Adaptern erforderlich ist.'),
          svc('SecureLinkVPN', 'SecureLink VPN-Clientdienst', 'Stellt VPN-Verbindungen zum Firmennetz her.', 'Automatisch'),
          svc('BDESVC', 'BitLocker-Laufwerkverschlüsselungsdienst', 'Stellt BitLocker-Funktionen bereit.', 'Manuell'),
        ]
      : []),
  ]
}

export function baseProcesses(user: string, notebook: boolean, startPid = 400): WinProcess[] {
  let pid = startPid
  const p = (name: string, description: string, cpu: number, memMb: number, u = 'SYSTEM', extra: Partial<WinProcess> = {}): WinProcess => ({ pid: (pid += 4 + ((pid * 7) % 13)), name, description, user: u, cpu, memMb, ...extra })
  return [
    p('System', 'NT Kernel & System', 0.3, 4),
    p('Registry', 'Registry', 0, 60),
    p('smss.exe', 'Windows-Sitzungs-Manager', 0, 1),
    p('csrss.exe', 'Client-Server-Laufzeitprozess', 0.1, 6),
    p('wininit.exe', 'Windows-Startanwendung', 0, 7),
    p('services.exe', 'Dienste- und Controller-App', 0.1, 9),
    p('lsass.exe', 'Local Security Authority Process', 0.1, 22),
    p('svchost.exe', 'Diensthost: DCOM-Server-Prozessstart', 0.1, 24),
    p('svchost.exe', 'Diensthost: Lokales System (Netzwerk eingeschränkt)', 0.2, 41),
    p('svchost.exe', 'Diensthost: Netzwerkdienst', 0.1, 18, 'NETZWERKDIENST'),
    p('spoolsv.exe', 'Spoolersubsystem-App', 0, 12, 'SYSTEM', { service: 'Spooler' }),
    p('MsMpEng.exe', 'Antimalware Service Executable', 0.8, 210),
    p('SearchIndexer.exe', 'Microsoft Windows Search Indexer', 0.2, 38, 'SYSTEM', { service: 'WSearch' }),
    p('explorer.exe', 'Windows-Explorer', 0.6, 145, user),
    p('msedge.exe', 'Webbrowser', 1.2, 420, user),
    p('OUTLOOK.EXE', 'E-Mail-Client', 0.5, 310, user),
    p('Teams.exe', 'Chat & Besprechungen', 0.9, 380, user),
    p('OneDrive.exe', 'Cloud-Speicher-Synchronisierung', 0.1, 70, user),
    p('ERPClient.exe', 'MW ERP Client', 0.3, 190, user),
    p('taskhostw.exe', 'Hostprozess für Windows-Aufgaben', 0, 12, user),
    ...(notebook ? [p('SecureLinkTray.exe', 'SecureLink VPN Statusanzeige', 0, 18, user)] : []),
  ]
}

export function baseStartup(notebook: boolean): StartupItem[] {
  return [
    { name: 'OneDrive', publisher: 'Cloud-Speicher', command: '"C:\\Program Files\\OneDrive\\OneDrive.exe" /background', enabled: true, impact: 'Hoch' },
    { name: 'Teams', publisher: 'Chat & Besprechungen', command: '"C:\\Program Files\\Teams\\Teams.exe" --autostart', enabled: true, impact: 'Hoch' },
    { name: 'Windows Security notification icon', publisher: 'Microsoft Corporation', command: '%windir%\\system32\\SecurityHealthSystray.exe', enabled: true, impact: 'Niedrig' },
    ...(notebook ? [{ name: 'SecureLink VPN', publisher: 'SecureLink Networks', command: '"C:\\Program Files\\SecureLink\\SecureLinkTray.exe"', enabled: true, impact: 'Mittel' as const }] : []),
  ]
}

const rv = (name: string, type: RegValue['type'], data: string | number): RegValue => ({ name, type, data })
const rk = (name: string, values: RegValue[] = [], subkeys: RegKey[] = []): RegKey => ({ name, values, subkeys })

export function buildRegistry(hostname: string, user: AdUser | undefined, startup: StartupItem[]): RegKey {
  const sam = user?.sam ?? 'administrator'
  return rk('Computer', [], [
    rk('HKEY_CLASSES_ROOT', [], [rk('.txt', [rv('', 'REG_SZ', 'txtfile')]), rk('.pdf', [rv('', 'REG_SZ', 'PDFReader.Document')]), rk('http', [rv('', 'REG_SZ', 'URL:HyperText Transfer Protocol')])]),
    rk('HKEY_CURRENT_USER', [], [
      rk('Control Panel', [], [
        rk('Desktop', [rv('Wallpaper', 'REG_SZ', 'C:\\Windows\\Web\\Wallpaper\\Musterwerk\\mw-wallpaper.jpg'), rv('ScreenSaveTimeOut', 'REG_SZ', '600'), rv('ScreenSaverIsSecure', 'REG_SZ', '1')]),
        rk('International', [rv('LocaleName', 'REG_SZ', 'de-DE'), rv('sShortDate', 'REG_SZ', 'dd.MM.yyyy')]),
      ]),
      rk('Environment', [rv('TEMP', 'REG_EXPAND_SZ', '%USERPROFILE%\\AppData\\Local\\Temp'), rv('TMP', 'REG_EXPAND_SZ', '%USERPROFILE%\\AppData\\Local\\Temp')]),
      rk('Network', []),
      rk('Printers', [], [rk('Defaults', [])]),
      rk('Software', [], [
        rk('Microsoft', [], [
          rk('Office', [], [rk('16.0', [], [rk('Outlook', [], [rk('Profiles', [], [rk('Outlook', [rv('Account', 'REG_SZ', user?.mail ?? '')])])])])]),
          rk('Windows', [], [
            rk('CurrentVersion', [], [
              rk('Internet Settings', [rv('ProxyEnable', 'REG_DWORD', 0), rv('ProxyServer', 'REG_SZ', 'proxy.musterwerk.local:8080'), rv('ProxyOverride', 'REG_SZ', '*.musterwerk.local;10.*;<local>'), rv('AutoDetect', 'REG_DWORD', 0)]),
              rk(
                'Run',
                startup.filter((s) => !s.publisher.startsWith('Microsoft')).map((s) => rv(s.name, 'REG_SZ', s.command)),
              ),
              rk('Explorer', [], [rk('Shell Folders', [rv('Desktop', 'REG_SZ', `C:\\Users\\${sam}\\Desktop`), rv('Personal', 'REG_SZ', `C:\\Users\\${sam}\\Documents`)])]),
            ]),
          ]),
        ]),
        rk('Musterwerk', [], [rk('ERPClient', [rv('Server', 'REG_SZ', 'erp.musterwerk.local'), rv('Port', 'REG_DWORD', 4711), rv('LastUser', 'REG_SZ', sam)])]),
        rk('Policies', []),
      ]),
    ]),
    rk('HKEY_LOCAL_MACHINE', [], [
      rk('HARDWARE', [], [rk('DESCRIPTION', [], [rk('System', [], [rk('BIOS', [rv('BIOSVendor', 'REG_SZ', 'Nordtec Computer'), rv('SystemProductName', 'REG_SZ', 'Nordtec Workstation')])])])]),
      rk('SAM', []),
      rk('SECURITY', []),
      rk('SOFTWARE', [], [
        rk('Microsoft', [], [
          rk('Windows NT', [], [
            rk('CurrentVersion', [
              rv('ProductName', 'REG_SZ', 'Windows 11 Enterprise'),
              rv('DisplayVersion', 'REG_SZ', '24H2'),
              rv('CurrentBuild', 'REG_SZ', '26100'),
              rv('RegisteredOrganization', 'REG_SZ', 'Musterwerk AG'),
              rv('RegisteredOwner', 'REG_SZ', 'IT Musterwerk'),
              rv('InstallDate', 'REG_DWORD', 1735689600),
            ], [rk('Winlogon', [rv('DefaultDomainName', 'REG_SZ', 'MUSTERWERK'), rv('DefaultUserName', 'REG_SZ', sam), rv('AutoAdminLogon', 'REG_SZ', '0'), rv('Shell', 'REG_SZ', 'explorer.exe')])]),
          ]),
          rk('Windows', [], [
            rk('CurrentVersion', [], [
              rk('Run', [rv('SecurityHealth', 'REG_EXPAND_SZ', '%windir%\\system32\\SecurityHealthSystray.exe')]),
              rk('Uninstall', []),
              rk('Policies', [], [rk('System', [rv('EnableLUA', 'REG_DWORD', 1), rv('ConsentPromptBehaviorAdmin', 'REG_DWORD', 5)])]),
            ]),
          ]),
          rk('Windows Defender', [rv('DisableAntiSpyware', 'REG_DWORD', 0)], [rk('Real-Time Protection', [rv('DisableRealtimeMonitoring', 'REG_DWORD', 0)])]),
        ]),
        rk('Musterwerk', [rv('Standort', 'REG_SZ', user ? deptByName(user.department)?.office ?? '' : ''), rv('Inventarnummer', 'REG_SZ', ''), rv('Image', 'REG_SZ', 'MW-Win11-2026.03')]),
        rk('Policies', [], [
          rk('Microsoft', [], [
            rk('Windows', [], [
              rk('WindowsUpdate', [rv('WUServer', 'REG_SZ', 'http://app01.musterwerk.local:8530'), rv('WUStatusServer', 'REG_SZ', 'http://app01.musterwerk.local:8530')], [rk('AU', [rv('NoAutoUpdate', 'REG_DWORD', 0), rv('AUOptions', 'REG_DWORD', 4)])]),
            ]),
          ]),
        ]),
      ]),
      rk('SYSTEM', [], [
        rk('CurrentControlSet', [], [
          rk('Control', [], [
            rk('ComputerName', [], [rk('ComputerName', [rv('ComputerName', 'REG_SZ', hostname)])]),
            rk('TimeZoneInformation', [rv('TimeZoneKeyName', 'REG_SZ', 'W. Europe Standard Time')]),
            rk('Terminal Server', [rv('fDenyTSConnections', 'REG_DWORD', 0)]),
            rk('Print', [], [rk('Printers', [])]),
          ]),
          rk('Services', [], [
            rk('USBSTOR', [rv('Start', 'REG_DWORD', 3), rv('Type', 'REG_DWORD', 1), rv('ImagePath', 'REG_EXPAND_SZ', '\\SystemRoot\\System32\\drivers\\USBSTOR.SYS')]),
            rk('Tcpip', [], [rk('Parameters', [rv('Hostname', 'REG_SZ', hostname), rv('Domain', 'REG_SZ', 'musterwerk.local'), rv('NV Domain', 'REG_SZ', 'musterwerk.local'), rv('SearchList', 'REG_SZ', 'musterwerk.local')])]),
            rk('W32Time', [], [rk('Parameters', [rv('Type', 'REG_SZ', 'NT5DS'), rv('NtpServer', 'REG_SZ', 'time.windows.com,0x9')])]),
            rk('Spooler', [rv('Start', 'REG_DWORD', 2), rv('DisplayName', 'REG_SZ', 'Druckwarteschlange')]),
            rk('LanmanWorkstation', [rv('Start', 'REG_DWORD', 2)], [rk('Parameters', [rv('EnableSecuritySignature', 'REG_DWORD', 1)])]),
          ]),
        ]),
      ]),
    ]),
    rk('HKEY_USERS', [], [rk('.DEFAULT', []), rk('S-1-5-18', [])]),
    rk('HKEY_CURRENT_CONFIG', [], [rk('Software', []), rk('System', [])]),
  ])
}

const dir = (name: string, children: FsNode[] = [], extra: Partial<FsNode> = {}): FsNode => ({ name, type: 'dir', children, modified: daysAgo(30), ...extra })
const file = (name: string, sizeMb: number, content?: string, extra: Partial<FsNode> = {}): FsNode => ({ name, type: 'file', sizeMb, content, modified: daysAgo(3), ...extra })

export const DEFAULT_HOSTS = `# HOSTS-Datei (Musterwerk Standard-Image)
#
# Statische Zuordnung von Hostnamen zu IP-Adressen.
# Einträge hier haben Vorrang vor DNS!
# Format: <IP-Adresse>  <Hostname>   # Kommentar
#
# 127.0.0.1   localhost
# ::1         localhost
`

export function buildFs(sam: string, displayName: string, dept: string): Record<string, FsNode> {
  const userDir = dir(sam, [
    dir('Desktop', [file('ERP-Client.lnk', 0.01), file(`Notizen ${displayName.split(' ')[0]}.txt`, 0.01, 'Rückruf Kunde Jansen wg. Angebot\nTeammeeting Do 10 Uhr')]),
    dir('Documents', [
      dir(dept, [file('Vorlage_Angebot.docx', 0.08), file('Reisekosten_2026.xlsx', 0.05)]),
      file('Lebenslauf_alt.docx', 0.04),
    ]),
    dir('Downloads', [file('Rechnung_Lieferant_0925.pdf', 0.3), file('setup_druckertreiber.exe', 48), file('Präsentation_final_v3.pptx', 22)]),
    dir('Pictures', [file('Firmenfeier.jpg', 4.2)]),
    dir('AppData', [dir('Local', [dir('Temp', [file('~tmp001.tmp', 1.4), file('installer.log', 0.2, 'Installation erfolgreich abgeschlossen.')]), dir('Microsoft', [dir('Outlook', [file(`${sam}@musterwerk.example.ost`, 2300)])])]), dir('Roaming', [])], { hidden: true }),
  ])
  return {
    'C:': dir('C:', [
      dir('PerfLogs', []),
      dir('Program Files', [dir('Office', [file('WINWORD.EXE', 2.1), file('EXCEL.EXE', 2.4), file('OUTLOOK.EXE', 3.1)]), dir('Teams', [file('Teams.exe', 120)]), dir('OneDrive', [file('OneDrive.exe', 40)]), dir('MW ERP Client', [file('ERPClient.exe', 85), file('erpclient.ini', 0.01, '[Server]\nHost=erp.musterwerk.local\nPort=4711\n')])]),
      dir('Program Files (x86)', [dir('PDF Reader', [file('PDFReader.exe', 65)])]),
      dir('ProgramData', [dir('Musterwerk', [file('inventory.xml', 0.02)])], { hidden: true }),
      dir('Users', [userDir, dir('Public', [dir('Desktop', [])]), dir('Default', [], { hidden: true })]),
      dir('Windows', [
        dir('System32', [
          dir('drivers', [dir('etc', [file('hosts', 0.001, DEFAULT_HOSTS), file('networks', 0.001, '# networks\nloopback 127\n'), file('services', 0.02, '# services')])]),
          file('cmd.exe', 0.3),
          file('notepad.exe', 0.2),
          file('ipconfig.exe', 0.03),
        ], { system: true }),
        dir('Temp', [file('MpCmdRun.log', 0.4), file('cab_4612_2.tmp', 3)]),
        dir('Logs', [dir('CBS', [file('CBS.log', 12)])]),
        dir('SoftwareDistribution', [dir('Download', [file('kb-update-2026-09.cab', 410)])]),
        dir('Web', [dir('Wallpaper', [dir('Musterwerk', [file('mw-wallpaper.jpg', 1.1)])])]),
      ], { system: true }),
    ]),
  }
}

export function buildDevices(notebook: boolean, seed: number): Device[] {
  const r = rng(seed)
  const d = (name: string, category: string, manufacturer: string, driverVersion: string): Device => ({ id: uid('dev'), name, category, status: 'OK', driverVersion, driverDate: `${1 + Math.floor(r() * 27)}.0${1 + Math.floor(r() * 8)}.2025`, manufacturer })
  return [
    d('Intel(R) Core(TM) i5-1345U', 'Prozessoren', 'Intel', '10.0.26100.1'),
    d('Intel(R) Iris(R) Xe Graphics', 'Grafikkarten', 'Intel Corporation', '31.0.101.5592'),
    d('Intel(R) Ethernet Connection I219-LM', 'Netzwerkadapter', 'Intel', '12.19.2.45'),
    ...(notebook ? [d('Intel(R) Wi-Fi 6E AX211 160MHz', 'Netzwerkadapter', 'Intel Corporation', '23.60.0.10'), d('SecureLink Virtual Adapter', 'Netzwerkadapter', 'SecureLink Networks', '5.2.1.0'), d('Integrated Camera', 'Kameras', 'Chicony', '10.0.26100.1'), d('Intel(R) Wireless Bluetooth(R)', 'Bluetooth', 'Intel Corporation', '23.60.0.1')] : []),
    d('Realtek(R) Audio', 'Audio, Video und Gamecontroller', 'Realtek', '6.0.9549.1'),
    d('Generischer PnP-Monitor', 'Monitore', '(Standardmonitortypen)', '10.0.26100.1'),
    d('HID-Tastatur', 'Tastaturen', '(Standardtastaturen)', '10.0.26100.1'),
    d('HID-konforme Maus', 'Mäuse und andere Zeigegeräte', 'Microsoft', '10.0.26100.1'),
    d('Samsung SSD 980 512GB', 'Laufwerke', '(Standardlaufwerke)', '10.0.26100.1'),
    d('USB-Root-Hub (USB 3.0)', 'USB-Controller', '(Standard-USB-Hostcontroller)', '10.0.26100.1'),
    d('USB-Massenspeichergerät', 'USB-Controller', 'Compatible USB storage device', '10.0.26100.1'),
    d('Trusted Platform Module 2.0', 'Sicherheitsgeräte', '(Standard)', '10.0.26100.1'),
  ]
}

export function baseApps(notebook: boolean): InstalledApp[] {
  const a = (name: string, publisher: string, version: string, sizeMb: number): InstalledApp => ({ name, publisher, version, installed: '12.03.2026', sizeMb })
  return [
    a('Office-Paket 2024 (Word, Excel, PowerPoint, Outlook)', 'Office-Hersteller', '16.0.18025', 2400),
    a('Teams (Chat & Besprechungen)', 'Office-Hersteller', '25.214.0', 610),
    a('Webbrowser (Chromium-basiert)', 'Browser-Hersteller', '129.0.2792', 520),
    a('PDF Reader', 'PDF Software GmbH', '24.3.1', 420),
    a('7-Zip 24.08 (x64)', 'Igor Pavlov', '24.08', 5),
    a('MW ERP Client', 'Musterwerk IT', '8.4.2', 390),
    a('MW Inventarisierungs-Agent', 'Musterwerk IT', '2.1.0', 12),
    ...(notebook ? [a('SecureLink VPN Client', 'SecureLink Networks', '5.2.1', 85)] : []),
  ]
}

export function baseEvents(hostname: string, user: string, seed: number): WinEvent[] {
  const r = rng(seed)
  const e = (log: WinEvent['log'], eventId: number, level: WinEvent['level'], source: string, message: string, d: number): WinEvent => ({ id: uid('ev'), log, eventId, level, source, message, time: daysAgo(d + r() * 0.1), computer: `${hostname}.musterwerk.local`, user })
  return [
    e('System', 6005, 'Informationen', 'EventLog', 'Der Ereignisprotokolldienst wurde gestartet.', 1.2),
    e('System', 6013, 'Informationen', 'EventLog', 'Die Systembetriebszeit beträgt 4231 Sekunden.', 1.1),
    e('System', 7036, 'Informationen', 'Service Control Manager', 'Der Dienst "Windows Update" befindet sich jetzt im Status "Beendet".', 0.9),
    e('System', 1014, 'Warnung', 'Microsoft-Windows-DNS Client Events', 'Timeout bei der Namensauflösung für den Namen "wpad.musterwerk.local", nachdem keiner der konfigurierten DNS-Server geantwortet hat.', 0.8),
    e('System', 1500, 'Informationen', 'Microsoft-Windows-GroupPolicy', 'Die Gruppenrichtlinieneinstellungen für den Computer wurden erfolgreich verarbeitet.', 0.7),
    e('System', 1501, 'Informationen', 'Microsoft-Windows-GroupPolicy', `Die Gruppenrichtlinieneinstellungen für den Benutzer MUSTERWERK\\${user} wurden erfolgreich verarbeitet.`, 0.7),
    e('System', 10016, 'Warnung', 'DistributedCOM', 'Durch die Berechtigungseinstellungen für "Anwendungsspezifisch" wird dem Benutzer NT-AUTORITÄT\\LOKALER DIENST keine Berechtigung für Lokal Aktivierung erteilt.', 0.6),
    e('System', 37, 'Informationen', 'Microsoft-Windows-Time-Service', 'Der Zeitanbieter NtpClient empfängt gültige Zeitdaten von dc01.musterwerk.local.', 0.5),
    e('Anwendung', 1000, 'Fehler', 'Application Error', 'Name der fehlerhaften Anwendung: ERPClient.exe, Version: 8.4.2.0. Ausnahmecode: 0xc0000005.', 3.2),
    e('Anwendung', 1033, 'Informationen', 'MsiInstaller', 'Windows Installer hat das Produkt installiert. Produktname: PDF Reader. Version: 24.3.1.', 5),
    e('Anwendung', 916, 'Informationen', 'ESENT', 'svchost (4412,G,98) Der Beta-Feature "EseDiskFlushConsistency" ist aktiviert.', 0.4),
    e('Anwendung', 1001, 'Informationen', 'Windows Error Reporting', 'Fehlerbucket , Typ 0. Ereignisname: BlueScreen (keine Daten).', 12),
    e('Sicherheit', 4624, 'Überprüfung erfolgreich', 'Microsoft-Windows-Security-Auditing', `Ein Konto wurde erfolgreich angemeldet. Kontoname: ${user}, Anmeldetyp: 2 (Interaktiv).`, 0.3),
    e('Sicherheit', 4634, 'Überprüfung erfolgreich', 'Microsoft-Windows-Security-Auditing', `Ein Konto wurde abgemeldet. Kontoname: ${user}.`, 1.3),
    e('Setup', 2, 'Informationen', 'Microsoft-Windows-Servicing', 'Das Paket "KB5044284" wurde erfolgreich in den Status "Installiert" geändert.', 9),
  ]
}

export interface EndpointSeedInput {
  computer: AdComputer
  user?: AdUser
  /** Adresse aus DHCP-Scope */
  ip: string
  network: string
  gateway: string
}

export function buildEndpoint({ computer, user, ip, network, gateway }: EndpointSeedInput): Endpoint {
  const notebook = computer.name.startsWith('NB-')
  const seed = hashString(computer.name)
  const r = rng(seed)
  const sam = user?.sam ?? 'administrator'
  const hex = () => Math.floor(r() * 256).toString(16).padStart(2, '0').toUpperCase()
  const mac = () => ['3C', '52', '82', hex(), hex(), hex()].join('-')
  const home = !!user?.homeOffice && notebook
  const adapters: NetAdapter[] = [
    {
      name: 'Ethernet',
      description: 'Intel(R) Ethernet Connection I219-LM',
      mac: mac(),
      kind: 'Ethernet',
      enabled: true,
      mediaConnected: !home && !notebook,
      dhcp: true,
      ip: !home && !notebook ? ip : '',
      mask: '255.255.255.0',
      gateway: !home && !notebook ? gateway : '',
      dnsServers: ['10.10.0.10', '10.10.0.11'],
      dnsFromDhcp: true,
      speedMbps: 1000,
      network: notebook ? (home ? 'none' : network) : network,
    },
  ]
  if (notebook) {
    adapters.push({
      name: 'WLAN',
      description: 'Intel(R) Wi-Fi 6E AX211 160MHz',
      mac: mac(),
      kind: 'WLAN',
      enabled: true,
      mediaConnected: true,
      dhcp: true,
      ip: home ? `192.168.178.${20 + Math.floor(r() * 30)}` : ip.replace(/^10\.10\.\d+\./, '10.10.60.'),
      mask: '255.255.255.0',
      gateway: home ? '192.168.178.1' : '10.10.60.1',
      dnsServers: home ? ['192.168.178.1'] : ['10.10.0.10', '10.10.0.11'],
      dnsFromDhcp: true,
      ssid: home ? 'FRITZ!Box-Heimnetz' : 'MW-Office',
      speedMbps: 866,
      network: home ? 'home' : '10.10.60.0',
    })
    adapters.push({
      name: 'SecureLink VPN',
      description: 'SecureLink Virtual Adapter',
      mac: mac(),
      kind: 'VPN',
      enabled: true,
      mediaConnected: false,
      dhcp: true,
      ip: '',
      mask: '255.255.255.0',
      gateway: '',
      dnsServers: ['10.10.0.10', '10.10.0.11'],
      dnsFromDhcp: true,
      network: '10.10.99.0',
    })
  }
  const startup = baseStartup(notebook)
  const processes = baseProcesses(sam, notebook)
  const totalGb = notebook ? 512 : 256
  const usedGb = Math.round(totalGb * (0.35 + r() * 0.25))
  return {
    hostname: computer.name,
    kind: notebook ? 'Notebook' : 'Desktop',
    os: 'Windows 11 Enterprise',
    osBuild: '24H2 (Build 26100.2033)',
    manufacturer: notebook ? 'Nordtec Computer' : 'Delta Computer',
    model: notebook ? 'ProBook 14 G10' : 'OptiDesk 7020 SFF',
    serial: `MW${(seed % 90000000) + 10000000}`,
    cpu: 'Intel(R) Core(TM) i5-1345U @ 1.60GHz',
    ramGb: 16,
    loggedOnUser: user?.sam,
    domainJoined: true,
    timeOffsetMin: 0,
    timeZone: '(UTC+01:00) Amsterdam, Berlin, Bern, Rom, Stockholm, Wien',
    online: true,
    locked: false,
    adapters,
    dnsCache: {},
    services: clientServices(notebook),
    processes,
    startupApps: startup,
    printers: [
      { name: 'Microsoft Print to PDF', driver: 'Microsoft Print To PDF', port: 'PORTPROMPT:', isDefault: false, status: 'Bereit', jobs: [] },
      { name: 'OneNote (Desktop)', driver: 'Send to Microsoft OneNote 16 Driver', port: 'nul:', isDefault: false, status: 'Bereit', jobs: [] },
    ],
    disks: [
      {
        number: 0,
        model: notebook ? 'Samsung SSD 980 512GB' : 'Samsung SSD 870 256GB',
        sizeGb: totalGb,
        kind: 'SSD',
        status: 'Online',
        partitionStyle: 'GPT',
        smart: 'OK',
        partitions: [
          { id: 'p1', type: 'EFI', sizeGb: 0.1, usedGb: 0.03, fs: 'FAT32', health: 'Fehlerfrei' },
          { id: 'p2', type: 'Primär', sizeGb: totalGb - 1.1, usedGb, letter: 'C', label: 'Windows', fs: 'NTFS', bitlocker: notebook ? 'Ein' : 'Aus', health: 'Fehlerfrei' },
          { id: 'p3', type: 'Wiederherstellung', sizeGb: 1, usedGb: 0.6, fs: 'NTFS', health: 'Fehlerfrei' },
        ],
      },
    ],
    fs: buildFs(sam, user?.displayName ?? 'Administrator', user?.department || 'IT'),
    mappedDrives: [],
    registry: buildRegistry(computer.name, user, startup),
    events: baseEvents(computer.name, sam, seed),
    devices: buildDevices(notebook, seed),
    installedApps: baseApps(notebook),
    firewall: { domain: true, private: true, public: true },
    gpo: { lastApplied: daysAgo(0.05), pending: false },
    tokenGroups: [],
    pendingReboot: false,
    lastBoot: daysAgo(1 + r() * 3),
    vpn: { installed: notebook, connected: false, profile: 'MW-Firmennetz' },
    outlook: { configured: true },
    flags: { createdAt: nowIso() },
  }
}
