// Zentraler Zustand (zustand + immer + persist in IndexedDB).
// Module ändern die Welt ausschließlich über updateWorld(recipe, log?).

import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { A } from './actions'
import { allScenarios, createTicket, evaluateTicket, findTicket, getScenario, logAction, spawnScenario, takeHint, tickWorld, type NewTicketInput } from './scenarios/engine'
import type { CustomScenarioDef } from './scenarios/types'
import { createInitialWorld, WORLD_VERSION } from './seed'
import type { ActionEntry, ResolutionCode, ScoreResult, Ticket, World } from './types'
import { minutesFromNow, nowIso, uid } from './util'

export type ViewId =
  | 'dashboard'
  | 'tickets'
  | 'mail'
  | 'chat'
  | 'phone'
  | 'ad'
  | 'rdp'
  | 'browser'
  | 'powershell'
  | 'infra'
  | 'assets'
  | 'shipping'
  | 'kb'
  | 'training'
  | 'progress'
  | 'trainer'
  | 'help'

export interface Settings {
  traineeName: string
  trainerPin: string
  hintsEnabled: boolean
  /** Musterlösung nach dem Abschluss anzeigen */
  showSolution: boolean
  /** "Zwischenstand prüfen" im Ticket erlauben */
  allowPreCheck: boolean
  /** Sprachausgabe für Anrufer (Web Speech API) */
  tts: boolean
  /** Spracheingabe für den Azubi */
  stt: boolean
  /** Antwortverzögerung der simulierten Benutzer in ms */
  replyDelayMs: number
  /** Optionaler KI-Anrufer (Claude API) */
  ai: { enabled: boolean; apiKey: string; model: string }
}

export interface Toast {
  id: string
  text: string
  kind: 'info' | 'success' | 'warning' | 'error'
}

export interface UiState {
  view: ViewId
  params: Record<string, string>
  /** Offene Remote-Desktop-Sitzungen (Hostnamen) und aktive Sitzung */
  rdpSessions: string[]
  rdpActive?: string
  /** URL, die der Workspace-Browser öffnen soll */
  browserUrl?: string
  toasts: Toast[]
  /** Bewertungsbericht, der als Modal angezeigt wird */
  reportTicketId?: string
}

export interface AppState {
  world: World
  settings: Settings
  results: ScoreResult[]
  customScenarios: CustomScenarioDef[]
  activeTicketId?: string
  ui: UiState
  hydrated: boolean

  updateWorld: (recipe: (w: World) => void, log?: Omit<ActionEntry, 'id' | 'time'>) => void
  log: (entry: Omit<ActionEntry, 'id' | 'time'>) => void
  navigate: (view: ViewId, params?: Record<string, string>) => void
  setActiveTicket: (id?: string) => void
  toast: (text: string, kind?: Toast['kind']) => void
  dismissToast: (id: string) => void
  updateSettings: (patch: Partial<Settings>) => void
  openRdp: (hostname: string) => void
  closeRdp: (hostname: string) => void
  openBrowser: (url: string) => void

  // Training
  startScenario: (id: string) => string | undefined
  startShift: (difficulty: 0 | 1 | 2 | 3, maxTickets: number, intervalMin: number) => void
  stopShift: () => void
  tick: () => void
  createManualTicket: (input: NewTicketInput) => string
  claimTicket: (id: string) => void
  resolveTicket: (id: string, code: ResolutionCode, note: string, notifyUser: boolean) => ScoreResult | undefined
  useHint: (ticketId: string) => string | undefined
  showReport: (ticketId?: string) => void
  saveCustomScenario: (def: CustomScenarioDef) => void
  deleteCustomScenario: (id: string) => void
  resetWorld: () => void
  resetProgress: () => void
  importState: (json: string) => string | null
  exportState: () => string
}

export const DEFAULT_SETTINGS: Settings = {
  traineeName: 'Azubi IT',
  trainerPin: '1234',
  hintsEnabled: true,
  showSolution: true,
  allowPreCheck: false,
  tts: false,
  stt: false,
  replyDelayMs: 1200,
  ai: { enabled: false, apiKey: '', model: 'claude-sonnet-5-5' },
}

// ─────────────── IndexedDB-Speicher (mehr Platz als localStorage) ───────────────

const DB_NAME = 'helpdesk-trainer'
const STORE = 'kv'

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

const idbStorage: StateStorage = {
  getItem: async (name) => {
    try {
      const db = await idb()
      return await new Promise<string | null>((resolve) => {
        const r = db.transaction(STORE, 'readonly').objectStore(STORE).get(name)
        r.onsuccess = () => resolve((r.result as string) ?? null)
        r.onerror = () => resolve(null)
      })
    } catch {
      try {
        return localStorage.getItem(name)
      } catch {
        return null
      }
    }
  },
  setItem: async (name, value) => {
    try {
      const db = await idb()
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE, 'readwrite')
        tx.objectStore(STORE).put(value, name)
        tx.oncomplete = () => resolve()
        tx.onerror = () => resolve()
      })
    } catch {
      try {
        localStorage.setItem(name, value)
      } catch {
        /* Speicher nicht verfügbar – Sitzung läuft ohne Persistenz */
      }
    }
  },
  removeItem: async (name) => {
    try {
      const db = await idb()
      db.transaction(STORE, 'readwrite').objectStore(STORE).delete(name)
    } catch {
      try {
        localStorage.removeItem(name)
      } catch {
        /* ignore */
      }
    }
  },
}

// ─────────────── Store ───────────────

export const useStore = create<AppState>()(
  persist(
    immer((set, get) => ({
      world: createInitialWorld(DEFAULT_SETTINGS.traineeName),
      settings: DEFAULT_SETTINGS,
      results: [],
      customScenarios: [],
      activeTicketId: undefined,
      ui: { view: 'dashboard', params: {}, rdpSessions: [], toasts: [] },
      hydrated: false,

      updateWorld: (recipe, entry) =>
        set((s) => {
          recipe(s.world)
          if (entry) logAction(s.world, { ticketId: s.activeTicketId, ...entry })
        }),

      log: (entry) =>
        set((s) => {
          logAction(s.world, { ticketId: s.activeTicketId, ...entry })
        }),

      navigate: (view, params = {}) =>
        set((s) => {
          s.ui.view = view
          s.ui.params = params
        }),

      setActiveTicket: (id) =>
        set((s) => {
          s.activeTicketId = id
        }),

      toast: (text, kind = 'info') => {
        const id = uid('toast')
        set((s) => {
          s.ui.toasts.push({ id, text, kind })
          if (s.ui.toasts.length > 5) s.ui.toasts.shift()
        })
        setTimeout(() => get().dismissToast(id), kind === 'error' ? 7000 : 4500)
      },

      dismissToast: (id) =>
        set((s) => {
          s.ui.toasts = s.ui.toasts.filter((t) => t.id !== id)
        }),

      updateSettings: (patch) =>
        set((s) => {
          Object.assign(s.settings, patch)
          if (patch.traineeName) {
            s.world.tech.name = patch.traineeName
            const u = s.world.users.find((x) => x.sam === 'azubi')
            if (u) u.displayName = patch.traineeName
          }
        }),

      openRdp: (hostname) =>
        set((s) => {
          if (!s.ui.rdpSessions.includes(hostname)) s.ui.rdpSessions.push(hostname)
          s.ui.rdpActive = hostname
          s.ui.view = 'rdp'
        }),

      closeRdp: (hostname) =>
        set((s) => {
          s.ui.rdpSessions = s.ui.rdpSessions.filter((h) => h !== hostname)
          if (s.ui.rdpActive === hostname) s.ui.rdpActive = s.ui.rdpSessions[0]
          logAction(s.world, { type: A.rdpDisconnected, target: hostname, ticketId: s.activeTicketId })
        }),

      openBrowser: (url) =>
        set((s) => {
          s.ui.browserUrl = url
          s.ui.view = 'browser'
        }),

      startScenario: (id) => {
        const sc = getScenario(id, get().customScenarios)
        if (!sc) return undefined
        let ticketId: string | undefined
        set((s) => {
          const t = spawnScenario(s.world, sc)
          ticketId = t.id
        })
        const t = ticketId ? findTicket(get().world, ticketId) : undefined
        get().toast(sc.channel === 'Telefon' ? '📞 Eingehender Anruf …' : `Neues Ticket ${t?.id}: ${t?.title}`, 'info')
        return ticketId
      },

      startShift: (difficulty, maxTickets, intervalMin) =>
        set((s) => {
          s.world.shift = { active: true, startedAt: nowIso(), difficulty, intervalMin, maxTickets, spawned: [], nextArrivalAt: minutesFromNow(0.1) }
        }),

      stopShift: () =>
        set((s) => {
          s.world.shift.active = false
          s.world.shift.nextArrivalAt = undefined
        }),

      tick: () => {
        let spawned: Ticket | undefined
        let missed = 0
        set((s) => {
          const r = tickWorld(s.world, s.customScenarios)
          spawned = r.spawned
          missed = r.missedCalls.length
        })
        if (spawned) get().toast(spawned.channel === 'Telefon' ? '📞 Eingehender Anruf …' : `Neues Ticket ${spawned.id}: ${spawned.title}`, 'info')
        if (missed) get().toast('Anruf verpasst – Rückruf-Ticket wurde angelegt.', 'warning')
      },

      createManualTicket: (input) => {
        let id = ''
        set((s) => {
          id = createTicket(s.world, input).id
        })
        return id
      },

      claimTicket: (id) =>
        set((s) => {
          const t = findTicket(s.world, id)
          if (!t) return
          t.assignee = 'trainee'
          if (t.status === 'Neu') t.status = 'In Bearbeitung'
          t.firstResponseAt ??= nowIso()
          t.updatedAt = nowIso()
          s.activeTicketId = id
          logAction(s.world, { type: A.ticketClaimed, ticketId: id })
        }),

      resolveTicket: (id, code, note, notifyUser) => {
        let result: ScoreResult | undefined
        const custom = get().customScenarios
        set((s) => {
          const t = findTicket(s.world, id)
          if (!t) return
          t.status = 'Gelöst'
          t.resolutionCode = code
          t.resolutionNote = note
          t.resolvedAt = nowIso()
          t.updatedAt = nowIso()
          t.timeSpentMin = Math.round((Date.now() - new Date(t.createdAt).getTime()) / 60000)
          if (notifyUser) {
            t.comments.push({ id: uid('c'), author: s.world.tech.name, text: `Ihr Ticket ${t.id} wurde gelöst:\n\n${note}`, time: nowIso() })
            logAction(s.world, { type: A.userInformed, ticketId: id })
          }
          logAction(s.world, { type: A.ticketResolved, ticketId: id, detail: code })
          const sc = getScenario(t.scenarioId, custom)
          if (sc && t.scenarioCtx && !t.historical) {
            result = evaluateTicket(s.world, t, sc)
            t.score = result
            s.results.unshift(result)
          }
          if (s.activeTicketId === id) s.activeTicketId = undefined
          s.ui.reportTicketId = result ? id : undefined
        })
        return result
      },

      useHint: (ticketId) => {
        let hint: string | undefined
        const custom = get().customScenarios
        set((s) => {
          const t = findTicket(s.world, ticketId)
          const sc = getScenario(t?.scenarioId, custom)
          if (t && sc) hint = takeHint(s.world, t, sc)
        })
        return hint
      },

      showReport: (ticketId) =>
        set((s) => {
          s.ui.reportTicketId = ticketId
        }),

      saveCustomScenario: (def) =>
        set((s) => {
          const i = s.customScenarios.findIndex((c) => c.id === def.id)
          if (i >= 0) s.customScenarios[i] = def
          else s.customScenarios.push(def)
        }),

      deleteCustomScenario: (id) =>
        set((s) => {
          s.customScenarios = s.customScenarios.filter((c) => c.id !== id)
        }),

      resetWorld: () =>
        set((s) => {
          s.world = createInitialWorld(s.settings.traineeName)
          s.activeTicketId = undefined
          s.ui = { view: 'dashboard', params: {}, rdpSessions: [], toasts: [] }
        }),

      resetProgress: () =>
        set((s) => {
          s.results = []
        }),

      exportState: () => {
        const { world, settings, results, customScenarios } = get()
        return JSON.stringify({ app: 'helpdesk-trainer', version: WORLD_VERSION, exported: nowIso(), world, settings: { ...settings, ai: { ...settings.ai, apiKey: '' } }, results, customScenarios }, null, 1)
      },

      importState: (json) => {
        try {
          const data = JSON.parse(json)
          if (data.app !== 'helpdesk-trainer') return 'Keine gültige Exportdatei.'
          set((s) => {
            if (data.version === WORLD_VERSION && data.world) s.world = data.world
            if (data.results) s.results = data.results
            if (data.customScenarios) s.customScenarios = data.customScenarios
            if (data.settings) s.settings = { ...DEFAULT_SETTINGS, ...data.settings, ai: { ...DEFAULT_SETTINGS.ai, ...data.settings.ai, apiKey: s.settings.ai.apiKey } }
          })
          return data.version === WORLD_VERSION ? null : 'Fortschritt importiert. Die Welt hatte eine ältere Version und wurde nicht übernommen.'
        } catch (e) {
          return `Datei konnte nicht gelesen werden: ${(e as Error).message}`
        }
      },
    })),
    {
      name: 'helpdesk-trainer-state',
      version: WORLD_VERSION,
      storage: createJSONStorage(() => idbStorage),
      partialize: (s) => ({ world: s.world, settings: s.settings, results: s.results, customScenarios: s.customScenarios, activeTicketId: s.activeTicketId }),
      migrate: (persisted, version) => {
        const p = persisted as Partial<AppState>
        // Bei neuer Weltversion: Welt neu aufbauen, Fortschritt & Einstellungen behalten
        if (version !== WORLD_VERSION) return { ...p, world: createInitialWorld(p.settings?.traineeName ?? DEFAULT_SETTINGS.traineeName), activeTicketId: undefined } as AppState
        return p as AppState
      },
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppState>
        return { ...current, ...p, settings: { ...DEFAULT_SETTINGS, ...(p.settings ?? {}), ai: { ...DEFAULT_SETTINGS.ai, ...(p.settings?.ai ?? {}) } }, ui: current.ui }
      },
      onRehydrateStorage: () => () => {
        useStore.setState({ hydrated: true })
      },
    },
  ),
)

// ─────────────── Bequeme Selektoren ───────────────

export const useWorld = <T,>(sel: (w: World) => T) => useStore((s) => sel(s.world))
export const scenarioList = () => allScenarios(useStore.getState().customScenarios)
