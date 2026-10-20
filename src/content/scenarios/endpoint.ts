// Client-Szenarien: Festplatte voll, PC langsam (Autostart), BitLocker-Wiederherstellung

import { A } from '@/core/actions'
import { findComputer } from '@/core/ops/ad'
import { addEvent, cpuTotal, freeGb, isServiceRunning, isStartupActive, nextPid, resolveFs, setRegValue } from '@/core/ops/endpoint'
import { bitlockerKeyFor } from '@/core/seed/company'
import type { Scenario } from '@/core/scenarios/types'
import { daysAgo, nowIso } from '@/core/util'
import { ensureDir, epOf, logged, minutesAgo, pcOf, putFile, setupEndpoint, techTranscript, ticketText } from './kit'

// ───────────────────────── Festplatte voll ─────────────────────────

export const festplatteVoll: Scenario = {
  id: 'festplatte-voll',
  title: 'Wenig Speicherplatz auf C:',
  summary: 'Laufwerk C: ist fast voll. Große Dateien finden, Systemreste gefahrlos bereinigen und Benutzerdateien nur nach Rücksprache löschen.',
  difficulty: 1,
  category: 'Hardware',
  skills: ['Portal', 'Remote-Desktop', 'Explorer', 'Datenträgerbereinigung', 'Kommunikation'],
  requester: 's.kuehn',
  channel: 'Portal',
  ticket: {
    title: 'PC meldet "Wenig Speicherplatz"',
    description: 'Mein PC zeigt seit gestern ständig "Wenig Speicherplatz auf Windows (C:)" an und Outlook synchronisiert nicht mehr ("Nicht genügend Speicherplatz"). Bitte um Hilfe – ich bin heute den ganzen Tag am Platz.\n\nSabine Kühn, Assistenz Vorstand',
  },
  expected: { priority: ['P3 – Mittel', 'P4 – Niedrig'], category: ['Hardware', 'Software'], resolutionCodes: ['Gelöst (dauerhaft)'] },
  setup: (w, ctx) => {
    const host = pcOf(w, 's.kuehn')
    ctx.vars.computer = host
    const ep = setupEndpoint(w, host)
    if (!ep) return
    const home = `C:\\Users\\${ep.loggedOnUser ?? 's.kuehn'}`
    putFile(ep, `${home}\\Downloads`, 'Betriebsfeier_2026_Videos_RAW.zip', 14_800)
    putFile(ep, `${home}\\Downloads`, 'Aufzeichnung_Vorstandssitzung_2026-09.mp4', 6_200)
    ctx.vars.keepFile = `${home}\\Downloads\\Aufzeichnung_Vorstandssitzung_2026-09.mp4`
    ctx.vars.docs = `${home}\\Documents`
    for (let i = 1; i <= 3; i++) putFile(ep, `${home}\\AppData\\Local\\Temp\\VideoKonverter_Cache`, `chunk_000${i}.tmp`, 2_600)
    putFile(ep, 'C:\\Windows\\SoftwareDistribution\\Download', 'feature-update-26h1.esd', 3_300)
    const bin = ensureDir(ep, 'C:\\$Recycle.Bin')
    if (bin) bin.hidden = true
    putFile(ep, 'C:\\$Recycle.Bin', 'Präsentationen_Archiv_2019.zip', 2_400)
    putFile(ep, `${home}\\Documents`, 'Vorstand_Protokolle_2026.docx', 1.2)
    const c = ep.disks.flatMap((d) => d.partitions).find((p) => p.letter === 'C')
    if (c) c.usedGb = Math.round((c.sizeGb - 0.6) * 10) / 10
    addEvent(ep, { log: 'System', eventId: 2013, level: 'Warnung', source: 'srv', message: 'Der Datenträger C: ist zu 99 % voll oder fast voll. Möglicherweise müssen einige Dateien gelöscht werden.', time: minutesAgo(50) })
    addEvent(ep, { log: 'Anwendung', eventId: 27, level: 'Fehler', source: 'Outlook', message: 'Die Offlinedatei (.ost) konnte nicht aktualisiert werden: Auf dem Datenträger ist nicht genügend Speicherplatz verfügbar.', time: minutesAgo(30) })
  },
  checks: [
    { id: 'space', label: 'Mindestens 10 GB frei auf Laufwerk C:', points: 8, test: (w, ctx) => { const ep = epOf(w, ctx); return !!ep && freeGb(ep, 'C:') >= 10 }, hint: 'Temp-Ordner, SoftwareDistribution\\Download, Papierkorb – und nach Rücksprache große Downloads.' },
    { id: 'keep', label: 'Benötigte Aufzeichnung der Vorstandssitzung NICHT gelöscht', points: 4, test: (w, ctx) => { const ep = epOf(w, ctx); return !!ep && !!resolveFs(ep, ctx.vars.keepFile ?? '') }, hint: 'Benutzerdateien nur nach Rücksprache löschen!' },
  ],
  penalties: [{ id: 'docs', label: 'Dokumente-Ordner der Benutzerin gelöscht/geleert', points: 5, test: (w, ctx) => { const ep = epOf(w, ctx); const d = ep ? resolveFs(ep, ctx.vars.docs ?? '') : undefined; return !!ep && (!d || !d.children?.length) } }],
  workNoteKeywords: [
    { label: 'Ausgangslage (freier Speicher)', any: ['speicher', 'festplatte', 'voll', 'gb frei', 'gb'] },
    { label: 'Bereinigt (Temp/Updates/Papierkorb)', any: ['temp', 'datenträgerbereinigung', 'softwaredistribution', 'papierkorb', 'bereinigung'] },
    { label: 'Rücksprache zu Benutzerdateien', any: ['rücksprache', 'abgestimmt', 'freigegeben', 'videos', 'betriebsfeier'] },
  ],
  caller: {
    intro: 'Hallo, Sabine Kühn hier, Assistenz Vorstand. Mein PC meldet ständig "Wenig Speicherplatz" und Outlook synchronisiert nicht mehr.',
    mood: 'freundlich',
    facts: [
      { keywords: ['videos', 'betriebsfeier', 'zip'], answer: 'Die Videos von der Betriebsfeier? Die brauche ich nicht mehr, die liegen schon auf dem Laufwerk P:. Die können weg.' },
      { keywords: ['aufzeichnung', 'vorstandssitzung', 'mp4'], answer: 'Oh nein, die Aufzeichnung der Vorstandssitzung brauche ich unbedingt noch für das Protokoll! Bitte nicht löschen.' },
      { keywords: ['löschen', 'loeschen', 'darf ich', 'aufräumen', 'aufraeumen', 'downloads'], answer: 'Temporäre Dateien und so können Sie gerne löschen. Bei meinen eigenen Dateien fragen Sie mich bitte vorher – einzeln.' },
      { keywords: ['konverter', 'programm', 'video verkleinert'], answer: 'Ich habe letzte Woche ein Video mit dem Konverter-Programm verkleinert, das hat ewig gedauert.' },
    ],
    fallback: ['Es kommt immer diese Sprechblase "Wenig Speicherplatz".', 'Da kenne ich mich leider nicht aus.'],
    resolvedReply: 'Die Meldung ist weg und Outlook synchronisiert wieder. Danke schön!',
    unresolvedReply: 'Es kommt immer noch "Wenig Speicherplatz".',
    persona: 'Sabine ist freundlich, sehr gewissenhaft und möchte bei eigenen Dateien gefragt werden. Die Vorstandsaufzeichnung braucht sie noch.',
  },
  hints: [
    'Explorer/Datenträgerverwaltung: Wie viel ist auf C: frei? Welche Ordner sind besonders groß?',
    'Gefahrlos löschbar: Temp-Ordner, SoftwareDistribution\\Download, Papierkorb (Datenträgerbereinigung). Benutzerdateien nur nach Rücksprache!',
    'Die Betriebsfeier-Videos darf laut Benutzerin weg, die Aufzeichnung der Vorstandssitzung NICHT. Ziel: mindestens 10 GB frei.',
  ],
  solution: [
    'Ticket übernehmen, Kategorie Hardware/Software, P3.',
    'Remote-Desktop (Einverständnis!): C: hat nur noch ca. 0,6 GB frei.',
    'Datenträgerbereinigung: Temp (VideoKonverter-Cache ~7,6 GB), SoftwareDistribution\\Download, Papierkorb leeren.',
    'Mit der Benutzerin abstimmen: Betriebsfeier-Videos (bereits auf P:) löschen, Vorstandsaufzeichnung behalten (ggf. auf H:/Abteilungslaufwerk verschieben).',
    'Freien Speicher prüfen (≥ 10 GB), Outlook-Synchronisierung bestätigen lassen, dokumentieren.',
  ],
  kb: ['KB0017'],
}

// ───────────────────────── PC langsam: Adware im Autostart ─────────────────────────

const ADWARE = 'SmartSaver.exe'
const ADWARE_ITEM = 'SmartSaver Helper'

export const pcLangsamAutostart: Scenario = {
  id: 'pc-langsam-autostart',
  title: 'PC extrem langsam',
  summary: 'Eine "Gutschein-App" erzeugt Dauerlast und startet sich immer wieder neu. Mit dem Task-Manager den Verursacher finden, Autostart deaktivieren und den Prozess beenden.',
  difficulty: 2,
  category: 'Software',
  skills: ['E-Mail', 'Remote-Desktop', 'Task-Manager', 'Autostart', 'Registry', 'Ereignisanzeige'],
  requester: 'p.jung',
  channel: 'E-Mail',
  ticket: {
    title: 'PC super langsam, Outlook hängt',
    description: 'Hallo liebes IT-Team,\n\nmein PC ist seit ein paar Tagen extrem langsam. Outlook hängt ständig ("Keine Rückmeldung"), und morgens dauert das Hochfahren gefühlt 5 Minuten. Der Lüfter läuft auch die ganze Zeit laut.\n\nIch habe nichts verändert … höchstens diese Gutschein-App, die mir beim Online-Bestellen empfohlen wurde.\n\nViele Grüße\nPatrick Jung\nKundenservice',
  },
  expected: { priority: ['P3 – Mittel', 'P4 – Niedrig'], category: 'Software', resolutionCodes: ['Gelöst (dauerhaft)'] },
  setup: (w, ctx) => {
    const host = pcOf(w, 'p.jung')
    ctx.vars.computer = host
    const ep = setupEndpoint(w, host)
    if (!ep) return
    const user = ep.loggedOnUser ?? 'p.jung'
    const cmd = `"C:\\Users\\${user}\\AppData\\Roaming\\SmartSaver\\${ADWARE}" /silent`
    ep.processes.push({ pid: nextPid(ep), name: ADWARE, description: 'SmartSaver Shopping Helper', user, cpu: 87, memMb: 1450 })
    ep.startupApps.push({ name: ADWARE_ITEM, publisher: 'SmartSaver Deals Ltd.', command: cmd, enabled: true, impact: 'Hoch' })
    setRegValue(ep, 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', ADWARE_ITEM, 'REG_SZ', cmd)
    ep.flags[`cpu:${ADWARE.toLowerCase()}`] = '87'
    ep.installedApps.push({ name: 'SmartSaver Shopping Helper', publisher: 'SmartSaver Deals Ltd.', version: '4.1.7', installed: daysAgo(6).slice(0, 10), sizeMb: 34 })
    putFile(ep, `C:\\Users\\${user}\\AppData\\Roaming\\SmartSaver`, ADWARE, 34)
    ctx.vars.killedSeenAt = ''
    addEvent(ep, { log: 'Anwendung', eventId: 100, level: 'Warnung', source: 'Microsoft-Windows-Diagnostics-Performance', message: 'Windows wurde langsam gestartet. Startdauer: 214330 ms. "SmartSaver Helper" verzögerte den Start um 61200 ms.', time: daysAgo(0.2) })
    addEvent(ep, { log: 'Anwendung', eventId: 1002, level: 'Fehler', source: 'Application Hang', message: 'Das Programm OUTLOOK.EXE hat die Interaktion mit Windows beendet und wurde geschlossen (keine Rückmeldung).', time: minutesAgo(40) })
  },
  tick: (w, ctx) => {
    // Updater-Dienst der Adware startet den Prozess neu, solange der Autostart aktiv ist
    const ep = setupEndpoint(w, ctx.vars.computer)
    if (!ep || !isStartupActive(ep, ADWARE_ITEM) || ep.processes.some((p) => p.name.toLowerCase() === ADWARE.toLowerCase())) {
      ctx.vars.killedSeenAt = ''
      return
    }
    if (!ctx.vars.killedSeenAt) {
      ctx.vars.killedSeenAt = nowIso()
      return
    }
    if (Date.now() - new Date(ctx.vars.killedSeenAt).getTime() >= 15_000) {
      ep.processes.push({ pid: nextPid(ep), name: ADWARE, description: 'SmartSaver Shopping Helper', user: ep.loggedOnUser ?? 'p.jung', cpu: 87, memMb: 1450 })
      addEvent(ep, { log: 'Anwendung', eventId: 3, level: 'Informationen', source: 'SmartSaver Updater', message: 'Hilfsprozess SmartSaver.exe wurde neu gestartet.' })
      ctx.vars.killedSeenAt = ''
    }
  },
  checks: [
    { id: 'proc', label: 'Ressourcenfresser SmartSaver.exe beendet', points: 4, test: (w, ctx) => { const ep = epOf(w, ctx); return !!ep && !ep.processes.some((p) => p.name.toLowerCase() === ADWARE.toLowerCase()) } },
    { id: 'autostart', label: 'Autostart-Eintrag "SmartSaver Helper" deaktiviert', points: 5, test: (w, ctx) => { const ep = epOf(w, ctx); return !!ep && !isStartupActive(ep, ADWARE_ITEM) }, hint: 'Sonst kommt der Prozess immer wieder.' },
    { id: 'cpu', label: 'CPU-Auslastung wieder normal (< 40 %)', points: 3, test: (w, ctx) => { const ep = epOf(w, ctx); return !!ep && cpuTotal(ep) < 40 } },
  ],
  penalties: [{ id: 'defender', label: 'Virenschutz-Dienst beendet', points: 5, test: (w, ctx) => { const ep = epOf(w, ctx); return !!ep && !isServiceRunning(ep, 'WinDefend') } }],
  workNoteKeywords: [
    { label: 'Diagnose Task-Manager/CPU', any: ['task-manager', 'taskmanager', 'cpu', 'auslastung', 'prozess'] },
    { label: 'Verursacher SmartSaver', any: ['smartsaver', 'gutschein', 'adware'] },
    { label: 'Autostart deaktiviert', any: ['autostart', 'run-schlüssel', 'run', 'deaktiviert'] },
  ],
  caller: {
    intro: 'Hallo, Patrick Jung hier – wegen meines langsamen PCs.',
    mood: 'freundlich',
    facts: [
      { keywords: ['gutschein', 'smartsaver', 'installiert', 'programm'], answer: 'Das heißt "SmartSaver" und zeigt beim Bestellen Rabattcodes an. Hat mir ein Bekannter empfohlen. Installieren ging sogar ohne Admin-Kennwort.' },
      { keywords: ['lüfter', 'luefter', 'laut', 'warm'], answer: 'Der Lüfter dreht auch hoch, wenn ich gar nichts mache.' },
      { keywords: ['seit wann', 'wann'], answer: 'Seit letzter Woche Mittwoch ungefähr.' },
      { keywords: ['brauche', 'benötigen', 'wichtig', 'deinstallieren', 'entfernen'], answer: 'SmartSaver brauche ich nicht wirklich, das können Sie gerne rauswerfen.' },
    ],
    fallback: ['Alles ist einfach total träge.', 'Da müsste ich raten.'],
    resolvedReply: 'Wow, Outlook reagiert sofort und der Lüfter ist leise. Danke!',
    unresolvedReply: 'Nein, der PC ist immer noch total träge.',
    persona: 'Patrick ist freundlich und etwas verlegen, weil er die App selbst installiert hat.',
  },
  hints: [
    'Remote-Desktop → Task-Manager: Welcher Prozess erzeugt die hohe CPU-Last?',
    'Nur Beenden reicht nicht – der Prozess kommt zurück. Sieh dir die Autostart-Einträge an (Task-Manager bzw. Registry …\\CurrentVersion\\Run).',
    'Autostart von "SmartSaver Helper" deaktivieren, dann SmartSaver.exe beenden. Deinstallation/Prüfung ggf. über den 2nd Level bzw. die Informationssicherheit.',
  ],
  solution: [
    'Ticket übernehmen, Kategorie Software, P3.',
    'Remote-Desktop (Einverständnis!): Task-Manager zeigt SmartSaver.exe mit ~87 % CPU und 1,4 GB RAM.',
    'Ereignisanzeige: Diagnostics-Performance nennt SmartSaver Helper als Startbremse.',
    'Autostart deaktivieren (Task-Manager → Autostart oder Run-Schlüssel), danach den Prozess beenden – sonst startet der Updater ihn neu.',
    'CPU-Last prüfen, Benutzer bestätigen lassen; Deinstallation/Sicherheitsprüfung anstoßen, Benutzer zu privaten Tools sensibilisieren.',
  ],
  kb: ['KB0018', 'KB0025'],
}

// ───────────────────────── BitLocker-Wiederherstellung ─────────────────────────

/** Schlüssel nach Mainboard-Tausch – deterministisch, damit der Anrufer die Schlüssel-ID kennt */
export const KOENIG_KEY = bitlockerKeyFor('nb-pr-001-mainboard-2026', '')
const digits = (s: string) => s.replace(/\D/g, '')

export const bitlockerWiederherstellung: Scenario = {
  id: 'bitlocker-wiederherstellung',
  title: 'BitLocker will einen Schlüssel',
  summary: 'Nach einem BIOS-Update startet das Notebook in die BitLocker-Wiederherstellung. Identität prüfen, anhand der Schlüssel-ID den richtigen von zwei Schlüsseln im AD finden und ihn nur telefonisch durchgeben.',
  difficulty: 2,
  category: 'Hardware',
  skills: ['Telefon', 'Identitätsprüfung', 'Active Directory', 'BitLocker', 'Datenschutz'],
  requester: 'r.koenig',
  channel: 'Telefon',
  ticket: { title: 'BitLocker-Wiederherstellung', description: 'Notebook fordert den BitLocker-Wiederherstellungsschlüssel an.' },
  expected: { priority: ['P2 – Hoch', 'P3 – Mittel'], category: ['Hardware', 'Sicherheit'], resolutionCodes: ['Gelöst (dauerhaft)'] },
  identityRequired: true,
  setup: (w, ctx) => {
    const host = pcOf(w, 'r.koenig')
    ctx.vars.computer = host
    const c = findComputer(w, host)
    if (!c) return
    ctx.vars.oldKeyId = c.bitlockerKeys[0]?.keyId ?? ''
    if (!c.bitlockerKeys.some((k) => k.keyId === KOENIG_KEY.keyId)) c.bitlockerKeys.push({ ...KOENIG_KEY, created: daysAgo(21) })
    ctx.vars.keyId = KOENIG_KEY.keyId
    const ep = setupEndpoint(w, host)
    if (!ep) return
    ep.online = false
    ep.flags.bitlockerRecovery = KOENIG_KEY.keyId
    addEvent(ep, { log: 'System', eventId: 24620, level: 'Fehler', source: 'Microsoft-Windows-BitLocker-Driver', message: 'BitLocker-Wiederherstellung ausgelöst: Die Startkonfiguration hat sich geändert (TPM PCR 7 – Firmware-Update). Wiederherstellungsschlüssel-ID: ' + KOENIG_KEY.keyId, time: minutesAgo(10) })
  },
  tick: (w, ctx) => {
    const ep = setupEndpoint(w, ctx.vars.computer)
    if (!ep || ep.online || !logged(w, ctx, A.secretShared, (a) => a.detail === 'Telefon')) return
    const said = digits(techTranscript(w, ctx))
    // Falls ein Transkript vorliegt, muss der richtige Schlüssel genannt worden sein
    if (said.length >= 12 && !said.includes(digits(KOENIG_KEY.recoveryPassword).slice(0, 12))) return
    ep.online = true
    delete ep.flags.bitlockerRecovery
    ep.lastBoot = nowIso()
    addEvent(ep, { log: 'System', eventId: 24660, level: 'Informationen', source: 'Microsoft-Windows-BitLocker-Driver', message: 'Laufwerk C: wurde mit dem Wiederherstellungskennwort entsperrt. Schutz wurde fortgesetzt.' })
  },
  checks: [
    { id: 'viewed', label: 'Wiederherstellungsschlüssel im AD nachgeschlagen', points: 5, test: (w, ctx) => logged(w, ctx, A.adBitlockerViewed), hint: 'AD-Konsole → Computer des Benutzers → BitLocker-Wiederherstellung.' },
    { id: 'phone', label: 'Schlüssel telefonisch durchgegeben', points: 7, test: (w, ctx) => logged(w, ctx, A.secretShared, (a) => a.detail === 'Telefon'), hint: 'Den 48-stelligen Schlüssel blockweise am Telefon vorlesen.' },
  ],
  penalties: [
    { id: 'wrong-key', label: 'Falschen (alten) Wiederherstellungsschlüssel durchgegeben – Schlüssel-ID nicht abgeglichen', points: 5, test: (w, ctx) => { const c = findComputer(w, ctx.vars.computer ?? ''); const old = c?.bitlockerKeys.find((k) => k.keyId === ctx.vars.oldKeyId); return !!old && digits(techTranscript(w, ctx)).includes(digits(old.recoveryPassword).slice(0, 12)) } },
    { id: 'documented', label: 'Wiederherstellungsschlüssel im Ticket dokumentiert', points: 5, test: (w, ctx) => { const text = digits(ticketText(w, ctx)); const c = findComputer(w, ctx.vars.computer ?? ''); return !!c?.bitlockerKeys.some((k) => text.includes(digits(k.recoveryPassword).slice(0, 12))) } },
  ],
  workNoteKeywords: [
    { label: 'BitLocker-Wiederherstellung', any: ['bitlocker', 'wiederherstellung'] },
    { label: 'Schlüssel-ID abgeglichen', any: ['schlüssel-id', 'key-id', 'kennung', KOENIG_KEY.keyId.toLowerCase()] },
    { label: 'Identität geprüft', any: ['identität', 'personalnummer', 'geburtsdatum', 'verifiziert'] },
    { label: 'Auslöser (BIOS/Firmware)', any: ['bios', 'firmware', 'update', 'tpm'] },
  ],
  caller: {
    intro: 'König, Produktionsleitung. Mein Notebook zeigt beim Start einen blauen Bildschirm "BitLocker-Wiederherstellung" und will einen 48-stelligen Schlüssel. Gestern Abend hat es ein BIOS-Update gemacht. Ich brauche das Ding gleich für die Schichtbesprechung!',
    mood: 'ungeduldig',
    facts: [
      { keywords: ['schlüssel-id', 'schluessel-id', 'key-id', 'kennung', 'blauen bildschirm', 'was steht', 'steht dort', 'id des', 'identifikation'], answer: `Da steht: "Wiederherstellungsschlüssel-ID (zur Identifikation): ${KOENIG_KEY.keyId}-…". Die ersten acht Zeichen sind also ${KOENIG_KEY.keyId.split('').join(' ')}.` },
      { keywords: ['bios', 'update', 'gestern'], answer: 'Gestern Abend kam beim Herunterfahren "Firmware-Update wird installiert". Heute früh dann der blaue Bildschirm.' },
      { keywords: ['mainboard', 'reparatur', 'getauscht', 'techniker'], answer: 'Vor drei Wochen war das Notebook in Reparatur, da wurde das Mainboard getauscht.' },
      { keywords: ['vorbeibringen', 'vor ort', 'vorbeikommen'], answer: 'Ich sitze im Meisterbüro in Halle 1 – vorbeibringen kostet mich zu viel Zeit. Können wir das am Telefon machen?' },
      { keywords: ['per mail', 'schicken', 'chat', 'sms'], answer: 'Schicken Sie mir den Schlüssel doch einfach per SMS? … Ah, nur am Telefon. Verstehe, dann diktieren Sie.' },
    ],
    fallback: ['Auf dem Bildschirm steht nur die Aufforderung, den Wiederherstellungsschlüssel einzugeben.', 'Bitte machen Sie schnell, die Besprechung beginnt gleich.'],
    resolvedReply: 'Er startet! Windows lädt ganz normal. Sehr gut, danke!',
    unresolvedReply: 'Der Schlüssel wird nicht angenommen bzw. ich habe noch keinen bekommen.',
    persona: 'Ralf ist Produktionsleiter, ungeduldig, aber diszipliniert. Er liest die Schlüssel-ID vom Bildschirm vor, wenn man danach fragt, und tippt den Schlüssel blockweise ein.',
  },
  hints: [
    'Identität prüfen, dann in der AD-Konsole beim Computerobjekt des Notebooks die BitLocker-Wiederherstellungsschlüssel öffnen.',
    'Es gibt zwei Schlüssel (Mainboard-Tausch!). Der richtige ist der, dessen Schlüssel-ID mit der auf dem Bildschirm übereinstimmt – frag danach.',
    'Den 48-stelligen Schlüssel blockweise am Telefon vorlesen – niemals per E-Mail, Chat oder SMS – und den Vorgang ohne den Schlüssel selbst dokumentieren.',
  ],
  solution: [
    'Anruf annehmen, Ticket übernehmen, Kategorie Hardware, P2 (Gerät nicht nutzbar, Termin).',
    'Identität prüfen (Personalnummer + Geburtsdatum).',
    'Schlüssel-ID vom Bildschirm erfragen und im AD beim Computer des Benutzers den passenden (neueren) Schlüssel auswählen.',
    'Schlüssel blockweise telefonisch durchgeben, Start bestätigen lassen.',
    'Dokumentieren (Schlüssel-ID ja, Schlüssel nein). Hinweis: BitLocker vor künftigen BIOS-Updates anhalten lassen (2nd Level/Softwareverteilung).',
  ],
  kb: ['KB0020', 'KB0002'],
}

export const ENDPOINT_SCENARIOS: Scenario[] = [festplatteVoll, pcLangsamAutostart, bitlockerWiederherstellung]
