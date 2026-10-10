// Gemeinsame Typen des simulierten Webbrowsers.

import type { HttpResult } from '@/core/sim/network'

export type SiteId =
  | 'intranet'
  | 'kb'
  | 'status'
  | 'erp'
  | 'konto'
  | 'cloudadmin'
  | 'cloudlogin'
  | 'cloudstatus'
  | 'webmail'
  | 'search'
  | 'techdocs'
  | 'phishing'
  | 'company'
  | 'tracking'
  | 'news'
  | 'vpn'
  | 'printer'
  | 'generic'
  | 'suspicious'

export interface Route {
  site: SiteId
  /** Host, dessen Inhalte ausgeliefert werden (bei manipulierter Namensauflösung ≠ angezeigter Host) */
  host: string
  printerId?: string
}

/** Kleine API, die jede simulierte Webseite erhält */
export interface PageApi {
  /** Endpunkt (Rechner), von dem aus gesurft wird – dessen Netzwerk/Proxy/hosts gelten */
  hostname: string
  /** Vollständige aktuelle URL */
  href: string
  url: URL
  /** Host in der Adressleiste */
  host: string
  /** Dekodierter Pfad, ohne abschließenden "/" ("/" = Startseite) */
  path: string
  /** Dekodierte Pfadbestandteile */
  segments: string[]
  query: URLSearchParams
  /** Query-Parameter oder "" */
  q: (name: string) => string
  /** Navigation (absolut oder relativ zur aktuellen URL) */
  navigate: (href: string, opts?: { replace?: boolean; newTab?: boolean }) => void
  /** Relative Adresse in absolute URL umwandeln */
  resolve: (href: string) => string
  setTitle: (title: string) => void
  reload: () => void
}

export interface LoadResult {
  url: string
  kind: 'page' | 'net-error' | 'cert' | 'newtab' | 'bad-url' | 'no-endpoint'
  http?: HttpResult
  route?: Route
  /** Manipulierte Namensauflösung: Host, dessen Inhalte tatsächlich geliefert werden */
  servedHost?: string
  /** Seite trotz Warnung geöffnet bzw. unverschlüsselt von falschem Server */
  insecure?: boolean
}

export interface Tab {
  id: string
  history: string[]
  index: number
  title: string
  loading: boolean
  result?: LoadResult
  /** Zählt Ladevorgänge – Seite wird bei jedem Laden neu aufgebaut */
  seq: number
}

export interface BrowserState {
  tabs: Tab[]
  activeId: string
  /** Hosts, für die der Benutzer eine Zertifikatswarnung übergangen hat */
  certExceptions: string[]
  lastInitial?: string
}
