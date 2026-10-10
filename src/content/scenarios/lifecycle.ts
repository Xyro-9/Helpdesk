// Mitarbeiter-Lebenszyklus: Onboarding und Offboarding

import { directGroupsOf, findUser, isMemberOf } from '@/core/ops/ad'
import { findCloudUser } from '@/core/ops/cloud'
import { OU } from '@/core/seed/company'
import type { Scenario } from '@/core/scenarios/types'
import type { World } from '@/core/types'
import { ACTIVE_SHIPMENT, ensureStockNotebook, pcOf, sinceStart } from './kit'

// ───────────────────────── Onboarding ─────────────────────────

export const NEW_HIRE = {
  given: 'Finn',
  sur: 'Albrecht',
  sam: 'f.albrecht',
  employeeId: '41877',
  birthDate: '1996-07-21',
  title: 'Außendienstmitarbeiter',
  department: 'Vertrieb',
  manager: 'm.becker',
  street: 'Lindenstraße 12',
  postalCode: '25335',
  city: 'Elmshorn',
}

const REQUIRED_GROUPS = ['GG_Vertrieb', 'GG_VPN_Benutzer', 'GG_ERP_Benutzer', 'GG_Drucker_1OG_Farbe', 'GG_Alle_Mitarbeiter']
const ADMIN_GROUPS = ['Domänen-Admins', 'GG_Lokale_Admins', 'GG_IT', 'GG_IT_Helpdesk']

/** Entfernt Reste eines früheren Durchlaufs, damit das Szenario wiederholbar ist */
function purgeUser(w: World, sam: string) {
  if (!findUser(w, sam)) return
  w.users = w.users.filter((u) => u.sam !== sam)
  for (const g of w.groups) g.members = g.members.filter((m) => m !== sam)
  w.cloud.users = w.cloud.users.filter((c) => c.sam !== sam)
  for (const a of w.assets)
    if (a.assignedTo === sam) {
      a.assignedTo = undefined
      a.status = 'Lager'
    }
}

export const onboardingAussendienst: Scenario = {
  id: 'onboarding-aussendienst',
  title: 'Neuer Außendienstmitarbeiter',
  summary: 'Komplettes Onboarding nach HR-Antrag: Konto in der richtigen OU mit Attributen, Gruppen wie die Vorlage, Cloud-Sync und Lizenz, Notebook aus dem Lager zuweisen und ins Homeoffice versenden.',
  difficulty: 3,
  category: 'Onboarding/Offboarding',
  skills: ['Portal', 'Active Directory', 'Namenskonvention', 'Cloud-Sync', 'Lizenzen', 'Inventar', 'Versand'],
  requester: 'b.schmitt',
  channel: 'Portal',
  ticket: {
    kind: 'Serviceanfrage',
    title: 'Neueinstellung Finn Albrecht (Vertrieb) – IT-Ausstattung',
    description: 'Neueinstellung – bitte IT-Arbeitsplatz vorbereiten\n\nName: Finn Albrecht\nPersonalnummer: 41877\nGeburtsdatum: 21.07.1996\nAbteilung: Vertrieb\nPosition: Außendienstmitarbeiter\nVorgesetzter: Markus Becker\nEintritt: kommender Montag\nArbeitsort: Homeoffice (Außendienst Region Nord)\nPrivatanschrift (für den Versand der Hardware): Lindenstraße 12, 25335 Elmshorn\n\nBenötigt: Benutzerkonto, E-Mail, Notebook, VPN – bitte Berechtigungen wie bei Nina Krause (gleiche Tätigkeit).\n\nBirgit Schmitt\nPersonalleitung',
  },
  expected: { priority: ['P3 – Mittel', 'P4 – Niedrig'], category: 'Onboarding/Offboarding', resolutionCodes: ['Anfrage erfüllt'] },
  setup: (w, ctx) => {
    purgeUser(w, NEW_HIRE.sam)
    ensureStockNotebook(w)
    ctx.vars.sam = NEW_HIRE.sam
    ctx.vars.template = 'n.krause'
  },
  extraMails: () => [
    {
      fromSam: 'm.becker',
      subject: 'Neuer Kollege Finn Albrecht – Rechte wie Nina Krause',
      body: 'Hallo IT,\n\nam Montag startet Finn Albrecht bei uns im Außendienst. Bitte richtet alles so ein wie bei Nina Krause (gleiche Tätigkeit, gleiche Laufwerke, VPN). Das Notebook bitte direkt zu ihm nach Hause schicken – er startet im Homeoffice, ich mache die Einarbeitung per Video.\n\nDanke!\nMarkus Becker\nVertriebsleiter',
    },
  ],
  checks: [
    { id: 'account', label: 'Konto f.albrecht (Namenskonvention) in OU Vertrieb mit Abteilung, Vorgesetztem und Personalnummer', points: 5, test: (w) => { const u = findUser(w, NEW_HIRE.sam); return !!u && u.ou === OU.dept('Vertrieb') && u.department === 'Vertrieb' && u.manager === 'm.becker' && u.employeeId === NEW_HIRE.employeeId }, hint: 'Anmeldename nach Konvention v.nachname; Attribute aus dem HR-Antrag übernehmen.' },
    { id: 'groups', label: 'Gruppen wie Vorlage Nina Krause (Vertrieb, VPN, ERP, Drucker, Alle Mitarbeiter)', points: 4, test: (w) => !!findUser(w, NEW_HIRE.sam) && REQUIRED_GROUPS.every((g) => isMemberOf(w, NEW_HIRE.sam, g)), hint: 'AD-Konsole: "Kopieren" bzw. Gruppen von n.krause übernehmen.' },
    { id: 'cloud', label: 'Cloud-Konto synchronisiert und Office-Lizenz zugewiesen', points: 4, test: (w) => !!findCloudUser(w, NEW_HIRE.sam)?.licenses.some((l) => l === 'CO_STANDARD' || l === 'CO_PREMIUM'), hint: 'Synchronisierung auslösen (Infrastruktur oder Start-ADSyncSyncCycle), dann Lizenz zuweisen.' },
    { id: 'hardware', label: 'Notebook zugewiesen und Versand an die Privatadresse beauftragt', points: 4, test: (w) => { const nb = w.assets.filter((a) => a.type === 'Notebook' && a.assignedTo === NEW_HIRE.sam && a.status !== 'Lager').map((a) => a.tag); return w.shipments.some((s) => s.direction === 'Ausgehend' && (s.recipientSam === NEW_HIRE.sam || s.recipientName.includes(NEW_HIRE.sur)) && ACTIVE_SHIPMENT(s.status) && s.address.postalCode.trim() === NEW_HIRE.postalCode && s.items.some((i) => nb.includes(i))) }, hint: 'Inventar: Lager-Notebook zuweisen; Versand: Sendung an Lindenstraße 12, 25335 Elmshorn.' },
  ],
  penalties: [
    { id: 'admin', label: 'Neuen Benutzer in eine Admin-/IT-Gruppe aufgenommen', points: 15, test: (w) => !!findUser(w, NEW_HIRE.sam) && ADMIN_GROUPS.some((g) => isMemberOf(w, NEW_HIRE.sam, g)) },
    { id: 'never', label: '"Kennwort läuft nie ab" gesetzt', points: 3, test: (w) => !!findUser(w, NEW_HIRE.sam)?.passwordNeverExpires },
    { id: 'mustchange', label: 'Initialkennwort ohne "muss bei der nächsten Anmeldung ändern"', points: 3, test: (w) => { const u = findUser(w, NEW_HIRE.sam); return !!u && !u.mustChangePassword } },
  ],
  workNoteKeywords: [
    { label: 'Konto angelegt', any: ['f.albrecht', 'konto angelegt', 'benutzer angelegt', 'angelegt'] },
    { label: 'Vorlage/Gruppen', any: ['krause', 'vorlage', 'kopiert', 'gruppen'] },
    { label: 'Cloud-Sync & Lizenz', any: ['lizenz', 'synchron', 'sync'] },
    { label: 'Hardware & Versand', any: ['notebook', 'versand', 'sendung', 'mw-nb'] },
  ],
  caller: {
    intro: 'Hallo, Birgit Schmitt aus der Personalabteilung – es geht um den neuen Kollegen Finn Albrecht.',
    mood: 'freundlich',
    facts: [
      { keywords: ['eintritt', 'start', 'beginn', 'montag'], answer: 'Herr Albrecht fängt am Montag an. Das Notebook sollte also spätestens Freitag bei ihm sein.' },
      { keywords: ['adresse', 'anschrift', 'versand', 'schicken'], answer: 'Die Privatanschrift steht im Antrag: Lindenstraße 12, 25335 Elmshorn.' },
      { keywords: ['kennwort', 'passwort', 'zugangsdaten'], answer: 'Die Zugangsdaten bitte nicht an mich – rufen Sie Herrn Albrecht am Montag früh an, die Nummer bekommen Sie von Herrn Becker.' },
      { keywords: ['handy', 'smartphone', 'diensthandy'], answer: 'Ein Diensthandy ist für ihn nicht vorgesehen, nur das Notebook.' },
      { keywords: ['vorlage', 'rechte', 'berechtigungen', 'krause'], answer: 'Genau, er macht den gleichen Job wie Frau Krause im Außendienst – also bitte die gleichen Rechte.' },
    ],
    fallback: ['Alle Angaben stehen im Antrag.', 'Das müssten Sie Herrn Becker fragen.'],
    resolvedReply: 'Prima, dann ist für Montag alles vorbereitet. Vielen Dank!',
    unresolvedReply: 'Ist denn schon alles fertig? Herr Becker hat gefragt, ob das Notebook schon unterwegs ist.',
    persona: 'Birgit leitet die Personalabteilung, ist strukturiert und gibt Zugangsdaten bewusst nicht weiter.',
  },
  hints: [
    'Halte dich an die Onboarding-Checkliste (KB): Konto in der richtigen OU, Attribute aus dem HR-Antrag, Gruppen wie die Vorlage Nina Krause.',
    'Neue Konten erscheinen erst nach der Synchronisierung im Cloud Admin Center. Danach Lizenz zuweisen – achte auf freie Lizenzen (Standard reicht).',
    'Inventar: freies Notebook aus dem Lager Finn Albrecht zuweisen, dann unter Versand eine Sendung an Lindenstraße 12, 25335 Elmshorn anlegen.',
  ],
  solution: [
    'Ticket übernehmen, Typ Serviceanfrage, Kategorie Onboarding/Offboarding, P3.',
    'AD: Benutzer f.albrecht in OU Benutzer/Vertrieb anlegen (bzw. n.krause kopieren): Name, Personalnummer 41877, Abteilung Vertrieb, Position, Vorgesetzter m.becker, Privatanschrift, Homeoffice. Initialkennwort mit "muss ändern".',
    'Gruppen wie n.krause: GG_Vertrieb, GG_VPN_Benutzer, GG_ERP_Benutzer, GG_Drucker_1OG_Farbe, GG_Alle_Mitarbeiter u. a. – keine Admin-Gruppen.',
    'Cloud-Synchronisierung auslösen, Lizenz zuweisen (Premium ist ausgeschöpft → Cloud Office Standard oder Bestellung anstoßen).',
    'Inventar: Lager-Notebook f.albrecht zuweisen; Versand: Sendung an Lindenstraße 12, 25335 Elmshorn beauftragen.',
    'Zugangsdaten am Starttag telefonisch an Herrn Albrecht (nicht an HR). Dokumentieren, "Anfrage erfüllt".',
  ],
  kb: ['KB0008', 'KB0006', 'KB0026'],
}

// ───────────────────────── Offboarding ─────────────────────────

const LEAVER = 'a.koehler'

export const offboardingMarketing: Scenario = {
  id: 'offboarding-marketing',
  title: 'Austritt einer Mitarbeiterin',
  summary: 'Offboarding nach Checkliste: Konto deaktivieren und verschieben, Gruppen entfernen, Cloud-Zugang sperren, Postfach an die Vorgesetzte übergeben, Lizenz freigeben, Notebook-Rücksendung beauftragen.',
  difficulty: 3,
  category: 'Onboarding/Offboarding',
  skills: ['Portal', 'Active Directory', 'Cloud Admin Center', 'Freigegebene Postfächer', 'Lizenzen', 'Versand'],
  requester: 's.meier',
  channel: 'Portal',
  ticket: {
    kind: 'Serviceanfrage',
    title: 'Austritt Anna Köhler (Marketing) – heute letzter Arbeitstag',
    description: 'Hallo IT,\n\nFrau Anna Köhler (Social Media) verlässt uns heute auf eigenen Wunsch. Bitte wie üblich:\n- alle Zugänge sperren\n- ihr Postfach möchte ich weiter einsehen können (Agenturen und Kunden schreiben noch an sie)\n- das Firmen-Notebook schickt sie aus dem Homeoffice zurück – bitte die Rücksendung organisieren\n\nDie Bestätigung der Personalabteilung kommt per Mail.\n\nDanke, Sophie Meier\nLeitung Marketing',
  },
  expected: { priority: ['P3 – Mittel', 'P2 – Hoch'], category: 'Onboarding/Offboarding', resolutionCodes: ['Anfrage erfüllt'] },
  setup: (w, ctx) => {
    ctx.vars.sam = LEAVER
    const host = pcOf(w, LEAVER)
    ctx.vars.computer = host
    ctx.vars.assetTag = w.assets.find((a) => a.type === 'Notebook' && (a.hostname === host || a.assignedTo === LEAVER))?.tag ?? ''
    const cu = findCloudUser(w, LEAVER)
    if (cu) cu.sessionsRevokedAt = undefined
  },
  extraMails: (w) => {
    const u = findUser(w, LEAVER)
    return [
      {
        fromSam: 'b.schmitt',
        subject: 'Austritt Anna Köhler zum heutigen Tag – Bestätigung HR',
        body: `Hallo IT,\n\nhiermit bestätigen wir den Austritt von Frau Anna Köhler (Personalnummer ${u?.employeeId ?? '–'}) zum heutigen Tag.\n\nBitte gemäß Offboarding-Prozess:\n- Konto deaktivieren (nicht löschen – Aufbewahrungsfrist 90 Tage)\n- Postfach als freigegebenes Postfach an Frau Sophie Meier übergeben\n- Hardware (Notebook) per Rücksendung einziehen – Frau Köhler ist ab morgen nicht mehr erreichbar, Abholung bitte an ihrer Privatadresse.\n\nViele Grüße\nBirgit Schmitt\nPersonalleitung`,
      },
    ]
  },
  checks: [
    { id: 'disabled', label: 'AD-Konto deaktiviert und in die OU "Deaktiviert" verschoben', points: 4, test: (w) => { const u = findUser(w, LEAVER); return !!u && !u.enabled && u.ou === OU.disabled } },
    { id: 'groups', label: 'Gruppenmitgliedschaften entfernt (nur noch Domänen-Benutzer)', points: 3, test: (w) => !!findUser(w, LEAVER) && directGroupsOf(w, LEAVER).every((g) => g === 'Domänen-Benutzer') },
    { id: 'cloud', label: 'Cloud-Anmeldung blockiert und Sitzungen widerrufen', points: 3, test: (w, ctx) => { const cu = findCloudUser(w, LEAVER); return !!cu && cu.signInBlocked && sinceStart(cu.sessionsRevokedAt, ctx) }, hint: 'Ohne Widerruf bleiben bestehende Sitzungen (z. B. auf dem Handy) gültig.' },
    { id: 'mailbox', label: 'Postfach freigegeben (Shared), Vollzugriff für Sophie Meier, Lizenz entfernt', points: 4, test: (w) => { const cu = findCloudUser(w, LEAVER); const meier = findCloudUser(w, 's.meier')?.upn.toLowerCase() ?? ''; return !!cu?.mailbox && cu.mailbox.type === 'Freigegeben' && cu.mailbox.fullAccess.some((x) => x.toLowerCase() === meier) && cu.licenses.length === 0 }, hint: 'Erst umwandeln und berechtigen, dann die Lizenz entfernen.' },
    { id: 'return', label: 'Rücksendung des Notebooks beauftragt', points: 3, test: (w, ctx) => !!ctx.vars.assetTag && w.shipments.some((s) => s.direction === 'Rücksendung' && ACTIVE_SHIPMENT(s.status) && s.items.includes(ctx.vars.assetTag)) },
  ],
  penalties: [{ id: 'deleted', label: 'Konto gelöscht statt deaktiviert (Aufbewahrungsfrist!)', points: 15, test: (w) => !findUser(w, LEAVER) }],
  workNoteKeywords: [
    { label: 'Konto deaktiviert/verschoben', any: ['deaktiviert', 'deaktivieren', 'ou deaktiviert'] },
    { label: 'Gruppen entfernt', any: ['gruppen', 'mitgliedschaften'] },
    { label: 'Postfach übergeben', any: ['freigegebenes postfach', 'shared', 'vollzugriff', 'meier'] },
    { label: 'Rücksendung', any: ['rücksendung', 'ruecksendung', 'notebook', 'mw-nb'] },
  ],
  caller: {
    intro: 'Hallo, Sophie Meier aus dem Marketing – es geht um den Austritt von Frau Köhler.',
    mood: 'freundlich',
    facts: [
      { keywords: ['postfach', 'mails', 'e-mails'], answer: 'Ich möchte die Mails von Frau Köhler weiter lesen und ggf. beantworten können – Agenturen schreiben noch eine Weile an ihre Adresse.' },
      { keywords: ['abwesenheit', 'automatische antwort'], answer: 'Eine Abwesenheitsnotiz mit Verweis auf mich wäre nett, ist aber kein Muss.' },
      { keywords: ['notebook', 'hardware', 'rücksendung', 'ruecksendung', 'paket', 'abholung'], answer: 'Frau Köhler wohnt in Pinneberg. Sie packt das Notebook samt Netzteil ein, wenn der Paketdienst kommt.' },
      { keywords: ['daten', 'dateien', 'onedrive', 'cloud-speicher'], answer: 'Ihre Projektdateien hat sie schon auf das Marketing-Laufwerk gelegt.' },
      { keywords: ['wann', 'uhrzeit', 'feierabend', 'ab wann'], answer: 'Heute ist ihr letzter Tag, die Übergabe ist schon erledigt – Sie können die Zugänge sofort sperren.' },
    ],
    fallback: ['Das steht alles im Antrag bzw. in der Mail der Personalabteilung.', 'Da kenne ich mich technisch nicht aus.'],
    resolvedReply: 'Super, das Postfach von Frau Köhler sehe ich in meinem Outlook. Danke für die schnelle Umsetzung!',
    unresolvedReply: 'Ich sehe das Postfach von Frau Köhler noch nicht in meinem Outlook.',
    persona: 'Sophie ist Marketingleiterin, freundlich und klar in ihren Anforderungen.',
  },
  hints: [
    'Halte dich an die Offboarding-Checkliste (KB): deaktivieren – nicht löschen –, in OU "Deaktiviert" verschieben, Gruppen entfernen.',
    'Cloud Admin Center: Anmeldung blockieren, Sitzungen widerrufen, Postfach in ein freigegebenes Postfach umwandeln, Vollzugriff für Sophie Meier, danach Lizenz entfernen.',
    'Unter Versand eine Rücksendung (Abholung in Pinneberg) für das Notebook von Anna Köhler anlegen.',
  ],
  solution: [
    'Ticket übernehmen, HR-Bestätigung prüfen, Typ Serviceanfrage, Kategorie Onboarding/Offboarding, P3.',
    'AD: a.koehler deaktivieren, Beschreibung "Ausgeschieden …", in OU "Deaktiviert" verschieben, alle Gruppen außer Domänen-Benutzer entfernen.',
    'Cloud: Anmeldung blockieren, Sitzungen widerrufen.',
    'Postfach in freigegebenes Postfach umwandeln, Vollzugriff (ggf. Senden als) für s.meier, optional Abwesenheitsnotiz; danach Lizenz entfernen.',
    'Versand: Rücksendung des Notebooks (Abholung Pinneberg) anlegen; Asset-Status nachhalten.',
    'Alles dokumentieren, mit "Anfrage erfüllt" schließen.',
  ],
  kb: ['KB0009', 'KB0007', 'KB0026'],
}

export const LIFECYCLE_SCENARIOS: Scenario[] = [onboardingAussendienst, offboardingMarketing]
