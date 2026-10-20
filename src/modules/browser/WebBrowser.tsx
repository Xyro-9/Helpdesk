// Simulierter Webbrowser: Tabs, Verlauf, Adressleiste, Lesezeichen, Fehlerseiten.
// Jeder Seitenaufruf läuft über httpRequest() des Rechners `hostname` (Netzwerk, Proxy, hosts-Datei gelten).

import { ArrowLeft, ArrowRight, CircleAlert, Globe, House, Info, LoaderCircle, Lock, LockOpen, Monitor, Plus, RotateCw, Search, ShieldAlert, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { ensureEndpoint, getEndpoint } from '@/core/ops/endpoint'
import { useStore } from '@/core/store'
import { cx } from '@/ui'
import { BadUrlPage, CertWarningPage, NetErrorPage, NewTabPage, NoEndpointPage } from './ErrorPages'
import { BOOKMARKS, shortNames, SITE_META } from './router'
import { SiteView } from './SiteView'
import {
  activateTab,
  addCertException,
  closeTab,
  ensureLoading,
  getBrowserState,
  goBack,
  goForward,
  navigateTab,
  openTab,
  reloadTab,
  setLastInitial,
  setTabTitle,
  stopTab,
  useBrowserState,
} from './state'
import type { LoadResult, PageApi, Tab } from './types'
import { displayUrl, HOME_URL, hostOf, NEWTAB_URL, normalizeInput, parseUrl, resolveHref } from './url'

export { openBrowserTab } from './state'

export interface WebBrowserProps {
  /** Endpunkt, von dem aus gesurft wird (Netzwerk/Proxy/hosts dieses Rechners gelten) */
  hostname: string
  initialUrl?: string
  className?: string
}

const normalize = (input: string) => normalizeInput(input, shortNames(useStore.getState().world))

export function WebBrowser(props: WebBrowserProps) {
  return <BrowserFrame key={props.hostname.toUpperCase()} {...props} />
}

function BrowserFrame({ hostname, initialUrl, className }: WebBrowserProps) {
  const startUrl = useMemo(() => (initialUrl ? normalize(initialUrl) : undefined), [initialUrl])
  const st = useBrowserState(hostname, startUrl)
  const tab = st.tabs.find((t) => t.id === st.activeId) ?? st.tabs[0]
  const epExists = useStore((s) => !!getEndpoint(s.world, hostname))
  const updateWorld = useStore((s) => s.updateWorld)
  const omniRef = useRef<HTMLInputElement>(null)

  // Endpunkt lazy erzeugen
  useEffect(() => {
    if (!epExists)
      updateWorld((w) => {
        ensureEndpoint(w, hostname)
      })
  }, [epExists, hostname, updateWorld])

  // Ausstehende Ladevorgänge anstoßen (erster Aufruf, Rückkehr ins Modul)
  useEffect(() => {
    ensureLoading(hostname)
  }, [hostname])

  // Neue Start-URL → neuer Tab
  useEffect(() => {
    if (!startUrl || getBrowserState(hostname).lastInitial === startUrl) return
    setLastInitial(hostname, startUrl)
    openTab(hostname, startUrl)
  }, [hostname, startUrl])

  const go = (raw: string) => {
    const url = normalize(raw)
    if (url) navigateTab(hostname, tab.id, url)
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r')) {
      e.preventDefault()
      reloadTab(hostname, tab.id)
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
      e.preventDefault()
      omniRef.current?.focus()
    } else if (e.altKey && e.key === 'ArrowLeft') {
      e.preventDefault()
      goBack(hostname, tab.id)
    } else if (e.altKey && e.key === 'ArrowRight') {
      e.preventDefault()
      goForward(hostname, tab.id)
    }
  }

  return (
    <div className={cx('@container flex h-full min-h-0 flex-col overflow-hidden bg-white text-slate-800', className)} onKeyDown={onKeyDown}>
      <style>{'@keyframes hdbLoad{0%{transform:translateX(-100%)}100%{transform:translateX(260%)}}'}</style>
      <TabStrip hostname={hostname} tabs={st.tabs} activeId={tab.id} />
      <Toolbar hostname={hostname} tab={tab} onGo={go} omniRef={omniRef} />
      <BookmarkBar onOpen={(url, newTab) => (newTab ? openTab(hostname, url) : navigateTab(hostname, tab.id, url))} />
      <div className="relative min-h-0 flex-1 border-t border-slate-200">
        {tab.loading && (
          <div className="absolute inset-x-0 top-0 z-20 h-0.5 overflow-hidden bg-sky-100">
            <div className="h-full w-1/3 bg-sky-500 animate-[hdbLoad_1s_ease-in-out_infinite]" />
          </div>
        )}
        <div className={cx('@container absolute inset-0 overflow-auto bg-white transition-opacity', tab.loading && tab.result && 'opacity-60')}>
          {tab.result ? (
            <PageContent key={`${tab.id}:${tab.seq}`} hostname={hostname} tab={tab} result={tab.result} />
          ) : (
            <div className="flex h-full items-center justify-center text-slate-400">
              <LoaderCircle className="animate-spin" size={28} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────── Tabs ───────────────

function TabIcon({ tab }: { tab: Tab }) {
  if (tab.loading) return <LoaderCircle size={14} className="shrink-0 animate-spin text-sky-600" />
  const r = tab.result
  if (!r || r.kind === 'newtab') return <Globe size={14} className="shrink-0 text-slate-400" />
  if (r.kind === 'cert') return <ShieldAlert size={14} className="shrink-0 text-rose-600" />
  if (r.kind !== 'page' || !r.route) return <CircleAlert size={14} className="shrink-0 text-slate-400" />
  const meta = SITE_META[r.route.site]
  const Icon = meta.icon
  return <Icon size={14} className={cx('shrink-0', meta.color)} />
}

function TabStrip({ hostname, tabs, activeId }: { hostname: string; tabs: Tab[]; activeId: string }) {
  return (
    <div className="flex items-end gap-0.5 overflow-x-auto bg-slate-200 px-1.5 pt-1.5">
      {tabs.map((t) => (
        <div
          key={t.id}
          role="tab"
          aria-selected={t.id === activeId}
          tabIndex={0}
          title={t.title}
          onClick={() => activateTab(hostname, t.id)}
          onAuxClick={(e) => e.button === 1 && closeTab(hostname, t.id)}
          onKeyDown={(e) => e.key === 'Enter' && activateTab(hostname, t.id)}
          className={cx(
            'group flex h-8 min-w-[5.5rem] max-w-[13rem] flex-1 cursor-default items-center gap-1.5 rounded-t-lg px-2.5 text-xs select-none',
            t.id === activeId ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:bg-slate-100/70',
          )}
        >
          <TabIcon tab={t} />
          <span className="min-w-0 flex-1 truncate">{t.title || 'Neuer Tab'}</span>
          <button
            type="button"
            title="Tab schließen"
            aria-label="Tab schließen"
            onClick={(e) => {
              e.stopPropagation()
              closeTab(hostname, t.id)
            }}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200 hover:text-slate-800"
          >
            <X size={12} />
          </button>
        </div>
      ))}
      <button type="button" title="Neuer Tab" aria-label="Neuer Tab" onClick={() => openTab(hostname, NEWTAB_URL)} className="mb-0.5 ml-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-600 hover:bg-slate-300/70">
        <Plus size={16} />
      </button>
    </div>
  )
}

// ─────────────── Symbolleiste & Adressleiste ───────────────

const toolBtn = 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 disabled:opacity-35 disabled:hover:bg-transparent'

function Toolbar({ hostname, tab, onGo, omniRef }: { hostname: string; tab: Tab; onGo: (raw: string) => void; omniRef: RefObject<HTMLInputElement | null> }) {
  const viaProxy = !!tab.result?.http?.viaProxy
  return (
    <div className="flex items-center gap-1 bg-white px-1.5 py-1">
      <button type="button" className={toolBtn} title="Zurück (Alt+←)" disabled={tab.index === 0} onClick={() => goBack(hostname, tab.id)}>
        <ArrowLeft size={17} />
      </button>
      <button type="button" className={toolBtn} title="Vor (Alt+→)" disabled={tab.index >= tab.history.length - 1} onClick={() => goForward(hostname, tab.id)}>
        <ArrowRight size={17} />
      </button>
      {tab.loading ? (
        <button type="button" className={toolBtn} title="Laden abbrechen" onClick={() => stopTab(hostname, tab.id)}>
          <X size={17} />
        </button>
      ) : (
        <button type="button" className={toolBtn} title="Neu laden (F5)" onClick={() => reloadTab(hostname, tab.id)}>
          <RotateCw size={16} />
        </button>
      )}
      <button type="button" className={cx(toolBtn, 'hidden @sm:inline-flex')} title="Startseite" onClick={() => navigateTab(hostname, tab.id, HOME_URL)}>
        <House size={16} />
      </button>
      <Omnibox tab={tab} onGo={onGo} inputRef={omniRef} />
      <div className="hidden shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-600 @2xl:flex" title="Der Browser nutzt Netzwerk, Proxy und hosts-Datei dieses Rechners">
        <Monitor size={12} /> {hostname}
        {viaProxy && <span className="text-slate-400">· Proxy</span>}
      </div>
    </div>
  )
}

function SecurityIndicator({ tab }: { tab: Tab }) {
  const [open, setOpen] = useState(false)
  const url = tab.history[tab.index]
  const r = tab.result
  if (tab.loading || !r || r.kind === 'newtab' || url.startsWith('about:')) return <Search size={14} className="ml-1 shrink-0 text-slate-400" />
  const https = url.startsWith('https:')
  const danger = r.kind === 'cert' || !!r.insecure
  const host = hostOf(url)
  const label = danger ? 'Nicht sicher' : https ? '' : r.kind === 'page' ? 'Nicht sicher' : ''
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Informationen zur Verbindung"
        className={cx('flex h-6 items-center gap-1 rounded-full px-1.5 text-[11px] font-medium hover:bg-slate-200', danger ? 'text-rose-600' : 'text-slate-600')}
      >
        {danger ? <LockOpen size={14} /> : https ? <Lock size={13} /> : <Info size={14} />}
        {label && <span className="hidden @md:inline">{label}</span>}
      </button>
      {open && (
        <div className="absolute left-0 top-8 z-30 w-72 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700 shadow-xl" onMouseLeave={() => setOpen(false)}>
          <div className="mb-1 font-semibold text-slate-900">{host}</div>
          {danger ? (
            <p className="text-rose-700">Die Verbindung ist nicht sicher. Das Zertifikat bzw. der antwortende Server passt nicht zu dieser Adresse. Geben Sie hier keine vertraulichen Daten ein.</p>
          ) : https ? (
            <p>Die Verbindung ist verschlüsselt. Zertifikat ausgestellt für „{host}“ (Musterwerk Test-CA). Hinweis: Auch Betrugsseiten können ein gültiges Zertifikat haben – prüfen Sie immer die Adresse!</p>
          ) : (
            <p>Die Verbindung zu dieser Website ist nicht verschlüsselt (http). Im Firmennetz für interne Seiten üblich – im Internet keine Kennwörter eingeben.</p>
          )}
          {r.http?.ip && (
            <div className="mt-2 border-t border-slate-100 pt-2 font-mono text-[11px] text-slate-500">
              Server-IP: {r.http.ip}
              {r.http.viaProxy && ' (über Proxy)'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Omnibox({ tab, onGo, inputRef }: { tab: Tab; onGo: (raw: string) => void; inputRef: RefObject<HTMLInputElement | null> }) {
  const current = tab.history[tab.index]
  const [edit, setEdit] = useState<string | null>(null)
  const value = edit ?? displayUrl(current)
  return (
    <form
      className="flex h-8 min-w-0 flex-1 items-center gap-1 rounded-full bg-slate-100 pl-1 pr-3 focus-within:bg-white focus-within:ring-2 focus-within:ring-sky-400"
      onSubmit={(e) => {
        e.preventDefault()
        onGo(value)
        setEdit(null)
        inputRef.current?.blur()
      }}
    >
      <SecurityIndicator tab={tab} />
      <input
        ref={inputRef}
        value={value}
        spellCheck={false}
        autoComplete="off"
        aria-label="Adresse und Suchleiste"
        placeholder="Suchbegriff oder Adresse eingeben"
        onFocus={(e) => {
          setEdit(displayUrl(current))
          const el = e.currentTarget
          requestAnimationFrame(() => el.select())
        }}
        onBlur={() => setEdit(null)}
        onChange={(e) => setEdit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setEdit(null)
            e.currentTarget.blur()
          }
        }}
        className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-slate-800 placeholder:text-slate-400 focus:outline-none"
      />
    </form>
  )
}

function BookmarkBar({ onOpen }: { onOpen: (url: string, newTab: boolean) => void }) {
  return (
    <div className="flex items-center gap-0.5 overflow-x-auto bg-white px-2 pb-1 text-xs">
      {BOOKMARKS.map((b) => {
        const meta = SITE_META[b.site]
        const Icon = meta.icon
        return (
          <button
            key={b.url}
            type="button"
            title={b.url}
            onClick={(e) => onOpen(b.url, e.ctrlKey || e.metaKey)}
            onAuxClick={(e) => e.button === 1 && onOpen(b.url, true)}
            className="flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2 text-slate-700 hover:bg-slate-100"
          >
            <Icon size={13} className={meta.color} />
            <span className="whitespace-nowrap">{b.label}</span>
          </button>
        )
      })}
    </div>
  )
}

// ─────────────── Seiteninhalt ───────────────

function useApi(hostname: string, tabId: string, href: string): PageApi {
  return useMemo(() => {
    const url = parseUrl(href) ?? new URL('http://invalid/')
    let path = url.pathname
    try {
      path = decodeURIComponent(path)
    } catch {
      /* roh verwenden */
    }
    path = path.replace(/\/+$/, '') || '/'
    const segments = path.split('/').filter(Boolean)
    return {
      hostname,
      href,
      url,
      host: url.hostname,
      path,
      segments,
      query: url.searchParams,
      q: (name: string) => url.searchParams.get(name) ?? '',
      navigate: (h, o) => {
        const target = resolveHref(href, h)
        if (o?.newTab) openTab(hostname, target)
        else navigateTab(hostname, tabId, target, { replace: o?.replace })
      },
      resolve: (h) => resolveHref(href, h),
      setTitle: (t) => setTabTitle(hostname, tabId, t),
      reload: () => reloadTab(hostname, tabId),
    }
  }, [hostname, tabId, href])
}

function PageContent({ hostname, tab, result }: { hostname: string; tab: Tab; result: LoadResult }) {
  const api = useApi(hostname, tab.id, result.url)
  switch (result.kind) {
    case 'newtab':
      return <NewTabPage api={api} hostname={hostname} />
    case 'bad-url':
      return <BadUrlPage url={result.url} />
    case 'no-endpoint':
      return <NoEndpointPage hostname={hostname} />
    case 'net-error':
      return <NetErrorPage result={result} api={api} />
    case 'cert':
      return (
        <CertWarningPage
          result={result}
          onBack={() => (tab.index > 0 ? goBack(hostname, tab.id) : navigateTab(hostname, tab.id, NEWTAB_URL, { replace: true }))}
          onProceed={() => {
            addCertException(hostname, api.host)
            reloadTab(hostname, tab.id)
          }}
        />
      )
    default:
      return result.route ? <SiteView route={result.route} api={api} /> : null
  }
}
