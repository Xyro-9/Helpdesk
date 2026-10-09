// Schnittstelle für Trainingsszenarien.
// Ein Szenario manipuliert beim Start den Weltzustand (setup), erzeugt ein Ticket über einen Kanal
// und wird beim Lösen anhand des Weltzustands (checks) und des Vorgehens bewertet.

import type { Channel, Priority, ResolutionCode, ScenarioCtx, TicketCategory, TicketKind, World } from '../types'

export interface ScenarioCheck {
  id: string
  /** Wird im Bewertungsbericht angezeigt, z.B. "Konto entsperrt" */
  label: string
  points: number
  test: (w: World, ctx: ScenarioCtx) => boolean
  /** Hinweis, wenn nicht erfüllt */
  hint?: string
}

export interface ScenarioPenalty {
  id: string
  label: string
  /** Abzug als positive Zahl */
  points: number
  test: (w: World, ctx: ScenarioCtx) => boolean
}

export interface CallerFact {
  /** Schlüsselwörter (beliebiges muss vorkommen, umlaut-/case-insensitiv) */
  keywords: string[]
  answer: string
  /** optional: wird ins Aktionsprotokoll geschrieben */
  logAs?: string
}

export interface ScenarioCaller {
  /** Erste Nachricht des Benutzers (Anruf / Chat / Mail-Text) */
  intro: string
  mood?: 'freundlich' | 'gestresst' | 'verärgert' | 'verunsichert' | 'ungeduldig'
  facts: CallerFact[]
  fallback?: string[]
  /** Antwort auf "Funktioniert es jetzt?", wenn alle Technik-Checks erfüllt sind */
  resolvedReply?: string
  /** Antwort, wenn noch nicht gelöst */
  unresolvedReply?: string
  /** Zusatz für KI-Modus: Persönlichkeit, Wissensstand */
  persona?: string
  /** Abweichende Antwort auf die Identitätsfrage (Social-Engineering-Szenarien: falsche Daten!) */
  identityAnswer?: string
}

export interface Scenario {
  id: string
  title: string
  /** Was wird trainiert? (Katalog) */
  summary: string
  difficulty: 1 | 2 | 3
  category: TicketCategory
  skills: string[]
  /** sam des meldenden Benutzers */
  requester: string
  channel: Channel
  ticket: {
    title: string
    description: string
    kind?: TicketKind
    attachments?: { name: string; content: string }[]
  }
  /** Erwartete Triage (für Prozess-Punkte) */
  expected?: {
    priority?: Priority | Priority[]
    category?: TicketCategory | TicketCategory[]
    resolutionCodes?: ResolutionCode[]
  }
  /** Fehler in der Welt erzeugen. Läuft in einem immer-Draft. */
  setup: (w: World, ctx: ScenarioCtx) => void
  /** Optional: wird alle ~10 s aufgerufen, solange das Ticket offen ist (dynamisches Verhalten) */
  tick?: (w: World, ctx: ScenarioCtx) => void
  checks: ScenarioCheck[]
  penalties?: ScenarioPenalty[]
  /** Identitätsprüfung vor sensiblen Aktionen erforderlich (Kennwort, MFA, BitLocker …) */
  identityRequired?: boolean
  /** Erwartete Inhalte der Arbeitsnotizen */
  workNoteKeywords: { label: string; any: string[] }[]
  caller: ScenarioCaller
  hints: string[]
  /** Musterlösung */
  solution: string[]
  /** passende KB-Artikel */
  kb?: string[]
  /** Zusätzliche E-Mails, die beim Start zugestellt werden (z.B. Freigabe des Vorgesetzten) */
  extraMails?: (w: World, ctx: ScenarioCtx) => { fromSam: string; subject: string; body: string; attachments?: { name: string; sizeKb: number; content?: string }[]; malicious?: boolean; fromOverride?: { name: string; address: string } }[]
  /** Zeitbudget in Minuten (sonst nach Priorität) */
  timeLimitMin?: number
  /** Szenario stammt aus dem Trainer-Editor */
  custom?: boolean
}

/** Daten-Definition eines im Trainer-Modus erstellten Szenarios (serialisierbar) */
export interface CustomScenarioDef {
  id: string
  title: string
  summary: string
  difficulty: 1 | 2 | 3
  category: TicketCategory
  requester: string
  channel: Channel
  ticketTitle: string
  ticketDescription: string
  priority?: Priority
  identityRequired: boolean
  /** Bausteine aus der Fehlerbibliothek (src/content/faults.ts) */
  faults: { type: string; params: Record<string, string> }[]
  callerIntro: string
  callerFacts: { keywords: string; answer: string }[]
  workNoteKeywords: { label: string; any: string }[]
  hints: string[]
  solution: string[]
  created: string
}
