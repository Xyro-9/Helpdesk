// Cloud-/E-Mail-Szenarien: fehlende Lizenz, Zugriff auf Team-Postfach

import { findCloudUser } from '@/core/ops/cloud'
import { addEvent } from '@/core/ops/endpoint'
import type { Scenario } from '@/core/scenarios/types'
import type { World } from '@/core/types'
import { epOf, minutesAgo, pcOf, setupEndpoint } from './kit'

const OFFICE_SKUS = ['CO_STANDARD', 'CO_PREMIUM']

// ───────────────────────── Lizenz fehlt ─────────────────────────

export const lizenzFehlt: Scenario = {
  id: 'lizenz-fehlt-outlook',
  title: 'Outlook: "Produkt nicht lizenziert"',
  summary: 'Bei einer Lizenzbereinigung wurde einem aktiven Mitarbeiter versehentlich die Office-Lizenz entzogen. Lizenz im Cloud Admin Center wieder zuweisen.',
  difficulty: 1,
  category: 'E-Mail & Cloud',
  skills: ['Chat', 'Cloud Admin Center', 'Lizenzen'],
  requester: 'd.krueger',
  channel: 'Chat',
  ticket: { title: 'Outlook nicht lizenziert', description: 'Benutzer meldet per Chat: Outlook zeigt "Produkt nicht lizenziert".' },
  expected: { priority: ['P3 – Mittel', 'P2 – Hoch'], category: 'E-Mail & Cloud', resolutionCodes: ['Gelöst (dauerhaft)'] },
  setup: (w, ctx) => {
    const cu = findCloudUser(w, 'd.krueger')
    if (!cu) return
    ctx.vars.oldSku = cu.licenses[0] ?? 'CO_STANDARD'
    cu.licenses = []
    const host = pcOf(w, 'd.krueger')
    ctx.vars.computer = host
    const ep = setupEndpoint(w, host)
    if (!ep) return
    ep.outlook.lastError = 'Produkt nicht lizenziert – Ihr Konto verfügt über keine gültige Lizenz für Cloud Office. Outlook wird im eingeschränkten Modus ausgeführt.'
    addEvent(ep, { log: 'Anwendung', eventId: 2011, level: 'Fehler', source: 'Office Licensing', message: 'Lizenzprüfung fehlgeschlagen: Für den Benutzer d.krueger@musterwerk.example ist keine Cloud-Office-Lizenz zugewiesen.', time: minutesAgo(45) })
  },
  tick: (w, ctx) => {
    const cu = findCloudUser(w, 'd.krueger')
    const ep = setupEndpoint(w, ctx.vars.computer)
    if (!cu || !ep || !ep.outlook.lastError || !cu.licenses.some((l) => OFFICE_SKUS.includes(l))) return
    ep.outlook.lastError = undefined
    addEvent(ep, { log: 'Anwendung', eventId: 2000, level: 'Informationen', source: 'Office Licensing', message: 'Cloud-Office-Lizenz erfolgreich aktiviert.' })
  },
  checks: [
    { id: 'license', label: 'Cloud-Office-Lizenz zugewiesen', points: 8, test: (w) => !!findCloudUser(w, 'd.krueger')?.licenses.some((l) => OFFICE_SKUS.includes(l)), hint: 'Cloud Admin Center → Benutzer → Lizenzen.' },
    { id: 'outlook', label: 'Outlook meldet keinen Lizenzfehler mehr', points: 4, test: (w, ctx) => { const ep = epOf(w, ctx); return !!ep && !ep.outlook.lastError } },
  ],
  workNoteKeywords: [
    { label: 'Ursache: Lizenz fehlte', any: ['lizenz'] },
    { label: 'Zugewiesene Lizenz', any: ['cloud office standard', 'co_standard', 'standard', 'premium'] },
    { label: 'Hintergrund (Bereinigung)', any: ['bereinigung', 'versehentlich', 'seidel', 'aufgeräumt'] },
  ],
  caller: {
    intro: 'Hi! Daniel Krüger aus dem Recruiting. Mein Outlook zeigt oben einen roten Balken "Produkt nicht lizenziert" und ich kann keine Mails mehr senden. Teams im Browser geht noch. Was ist da los?',
    mood: 'freundlich',
    facts: [
      { keywords: ['seit wann', 'wann', 'gestern'], answer: 'Seit heute Morgen. Gestern Nachmittag ging noch alles.' },
      { keywords: ['geändert', 'installiert', 'update', 'gemacht'], answer: 'Ich habe nichts gemacht. Ich habe nur eine Rundmail gesehen, dass die IT "Lizenzen von ausgeschiedenen Kollegen aufräumt".' },
      { keywords: ['meldung', 'balken', 'fehler'], answer: '"Produkt nicht lizenziert – Ihr Konto verfügt über keine gültige Lizenz für Cloud Office."' },
      { keywords: ['kollegen', 'andere', 'laura', 'birgit'], answer: 'Bei Laura und Birgit funktioniert Outlook ganz normal.' },
    ],
    fallback: ['Outlook zeigt nur diesen roten Balken.', 'Keine Ahnung, ich bin Recruiter 😄'],
    resolvedReply: 'Der rote Balken ist weg und die Mails gehen raus. Danke dir!',
    unresolvedReply: 'Nein, Outlook zeigt immer noch "Produkt nicht lizenziert".',
    persona: 'Daniel ist locker und freundlich, duzt gern und hat Bewerbungsgespräche zu organisieren.',
  },
  hints: [
    'Cloud Admin Center → Benutzer → Daniel Krüger → Lizenzen: Welche Lizenz ist zugewiesen?',
    'Kollegen in der Personalabteilung haben "Cloud Office Standard". Ist davon noch eine frei?',
    'Lizenz "Cloud Office Standard" zuweisen. Prüfe dabei, ob ausgeschiedene Mitarbeiter (z. B. Uwe Seidel) noch Lizenzen belegen.',
  ],
  solution: [
    'Chat beantworten, Ticket übernehmen, Kategorie E-Mail & Cloud, P3.',
    'Cloud Admin Center: Daniel Krüger hat keine Lizenz mehr (bei der Bereinigung versehentlich entfernt).',
    'Lizenz "Cloud Office Standard" zuweisen; Outlook neu starten lassen.',
    'Bonus: Lizenz des ausgeschiedenen u.seidel freigeben und die Bereinigung an die Verantwortlichen zurückmelden.',
    'Bestätigen lassen, dokumentieren, schließen.',
  ],
  kb: ['KB0006'],
}

// ───────────────────────── Zugriff auf Team-Postfach ─────────────────────────

const TEAM = 'einkauf@musterwerk.example'
const has = (list: string[] | undefined, upn: string) => !!list?.some((x) => x.toLowerCase() === upn)
const upnOf = (w: World, sam: string) => findCloudUser(w, sam)?.upn.toLowerCase() ?? `${sam}@musterwerk.example`

export const teampostfachZugriff: Scenario = {
  id: 'teampostfach-zugriff',
  title: 'Zugriff auf das Team-Postfach Einkauf',
  summary: 'Serviceanfrage mit Freigabe: Vollzugriff und "Senden als" auf ein freigegebenes Postfach vergeben – und nicht mehr.',
  difficulty: 2,
  category: 'E-Mail & Cloud',
  skills: ['E-Mail', 'Freigabeprozess', 'Cloud Admin Center', 'Postfachberechtigungen'],
  requester: 's.schwarz',
  channel: 'E-Mail',
  ticket: {
    kind: 'Serviceanfrage',
    title: 'Zugriff Team-Postfach Einkauf',
    description: 'Hallo IT,\n\nab nächster Woche vertrete ich Frau Neumann im Team-Postfach des Einkaufs (einkauf@musterwerk.example). Ich muss die Mails dort lesen, und die Antworten müssen als "Einkauf" rausgehen – nicht mit meinem Namen. Die Lieferanten sollen immer an das Team-Postfach antworten.\n\nHerr Wolf ist informiert und schickt Ihnen die Freigabe.\n\nDanke und Gruß\nStefan Schwarz\nEinkauf',
  },
  expected: { priority: ['P4 – Niedrig', 'P3 – Mittel'], category: 'E-Mail & Cloud', resolutionCodes: ['Anfrage erfüllt'] },
  setup: (w, ctx) => {
    ctx.vars.mailbox = TEAM
    const mb = findCloudUser(w, TEAM)?.mailbox
    const me = upnOf(w, 's.schwarz')
    if (mb) {
      mb.fullAccess = mb.fullAccess.filter((x) => x.toLowerCase() !== me)
      mb.sendAs = mb.sendAs.filter((x) => x.toLowerCase() !== me)
    }
  },
  extraMails: () => [
    {
      fromSam: 'a.wolf',
      subject: 'Freigabe: Team-Postfach Einkauf für Stefan Schwarz',
      body: 'Hallo IT-Team,\n\nich gebe hiermit den Zugriff auf das Team-Postfach einkauf@musterwerk.example für Herrn Stefan Schwarz frei (Lesen und Senden als "Einkauf"). Hintergrund: Vertretung von Frau Neumann ab Montag, unbefristet.\n\nAuf mein persönliches Postfach braucht er keinen Zugriff.\n\nGruß\nAndreas Wolf\nLeiter Einkauf',
    },
  ],
  checks: [
    { id: 'full', label: 'Vollzugriff auf einkauf@ für Stefan Schwarz', points: 5, test: (w) => has(findCloudUser(w, TEAM)?.mailbox?.fullAccess, upnOf(w, 's.schwarz')), hint: 'Postfachberechtigungen → Vollzugriff.' },
    { id: 'sendas', label: '"Senden als" auf einkauf@ für Stefan Schwarz', points: 5, test: (w) => has(findCloudUser(w, TEAM)?.mailbox?.sendAs, upnOf(w, 's.schwarz')), hint: '"Senden im Auftrag" würde den Namen des Mitarbeiters zeigen.' },
  ],
  penalties: [
    { id: 'wolf', label: 'Zugriff auf das persönliche Postfach von Andreas Wolf vergeben', points: 10, test: (w) => { const mb = findCloudUser(w, 'a.wolf')?.mailbox; const me = upnOf(w, 's.schwarz'); return has(mb?.fullAccess, me) || has(mb?.sendAs, me) || has(mb?.sendOnBehalf, me) } },
  ],
  workNoteKeywords: [
    { label: 'Freigabe geprüft', any: ['freigabe', 'wolf', 'genehmigung', 'genehmigt'] },
    { label: 'Vollzugriff', any: ['vollzugriff', 'full access'] },
    { label: 'Senden als', any: ['senden als', 'send as', 'sendas'] },
  ],
  caller: {
    intro: 'Hallo, Stefan Schwarz vom Einkauf – wegen des Team-Postfachs.',
    mood: 'freundlich',
    facts: [
      { keywords: ['outlook', 'einrichten', 'erscheint', 'angezeigt'], answer: 'Muss ich in Outlook etwas einrichten, oder taucht das Postfach von selbst auf?' },
      { keywords: ['absender', 'als einkauf', 'im auftrag', 'name'], answer: 'Wichtig ist, dass beim Lieferanten nur "Einkauf (Team-Postfach)" als Absender erscheint – nicht "Stefan Schwarz im Auftrag von …".' },
      { keywords: ['katrin', 'neumann', 'vertretung'], answer: 'Frau Neumann behält ihren Zugriff, wir machen das zu zweit.' },
      { keywords: ['wolf', 'persönlich', 'chef'], answer: 'Auf das persönliche Postfach von Herrn Wolf brauche ich keinen Zugriff, nur das Team-Postfach.' },
    ],
    fallback: ['Ich brauche nur das Team-Postfach, sonst nichts.', 'Da kenne ich mich nicht aus.'],
    resolvedReply: 'Ja, das Postfach "Einkauf" ist in Outlook aufgetaucht und ich kann als einkauf@ senden. Super!',
    unresolvedReply: 'Hm, ich sehe das Team-Postfach noch nicht bzw. kann nicht als "Einkauf" senden.',
    persona: 'Stefan ist sachlich und freundlich. Er braucht ausschließlich das Team-Postfach.',
  },
  hints: [
    'Prüfe zuerst die Freigabe im Posteingang: Ist Andreas Wolf der Verantwortliche für das Team-Postfach bzw. Vorgesetzter?',
    'Cloud Admin Center → Postfächer → "Einkauf (Team-Postfach)" → Postfachberechtigungen.',
    '"Vollzugriff" (lesen) und "Senden als" (Absender = Team-Postfach) vergeben. "Senden im Auftrag" zeigt den eigenen Namen.',
  ],
  solution: [
    'Ticket übernehmen, Typ Serviceanfrage, Kategorie E-Mail & Cloud, P4.',
    'Freigabe von Andreas Wolf (Leiter Einkauf, Vorgesetzter laut AD) prüfen.',
    'Postfach einkauf@: Vollzugriff und "Senden als" für s.schwarz vergeben – nichts am Postfach von Herrn Wolf ändern.',
    'Benutzer informieren (Postfach erscheint nach einiger Zeit automatisch in Outlook), mit "Anfrage erfüllt" schließen.',
  ],
  kb: ['KB0007'],
}

export const CLOUD_SCENARIOS: Scenario[] = [lizenzFehlt, teampostfachZugriff]
