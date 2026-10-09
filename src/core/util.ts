// Kleine Helfer für IDs, Zeit und Zufall (deterministisch per Seed möglich)

export const nowIso = () => new Date().toISOString()

export const minutesFromNow = (min: number, base: Date = new Date()) => new Date(base.getTime() + min * 60_000).toISOString()

export const daysAgo = (days: number, base: Date = new Date()) => new Date(base.getTime() - days * 86_400_000).toISOString()

export const uid = (prefix = 'id') => `${prefix}-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`

/** Mulberry32 – deterministischer PRNG für reproduzierbare Seed-Daten */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const pick = <T,>(r: () => number, arr: readonly T[]): T => arr[Math.floor(r() * arr.length)]

export const hashString = (s: string) => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export const fmtDateTime = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–'

export const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '–')

export const fmtTime = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '–')

/** "vor 5 Min." */
export function fmtRelative(iso?: string) {
  if (!iso) return '–'
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  const abs = Math.abs(diff)
  const fut = diff < 0
  let s: string
  if (abs < 60) s = `${Math.round(abs)} Sek.`
  else if (abs < 3600) s = `${Math.round(abs / 60)} Min.`
  else if (abs < 86400) s = `${Math.round(abs / 3600)} Std.`
  else s = `${Math.round(abs / 86400)} Tg.`
  return fut ? `in ${s}` : `vor ${s}`
}

export const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')

/** Prüft, ob einer der Suchbegriffe (case-/umlaut-insensitiv) im Text vorkommt */
export const containsAny = (text: string, needles: string[]) => {
  const t = normalize(text)
  return needles.some((n) => t.includes(normalize(n)))
}

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

export const ipToInt = (ip: string) => ip.split('.').reduce((acc, o) => (acc << 8) + (parseInt(o, 10) || 0), 0) >>> 0
export const intToIp = (n: number) => [24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.')
export const maskToPrefix = (mask: string) => ipToInt(mask).toString(2).replace(/0/g, '').length
export const sameSubnet = (a: string, b: string, mask: string) => (ipToInt(a) & ipToInt(mask)) === (ipToInt(b) & ipToInt(mask))
export const isValidIp = (ip: string) => /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(ip) && ip.split('.').every((o) => +o >= 0 && +o <= 255)
export const isApipa = (ip: string) => ip.startsWith('169.254.')

export function randomPassword(r: () => number = Math.random) {
  const words = ['Sommer', 'Winter', 'Hafen', 'Wolke', 'Anker', 'Birke', 'Kompass', 'Leuchtturm', 'Falke', 'Brise', 'Gipfel', 'Mosaik']
  const w = words[Math.floor(r() * words.length)]
  const n = Math.floor(r() * 90 + 10)
  const sym = '!?#%+'[Math.floor(r() * 5)]
  return `${w}${n}${sym}${Math.floor(r() * 9)}`
}

/** Prüft Kennwort gegen Domänenrichtlinie, liefert Fehlertext oder null */
export function checkPasswordPolicy(pw: string, minLen: number, complexity: boolean, sam?: string): string | null {
  if (pw.length < minLen) return `Das Kennwort muss mindestens ${minLen} Zeichen lang sein.`
  if (complexity) {
    const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(pw)).length
    if (classes < 3) return 'Das Kennwort erfüllt nicht die Komplexitätsanforderungen (3 von 4: Groß-, Kleinbuchstaben, Ziffern, Sonderzeichen).'
    if (sam && pw.toLowerCase().includes(sam.split('.').pop()!.toLowerCase())) return 'Das Kennwort darf keine Teile des Benutzernamens enthalten.'
  }
  return null
}
