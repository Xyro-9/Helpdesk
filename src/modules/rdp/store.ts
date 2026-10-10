// Modul-lokaler (nicht persistierter) Zustand der Remote-Desktop-Sitzungen:
// Verbindungsphase, offene Fenster mit Positionen, Papierkorb-Anzeige.
// Der Weltzustand (Endpunkte) liegt ausschließlich im globalen Store (core/store.ts).

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

export type AppId =
  | 'explorer'
  | 'notepad'
  | 'services'
  | 'eventvwr'
  | 'regedit'
  | 'diskmgmt'
  | 'devmgmt'
  | 'taskmgr'
  | 'ncpa'
  | 'settings'
  | 'printers'
  | 'printqueue'
  | 'cmd'
  | 'powershell'
  | 'browser'
  | 'outlook'
  | 'cleanmgr'
  | 'msinfo'

export type AppArgs = Record<string, string>

export interface WinState {
  id: string
  app: AppId
  args: AppArgs
  title: string
  x: number
  y: number
  w: number
  h: number
  z: number
  min: boolean
  max: boolean
}

export interface ConnError {
  title: string
  message: string
  details?: string
  /** Ziel ist ein Server → Verweis auf Infrastruktur-Modul */
  server?: boolean
}

export type Phase = 'connecting' | 'connected' | 'failed' | 'disconnected'

export interface RecycleItem {
  name: string
  path: string
  sizeMb: number
  deletedAt: string
}

export interface SessionState {
  /** Eintrag in ui.rdpSessions (so wie übergeben) */
  key: string
  /** Kanonischer Computername (AD), nach erfolgreicher Prüfung */
  host: string
  phase: Phase
  /** Zähler für Verbindungsversuche (startet Animation neu) */
  attempt: number
  error?: ConnError
  /** Grund der Trennung */
  reason?: string
  /** Neustart läuft bis (ms) */
  rebootUntil?: number
  windows: WinState[]
  zTop: number
  focused?: string
  banner: boolean
  locked: boolean
  recycle: RecycleItem[]
  seq: number
}

interface RdpLocalState {
  sessions: Record<string, SessionState>
  ensure: (key: string) => void
  remove: (key: string) => void
  patch: (key: string, p: Partial<SessionState>) => void
  connectStart: (key: string) => void
  openWindow: (key: string, app: AppId, args: AppArgs, geo: { w: number; h: number; title: string; deskW: number; deskH: number }) => string
  closeWindow: (key: string, id: string) => void
  focusWindow: (key: string, id: string) => void
  updateWindow: (key: string, id: string, p: Partial<WinState>) => void
  minimizeAll: (key: string) => void
  clearWindows: (key: string) => void
  addRecycle: (key: string, item: RecycleItem) => void
  clearRecycle: (key: string) => void
}

const newSession = (key: string): SessionState => ({
  key,
  host: key,
  phase: 'connecting',
  attempt: 1,
  windows: [],
  zTop: 10,
  banner: false,
  locked: false,
  recycle: [],
  seq: 0,
})

export const useRdp = create<RdpLocalState>()(
  immer((set) => ({
    sessions: {},
    ensure: (key) =>
      set((s) => {
        if (!s.sessions[key]) s.sessions[key] = newSession(key)
      }),
    remove: (key) =>
      set((s) => {
        delete s.sessions[key]
      }),
    patch: (key, p) =>
      set((s) => {
        const ses = s.sessions[key]
        if (ses) Object.assign(ses, p)
      }),
    connectStart: (key) =>
      set((s) => {
        const ses = s.sessions[key] ?? (s.sessions[key] = newSession(key))
        ses.phase = 'connecting'
        ses.attempt += 1
        ses.error = undefined
        ses.reason = undefined
      }),
    openWindow: (key, app, args, geo) => {
      let id = ''
      set((s) => {
        const ses = s.sessions[key]
        if (!ses) return
        ses.seq += 1
        id = `w${ses.seq}`
        const n = ses.windows.length % 8
        const w = Math.min(geo.w, Math.max(320, geo.deskW - 40))
        const h = Math.min(geo.h, Math.max(220, geo.deskH - 40))
        const x = Math.max(0, Math.min(40 + n * 28 + (ses.seq % 3) * 12, geo.deskW - w - 8))
        const y = Math.max(0, Math.min(24 + n * 24, geo.deskH - h - 8))
        ses.zTop += 1
        ses.windows.push({ id, app, args, title: geo.title, x, y, w, h, z: ses.zTop, min: false, max: false })
        ses.focused = id
      })
      return id
    },
    closeWindow: (key, id) =>
      set((s) => {
        const ses = s.sessions[key]
        if (!ses) return
        ses.windows = ses.windows.filter((w) => w.id !== id)
        if (ses.focused === id) {
          const top = [...ses.windows].filter((w) => !w.min).sort((a, b) => b.z - a.z)[0]
          ses.focused = top?.id
        }
      }),
    focusWindow: (key, id) =>
      set((s) => {
        const ses = s.sessions[key]
        const w = ses?.windows.find((x) => x.id === id)
        if (!ses || !w) return
        if (ses.focused === id && w.z === ses.zTop && !w.min) return
        ses.zTop += 1
        w.z = ses.zTop
        w.min = false
        ses.focused = id
      }),
    updateWindow: (key, id, p) =>
      set((s) => {
        const w = s.sessions[key]?.windows.find((x) => x.id === id)
        if (!w) return
        Object.assign(w, p)
        if (p.min && s.sessions[key].focused === id) {
          const top = [...s.sessions[key].windows].filter((x) => !x.min && x.id !== id).sort((a, b) => b.z - a.z)[0]
          s.sessions[key].focused = top?.id
        }
      }),
    minimizeAll: (key) =>
      set((s) => {
        const ses = s.sessions[key]
        if (!ses) return
        ses.windows.forEach((w) => (w.min = true))
        ses.focused = undefined
      }),
    clearWindows: (key) =>
      set((s) => {
        const ses = s.sessions[key]
        if (!ses) return
        ses.windows = []
        ses.focused = undefined
      }),
    addRecycle: (key, item) =>
      set((s) => {
        s.sessions[key]?.recycle.unshift(item)
      }),
    clearRecycle: (key) =>
      set((s) => {
        const ses = s.sessions[key]
        if (ses) ses.recycle = []
      }),
  })),
)
