// Anmeldesitzungen der simulierten Webseiten ("Cookies") – je Rechner und Anwendung.
// Bewusst NICHT im Store: Sitzungen überleben Modulwechsel, aber kein Neuladen der App.

import { useSyncExternalStore } from 'react'

export interface WebSession {
  /** Benutzer (UPN bzw. sam) */
  user: string
  /** Anmeldezeitpunkt (ms) – für "Sitzungen widerrufen" */
  at: number
}

const sessions = new Map<string, WebSession>()
const listeners = new Set<() => void>()
const key = (endpoint: string, realm: string) => `${endpoint.toUpperCase()}|${realm}`

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export const getSession = (endpoint: string, realm: string) => sessions.get(key(endpoint, realm))

export function setSession(endpoint: string, realm: string, s?: WebSession) {
  if (s) sessions.set(key(endpoint, realm), s)
  else sessions.delete(key(endpoint, realm))
  listeners.forEach((l) => l())
}

export function useSession(endpoint: string, realm: string): WebSession | undefined {
  return useSyncExternalStore(subscribe, () => sessions.get(key(endpoint, realm)))
}
