// Infrastruktur: Server & Netzwerk (Übersicht, DC-Sicherheitsprotokoll, DHCP, DNS, Dateiserver, Druck, Cloud-Sync, VPN)
// Direktaufruf: navigate('infra', { tab: 'dhcp' | 'dns' | 'security' | 'files' | 'print' | 'sync' | 'vpn', server?: 'DC01' })

import { Network } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useStore } from '@/core/store'
import { PageHeader, Tabs } from '@/ui'
import { DhcpPanel } from './Dhcp'
import { DnsPanel } from './Dns'
import { FileServerPanel } from './FileServer'
import { Overview, ServerDetail, type InfraTab } from './Overview'
import { PrintPanel } from './Print'
import { SecurityLog } from './SecurityLog'
import { SyncPanel, VpnPanel } from './SyncVpn'

const TABS: { id: InfraTab; label: string }[] = [
  { id: 'overview', label: 'Übersicht' },
  { id: 'security', label: 'DC-Sicherheitsprotokoll' },
  { id: 'dhcp', label: 'DHCP' },
  { id: 'dns', label: 'DNS' },
  { id: 'files', label: 'Dateiserver' },
  { id: 'print', label: 'Druckverwaltung' },
  { id: 'sync', label: 'Cloud-Sync' },
  { id: 'vpn', label: 'VPN-Gateway' },
]

const ALIASES: Record<string, InfraTab> = { events: 'security', sicherheit: 'security', ereignisse: 'security', fs: 'files', dateiserver: 'files', drucker: 'print', druck: 'print', cloud: 'sync' }

const toTab = (t?: string): InfraTab | undefined => (t ? (TABS.find((x) => x.id === t)?.id ?? ALIASES[t.toLowerCase()]) : undefined)

export function InfraView() {
  const params = useStore((s) => s.ui.params)
  const view = useStore((s) => s.ui.view)
  const [tab, setTab] = useState<InfraTab>(() => toTab(params.tab) ?? 'overview')
  const [server, setServer] = useState<string | null>(null)

  useEffect(() => {
    if (view !== 'infra') return
    const t = toTab(params.tab)
    if (t) setTab(t)
    if (params.server) setServer(params.server.toUpperCase())
  }, [params, view])

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50">
      <PageHeader icon={<Network size={20} />} title="Server & Netzwerk" subtitle="Infrastruktur der Musterwerk AG · Serverraum UG · Domäne musterwerk.local" />
      <div className="border-b border-slate-200 bg-white px-5">
        <Tabs tabs={TABS} value={tab} onChange={setTab} className="border-b-0" />
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-5">
        {tab === 'overview' && <Overview onOpenServer={setServer} onTab={setTab} />}
        {tab === 'security' && <SecurityLog />}
        {tab === 'dhcp' && <DhcpPanel initialScope={params.scope} />}
        {tab === 'dns' && <DnsPanel />}
        {tab === 'files' && <FileServerPanel />}
        {tab === 'print' && <PrintPanel />}
        {tab === 'sync' && <SyncPanel />}
        {tab === 'vpn' && <VpnPanel />}
      </div>
      {server && <ServerDetail name={server} onClose={() => setServer(null)} />}
    </div>
  )
}
