// Druckszenarien: Druckserver-Ausfall durch defekten Auftrag, Papierstau (Vor-Ort-Eskalation)

import { getEndpoint, printerEffectiveStatus } from '@/core/ops/endpoint'
import type { Scenario } from '@/core/scenarios/types'
import type { PrintJob, World } from '@/core/types'
import { nowIso } from '@/core/util'
import { epOf, escalatedTo, jobsRemovedByTrainee, minutesAgo, pcOf, printWaitingJobs, serverEvent, setupEndpoint } from './kit'

const spoolerOf = (w: World) => w.infra.servers.find((s) => s.name === 'PRINT01')?.services.find((s) => s.name === 'Spooler')
const queueOf = (w: World, name: string) => w.infra.printQueues.find((q) => q.name === name)
const job = (id: number, document: string, owner: string, pages: number, sizeKb: number, status: PrintJob['status'], ago: number): PrintJob => ({ id, document, owner, pages, sizeKb, status, submitted: minutesAgo(ago) })

// ───────────────────────── Druckserver: Spooler stürzt ab ─────────────────────────

export const druckserverAusfall: Scenario = {
  id: 'druckserver-spooler-ausfall',
  title: 'Niemand im Haus kann drucken',
  summary: 'Alle Drucker sind "Offline": Der Spooler auf PRINT01 ist abgestürzt – ausgelöst durch einen defekten Druckauftrag. Zentral denken, richtig priorisieren, Auftrag entfernen und Dienst starten.',
  difficulty: 2,
  category: 'Drucker',
  skills: ['Telefon', 'Priorisierung', 'Druckserver', 'Serverdienste', 'Ereignisprotokoll'],
  requester: 'm.scholz',
  channel: 'Telefon',
  ticket: { title: 'Drucken im ganzen Haus gestört', description: 'Alle Drucker im 1. OG zeigen "Offline".' },
  expected: { priority: ['P2 – Hoch', 'P1 – Kritisch'], category: 'Drucker', resolutionCodes: ['Gelöst (dauerhaft)'] },
  setup: (w, ctx) => {
    ctx.vars.computer = pcOf(w, 'm.scholz')
    setupEndpoint(w, ctx.vars.computer)
    const sp = spoolerOf(w)
    const q = queueOf(w, '1OG-Farbe')
    if (!sp || !q) return
    sp.status = 'Beendet'
    q.jobs = [
      job(311, 'Produktkatalog_2026_Druckversion.pdf', 'l.lehmann', 248, 1_480_000, 'Fehler', 34),
      job(312, 'Angebot_Kunde_Jansen.docx', 'm.scholz', 3, 180, 'In Warteschlange', 30),
      job(313, 'Reklamation_4471.pdf', 'p.jung', 2, 95, 'In Warteschlange', 25),
      job(314, 'Lieferantenbewertung_Q3.xlsx', 'k.neumann', 4, 60, 'In Warteschlange', 12),
    ]
    ctx.vars.badJob = '311'
    ctx.vars.queuedJobs = '312,313,314'
    ctx.vars.runningSince = ''
    serverEvent(w, 'PRINT01', { log: 'Anwendung', eventId: 1000, level: 'Fehler', source: 'Application Error', message: 'Name der fehlerhaften Anwendung: spoolsv.exe\nName des fehlerhaften Moduls: LumaRender3.dll\nAusnahmecode: 0xc0000005\nKontext: Rendern von Auftrag 311 "Produktkatalog_2026_Druckversion.pdf" (Warteschlange 1OG-Farbe)', time: minutesAgo(33) })
    serverEvent(w, 'PRINT01', { log: 'System', eventId: 7031, level: 'Fehler', source: 'Service Control Manager', message: 'Der Dienst "Druckwarteschlange" wurde unerwartet beendet. Dies ist bereits 3 Mal passiert. Folgende Korrekturmaßnahmen werden in 0 Millisekunden durchgeführt: Keine Aktion.', time: minutesAgo(33) })
  },
  tick: (w, ctx) => {
    const sp = spoolerOf(w)
    const q = queueOf(w, '1OG-Farbe')
    if (!sp || !q) return
    if (sp.status !== 'Wird ausgeführt') {
      ctx.vars.runningSince = ''
      return
    }
    if (q.jobs.some((j) => j.status === 'Fehler')) {
      // Solange der defekte Auftrag in der Warteschlange liegt, stürzt der Spooler erneut ab
      if (!ctx.vars.runningSince) ctx.vars.runningSince = nowIso()
      else if (Date.now() - new Date(ctx.vars.runningSince).getTime() >= 25_000) {
        sp.status = 'Beendet'
        ctx.vars.runningSince = ''
        serverEvent(w, 'PRINT01', { log: 'System', eventId: 7031, level: 'Fehler', source: 'Service Control Manager', message: 'Der Dienst "Druckwarteschlange" wurde unerwartet beendet (spoolsv.exe, Modul LumaRender3.dll, Auftrag 311).' })
      }
      return
    }
    ctx.vars.runningSince = ''
    printWaitingJobs(w, ctx, '1OG-Farbe')
  },
  checks: [
    { id: 'spooler', label: 'Druckwarteschlange auf PRINT01 läuft', points: 5, test: (w) => spoolerOf(w)?.status === 'Wird ausgeführt', hint: 'Infrastruktur → PRINT01 → Dienste.' },
    { id: 'job', label: 'Defekter Druckauftrag aus der Warteschlange 1OG-Farbe entfernt', points: 5, test: (w) => { const q = queueOf(w, '1OG-Farbe'); return !!q && !q.jobs.some((j) => j.status === 'Fehler') }, hint: 'Ereignisprotokoll von PRINT01 nennt den Auftrag, der den Absturz auslöst.' },
    { id: 'client', label: 'Drucker 1OG-Farbe am PC von Melanie Scholz wieder bereit', points: 4, test: (w, ctx) => { const ep = epOf(w, ctx); const p = ep?.printers.find((x) => x.serverQueue === '1OG-Farbe'); return !!ep && !!p && printerEffectiveStatus(w, ep, p).ok } },
  ],
  penalties: [{ id: 'others', label: 'Druckaufträge von Kollegen unnötig gelöscht', points: 3, test: (w, ctx) => jobsRemovedByTrainee(w, ctx, '1OG-Farbe') }],
  workNoteKeywords: [
    { label: 'Druckserver PRINT01', any: ['print01', 'druckserver'] },
    { label: 'Spooler-Dienst', any: ['spooler', 'druckwarteschlange', 'dienst'] },
    { label: 'Defekter Auftrag', any: ['auftrag', 'job', 'katalog', '311'] },
  ],
  caller: {
    intro: 'Scholz, Teamleitung Kundenservice. Bei uns im 1. OG kann gerade niemand mehr drucken – weder auf dem Farbdrucker noch auf dem Schwarzweiß-Drucker. Bei allen steht "Offline". Wir müssen heute die Reklamationsschreiben rausschicken!',
    mood: 'gestresst',
    facts: [
      { keywords: ['wie viele', 'kollegen', 'andere', 'abteilung', 'betroffen', 'nur bei ihnen'], answer: 'Alle hier im Kundenservice, und der Vertrieb nebenan hat auch schon geflucht. Ich glaube, im ganzen Haus druckt gerade nichts.' },
      { keywords: ['seit wann', 'angefangen', 'vorher passiert'], answer: 'Seit ungefähr einer halben Stunde. Kurz vorher hat Lukas aus dem Marketing den neuen Produktkatalog gedruckt – eine riesige Datei.' },
      { keywords: ['display', 'drucker selbst', 'anzeige', 'papier', 'toner', 'gerät'], answer: 'Am Drucker selbst steht "Bereit", Papier ist drin. Er bekommt einfach nichts.' },
      { keywords: ['neu gestartet', 'neustart', 'aus und an', 'ausgeschaltet'], answer: 'Wir haben den Drucker schon aus- und wieder eingeschaltet. Hat nichts gebracht.' },
    ],
    fallback: ['Im Druckdialog steht bei allen Druckern "Offline".', 'Keine Ahnung, technisch bin ich raus.'],
    resolvedReply: 'Der Drucker rattert los – auch die Aufträge von vorhin kommen raus. Vielen Dank, das ging schnell!',
    unresolvedReply: 'Nein, alle Drucker stehen weiterhin auf "Offline".',
    persona: 'Melanie leitet den Kundenservice, ist organisiert und gestresst. Sie weiß, dass im ganzen 1. OG niemand drucken kann.',
  },
  hints: [
    'Mehrere Drucker an verschiedenen Geräten gleichzeitig offline → das Problem liegt eher zentral (Druckserver) als am Gerät oder Client.',
    'Infrastruktur → PRINT01: Läuft der Dienst "Druckwarteschlange"? Was sagt das Ereignisprotokoll des Servers?',
    'Der Spooler stürzt an einem defekten Auftrag in 1OG-Farbe ab. Nur diesen Auftrag löschen, Dienst starten und prüfen, ob er stabil läuft.',
  ],
  solution: [
    'Ticket übernehmen, Kategorie Drucker, Priorität P2 (viele Benutzer betroffen = hohe Auswirkung).',
    'Mehrere Drucker offline → Druckserver prüfen: Spooler auf PRINT01 beendet.',
    'Ereignisprotokoll PRINT01: spoolsv.exe stürzt beim Rendern von Auftrag 311 (Produktkatalog) ab.',
    'Defekten Auftrag 311 in der Warteschlange 1OG-Farbe löschen – die Aufträge der Kollegen bleiben erhalten.',
    'Spooler starten, beobachten (stürzt nicht mehr ab), Testdruck/Bestätigung bei Frau Scholz.',
    'Lukas Lehmann informieren (Katalog als kleinere PDF neu drucken), dokumentieren, schließen.',
  ],
  kb: ['KB0016', 'KB0027'],
}

// ───────────────────────── Papierstau → Vor-Ort-Service ─────────────────────────

const devOf = (w: World, id: string) => w.infra.printers.find((d) => d.id === id)

export const papierstauEskalation: Scenario = {
  id: 'papierstau-eskalation',
  title: 'Papierstau in der Fixiereinheit',
  summary: 'Physische Störung am Drucker: per Weboberfläche diagnostizieren, an den Vor-Ort-Service eskalieren und dem Benutzer einen Ausweichdrucker einrichten.',
  difficulty: 1,
  category: 'Drucker',
  skills: ['Telefon', 'Drucker-Weboberfläche', 'Eskalation', 'Workaround', 'Remote-Desktop'],
  requester: 'm.hartmann',
  channel: 'Telefon',
  ticket: { title: 'Drucker EG meldet Papierstau', description: 'Drucker im EG-Flur meldet Papierstau, Benutzer findet kein Papier.' },
  expected: { priority: ['P3 – Mittel', 'P2 – Hoch'], category: 'Drucker', resolutionCodes: ['Weitergeleitet / eskaliert', 'Gelöst (Workaround)'] },
  setup: (w, ctx) => {
    ctx.vars.computer = pcOf(w, 'm.hartmann')
    setupEndpoint(w, ctx.vars.computer)
    const dev = devOf(w, 'PRN-EG-SW')
    const q = queueOf(w, 'EG-SW')
    if (!dev || !q) return
    dev.status = 'Papierstau'
    dev.statusDetail = 'Fehler 13.B9.D2 – Papierstau in der Fixiereinheit (Bereich C). Klappe C öffnen; bei eingerissenem Papier Techniker anfordern. Achtung: heiße Oberfläche!'
    dev.log.unshift({ time: minutesAgo(22), message: 'FEHLER 13.B9.D2: Papierstau Fixiereinheit (Bereich C).' })
    dev.log.unshift({ time: minutesAgo(15), message: 'Klappe C geöffnet / geschlossen – Stau weiterhin erkannt.' })
    q.jobs.push(job(411, 'Lohnabrechnung_09-2026.pdf', 'm.hartmann', 46, 2_100, 'In Warteschlange', 20), job(412, 'Reisekostenantrag.docx', 'l.werner', 1, 40, 'In Warteschlange', 14))
    ctx.vars.queuedJobs = '411,412'
    ctx.vars.escalatedAt = ''
  },
  tick: (w, ctx) => {
    if (!escalatedTo(w, ctx, 'Vor-Ort-Service')) return
    if (!ctx.vars.escalatedAt) {
      ctx.vars.escalatedAt = nowIso()
      return
    }
    const dev = devOf(w, 'PRN-EG-SW')
    if (dev && dev.status === 'Papierstau' && Date.now() - new Date(ctx.vars.escalatedAt).getTime() >= 45_000) {
      dev.status = 'Bereit'
      dev.statusDetail = undefined
      dev.log.unshift({ time: nowIso(), message: 'Papierstau durch Vor-Ort-Service beseitigt (eingerissenes Blatt aus Fixiereinheit entfernt).' })
    }
    printWaitingJobs(w, ctx, 'EG-SW')
  },
  checks: [
    { id: 'escalated', label: 'Ticket an den Vor-Ort-Service eskaliert (physische Störung)', points: 8, test: (w, ctx) => escalatedTo(w, ctx, 'Vor-Ort-Service'), hint: 'Ein eingerissenes Blatt in der heißen Fixiereinheit ist nichts für den Benutzer.' },
    { id: 'fallback', label: 'Ausweichdrucker \\\\PRINT01\\1OG-SW für den Benutzer eingerichtet', points: 5, test: (w, ctx) => { const ep = getEndpoint(w, ctx.vars.computer ?? ''); return !!ep?.printers.some((p) => p.serverQueue === '1OG-SW') }, hint: 'Remote-Desktop → Drucker hinzufügen.' },
  ],
  penalties: [{ id: 'jobs', label: 'Druckaufträge der Kollegen gelöscht', points: 3, test: (w, ctx) => jobsRemovedByTrainee(w, ctx, 'EG-SW') }],
  workNoteKeywords: [
    { label: 'Diagnose Papierstau', any: ['papierstau', 'fixiereinheit', '13.b9', 'klappe c'] },
    { label: 'Eskalation Vor-Ort', any: ['vor-ort', 'techniker', 'eskaliert'] },
    { label: 'Ausweichdrucker', any: ['1og-sw', 'ausweich', 'alternativ', 'workaround'] },
  ],
  caller: {
    intro: 'Hartmann, Lohnbuchhaltung. Der Drucker im EG-Flur zeigt "Papierstau", aber ich finde kein Papier! Ich habe schon alle Fächer aufgemacht. Die Lohnabrechnungen müssen heute bis 14 Uhr in die Hauspost.',
    mood: 'gestresst',
    facts: [
      { keywords: ['display', 'anzeige', 'code', 'fehlercode', 'steht da'], answer: 'Auf dem Display steht "13.B9.D2 Papierstau Fixiereinheit – Klappe C öffnen".' },
      { keywords: ['klappe', 'geöffnet', 'geoeffnet', 'nachgeschaut', 'herausziehen', 'rausziehen'], answer: 'Hinter Klappe C ist es sehr heiß, und da hängt ein eingerissenes Blatt ganz tief drin. Da traue ich mich nicht ran.' },
      { keywords: ['anderen drucker', 'anderer drucker', 'woanders', 'ausweich', 'alternative', 'solange'], answer: 'Gibt es einen anderen Drucker, auf dem ich die Abrechnungen drucken kann? Der Farbdrucker der Geschäftsführung ist tabu, das weiß ich.' },
      { keywords: ['vertraulich', 'abholen', 'kopierraum'], answer: 'Wenn ich im 1. OG drucke, gehe ich sofort hin und hole die Abrechnungen ab – die sind ja vertraulich.' },
      { keywords: ['neustart', 'neu gestartet', 'ausgeschaltet', 'aus und an'], answer: 'Aus- und eingeschaltet habe ich ihn schon, der Stau bleibt.' },
    ],
    fallback: ['Ich sehe nur die Meldung mit dem Papierstau.', 'Ich bin Buchhalter, kein Druckertechniker.'],
    resolvedReply: 'Der Kollege vom Vor-Ort-Service kommt vorbei, und die Abrechnungen drucke ich solange oben im 1. OG. Danke!',
    unresolvedReply: 'Und wie komme ich jetzt an meine Ausdrucke? Der Drucker steht ja immer noch.',
    persona: 'Michael ist korrekt und etwas nervös wegen der Lohnfrist. Er würde nie in ein heißes Gerät greifen.',
  },
  hints: [
    'Drucker-Weboberfläche von PRN-EG-SW aufrufen: Was meldet das Gerät genau? Lässt sich das per Fernwartung lösen?',
    'Ein eingerissenes Blatt in der heißen Fixiereinheit ist ein Fall für den Techniker vor Ort – ein Geräteneustart hilft hier nicht.',
    'Ticket an den Vor-Ort-Service eskalieren und dem Benutzer bis dahin \\\\PRINT01\\1OG-SW als Ausweichdrucker verbinden.',
  ],
  solution: [
    'Ticket übernehmen, Kategorie Drucker, P3 (P2 wegen Lohnfrist vertretbar).',
    'Weboberfläche PRN-EG-SW: Fehler 13.B9.D2 – Papierstau in der Fixiereinheit, eingerissenes Blatt. Remote nicht lösbar.',
    'Benutzer warnen (heiße Fixiereinheit), Ticket mit genauer Fehlerbeschreibung an den Vor-Ort-Service eskalieren.',
    'Workaround: per Remote-Desktop \\\\PRINT01\\1OG-SW beim Benutzer verbinden, vertrauliche Ausdrucke sofort abholen lassen.',
    'Druckaufträge der Kollegen nicht löschen – sie werden nach der Reparatur gedruckt. Dokumentieren, mit "Weitergeleitet / eskaliert" abschließen.',
  ],
  kb: ['KB0016', 'KB0026'],
}

export const PRINTING_SCENARIOS: Scenario[] = [druckserverAusfall, papierstauEskalation]
