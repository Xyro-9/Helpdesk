// Netzwerkverbindungen (ncpa.cpl): Adapterkacheln, Aktivieren/Deaktivieren, Status, Details,
// Eigenschaften → IPv4-Eigenschaften, Diagnose.

import { Cable, CircleCheck, CircleX, Network, ShieldCheck, Wifi, WifiOff } from 'lucide-react'
import { useState } from 'react'
import { A } from '@/core/actions'
import { renewDhcp } from '@/core/sim/network'
import type { Endpoint, NetAdapter } from '@/core/types'
import { isApipa, isValidIp, maskToPrefix, sameSubnet } from '@/core/util'
import { cx } from '@/ui'
import { useDesk, useEp, useEpOps } from '../desk'
import { AppLoading, ContextMenu, Group, ProgressDialog, StatusBar, ToolBar, ToolBtn, useContextMenu, WBtn, WCheck, WDialog, WInput, WRadio, fmtUptime, type MenuItem } from '../ui'
import { adapterStatus, diagnose, isValidMask, type DiagItem } from './net'
import { delay, type AppProps } from './types'
import { useStore } from '@/core/store'

export function NcpaApp({ host }: AppProps) {
  const ep = useEp(host)
  if (!ep) return <AppLoading />
  return <Ncpa host={host} ep={ep} />
}

export function AdapterIcon({ a, size = 34 }: { a: NetAdapter; size?: number }) {
  const st = adapterStatus(a)
  const Icon = a.kind === 'WLAN' ? (st.up ? Wifi : WifiOff) : a.kind === 'VPN' ? ShieldCheck : Cable
  return (
    <span className="relative inline-flex">
      <Icon size={size} className={cx(a.enabled ? 'text-[#005fb8]' : 'text-slate-400')} strokeWidth={1.4} />
      {!st.up && <CircleX size={size * 0.38} className="absolute -right-1 -bottom-1 fill-rose-600 text-white" />}
    </span>
  )
}

/** Adapter aktivieren/deaktivieren (inkl. Gerätestatus & DHCP beim Aktivieren) */
export function useAdapterToggle(host: string) {
  const ops = useEpOps(host)
  const desk = useDesk()
  return async (a: NetAdapter, enable: boolean) => {
    if (!enable) {
      const ok = await desk.confirm(`Möchten Sie "${a.name}" wirklich deaktivieren?\n\nHinweis: Läuft die Remotesitzung über diesen Adapter, wird die Verbindung getrennt.`, { title: 'Netzwerkverbindungen', icon: 'warning', ok: 'Ja', cancel: 'Nein' })
      if (!ok) return
    }
    ops.mutate(
      (e, w) => {
        const x = e.adapters.find((y) => y.name === a.name)
        if (!x) return
        x.enabled = enable
        const dev = e.devices.find((d) => d.name === x.description)
        if (dev && (dev.status === 'OK' || dev.status === 'Deaktiviert')) {
          dev.status = enable ? 'OK' : 'Deaktiviert'
          dev.errorCode = enable ? undefined : 22
        }
        if (enable && x.dhcp && x.mediaConnected && x.kind !== 'VPN') renewDhcp(w, e, x)
      },
      { type: A.networkChanged, detail: `Adapter "${a.name}" ${enable ? 'aktiviert' : 'deaktiviert'}` },
    )
  }
}

type Dlg = { kind: 'status' | 'props' | 'ipv4' | 'diag' | 'details'; adapter: string } | null

function Ncpa({ host, ep }: { host: string; ep: Endpoint }) {
  const desk = useDesk()
  const toggle = useAdapterToggle(host)
  const [sel, setSel] = useState<string | null>(null)
  const [dlg, setDlg] = useState<Dlg>(null)
  const ctx = useContextMenu<string>()
  const a = ep.adapters.find((x) => x.name === sel)

  const menu = (x: NetAdapter): MenuItem[] => [
    x.enabled ? { label: 'Deaktivieren', onClick: () => void toggle(x, false) } : { label: 'Aktivieren', bold: true, onClick: () => void toggle(x, true) },
    ...(x.kind === 'VPN' ? [{ label: x.mediaConnected ? 'Trennen' : 'Verbinden', onClick: () => desk.openApp('settings', { page: 'vpn' }) }] : []),
    { label: 'Status', bold: x.enabled, disabled: !x.enabled, onClick: () => setDlg({ kind: 'status', adapter: x.name }) },
    { label: 'Diagnose', onClick: () => setDlg({ kind: 'diag', adapter: x.name }) },
    { sep: true },
    { label: 'Umbenennen', disabled: true },
    { label: 'Eigenschaften', onClick: () => setDlg({ kind: 'props', adapter: x.name }) },
  ]

  return (
    <div className="flex h-full flex-col text-[12px]">
      <div className="flex items-center gap-1 border-b border-[#e5e5e5] bg-white px-2 py-1.5 text-slate-600">
        <Network size={14} /> Systemsteuerung › Netzwerk und Internet › <span className="text-slate-900">Netzwerkverbindungen</span>
      </div>
      <ToolBar>
        <ToolBtn icon={<span />} label="Organisieren ▾" />
        {a && (
          <>
            <ToolBtn icon={<span />} label={a.enabled ? 'Netzwerkgerät deaktivieren' : 'Netzwerkgerät aktivieren'} onClick={() => void toggle(a, !a.enabled)} />
            <ToolBtn icon={<span />} label="Verbindung diagnostizieren" onClick={() => setDlg({ kind: 'diag', adapter: a.name })} />
            <ToolBtn icon={<span />} label="Status anzeigen" disabled={!a.enabled} onClick={() => setDlg({ kind: 'status', adapter: a.name })} />
            <ToolBtn icon={<span />} label="Einstellungen ändern" onClick={() => setDlg({ kind: 'props', adapter: a.name })} />
          </>
        )}
      </ToolBar>
      <div className="min-h-0 flex-1 overflow-auto bg-white p-3" onClick={() => setSel(null)}>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2">
          {ep.adapters.map((x) => {
            const st = adapterStatus(x)
            return (
              <div
                key={x.name}
                className={cx('flex cursor-default items-center gap-3 rounded-[4px] border p-2 select-none', sel === x.name ? 'border-[#99c9ef] bg-[#cce4f7]' : 'border-transparent hover:bg-[#e5f1fb]')}
                onClick={(e) => {
                  e.stopPropagation()
                  setSel(x.name)
                }}
                onDoubleClick={() => (x.kind === 'VPN' ? desk.openApp('settings', { page: 'vpn' }) : x.enabled ? setDlg({ kind: 'status', adapter: x.name }) : void toggle(x, true))}
                onContextMenu={(e) => {
                  setSel(x.name)
                  ctx.open(e, x.name)
                }}
              >
                <AdapterIcon a={x} />
                <div className="min-w-0">
                  <div className="truncate font-medium text-slate-900">{x.name}</div>
                  <div className={cx('truncate', st.up ? 'text-slate-600' : 'text-slate-500')}>{st.text}</div>
                  <div className="truncate text-slate-500">{x.description}</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <StatusBar>
        {ep.adapters.length} Elemente{a ? ' | 1 Element ausgewählt' : ''}
      </StatusBar>
      {ctx.menu &&
        (() => {
          const x = ep.adapters.find((y) => y.name === ctx.menu!.data)
          return x ? <ContextMenu x={ctx.menu.x} y={ctx.menu.y} onClose={ctx.close} items={menu(x)} /> : null
        })()}
      <AdapterDialogs host={host} ep={ep} dlg={dlg} setDlg={setDlg} />
    </div>
  )
}

/** Alle Adapter-Dialoge (auch von den Einstellungen genutzt) */
export function AdapterDialogs({ host, ep, dlg, setDlg }: { host: string; ep: Endpoint; dlg: Dlg; setDlg: (d: Dlg) => void }) {
  const a = dlg ? ep.adapters.find((x) => x.name === dlg.adapter) : undefined
  if (!dlg || !a) return null
  const close = () => setDlg(null)
  if (dlg.kind === 'status') return <StatusDialog host={host} ep={ep} a={a} onClose={close} open={(k) => setDlg({ kind: k, adapter: a.name })} />
  if (dlg.kind === 'details') return <DetailsDialog a={a} onClose={() => setDlg({ kind: 'status', adapter: a.name })} />
  if (dlg.kind === 'props') return <PropsDialog a={a} onClose={close} onIpv4={() => setDlg({ kind: 'ipv4', adapter: a.name })} />
  if (dlg.kind === 'ipv4') return <Ipv4Dialog host={host} a={a} onClose={() => setDlg({ kind: 'props', adapter: a.name })} onDone={close} />
  return <DiagDialog host={host} ep={ep} a={a} onClose={close} />
}

function StatusDialog({ host, ep, a, onClose, open }: { host: string; ep: Endpoint; a: NetAdapter; onClose: () => void; open: (k: 'details' | 'props' | 'diag') => void }) {
  const toggle = useAdapterToggle(host)
  const st = adapterStatus(a)
  const ipOk = a.ip && !isApipa(a.ip) && a.ip !== '0.0.0.0'
  return (
    <WDialog title={`Status von ${a.name}`} onClose={onClose} width={380} footer={<WBtn onClick={onClose}>Schließen</WBtn>}>
      <Group title="Verbindung">
        <div className="grid grid-cols-[150px_1fr] gap-y-1">
          <span>IPv4-Konnektivität:</span>
          <span>{!a.mediaConnected ? 'Kein Netzwerkzugriff' : ipOk ? (a.network === 'home' ? 'Internet' : 'Internet') : 'Kein Netzwerkzugriff'}</span>
          <span>IPv6-Konnektivität:</span>
          <span>Kein Netzwerkzugriff</span>
          <span>Medienstatus:</span>
          <span>{a.mediaConnected ? 'Aktiviert' : 'Medium getrennt'}</span>
          {a.ssid && (
            <>
              <span>SSID:</span>
              <span>{a.ssid}</span>
            </>
          )}
          <span>Dauer:</span>
          <span>{fmtUptime(ep.lastBoot)}</span>
          <span>Übertragungsrate:</span>
          <span>{a.speedMbps ? `${a.speedMbps >= 1000 ? `${a.speedMbps / 1000} GBit/s` : `${a.speedMbps} MBit/s`}` : '–'}</span>
          <span>Netzwerk:</span>
          <span>{st.text}</span>
        </div>
        <div className="mt-2">
          <WBtn onClick={() => open('details')}>Details…</WBtn>
        </div>
      </Group>
      <Group title="Aktivität" className="mt-3">
        <div className="grid grid-cols-3 text-center">
          <span />
          <span>Gesendet</span>
          <span>Empfangen</span>
          <span className="text-left">Bytes:</span>
          <span>{a.mediaConnected ? '48.213.554' : '0'}</span>
          <span>{a.mediaConnected ? '712.884.120' : '0'}</span>
        </div>
      </Group>
      <div className="mt-3 flex gap-2">
        <WBtn onClick={() => open('props')}>Eigenschaften</WBtn>
        <WBtn
          onClick={() => {
            onClose()
            void toggle(a, false)
          }}
        >
          Deaktivieren
        </WBtn>
        <WBtn onClick={() => open('diag')}>Diagnose</WBtn>
      </div>
    </WDialog>
  )
}

function DetailsDialog({ a, onClose }: { a: NetAdapter; onClose: () => void }) {
  const ipOk = !!a.ip && a.ip !== '0.0.0.0'
  const rows: [string, string][] = [
    ['Verbindungsspezifisches DNS-Suffix', a.network === 'home' ? 'fritz.box' : 'musterwerk.local'],
    ['Beschreibung', a.description],
    ['Physische Adresse', a.mac],
    ['DHCP aktiviert', a.dhcp ? 'Ja' : 'Nein'],
    ['IPv4-Adresse', ipOk ? a.ip : ''],
    ['IPv4-Subnetzmaske', ipOk ? a.mask : ''],
    ...(a.dhcp && ipOk && !isApipa(a.ip)
      ? ([
          ['Lease erhalten', new Date(Date.now() - 3600_000 * 5).toLocaleString('de-DE')],
          ['Lease läuft ab', new Date(Date.now() + 3600_000 * 24 * 7).toLocaleString('de-DE')],
        ] as [string, string][])
      : []),
    ['IPv4-Standardgateway', a.gateway],
    ['IPv4-DHCP-Server', a.dhcp && ipOk && !isApipa(a.ip) ? (a.network === 'home' ? '192.168.178.1' : '10.10.0.10') : ''],
    ['IPv4-DNS-Server', a.dnsServers.join('\n')],
    ['NetBIOS über TCP/IP aktiviert', 'Ja'],
  ]
  return (
    <WDialog title="Netzwerkverbindungsdetails" onClose={onClose} width={440} footer={<WBtn onClick={onClose}>Schließen</WBtn>}>
      <div className="mb-1">Netzwerkverbindungsdetails:</div>
      <table className="w-full border border-[#d0d0d0] text-[12px]">
        <thead>
          <tr className="bg-[#f6f6f6]">
            <th className="border-b border-[#e3e3e3] px-2 py-1 text-left font-normal">Eigenschaft</th>
            <th className="border-b border-[#e3e3e3] px-2 py-1 text-left font-normal">Wert</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} className="align-top">
              <td className="px-2 py-0.5">{k}</td>
              <td className="px-2 py-0.5 whitespace-pre-line select-text">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </WDialog>
  )
}

const COMPONENTS = [
  ['Client für Microsoft-Netzwerke', true],
  ['Datei- und Druckerfreigabe für Microsoft-Netzwerke', true],
  ['QoS-Paketplaner', true],
  ['Internetprotokoll, Version 4 (TCP/IPv4)', true],
  ['Microsoft-Multiplexorprotokoll für Netzwerkadapter', false],
  ['Microsoft-LLDP-Treiber', true],
  ['Internetprotokoll, Version 6 (TCP/IPv6)', true],
  ['Antwort für Verbindungsschicht-Topologieerkennung', true],
] as const

function PropsDialog({ a, onClose, onIpv4 }: { a: NetAdapter; onClose: () => void; onIpv4: () => void }) {
  const [sel, setSel] = useState(3)
  return (
    <WDialog title={`Eigenschaften von ${a.name}`} onClose={onClose} width={400} footer={<><WBtn primary onClick={onClose}>OK</WBtn><WBtn onClick={onClose}>Abbrechen</WBtn></>}>
      <div className="mb-1">Verbindung herstellen über:</div>
      <div className="mb-3 flex items-center gap-2 rounded-[4px] border border-[#d0d0d0] bg-[#fafafa] p-1.5">
        <AdapterIcon a={a} size={18} />
        {a.description}
      </div>
      <div className="mb-1">Diese Verbindung verwendet folgende Elemente:</div>
      <div className="mb-2 h-40 overflow-auto rounded-[4px] border border-[#d0d0d0]">
        {COMPONENTS.map(([name, on], i) => (
          <div key={name} className={cx('flex cursor-default items-center gap-2 px-1.5 py-0.5', sel === i ? 'bg-[#cce4f7]' : 'hover:bg-[#e5f1fb]')} onClick={() => setSel(i)} onDoubleClick={() => i === 3 && onIpv4()}>
            <input type="checkbox" checked={on} readOnly className="accent-[#005fb8]" />
            {name}
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <WBtn disabled>Installieren…</WBtn>
        <WBtn disabled>Deinstallieren</WBtn>
        <WBtn disabled={sel !== 3} onClick={onIpv4}>
          Eigenschaften
        </WBtn>
      </div>
      <Group title="Beschreibung" className="mt-2">
        <p className="text-slate-600">{sel === 3 ? 'TCP/IP, das Standardprotokoll für WAN-Netzwerke, das den Datenaustausch über verschiedene, miteinander verbundene Netzwerke ermöglicht.' : 'Ermöglicht den Zugriff auf Ressourcen im Netzwerk.'}</p>
      </Group>
    </WDialog>
  )
}

function Ipv4Dialog({ host, a, onClose, onDone }: { host: string; a: NetAdapter; onClose: () => void; onDone: () => void }) {
  const ops = useEpOps(host)
  const desk = useDesk()
  const [auto, setAuto] = useState(a.dhcp)
  const [ip, setIp] = useState(a.dhcp ? '' : a.ip)
  const [mask, setMask] = useState(a.dhcp ? '' : a.mask)
  const [gw, setGw] = useState(a.dhcp ? '' : a.gateway)
  const [dnsAuto, setDnsAuto] = useState(a.dhcp && a.dnsFromDhcp)
  const [dns1, setDns1] = useState(a.dnsFromDhcp ? '' : (a.dnsServers[0] ?? ''))
  const [dns2, setDns2] = useState(a.dnsFromDhcp ? '' : (a.dnsServers[1] ?? ''))

  const ok = async () => {
    const bad = (t: string) => desk.alert(t, { title: 'Microsoft TCP/IP', icon: 'error' })
    if (!auto) {
      if (!isValidIp(ip)) return void bad(`"${ip || '(leer)'}" ist keine gültige IP-Adresse.`)
      if (!isValidMask(mask)) return void bad('Die Subnetzmaske ist ungültig. Geben Sie eine gültige Subnetzmaske ein.')
      if (gw && !isValidIp(gw)) return void bad(`"${gw}" ist kein gültiges Standardgateway.`)
      if (gw && !sameSubnet(ip, gw, mask)) {
        const go = await desk.confirm('Das Standardgateway befindet sich nicht im selben Netzwerksegment (Subnetz), das durch die IP-Adresse und die Subnetzmaske definiert ist. Möchten Sie diese Konfiguration speichern?', { title: 'Microsoft TCP/IP', icon: 'warning', ok: 'Ja', cancel: 'Nein' })
        if (!go) return
      }
    }
    if (!dnsAuto || !auto) {
      if (dns1 && !isValidIp(dns1)) return void bad(`"${dns1}" ist keine gültige DNS-Serveradresse.`)
      if (dns2 && !isValidIp(dns2)) return void bad(`"${dns2}" ist keine gültige DNS-Serveradresse.`)
    }
    const useDnsAuto = auto && dnsAuto
    const dns = [dns1, dns2].filter(Boolean)
    const detail = `${a.name}: ${auto ? 'IPv4 automatisch (DHCP)' : `statisch ${ip}/${maskToPrefix(mask)} GW ${gw || '–'}`}, DNS ${useDnsAuto ? 'automatisch' : dns.join(', ') || '–'}`
    let renewMsg = ''
    ops.mutate(
      (e, w) => {
        const x = e.adapters.find((y) => y.name === a.name)
        if (!x) return
        const wasDhcp = x.dhcp
        x.dhcp = auto
        x.dnsFromDhcp = useDnsAuto
        if (!auto) {
          x.ip = ip
          x.mask = mask
          x.gateway = gw
        }
        if (!useDnsAuto) x.dnsServers = dns
        if (auto && (!wasDhcp || useDnsAuto) && x.enabled && x.mediaConnected && x.kind !== 'VPN') {
          const r = renewDhcp(w, e, x)
          if (!r.ok) renewMsg = r.message
        }
      },
      { type: A.networkChanged, detail },
    )
    if (renewMsg) useStore.getState().toast(`${host}: ${renewMsg}`, 'warning')
    onDone()
  }

  const field = (v: string, set: (s: string) => void, disabled: boolean) => <WInput value={v} onChange={(e) => set(e.target.value.replace(/[^\d.]/g, ''))} disabled={disabled} className="w-40 font-mono" />
  return (
    <WDialog
      title="Eigenschaften von Internetprotokoll, Version 4 (TCP/IPv4)"
      onClose={onClose}
      width={420}
      footer={
        <>
          <WBtn primary onClick={() => void ok()}>
            OK
          </WBtn>
          <WBtn onClick={onClose}>Abbrechen</WBtn>
        </>
      }
    >
      <p className="mb-3 text-slate-600">IP-Einstellungen können automatisch zugewiesen werden, wenn das Netzwerk diese Funktion unterstützt. Wenden Sie sich andernfalls an den Netzwerkadministrator, um die geeigneten IP-Einstellungen zu beziehen.</p>
      <div className="mb-1">
        <WRadio
          name="ipmode"
          label="IP-Adresse automatisch beziehen"
          checked={auto}
          onChange={() => {
            setAuto(true)
          }}
        />
      </div>
      <Group
        title={
          <WRadio
            name="ipmode"
            label="Folgende IP-Adresse verwenden:"
            checked={!auto}
            onChange={() => {
              setAuto(false)
              setDnsAuto(false)
            }}
          />
        }
      >
        <div className="grid grid-cols-[1fr_auto] items-center gap-1.5 pt-1">
          <span className={cx(auto && 'text-slate-400')}>IP-Adresse:</span>
          {field(ip, setIp, auto)}
          <span className={cx(auto && 'text-slate-400')}>Subnetzmaske:</span>
          {field(mask, setMask, auto)}
          <span className={cx(auto && 'text-slate-400')}>Standardgateway:</span>
          {field(gw, setGw, auto)}
        </div>
      </Group>
      <div className="mt-3 mb-1">
        <WRadio name="dnsmode" label="DNS-Serveradresse automatisch beziehen" checked={dnsAuto} disabled={!auto} onChange={() => setDnsAuto(true)} />
      </div>
      <Group title={<WRadio name="dnsmode" label="Folgende DNS-Serveradressen verwenden:" checked={!dnsAuto} onChange={() => setDnsAuto(false)} />}>
        <div className="grid grid-cols-[1fr_auto] items-center gap-1.5 pt-1">
          <span className={cx(dnsAuto && 'text-slate-400')}>Bevorzugter DNS-Server:</span>
          {field(dns1, setDns1, dnsAuto)}
          <span className={cx(dnsAuto && 'text-slate-400')}>Alternativer DNS-Server:</span>
          {field(dns2, setDns2, dnsAuto)}
        </div>
      </Group>
      <div className="mt-3 flex items-center justify-between">
        <WCheck label="Einstellungen beim Beenden überprüfen" checked={false} onChange={() => {}} />
        <WBtn disabled>Erweitert…</WBtn>
      </div>
    </WDialog>
  )
}

function DiagDialog({ host, ep, a, onClose }: { host: string; ep: Endpoint; a: NetAdapter; onClose: () => void }) {
  const toggle = useAdapterToggle(host)
  const ops = useEpOps(host)
  const [phase, setPhase] = useState<'run' | 'done'>('run')
  const [items, setItems] = useState<DiagItem[]>([])
  const [started, setStarted] = useState(false)
  if (!started) {
    setStarted(true)
    void delay(1300).then(() => {
      const w = useStore.getState().world
      const cur = w.endpoints[host]
      const ad = cur?.adapters.find((x) => x.name === a.name)
      setItems(cur && ad ? diagnose(w, cur, ad) : [])
      setPhase('done')
    })
  }
  const problems = items.filter((i) => !i.ok)
  const fix = async (it: DiagItem) => {
    if (it.fix === 'enable') await toggle(a, true)
    if (it.fix === 'renew')
      ops.run((e, w) => {
        const x = e.adapters.find((y) => y.name === a.name)
        if (!x) return 'Adapter nicht gefunden.'
        const r = renewDhcp(w, e, x)
        return r.ok ? null : r.message
      }, { type: A.networkChanged, detail: `${a.name}: DHCP-Lease erneuert (Diagnose)` }, { errorTitle: 'Windows-Netzwerkdiagnose' })
    onClose()
  }
  return (
    <WDialog title="Windows-Netzwerkdiagnose" onClose={onClose} width={480} footer={<WBtn onClick={onClose}>Schließen</WBtn>}>
      {phase === 'run' ? (
        <ProgressInline text={`Probleme mit "${a.name}" werden ermittelt …`} />
      ) : (
        <div>
          <div className="mb-2 text-[14px] font-semibold">{problems.length ? 'Die Problembehandlung hat Probleme erkannt' : 'Es wurden keine Probleme erkannt'}</div>
          <div className="space-y-1.5">
            {items.map((it, i) => (
              <div key={i} className="flex items-start gap-2">
                {it.ok ? <CircleCheck size={16} className="mt-0.5 shrink-0 text-emerald-600" /> : <CircleX size={16} className="mt-0.5 shrink-0 fill-rose-600 text-white" />}
                <span className="flex-1">{it.text}</span>
                {it.fix && (
                  <WBtn small onClick={() => void fix(it)}>
                    {it.fix === 'enable' ? 'Adapter aktivieren' : 'Reparatur versuchen'}
                  </WBtn>
                )}
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-slate-500">Diagnose ausgeführt auf {ep.hostname} – Ergebnis gilt für den aktuellen Zustand.</p>
        </div>
      )}
    </WDialog>
  )
}

function ProgressInline({ text }: { text: string }) {
  return (
    <div>
      <p className="mb-3">{text}</p>
      <div className="h-2 overflow-hidden rounded-full bg-[#e5e5e5]">
        <div className="h-full w-1/3 animate-pulse rounded-full bg-[#005fb8]" />
      </div>
    </div>
  )
}

export { ProgressDialog }
