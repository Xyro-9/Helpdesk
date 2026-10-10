import type { AppArgs } from '../store'

export interface AppProps {
  host: string
  args: AppArgs
}

export const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Pfade, die zum Schreiben Administratorrechte erfordern */
export const needsAdmin = (path: string) => /^c:\\(windows|program files|programdata)(\\|$)/i.test(path) || /^c:\\[^\\]+$/i.test(path)
