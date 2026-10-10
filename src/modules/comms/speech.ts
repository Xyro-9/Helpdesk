// Sprachausgabe (TTS), Spracheingabe (STT) und Klingelton – jeweils mit Feature-Erkennung
// und stillem Fallback, falls der Browser die Schnittstelle nicht anbietet.

import { useCallback, useEffect, useRef, useState } from 'react'

const hash = (s: string) => {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0
  return Math.abs(h)
}

// ─────────────── Sprachausgabe ───────────────

export const ttsSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'

/** Liest den Text mit einer deutschen Stimme vor; Stimme/Tonhöhe hängen vom Sprecher ab. */
export function speak(text: string, speakerKey: string) {
  if (!ttsSupported()) return
  try {
    const clean = text
      .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '')
      .replace(/[*_`#>]/g, '')
      .trim()
    if (!clean) return
    const synth = window.speechSynthesis
    const u = new SpeechSynthesisUtterance(clean)
    u.lang = 'de-DE'
    const h = hash(speakerKey)
    const voices = synth.getVoices().filter((v) => v.lang?.toLowerCase().startsWith('de'))
    if (voices.length) u.voice = voices[h % voices.length]
    u.pitch = 0.8 + (h % 40) / 100 // 0,80 … 1,19
    u.rate = 0.95 + ((h >> 5) % 16) / 100 // 0,95 … 1,10
    synth.speak(u)
  } catch {
    /* Sprachausgabe nicht verfügbar */
  }
}

export function stopSpeaking() {
  try {
    if (ttsSupported()) window.speechSynthesis.cancel()
  } catch {
    /* ignorieren */
  }
}

// ─────────────── Spracheingabe ───────────────

interface RecognitionEventLike {
  resultIndex: number
  results: SpeechRecognitionResultList
}

interface RecognitionLike {
  lang: string
  interimResults: boolean
  continuous: boolean
  maxAlternatives: number
  onresult: ((e: RecognitionEventLike) => void) | null
  onerror: ((e: { error?: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

type RecognitionCtor = new () => RecognitionLike

function recognitionCtor(): RecognitionCtor | undefined {
  if (typeof window === 'undefined') return undefined
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

export const sttSupported = () => !!recognitionCtor()

/**
 * Spracheingabe (de-DE). onText erhält den bisher erkannten Text (Zwischenergebnisse und Endergebnis).
 * onError wird mit einer deutschen Fehlermeldung aufgerufen.
 */
export function useSpeechInput(onText: (text: string, final: boolean) => void, onError?: (msg: string) => void) {
  const recRef = useRef<RecognitionLike | null>(null)
  const textCb = useRef(onText)
  const errCb = useRef(onError)
  useEffect(() => {
    textCb.current = onText
    errCb.current = onError
  })
  const [listening, setListening] = useState(false)
  const supported = sttSupported()

  useEffect(
    () => () => {
      const r = recRef.current
      recRef.current = null
      if (r) {
        r.onend = null
        r.onresult = null
        r.onerror = null
        try {
          r.abort()
        } catch {
          /* ignorieren */
        }
      }
    },
    [],
  )

  const stop = useCallback(() => {
    try {
      recRef.current?.stop()
    } catch {
      /* ignorieren */
    }
  }, [])

  const start = useCallback(() => {
    const Ctor = recognitionCtor()
    if (!Ctor || recRef.current) return
    let rec: RecognitionLike
    try {
      rec = new Ctor()
    } catch {
      errCb.current?.('Spracheingabe konnte nicht gestartet werden.')
      return
    }
    rec.lang = 'de-DE'
    rec.interimResults = true
    rec.continuous = false
    rec.maxAlternatives = 1
    rec.onresult = (e) => {
      let text = ''
      let final = false
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i]
        text += r[0]?.transcript ?? ''
        if (r.isFinal && i === e.results.length - 1) final = true
      }
      textCb.current(text.trim(), final)
    }
    rec.onerror = (e) => {
      const map: Record<string, string> = {
        'not-allowed': 'Kein Zugriff auf das Mikrofon erlaubt.',
        'service-not-allowed': 'Spracherkennung ist im Browser nicht erlaubt.',
        'no-speech': 'Es wurde keine Sprache erkannt.',
        'audio-capture': 'Kein Mikrofon gefunden.',
        network: 'Spracherkennung benötigt eine Netzwerkverbindung.',
      }
      if (e.error && e.error !== 'aborted') errCb.current?.(map[e.error] ?? `Spracherkennung: ${e.error}`)
    }
    rec.onend = () => {
      recRef.current = null
      setListening(false)
    }
    recRef.current = rec
    try {
      rec.start()
      setListening(true)
    } catch {
      recRef.current = null
      errCb.current?.('Spracheingabe konnte nicht gestartet werden.')
    }
  }, [])

  return { supported, listening, start, stop }
}

// ─────────────── Klingelton ───────────────

let audioCtx: AudioContext | null = null
let lastRingAt = 0

/** Kurzer Zweiklang-Klingelton per WebAudio (ohne Audiodateien) */
export function playRing() {
  // Doppelte Auslösung (z. B. StrictMode-Effekte) nicht überlagern
  if (Date.now() - lastRingAt < 1500) return
  lastRingAt = Date.now()
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    audioCtx ??= new AC()
    const ctx = audioCtx
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined)
    const t0 = ctx.currentTime + 0.02
    const tone = (freq: number, start: number, dur: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(0.08, start + 0.02)
      gain.gain.setValueAtTime(0.08, start + dur - 0.05)
      gain.gain.linearRampToValueAtTime(0, start + dur)
      osc.connect(gain).connect(ctx.destination)
      osc.start(start)
      osc.stop(start + dur + 0.02)
    }
    tone(880, t0, 0.35)
    tone(660, t0 + 0.4, 0.35)
    tone(880, t0 + 0.9, 0.35)
    tone(660, t0 + 1.3, 0.35)
  } catch {
    /* Audio nicht verfügbar */
  }
}
