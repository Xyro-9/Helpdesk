// Szenarien rund um Benutzerkonten: Kennwort, Sperren, MFA

import { A } from '@/core/actions'
import { dcEvent, findUser, lockUser } from '@/core/ops/ad'
import { findCloudUser } from '@/core/ops/cloud'
import { addEvent, connectVpn, disconnectVpn, getRegValue, setRegValue } from '@/core/ops/endpoint'
import type { Scenario } from '@/core/scenarios/types'
import type { Endpoint } from '@/core/types'
import { daysAgo, nowIso } from '@/core/util'
import { epOf, isAfter, logged, minutesAgo, pcOf, setupEndpoint, vpnLoginPossible } from './kit'

// ───────────────────────── Kennwort vergessen ─────────────────────────

export const kennwortVergessen: Scenario = {
  id: 'kennwort-vergessen-telefon',
  title: 'Kennwort vergessen nach Krankheit',
  summary: 'Identität am Telefon prüfen, Kennwort mit Initialkennwort und "muss ändern" zurücksetzen, Konto entsperren – das Kennwort nur telefonisch mitteilen.',
  difficulty: 1,
  category: 'Konto & Zugriff',
  skills: ['Telefon', 'Identitätsprüfung', 'Kennwort-Reset', 'Active Directory'],
  requester: 't.richter',
  channel: 'Telefon',
  ticket: { title: 'Kennwort vergessen – Anmeldung nicht möglich', description: 'Benutzer hat sein Kennwort vergessen und das Konto durch Fehlversuche gesperrt.' },
  expected: { priority: ['P3 – Mittel', 'P2 – Hoch'], category: 'Konto & Zugriff', resolutionCodes: ['Gelöst (dauerhaft)', 'Anfrage erfüllt'] },
  identityRequired: true,
  setup: (w, ctx) => {
    const u = findUser(w, 't.richter')
    if (!u) return
    ctx.vars.computer = pcOf(w, u.sam)
    ctx.vars.pwdBefore = u.pwdLastSet
    lockUser(w, u.sam, ctx.vars.computer, 5)
    const ep = setupEndpoint(w, ctx.vars.computer)
    if (ep) {
      for (let i = 0; i < 3; i++)
        addEvent(ep, { log: 'Sicherheit', eventId: 4625, level: 'Überprüfung fehlgeschlagen', source: 'Microsoft-Windows-Security-Auditing', message: 'Fehler beim Anmelden eines Kontos.\n\nKontoname: t.richter\nFehlerursache: Unbekannter Benutzername oder ungültiges Kennwort.\nAnmeldetyp: 2 (Interaktiv)', time: minutesAgo(12 - i) })
    }
  },
  checks: [
    { id: 'reset', label: 'Neues Initialkennwort gesetzt', points: 6, test: (w, ctx) => isAfter(findUser(w, 't.richter')?.pwdLastSet, ctx.vars.pwdBefore), hint: 'AD-Konsole → Benutzer → "Kennwort zurücksetzen".' },
    { id: 'mustchange', label: '"Kennwort bei der nächsten Anmeldung ändern" aktiviert', points: 4, test: (w) => !!findUser(w, 't.richter')?.mustChangePassword, hint: 'Ein vom Helpdesk vergebenes Kennwort kennt nicht nur der Benutzer – er muss es sofort selbst ändern.' },
    { id: 'unlocked', label: 'Konto entsperrt', points: 4, test: (w) => !findUser(w, 't.richter')?.lockedOut, hint: 'Beim Zurücksetzen "Konto entsperren" mit anhaken.' },
  ],
  penalties: [{ id: 'never-expires', label: '"Kennwort läuft nie ab" gesetzt – verstößt gegen die Kennwortrichtlinie', points: 5, test: (w) => !!findUser(w, 't.richter')?.passwordNeverExpires }],
  workNoteKeywords: [
    { label: 'Identität geprüft', any: ['identität', 'personalnummer', 'geburtsdatum', 'verifiziert'] },
    { label: 'Kennwort zurückgesetzt', any: ['zurückgesetzt', 'reset', 'initialkennwort', 'neues kennwort', 'kennwort gesetzt'] },
    { label: 'Muss ändern / telefonisch mitgeteilt', any: ['nächsten anmeldung', 'muss ändern', 'ändern bei', 'telefonisch'] },
  ],
  caller: {
    intro: 'Hallo, Tim Richter hier aus dem Vertriebsinnendienst. Peinlich, aber … ich war drei Wochen krank und jetzt fällt mir mein Kennwort nicht mehr ein. Ich habe ein paar Varianten probiert und jetzt steht da, mein Konto ist gesperrt.',
    mood: 'verunsichert',
    facts: [
      { keywords: ['meldung', 'steht da', 'fehlermeldung', 'was steht'], answer: '"Das referenzierte Konto ist zurzeit gesperrt und kann nicht verwendet werden." Davor kam ein paar Mal "Der Benutzername oder das Kennwort ist falsch".' },
      { keywords: ['aufgeschrieben', 'notiert', 'zettel', 'erinnern', 'merken'], answer: 'Aufgeschrieben habe ich es nirgends – das soll man ja nicht. Ich weiß nur noch, dass irgendwas mit "Sommer" drin war.' },
      { keywords: ['per mail', 'e-mail', 'chat', 'schicken', 'zusenden'], answer: 'Können Sie mir das neue Kennwort nicht einfach per Mail schicken? … Ach so, da komme ich ja gar nicht ran. Dann sagen Sie es mir lieber am Telefon.' },
      { keywords: ['handy', 'smartphone', 'mobil'], answer: 'Ein Diensthandy habe ich nicht. Auf dem privaten Handy habe ich nur Teams – das hat noch nicht nach dem Kennwort gefragt.' },
    ],
    fallback: ['Das weiß ich leider nicht so genau, ich bin da nicht so technisch.', 'Ich sehe nur die Anmeldemaske mit der Meldung, dass das Konto gesperrt ist.'],
    resolvedReply: 'Okay, ich bin drin! Es wollte gleich ein neues Kennwort von mir – das habe ich jetzt geändert. Vielen Dank!',
    unresolvedReply: 'Hm, bei der Anmeldung kommt immer noch eine Fehlermeldung.',
    persona: 'Tim ist höflich, etwas peinlich berührt und technisch wenig versiert. Er nennt Personalnummer und Geburtsdatum nur auf Nachfrage und schreibt das neue Kennwort mit.',
  },
  hints: [
    'Bevor du am Konto etwas änderst: Identität prüfen (Personalnummer + Geburtsdatum mit dem AD vergleichen).',
    'AD-Konsole: t.richter → "Kennwort zurücksetzen" – Häkchen "Benutzer muss Kennwort bei der nächsten Anmeldung ändern" und "Konto entsperren" setzen.',
    'Das Initialkennwort nur am Telefon nennen – nie per E-Mail/Chat und nie in die Arbeitsnotiz schreiben.',
  ],
  solution: [
    'Anruf annehmen, Ticket übernehmen, Kategorie "Konto & Zugriff", Priorität P3 (eine Person betroffen, kann nicht arbeiten).',
    'Identität prüfen: Personalnummer und Geburtsdatum mit dem AD-Eintrag vergleichen.',
    'AD-Konsole: Kennwort von t.richter auf ein richtlinienkonformes Initialkennwort zurücksetzen, "muss bei der nächsten Anmeldung ändern" und "Konto entsperren" aktivieren.',
    'Initialkennwort ausschließlich am Telefon mitteilen; der Benutzer vergibt bei der Anmeldung sofort ein eigenes Kennwort.',
    'Anmeldung bestätigen lassen, Vorgehen (ohne Kennwort!) dokumentieren, mit "Gelöst (dauerhaft)" schließen.',
  ],
  kb: ['KB0002', 'KB0003', 'KB0029'],
}

// ───────────────────────── Kennwort abgelaufen im Homeoffice ─────────────────────────

export const kennwortAbgelaufenHomeoffice: Scenario = {
  id: 'kennwort-abgelaufen-homeoffice',
  title: 'Kennwort abgelaufen – VPN lehnt ab',
  summary: 'Homeoffice-Benutzerin kann ihr abgelaufenes Kennwort ohne Firmennetz nicht ändern. Temporäres Kennwort OHNE "muss ändern" setzen, damit die VPN-Anmeldung klappt.',
  difficulty: 2,
  category: 'Konto & Zugriff',
  skills: ['Telefon', 'Identitätsprüfung', 'Active Directory', 'VPN', 'Kennwortrichtlinie'],
  requester: 'j.hoffmann',
  channel: 'Telefon',
  ticket: { title: 'VPN: Kennwort abgelaufen', description: 'VPN-Anmeldung aus dem Homeoffice schlägt fehl – Kennwort abgelaufen.' },
  expected: { priority: ['P2 – Hoch', 'P3 – Mittel'], category: 'Konto & Zugriff', resolutionCodes: ['Gelöst (dauerhaft)'] },
  identityRequired: true,
  setup: (w, ctx) => {
    const u = findUser(w, 'j.hoffmann')
    if (!u) return
    u.passwordExpired = true
    u.mustChangePassword = false
    u.pwdLastSet = daysAgo(93)
    ctx.vars.pwdBefore = u.pwdLastSet
    ctx.vars.computer = pcOf(w, u.sam)
    const ep = setupEndpoint(w, ctx.vars.computer)
    if (ep) {
      disconnectVpn(w, ep)
      ep.vpn.lastError = 'Authentifizierung fehlgeschlagen: Das Kennwort ist abgelaufen.'
      addEvent(ep, { log: 'Anwendung', eventId: 2004, level: 'Fehler', source: 'SecureLink VPN', message: 'Verbindungsaufbau zu vpn.musterwerk.example fehlgeschlagen: Authentifizierung abgelehnt (RADIUS Access-Reject – Kennwort abgelaufen).', time: minutesAgo(8) })
      addEvent(ep, { log: 'System', eventId: 5719, level: 'Fehler', source: 'NETLOGON', message: 'Dieser Computer konnte keine sichere Sitzung mit einem Domänencontroller in der Domäne MUSTERWERK einrichten (kein Domänencontroller erreichbar).', time: minutesAgo(30) })
    }
    dcEvent(w, 4771, 'Fehler bei der Kerberos-Vorauthentifizierung.\n\nKontoname: j.hoffmann\nFehlercode: 0x17 (Kennwort abgelaufen)\nClientadresse: 10.10.0.5 (VPN-Gateway)', 'Überprüfung fehlgeschlagen', 'Kerberos-Authentifizierungsdienst')
  },
  tick: (w, ctx) => {
    // Sobald die Anmeldung wieder möglich ist, verbindet die Benutzerin das VPN selbst.
    if (ctx.vars.vpnAuto === '1' || !vpnLoginPossible(w, 'j.hoffmann')) return
    const ep = setupEndpoint(w, ctx.vars.computer)
    if (!ep || ep.vpn.connected) return
    if (!connectVpn(w, ep)) {
      ctx.vars.vpnAuto = '1'
      addEvent(ep, { log: 'Anwendung', eventId: 2001, level: 'Informationen', source: 'SecureLink VPN', message: 'Verbindung zu vpn.musterwerk.example hergestellt (Benutzer MUSTERWERK\\j.hoffmann).' })
    }
  },
  checks: [
    { id: 'pwd', label: 'Neues Kennwort gesetzt (nicht mehr abgelaufen)', points: 5, test: (w, ctx) => { const u = findUser(w, 'j.hoffmann'); return !!u && !u.passwordExpired && isAfter(u.pwdLastSet, ctx.vars.pwdBefore) }, hint: 'Kennwort im AD zurücksetzen (nach Identitätsprüfung).' },
    { id: 'nomust', label: '"Muss Kennwort ändern" NICHT gesetzt – sonst lehnt das VPN die Anmeldung ab', points: 4, test: (w) => { const u = findUser(w, 'j.hoffmann'); return !!u && !u.mustChangePassword }, hint: 'Ohne VPN erreicht das Notebook keinen Domänencontroller – die Kennwortänderung bei der Anmeldung ist nicht möglich.' },
    { id: 'vpn', label: 'VPN-Anmeldung wieder möglich', points: 5, test: (w) => vpnLoginPossible(w, 'j.hoffmann'), hint: 'Konto aktiv, nicht gesperrt, Kennwort gültig und Mitglied in GG_VPN_Benutzer?' },
  ],
  penalties: [{ id: 'never-expires', label: '"Kennwort läuft nie ab" als Abkürzung gesetzt', points: 5, test: (w) => !!findUser(w, 'j.hoffmann')?.passwordNeverExpires }],
  workNoteKeywords: [
    { label: 'Ursache: Kennwort abgelaufen', any: ['abgelaufen', 'expired', '90 tage'] },
    { label: 'Temporäres Kennwort ohne "muss ändern"', any: ['ohne muss', 'nicht ändern', 'temporär', 'kein muss', 'strg+alt+entf'] },
    { label: 'VPN', any: ['vpn', 'securelink'] },
  ],
  caller: {
    intro: 'Hallo, Julia Hoffmann, Key Account im Vertrieb. Ich sitze im Homeoffice in Lübeck und komme nicht ins VPN. Der Client sagt "Authentifizierung fehlgeschlagen – Kennwort abgelaufen". Um zehn habe ich eine Kundenpräsentation, für die ich ans Laufwerk muss!',
    mood: 'gestresst',
    facts: [
      { keywords: ['ändern', 'strg', 'entf', 'selbst'], answer: 'Ich habe versucht, das Kennwort über Strg+Alt+Entf zu ändern, aber da kommt "Die Domäne ist nicht verfügbar". Ich bin ja nicht im Firmennetz …' },
      { keywords: ['erinnerung', 'hinweis', 'benachrichtigung', 'vorher'], answer: 'Ja, da kam letzte Woche wohl so eine Erinnerung, die habe ich weggeklickt. Ich war die ganze Zeit beim Kunden unterwegs.' },
      { keywords: ['büro', 'buero', 'vorbeikommen', 'in die firma'], answer: 'Ins Büro schaffe ich es heute nicht – Lübeck–Hamburg ist mir für eine Kennwortänderung zu weit.' },
      { keywords: ['internet', 'wlan', 'router'], answer: 'Internet geht ganz normal, ich kann surfen und mit Ihnen telefonieren.' },
      { keywords: ['outlook', 'teams'], answer: 'Outlook hat heute früh auch nach dem Kennwort gefragt, das alte nimmt es nicht mehr.' },
    ],
    fallback: ['Der VPN-Client zeigt nur: "Authentifizierung fehlgeschlagen: Das Kennwort ist abgelaufen."', 'Das weiß ich nicht genau – ich muss nur dringend ins VPN.'],
    resolvedReply: 'Das VPN ist verbunden! Ich ändere das Kennwort jetzt gleich über Strg+Alt+Entf in ein eigenes. Danke, Sie haben meinen Termin gerettet!',
    unresolvedReply: 'Nein, der VPN-Client sagt immer noch "Authentifizierung fehlgeschlagen".',
    persona: 'Julia ist unter Zeitdruck, aber kooperativ. Sie ist im Homeoffice, ihr Notebook hat ohne VPN keine Verbindung zum Firmennetz.',
  },
  hints: [
    'Identität prüfen – dann im AD nachsehen: Das Kennwort ist abgelaufen (Kennwort zuletzt gesetzt vor über 90 Tagen).',
    'Im Homeoffice kann die Benutzerin das Kennwort nicht selbst ändern, weil ohne VPN kein Domänencontroller erreichbar ist. Ein Kennwort mit "muss ändern" lehnt das VPN ebenfalls ab.',
    'Temporäres Kennwort OHNE "Benutzer muss Kennwort bei der nächsten Anmeldung ändern" setzen, telefonisch mitteilen. Benutzerin verbindet das VPN und ändert danach selbst per Strg+Alt+Entf.',
  ],
  solution: [
    'Ticket übernehmen, Kategorie "Konto & Zugriff", Priorität P2 (Kundentermin, keine Arbeit möglich) bzw. P3.',
    'Identität prüfen (Personalnummer + Geburtsdatum).',
    'AD: Kennwort ist abgelaufen. Temporäres, richtlinienkonformes Kennwort setzen – OHNE "muss bei der nächsten Anmeldung ändern" (VPN würde sonst ablehnen), kein "Kennwort läuft nie ab".',
    'Kennwort telefonisch mitteilen. Benutzerin verbindet das VPN und ändert das Kennwort anschließend per Strg+Alt+Entf in ein eigenes.',
    'Erfolgreiche VPN-Verbindung bestätigen lassen, dokumentieren (ohne Kennwort), schließen.',
  ],
  kb: ['KB0004', 'KB0003', 'KB0014'],
}

// ───────────────────────── Konto wird immer wieder gesperrt ─────────────────────────

const STALE_DRIVE = '\\\\FS01\\Produktion\\Schichtplaene'
const staleDrivePresent = (ep: Endpoint | undefined) => !!ep && ep.mappedDrives.some((d) => d.letter === 'Z:') && !!getRegValue(ep, 'HKCU\\Network\\Z', 'UserName')

export const kontoSperrtWiederholt: Scenario = {
  id: 'konto-sperrt-wiederholt',
  title: 'Konto wird immer wieder gesperrt',
  summary: 'Entsperren hilft nur kurz. Sperrquelle im DC-Protokoll finden und auf dem Client die Ursache beseitigen: Netzlaufwerk mit gespeicherten alten Anmeldedaten.',
  difficulty: 3,
  category: 'Konto & Zugriff',
  skills: ['Telefon', 'Active Directory', 'DC-Sicherheitsprotokoll', 'Remote-Desktop', 'Netzlaufwerke', 'Ursachenanalyse'],
  requester: 's.peters',
  channel: 'Telefon',
  ticket: { title: 'Konto wird ständig gesperrt', description: 'Konto des Benutzers wird nach dem Entsperren immer wieder gesperrt.' },
  expected: { priority: ['P3 – Mittel', 'P2 – Hoch'], category: 'Konto & Zugriff', resolutionCodes: ['Gelöst (dauerhaft)'] },
  identityRequired: true,
  setup: (w, ctx) => {
    const u = findUser(w, 's.peters')
    if (!u) return
    const host = pcOf(w, u.sam)
    ctx.vars.computer = host
    u.pwdLastSet = daysAgo(3)
    ctx.vars.pwdBefore = u.pwdLastSet
    ctx.vars.unlockSeenAt = ''
    const ep = setupEndpoint(w, host)
    if (ep) {
      ep.mappedDrives = ep.mappedDrives.filter((d) => d.letter !== 'Z:')
      ep.mappedDrives.push({ letter: 'Z:', path: STALE_DRIVE, persistent: true })
      const key = 'HKCU\\Network\\Z'
      setRegValue(ep, key, 'RemotePath', 'REG_SZ', STALE_DRIVE)
      setRegValue(ep, key, 'UserName', 'REG_SZ', 'MUSTERWERK\\s.peters')
      setRegValue(ep, key, 'ProviderName', 'REG_SZ', 'Microsoft Windows Network')
      setRegValue(ep, key, 'ConnectionType', 'REG_DWORD', 1)
      setRegValue(ep, key, 'DeferFlags', 'REG_DWORD', 4)
      for (const m of [95, 50, 6])
        addEvent(ep, { log: 'System', eventId: 31010, level: 'Fehler', source: 'Microsoft-Windows-SMBClient', message: `Die Verbindung zu ${STALE_DRIVE} (Laufwerk Z:) konnte nicht wiederhergestellt werden. Gespeicherte Anmeldeinformationen für MUSTERWERK\\s.peters wurden vom Server abgelehnt (STATUS_LOGON_FAILURE). Nächster Versuch in 5 Minuten.`, time: minutesAgo(m) })
      addEvent(ep, { log: 'Sicherheit', eventId: 4648, level: 'Überprüfung erfolgreich', source: 'Microsoft-Windows-Security-Auditing', message: 'Es wurde versucht, eine Anmeldung mit expliziten Anmeldeinformationen durchzuführen.\n\nKonto, dessen Anmeldeinformationen verwendet wurden: MUSTERWERK\\s.peters (gespeichert)\nZielserver: FS01\nProzess: C:\\Windows\\explorer.exe', time: minutesAgo(6) })
    }
    lockUser(w, u.sam, host, 5)
  },
  tick: (w, ctx) => {
    const u = findUser(w, 's.peters')
    const ep = setupEndpoint(w, ctx.vars.computer)
    if (!u || !ep || !staleDrivePresent(ep)) return
    if (u.lockedOut) {
      ctx.vars.unlockSeenAt = ''
      return
    }
    if (!ctx.vars.unlockSeenAt) {
      ctx.vars.unlockSeenAt = nowIso()
      return
    }
    if (Date.now() - new Date(ctx.vars.unlockSeenAt).getTime() >= 20_000) {
      addEvent(ep, { log: 'System', eventId: 31010, level: 'Fehler', source: 'Microsoft-Windows-SMBClient', message: `Die Verbindung zu ${STALE_DRIVE} (Laufwerk Z:) konnte nicht wiederhergestellt werden. Gespeicherte Anmeldeinformationen wurden abgelehnt (STATUS_LOGON_FAILURE).` })
      lockUser(w, u.sam, ctx.vars.computer, 5)
      ctx.vars.unlockSeenAt = ''
      ctx.vars.relocks = String(Number(ctx.vars.relocks ?? 0) + 1)
    }
  },
  checks: [
    { id: 'cause', label: 'Ursache beseitigt: Laufwerk Z: mit gespeicherten alten Anmeldedaten entfernt', points: 8, test: (w, ctx) => { const ep = epOf(w, ctx); return !!ep && !staleDrivePresent(ep) }, hint: 'Ereignisanzeige des Clients (SMBClient) und verbundene Netzlaufwerke prüfen.' },
    { id: 'unlocked', label: 'Konto entsperrt (und bleibt entsperrt)', points: 6, test: (w) => !findUser(w, 's.peters')?.lockedOut, hint: 'Nach Beseitigung der Ursache erneut entsperren.' },
  ],
  penalties: [
    { id: 'needless-reset', label: 'Unnötiger Kennwort-Reset (Benutzer kennt sein Kennwort – die Ursache bleibt bestehen)', points: 3, test: (w, ctx) => isAfter(findUser(w, 's.peters')?.pwdLastSet, ctx.vars.pwdBefore) || logged(w, ctx, A.adPasswordReset) },
  ],
  workNoteKeywords: [
    { label: 'Sperrquelle (4740 / PC)', any: ['4740', 'sperrquelle', 'aufrufer', 'pc-pr', 'quelle'] },
    { label: 'Ursache: gespeicherte Anmeldedaten / Laufwerk Z:', any: ['z:', 'gespeichert', 'anmeldeinformationen', 'netzlaufwerk', 'laufwerk'] },
    { label: 'Maßnahme: getrennt + entsperrt', any: ['getrennt', 'net use', 'entfernt', 'entsperrt'] },
  ],
  caller: {
    intro: 'Peters, Schichtleitung Halle 1. Mein Konto ist heute schon zum dritten Mal gesperrt! Ihre Kollegin hat es heute früh entsperrt, eine Stunde später war es wieder zu. Ich muss den Schichtplan fertig machen!',
    mood: 'verärgert',
    facts: [
      { keywords: ['kennwort', 'passwort', 'geändert', 'geaendert'], answer: 'Mein Kennwort habe ich am Montag geändert, weil die Aufforderung kam. Das neue kenne ich genau, damit melde ich mich ja auch an.' },
      { keywords: ['laufwerk', 'ordner', 'schichtplan', 'verknüpfung'], answer: 'Ich habe neben S: noch ein Laufwerk Z: für die Schichtpläne. Das hat mir vor einem Jahr ein Kollege eingerichtet, mit "Anmeldedaten speichern". Seit Montag hat es so ein rotes Kreuz.' },
      { keywords: ['handy', 'smartphone', 'tablet'], answer: 'Ein Diensthandy habe ich nicht. Mails lese ich nur am PC.' },
      { keywords: ['anderen pc', 'anderen rechner', 'woanders angemeldet', 'schulung'], answer: 'Ich bin nur an meinem PC hier im Meisterbüro angemeldet.' },
      { keywords: ['wie oft', 'wann genau', 'nach wie viel'], answer: 'Immer ein paar Minuten, nachdem es entsperrt wurde, geht es wieder los.' },
    ],
    fallback: ['Es steht einfach wieder "Konto gesperrt" da, wenn ich auf S: zugreifen will.', 'Keine Ahnung, ich mache nichts anders als sonst.'],
    resolvedReply: 'Jetzt ist seit ein paar Minuten Ruhe und das Konto bleibt offen. Z: brauche ich nicht – die Schichtpläne liegen eh auf S:. Danke!',
    unresolvedReply: 'Ich traue dem Frieden nicht – heute früh war es auch erst offen und dann wieder gesperrt.',
    persona: 'Sven ist genervt, weil das Problem schon mehrfach "gelöst" wurde. Er ist aber sachlich, wenn man ihm erklärt, was man tut.',
  },
  hints: [
    'Entsperren allein reicht nicht – suche die Sperrquelle: Infrastruktur → DC01 → Sicherheitsprotokoll (Ereignis 4740, "Aufrufername des Computers").',
    'Die Sperren kommen vom eigenen PC des Benutzers. Schau dort in die Ereignisanzeige (SMBClient) und auf die verbundenen Netzlaufwerke.',
    'Laufwerk Z: wurde mit gespeicherten (alten) Anmeldedaten verbunden. Trennen (z. B. "net use Z: /delete"), danach das Konto entsperren.',
  ],
  solution: [
    'Ticket übernehmen, Identität prüfen, Kategorie "Konto & Zugriff", P3.',
    'DC01-Sicherheitsprotokoll: Ereignis 4740 nennt als Quelle den eigenen PC des Benutzers.',
    'Remote-Desktop (Einverständnis!): Ereignisanzeige zeigt SMBClient-Fehler für Laufwerk Z: mit gespeicherten Anmeldedaten; Registry HKCU\\Network\\Z enthält "UserName".',
    'Laufwerk Z: trennen (net use Z: /delete) – die Daten liegen ohnehin auf S:.',
    'Konto entsperren, einige Minuten beobachten bzw. bestätigen lassen. KEIN Kennwort-Reset nötig.',
    'Ursache und Maßnahme dokumentieren, mit "Gelöst (dauerhaft)" schließen.',
  ],
  kb: ['KB0001', 'KB0015'],
}

// ───────────────────────── MFA: neues Smartphone ─────────────────────────

export const mfaNeuesSmartphone: Scenario = {
  id: 'mfa-neues-smartphone',
  title: 'Neues Smartphone – MFA geht nicht mehr',
  summary: 'Identität prüfen und die MFA-Registrierung im Cloud Admin Center zurücksetzen, damit die Authenticator-App neu eingerichtet werden kann.',
  difficulty: 1,
  category: 'Konto & Zugriff',
  skills: ['Telefon', 'Identitätsprüfung', 'Cloud Admin Center', 'MFA'],
  requester: 'j.hahn',
  channel: 'Telefon',
  ticket: { title: 'MFA nach Handywechsel', description: 'Benutzerin hat ein neues Smartphone, die Authenticator-App ist nicht mehr registriert.' },
  expected: { priority: ['P3 – Mittel', 'P2 – Hoch'], category: ['Konto & Zugriff', 'E-Mail & Cloud'], resolutionCodes: ['Gelöst (dauerhaft)', 'Anfrage erfüllt'] },
  identityRequired: true,
  setup: (w, ctx) => {
    const u = findUser(w, 'j.hahn')
    const cu = findCloudUser(w, 'j.hahn')
    if (!u || !cu) return
    ctx.vars.computer = pcOf(w, u.sam)
    ctx.vars.pwdBefore = u.pwdLastSet
    ctx.vars.oldMfa = cu.mfa.methods.map((m) => m.id).join(',')
    for (const m of [25, 18, 4])
      cu.signIns.unshift({ id: `si-mfa-${m}`, time: minutesAgo(m), app: 'Outlook', ip: '84.131.20.17', location: `${u.homeAddress?.city ?? 'Stade'}, DE`, client: 'Windows 11 / Desktop-App', status: 'Unterbrochen (MFA)', failureReason: 'MFA-Anforderung wurde nicht beantwortet (Authenticator-App).', risk: 'keines' })
  },
  checks: [
    { id: 'mfa', label: 'MFA-Registrierung zurückgesetzt (alte App-Bindung entfernt)', points: 10, test: (w, ctx) => { const cu = findCloudUser(w, 'j.hahn'); const old = (ctx.vars.oldMfa ?? '').split(','); return !!cu && cu.mfa.requireReRegister && !cu.mfa.methods.some((m) => old.includes(m.id)) }, hint: 'Cloud Admin Center → Benutzer → Authentifizierungsmethoden → MFA zurücksetzen.' },
    { id: 'access', label: 'Anmeldung nicht blockiert', points: 3, test: (w) => !findCloudUser(w, 'j.hahn')?.signInBlocked },
  ],
  penalties: [{ id: 'pwd', label: 'Unnötiger Kennwort-Reset (nur das Smartphone ist neu)', points: 3, test: (w, ctx) => isAfter(findUser(w, 'j.hahn')?.pwdLastSet, ctx.vars.pwdBefore) }],
  workNoteKeywords: [
    { label: 'Identität geprüft', any: ['identität', 'personalnummer', 'geburtsdatum', 'verifiziert'] },
    { label: 'MFA zurückgesetzt', any: ['mfa', 'authenticator', 'zwei-faktor', 'mehrstufig'] },
    { label: 'Neues Gerät', any: ['neues handy', 'neues smartphone', 'handywechsel', 'gerätewechsel', 'defekt'] },
  ],
  caller: {
    intro: 'Hallo, hier ist Jana Hahn vom Kundenservice. Ich habe seit gestern ein neues Handy – das alte ist runtergefallen und hinüber. Jetzt will Outlook eine Bestätigung in der Authenticator-App, aber die App auf dem neuen Handy kennt mein Konto nicht.',
    mood: 'freundlich',
    facts: [
      { keywords: ['altes handy', 'alte handy', 'altes smartphone', 'kaputt', 'defekt', 'verloren', 'gestohlen'], answer: 'Das alte Handy hat ein gesprungenes Display und geht nicht mehr an. Verloren oder gestohlen ist es nicht, es liegt hier vor mir.' },
      { keywords: ['rufnummer', 'sms', 'nummer'], answer: 'Die Rufnummer ist die gleiche, nur das Gerät ist neu. SMS als Methode habe ich nie eingerichtet.' },
      { keywords: ['diensthandy', 'privat'], answer: 'Es ist mein privates Handy – ich habe kein Diensthandy, die App darf ich laut Betriebsvereinbarung aber privat nutzen.' },
      { keywords: ['kennwort', 'passwort'], answer: 'Mein Kennwort weiß ich, das funktioniert auch – nur die Bestätigung in der App klappt nicht.' },
      { keywords: ['qr', 'einrichten', 'registrieren', 'neu anmelden'], answer: 'Wenn Sie es zurückgesetzt haben, kommt dann der QR-Code wieder? Dann richte ich die App gleich ein.' },
    ],
    fallback: ['Outlook zeigt: "Genehmigen Sie die Anmeldeanforderung in Ihrer Authenticator-App" – aber auf dem neuen Handy kommt nichts.', 'Da bin ich überfragt, ich bin keine Technikerin.'],
    resolvedReply: 'Ja! Es kam "Weitere Informationen erforderlich", ich habe den QR-Code gescannt und bin in Outlook. Vielen Dank!',
    unresolvedReply: 'Nein, Outlook will immer noch die Bestätigung in der App, die ich nicht habe.',
    persona: 'Jana arbeitet im Homeoffice in Stade, ist freundlich und geduldig und folgt Anweisungen gut.',
  },
  hints: [
    'MFA-Zurücksetzung ist eine sensible Aktion: zuerst Identität prüfen.',
    'Cloud Admin Center → Benutzer → Jana Hahn → Authentifizierungsmethoden → "MFA zurücksetzen / erneute Registrierung erzwingen".',
    'Kennwort und Anmeldestatus bleiben unverändert – nur die MFA-Registrierung wird zurückgesetzt. Danach richtet die Benutzerin die App neu ein.',
  ],
  solution: [
    'Ticket übernehmen, Kategorie "Konto & Zugriff" (bzw. E-Mail & Cloud), P3.',
    'Identität prüfen (Personalnummer + Geburtsdatum).',
    'Cloud Admin Center: Anmeldeprotokoll zeigt "Unterbrochen (MFA)". MFA-Methoden von Jana Hahn zurücksetzen (erneute Registrierung erzwingen).',
    'Benutzerin meldet sich neu an und scannt den QR-Code mit der Authenticator-App auf dem neuen Handy. Kein Kennwort-Reset nötig.',
    'Erfolg bestätigen lassen, dokumentieren, schließen.',
  ],
  kb: ['KB0005', 'KB0002'],
}

export const ACCOUNT_SCENARIOS: Scenario[] = [kennwortVergessen, kennwortAbgelaufenHomeoffice, kontoSperrtWiederholt, mfaNeuesSmartphone]
