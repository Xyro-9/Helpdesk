// Flüchtiger UI-Zustand des Kommunikationsmoduls (nicht persistiert):
// "schreibt …"/"spricht …"-Anzeigen, eingeklapptes Anruf-Panel, Klingelton stumm.

import { create } from 'zustand'

const RING_KEY = 'helpdesk-trainer.ringMuted'

function loadRingMuted(): boolean {
  try {
    return localStorage.getItem(RING_KEY) === '1'
  } catch {
    return false
  }
}

interface CommsUiState {
  /** Anzahl ausstehender Antworten je Anruf/Chat (> 0 = Gegenüber schreibt/spricht) */
  typing: Record<string, number>
  overlayCollapsed: boolean
  ringMuted: boolean
  beginTyping: (id: string) => void
  endTyping: (id: string) => void
  setOverlayCollapsed: (v: boolean) => void
  setRingMuted: (v: boolean) => void
}

export const useCommsUi = create<CommsUiState>()((set) => ({
  typing: {},
  overlayCollapsed: false,
  ringMuted: loadRingMuted(),
  beginTyping: (id) => set((s) => ({ typing: { ...s.typing, [id]: (s.typing[id] ?? 0) + 1 } })),
  endTyping: (id) =>
    set((s) => {
      const n = Math.max(0, (s.typing[id] ?? 0) - 1)
      const typing = { ...s.typing }
      if (n === 0) delete typing[id]
      else typing[id] = n
      return { typing }
    }),
  setOverlayCollapsed: (v) => set({ overlayCollapsed: v }),
  setRingMuted: (v) => {
    try {
      localStorage.setItem(RING_KEY, v ? '1' : '0')
    } catch {
      /* Speicher nicht verfügbar */
    }
    set({ ringMuted: v })
  },
}))

/** true, solange das Gegenüber in diesem Anruf/Chat gerade antwortet */
export const useIsTyping = (id: string | undefined) => useCommsUi((s) => (id ? (s.typing[id] ?? 0) > 0 : false))
