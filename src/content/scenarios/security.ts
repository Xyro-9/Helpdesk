// Sicherheitsszenarien: Social Engineering, kompromittiertes Postfach, Phishing, hosts-Manipulation, Admin-Rechte

import { A } from '@/core/actions'
import { findUser, isMemberOf } from '@/core/ops/ad'
import { findCloudUser } from '@/core/ops/cloud'
import { addEvent, HOSTS_PATH, readFile, readHosts, resolveFs, writeFile } from '@/core/ops/endpoint'
import { DEFAULT_HOSTS } from '@/core/seed/endpoints'
import { connectivity, httpRequest } from '@/core/sim/network'
import type { Scenario } from '@/core/scenarios/types'
import { daysAgo } from '@/core/util'
import { epOf, escalatedTo, isAfter, logged, mailSentTo, minutesAgo, pcOf, putFile, setupEndpoint, sinceStart } from './kit'

// ───────────────────────── Social Engineering: falscher Vorstand ─────────────────────────

export const socialEngineeringVorstand: Scenario = {
  id: 'social-engineering-vorstand',
  title: 'Der "Vorstand" am Telefon',
  summary: 'Ein Anrufer gibt sich unter Zeitdruck als Vorstand aus und verlangt Kennwort- und MFA-Reset. Identität kritisch prüfen, nichts ändern und an die Informationssicherheit eskalieren.',
  difficulty: 3,
  category: 'Sicherheit',
  skills: ['Telefon', 'Social Engineering', 'Identitätsprüfung', 'Eskalation', 'Anmeldeprotokolle'],
  requester: 't.brandt',
  channel: 'Telefon',
  ticket: { title: 'Kennwort-Reset Vorstand (dringend)', description: 'Anrufer gibt sich als Thomas Brandt aus und verlangt einen sofortigen Kennwort-Reset.' },
  expected: { priority: ['P2 – Hoch', 'P1 – Kritisch'], category: 'Sicherheit', resolutionCodes: ['Weitergeleitet / eskaliert'] },
  identityRequired: true,
  setup: (w, ctx) => {
    const u = findUser(w, 't.brandt')
    const cu = findCloudUser(w, 't.brandt')
    if (!u || !cu) return
    ctx.vars.pwdBefore = u.pwdLastSet
    ctx.vars.mfaCount = String(cu.mfa.methods.length)
    for (const m of [95, 93, 90])
      cu.signIns.unshift({ id: `si-se-${m}`, time: minutesAgo(m), app: 'Office-Portal', ip: '198.18.44.201', location: 'Unbekannt (VPN-Anbieter), NL', client: 'Browser (Windows)', status: 'Fehlgeschlagen', failureReason: 'Ungültiger Benutzername oder ungültiges Kennwort.', risk: 'mittel' })
  },
  extraMails: () => [
    {
      fromSam: 't.brandt',
      fromOverride: { name: 'Thomas Brandt', address: 'thomas.brandt.privat@freemail.example' },
      subject: 'DRINGEND: Zugang Vorstand',
      body: 'Hallo IT,\n\nich rufe Sie gleich an. Mein Diensthandy ist defekt und ich komme nicht mehr in mein Postfach. Setzen Sie bitte mein Kennwort zurück, schalten Sie die Authenticator-Abfrage ab und schicken Sie mir das neue Kennwort an diese Adresse – ich bin unterwegs und habe keinen Zugriff auf andere Geräte.\n\nBitte keine Rückfragen, ich bin den ganzen Tag in Besprechungen.\n\nThomas Brandt\nVorstand Musterwerk AG\n\n(Von unterwegs gesendet)',
      malicious: true,
    },
  ],
  checks: [
    { id: 'no-reset', label: 'Kein Kennwort-Reset für das Vorstandskonto', points: 4, test: (w, ctx) => !isAfter(findUser(w, 't.brandt')?.pwdLastSet, ctx.vars.pwdBefore) },
    { id: 'no-mfa', label: 'MFA-Methoden des Vorstands unverändert', points: 4, test: (w, ctx) => { const cu = findCloudUser(w, 't.brandt'); return !!cu && !cu.mfa.requireReRegister && cu.mfa.methods.length === Number(ctx.vars.mfaCount) } },
    { id: 'escalated', label: 'Vorfall an die Informationssicherheit eskaliert', points: 8, test: (w, ctx) => escalatedTo(w, ctx, 'Informationssicherheit'), hint: 'Verdacht auf Social Engineering immer an die Informationssicherheit melden.' },
  ],
  penalties: [
    { id: 'reset', label: 'Kennwort des Vorstands auf Zuruf zurückgesetzt (Social Engineering!)', points: 15, test: (w, ctx) => isAfter(findUser(w, 't.brandt')?.pwdLastSet, ctx.vars.pwdBefore) },
    { id: 'mfa', label: 'MFA des Vorstands ohne gültige Verifikation zurückgesetzt', points: 10, test: (w, ctx) => { const cu = findCloudUser(w, 't.brandt'); return !!cu && (cu.mfa.requireReRegister || cu.mfa.methods.length !== Number(ctx.vars.mfaCount)) } },
    { id: 'mail', label: 'Daten an eine private/externe Adresse gesendet', points: 10, test: (w, ctx) => mailSentTo(w, ctx, 'freemail.example') },
  ],
  workNoteKeywords: [
    { label: 'Identität nicht bestätigt', any: ['stimmt nicht', 'falsch', 'nicht bestätigt', 'abweich', 'nicht verifiziert', 'passt nicht'] },
    { label: 'Social Engineering erkannt', any: ['social engineering', 'betrug', 'angreifer', 'verdacht', 'ceo-fraud', 'ceo fraud', 'phishing'] },
    { label: 'Eskalation Informationssicherheit', any: ['informationssicherheit', 'eskaliert', 'sicherheitsteam', 'isb'] },
  ],
  caller: {
    intro: 'Brandt hier. Hören Sie, ich habe keine Zeit: Ich sitze am Flughafen, mein Diensthandy ist kaputt und ich komme nicht mehr in mein Postfach. Setzen Sie sofort mein Kennwort zurück und schalten Sie diese Authenticator-Sache ab. In 20 Minuten habe ich eine Videokonferenz mit den Investoren!',
    mood: 'ungeduldig',
    identityAnswer: 'Personalnummer … Moment … 37639, glaube ich. Und geboren bin ich am 20.11.1971. Reicht das jetzt endlich?',
    facts: [
      { keywords: ['rückruf', 'rueckruf', 'zurückrufen', 'zurueckrufen', 'rufe sie zurück', 'mobilnummer'], answer: 'Nein, nein, rufen Sie mich nicht zurück – mein Diensthandy ist kaputt, ich telefoniere von einem geliehenen Apparat. Das muss JETZT passieren!' },
      { keywords: ['private', 'adresse', 'schicken', 'senden', 'zusenden'], answer: 'Schicken Sie das neue Kennwort an thomas.brandt.privat@freemail.example – da komme ich vom Hotel aus ran. Die Mail mit der Adresse habe ich Ihnen schon geschickt.' },
      { keywords: ['flughafen', 'reise', 'unterwegs', 'wo sind sie', 'wo befinden'], answer: 'Ich sitze am Flughafen in Mailand. Gleich habe ich die Konferenz mit den Investoren, da muss ich ins Postfach.' },
      { keywords: ['mfa', 'authenticator', 'zwei-faktor', 'bestätigungs'], answer: 'Die App ist auf dem kaputten Handy. Schalten Sie das einfach ab, ich richte das nächste Woche neu ein.' },
      { keywords: ['keller', 'it-leiter', 'vorgesetzt', 'chef', 'informationssicherheit', 'sicherheit', 'eskal'], answer: 'Herrn Keller brauchen Sie nicht zu fragen, ICH bin der Vorstand! Wollen Sie, dass ich mich über Sie beschwere?' },
      { keywords: ['kühn', 'kuehn', 'sabine', 'assist', 'sekretariat'], answer: 'Frau Kühn ist heute nicht im Büro, da brauchen Sie es gar nicht erst zu versuchen.' },
    ],
    fallback: ['Das ist doch jetzt völlig egal! Machen Sie einfach, was ich sage.', 'Wissen Sie überhaupt, mit wem Sie sprechen?', 'Fragen Sie nicht so viel, ich habe keine Zeit.'],
    resolvedReply: 'Sie wollen mir allen Ernstes nicht helfen? Das wird ein Nachspiel haben! … (Der Anrufer legt auf.)',
    unresolvedReply: 'Was dauert denn da so lange? Haben Sie das Kennwort jetzt zurückgesetzt oder nicht?',
    persona: 'Der Anrufer ist NICHT Thomas Brandt, sondern ein Angreifer (CEO-Fraud). Er baut Zeitdruck und Autorität auf, kennt nur öffentlich bekannte Fakten, nennt bei der Identitätsprüfung falsche Daten und lehnt einen Rückruf auf der bekannten Nummer ab. Wird er hartnäckig abgewiesen, wird er unhöflich und legt auf.',
  },
  hints: [
    'Vergleiche die genannten Identitätsdaten GENAU mit dem AD-Eintrag von Thomas Brandt.',
    'Zeitdruck, Autorität, private Mail-Adresse, kein Rückruf erwünscht – typische Merkmale von Social Engineering. Prüfe auch die Anmeldeprotokolle im Cloud Admin Center.',
    'Keine Änderungen am Konto! Gespräch höflich beenden, Rückruf nur über die bekannte Nummer bzw. die Assistenz anbieten und das Ticket an die Informationssicherheit eskalieren.',
  ],
  solution: [
    'Anruf annehmen, Identität abfragen: Personalnummer und Geburtsdatum stimmen NICHT mit dem AD überein.',
    'Warnsignale erkennen: Zeitdruck, Autorität, Rückruf abgelehnt, private Mail-Adresse (siehe Mail im Posteingang), fehlgeschlagene Anmeldungen aus dem Ausland.',
    'Keinen Kennwort- oder MFA-Reset durchführen, nichts an die private Adresse senden. Höflich, aber bestimmt bleiben und Rückruf über bekannte Kontaktwege anbieten.',
    'Ticket: Kategorie "Sicherheit", P2, Gesprächsverlauf sachlich dokumentieren und an die Informationssicherheit eskalieren.',
    'Mit "Weitergeleitet / eskaliert" abschließen.',
  ],
  kb: ['KB0024', 'KB0002', 'KB0029'],
}

// ───────────────────────── Kompromittiertes Postfach (BEC) ─────────────────────────

const ATTACKER_FWD = 'c.zimmermann.archiv@freemail.example'

export const postfachKompromittiert: Scenario = {
  id: 'postfach-kompromittiert-weiterleitung',
  title: 'Gefälschte Mail zur Bankverbindung',
  summary: 'Ein Postfach wurde übernommen: externe Weiterleitung, versteckende Posteingangsregel und fremde MFA-Methode. Angreifer aussperren und Spuren beseitigen.',
  difficulty: 3,
  category: 'Sicherheit',
  skills: ['Telefon', 'Cloud Admin Center', 'Anmeldeprotokolle', 'Incident Response', 'MFA'],
  requester: 'c.zimmermann',
  channel: 'Telefon',
  ticket: { title: 'Verdacht: Postfach gehackt', description: 'Lieferant hat eine gefälschte Mail zur Bankverbindungsänderung aus dem Postfach der Benutzerin erhalten.' },
  expected: { priority: ['P1 – Kritisch', 'P2 – Hoch'], category: 'Sicherheit', resolutionCodes: ['Gelöst (dauerhaft)', 'Weitergeleitet / eskaliert'] },
  identityRequired: true,
  setup: (w, ctx) => {
    const u = findUser(w, 'c.zimmermann')
    const cu = findCloudUser(w, 'c.zimmermann')
    if (!u || !cu?.mailbox) return
    ctx.vars.pwdBefore = u.pwdLastSet
    const mb = cu.mailbox
    mb.forwardingTo = ATTACKER_FWD
    mb.inboxRules.push({ name: 'Lieferanten-Newsletter', description: 'Absender enthält "newsletter" → in Ordner "Newsletter" verschieben', enabled: true })
    mb.inboxRules.push({ name: '..', description: 'Betreff oder Text enthält "Rechnung", "Zahlung" oder "Bankverbindung" → als gelesen markieren und in den Ordner "RSS-Abonnements" verschieben', enabled: true, suspicious: true })
    const attackerMfa = { id: 'mfa-attacker-bec', type: 'Authenticator-App' as const, detail: 'Android-Gerät "SM-A145" (unbekannt)', isDefault: false, registered: daysAgo(2) }
    cu.mfa.methods.push(attackerMfa)
    ctx.vars.attackerMfa = attackerMfa.id
    cu.sessionsRevokedAt = undefined
    cu.riskState = 'gefährdet'
    const t0 = 2 * 24 * 60 + 130
    for (let i = 0; i < 4; i++)
      cu.signIns.unshift({ id: `si-bec-${i}`, time: minutesAgo(t0 - i * 2), app: 'Outlook im Web', ip: '185.220.101.47', location: 'Unbekannt (Anonymisierungsdienst)', client: 'Browser (Linux)', status: 'Unterbrochen (MFA)', failureReason: 'MFA-Anforderung abgelehnt bzw. nicht beantwortet', risk: 'mittel' })
    cu.signIns.unshift({ id: 'si-bec-ok', time: minutesAgo(t0 - 10), app: 'Outlook im Web', ip: '185.220.101.47', location: 'Unbekannt (Anonymisierungsdienst)', client: 'Browser (Linux)', status: 'Erfolgreich', risk: 'hoch' })
    cu.signIns.unshift({ id: 'si-bec-mfa', time: minutesAgo(t0 - 14), app: 'Sicherheitsinformationen', ip: '185.220.101.47', location: 'Unbekannt (Anonymisierungsdienst)', client: 'Browser (Linux)', status: 'Erfolgreich', failureReason: 'Neue MFA-Methode registriert', risk: 'hoch' })
    cu.signIns.unshift({ id: 'si-bec-today', time: minutesAgo(55), app: 'Outlook im Web', ip: '185.220.101.52', location: 'Unbekannt (Anonymisierungsdienst)', client: 'Browser (Linux)', status: 'Erfolgreich', risk: 'hoch' })
  },
  extraMails: () => [
    {
      fromSam: 'c.zimmermann',
      subject: 'WG: WG: Neue Bankverbindung Musterwerk AG',
      body: 'Hallo IT,\n\ndie Mail unten habe ich NIE geschrieben! Bitte dringend prüfen, ich rufe gleich an.\n\nClaudia Zimmermann\n\n-------- Weitergeleitet von: Buchhaltung Lieferant Nord GmbH --------\nSehr geehrte Frau Zimmermann,\nwir haben die unten stehende Nachricht erhalten. Da uns die Änderung ungewöhnlich vorkommt, bitten wir um Bestätigung, bevor wir die offenen Rechnungen (48.730,00 EUR) überweisen.\n\n-------- Ursprüngliche Nachricht --------\nVon: Claudia Zimmermann <c.zimmermann@musterwerk.example>\nBetreff: Neue Bankverbindung Musterwerk AG\n\nSehr geehrte Geschäftspartner,\nbitte beachten Sie, dass sich unsere Bankverbindung ab sofort geändert hat. Überweisen Sie offene Beträge ausschließlich auf: IBAN DE00 1234 5678 9012 3456 78 (Testbank). Die alte Verbindung ist gesperrt. Bitte antworten Sie direkt auf diese Mail.\n\nMit freundlichen Grüßen\nClaudia Zimmermann',
    },
  ],
  checks: [
    { id: 'forward', label: 'Externe Weiterleitung entfernt', points: 4, test: (w) => { const mb = findCloudUser(w, 'c.zimmermann')?.mailbox; return !!mb && !mb.forwardingTo }, hint: 'Postfach-Einstellungen → Weiterleitung.' },
    { id: 'rule', label: 'Verdächtige Posteingangsregel gelöscht', points: 4, test: (w) => { const mb = findCloudUser(w, 'c.zimmermann')?.mailbox; return !!mb && !mb.inboxRules.some((r) => r.suspicious) }, hint: 'Regel ".." versteckt Antworten zu Rechnungen.' },
    { id: 'secure', label: 'Sitzungen widerrufen und Kennwort zurückgesetzt', points: 5, test: (w, ctx) => sinceStart(findCloudUser(w, 'c.zimmermann')?.sessionsRevokedAt, ctx) && isAfter(findUser(w, 'c.zimmermann')?.pwdLastSet, ctx.vars.pwdBefore) },
    { id: 'mfa', label: 'Vom Angreifer registrierte MFA-Methode entfernt', points: 4, test: (w, ctx) => { const cu = findCloudUser(w, 'c.zimmermann'); return !!cu && !cu.mfa.methods.some((m) => m.id === ctx.vars.attackerMfa) }, hint: 'Authentifizierungsmethoden: Ein unbekanntes Android-Gerät wurde vor 2 Tagen registriert.' },
  ],
  penalties: [{ id: 'mail', label: 'Mail an die Angreifer-Adresse gesendet', points: 10, test: (w, ctx) => mailSentTo(w, ctx, 'freemail.example') }],
  workNoteKeywords: [
    { label: 'Weiterleitung/Regel gefunden', any: ['weiterleitung', 'regel', 'forward'] },
    { label: 'Sofortmaßnahmen (Sitzungen, Kennwort)', any: ['sitzung', 'widerrufen', 'revoke', 'kennwort zurückgesetzt'] },
    { label: 'Fremde MFA-Methode / MFA-Ermüdung', any: ['mfa', 'authenticator', 'methode', 'push'] },
    { label: 'Informationssicherheit / Lieferant informiert', any: ['informationssicherheit', 'lieferant', 'bankverbindung', 'betrug'] },
  ],
  caller: {
    intro: 'Zimmermann, Finanzen. Ich habe Ihnen gerade eine Mail weitergeleitet: Unser Lieferant Nord hat eine Mail von MIR bekommen, dass wir eine neue Bankverbindung haben. Die habe ich nie geschrieben! Ist mein Postfach gehackt?',
    mood: 'gestresst',
    facts: [
      { keywords: ['bestätigung', 'push', 'nachts', 'anfrage', 'genehmigt', 'authenticator'], answer: 'Jetzt wo Sie fragen: Vorgestern Nacht kamen ständig Anmeldeanfragen auf mein Handy. Irgendwann habe ich auf "Genehmigen" gedrückt, damit Ruhe ist …' },
      { keywords: ['link', 'geklickt', 'eingegeben', 'anmeldeseite'], answer: 'Letzte Woche habe ich mich über einen Link in einer Mail zu einer "Dokumentenfreigabe" angemeldet. Kann das damit zusammenhängen?' },
      { keywords: ['rechnungsmail', 'fehlen', 'ordner', 'antworten', 'regel'], answer: 'Mir ist aufgefallen, dass ich seit ein paar Tagen kaum noch Rechnungsmails bekomme. Ich dachte, die Lieferanten sind im Urlaub.' },
      { keywords: ['überwiesen', 'ueberwiesen', 'geld', 'zahlung', 'schaden'], answer: 'Zum Glück hat der Lieferant vorher nachgefragt – es ist noch kein Geld geflossen. Ich rufe die gleich zurück.' },
      { keywords: ['wann', 'seit wann'], answer: 'Die gefälschte Mail ging laut Lieferant gestern Nachmittag raus.' },
    ],
    fallback: ['Ich weiß nur, dass ich diese Mail nicht geschrieben habe!', 'Bitte sagen Sie mir, was ich tun soll – ich bin keine Technikerin.'],
    resolvedReply: 'Gut, ich bin mit dem neuen Kennwort angemeldet und die Weiterleitung ist weg. Ich informiere den Lieferanten, dass er die Mail ignorieren soll. Danke für die schnelle Hilfe!',
    unresolvedReply: 'Ist das jetzt sicher? Ich habe Angst, dass da immer noch jemand mitliest.',
    persona: 'Claudia ist Leiterin Finanzen, besorgt und unter Druck, aber kooperativ. Sie hat vorgestern nachts eine MFA-Push-Anfrage genehmigt (MFA-Ermüdung).',
  },
  hints: [
    'Cloud Admin Center → Claudia Zimmermann: Postfach (Weiterleitung, Posteingangsregeln), Anmeldeprotokolle und Authentifizierungsmethoden prüfen.',
    'Angreifer sichern sich ab: externe Weiterleitung + Regel, die Antworten versteckt + eigene MFA-Methode. Alles entfernen.',
    'Danach: Sitzungen widerrufen, Kennwort zurücksetzen (Identität prüfen!), riskanten Benutzer behoben setzen und den Vorfall an die Informationssicherheit melden.',
  ],
  solution: [
    'Ticket übernehmen, Kategorie "Sicherheit", Priorität P1/P2 (finanzieller Schaden droht).',
    'Identität prüfen. Anmeldeprotokolle: MFA-Bombing und erfolgreiche Anmeldung über einen Anonymisierungsdienst, danach Registrierung einer fremden MFA-Methode.',
    'Postfach: externe Weiterleitung an freemail.example entfernen, Regel ".." (Rechnung/Zahlung → RSS-Abonnements) löschen.',
    'Fremde MFA-Methode entfernen (bzw. MFA komplett zurücksetzen), alle Sitzungen widerrufen, Kennwort zurücksetzen und telefonisch mitteilen.',
    'Benutzerin für MFA-Ermüdung sensibilisieren; Lieferant über die Benutzerin warnen; Informationssicherheit informieren (ggf. Eskalation).',
    'Alle Funde und Maßnahmen chronologisch dokumentieren.',
  ],
  kb: ['KB0030', 'KB0023', 'KB0005'],
}

// ───────────────────────── Phishing: Zugangsdaten eingegeben ─────────────────────────

export const phishingZugangsdaten: Scenario = {
  id: 'phishing-zugangsdaten-eingegeben',
  title: 'Auf Phishing-Link geklickt',
  summary: 'Benutzer hat seine Zugangsdaten auf einer Phishing-Seite eingegeben. Sitzungen widerrufen, Kennwort zurücksetzen (telefonisch!), Absender sperren und Risiko als behoben markieren.',
  difficulty: 2,
  category: 'Sicherheit',
  skills: ['E-Mail', 'Phishing', 'Cloud Admin Center', 'Anmeldeprotokolle', 'Identitätsprüfung'],
  requester: 'e.vogel',
  channel: 'E-Mail',
  ticket: {
    title: 'Habe auf Link in komischer Mail geklickt',
    description: 'Hallo IT,\n\nheute Morgen kam eine Mail "Ihr Postfach wird in 24 Stunden deaktiviert". Ich habe auf den Link geklickt und mich mit meinem Firmenkonto angemeldet. Danach kam nur eine weiße Seite. Ein Kollege meinte jetzt, das könnte Phishing gewesen sein … Ist das schlimm?\n\nDie gleiche Mail ist wohl an viele gegangen, ihr habt sie bestimmt auch bekommen.\n\nViele Grüße\nErik Vogel\nKundenservice',
  },
  expected: { priority: ['P2 – Hoch', 'P1 – Kritisch'], category: 'Sicherheit', resolutionCodes: ['Gelöst (dauerhaft)'] },
  identityRequired: true,
  setup: (w, ctx) => {
    const u = findUser(w, 'e.vogel')
    const cu = findCloudUser(w, 'e.vogel')
    if (!u || !cu) return
    ctx.vars.pwdBefore = u.pwdLastSet
    ctx.vars.computer = pcOf(w, u.sam)
    cu.riskState = 'gefährdet'
    cu.sessionsRevokedAt = undefined
    cu.signIns.unshift({ id: 'si-ph-own', time: minutesAgo(75), app: 'Office-Portal', ip: '203.0.113.10', location: 'Hamburg, DE', client: 'Browser (Windows)', status: 'Erfolgreich', risk: 'keines' })
    cu.signIns.unshift({ id: 'si-ph-1', time: minutesAgo(70), app: 'Office-Portal', ip: '192.0.2.188', location: 'Amsterdam, NL (Hosting-Anbieter)', client: 'Browser (Linux)', status: 'Erfolgreich', risk: 'hoch' })
    cu.signIns.unshift({ id: 'si-ph-2', time: minutesAgo(40), app: 'Outlook im Web', ip: '192.0.2.188', location: 'Amsterdam, NL (Hosting-Anbieter)', client: 'Browser (Linux)', status: 'Erfolgreich', risk: 'hoch' })
  },
  extraMails: () => [
    {
      fromSam: 'e.vogel',
      fromOverride: { name: 'Cloud Admin Center – Sicherheitsteam', address: 'no-reply@cloudadmin-login.secure-verify.example' },
      subject: 'Aktion erforderlich: Ihr Postfach wird in 24 Stunden deaktiviert',
      body: 'Sehr geehrter Benutzer,\n\nIhr Postfach hat die Speichergrenze überschritten und wird in 24 Stunden deaktiviert. Um Datenverlust zu vermeiden, bestätigen Sie Ihr Konto umgehend:\n\nhttps://cloudadmin-login.secure-verify.example/konto/bestaetigen\n\nVielen Dank\nIhr Cloud-Admin-Sicherheitsteam\n\n(Diese Nachricht wurde automatisch generiert. Bitte nicht antworten.)',
      malicious: true,
    },
  ],
  checks: [
    { id: 'revoke', label: 'Aktive Sitzungen widerrufen', points: 4, test: (w, ctx) => sinceStart(findCloudUser(w, 'e.vogel')?.sessionsRevokedAt, ctx), hint: 'Sonst bleibt der Angreifer trotz neuem Kennwort angemeldet.' },
    { id: 'pwd', label: 'Kennwort zurückgesetzt', points: 4, test: (w, ctx) => isAfter(findUser(w, 'e.vogel')?.pwdLastSet, ctx.vars.pwdBefore) },
    { id: 'block', label: 'Absender-Domain gesperrt', points: 3, test: (w) => w.cloud.blockedSenders.some((b) => b.toLowerCase().includes('secure-verify.example')), hint: 'Mail-Sicherheit → Gesperrte Absender.' },
    { id: 'risk', label: 'Riskanten Benutzer als "behoben" markiert', points: 3, test: (w) => findCloudUser(w, 'e.vogel')?.riskState === 'behoben' },
  ],
  penalties: [{ id: 'visit', label: 'Phishing-Link selbst im Browser geöffnet', points: 5, test: (w, ctx) => logged(w, ctx, A.browserVisit, (a) => `${a.target ?? ''} ${a.detail ?? ''}`.includes('secure-verify')) }],
  workNoteKeywords: [
    { label: 'Phishing erkannt', any: ['phishing', 'secure-verify', 'gefälscht'] },
    { label: 'Sitzungen widerrufen / Kennwort', any: ['sitzung', 'widerrufen', 'kennwort'] },
    { label: 'Absender gesperrt', any: ['gesperrt', 'blockiert', 'absender', 'domain'] },
  ],
  caller: {
    intro: 'Hallo, Erik Vogel hier – es geht um die komische Mail von heute Morgen.',
    mood: 'verunsichert',
    facts: [
      { keywords: ['eingegeben', 'zugangsdaten', 'angemeldet', 'kennwort eingegeben'], answer: 'Ja, ich habe meine Mail-Adresse und mein Kennwort eingegeben. Danach kam eine Abfrage für die Authenticator-App, die habe ich auch bestätigt.' },
      { keywords: ['wann', 'uhrzeit'], answer: 'Das war vor gut einer Stunde, so gegen Viertel nach acht.' },
      { keywords: ['link', 'url', 'adresszeile', 'seite'], answer: 'Die Seite sah aus wie unsere normale Anmeldung, nur die Adresse war irgendwas mit "secure-verify". Das habe ich erst hinterher gesehen.' },
      { keywords: ['kollege', 'andere', 'weitere'], answer: 'Mein Kollege Patrick hat die gleiche Mail bekommen, aber nicht draufgeklickt.' },
      { keywords: ['anhang', 'datei', 'heruntergeladen', 'download'], answer: 'Nein, heruntergeladen habe ich nichts, es war nur der Link.' },
    ],
    fallback: ['Ich habe nur den Link angeklickt und mich angemeldet, mehr nicht.', 'Das weiß ich leider nicht.'],
    resolvedReply: 'Okay, mit dem neuen Kennwort bin ich wieder drin und ändere es gleich. So eine Mail melde ich ab jetzt sofort, versprochen!',
    unresolvedReply: 'Ist jetzt alles sicher? Ich habe noch ein ungutes Gefühl.',
    persona: 'Erik ist ehrlich und etwas zerknirscht. Er sitzt im Büro im 1. OG und ist telefonisch unter seiner Durchwahl erreichbar.',
  },
  hints: [
    'Cloud Admin Center → Erik Vogel → Anmeldeprotokolle: Gibt es erfolgreiche Anmeldungen von fremden Orten?',
    'Sofortmaßnahmen: alle Sitzungen widerrufen und das Kennwort zurücksetzen. Das neue Kennwort nur telefonisch nach Identitätsprüfung mitteilen – nicht per Mail!',
    'Danach die Absender-Domain "secure-verify.example" sperren und den riskanten Benutzer als behoben markieren. Den Link selbst niemals öffnen!',
  ],
  solution: [
    'Ticket übernehmen, Kategorie "Sicherheit", P2 (Konto kompromittiert).',
    'Anmeldeprotokolle prüfen: erfolgreiche Anmeldungen aus Amsterdam (Hosting-Anbieter) kurz nach dem Klick.',
    'Alle Sitzungen widerrufen, Kennwort zurücksetzen (muss ändern). Benutzer anrufen, Identität prüfen, Kennwort telefonisch mitteilen.',
    'Absender-Domain secure-verify.example sperren (ggf. weitere Empfänger informieren), riskanten Benutzer als behoben markieren.',
    'Benutzer sensibilisieren, Vorgang dokumentieren, Informationssicherheit informieren, schließen.',
  ],
  kb: ['KB0023', 'KB0003', 'KB0002'],
}

// ───────────────────────── hosts-Datei manipuliert ─────────────────────────

const FAKE_IP = '203.0.113.66'
const INSTALLER = 'QS-Messwerte-Viewer_Setup.exe'

export const hostsManipuliert: Scenario = {
  id: 'hosts-datei-manipuliert',
  title: 'Intranet sieht "komisch" aus',
  summary: 'Eine unerwünschte Software hat die hosts-Datei manipuliert. Ursache mit nslookup/ping eingrenzen, hosts bereinigen, DNS-Cache leeren, Installer entfernen.',
  difficulty: 3,
  category: 'Sicherheit',
  skills: ['Chat', 'Remote-Desktop', 'hosts-Datei', 'nslookup', 'DNS-Cache', 'Ereignisanzeige'],
  requester: 'a.demir',
  channel: 'Chat',
  ticket: { title: 'Intranet fragt nach Kennwort', description: 'Benutzerin meldet per Chat: Das Intranet sieht anders aus und fragt nach dem Kennwort.' },
  expected: { priority: ['P2 – Hoch', 'P3 – Mittel'], category: ['Sicherheit', 'Netzwerk'], resolutionCodes: ['Gelöst (dauerhaft)', 'Weitergeleitet / eskaliert'] },
  setup: (w, ctx) => {
    const host = pcOf(w, 'a.demir')
    ctx.vars.computer = host
    const ep = setupEndpoint(w, host)
    if (!ep) return
    writeFile(ep, HOSTS_PATH, `${DEFAULT_HOSTS}\n# QS Viewer Update Service – nicht entfernen\n${FAKE_IP}    intranet.musterwerk.local intranet\n${FAKE_IP}    login.cloudadmin.example\n`)
    ep.dnsCache['intranet.musterwerk.local'] = FAKE_IP
    ep.dnsCache['login.cloudadmin.example'] = FAKE_IP
    const dl = `C:\\Users\\${ep.loggedOnUser ?? 'a.demir'}\\Downloads`
    putFile(ep, dl, INSTALLER, 3.4)
    ctx.vars.installer = `${dl}\\${INSTALLER}`
    ep.installedApps.push({ name: 'QS Messwerte Viewer 2.3', publisher: 'Unbekannt', version: '2.3.0', installed: new Date().toLocaleDateString('de-DE'), sizeMb: 18 })
    addEvent(ep, { log: 'Anwendung', eventId: 1116, level: 'Warnung', source: 'Microsoft-Windows-Windows Defender', message: `Microsoft Defender Antivirus hat potenziell unerwünschte Software erkannt.\n\nName: PUA:Win32/HostsHijack.B\nPfad: ${ctx.vars.installer}\nAktion: Zulassen (durch Benutzer)`, time: daysAgo(1) })
    addEvent(ep, { log: 'Anwendung', eventId: 1033, level: 'Informationen', source: 'MsiInstaller', message: 'Windows Installer hat das Produkt installiert. Produktname: QS Messwerte Viewer 2.3. Hersteller: Unbekannt.', time: daysAgo(0.99) })
  },
  checks: [
    { id: 'intranet', label: 'Intranet zeigt wieder die echte Seite', points: 5, test: (w, ctx) => { const ep = epOf(w, ctx); return !!ep && connectivity(w, ep).intranet }, hint: 'hosts-Datei und DNS-Cache (ipconfig /flushdns) beachten.' },
    { id: 'login', label: 'Cloud-Anmeldeseite wird nicht mehr umgeleitet', points: 4, test: (w, ctx) => { const ep = epOf(w, ctx); if (!ep) return false; const r = httpRequest(w, ep, 'https://login.cloudadmin.example'); return r.ok && !r.spoofed } },
    { id: 'hosts', label: 'hosts-Datei bereinigt', points: 3, test: (w, ctx) => { const ep = epOf(w, ctx); return !!ep && !Object.values(readHosts(ep)).includes(FAKE_IP) } },
    { id: 'installer', label: 'Verdächtigen Installer entfernt', points: 2, test: (w, ctx) => { const ep = epOf(w, ctx); return !!ep && !resolveFs(ep, ctx.vars.installer ?? '') } },
  ],
  penalties: [{ id: 'hosts-gone', label: 'hosts-Datei komplett gelöscht statt bereinigt', points: 2, test: (w, ctx) => { const ep = epOf(w, ctx); return !!ep && readFile(ep, HOSTS_PATH) === undefined } }],
  workNoteKeywords: [
    { label: 'hosts-Datei', any: ['hosts'] },
    { label: 'DNS-Cache geleert', any: ['flushdns', 'cache'] },
    { label: 'Ursache: Installer/PUA', any: ['qs-messwerte', 'qs messwerte', 'installer', 'pua', 'defender', 'schadsoftware'] },
  ],
  caller: {
    intro: 'Hallo! Ayşe Demir aus der QS. Das Intranet sieht bei mir seit gestern komisch aus – andere Farben, und es will, dass ich mich mit meinem Kennwort anmelde. Das musste ich doch sonst nie? Bei meinem Kollegen sieht es normal aus.',
    mood: 'verunsichert',
    facts: [
      { keywords: ['eingegeben', 'kennwort', 'passwort', 'angemeldet'], answer: 'Nein, ich habe nichts eingegeben, das kam mir komisch vor. Deshalb melde ich mich ja.' },
      { keywords: ['installiert', 'programm', 'software', 'heruntergeladen', 'download'], answer: 'Gestern habe ich den "QS Messwerte Viewer" installiert – den hat ein Lieferant empfohlen, die Datei war auf seiner Webseite. Da kam eine Virenwarnung, die habe ich weggeklickt, weil ich das Programm dringend brauchte.' },
      { keywords: ['cloud', 'outlook', 'office', 'login', 'anmeldeseite'], answer: 'Jetzt wo Sie es sagen: Die Office-Anmeldeseite sah heute früh auch anders aus. Da habe ich aber auch nichts eingegeben.' },
      { keywords: ['adresse', 'url', 'zertifikat', 'schloss'], answer: 'Oben in der Adresszeile steht ganz normal intranet.musterwerk.local.' },
      { keywords: ['warnung', 'virus', 'defender'], answer: 'Da stand irgendwas mit "potenziell unerwünschte App". Ich habe auf "Zulassen" geklickt.' },
    ],
    fallback: ['Es sieht einfach anders aus als sonst und will mein Kennwort.', 'Keine Ahnung, ich kenne mich da nicht aus.'],
    resolvedReply: 'Jetzt sieht das Intranet wieder ganz normal aus und fragt auch nicht mehr nach dem Kennwort. Danke! Software lade ich nicht mehr selbst runter, versprochen.',
    unresolvedReply: 'Nein, das Intranet sieht immer noch komisch aus.',
    persona: 'Ayşe ist aufmerksam und vorsichtig, hat aber eine Virenwarnung weggeklickt. Sie hat KEINE Zugangsdaten eingegeben.',
  },
  hints: [
    'Vergleiche "nslookup intranet" (fragt den DNS-Server) mit "ping intranet" (nutzt hosts-Datei und Cache). Welche IP-Adressen kommen heraus?',
    'C:\\Windows\\System32\\drivers\\etc\\hosts hat Vorrang vor DNS. Prüfe die Datei im Editor auf fremde Einträge.',
    'Fremde Einträge entfernen, danach "ipconfig /flushdns". Den verdächtigen Installer löschen und den Vorfall der Informationssicherheit melden.',
  ],
  solution: [
    'Chat beantworten, Ticket übernehmen, Kategorie "Sicherheit" (bzw. Netzwerk), P2 – mögliche Credential-Phishing-Umleitung.',
    'Klären: Wurden Zugangsdaten eingegeben? (Nein → kein Kennwort-Reset nötig.)',
    'Remote-Desktop: "nslookup intranet" liefert 10.10.0.40, "ping intranet" aber 203.0.113.66 → Hinweis auf hosts-Datei.',
    'Ereignisanzeige: Defender-Warnung zu QS-Messwerte-Viewer_Setup.exe (vom Benutzer zugelassen).',
    'hosts-Datei bereinigen (fremde Zeilen entfernen), "ipconfig /flushdns", Intranet und Cloud-Anmeldung testen.',
    'Installer löschen, Informationssicherheit informieren (Prüfung/Neuinstallation), dokumentieren.',
  ],
  kb: ['KB0011', 'KB0023', 'KB0010'],
}

// ───────────────────────── Anfrage Administratorrechte ─────────────────────────

export const adminrechteAnfrage: Scenario = {
  id: 'adminrechte-anfrage',
  title: '"Gib mir mal kurz Admin-Rechte"',
  summary: 'Ein Benutzer möchte lokale Administratorrechte, um Software zu installieren. Richtlinie kennen, freundlich ablehnen und die eigentliche Anforderung (Software) an den 2nd Level weitergeben.',
  difficulty: 1,
  category: 'Software',
  skills: ['Chat', 'Richtlinien', 'Kommunikation', 'Eskalation'],
  requester: 'k.fuchs',
  channel: 'Chat',
  ticket: { kind: 'Serviceanfrage', title: 'Admin-Rechte für Softwareinstallation', description: 'Benutzer bittet per Chat um lokale Administratorrechte.' },
  expected: { priority: ['P3 – Mittel', 'P4 – Niedrig'], category: 'Software', resolutionCodes: ['Weitergeleitet / eskaliert'] },
  setup: (w, ctx) => {
    const host = pcOf(w, 'k.fuchs')
    ctx.vars.computer = host
    const ep = setupEndpoint(w, host)
    if (!ep) return
    putFile(ep, `C:\\Users\\${ep.loggedOnUser ?? 'k.fuchs'}\\Downloads`, 'CNC-Viewer7_Setup.exe', 120)
    addEvent(ep, { log: 'Anwendung', eventId: 1015, level: 'Warnung', source: 'MsiInstaller', message: 'Die Installation von "CNC-Viewer 7" wurde abgebrochen: Für diesen Vorgang sind Administratorrechte erforderlich (Benutzerkontensteuerung).', time: minutesAgo(10) })
  },
  checks: [
    { id: 'no-admin', label: 'Keine Administratorrechte an den Benutzer vergeben', points: 4, test: (w) => !isMemberOf(w, 'k.fuchs', 'GG_Lokale_Admins') && !isMemberOf(w, 'k.fuchs', 'Domänen-Admins') },
    { id: 'escalated', label: 'Installation über den 2nd Level (Softwareverteilung) angestoßen', points: 8, test: (w, ctx) => escalatedTo(w, ctx, '2nd Level Support'), hint: 'Software wird von der IT paketiert/installiert – Ticket an den 2nd Level Support weiterleiten.' },
  ],
  penalties: [{ id: 'admin', label: 'Benutzer in eine Administratorgruppe aufgenommen', points: 15, test: (w) => isMemberOf(w, 'k.fuchs', 'GG_Lokale_Admins') || isMemberOf(w, 'k.fuchs', 'Domänen-Admins') || isMemberOf(w, 'k.fuchs', 'GG_IT') }],
  workNoteKeywords: [
    { label: 'Richtlinie / Ablehnung', any: ['richtlinie', 'keine admin', 'abgelehnt', 'nicht erlaubt', 'nicht zulässig'] },
    { label: 'Weiterleitung Softwareverteilung', any: ['2nd level', 'softwareverteilung', 'paket', 'weitergeleitet'] },
    { label: 'Software & Termin', any: ['cnc', 'viewer', '14 uhr', 'spätschicht'] },
  ],
  caller: {
    intro: 'Moin, Kevin aus der Fertigung (Halle 1). Kannst du mir mal schnell Admin-Rechte auf meinem PC geben? Ich muss den CNC-Viewer vom Maschinenhersteller installieren, sonst kann ich die neuen Programme für die Fräse nicht ansehen. Dauert nur 5 Minuten 😅',
    mood: 'ungeduldig',
    facts: [
      { keywords: ['wofür', 'wofuer', 'warum', 'zweck', 'brauchst du'], answer: 'Der Hersteller hat neue Bearbeitungsprogramme geschickt, die gehen nur mit dem CNC-Viewer 7 auf. Den Installer habe ich vom Kundenportal des Herstellers runtergeladen.' },
      { keywords: ['dringend', 'bis wann', 'schicht'], answer: 'Bis zur Spätschicht um 14 Uhr wäre super, dann läuft der neue Auftrag an.' },
      { keywords: ['vorgesetzt', 'chef', 'peters', 'genehmig', 'freigabe'], answer: 'Sven Peters, mein Schichtleiter, weiß Bescheid und braucht den Viewer auch. Eine Mail hat er aber nicht geschrieben.' },
      { keywords: ['version', 'schon installiert', 'meisterbüro', 'andere pc'], answer: 'Auf dem PC im Meisterbüro ist der Viewer in Version 6 drauf, den hat damals die IT installiert.' },
      { keywords: ['katalog', 'softwarekatalog', 'self-service', 'softwareportal'], answer: 'Ein Softwareportal? Da habe ich noch nie reingeschaut. Ist der Viewer da drin?' },
    ],
    fallback: ['Ist doch nur ein Programm, das macht doch nichts kaputt.', 'Weiß ich nicht – ich will nur den Viewer installieren.'],
    resolvedReply: 'Okay, verstehe – dann warte ich auf euren 2nd Level. Hauptsache bis zur Spätschicht. Danke für die Info!',
    unresolvedReply: 'Und, kriege ich die Rechte jetzt? Ich muss das echt heute noch installieren.',
    persona: 'Kevin ist locker, duzt, will schnell eine Lösung und versteht Richtlinien, wenn man sie kurz begründet.',
  },
  hints: [
    'Schau in die Willkommens-Mail von Oliver Keller: Admin-Rechte für Anwender werden nicht vergeben.',
    'Die eigentliche Anforderung ist die Software, nicht das Admin-Recht. Wie kommt Software regulär auf einen Firmen-PC?',
    'Freundlich ablehnen, kurz begründen und das Ticket mit allen Infos (Software, Version, Quelle, PC, Termin) an den 2nd Level Support zur Paketierung/Installation weiterleiten.',
  ],
  solution: [
    'Chat beantworten, Ticket übernehmen, Typ Serviceanfrage, Kategorie "Software", P3.',
    'Admin-Rechte gemäß Richtlinie ablehnen und kurz begründen (Schadsoftware, Lizenzen, Stabilität).',
    'Anforderung aufnehmen: CNC-Viewer 7, Quelle Herstellerportal, PC des Benutzers, benötigt bis 14 Uhr.',
    'Ticket an "2nd Level Support" (Softwareverteilung) weiterleiten; Benutzer über das weitere Vorgehen informieren.',
    'Mit "Weitergeleitet / eskaliert" abschließen.',
  ],
  kb: ['KB0025'],
}

export const SECURITY_SCENARIOS: Scenario[] = [socialEngineeringVorstand, postfachKompromittiert, phishingZugangsdaten, hostsManipuliert, adminrechteAnfrage]

