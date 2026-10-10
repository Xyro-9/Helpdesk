// Zustand der Browserfenster (Tabs, Verlauf) je Rechner + Ladevorgänge.
// Liegt außerhalb des Stores, damit Tabs beim Wechsel zwischen Modulen erhalten bleiben.

import { useSyncExternalStore } from 'react'
import { A } from '@/core/actions'
import { ensureEndpoint, getEndpoint } from '@/core/ops/endpoint'
import { httpRequest } from '@/core/sim/network'
import { useStore } from '@/core/store'
import { uid } from '@/core/util'
import { reverseHost, routeFor, SITE_META } from './router'
import type { BrowserState, LoadResult, Tab } from './types'
import { HOME_URL, hostOf, NEWTAB_URL, parseUrl, upgradeScheme } from './url'

const states = new Map<string, BrowserState>()
const listeners = new Set<() => void>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()
const k = (host: string) => host.toUpperCase()

const emit = () => listeners.forEach((l) => l())
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

function makeTab(url: string): Tab {
  return { id: uid('tab'), history: [url], index: 0, title: url === NEWTAB_URL ? 'Neuer Tab' : hostOf(url) || 'Neuer Tab', loading: true, seq: 0 }
}

export function getBrowserState(host: string, initialUrl?: string): BrowserState {
  let s = states.get(k(host))
  if (!s) {
    const t = makeTab(initialUrl || HOME_URL)
    s = { tabs: [t], activeId: t.id, certExceptions: [], lastInitial: initialUrl }
    states.set(k(host), s)
  }
  return s
}

export function useBrowserState(host: string, initialUrl?: string): BrowserState {
  return useSyncExternalStore(subscribe, () => getBrowserState(host, initialUrl))
}

function update(host: string, fn: (s: BrowserState) => BrowserState) {
  states.set(k(host), fn(getBrowserState(host)))
  emit()
}

function updateTab(host: string, tabId: string, fn: (t: Tab) => Tab) {
  update(host, (s) => ({ ...s, tabs: s.tabs.map((t) => (t.id === tabId ? fn(t) : t)) }))
}

const currentUrl = (t: Tab) => t.history[t.index]

// ─────────────── Laden ───────────────

/** Ermittelt, was der Browser für diese URL anzeigt (Netzwerksimulation des Rechners) */
function evaluate(endpoint: string, url: string, certExceptions: string[]): LoadResult {
  if (url.startsWith('about:')) return { url, kind: 'newtab' }
  const parsed = parseUrl(url)
  if (!parsed || !/^https?:$/.test(parsed.protocol)) return { url, kind: 'bad-url' }
  const store = useStore.getState()
  let w = store.world
  let ep = getEndpoint(w, endpoint)
  if (!ep) {
    store.updateWorld((draft) => {
      ensureEndpoint(draft, endpoint)
    })
    w = useStore.getState().world
    ep = getEndpoint(w, endpoint)
  }
  if (!ep) return { url, kind: 'no-endpoint' }
  if (!ep.online) return { url, kind: 'net-error', http: { ok: false, host: parsed.hostname, error: 'ERR_INTERNET_DISCONNECTED', detail: 'Der Rechner ist ausgeschaltet bzw. nicht betriebsbereit.' } }
  const http = httpRequest(w, ep, parsed.href)
  if (!http.ok) return { url, kind: 'net-error', http }
  if (http.spoofed) {
    const served = http.ip ? reverseHost(w, http.ip) : undefined
    if (parsed.protocol === 'https:' && !certExceptions.includes(parsed.hostname)) return { url, kind: 'cert', http, servedHost: served }
    return { url, kind: 'page', http, servedHost: served, insecure: true, route: served ? routeFor(w, served) : { site: 'suspicious', host: parsed.hostname } }
  }
  return { url, kind: 'page', http, route: routeFor(w, parsed.hostname) }
}

function delayFor(r: LoadResult) {
  if (r.kind === 'newtab' || r.kind === 'bad-url' || r.kind === 'no-endpoint') return 30
  if (r.kind === 'net-error') {
    switch (r.http?.error) {
      case 'ERR_CONNECTION_TIMED_OUT':
        return 1700
      case 'DNS_PROBE_FINISHED_NXDOMAIN':
      case 'DNS_PROBE_FINISHED_NO_INTERNET':
        return 800
      case 'ERR_PROXY_CONNECTION_FAILED':
        return 700
      case 'ERR_INTERNET_DISCONNECTED':
        return 150
      default:
        return 450
    }
  }
  return 220 + Math.round(Math.random() * 280)
}

function defaultTitle(r: LoadResult): string {
  switch (r.kind) {
    case 'newtab':
      return 'Neuer Tab'
    case 'cert':
      return 'Datenschutzfehler'
    case 'bad-url':
      return 'Adresse ungültig'
    case 'no-endpoint':
      return 'Nicht verfügbar'
    case 'net-error':
      return hostOf(r.url)
    default:
      return r.route ? SITE_META[r.route.site].title : hostOf(r.url)
  }
}

/** Seiteneffekte eines erfolgreichen Seitenaufrufs (Protokoll, Zähler) */
function afterLoad(endpoint: string, r: LoadResult) {
  const store = useStore.getState()
  if (!r.url.startsWith('about:')) store.log({ type: A.browserVisit, target: endpoint, detail: r.url })
  if (r.kind === 'page' && r.route?.site === 'kb') {
    const path = parseUrl(r.url)?.pathname ?? ''
    const m = path.match(/^\/artikel\/([^/]+)/i)
    const id = m ? decodeURIComponent(m[1]).toUpperCase() : undefined
    if (id && store.world.kb.some((a) => a.id === id)) {
      store.updateWorld(
        (w) => {
          const a = w.kb.find((x) => x.id === id)
          if (a) a.views += 1
        },
        { type: A.kbViewed, target: id, detail: 'Browser' },
      )
    }
  }
}

function startLoad(endpoint: string, tabId: string) {
  const prev = timers.get(tabId)
  if (prev) clearTimeout(prev)
  const s = getBrowserState(endpoint)
  const tab = s.tabs.find((t) => t.id === tabId)
  if (!tab) return
  const url = currentUrl(tab)
  const result = evaluate(endpoint, url, s.certExceptions)
  timers.set(
    tabId,
    setTimeout(() => {
      timers.delete(tabId)
      const cur = getBrowserState(endpoint).tabs.find((t) => t.id === tabId)
      if (!cur || currentUrl(cur) !== url) return
      updateTab(endpoint, tabId, (t) => ({ ...t, loading: false, result, seq: t.seq + 1, title: defaultTitle(result) }))
      afterLoad(endpoint, result)
    }, delayFor(result)),
  )
}

/** Startet Ladevorgänge für Tabs, die noch laden (z.B. nach dem ersten Anzeigen) */
export function ensureLoading(endpoint: string) {
  for (const t of getBrowserState(endpoint).tabs) if (t.loading && !timers.has(t.id)) startLoad(endpoint, t.id)
}

// ─────────────── Navigation ───────────────

export function navigateTab(endpoint: string, tabId: string, url: string, opts: { replace?: boolean } = {}) {
  if (!url) return
  const parsed = parseUrl(url)
  const finalUrl = parsed && /^https?:$/.test(parsed.protocol) ? upgradeScheme(parsed).href : url
  updateTab(endpoint, tabId, (t) => {
    const history = opts.replace ? [...t.history.slice(0, t.index), finalUrl] : [...t.history.slice(0, t.index + 1), finalUrl]
    return { ...t, history, index: history.length - 1, loading: true, title: hostOf(finalUrl) || t.title }
  })
  startLoad(endpoint, tabId)
}

export function goBack(endpoint: string, tabId: string) {
  updateTab(endpoint, tabId, (t) => (t.index > 0 ? { ...t, index: t.index - 1, loading: true } : t))
  startLoad(endpoint, tabId)
}

export function goForward(endpoint: string, tabId: string) {
  updateTab(endpoint, tabId, (t) => (t.index < t.history.length - 1 ? { ...t, index: t.index + 1, loading: true } : t))
  startLoad(endpoint, tabId)
}

export function reloadTab(endpoint: string, tabId: string) {
  updateTab(endpoint, tabId, (t) => ({ ...t, loading: true }))
  startLoad(endpoint, tabId)
}

export function stopTab(endpoint: string, tabId: string) {
  const prev = timers.get(tabId)
  if (prev) clearTimeout(prev)
  timers.delete(tabId)
  updateTab(endpoint, tabId, (t) => ({ ...t, loading: false }))
}

export function openTab(endpoint: string, url: string, activate = true) {
  const t = makeTab(url || NEWTAB_URL)
  update(endpoint, (s) => {
    const idx = s.tabs.findIndex((x) => x.id === s.activeId)
    const tabs = [...s.tabs]
    tabs.splice(idx + 1, 0, t)
    return { ...s, tabs, activeId: activate ? t.id : s.activeId }
  })
  startLoad(endpoint, t.id)
}

export function closeTab(endpoint: string, tabId: string) {
  const prev = timers.get(tabId)
  if (prev) clearTimeout(prev)
  timers.delete(tabId)
  let created: Tab | undefined
  update(endpoint, (s) => {
    const idx = s.tabs.findIndex((t) => t.id === tabId)
    const tabs = s.tabs.filter((t) => t.id !== tabId)
    if (!tabs.length) {
      created = makeTab(NEWTAB_URL)
      tabs.push(created)
    }
    const activeId = s.activeId === tabId ? (tabs[Math.min(idx, tabs.length - 1)] ?? tabs[0]).id : s.activeId
    return { ...s, tabs, activeId }
  })
  if (created) startLoad(endpoint, created.id)
}

export function activateTab(endpoint: string, tabId: string) {
  update(endpoint, (s) => ({ ...s, activeId: tabId }))
}

export function setTabTitle(endpoint: string, tabId: string, title: string) {
  const t = getBrowserState(endpoint).tabs.find((x) => x.id === tabId)
  if (!t || t.title === title) return
  updateTab(endpoint, tabId, (x) => ({ ...x, title }))
}

export function addCertException(endpoint: string, host: string) {
  update(endpoint, (s) => (s.certExceptions.includes(host) ? s : { ...s, certExceptions: [...s.certExceptions, host] }))
}

export function setLastInitial(endpoint: string, url: string | undefined) {
  const s = getBrowserState(endpoint)
  if (s.lastInitial !== url) states.set(k(endpoint), { ...s, lastInitial: url })
}

/**
 * Öffnet eine URL im Browser des angegebenen Rechners in einem neuen Tab
 * (z.B. Links aus Tickets/Mails). Ist der Browser noch nicht geöffnet, wird er mit dieser Seite gestartet.
 */
export function openBrowserTab(endpoint: string, url: string) {
  if (!states.has(k(endpoint))) {
    getBrowserState(endpoint, url)
    emit()
    ensureLoading(endpoint)
    return
  }
  openTab(endpoint, url)
}
