// Hardware-Szenarien: physischer Defekt → Austauschgerät und Versand

import type { Scenario } from '@/core/scenarios/types'
import { ACTIVE_SHIPMENT, ensureStockNotebook, pcOf } from './kit'

export const notebookDisplayDefekt: Scenario = {
  id: 'notebook-display-defekt',
  title: 'Notebook-Display gebrochen',
  summary: 'Physischer Defekt im Homeoffice: Ersatzgerät aus dem Lager zuweisen und versenden, defektes Gerät auf "In Reparatur" setzen und eine Rücksendung beauftragen.',
  difficulty: 2,
  category: 'Hardware',
  skills: ['Portal', 'Inventar', 'Versand', 'Rücksendung', 'Hardwaretausch'],
  requester: 'j.wagner',
  channel: 'Portal',
  ticket: {
    title: 'Display gebrochen – Notebook nicht mehr nutzbar',
    description: 'Hallo IT,\n\nmir ist gestern beim Kunden das Notebook vom Tisch gefallen. Das Display ist gesprungen und zeigt nur noch bunte Streifen. Mit einem externen Monitor kann ich notdürftig arbeiten, aber ab Mittwoch bin ich wieder drei Tage beim Kunden unterwegs.\n\nKönnt ihr mir ein Ersatzgerät nach Hause schicken? Adresse: Kastanienallee 3, 24103 Kiel.\n\nGruß\nJonas Wagner\nAußendienst Vertrieb',
  },
  expected: { priority: ['P2 – Hoch', 'P3 – Mittel'], category: 'Hardware', resolutionCodes: ['Gelöst (dauerhaft)', 'Gelöst (Workaround)', 'Weitergeleitet / eskaliert'] },
  setup: (w, ctx) => {
    const host = pcOf(w, 'j.wagner')
    ctx.vars.computer = host
    ensureStockNotebook(w)
    const old = w.assets.find((a) => a.type === 'Notebook' && (a.hostname === host || a.assignedTo === 'j.wagner'))
    if (!old) return
    ctx.vars.oldTag = old.tag
    old.history.push({ time: new Date().toISOString(), text: 'Schadensmeldung durch Benutzer: Display gebrochen (Sturz beim Kunden)' })
  },
  checks: [
    { id: 'replacement', label: 'Ersatz-Notebook aus dem Lager Jonas Wagner zugewiesen', points: 4, test: (w, ctx) => w.assets.some((a) => a.type === 'Notebook' && a.tag !== ctx.vars.oldTag && a.assignedTo === 'j.wagner' && (a.status === 'Im Versand' || a.status === 'In Benutzung')), hint: 'Inventar → Notebooks mit Status "Lager".' },
    { id: 'shipment', label: 'Versand des Ersatzgeräts an die Homeoffice-Adresse (Kiel) beauftragt', points: 4, test: (w, ctx) => { const tags = w.assets.filter((a) => a.type === 'Notebook' && a.assignedTo === 'j.wagner' && a.tag !== ctx.vars.oldTag).map((a) => a.tag); return w.shipments.some((s) => s.direction === 'Ausgehend' && ACTIVE_SHIPMENT(s.status) && s.address.postalCode.trim() === '24103' && s.items.some((i) => tags.includes(i))) } },
    { id: 'repair', label: 'Defektes Gerät auf "In Reparatur" gesetzt', points: 3, test: (w, ctx) => w.assets.find((a) => a.tag === ctx.vars.oldTag)?.status === 'In Reparatur' },
    { id: 'return', label: 'Rücksendung des defekten Geräts angelegt', points: 3, test: (w, ctx) => w.shipments.some((s) => s.direction === 'Rücksendung' && ACTIVE_SHIPMENT(s.status) && s.items.includes(ctx.vars.oldTag ?? '-')) },
  ],
  penalties: [{ id: 'scrapped', label: 'Defektes Gerät ohne Reparaturprüfung als "Ausgemustert" verbucht', points: 2, test: (w, ctx) => w.assets.find((a) => a.tag === ctx.vars.oldTag)?.status === 'Ausgemustert' }],
  workNoteKeywords: [
    { label: 'Schaden', any: ['display', 'bildschirm', 'gebrochen', 'sturz'] },
    { label: 'Ersatzgerät', any: ['ersatz', 'mw-nb', 'lager'] },
    { label: 'Versand/Rücksendung', any: ['versand', 'sendung', 'rücksendung', 'ruecksendung'] },
    { label: 'Reparatur/Garantie', any: ['reparatur', 'garantie', 'rma', 'vor-ort'] },
  ],
  caller: {
    intro: 'Hallo, Jonas Wagner hier, Außendienst – wegen meines kaputten Notebooks.',
    mood: 'freundlich',
    facts: [
      { keywords: ['passiert', 'gefallen', 'sturz', 'wie ist'], answer: 'Es ist mir beim Kunden vom Besprechungstisch gefallen, ungefähr 80 cm auf Fliesen.' },
      { keywords: ['daten', 'gespeichert', 'lokal', 'onedrive'], answer: 'Meine Daten liegen alle im Cloud-Speicher und auf dem Laufwerk, lokal ist nichts Wichtiges.' },
      { keywords: ['adresse', 'anschrift', 'versand', 'schicken'], answer: 'Bitte an Kastanienallee 3, 24103 Kiel. Ich bin morgen den ganzen Tag zu Hause.' },
      { keywords: ['zurück', 'zurueck', 'rücksendung', 'ruecksendung', 'altes gerät', 'alte gerät'], answer: 'Das kaputte Gerät kann ich direkt dem Paketboten mitgeben, wenn er das neue bringt.' },
      { keywords: ['mittwoch', 'bis wann', 'termin'], answer: 'Ab Mittwoch bin ich drei Tage unterwegs – bis dahin bräuchte ich das Ersatzgerät.' },
    ],
    fallback: ['Das Display zeigt nur bunte Streifen.', 'Da bin ich überfragt.'],
    resolvedReply: 'Super, dann warte ich auf das Paket und gebe das alte gleich mit. Danke!',
    unresolvedReply: 'Ist das Ersatzgerät schon unterwegs?',
    persona: 'Jonas ist entspannt, im Homeoffice in Kiel und braucht das Gerät bis Mittwoch.',
  },
  hints: [
    'Ein gebrochenes Display ist ein physischer Defekt – remote nicht lösbar. Ziel: den Benutzer schnell wieder arbeitsfähig machen (Ersatzgerät).',
    'Inventar: freies Notebook aus dem Lager Jonas Wagner zuweisen, das defekte Gerät auf "In Reparatur" setzen.',
    'Versand: Ausgehende Sendung (Ersatzgerät) an die Homeoffice-Adresse in Kiel und eine Rücksendung für das defekte Notebook anlegen.',
  ],
  solution: [
    'Ticket übernehmen, Kategorie Hardware, P2 (Gerät unbrauchbar, Termin ab Mittwoch) bzw. P3.',
    'Inventar: Lager-Notebook Jonas Wagner zuweisen (Status "Im Versand"), defektes Gerät auf "In Reparatur" setzen (Garantie/RMA prüfen).',
    'Versand: Sendung an Kastanienallee 3, 24103 Kiel (ggf. Express), plus Rücksendung des defekten Geräts.',
    'Benutzer informieren (Daten liegen in der Cloud, Anmeldung am neuen Gerät mit Domänenkonto über VPN).',
    'Dokumentieren, schließen.',
  ],
  kb: ['KB0026'],
}

export const HARDWARE_SCENARIOS: Scenario[] = [notebookDisplayDefekt]
