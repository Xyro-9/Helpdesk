// Kontexte & Hooks für den Remote-Desktop: Desktop-API (Apps öffnen, Dialoge) und Fenster-API.

import { createContext, useContext, useMemo } from 'react'
import { getEndpoint } from '@/core/ops/endpoint'
import { useStore } from '@/core/store'
import type { Endpoint, World } from '@/core/types'
import type { AppArgs, AppId } from './store'
import type { MsgIcon } from './ui'

export interface MsgOptions {
  title?: string
  text: string
  icon?: MsgIcon
  buttons?: string[]
  /** Index des Standardknopfs */
  defaultIndex?: number
}

export interface DeskApi {
  sessionKey: string
  host: string
  dialogLayer: HTMLElement | null
  /** Sitzung ist die sichtbare (für Tastaturkürzel) */
  isActive: () => boolean
  openApp: (app: AppId, args?: AppArgs) => void
  msg: (o: MsgOptions) => Promise<string>
  alert: (text: string, opts?: { title?: string; icon?: MsgIcon }) => Promise<void>
  confirm: (text: string, opts?: { title?: string; icon?: MsgIcon; ok?: string; cancel?: string }) => Promise<boolean>
  /** Eingabeaufforderung – liefert null bei Abbruch */
  prompt: (o: { title: string; label: string; value?: string; placeholder?: string }) => Promise<string | null>
  /** Benutzerkontensteuerung – liefert true bei "Ja" */
  uac: (program: string) => Promise<boolean>
  runCommand: (cmd: string, admin?: boolean) => void
  showRun: () => void
  requestReboot: () => void
}

export const DeskCtx = createContext<DeskApi | null>(null)

export function useDesk(): DeskApi {
  const d = useContext(DeskCtx)
  if (!d) throw new Error('useDesk außerhalb des Remote-Desktops')
  return d
}

export interface WinApi {
  id: string
  focused: boolean
  setTitle: (t: string) => void
  close: () => void
}

export const WinCtx = createContext<WinApi | null>(null)

export function useWin(): WinApi {
  const w = useContext(WinCtx)
  if (!w) throw new Error('useWin außerhalb eines Fensters')
  return w
}

/** Endpunkt der Sitzung (stabile Referenz aus dem Store) */
export const useEp = (host: string): Endpoint | undefined => useStore((s) => s.world.endpoints[host])

export interface LogSpec {
  type: string
  detail?: string
}

/**
 * Schreibzugriffe auf den Endpunkt der Sitzung.
 * - `mutate`: immer erfolgreiche Änderung, Protokolleintrag direkt über updateWorld
 * - `run`: Operation liefert Fehlertext (string) oder null → Fehlerdialog bzw. Protokoll nur bei Erfolg
 */
export function useEpOps(host: string) {
  const updateWorld = useStore((s) => s.updateWorld)
  const log = useStore((s) => s.log)
  const desk = useDesk()
  return useMemo(
    () => ({
      mutate(fn: (ep: Endpoint, w: World) => void, entry?: LogSpec) {
        updateWorld(
          (w) => {
            const ep = getEndpoint(w, host)
            if (ep) fn(ep, w)
          },
          entry ? { type: entry.type, target: host, detail: entry.detail } : undefined,
        )
      },
      run(fn: (ep: Endpoint, w: World) => string | null | undefined | void, entry?: LogSpec, opts: { errorTitle?: string; errorPrefix?: string; silent?: boolean } = {}): boolean {
        let err: string | null = null
        let found = false
        updateWorld((w) => {
          const ep = getEndpoint(w, host)
          if (!ep) return
          found = true
          err = fn(ep, w) ?? null
        })
        if (!found) err = `Der Computer ${host} ist nicht verfügbar.`
        if (err) {
          if (!opts.silent) void desk.alert(`${opts.errorPrefix ? opts.errorPrefix + '\n\n' : ''}${err}`, { title: opts.errorTitle ?? host, icon: 'error' })
          return false
        }
        if (entry) log({ type: entry.type, target: host, detail: entry.detail })
        return true
      },
    }),
    [updateWorld, log, desk, host],
  )
}
