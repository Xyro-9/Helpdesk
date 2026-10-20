// Kleinere Seiten: Cloud-Dienststatus und VPN-Portal.

import { CircleCheck, CircleX, Cloud, Network } from 'lucide-react'
import { useStore } from '@/core/store'
import type { SiteProps } from '../SiteView'
import { Notice, useTitle } from '../shared'

export function CloudStatusSite({ api }: SiteProps) {
  useTitle(api, 'Cloud-Dienststatus')
  const services = ['Anmeldung & Verzeichnis', 'E-Mail', 'Chat & Besprechungen', 'Cloud-Speicher', 'Office im Browser', 'Admin Center']
  return (
    <div className="min-h-full bg-slate-50">
      <header className="flex items-center gap-2 bg-indigo-700 px-4 py-3 text-white">
        <Cloud size={20} /> <span className="font-semibold">Cloud-Dienststatus</span>
      </header>
      <main className="mx-auto max-w-3xl space-y-3 p-4">
        <Notice tone="success" title="Alle Dienste sind betriebsbereit">
          Stand: {new Date().toLocaleString('de-DE')}. Bei Problemen im eigenen Netz (Internet, Proxy, DNS) prüfen Sie bitte zuerst Ihre lokale Infrastruktur.
        </Notice>
        <div className="rounded-lg border border-slate-200 bg-white">
          {services.map((s) => (
            <div key={s} className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5 text-sm last:border-0">
              <CircleCheck size={16} className="text-emerald-600" /> {s}
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}

export function VpnSite({ api }: SiteProps) {
  useTitle(api, 'SecureLink VPN-Portal')
  const gw = useStore((s) => s.world.infra.vpnGateway)
  return (
    <div className="flex min-h-full items-center justify-center bg-slate-800 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <div className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <Network className="text-slate-700" /> SecureLink VPN-Portal
        </div>
        <p className="mt-1 text-xs text-slate-500">Musterwerk AG · {gw.host}</p>
        <div className="mt-4 flex items-center gap-2 text-sm">
          {gw.online ? <CircleCheck size={16} className="text-emerald-600" /> : <CircleX size={16} className="text-rose-600" />}
          Gateway-Status: <strong>{gw.online ? 'In Betrieb' : 'Nicht verfügbar'}</strong>
        </div>
        <p className="mt-4 text-sm text-slate-600">
          Die VPN-Verbindung wird ausschließlich über den installierten SecureLink-Client hergestellt. Berechtigt sind Mitglieder der Gruppe <span className="font-mono">{gw.allowedGroup}</span>.
        </p>
        <p className="mt-2 text-xs text-slate-500">Probleme bei der Einwahl? IT-Service-Desk, Durchwahl 999.</p>
      </div>
    </div>
  )
}
