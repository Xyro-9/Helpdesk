// Einstellungen: Netzwerk-Status, Proxy, VPN, Datum & Uhrzeit, System-Info, Apps, Drucker.

import { AppWindow, Clock3, Globe, Info, Laptop, Network, Printer, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { A } from '@/core/actions'
import { findUser } from '@/core/ops/ad'
import { addEvent, connectVpn, disconnectVpn, getProxySettings, isServiceRunning, setProxySettings } from '@/core/ops/endpoint'
import { useStore } from '@/core/store'
import type { Endpoint } from '@/core/types'
import { cx } from '@/ui'
import { useDesk, useEp, useEpOps } from '../desk'
import { AppLoading, fmtDTShort, fmtUptime, WBtn, WCheck, WInput } from '../ui'
import { adapterStatus, NET_STATE_TEXT, netState } from './net'
import { AdapterDialogs, AdapterIcon } from './Network'
import { PrintersPanel } from './Printers'
import type { AppProps } from './types'

type Page = 'netzwerk' | 'proxy' | 'vpn' | 'zeit' | 'system' | 'apps' | 'drucker'

export function SettingsApp({ host, args }: AppProps) {
  const ep = useEp(host)
  if (!ep) return <AppLoading />
  return <Settings host={host} ep={ep} initial={(args.page as Page) || 'netzwerk'} />
}

function Settings({ host, ep, initial }: { host: string; ep: Endpoint; initial: Page }) {
  const [page, setPage] = useState<Page>(initial)
  useEffect(() => setPage(initial), [initial])
  const nav: { id: Page; label: string; icon: React.ReactNode }[] = [
    { id: 'system', label: 'System – Info', icon: <Laptop size={16} /> },
    { id: 'netzwerk', label: 'Netzwerk und Internet', icon: <Network size={16} /> },
    { id: 'proxy', label: 'Proxy', icon: <Globe size={16} /> },
    { id: 'vpn', label: 'VPN', icon: <ShieldCheck size={16} /> },
    { id: 'drucker', label: 'Drucker und Scanner', icon: <Printer size={16} /> },
    { id: 'apps', label: 'Installierte Apps', icon: <AppWindow size={16} /> },
    { id: 'zeit', label: 'Datum und Uhrzeit', icon: <Clock3 size={16} /> },
  ]
  const user = useStore((s) => (ep.loggedOnUser ? findUser(s.world, ep.loggedOnUser)?.displayName : undefined))
  return (
    <div className="flex h-full bg-[#f3f3f3] text-[12px]">
      <div className="w-56 shrink-0 overflow-auto p-3">
        <div className="mb-4 flex items-center gap-2 px-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#005fb8] text-[14px] font-semibold text-white">{(user ?? 'A').split(' ').map((x) => x[0]).join('').slice(0, 2)}</div>
          <div className="min-w-0">
            <div className="truncate font-semibold">{user ?? 'Kein Benutzer'}</div>
            <div className="truncate text-slate-500">Lokales Konto: MUSTERWERK\{ep.loggedOnUser ?? 'azubi'}</div>
          </div>
        </div>
        {nav.map((n) => (
          <button key={n.id} type="button" onClick={() => setPage(n.id)} className={cx('mb-0.5 flex w-full items-center gap-3 rounded-[4px] px-3 py-2 text-left', page === n.id ? 'bg-white font-medium shadow-sm' : 'hover:bg-white/60')}>
            <span className="text-[#005fb8]">{n.icon}</span>
            {n.label}
          </button>
        ))}
      </div>
      <div className="min-w-0 flex-1 overflow-auto p-5">
        {page === 'system' && <SystemPage ep={ep} />}
        {page === 'netzwerk' && <NetPage host={host} ep={ep} go={setPage} />}
        {page === 'proxy' && <ProxyPage host={host} ep={ep} />}
        {page === 'vpn' && <VpnPage host={host} ep={ep} />}
        {page === 'zeit' && <TimePage host={host} ep={ep} />}
        {page === 'apps' && <AppsPage ep={ep} />}
        {page === 'drucker' && (
          <>
            <H>Drucker und Scanner</H>
            <PrintersPanel host={host} ep={ep} />
          </>
        )}
      </div>
    </div>
  )
}

const H = ({ children }: { children: React.ReactNode }) => <h2 className="mb-4 text-[22px] font-semibold text-slate-900">{children}</h2>
const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={cx('mb-2 rounded-[6px] border border-[#e5e5e5] bg-white p-4', className)}>{children}</div>

export function systemRows(ep: Endpoint): [string, string][] {
  return [
    ['Gerätename', ep.hostname],
    ['Vollständiger Name', `${ep.hostname.toLowerCase()}.musterwerk.local`],
    ['Domäne', ep.domainJoined ? 'musterwerk.local' : 'Arbeitsgruppe WORKGROUP'],
    ['Hersteller', ep.manufacturer],
    ['Modell', ep.model],
    ['Seriennummer', ep.serial],
    ['Inventarnummer', ep.assetTag ?? '–'],
    ['Prozessor', ep.cpu],
    ['Installierter RAM', `${ep.ramGb},0 GB`],
    ['Systemtyp', '64-Bit-Betriebssystem, x64-basierter Prozessor'],
    ['Edition', ep.os],
    ['Version/Build', ep.osBuild],
    ['Letzter Start', fmtDTShort(ep.lastBoot)],
    ['Betriebszeit', fmtUptime(ep.lastBoot)],
    ['Angemeldeter Benutzer', ep.loggedOnUser ? `MUSTERWERK\\${ep.loggedOnUser}` : '–'],
    ['Gruppenrichtlinien zuletzt angewendet', fmtDTShort(ep.gpo.lastApplied)],
    ['Neustart ausstehend', ep.pendingReboot ? 'Ja' : 'Nein'],
  ]
}

function SystemPage({ ep }: { ep: Endpoint }) {
  return (
    <>
      <H>System › Info</H>
      <Card>
        <div className="mb-3 flex items-center gap-3">
          <Laptop size={36} className="text-[#005fb8]" strokeWidth={1.3} />
          <div>
            <div className="text-[16px] font-semibold">{ep.hostname}</div>
            <div className="text-slate-500">{ep.model}</div>
          </div>
        </div>
        <div className="grid grid-cols-[220px_1fr] gap-y-1.5">
          {systemRows(ep).map(([k, v]) => (
            <div key={k} className="contents">
              <span className="text-slate-600">{k}</span>
              <span className={cx('select-text', k === 'Neustart ausstehend' && v === 'Ja' && 'font-semibold text-amber-700')}>{v}</span>
            </div>
          ))}
        </div>
      </Card>
    </>
  )
}

function NetPage({ host, ep, go }: { host: string; ep: Endpoint; go: (p: Page) => void }) {
  const desk = useDesk()
  const state = useStore((s) => {
    const e = s.world.endpoints[host]
    return e ? netState(s.world, e) : 'none'
  })
  const [dlg, setDlg] = useState<{ kind: 'status' | 'props' | 'ipv4' | 'diag' | 'details'; adapter: string } | null>(null)
  return (
    <>
      <H>Netzwerk und Internet</H>
      <Card className="flex items-center gap-4">
        <Network size={40} className={cx(state === 'ok' ? 'text-[#005fb8]' : 'text-amber-600')} strokeWidth={1.3} />
        <div>
          <div className="text-[15px] font-semibold">{NET_STATE_TEXT[state]}</div>
          <div className="text-slate-500">Netzwerkstatus von {ep.hostname}</div>
        </div>
      </Card>
      {ep.adapters.map((a) => (
        <Card key={a.name} className="flex items-center gap-3">
          <AdapterIcon a={a} size={24} />
          <div className="min-w-0 flex-1">
            <div className="font-medium">{a.name}</div>
            <div className="text-slate-500">
              {adapterStatus(a).text}
              {a.enabled && a.mediaConnected && a.ip ? ` · IPv4 ${a.ip}` : ''}
            </div>
          </div>
          {a.kind === 'VPN' ? (
            <WBtn onClick={() => go('vpn')}>VPN-Einstellungen</WBtn>
          ) : (
            <>
              <WBtn disabled={!a.enabled} onClick={() => setDlg({ kind: 'status', adapter: a.name })}>
                Eigenschaften
              </WBtn>
              <WBtn onClick={() => setDlg({ kind: 'ipv4', adapter: a.name })}>IP-Zuweisung bearbeiten</WBtn>
            </>
          )}
        </Card>
      ))}
      <Card className="flex flex-wrap gap-2">
        <WBtn onClick={() => desk.openApp('ncpa')}>Weitere Netzwerkadapteroptionen (ncpa.cpl)</WBtn>
        <WBtn onClick={() => go('proxy')}>Proxy</WBtn>
        {ep.adapters[0] && <WBtn onClick={() => setDlg({ kind: 'diag', adapter: (ep.adapters.find((a) => a.enabled && a.mediaConnected && a.kind !== 'VPN') ?? ep.adapters[0]).name })}>Netzwerkproblembehandlung</WBtn>}
      </Card>
      <AdapterDialogs host={host} ep={ep} dlg={dlg} setDlg={setDlg} />
    </>
  )
}

function ProxyPage({ host, ep }: { host: string; ep: Endpoint }) {
  const ops = useEpOps(host)
  const desk = useDesk()
  const cur = getProxySettings(ep)
  const [enabled, setEnabled] = useState(cur.enabled)
  const [addr, setAddr] = useState(cur.server.split(':')[0] ?? '')
  const [port, setPort] = useState(cur.server.split(':')[1] ?? '')
  const [bypass, setBypass] = useState(cur.bypass.replace(/;?<local>/i, ''))
  const [local, setLocal] = useState(/<local>/i.test(cur.bypass))
  const save = () => {
    if (enabled && (!addr.trim() || !/^\d{1,5}$/.test(port))) {
      void desk.alert('Bitte eine gültige Proxyadresse und einen Port (1–65535) angeben.', { title: 'Proxy', icon: 'error' })
      return
    }
    const server = addr.trim() ? `${addr.trim()}${port ? ':' + port : ''}` : ''
    const bp = [bypass.trim().replace(/;$/, ''), local ? '<local>' : ''].filter(Boolean).join(';')
    ops.mutate((e) => setProxySettings(e, { enabled, server, bypass: bp }), { type: A.networkChanged, detail: `Proxy ${enabled ? 'Ein' : 'Aus'}: ${server || '–'}; Ausnahmen: ${bp || '–'}` })
    useStore.getState().toast('Proxyeinstellungen gespeichert.', 'success')
  }
  return (
    <>
      <H>Netzwerk und Internet › Proxy</H>
      <Card>
        <div className="mb-1 font-semibold">Automatische Proxyeinrichtung</div>
        <div className="text-slate-600">Einstellungen automatisch erkennen: Aus{cur.autoConfigUrl ? ` · Setupskript: ${cur.autoConfigUrl}` : ''}</div>
      </Card>
      <Card>
        <div className="mb-3 font-semibold">Manuelle Proxyeinrichtung</div>
        <div className="mb-3">
          <WCheck label="Proxyserver verwenden" checked={enabled} onChange={setEnabled} />
        </div>
        <div className="mb-3 grid max-w-xl grid-cols-[1fr_100px] gap-2">
          <label>
            <span className="mb-1 block text-slate-600">Proxy-IP-Adresse</span>
            <WInput value={addr} onChange={(e) => setAddr(e.target.value)} disabled={!enabled} />
          </label>
          <label>
            <span className="mb-1 block text-slate-600">Port</span>
            <WInput value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))} disabled={!enabled} />
          </label>
        </div>
        <label className="mb-3 block max-w-xl">
          <span className="mb-1 block text-slate-600">Proxyserver nicht für Adressen verwenden, die wie folgt beginnen (Einträge mit Semikolon trennen):</span>
          <WInput value={bypass} onChange={(e) => setBypass(e.target.value)} disabled={!enabled} />
        </label>
        <div className="mb-4">
          <WCheck label="Proxyserver nicht für lokale (Intranet-)Adressen verwenden" checked={local} onChange={setLocal} disabled={!enabled} />
        </div>
        <WBtn primary onClick={save}>
          Speichern
        </WBtn>
      </Card>
    </>
  )
}

function VpnPage({ host, ep }: { host: string; ep: Endpoint }) {
  const ops = useEpOps(host)
  const desk = useDesk()
  const [busy, setBusy] = useState(false)
  if (!ep.vpn.installed)
    return (
      <>
        <H>Netzwerk und Internet › VPN</H>
        <Card>Auf diesem Gerät ist kein VPN-Client installiert.</Card>
      </>
    )
  const connect = async () => {
    setBusy(true)
    await new Promise((r) => setTimeout(r, 1200))
    setBusy(false)
    ops.run((e, w) => connectVpn(w, e), { type: A.networkChanged, detail: 'VPN verbunden' }, { errorTitle: 'SecureLink VPN', errorPrefix: 'Die Verbindung mit "MW-Firmennetz" konnte nicht hergestellt werden.' })
  }
  const disconnect = async () => {
    const ok = await desk.confirm('VPN-Verbindung "MW-Firmennetz" trennen?\n\nHinweis: Wird die Remotesitzung über das VPN geführt, wird sie dabei getrennt.', { title: 'SecureLink VPN', icon: 'warning', ok: 'Trennen', cancel: 'Abbrechen' })
    if (ok) ops.mutate((e, w) => disconnectVpn(w, e), { type: A.networkChanged, detail: 'VPN getrennt' })
  }
  return (
    <>
      <H>Netzwerk und Internet › VPN</H>
      <Card className="flex items-center gap-4">
        <ShieldCheck size={36} className={ep.vpn.connected ? 'text-emerald-600' : 'text-slate-400'} strokeWidth={1.4} />
        <div className="flex-1">
          <div className="text-[14px] font-semibold">{ep.vpn.profile}</div>
          <div className="text-slate-500">SecureLink VPN · vpn.musterwerk.example · {busy ? 'Verbindung wird hergestellt …' : ep.vpn.connected ? 'Verbunden' : 'Getrennt'}</div>
          {ep.vpn.lastError && !ep.vpn.connected && <div className="mt-1 text-rose-700">Letzter Fehler: {ep.vpn.lastError}</div>}
        </div>
        {ep.vpn.connected ? (
          <WBtn onClick={() => void disconnect()}>Trennen</WBtn>
        ) : (
          <WBtn primary disabled={busy} onClick={() => void connect()}>
            Verbinden
          </WBtn>
        )}
      </Card>
      <Card>
        <div className="grid grid-cols-[180px_1fr] gap-y-1">
          <span className="text-slate-600">Dienst SecureLinkVPN</span>
          <span>{isServiceRunning(ep, 'SecureLinkVPN') ? 'Wird ausgeführt' : 'Beendet'}</span>
          <span className="text-slate-600">Tunnel-IP</span>
          <span>{ep.adapters.find((a) => a.kind === 'VPN')?.ip || '–'}</span>
          <span className="text-slate-600">Authentifizierung</span>
          <span>Domänenkonto + Gerätezertifikat</span>
        </div>
      </Card>
    </>
  )
}

function TimePage({ host, ep }: { host: string; ep: Endpoint }) {
  const ops = useEpOps(host)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const local = new Date(now + ep.timeOffsetMin * 60000)
  const sync = () =>
    ops.run(
      (e) => {
        if (!isServiceRunning(e, 'W32Time')) return 'Die Uhrzeit konnte nicht synchronisiert werden.\n\nDer Dienst wurde nicht gestartet. (0x80070426) – Dienst "Windows-Zeitgeber" (W32Time) prüfen.'
        e.timeOffsetMin = 0
        addEvent(e, { log: 'System', eventId: 35, level: 'Informationen', source: 'Microsoft-Windows-Time-Service', message: 'Der Zeitdienst synchronisiert jetzt die Systemzeit mit der Zeitquelle dc01.musterwerk.local (ntp.d|10.10.0.10:123).' })
        return null
      },
      { type: A.command, detail: 'w32tm /resync (Einstellungen: Jetzt synchronisieren)' },
      { errorTitle: 'Datum und Uhrzeit' },
    ) && useStore.getState().toast('Uhrzeit wurde synchronisiert.', 'success')
  const off = ep.timeOffsetMin
  return (
    <>
      <H>Zeit und Sprache › Datum und Uhrzeit</H>
      <Card>
        <div className="text-[32px] font-light">{local.toLocaleTimeString('de-DE')}</div>
        <div className="text-slate-600">{local.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</div>
      </Card>
      <Card>
        <div className="grid grid-cols-[240px_1fr] gap-y-2">
          <span>Uhrzeit automatisch festlegen</span>
          <span>Ein</span>
          <span>Zeitzone</span>
          <span>{ep.timeZone}</span>
          <span>Zeitquelle</span>
          <span>dc01.musterwerk.local (Domänenhierarchie, NT5DS)</span>
          <span>Abweichung zur Domänenzeit</span>
          <span className={cx(Math.abs(off) > 5 ? 'font-semibold text-rose-700' : off !== 0 ? 'text-amber-700' : 'text-emerald-700')}>
            {off === 0 ? 'keine' : `${off > 0 ? '+' : ''}${off} Minuten`}
            {Math.abs(off) > 5 && ' – Kerberos-Anmeldungen schlagen fehl (max. 5 Min.)'}
          </span>
        </div>
      </Card>
      <Card className="flex items-center justify-between">
        <div>
          <div className="font-medium">Uhr jetzt synchronisieren</div>
          <div className="text-slate-500">Zeitserver: dc01.musterwerk.local</div>
        </div>
        <WBtn onClick={() => void sync()}>Jetzt synchronisieren</WBtn>
      </Card>
    </>
  )
}

function AppsPage({ ep }: { ep: Endpoint }) {
  const [q, setQ] = useState('')
  const list = ep.installedApps.filter((a) => !q || a.name.toLowerCase().includes(q.toLowerCase()))
  return (
    <>
      <H>Apps › Installierte Apps</H>
      <WInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Apps durchsuchen" className="mb-3 max-w-sm" />
      {list.map((a) => (
        <Card key={a.name} className="flex items-center gap-3 py-2.5">
          <AppWindow size={20} className="text-slate-500" />
          <div className="flex-1">
            <div className="font-medium">{a.name}</div>
            <div className="text-slate-500">
              {a.version} | {a.publisher} | {a.installed}
            </div>
          </div>
          <span className="text-slate-600">{a.sizeMb >= 1024 ? `${(a.sizeMb / 1024).toLocaleString('de-DE', { maximumFractionDigits: 1 })} GB` : `${a.sizeMb} MB`}</span>
        </Card>
      ))}
    </>
  )
}

export function MsinfoApp({ host }: AppProps) {
  const ep = useEp(host)
  if (!ep) return <AppLoading />
  return (
    <div className="flex h-full text-[12px]">
      <div className="w-44 shrink-0 border-r border-[#e5e5e5] p-2">
        <div className="flex items-center gap-1.5 rounded bg-[#cce4f7] px-1.5 py-1">
          <Info size={13} /> Systemübersicht
        </div>
      </div>
      <div className="min-w-0 flex-1 overflow-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-[#f7f7f7]">
              <th className="px-2 py-1 font-normal text-slate-600">Element</th>
              <th className="px-2 py-1 font-normal text-slate-600">Wert</th>
            </tr>
          </thead>
          <tbody>
            {[['Betriebssystemname', ep.os] as [string, string], ['Systemname', ep.hostname] as [string, string], ...systemRows(ep).slice(2), ['BIOS-Modus', 'UEFI'] as [string, string], ['Sicherer Start', 'Ein'] as [string, string]].map(([k, v]) => (
              <tr key={k} className="border-t border-[#f0f0f0]">
                <td className="px-2 py-0.5">{k}</td>
                <td className="px-2 py-0.5 select-text">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
