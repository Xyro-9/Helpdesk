// Netzwerk- und Domänenszenarien: DHCP, Proxy, Vertrauensstellung, Zeitsynchronisierung, Netzlaufwerke

import { dcEvent, findComputer, findGroup, isMemberOf } from '@/core/ops/ad'
import { addEvent, findService, getProxySettings, refreshToken, setProxySettings, shareAccess, unmapDrive } from '@/core/ops/endpoint'
import { nextFreeIp } from '@/core/seed/infra'
import { connectivity, renewDhcp } from '@/core/sim/network'
import type { Scenario } from '@/core/scenarios/types'
import type { World } from '@/core/types'
import { daysAgo, isApipa } from '@/core/util'
import { epOf, fakeMac, minutesAgo, pcOf, serverEvent, setupEndpoint, splitList } from './kit'

// ───────────────────────── DHCP-Bereich voll → APIPA ─────────────────────────

const HALLEN = '10.10.30.0'
const scopeOf = (w: World, id: string) => w.infra.dhcpScopes.find((s) => s.id === id)

export const dhcpBereichVoll: Scenario = {
  id: 'dhcp-bereich-voll',
  title: 'Lager-PC ohne Netz (169.254.x.x)',
  summary: 'Ein PC erhält nur eine APIPA-Adresse. Ursache auf dem DHCP-Server finden: Der Bereich "Hallen" ist durch neue Handscanner mit wechselnden MAC-Adressen erschöpft.',
  difficulty: 3,
  category: 'Netzwerk',
  skills: ['Telefon', 'ipconfig', 'APIPA', 'DHCP-Server', 'Priorisierung'],
  requester: 'f.schroeder',
  channel: 'Telefon',
  ticket: { title: 'Lager: PC ohne Netzwerk', description: 'PC am Wareneingang hat keine Netzwerkverbindung, Versand blockiert.' },
  expected: { priority: ['P2 – Hoch', 'P1 – Kritisch'], category: 'Netzwerk', resolutionCodes: ['Gelöst (dauerhaft)', 'Gelöst (Workaround)', 'Weitergeleitet / eskaliert'] },
  setup: (w, ctx) => {
    const host = pcOf(w, 'd.moeller')
    ctx.vars.computer = host
    ctx.vars.scope = HALLEN
    const ep = setupEndpoint(w, host)
    const scope = scopeOf(w, HALLEN)
    if (!ep || !scope) return
    const fqdn = `${host.toLowerCase()}.musterwerk.local`
    scope.leases = scope.leases.filter((l) => l.hostname !== fqdn)
    ctx.vars.realLeases = scope.leases.map((l) => l.hostname).join(',')
    let i = 0
    for (let ip = nextFreeIp(scope); ip && i < 400; ip = nextFreeIp(scope), i++)
      scope.leases.push({ ip, mac: fakeMac(`mde-${i}`), hostname: `mde-${String((i % 18) + 1).padStart(2, '0')}.musterwerk.local`, expires: daysAgo(-(1 + (i % 7)) - 0.3), state: 'Aktiv' })
    ctx.vars.mdeLeases = String(i)
    const nic = ep.adapters.find((a) => a.kind === 'Ethernet')
    if (nic) {
      renewDhcp(w, ep, nic)
      ep.dnsCache = {}
      addEvent(ep, { log: 'System', eventId: 1001, level: 'Warnung', source: 'Microsoft-Windows-Dhcp-Client', message: `Der Computer konnte keine Netzwerkadresse vom DHCP-Server für die Netzwerkkarte mit der Netzwerkadresse 0x${nic.mac.replace(/-/g, '')} abrufen. Es wird eine automatische private IP-Adresse (APIPA) verwendet; der Computer versucht weiterhin, eine Adresse zu erhalten.`, time: minutesAgo(35) })
    }
    serverEvent(w, 'DC01', { log: 'System', eventId: 1020, level: 'Warnung', source: 'Microsoft-Windows-DHCP-Server', message: `Der Bereich ${HALLEN} (Hallen) ist zu 100 Prozent ausgelastet. Es sind nur 0 IP-Adressen verfügbar.`, time: minutesAgo(50) })
    serverEvent(w, 'DC01', { log: 'System', eventId: 1063, level: 'Warnung', source: 'Microsoft-Windows-DHCP-Server', message: `Der DHCP-Server hat keine freien Adressen mehr im Bereich ${HALLEN} für den Client ${nic?.mac ?? ''} (${host}).`, time: minutesAgo(35) })
  },
  tick: (w, ctx) => {
    // Windows-DHCP-Client fragt im APIPA-Zustand regelmäßig erneut an
    const ep = setupEndpoint(w, ctx.vars.computer)
    const scope = scopeOf(w, HALLEN)
    const nic = ep?.adapters.find((a) => a.kind === 'Ethernet')
    if (!ep || !scope || !nic || !nic.dhcp || !nic.enabled || !isApipa(nic.ip)) return
    if (scope.active && nextFreeIp(scope)) renewDhcp(w, ep, nic)
  },
  checks: [
    { id: 'scope', label: 'DHCP-Bereich 10.10.30.0 hat wieder freie Adressen', points: 7, test: (w) => { const s = scopeOf(w, HALLEN); return !!s && s.active && !!nextFreeIp(s) }, hint: 'Infrastruktur → DHCP → Bereich Hallen: Leases und Adressbereich prüfen.' },
    { id: 'client', label: 'PC von Dennis Möller hat eine gültige DHCP-Adresse und erreicht das Intranet', points: 7, test: (w, ctx) => { const ep = epOf(w, ctx); const nic = ep?.adapters.find((a) => a.kind === 'Ethernet'); return !!ep && !!nic && nic.dhcp && !isApipa(nic.ip) && nic.ip.startsWith('10.10.30.') && connectivity(w, ep).intranet }, hint: 'Nach der Korrektur am Server: "ipconfig /renew" (oder wenige Minuten warten).' },
  ],
  penalties: [
    { id: 'static', label: 'Statische IP-Adresse am Client als "Lösung" eingetragen', points: 5, test: (w, ctx) => { const nic = epOf(w, ctx)?.adapters.find((a) => a.kind === 'Ethernet'); return !!nic && !nic.dhcp } },
    { id: 'real-leases', label: 'Leases produktiver Arbeitsplätze gelöscht (Gefahr von Adresskonflikten)', points: 3, test: (w, ctx) => { const s = scopeOf(w, HALLEN); return !!s && splitList(ctx.vars.realLeases).some((h) => !s.leases.some((l) => l.hostname === h)) } },
  ],
  workNoteKeywords: [
    { label: 'Symptom APIPA', any: ['apipa', '169.254'] },
    { label: 'Ursache DHCP-Bereich erschöpft', any: ['bereich', 'scope', 'erschöpft', 'voll', 'lease'] },
    { label: 'Handscanner / MAC-Randomisierung', any: ['mde', 'handscanner', 'scanner', 'mac'] },
  ],
  caller: {
    intro: 'Schröder, Logistik. Bei uns im Lager geht gerade nichts: Der PC von Dennis Möller am Wareneingang (PC-LG-002) hat kein Netz, und die neuen Handscanner verbinden sich auch nur sporadisch. Die LKW stehen auf dem Hof!',
    mood: 'gestresst',
    facts: [
      { keywords: ['dennis', 'möller', 'moeller', 'wareneingang'], answer: 'Mein Notebook geht, es geht um den PC von Dennis Möller am Wareneingang – auf dem Aufkleber steht PC-LG-002.' },
      { keywords: ['ipconfig', 'ip-adresse', 'ip adresse', '169'], answer: 'Dennis hat ipconfig eingetippt, da steht 169.254 irgendwas. Sagt mir nichts.' },
      { keywords: ['handscanner', 'scanner', 'mde', 'neue geräte', 'neue geraete'], answer: 'Wir haben letzte Woche 18 neue Handscanner bekommen. Die verlieren ständig das Netz und verbinden sich neu – der Lieferant meint, das ist normal.' },
      { keywords: ['kabel', 'neu gestartet', 'neustart', 'lampe'], answer: 'Dennis hat den PC zweimal neu gestartet und das Kabel geprüft – die Lampe am Netzwerkanschluss leuchtet.' },
      { keywords: ['kollegen', 'andere pcs', 'betroffen', 'wie viele'], answer: 'Die anderen PCs in der Halle laufen noch. Aber ohne den Wareneingang steht der ganze Versand.' },
    ],
    fallback: ['Ich bin Logistiker, kein Techniker – ich weiß nur, dass Dennis kein Netz hat.', 'Auf dem Bildschirm bei Dennis steht "Kein Internetzugriff".'],
    resolvedReply: 'Dennis sagt, der PC ist wieder im Netz und das Lagerprogramm läuft. Super, danke! Kümmern Sie sich noch um die Scanner?',
    unresolvedReply: 'Nein, bei Dennis steht immer noch 169.254 und nichts geht.',
    persona: 'Frank leitet die Logistik, steht unter Druck (LKW warten), ist aber kooperativ. Er ruft von seinem Notebook aus an, das per WLAN funktioniert.',
  },
  hints: [
    'Eine Adresse 169.254.x.x (APIPA) bedeutet: Der Client hat keine Antwort vom DHCP-Server bekommen. Liegt es am Client oder am Server?',
    'Infrastruktur → DHCP → Bereich 10.10.30.0 (Hallen): Wie viele Adressen sind frei? Wer belegt die Leases?',
    'Die Handscanner (mde-xx) haben mit wechselnden MAC-Adressen den Bereich gefüllt. Verwaiste MDE-Leases löschen oder den Bereich erweitern, danach am PC "ipconfig /renew". Netzwerkteam über die MAC-Randomisierung informieren.',
  ],
  solution: [
    'Ticket übernehmen, Kategorie Netzwerk, P2 (Versand blockiert, mehrere Geräte betroffen).',
    'PC-LG-002 hat eine APIPA-Adresse → kein DHCP-Angebot erhalten.',
    'DHCP auf DC01: Bereich 10.10.30.0 zu 100 % belegt – über 100 Leases von mde-01 … mde-18 mit ständig neuen (randomisierten) MAC-Adressen.',
    'Verwaiste MDE-Leases löschen (nicht die der Arbeitsplatz-PCs!) oder den Bereich erweitern; DHCP-Client erneuern (ipconfig /renew).',
    'Konnektivität prüfen lassen. Dauerhafte Lösung (MAC-Randomisierung an den Scannern abschalten, Leasedauer/WLAN-Bereich) an "Netzwerk & Infrastruktur" weitergeben.',
    'Ursache und Maßnahmen dokumentieren.',
  ],
  kb: ['KB0012', 'KB0010'],
}

// ───────────────────────── Proxy von der Messe ─────────────────────────

const STD_PROXY = /^(proxy\.musterwerk\.local|10\.10\.0\.60):8080$/i

export const proxyMesse: Scenario = {
  id: 'proxy-messe-falsch',
  title: 'Nach der Messe kein Internet',
  summary: 'Internet geht nicht, Intranet schon: Auf dem Notebook ist noch der Proxy des Messe-WLANs eingetragen. Einstellung finden und auf Firmenstandard zurücksetzen.',
  difficulty: 2,
  category: 'Netzwerk',
  skills: ['Chat', 'Remote-Desktop', 'Proxy', 'Registry', 'Browser-Fehler'],
  requester: 'm.becker',
  channel: 'Chat',
  ticket: { title: 'Kein Internet auf dem Notebook', description: 'Benutzer meldet per Chat: Proxyfehler im Browser, Intranet funktioniert.' },
  expected: { priority: ['P3 – Mittel'], category: 'Netzwerk', resolutionCodes: ['Gelöst (dauerhaft)'] },
  setup: (w, ctx) => {
    const host = pcOf(w, 'm.becker')
    ctx.vars.computer = host
    const ep = setupEndpoint(w, host)
    if (!ep) return
    setProxySettings(ep, { enabled: true, server: 'proxy.messe-hamburg.example:3128', bypass: '<local>' })
    addEvent(ep, { log: 'Anwendung', eventId: 5600, level: 'Warnung', source: 'Microsoft-Windows-WinINet-Config', message: 'Die Internetoptionen des Benutzers MUSTERWERK\\m.becker wurden geändert: ProxyEnable=1, ProxyServer=proxy.messe-hamburg.example:3128.', time: daysAgo(4) })
  },
  checks: [
    { id: 'internet', label: 'Internet vom Notebook erreichbar', points: 6, test: (w, ctx) => { const ep = epOf(w, ctx); return !!ep && connectivity(w, ep).internet } },
    { id: 'intranet', label: 'Intranet weiterhin erreichbar', points: 3, test: (w, ctx) => { const ep = epOf(w, ctx); return !!ep && connectivity(w, ep).intranet } },
    { id: 'standard', label: 'Proxy-Einstellung entspricht dem Firmenstandard (kein Messe-Proxy)', points: 4, test: (w, ctx) => { const ep = epOf(w, ctx); if (!ep) return false; const p = getProxySettings(ep); return !p.enabled || STD_PROXY.test(p.server.trim()) }, hint: 'Standard: kein manueller Proxy bzw. proxy.musterwerk.local:8080.' },
  ],
  penalties: [{ id: 'firewall', label: 'Windows-Firewall deaktiviert', points: 5, test: (w, ctx) => { const ep = epOf(w, ctx); return !!ep && (!ep.firewall.domain || !ep.firewall.private) } }],
  workNoteKeywords: [
    { label: 'Ursache Proxy', any: ['proxy'] },
    { label: 'Messe-Proxy', any: ['messe', '3128'] },
    { label: 'Standard wiederhergestellt', any: ['zurückgesetzt', 'entfernt', 'standard', 'deaktiviert', 'proxyenable'] },
  ],
  caller: {
    intro: 'Hallo IT, Becker hier. Seit ich von der Messe zurück bin, geht auf dem Notebook kein Internet mehr – "Es kann keine Verbindung zum Proxyserver hergestellt werden". Intranet und ERP gehen komischerweise. Ich muss heute noch die Messekontakte ins CRM übertragen!',
    mood: 'ungeduldig',
    facts: [
      { keywords: ['messe', 'eingestellt', 'geändert', 'geaendert', 'einstellung'], answer: 'Auf der Messe musste man fürs Aussteller-WLAN einen Proxy eintragen, das stand auf einem Zettel am Stand. Das hat mir der Standbauer schnell eingerichtet.' },
      { keywords: ['wlan', 'kabel', 'netzwerk'], answer: 'Ich bin hier im Büro im normalen Firmen-WLAN.' },
      { keywords: ['meldung', 'fehler'], answer: '"ERR_PROXY_CONNECTION_FAILED – Es kann keine Verbindung zum Proxyserver hergestellt werden."' },
      { keywords: ['handy', 'smartphone'], answer: 'Auf dem Handy geht alles.' },
    ],
    fallback: ['Im Browser steht nur, dass der Proxyserver nicht erreichbar ist.', 'Keine Ahnung – das ist doch Ihr Job, oder? 😉'],
    resolvedReply: 'Internet geht wieder! Danke – dann übertrage ich jetzt die Kontakte.',
    unresolvedReply: 'Nein, immer noch "keine Verbindung zum Proxyserver".',
    persona: 'Markus ist Vertriebsleiter, direkt und ungeduldig, aber nicht unfreundlich. Er erwartet keine Sonderbehandlung, möchte es aber schnell.',
  },
  hints: [
    'Internet kaputt, Intranet geht: typisch für eine falsche Proxy-Einstellung (interne Adressen stehen in der Ausnahmeliste).',
    'Per Remote-Desktop die Proxy-Einstellungen bzw. die Registry HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings (ProxyEnable, ProxyServer) prüfen.',
    'Den Messe-Proxy entfernen und den Firmenstandard wiederherstellen (kein manueller Proxy bzw. proxy.musterwerk.local:8080), dann im Browser testen.',
  ],
  solution: [
    'Chat beantworten, Ticket übernehmen, Kategorie Netzwerk, P3 (eine Person, Ausweichmöglichkeit vorhanden – VIP ändert die Priorität nicht).',
    'Remote-Desktop (Einverständnis!): Browser zeigt ERR_PROXY_CONNECTION_FAILED.',
    'Proxy-Einstellungen: manueller Proxy proxy.messe-hamburg.example:3128 eingetragen.',
    'Manuellen Proxy deaktivieren bzw. auf Firmenstandard setzen, Internet und Intranet testen.',
    'Benutzer erklären, dass Fremd-Proxys nach der Messe wieder entfernt werden müssen. Dokumentieren, schließen.',
  ],
  kb: ['KB0013', 'KB0010'],
}

// ───────────────────────── Vertrauensstellung Schulungs-PC ─────────────────────────

const SCHULUNG = 'PC-SCHULUNG-01'

export const vertrauensstellung: Scenario = {
  id: 'vertrauensstellung-schulungs-pc',
  title: 'Schulungs-PC: Vertrauensstellung fehlgeschlagen',
  summary: 'Nach dem Zurücksetzen auf ein altes Image passt das Computerkonto-Kennwort nicht mehr. Sicheren Kanal reparieren, ohne das Computerkonto zu löschen.',
  difficulty: 2,
  category: 'Konto & Zugriff',
  skills: ['Chat', 'Active Directory', 'LAPS', 'PowerShell', 'Domänenvertrauensstellung'],
  requester: 'l.werner',
  channel: 'Chat',
  ticket: { title: 'Schulungs-PC: Anmeldung nicht möglich', description: 'Anmeldung am Schulungs-PC scheitert mit Meldung zur Vertrauensstellung.' },
  expected: { priority: ['P2 – Hoch', 'P3 – Mittel'], category: ['Konto & Zugriff', 'Netzwerk'], resolutionCodes: ['Gelöst (dauerhaft)'] },
  setup: (w, ctx) => {
    ctx.vars.computer = SCHULUNG
    const c = findComputer(w, SCHULUNG)
    const ep = setupEndpoint(w, SCHULUNG)
    if (!c || !ep) return
    c.secureChannelBroken = true
    addEvent(ep, { log: 'Anwendung', eventId: 200, level: 'Informationen', source: 'MW Kiosk-Reset', message: 'Die Arbeitsstation wurde auf den Auslieferungszustand vom 03.11.2025 zurückgesetzt (Schulungsmodus).', time: daysAgo(3) })
    addEvent(ep, { log: 'System', eventId: 3210, level: 'Fehler', source: 'NETLOGON', message: 'Dieser Computer konnte die Authentifizierung mit \\\\DC01.musterwerk.local, einem Domänencontroller für die Domäne MUSTERWERK, nicht durchführen. Daher wird möglicherweise der Zugriff verweigert, wenn dieser Computer versucht, eine Verbindung mit dieser Domäne herzustellen.', time: minutesAgo(20) })
    addEvent(ep, { log: 'System', eventId: 4, level: 'Fehler', source: 'Microsoft-Windows-Security-Kerberos', message: 'Der Kerberos-Client hat einen KRB_AP_ERR_MODIFIED-Fehler vom Server pc-schulung-01$ empfangen. Das Computerkonto-Kennwort stimmt nicht mit dem Domänencontroller überein.', time: minutesAgo(19) })
    serverEvent(w, 'DC01', { log: 'System', eventId: 5805, level: 'Fehler', source: 'NETLOGON', message: `Die Sitzungseinrichtung vom Computer ${SCHULUNG} konnte nicht authentifiziert werden: Das Kennwort des Computerkontos ist ungültig.`, time: minutesAgo(19) })
  },
  checks: [
    { id: 'trust', label: 'Vertrauensstellung von PC-SCHULUNG-01 repariert', points: 10, test: (w) => { const c = findComputer(w, SCHULUNG); return !!c && !c.secureChannelBroken }, hint: 'Test-ComputerSecureChannel -Repair bzw. Reset-ComputerMachinePassword auf dem Client.' },
    { id: 'account', label: 'Computerkonto erhalten (nicht gelöscht, aktiv)', points: 3, test: (w) => !!findComputer(w, SCHULUNG)?.enabled },
  ],
  penalties: [{ id: 'deleted', label: 'Computerkonto gelöscht – Gruppen, LAPS und Beschreibung gehen verloren', points: 10, test: (w) => !findComputer(w, SCHULUNG) }],
  workNoteKeywords: [
    { label: 'Fehlerbild Vertrauensstellung', any: ['vertrauensstellung', 'secure channel', 'sicheren kanal', 'trust'] },
    { label: 'Reparatur', any: ['test-computersecurechannel', 'repair', 'reset-computermachinepassword', 'computerkonto', 'maschinenkennwort'] },
    { label: 'Ursache Image/Zurücksetzen', any: ['image', 'zurückgesetzt', 'wiederhergestellt', 'snapshot', 'kiosk'] },
  ],
  caller: {
    intro: 'Hallo, Laura Werner aus der Personalabteilung. Der Schulungs-PC zeigt beim Anmelden: "Die Vertrauensstellung zwischen dieser Arbeitsstation und der primären Domäne konnte nicht hergestellt werden." Um 13 Uhr beginnt dort die Einführungsschulung für die neuen Azubis!',
    mood: 'gestresst',
    facts: [
      { keywords: ['schulungs-pc', 'schulungsraum', 'beamer', 'raum'], answer: 'Es ist der PC im Schulungsraum, am Beamer. Auf dem Aufkleber steht PC-SCHULUNG-01.' },
      { keywords: ['zurückgesetzt', 'zuruecksetzen', 'image', 'tool', 'wiederhergestellt', 'nach der schulung'], answer: 'Nach jeder Schulung läuft ein Programm, das den PC wieder auf den Auslieferungszustand zurücksetzt – damit keine Daten der Teilnehmer drauf bleiben. Zuletzt lief das am Freitag.' },
      { keywords: ['lokal', 'administrator', 'anderes konto', 'anderer benutzer'], answer: 'Mit meinem normalen Konto komme ich nicht rein. Ein anderes Konto kenne ich nicht.' },
      { keywords: ['netzwerk', 'kabel', 'internet'], answer: 'Das Netzwerkkabel steckt, die Lampe am Anschluss blinkt.' },
    ],
    fallback: ['Es kommt nur diese Meldung mit der Vertrauensstellung.', 'Ich bin aus der Personalabteilung – technisch kenne ich mich nicht aus.'],
    resolvedReply: 'Ich kann mich anmelden! Perfekt, dann startet die Schulung pünktlich. Danke!',
    unresolvedReply: 'Nein, die Meldung mit der Vertrauensstellung kommt immer noch.',
    persona: 'Laura organisiert die Azubi-Einführung und ist unter Zeitdruck. Sie schreibt von ihrem eigenen Arbeitsplatz (PC-HR-002) aus; betroffen ist PC-SCHULUNG-01.',
  },
  hints: [
    'Die Meldung bedeutet: Das Computerkonto-Kennwort im AD passt nicht mehr zu dem auf dem Client gespeicherten – z. B. nach dem Zurücksetzen auf ein altes Image.',
    'Melde dich am Client mit dem lokalen Administrator an (Kennwort per LAPS in der AD-Konsole) oder nutze die Remoteverwaltung.',
    'Admin-PowerShell auf dem Client: "Test-ComputerSecureChannel -Repair" (alternativ Reset-ComputerMachinePassword). Das Computerkonto NICHT löschen.',
  ],
  solution: [
    'Chat beantworten, Ticket übernehmen, P2 (Schulung beginnt bald, mehrere Teilnehmer betroffen).',
    'Ereignisanzeige: NETLOGON 3210 / Kerberos KRB_AP_ERR_MODIFIED; Kiosk-Reset auf einen alten Stand → altes Maschinenkennwort.',
    'LAPS-Kennwort des Clients abrufen, lokal anmelden bzw. Remoteverwaltung nutzen.',
    '"Test-ComputerSecureChannel -Repair" ausführen → Vertrauensstellung wiederhergestellt (Computerkonto bleibt erhalten).',
    'Anmeldung bestätigen lassen. Ursache (Kiosk-Image) an den 2nd Level melden, damit das Problem nicht nach jeder Schulung wiederkommt.',
  ],
  kb: ['KB0021'],
}

// ───────────────────────── Zeitabweichung → Kerberos ─────────────────────────

export const zeitabweichung: Scenario = {
  id: 'zeitabweichung-kerberos',
  title: 'Netzlaufwerke weg, Uhr geht falsch',
  summary: 'Die Uhr eines PCs geht 12 Minuten vor, weil der Windows-Zeitgeber deaktiviert ist. Kerberos lehnt Tickets ab – Dienst reparieren, Zeit synchronisieren, Laufwerke wiederherstellen.',
  difficulty: 2,
  category: 'Software',
  skills: ['Portal', 'Remote-Desktop', 'Dienste', 'w32tm', 'Kerberos', 'Gruppenrichtlinien'],
  requester: 'm.yilmaz',
  channel: 'Portal',
  ticket: {
    title: 'Netzlaufwerke fehlen, Uhrzeit falsch',
    description: 'Seit Montag fehlen meine Netzlaufwerke S: und P:. Beim Öffnen von Ordnern auf dem Server kommt "Die Anmeldeinformationen sind ungültig". Außerdem geht die Uhr am PC falsch (ca. 10 Minuten vor) – meine Zeitstempel in der Disposition stimmen nicht mehr.\n\nMehmet Yilmaz, Disposition',
  },
  expected: { priority: ['P3 – Mittel'], category: ['Software', 'Netzwerk'], resolutionCodes: ['Gelöst (dauerhaft)'] },
  setup: (w, ctx) => {
    const host = pcOf(w, 'm.yilmaz')
    ctx.vars.computer = host
    const ep = setupEndpoint(w, host)
    if (!ep) return
    ep.timeOffsetMin = 12
    const t = findService(ep.services, 'W32Time')
    if (t) {
      t.status = 'Beendet'
      t.startType = 'Deaktiviert'
    }
    unmapDrive(ep, 'S:')
    unmapDrive(ep, 'P:')
    addEvent(ep, { log: 'System', eventId: 7040, level: 'Informationen', source: 'Service Control Manager', message: 'Der Starttyp des Diensts "Windows-Zeitgeber" wurde von "Manuell starten" in "Deaktiviert" geändert. (Benutzer: PC-LG-003\\Administrator – Diagnoseskript Mainboard-Tausch)', time: daysAgo(5) })
    addEvent(ep, { log: 'System', eventId: 4, level: 'Fehler', source: 'Microsoft-Windows-Security-Kerberos', message: 'Der Kerberos-Client hat einen KRB_AP_ERR_SKEW-Fehler vom Server fs01$ empfangen. Die Uhrzeit des Clients weicht um mehr als 5 Minuten von der Uhrzeit des Servers ab.', time: minutesAgo(40) })
    addEvent(ep, { log: 'System', eventId: 1129, level: 'Fehler', source: 'Microsoft-Windows-GroupPolicy', message: 'Die Verarbeitung der Gruppenrichtlinie ist fehlgeschlagen, da keine Verbindung mit einem Domänencontroller authentifiziert werden konnte (Uhrzeitabweichung).', time: minutesAgo(39) })
  },
  checks: [
    { id: 'time', label: 'Systemzeit synchron (Abweichung < 2 Minuten)', points: 6, test: (w, ctx) => { const ep = epOf(w, ctx); return !!ep && Math.abs(ep.timeOffsetMin) < 2 }, hint: '"w32tm /resync" bzw. "Jetzt synchronisieren" – setzt einen laufenden Zeitgeber voraus.' },
    { id: 'service', label: 'Windows-Zeitgeber läuft und ist nicht deaktiviert', points: 4, test: (w, ctx) => { const ep = epOf(w, ctx); const s = ep ? findService(ep.services, 'W32Time') : undefined; return !!s && s.status === 'Wird ausgeführt' && s.startType !== 'Deaktiviert' }, hint: 'Sonst läuft die Uhr nach dem nächsten Neustart wieder davon.' },
    { id: 'drives', label: 'Netzlaufwerk S: wieder verbunden', points: 3, test: (w, ctx) => { const ep = epOf(w, ctx); return !!ep && ep.mappedDrives.some((d) => d.letter === 'S:' && d.path.toLowerCase() === '\\\\fs01\\logistik') }, hint: 'gpupdate /force oder neu anmelden.' },
  ],
  workNoteKeywords: [
    { label: 'Zeitabweichung', any: ['uhrzeit', 'zeitabweichung', '12 minuten', 'zeit'] },
    { label: 'Windows-Zeitgeber', any: ['w32time', 'zeitgeber', 'w32tm'] },
    { label: 'Kerberos', any: ['kerberos', 'skew', '5 minuten'] },
  ],
  caller: {
    intro: 'Hallo, Yilmaz aus der Disposition – es geht um mein Ticket mit den Netzlaufwerken und der falschen Uhrzeit.',
    mood: 'freundlich',
    facts: [
      { keywords: ['uhr', 'uhrzeit', 'vorgehen', 'falsch'], answer: 'Die Uhr unten rechts geht ungefähr 12 Minuten vor. Zurückstellen konnte ich sie nicht, dafür fehlen mir die Rechte.' },
      { keywords: ['reparatur', 'techniker', 'dienstleister', 'mainboard', 'letzte woche'], answer: 'Letzte Woche war ein Techniker vom PC-Hersteller da und hat das Mainboard getauscht. Seitdem ist das so.' },
      { keywords: ['meldung', 'fehlermeldung', 'laufwerk'], answer: '"Die Anmeldeinformationen sind ungültig" – und S: und P: sind ganz verschwunden.' },
      { keywords: ['kollegen', 'andere'], answer: 'Bei den Kollegen im Lager geht alles.' },
    ],
    fallback: ['Das weiß ich leider nicht.', 'Ich merke nur, dass die Uhr falsch geht und die Laufwerke fehlen.'],
    resolvedReply: 'Die Uhr stimmt jetzt und meine Laufwerke sind wieder da. Top, danke!',
    unresolvedReply: 'Nein, die Uhr geht immer noch vor und die Laufwerke fehlen.',
    persona: 'Mehmet ist ruhig und freundlich, arbeitet als Disponent im Lager (Halle 2).',
  },
  hints: [
    'Kerberos toleriert höchstens 5 Minuten Zeitabweichung zum Domänencontroller. Vergleiche die Uhrzeit des Clients mit der Serverzeit.',
    'Remote-Desktop → Dienste: "Windows-Zeitgeber" (W32Time) ist deaktiviert. Starttyp korrigieren und Dienst starten.',
    'Danach Zeit synchronisieren ("w32tm /resync" bzw. "Jetzt synchronisieren") und mit "gpupdate /force" die Laufwerke neu verbinden.',
  ],
  solution: [
    'Ticket übernehmen, Kategorie Software (Betriebssystem), P3.',
    'Remote-Desktop: Uhr 12 Minuten vor, Ereignisanzeige zeigt KRB_AP_ERR_SKEW und den deaktivierten Windows-Zeitgeber (nach Mainboard-Tausch).',
    'W32Time-Starttyp auf Manuell/Automatisch setzen, Dienst starten, "w32tm /resync".',
    '"gpupdate /force" → Laufwerke S: und P: werden wieder verbunden.',
    'Bestätigen lassen, dokumentieren, schließen.',
  ],
  kb: ['KB0022', 'KB0015'],
}

// ───────────────────────── Netzlaufwerk fehlt (Gruppe) ─────────────────────────

export const netzlaufwerkFehlt: Scenario = {
  id: 'netzlaufwerk-fehlt-gruppe',
  title: 'Laufwerk S: ist verschwunden',
  summary: 'Bei einer Gruppenbereinigung wurde die Benutzerin versehentlich aus ihrer Abteilungsgruppe entfernt. Gruppe wiederherstellen und das Anmeldetoken aktualisieren.',
  difficulty: 2,
  category: 'Konto & Zugriff',
  skills: ['E-Mail', 'AD-Gruppen', 'Gruppenrichtlinien', 'Kerberos-Token', 'DC-Sicherheitsprotokoll'],
  requester: 'o.nowak',
  channel: 'E-Mail',
  ticket: {
    title: 'Laufwerk S: fehlt',
    description: 'Hallo IT-Team,\n\nseit heute Morgen ist mein Laufwerk S: (Logistik) verschwunden. Ich komme nicht mehr an die Versandlisten und die Lieferscheinvorlagen. Laufwerk P: ist noch da. Am Freitag hat noch alles funktioniert.\n\nKönnen Sie mir bitte helfen? Die ersten LKW kommen um 11 Uhr.\n\nViele Grüße\nOlga Nowak\nVersand',
  },
  expected: { priority: ['P3 – Mittel', 'P2 – Hoch'], category: 'Konto & Zugriff', resolutionCodes: ['Gelöst (dauerhaft)'] },
  setup: (w, ctx) => {
    const host = pcOf(w, 'o.nowak')
    ctx.vars.computer = host
    const g = findGroup(w, 'GG_Logistik')
    if (g) g.members = g.members.filter((m) => m !== 'o.nowak')
    dcEvent(w, 4729, 'Ein Mitglied wurde aus einer sicherheitsaktivierten globalen Gruppe entfernt.\n\nAntragsteller: MUSTERWERK\\t.berger\nMitglied: o.nowak\nGruppe: GG_Logistik\n(Bereinigung Aushilfen Produktion)')
    const dc = w.infra.servers.find((s) => s.name === 'DC01')
    if (dc?.events[0]) dc.events[0].time = daysAgo(3)
    const ep = setupEndpoint(w, host)
    if (!ep) return
    refreshToken(w, ep)
    unmapDrive(ep, 'S:')
    addEvent(ep, { log: 'System', eventId: 4098, level: 'Warnung', source: 'Microsoft-Windows-GroupPolicy', message: 'Die Benutzereinstellung "S: (Abteilung Logistik)" wurde nicht angewendet: Zielgruppenadressierung auf Elementebene – Benutzer ist kein Mitglied von MUSTERWERK\\GG_Logistik.', time: minutesAgo(90) })
  },
  checks: [
    { id: 'group', label: 'o.nowak wieder Mitglied von GG_Logistik', points: 6, test: (w) => isMemberOf(w, 'o.nowak', 'GG_Logistik'), hint: 'Vergleiche die Gruppen mit einem Kollegen aus der Logistik.' },
    { id: 'drive', label: 'Laufwerk S: (\\\\FS01\\Logistik) verbunden und zugreifbar', points: 6, test: (w, ctx) => { const ep = epOf(w, ctx); return !!ep && ep.mappedDrives.some((d) => d.letter === 'S:' && d.path.toLowerCase() === '\\\\fs01\\logistik') && shareAccess(w, ep, '\\\\FS01\\Logistik').ok }, hint: 'Neue Gruppen wirken erst mit neuem Token: klist purge / neu anmelden, dann gpupdate.' },
  ],
  penalties: [{ id: 'agdlp', label: 'Benutzerin direkt in FS_Logistik_RW statt in die Rollengruppe aufgenommen (AGDLP)', points: 3, test: (w) => isMemberOf(w, 'o.nowak', 'FS_Logistik_RW', false) }],
  workNoteKeywords: [
    { label: 'Gruppe GG_Logistik', any: ['gg_logistik', 'gruppe'] },
    { label: 'Token / Gruppenrichtlinie aktualisiert', any: ['gpupdate', 'klist', 'token', 'neu anmelden', 'abmelden', 'neustart'] },
    { label: 'Laufwerk S:', any: ['s:', 'laufwerk', 'fs01'] },
  ],
  caller: {
    intro: 'Hallo, hier Olga Nowak aus dem Versand – wegen meines Laufwerks S:.',
    mood: 'freundlich',
    facts: [
      { keywords: ['fehlermeldung', 'meldung', 'zugriff', 'von hand'], answer: 'Wenn ich \\\\FS01\\Logistik von Hand eintippe, kommt "Zugriff verweigert".' },
      { keywords: ['geändert', 'verändert', 'freitag', 'aushilfe', 'produktion'], answer: 'Am Freitag war jemand von der IT da wegen der Berechtigungen der Aushilfen aus der Produktion. Mehr weiß ich nicht.' },
      { keywords: ['kollegen', 'andere', 'nur bei ihnen'], answer: 'Bei den Kollegen im Versand ist S: da, nur bei mir nicht.' },
      { keywords: ['abgemeldet', 'neu angemeldet', 'neu gestartet', 'neustart'], answer: 'Ich habe mich heute früh ganz normal angemeldet. Neu gestartet habe ich nicht.' },
    ],
    fallback: ['S: ist einfach nicht mehr im Explorer.', 'Da bin ich überfragt.'],
    resolvedReply: 'Ja, S: ist wieder da und ich komme an die Versandlisten. Danke schön!',
    unresolvedReply: 'Nein, S: fehlt immer noch.',
    persona: 'Olga ist freundlich und hilfsbereit, technisch unerfahren.',
  },
  hints: [
    'Welche Gruppe verbindet S: per GPO? Vergleiche die Gruppen von Olga Nowak mit einer Kollegin aus der Logistik.',
    'Im DC-Sicherheitsprotokoll steht, wer die Gruppenmitgliedschaft geändert hat (Ereignis 4729).',
    'Nach dem Hinzufügen zu GG_Logistik muss das Anmeldetoken erneuert werden (klist purge / Ab- und Anmelden / Neustart), danach gpupdate /force.',
  ],
  solution: [
    'Ticket übernehmen, Kategorie "Konto & Zugriff", P3 (P2 wegen LKW-Termin vertretbar).',
    'AD: o.nowak ist nicht mehr in GG_Logistik (DC-Ereignis 4729: Bereinigung durch t.berger am Freitag).',
    'o.nowak wieder in GG_Logistik aufnehmen (Rollengruppe – nicht direkt in FS_Logistik_RW, AGDLP).',
    'Auf dem Client Token erneuern (klist purge bzw. ab-/anmelden) und gpupdate /force → S: wird verbunden.',
    'Bestätigen lassen; Hinweis an t.berger zur Bereinigung. Dokumentieren, schließen.',
  ],
  kb: ['KB0015'],
}

export const NETWORK_SCENARIOS: Scenario[] = [dhcpBereichVoll, proxyMesse, vertrauensstellung, zeitabweichung, netzlaufwerkFehlt]

