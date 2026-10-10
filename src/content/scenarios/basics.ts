// Grundlagen-Szenarien (Vorlagen für weitere Szenarien)

import { A } from '@/core/actions'
import { findUser, isMemberOf, lockUser, primaryComputerOf } from '@/core/ops/ad'
import { addEvent, findService, getEndpoint, isServiceRunning, printDocument, printerEffectiveStatus } from '@/core/ops/endpoint'
import { connectivity } from '@/core/sim/network'
import type { Scenario } from '@/core/scenarios/types'
import type { World } from '@/core/types'

const pcOf = (w: World, sam: string) => primaryComputerOf(w, sam)?.name ?? ''
const loggedFor = (w: World, ticketId: string, type: string) => w.actionLog.some((a) => a.ticketId === ticketId && a.type === type)

/** Telefon: Konto gesperrt, Ursache = altes Kennwort im Smartphone-Mailkonto */
export const lockoutPhone: Scenario = {
  id: 'konto-gesperrt-telefon',
  title: 'Konto gesperrt nach Urlaub',
  summary: 'Anruf annehmen, Identität prüfen, Konto entsperren, Sperrquelle im DC-Protokoll finden und dokumentieren.',
  difficulty: 1,
  category: 'Konto & Zugriff',
  skills: ['Telefon', 'Identitätsprüfung', 'Active Directory', 'Ereignisanzeige'],
  requester: 'l.schulz',
  channel: 'Telefon',
  ticket: { title: 'Anmeldung nicht möglich – Konto gesperrt', description: 'Benutzerin kann sich nicht anmelden, Meldung "Das Konto ist gesperrt".' },
  expected: { priority: ['P3 – Mittel', 'P2 – Hoch'], category: 'Konto & Zugriff', resolutionCodes: ['Gelöst (dauerhaft)'] },
  identityRequired: true,
  setup: (w, ctx) => {
    const u = findUser(w, 'l.schulz')!
    lockUser(w, u.sam, pcOf(w, u.sam), 5)
    ctx.vars.computer = pcOf(w, u.sam)
  },
  checks: [
    { id: 'unlocked', label: 'Konto von Lea Schulz entsperrt', points: 10, test: (w) => !findUser(w, 'l.schulz')?.lockedOut, hint: 'Active Directory → Benutzer → "Konto entsperren"' },
    { id: 'no-reset', label: 'Kein unnötiger Kennwort-Reset (Benutzerin kennt ihr Kennwort)', points: 4, test: (w, ctx) => !w.actionLog.some((a) => a.ticketId === ctx.ticketId && a.type === A.adPasswordReset) },
  ],
  penalties: [
    { id: 'unlock-without-id', label: 'Konto ohne Identitätsprüfung entsperrt', points: 5, test: (w, ctx) => {
      const log = w.actionLog.filter((a) => a.ticketId === ctx.ticketId)
      const unlock = log.find((a) => a.type === A.adUnlock)
      const id = log.find((a) => a.type === A.identityAsked)
      return !!unlock && (!id || id.time > unlock.time)
    } },
  ],
  workNoteKeywords: [
    { label: 'Symptom (gesperrt)', any: ['gesperrt', 'sperre', 'lockout', 'locked'] },
    { label: 'Maßnahme (entsperrt)', any: ['entsperrt', 'entsperren', 'unlock', 'freigeschaltet'] },
    { label: 'Identität geprüft', any: ['identität', 'personalnummer', 'verifiziert', 'geburtsdatum'] },
  ],
  caller: {
    intro: 'Hallo, hier ist Lea Schulz aus dem Vertriebsinnendienst. Ich war zwei Wochen im Urlaub und jetzt komme ich nicht mehr in meinen Rechner. Da steht irgendwas von "Konto gesperrt".',
    mood: 'verunsichert',
    facts: [
      { keywords: ['kennwort', 'passwort'], answer: 'Mein Passwort weiß ich eigentlich noch. Ich habe es vor dem Urlaub sogar noch geändert, weil die Erinnerung kam.' },
      { keywords: ['handy', 'smartphone', 'telefon', 'mobil', 'mails auf'], answer: 'Ja, ich habe die Firmenmails auch auf meinem privaten Handy. Das hat seit dem Urlaub ständig nach einem Passwort gefragt, das habe ich einfach weggedrückt.' },
      { keywords: ['meldung', 'fehlermeldung', 'steht da'], answer: 'Da steht: "Das referenzierte Konto ist zurzeit gesperrt und kann nicht verwendet werden."' },
    ],
    resolvedReply: 'Ja, jetzt komme ich rein! Danke! Und das mit dem Handy – soll ich da das neue Passwort eintragen?',
    unresolvedReply: 'Nein, es kommt immer noch "Konto gesperrt".',
    persona: 'Lea ist etwas nervös, weil viele Mails nach dem Urlaub warten.',
  },
  hints: [
    'Prüfe zuerst die Identität: Personalnummer und Geburtsdatum mit dem AD-Eintrag vergleichen.',
    'In der AD-Konsole siehst du auf der Registerkarte "Konto", dass das Konto gesperrt ist – dort kannst du es entsperren.',
    'Die Ursache findest du unter Infrastruktur → DC01 → Sicherheitsprotokoll (Ereignis 4740/4625). Frag nach Mobilgeräten mit altem Kennwort.',
  ],
  solution: [
    'Anruf annehmen, Ticket übernehmen, Kategorie "Konto & Zugriff", Priorität P3 (eine Person, kann nicht arbeiten → ggf. P2).',
    'Identität prüfen: Personalnummer + Geburtsdatum mit AD vergleichen.',
    'AD-Konsole: l.schulz → Konto entsperren (KEIN Kennwort-Reset nötig).',
    'Ursache: Smartphone versucht sich mit dem alten Kennwort anzumelden → Benutzerin bitten, das Kennwort im Mail-Konto des Handys zu aktualisieren.',
    'Bestätigen lassen, dass die Anmeldung funktioniert, dokumentieren und mit "Gelöst (dauerhaft)" schließen.',
  ],
  kb: ['KB0001', 'KB0002'],
}

/** E-Mail: Drucken geht nicht, weil der Spooler-Dienst beendet und deaktiviert ist */
export const spoolerMail: Scenario = {
  id: 'drucker-spooler-mail',
  title: 'Drucker "nicht verfügbar"',
  summary: 'Per Fernwartung auf den Client, Druckwarteschlangen-Dienst analysieren, starten und Starttyp korrigieren.',
  difficulty: 1,
  category: 'Drucker',
  skills: ['Remote-Desktop', 'Dienste', 'Ereignisanzeige', 'Drucker'],
  requester: 'k.neumann',
  channel: 'E-Mail',
  ticket: {
    title: 'Kann nicht mehr drucken!!',
    description: 'Hallo IT,\n\nseit heute Morgen kann ich nichts mehr drucken. In Word steht bei Drucker nur noch "Keine Drucker installiert" und der 1OG-Farbe ist weg. Die Kollegin neben mir kann drucken.\n\nIch muss dringend die Bestellungen für den Lieferanten ausdrucken.\n\nGruß\nKatrin Neumann\nEinkauf',
  },
  expected: { priority: ['P3 – Mittel'], category: 'Drucker', resolutionCodes: ['Gelöst (dauerhaft)'] },
  setup: (w, ctx) => {
    const host = pcOf(w, 'k.neumann')
    ctx.vars.computer = host
    const ep = getEndpoint(w, host)!
    const s = findService(ep.services, 'Spooler')!
    s.status = 'Beendet'
    s.startType = 'Deaktiviert'
    ep.processes = ep.processes.filter((p) => p.name !== 'spoolsv.exe')
    addEvent(ep, { log: 'System', eventId: 7031, level: 'Fehler', source: 'Service Control Manager', message: 'Der Dienst "Druckwarteschlange" wurde unerwartet beendet. Dies ist bereits 3 Mal passiert.' })
    addEvent(ep, { log: 'System', eventId: 7040, level: 'Informationen', source: 'Service Control Manager', message: 'Der Starttyp des Diensts "Druckwarteschlange" wurde von "Automatisch starten" in "Deaktiviert" geändert. (durch Optimierungs-Tool "PC-Turbo Cleaner")' })
  },
  checks: [
    { id: 'running', label: 'Druckwarteschlange läuft', points: 6, test: (w, ctx) => { const ep = getEndpoint(w, ctx.vars.computer); return !!ep && isServiceRunning(ep, 'Spooler') }, hint: 'services.msc oder "Start-Service Spooler"' },
    { id: 'auto', label: 'Starttyp wieder "Automatisch"', points: 4, test: (w, ctx) => { const ep = getEndpoint(w, ctx.vars.computer); return !!ep && !!findService(ep.services, 'Spooler')?.startType.startsWith('Automatisch') }, hint: 'Sonst ist der Fehler nach dem nächsten Neustart wieder da.' },
    { id: 'printer', label: 'Drucker 1OG-Farbe wieder verfügbar', points: 4, test: (w, ctx) => {
      const ep = getEndpoint(w, ctx.vars.computer)
      const p = ep?.printers.find((x) => x.serverQueue === '1OG-Farbe')
      return !!ep && !!p && printerEffectiveStatus(w, ep, p).ok
    } },
  ],
  workNoteKeywords: [
    { label: 'Ursache (Druckwarteschlange/Spooler)', any: ['spooler', 'druckwarteschlange', 'dienst'] },
    { label: 'Starttyp korrigiert', any: ['automatisch', 'starttyp', 'deaktiviert'] },
    { label: 'Auslöser (Optimierungs-Tool)', any: ['turbo', 'cleaner', 'tuning', 'optimier'] },
  ],
  caller: {
    intro: 'Hallo, hier Katrin Neumann. Ich habe Ihnen ja eine Mail geschrieben – ich kann nicht mehr drucken, der Drucker ist einfach weg.',
    mood: 'gestresst',
    facts: [
      { keywords: ['installiert', 'programm', 'software', 'tool', 'aufgeräumt', 'aufgeraeumt', 'verändert', 'veraendert', 'gestern'], answer: 'Ach, gestern habe ich so ein Programm "PC-Turbo Cleaner" laufen lassen, das hat mir ein Bekannter empfohlen, damit der Rechner schneller wird …' },
      { keywords: ['drucker', 'welcher'], answer: 'Normalerweise drucke ich immer auf dem 1OG-Farbe im Kopierraum.' },
      { keywords: ['neu gestartet', 'neustart'], answer: 'Neu gestartet habe ich heute früh schon – danach war es genauso.' },
      { keywords: ['kollegin', 'andere', 'nebenan'], answer: 'Herr Schwarz am Nachbarplatz kann ganz normal auf dem 1OG-Farbe drucken.' },
    ],
    resolvedReply: 'Ja, der Drucker ist wieder da und die Bestellungen kommen raus. Danke!',
    unresolvedReply: 'Nein, der Drucker ist immer noch nicht da.',
    persona: 'Katrin ist gestresst, weil Bestellungen raus müssen. Sie hat gestern ein "Tuning-Tool" installiert, erwähnt das aber nur auf Nachfrage.',
  },
  extraMails: () => [],
  hints: [
    'Verbinde dich per Remote-Desktop mit dem PC von Frau Neumann (Rechnername steht im AD unter "Verwaltet von" bzw. im Inventar).',
    'Öffne "Dienste" (services.msc) und suche nach "Druckwarteschlange".',
    'Starttyp auf "Automatisch" setzen und Dienst starten. Danach kommt der GPO-Drucker zurück (ggf. gpupdate /force).',
  ],
  solution: [
    'Ticket übernehmen, Kategorie Drucker, P3.',
    'Per Remote-Desktop auf den Client (vorher Einverständnis einholen).',
    'Ereignisanzeige: Spooler wurde durch ein "Optimierungs-Tool" deaktiviert.',
    'Dienste: Druckwarteschlange → Starttyp "Automatisch", Dienst starten.',
    'Drucker 1OG-Farbe erscheint wieder (ggf. gpupdate /force), Testseite drucken.',
    'Benutzerin informieren: keine privaten Tuning-Tools installieren. Dokumentieren, schließen.',
  ],
  kb: ['KB0016'],
}

/** Chat: Intranet und ERP gehen nicht, Internet schon – statischer DNS 8.8.8.8 */
export const dnsChat: Scenario = {
  id: 'dns-falsch-chat',
  title: 'Intranet nicht erreichbar, Internet geht',
  summary: 'Netzwerkdiagnose mit ipconfig/nslookup, falsche statische DNS-Konfiguration finden und korrigieren.',
  difficulty: 2,
  category: 'Netzwerk',
  skills: ['Chat', 'Remote-Desktop', 'ipconfig', 'nslookup', 'DNS'],
  requester: 'l.lehmann',
  channel: 'Chat',
  ticket: { title: 'Intranet und ERP gehen nicht', description: 'Benutzer meldet per Chat: Intranet und ERP nicht erreichbar, Internet funktioniert.' },
  expected: { priority: ['P3 – Mittel', 'P2 – Hoch'], category: 'Netzwerk', resolutionCodes: ['Gelöst (dauerhaft)'] },
  setup: (w, ctx) => {
    const host = pcOf(w, 'l.lehmann')
    ctx.vars.computer = host
    const ep = getEndpoint(w, host)!
    const a = ep.adapters.find((x) => x.kind === 'Ethernet')!
    a.dnsFromDhcp = false
    a.dnsServers = ['8.8.8.8', '8.8.4.4']
    ep.dnsCache = {}
    addEvent(ep, { log: 'System', eventId: 1014, level: 'Warnung', source: 'Microsoft-Windows-DNS Client Events', message: 'Die Namensauflösung für den Namen "intranet.musterwerk.local" ist fehlgeschlagen. Keiner der konfigurierten DNS-Server kennt den Namen.' })
  },
  checks: [
    { id: 'intranet', label: 'Intranet vom PC erreichbar', points: 8, test: (w, ctx) => { const ep = getEndpoint(w, ctx.vars.computer); return !!ep && connectivity(w, ep).intranet } },
    { id: 'internet', label: 'Internet weiterhin erreichbar', points: 3, test: (w, ctx) => { const ep = getEndpoint(w, ctx.vars.computer); return !!ep && connectivity(w, ep).internet } },
    { id: 'dhcp-dns', label: 'DNS wieder automatisch per DHCP bzw. interne DNS-Server', points: 4, test: (w, ctx) => {
      const a = getEndpoint(w, ctx.vars.computer)?.adapters.find((x) => x.kind === 'Ethernet')
      return !!a && (a.dnsFromDhcp || (a.dnsServers[0] === '10.10.0.10' || a.dnsServers[0] === '10.10.0.11'))
    } },
  ],
  workNoteKeywords: [
    { label: 'Diagnose (ipconfig/nslookup)', any: ['ipconfig', 'nslookup', 'ping', 'diagnose'] },
    { label: 'Ursache (DNS 8.8.8.8 statisch)', any: ['8.8.8.8', 'dns', 'statisch', 'google'] },
    { label: 'Lösung (DNS automatisch/DHCP)', any: ['automatisch', 'dhcp', '10.10.0.10', 'flushdns'] },
  ],
  caller: {
    intro: 'Hi! Lukas aus dem Marketing hier. Bei mir gehen Intranet und ERP nicht mehr, "Seite nicht gefunden". Komischerweise geht Google & Co. ganz normal. 🤔',
    mood: 'freundlich',
    facts: [
      { keywords: ['geändert', 'geaendert', 'eingestellt', 'netzwerk', 'einstellung', 'gemacht', 'installiert'], answer: 'Hmm … ich hatte gestern Probleme mit einer Streaming-Seite und hab in einem Forum gelesen, man soll den DNS auf 8.8.8.8 stellen. Hab ich gemacht. Könnte das was damit zu tun haben?' },
      { keywords: ['wlan', 'kabel', 'lan'], answer: 'Ich bin per Kabel im Netz, am Schreibtisch.' },
      { keywords: ['kollegen', 'andere'], answer: 'Bei Sophie geht das Intranet, ich glaube, es ist nur bei mir.' },
    ],
    persona: 'Lukas ist Grafikdesigner, locker und experimentierfreudig – er hat selbst an den Netzwerkeinstellungen "optimiert".',
    resolvedReply: 'Läuft wieder! Intranet und ERP sind da. Mega, danke dir!',
    unresolvedReply: 'Nee, Intranet zeigt immer noch "Seite nicht gefunden".',
  },
  hints: [
    'Lass dir den Rechnernamen geben und verbinde dich per Remote-Desktop.',
    'Im Terminal: "ipconfig /all" – welche DNS-Server sind eingetragen? Teste mit "nslookup intranet".',
    'Netzwerkverbindungen → Ethernet → IPv4 → "DNS-Serveradresse automatisch beziehen", danach "ipconfig /flushdns".',
  ],
  solution: [
    'Chat beantworten, Ticket übernehmen, Kategorie Netzwerk, P3.',
    'Remote-Desktop (Einverständnis einholen), ipconfig /all → DNS 8.8.8.8 statisch.',
    'nslookup intranet → "Non-existent domain" bei 8.8.8.8 bestätigt die Ursache.',
    'IPv4-Eigenschaften: DNS automatisch beziehen (oder 10.10.0.10/10.10.0.11), ipconfig /flushdns.',
    'Intranet testen lassen, Benutzer erklären, warum interne Namen nur der interne DNS kennt. Dokumentieren, schließen.',
  ],
  kb: ['KB0010', 'KB0011'],
}

/** Portal: VPN-Zugang fehlt (Gruppe) – mit Freigabe-Mail des Vorgesetzten */
export const vpnPortal: Scenario = {
  id: 'vpn-berechtigung-portal',
  title: 'VPN-Zugang für Homeoffice',
  summary: 'Serviceanfrage mit Freigabe prüfen, Benutzer zur VPN-Gruppe hinzufügen, Benutzer informieren.',
  difficulty: 1,
  category: 'Konto & Zugriff',
  skills: ['Self-Service-Portal', 'Freigabeprozess', 'AD-Gruppen'],
  requester: 'p.braun',
  channel: 'Portal',
  ticket: {
    kind: 'Serviceanfrage',
    title: 'VPN-Zugang für Homeoffice ab Montag',
    description: 'Ich arbeite ab Montag zwei Tage pro Woche im Homeoffice und benötige einen VPN-Zugang. Mein Notebook bekomme ich von der IT. Freigabe von Frau Zimmermann liegt vor (siehe Mail).\n\nPetra Braun, Buchhaltung',
  },
  expected: { priority: ['P4 – Niedrig', 'P3 – Mittel'], category: 'Konto & Zugriff', resolutionCodes: ['Anfrage erfüllt'] },
  setup: () => {},
  extraMails: () => [
    {
      fromSam: 'c.zimmermann',
      subject: 'Freigabe: VPN-Zugang für Petra Braun',
      body: 'Hallo IT-Team,\n\nhiermit gebe ich den VPN-Zugang für Frau Petra Braun (Buchhaltung) frei. Sie arbeitet ab Montag dienstags und donnerstags im Homeoffice.\n\nViele Grüße\nClaudia Zimmermann\nLeiterin Finanzen',
    },
  ],
  checks: [{ id: 'vpn', label: 'p.braun ist Mitglied von GG_VPN_Benutzer', points: 10, test: (w) => isMemberOf(w, 'p.braun', 'GG_VPN_Benutzer') }],
  penalties: [
    { id: 'too-much', label: 'Zu weitreichende Rechte vergeben (Admin-Gruppe)', points: 10, test: (w) => isMemberOf(w, 'p.braun', 'Domänen-Admins') || isMemberOf(w, 'p.braun', 'GG_Lokale_Admins') },
  ],
  workNoteKeywords: [
    { label: 'Freigabe geprüft', any: ['freigabe', 'genehmigung', 'zimmermann', 'vorgesetzt'] },
    { label: 'Gruppe GG_VPN_Benutzer', any: ['gg_vpn', 'vpn-gruppe', 'vpn gruppe', 'vpn_benutzer'] },
  ],
  caller: {
    intro: 'Hallo, hier Petra Braun aus der Buchhaltung, wegen meines VPN-Antrags.',
    facts: [
      { keywords: ['notebook', 'laptop', 'gerät', 'geraet'], answer: 'Das Notebook soll ich wohl Freitag bei Ihnen abholen, hat Frau Zimmermann gesagt.' },
      { keywords: ['wann', 'ab wann', 'montag'], answer: 'Ab Montag arbeite ich dienstags und donnerstags von zu Hause.' },
      { keywords: ['installieren', 'programm', 'client'], answer: 'Muss ich da selbst etwas installieren? Ich habe so etwas noch nie gemacht.' },
    ],
    resolvedReply: 'Prima, dann kann ich Montag loslegen. Danke!',
    unresolvedReply: 'Ist der Zugang schon freigeschaltet?',
    persona: 'Petra ist Buchhalterin, freundlich und technisch unerfahren. Sie arbeitet künftig zwei Tage pro Woche im Homeoffice.',
  },
  hints: ['Prüfe im Posteingang, ob die Freigabe der Vorgesetzten vorliegt (Vorgesetzte steht im AD-Feld "Manager").', 'Füge p.braun in der AD-Konsole der Gruppe GG_VPN_Benutzer hinzu.', 'Informiere die Benutzerin über einen Ticket-Kommentar.'],
  solution: [
    'Ticket übernehmen, Kategorie Konto & Zugriff, Typ Serviceanfrage, P4.',
    'Freigabe-Mail von Claudia Zimmermann prüfen – sie ist laut AD die Vorgesetzte.',
    'p.braun zur Gruppe GG_VPN_Benutzer hinzufügen (keine weiteren Rechte).',
    'Benutzerin per Kommentar informieren (VPN-Client ist auf Firmen-Notebooks vorinstalliert).',
    'Mit "Anfrage erfüllt" schließen.',
  ],
  kb: ['KB0014'],
}

export const BASIC_SCENARIOS: Scenario[] = [lockoutPhone, spoolerMail, dnsChat, vpnPortal]

/** Hilfsfunktion für Prüfungen in weiteren Szenario-Dateien */
export const helpers = { pcOf, loggedFor, printDocument }
