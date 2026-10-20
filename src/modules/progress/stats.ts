// Auswertungen über die Bewertungsergebnisse (Fortschritt, Abzeichen, CSV-Export).
// Reine Funktionen – keine Store-Zugriffe.

import type { Scenario } from '@/core/scenarios/types'
import type { ScoreResult, ScoreSection } from '@/core/types'

export interface EnrichedResult {
  r: ScoreResult
  sc?: Scenario
}

export const enrich = (results: ScoreResult[], scenarios: Scenario[]): EnrichedResult[] => {
  const byId = new Map(scenarios.map((s) => [s.id, s]))
  return results.map((r) => ({ r, sc: byId.get(r.scenarioId) }))
}

/** IHK-Notenschlüssel (Punkte in %) */
export const IHK_SCALE: { grade: ScoreResult['grade']; note: number; from: number; to: number }[] = [
  { grade: 'Sehr gut', note: 1, from: 92, to: 100 },
  { grade: 'Gut', note: 2, from: 81, to: 91 },
  { grade: 'Befriedigend', note: 3, from: 67, to: 80 },
  { grade: 'Ausreichend', note: 4, from: 50, to: 66 },
  { grade: 'Mangelhaft', note: 5, from: 30, to: 49 },
  { grade: 'Ungenügend', note: 6, from: 0, to: 29 },
]

export const gradeNote = (g: ScoreResult['grade']) => IHK_SCALE.find((x) => x.grade === g)?.note ?? 6

export const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

export const sectionOf = (r: ScoreResult, key: ScoreSection['key']) => r.sections.find((s) => s.key === key)

export const sectionRatio = (s?: ScoreSection) => (s && s.max > 0 ? s.earned / s.max : undefined)

export function fmtDuration(min: number) {
  if (min < 60) return `${min} Min.`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} Std. ${m} Min.` : `${h} Std.`
}

export interface Summary {
  count: number
  unique: number
  avgPercent: number
  passRate: number
  passed: number
  totalMin: number
}

export function summarize(results: ScoreResult[]): Summary {
  const passed = results.filter((r) => r.passed).length
  return {
    count: results.length,
    unique: new Set(results.map((r) => r.scenarioId)).size,
    avgPercent: Math.round(avg(results.map((r) => r.percent))),
    passRate: results.length ? Math.round((passed / results.length) * 100) : 0,
    passed,
    totalMin: results.reduce((a, r) => a + (r.durationMin || 0), 0),
  }
}

// ─────────────── Kompetenzen & Schwächen ───────────────

export interface GroupStat {
  key: string
  avg: number
  count: number
  passed: number
}

export function byCategory(list: EnrichedResult[]): GroupStat[] {
  const m = new Map<string, number[]>()
  const p = new Map<string, number>()
  for (const { r, sc } of list) {
    const k = sc?.category ?? 'Unbekannt (Szenario entfernt)'
    m.set(k, [...(m.get(k) ?? []), r.percent])
    p.set(k, (p.get(k) ?? 0) + (r.passed ? 1 : 0))
  }
  return [...m.entries()].map(([key, xs]) => ({ key, avg: Math.round(avg(xs)), count: xs.length, passed: p.get(key) ?? 0 })).sort((a, b) => b.avg - a.avg)
}

export function bySkill(list: EnrichedResult[]): GroupStat[] {
  const m = new Map<string, number[]>()
  const p = new Map<string, number>()
  for (const { r, sc } of list) {
    for (const k of sc?.skills ?? []) {
      m.set(k, [...(m.get(k) ?? []), r.percent])
      p.set(k, (p.get(k) ?? 0) + (r.passed ? 1 : 0))
    }
  }
  return [...m.entries()].map(([key, xs]) => ({ key, avg: Math.round(avg(xs)), count: xs.length, passed: p.get(key) ?? 0 })).sort((a, b) => b.avg - a.avg)
}

export const SECTION_LABEL: Record<ScoreSection['key'], string> = {
  technik: 'Technische Lösung',
  dokumentation: 'Dokumentation',
  kommunikation: 'Kommunikation',
  prozess: 'Prozess & Triage',
  abzuege: 'Abzüge',
}

/** Ø-Erfüllungsgrad je Bewertungsabschnitt (0–100) */
export function bySection(results: ScoreResult[]): { key: ScoreSection['key']; label: string; avg: number; count: number }[] {
  const keys: ScoreSection['key'][] = ['technik', 'dokumentation', 'kommunikation', 'prozess']
  return keys
    .map((key) => {
      const xs = results.map((r) => sectionRatio(sectionOf(r, key))).filter((x): x is number => x !== undefined)
      return { key, label: SECTION_LABEL[key], avg: Math.round(avg(xs) * 100), count: xs.length }
    })
    .filter((x) => x.count > 0)
}

export interface MissedItem {
  label: string
  section: ScoreSection['key']
  count: number
  of: number
  hint?: string
}

/** Häufig verpasste Bewertungspunkte (gruppiert über alle Ergebnisse) */
export function frequentMisses(results: ScoreResult[], limit = 6): MissedItem[] {
  const m = new Map<string, MissedItem>()
  const seen = new Map<string, number>()
  for (const r of results) {
    for (const s of r.sections) {
      for (const it of s.items) {
        // Szenario-spezifische Klammerzusätze entfernen ("Kategorie korrekt (Netzwerk)" → "Kategorie korrekt")
        const label = it.label.replace(/\s*\([^)]*\)\s*$/, '').replace(/^\d+ Tipp\(s\) verwendet$/, 'Tipps verwendet')
        const key = `${s.key}|${label}`
        seen.set(key, (seen.get(key) ?? 0) + 1)
        if (it.ok) continue
        const cur = m.get(key) ?? { label, section: s.key, count: 0, of: 0, hint: it.hint }
        cur.count += 1
        cur.hint ??= it.hint
        m.set(key, cur)
      }
    }
  }
  return [...m.entries()]
    .map(([key, v]) => ({ ...v, of: seen.get(key) ?? v.count }))
    .sort((a, b) => b.count - a.count || b.count / b.of - a.count / a.of)
    .slice(0, limit)
}

// ─────────────── Abzeichen ───────────────

export interface BadgeState {
  id: string
  title: string
  description: string
  icon: 'flag' | 'phone' | 'shield' | 'pen' | 'brain' | 'network' | 'clock' | 'star' | 'compass' | 'mountain' | 'message' | 'flame'
  earned: boolean
  progress: string
}

const has = (r: ScoreResult, key: ScoreSection['key'], test: (label: string) => boolean) => sectionOf(r, key)?.items.find((i) => test(i.label))

export function computeBadges(list: EnrichedResult[]): BadgeState[] {
  const results = list.map((x) => x.r)
  const count = (n: number, of: number) => `${Math.min(n, of)}/${of}`

  const phone = list.filter(({ r, sc }) => sc?.channel === 'Telefon' && r.percent >= 80).length
  // Identitätsprüfung: die letzten 5 Ergebnisse mit Identitätspflicht (Ergebnisse sind neueste zuerst sortiert)
  const idResults = results.map((r) => has(r, 'kommunikation', (l) => l.startsWith('Identität'))).filter((x) => !!x)
  const lastId = idResults.slice(0, 5)
  const idOk = lastId.length >= 3 && lastId.every((i) => i.ok)
  const docGood = results.filter((r) => (sectionRatio(sectionOf(r, 'dokumentation')) ?? 0) >= 0.9).length
  const noHints = results.filter((r) => r.passed && r.hintsUsed === 0).length
  const net = list.filter(({ r, sc }) => r.passed && sc?.category === 'Netzwerk').length
  const sla = results.filter((r) => has(r, 'prozess', (l) => l.includes('SLA'))?.ok).length
  const perfect = results.some((r) => r.percent >= 100)
  const cats = new Set(list.filter(({ r, sc }) => r.passed && sc).map(({ sc }) => sc!.category)).size
  const hard = list.filter(({ r, sc }) => r.passed && sc?.difficulty === 3).length
  const comm = results.filter((r) => (sectionRatio(sectionOf(r, 'kommunikation')) ?? 0) >= 1).length

  return [
    { id: 'first', title: 'Erstes Ticket', description: 'Das erste Trainingsszenario abgeschlossen.', icon: 'flag', earned: results.length >= 1, progress: count(results.length, 1) },
    { id: 'phone', title: 'Telefonprofi', description: '5 Anrufszenarien mit mindestens 80 % gelöst.', icon: 'phone', earned: phone >= 5, progress: count(phone, 5) },
    {
      id: 'security',
      title: 'Sicherheitsbewusst',
      description: 'Identitätsprüfung in allen (mind. 3) der letzten Szenarien mit Identitätspflicht korrekt durchgeführt.',
      icon: 'shield',
      earned: idOk,
      progress: lastId.some((i) => !i.ok) ? `${lastId.filter((i) => i.ok).length}/${lastId.length} korrekt` : count(lastId.length, 3),
    },
    { id: 'doc', title: 'Dokumentationskünstler', description: 'In 5 Tickets mindestens 90 % der Dokumentationspunkte erreicht.', icon: 'pen', earned: docGood >= 5, progress: count(docGood, 5) },
    { id: 'nohints', title: 'Ohne Tipps', description: '5 Szenarien bestanden, ohne einen einzigen Tipp zu nutzen.', icon: 'brain', earned: noHints >= 5, progress: count(noHints, 5) },
    { id: 'network', title: 'Netzwerk-Detektiv', description: '3 Netzwerk-Szenarien bestanden.', icon: 'network', earned: net >= 3, progress: count(net, 3) },
    { id: 'sla', title: 'SLA-Held', description: '10 Tickets innerhalb der Lösungszeit (SLA) abgeschlossen.', icon: 'clock', earned: sla >= 10, progress: count(sla, 10) },
    { id: 'comm', title: 'Kommunikationstalent', description: 'In 5 Tickets die volle Punktzahl bei der Kommunikation erreicht.', icon: 'message', earned: comm >= 5, progress: count(comm, 5) },
    { id: 'perfect', title: 'Perfektionist', description: 'Ein Szenario mit 100 % abgeschlossen.', icon: 'star', earned: perfect, progress: perfect ? '1/1' : '0/1' },
    { id: 'allround', title: 'Allrounder', description: 'Szenarien aus 5 verschiedenen Kategorien bestanden.', icon: 'compass', earned: cats >= 5, progress: count(cats, 5) },
    { id: 'hard', title: 'Gipfelstürmer', description: 'Ein Szenario der Stufe 3 (Profi) bestanden.', icon: 'mountain', earned: hard >= 1, progress: count(hard, 1) },
    { id: 'marathon', title: 'Dauerbrenner', description: '25 Szenarien absolviert.', icon: 'flame', earned: results.length >= 25, progress: count(results.length, 25) },
  ]
}

// ─────────────── CSV ───────────────

const csvCell = (v: string | number) => {
  const s = String(v)
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function resultsCsv(list: EnrichedResult[]): string {
  const head = ['Datum', 'Ticket', 'Szenario-ID', 'Szenario', 'Kategorie', 'Kanal', 'Stufe', 'Prozent', 'Punkte', 'Maximal', 'Note', 'Bestanden', 'Dauer (Min.)', 'Tipps', 'Technik', 'Dokumentation', 'Kommunikation', 'Prozess', 'Abzüge']
  const sec = (r: ScoreResult, k: ScoreSection['key']) => {
    const s = sectionOf(r, k)
    if (!s) return ''
    return k === 'abzuege' ? String(s.earned) : `${s.earned}/${s.max}`
  }
  const rows = list.map(({ r, sc }) => [
    new Date(r.evaluatedAt).toLocaleString('de-DE'),
    r.ticketId,
    r.scenarioId,
    r.scenarioTitle,
    sc?.category ?? '',
    sc?.channel ?? '',
    sc?.difficulty ?? '',
    r.percent,
    r.earned,
    r.max,
    `${gradeNote(r.grade)} (${r.grade})`,
    r.passed ? 'ja' : 'nein',
    r.durationMin,
    r.hintsUsed,
    sec(r, 'technik'),
    sec(r, 'dokumentation'),
    sec(r, 'kommunikation'),
    sec(r, 'prozess'),
    sec(r, 'abzuege'),
  ])
  return '﻿' + [head, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n')
}

/** Datei im Browser herunterladen */
export function downloadText(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const fileStamp = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`
}
