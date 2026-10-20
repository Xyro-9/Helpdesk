// Optionaler KI-Anrufer: Antworttext über die Claude Messages API direkt aus dem Browser.
// Der regelbasierte Anrufer (callerReply) läuft trotzdem immer mit – er liefert die
// bewertungsrelevanten Aktionen. Die KI ersetzt nur den angezeigten/gesprochenen Text.

export interface AiTurn {
  role: 'user' | 'assistant'
  content: string
}

export class AiCallerError extends Error {
  readonly status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.name = 'AiCallerError'
    this.status = status
  }
}

const API_URL = 'https://api.anthropic.com/v1/messages'
const API_VERSION = '2023-06-01'
const DEFAULT_MODEL = 'claude-sonnet-5-5'
const TIMEOUT_MS = 30_000

/** Modelle, die serverseitige Ausweichmodelle bei Ablehnungen unterstützen (fallbacks: "default") */
const FALLBACK_MODELS = new Set(['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5'])

/** Modelle mit "effort"-Steuerung (output_config.effort) */
const supportsEffort = (model: string) => /^claude-(fable|mythos|opus|sonnet|haiku)-5/.test(model) || /^claude-opus-4-[5-8]/.test(model) || /^claude-sonnet-4-6/.test(model)

/** Verlauf in ein gültiges messages-Array bringen: beginnt mit user, endet mit user, keine leeren Inhalte */
function normalizeTurns(turns: AiTurn[], opener: string): AiTurn[] {
  const out = turns.filter((t) => t.content.trim().length > 0).map((t) => ({ role: t.role, content: t.content.trim() }))
  if (!out.length || out[0].role !== 'user') out.unshift({ role: 'user', content: opener })
  // Aufeinanderfolgende gleiche Rollen zusammenfassen (übersichtlicher; die API würde sie ebenfalls zusammenführen)
  const merged: AiTurn[] = []
  for (const t of out) {
    const last = merged[merged.length - 1]
    if (last && last.role === t.role) last.content = `${last.content}\n${t.content}`
    else merged.push({ ...t })
  }
  return merged
}

interface ApiErrorBody {
  error?: { type?: string; message?: string }
}

function describeError(status: number, body: unknown): string {
  const msg = (body as ApiErrorBody | null)?.error?.message
  switch (status) {
    case 401:
      return 'API-Schlüssel ungültig oder fehlt.'
    case 403:
      return `Zugriff verweigert${msg ? `: ${msg}` : '.'}`
    case 404:
      return `Modell oder Endpunkt nicht gefunden${msg ? `: ${msg}` : '.'}`
    case 429:
      return 'Ratenlimit erreicht – bitte kurz warten.'
    case 529:
      return 'Die KI ist gerade überlastet.'
    default:
      return msg ? `Fehler ${status}: ${msg}` : `Fehler ${status}`
  }
}

interface ContentBlock {
  type: string
  text?: string
}

interface MessagesResponse {
  content?: ContentBlock[]
  stop_reason?: string | null
}

/**
 * Fragt die Antwort des simulierten Benutzers bei Claude an.
 * Wirft AiCallerError bei Netzwerk-/API-Fehlern, Ablehnung oder leerer Antwort.
 */
export async function aiCallerReply(opts: { apiKey: string; model: string; system: string; turns: AiTurn[]; opener?: string }): Promise<string> {
  const model = opts.model.trim() || DEFAULT_MODEL
  const messages = normalizeTurns(opts.turns, opts.opener ?? '(Das Gespräch beginnt.)')
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-api-key': opts.apiKey.trim(),
    'anthropic-version': API_VERSION,
    'anthropic-dangerous-direct-browser-access': 'true',
  }
  const body: Record<string, unknown> = { model, max_tokens: 4000, system: opts.system, messages }
  // Kurze Rollenspiel-Antworten: wenig Denkaufwand genügt
  if (supportsEffort(model)) body.output_config = { effort: 'low' }
  // Bei einer Ablehnung serverseitig auf ein empfohlenes Ausweichmodell umschalten
  if (FALLBACK_MODELS.has(model)) {
    body.fallbacks = 'default'
    headers['anthropic-beta'] = 'server-side-fallback-2026-07-01'
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(API_URL, { method: 'POST', headers, body: JSON.stringify(body), signal: ctrl.signal })
  } catch (e) {
    throw new AiCallerError(ctrl.signal.aborted ? 'Zeitüberschreitung bei der KI-Anfrage.' : `Netzwerkfehler: ${(e as Error).message}`)
  } finally {
    clearTimeout(timer)
  }
  const data: unknown = await res.json().catch(() => null)
  if (!res.ok) throw new AiCallerError(describeError(res.status, data), res.status)
  const msg = (data ?? {}) as MessagesResponse
  if (msg.stop_reason === 'refusal') throw new AiCallerError('Die KI hat die Antwort abgelehnt.')
  const text = (msg.content ?? [])
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('')
    .trim()
  if (!text) throw new AiCallerError('Die KI hat keine Antwort geliefert.')
  return text
}
