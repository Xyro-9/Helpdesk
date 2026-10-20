// Fehlerseiten des simulierten Browsers: Netzwerkfehler, Zertifikatswarnung, verdächtige Seite, neuer Tab.

import { CircleX, FileWarning, Gift, Globe, Monitor, Search, ServerCrash, ShieldAlert, Unplug, WifiOff } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { HttpErrorCode, HttpResult } from '@/core/sim/network'
import { cx } from '@/ui'
import { BOOKMARKS, SITE_META } from './router'
import type { LoadResult, PageApi } from './types'
import { hostOf, searchUrl } from './url'

interface ErrInfo {
  title: string
  icon: ReactNode
  text: (host: string, r: HttpResult) => ReactNode
  hints: (host: string, r: HttpResult) => ReactNode[]
}

const C = ({ children }: { children: ReactNode }) => <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.85em] text-slate-800">{children}</code>

const ERRORS: Record<HttpErrorCode, ErrInfo> = {
  ERR_INTERNET_DISCONNECTED: {
    title: 'Keine Internetverbindung',
    icon: <WifiOff size={44} />,
    text: () => 'Der Rechner hat keine aktive Netzwerkverbindung.',
    hints: () => [
      'Netzwerkkabel bzw. WLAN-Verbindung prüfen',
      'Ist der Netzwerkadapter aktiviert? (Netzwerkverbindungen „ncpa.cpl“ bzw. Geräte-Manager)',
      <>
        IP-Konfiguration anzeigen: <C>ipconfig /all</C>
      </>,
    ],
  },
  DNS_PROBE_FINISHED_NXDOMAIN: {
    title: 'Die Website ist nicht erreichbar',
    icon: <Search size={44} />,
    text: (host) => (
      <>
        Die Server-IP-Adresse von <strong>{host}</strong> wurde nicht gefunden.
      </>
    ),
    hints: (host) => [
      'Schreibweise der Adresse prüfen',
      <>
        Namensauflösung testen: <C>nslookup {host}</C>
      </>,
      <>
        Eingetragene DNS-Server prüfen (<C>ipconfig /all</C>) – im Firmennetz sind das die Domänencontroller
      </>,
      <>
        DNS-Cache leeren: <C>ipconfig /flushdns</C>
      </>,
      <>
        hosts-Datei prüfen: <C>C:\Windows\System32\drivers\etc\hosts</C>
      </>,
    ],
  },
  DNS_PROBE_FINISHED_NO_INTERNET: {
    title: 'Keine Internetverbindung',
    icon: <Globe size={44} />,
    text: (host) => (
      <>
        Die DNS-Abfrage für <strong>{host}</strong> ist fehlgeschlagen – es besteht offenbar keine Verbindung ins Internet.
      </>
    ),
    hints: () => [
      <>
        Standardgateway prüfen: <C>ipconfig</C>, danach <C>ping &lt;Gateway&gt;</C>
      </>,
      <>
        Externe Erreichbarkeit testen: <C>ping 8.8.8.8</C> bzw. <C>tracert</C>
      </>,
      'DNS-Server und Weiterleitungen prüfen (nslookup)',
      'IT-Statusseite auf bekannte Störungen prüfen',
    ],
  },
  ERR_CONNECTION_TIMED_OUT: {
    title: 'Die Website ist nicht erreichbar',
    icon: <ServerCrash size={44} />,
    text: (host) => (
      <>
        <strong>{host}</strong> hat zu lange gebraucht, um zu antworten.
      </>
    ),
    hints: (host) => [
      <>
        Verbindung prüfen: <C>ping {host}</C> und <C>tracert {host}</C>
      </>,
      'Ist der Zielserver bzw. Dienst online? (IT-Status, Infrastruktur)',
      'Im Homeoffice: Ist das VPN verbunden? Interne Seiten sind nur über VPN erreichbar.',
      'Stimmt das Standardgateway? Ist die Internetanbindung gestört?',
    ],
  },
  ERR_PROXY_CONNECTION_FAILED: {
    title: 'Keine Verbindung zum Proxyserver',
    icon: <Unplug size={44} />,
    text: (_h, r) => <>Es kann keine Verbindung zum Proxyserver hergestellt werden. {r.detail && <span className="block pt-1 text-slate-500">{r.detail}</span>}</>,
    hints: () => [
      'Proxy-Einstellungen prüfen: Einstellungen → Netzwerk und Internet → Proxy bzw. Internetoptionen → Verbindungen → LAN-Einstellungen',
      'Wird ein Proxy verwendet, obwohl keiner nötig ist? Stimmen Servername und Port?',
      <>
        Registry: <C>HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings</C> (ProxyEnable, ProxyServer, ProxyOverride)
      </>,
      'Ist der Proxyserver selbst erreichbar (ping / IT-Status)?',
    ],
  },
  ERR_CONNECTION_REFUSED: {
    title: 'Die Website ist nicht erreichbar',
    icon: <CircleX size={44} />,
    text: (host) => (
      <>
        <strong>{host}</strong> hat die Verbindung abgelehnt.
      </>
    ),
    hints: (host) => [
      'Läuft auf dem Zielgerät überhaupt ein Webdienst? Stimmen Adresse und Port?',
      <>
        Zeigt der Name auf die richtige IP-Adresse? <C>nslookup {host}</C>, hosts-Datei
      </>,
      'Wurde die IP-Adresse des Geräts geändert?',
    ],
  },
  ERR_ADDRESS_UNREACHABLE: {
    title: 'Die Website ist nicht erreichbar',
    icon: <FileWarning size={44} />,
    text: (host, r) => (
      <>
        Die Adresse {r.ip ? <strong>{r.ip}</strong> : <strong>{host}</strong>} ist nicht erreichbar.
      </>
    ),
    hints: () => [
      'Hat der Rechner eine gültige IP-Adresse? 169.254.x.x (APIPA) bedeutet: Es wurde kein DHCP-Server erreicht.',
      <>
        Adresse neu anfordern: <C>ipconfig /release</C> und <C>ipconfig /renew</C>
      </>,
      'Ist ein Standardgateway eingetragen?',
    ],
  },
}

export function NetErrorPage({ result, api }: { result: LoadResult; api: Pick<PageApi, 'reload'> }) {
  const [details, setDetails] = useState(false)
  const http = result.http!
  const code = http.error ?? 'ERR_CONNECTION_REFUSED'
  const info = ERRORS[code]
  const host = http.host || hostOf(result.url)
  return (
    <div className="mx-auto max-w-2xl px-6 py-10 @lg:py-16">
      <div className="text-slate-400">{info.icon}</div>
      <h1 className="mt-4 text-xl font-semibold text-slate-800 @lg:text-2xl">{info.title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-700">{info.text(host, http)}</p>
      <div className="mt-5 text-sm text-slate-700">
        <div className="font-medium">Diagnose – versuchen Sie Folgendes:</div>
        <ul className="mt-1.5 list-disc space-y-1 pl-5 leading-relaxed">
          {info.hints(host, http).map((h, i) => (
            <li key={i}>{h}</li>
          ))}
        </ul>
      </div>
      <div className="mt-4 font-mono text-xs uppercase tracking-wide text-slate-500">{code}</div>
      <div className="mt-6 flex flex-wrap gap-2">
        <button type="button" className="rounded-md bg-sky-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-sky-700" onClick={api.reload}>
          Neu laden
        </button>
        <button type="button" className="rounded-md px-3 py-1.5 text-sm text-sky-700 hover:bg-sky-50" onClick={() => setDetails((d) => !d)}>
          {details ? 'Details ausblenden' : 'Details'}
        </button>
      </div>
      {details && (
        <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-600">
          <div>URL: {result.url}</div>
          <div>Host: {host}</div>
          {http.ip && <div>Aufgelöste IP: {http.ip}</div>}
          <div>Über Proxy: {http.viaProxy ? 'ja' : 'nein'}</div>
          {http.detail && <div className="mt-1 whitespace-pre-wrap">Meldung: {http.detail}</div>}
        </div>
      )}
    </div>
  )
}

export function CertWarningPage({ result, onBack, onProceed }: { result: LoadResult; onBack: () => void; onProceed: () => void }) {
  const [adv, setAdv] = useState(false)
  const host = result.http?.host || hostOf(result.url)
  return (
    <div className="min-h-full bg-rose-50/40">
      <div className="mx-auto max-w-2xl px-6 py-10 @lg:py-16">
        <ShieldAlert size={48} className="text-rose-600" />
        <h1 className="mt-4 text-xl font-semibold text-slate-800 @lg:text-2xl">Die Verbindung ist nicht privat</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">
          Unbefugte könnten versuchen, Ihre Daten von <strong>{host}</strong> zu stehlen (zum Beispiel Kennwörter, Nachrichten oder Kreditkartendaten).
        </p>
        <p className="mt-2 text-sm font-medium text-slate-700">Zertifikat gilt für einen anderen Namen.</p>
        <div className="mt-3 font-mono text-xs text-slate-500">NET::ERR_CERT_COMMON_NAME_INVALID</div>
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <button type="button" className="rounded-md bg-sky-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-sky-700" onClick={onBack}>
            Zurück zur sicheren Seite
          </button>
          <button type="button" className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-white" onClick={() => setAdv((a) => !a)}>
            {adv ? 'Erweitert ausblenden' : 'Erweitert'}
          </button>
        </div>
        {adv && (
          <div className="mt-5 space-y-3 rounded-md border border-rose-200 bg-white p-4 text-sm leading-relaxed text-slate-700">
            <p>
              Der Server konnte nicht beweisen, dass er <strong>{host}</strong> ist. Sein Sicherheitszertifikat stammt von{' '}
              <strong className="font-mono">{result.servedHost ?? 'einem unbekannten Server'}</strong>
              {result.http?.ip && (
                <>
                  {' '}
                  (Antwort von IP <span className="font-mono">{result.http.ip}</span>)
                </>
              )}
              .
            </p>
            <p>Mögliche Ursachen: manipulierte Namensauflösung (hosts-Datei, falscher DNS-Server), ein falsch konfigurierter Server oder ein Angreifer, der die Verbindung abfängt.</p>
            <div className="rounded bg-slate-50 p-2 text-xs text-slate-600">
              Diagnose: <C>nslookup {host}</C> und <C>ping {host}</C> – stimmt die IP-Adresse? hosts-Datei prüfen: <C>C:\Windows\System32\drivers\etc\hosts</C>
            </div>
            <button type="button" className="text-sm text-slate-500 underline hover:text-rose-700" onClick={onProceed}>
              Weiter zu {host} (unsicher)
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/** Fremde Seite bei manipulierter Namensauflösung (http, unbekannter Zielserver) */
export function SuspiciousPage({ api }: { api: PageApi }) {
  const [blocked, setBlocked] = useState(false)
  return (
    <div className="min-h-full bg-gradient-to-b from-yellow-200 via-amber-100 to-white px-4 py-8 text-center">
      <div className="mx-auto max-w-xl">
        <div className="animate-pulse text-3xl font-black tracking-tight text-red-600 @lg:text-4xl">HERZLICHEN GLÜCKWUNSCH!</div>
        <p className="mt-3 text-lg font-semibold text-slate-800">Sie sind der 1.000.000. Besucher von {api.host}!</p>
        <Gift size={72} className="mx-auto my-6 text-fuchsia-600" />
        <p className="text-sm text-slate-700">Sie wurden zufällig ausgewählt und können jetzt ein brandneues Smartphone gewinnen. Nur noch 2 Geräte verfügbar!</p>
        <button type="button" className="mt-6 rounded-full bg-green-600 px-8 py-3 text-lg font-bold text-white shadow-lg hover:bg-green-700" onClick={() => setBlocked(true)}>
          JETZT GEWINN ABHOLEN »
        </button>
        {blocked && (
          <div className="mx-auto mt-4 max-w-md rounded-md border border-slate-300 bg-white p-3 text-left text-sm text-slate-700 shadow">
            <strong>Download blockiert:</strong> „Gewinn_Abholung.exe“ ist möglicherweise schädlich und wurde blockiert.
          </div>
        )}
        <p className="mt-10 text-[11px] text-slate-500">Teilnahme ab 18. Es gelten die Teilnahmebedingungen. Kein Zusammenhang mit {api.host}.</p>
      </div>
    </div>
  )
}

export function NewTabPage({ api, hostname }: { api: Pick<PageApi, 'navigate'>; hostname: string }) {
  const [q, setQ] = useState('')
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-6 py-14">
      <div className="flex items-center gap-2 text-3xl font-semibold text-slate-700">
        <Search className="text-violet-600" size={30} /> Suche
      </div>
      <form
        className="mt-6 flex w-full"
        onSubmit={(e) => {
          e.preventDefault()
          if (q.trim()) api.navigate(searchUrl(q))
        }}
      >
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Im Web suchen oder Adresse eingeben"
          className="h-11 w-full rounded-full border border-slate-300 px-5 text-sm shadow-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
        />
      </form>
      <div className="mt-10 grid w-full grid-cols-2 gap-3 @md:grid-cols-4">
        {BOOKMARKS.map((b) => {
          const Icon = SITE_META[b.site].icon
          return (
            <button key={b.url} type="button" onClick={() => api.navigate(b.url)} className="flex flex-col items-center gap-2 rounded-lg p-3 text-xs text-slate-700 hover:bg-slate-100">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100">
                <Icon size={20} className={SITE_META[b.site].color} />
              </span>
              <span className="text-center leading-tight">{b.label}</span>
            </button>
          )
        })}
      </div>
      <div className="mt-10 flex items-center gap-1.5 text-xs text-slate-400">
        <Monitor size={13} /> Browser auf {hostname}
      </div>
    </div>
  )
}

export function BadUrlPage({ url }: { url: string }) {
  return (
    <div className="mx-auto max-w-xl px-6 py-14">
      <FileWarning size={44} className="text-slate-400" />
      <h1 className="mt-4 text-xl font-semibold text-slate-800">Diese Adresse kann nicht geöffnet werden</h1>
      <p className="mt-2 break-all text-sm text-slate-600">
        <span className="font-mono">{url}</span> verwendet ein nicht unterstütztes Protokoll. Im simulierten Browser werden nur <span className="font-mono">http://</span> und{' '}
        <span className="font-mono">https://</span> unterstützt.
      </p>
    </div>
  )
}

export function NoEndpointPage({ hostname }: { hostname: string }) {
  return (
    <div className="mx-auto max-w-xl px-6 py-14">
      <Monitor size={44} className="text-slate-400" />
      <h1 className="mt-4 text-xl font-semibold text-slate-800">Browser auf {hostname} nicht verfügbar</h1>
      <p className="mt-2 text-sm text-slate-600">Für diesen Rechner gibt es in der Simulation keine Netzwerkumgebung (z. B. Server oder unbekannter Computer).</p>
    </div>
  )
}

/** Erreichbarer Host ohne eingerichtete Website */
export function GenericHostPage({ api }: { api: PageApi }) {
  return (
    <div className={cx('mx-auto max-w-xl px-6 py-14')}>
      <Globe size={44} className="text-slate-400" />
      <h1 className="mt-4 text-xl font-semibold text-slate-800">Diese Seite ist nicht verfügbar</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        Der Server <strong>{api.host}</strong> ist erreichbar, liefert unter dieser Adresse aber keine Website aus.
      </p>
      <div className="mt-6 rounded-md border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-600">
        HTTP-Fehler 404.0 – Not Found
        <br />
        Die gesuchte Ressource wurde entfernt, umbenannt oder ist vorübergehend nicht verfügbar.
      </div>
    </div>
  )
}
