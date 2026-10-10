// E-Mail-Client (Mini): Kontostatus aus ep.outlook, Cloud-Lizenz, Anmeldesperre, Postfachgröße, Verbindung.

import { CircleCheck, CircleX, Inbox, Mail, TriangleAlert } from 'lucide-react'
import { findCloudUser } from '@/core/ops/cloud'
import { useStore } from '@/core/store'
import { connectivity } from '@/core/sim/network'
import { useShallow } from 'zustand/react/shallow'
import { useEp } from '../desk'
import { AppLoading } from '../ui'
import type { AppProps } from './types'

export function OutlookApp({ host }: AppProps) {
  const ep = useEp(host)
  const info = useStore(
    useShallow((s) => {
      const e = s.world.endpoints[host]
      const cu = e?.loggedOnUser ? findCloudUser(s.world, e.loggedOnUser) : undefined
      const sku = cu?.licenses.map((l) => s.world.cloud.skus.find((k) => k.id === l)?.name ?? l).join(', ') ?? ''
      return {
        upn: cu?.upn ?? '',
        licensed: !!cu && cu.licenses.length > 0,
        sku,
        blocked: !!cu?.signInBlocked,
        hasMailbox: !!cu?.mailbox,
        size: cu?.mailbox?.sizeGb ?? 0,
        quota: cu?.mailbox?.quotaGb ?? 0,
        online: e ? connectivity(s.world, e).internet : false,
      }
    }),
  )
  if (!ep) return <AppLoading />
  if (!ep.loggedOnUser) return <div className="p-4 text-[12px]">Kein Benutzer angemeldet – kein E-Mail-Profil vorhanden.</div>
  const problems: string[] = []
  if (!info.upn) problems.push('Für den Benutzer existiert kein Cloud-Konto (Synchronisierung prüfen).')
  else {
    if (!info.licensed) problems.push('Nicht lizenziert – Produktaktivierung fehlgeschlagen. Dem Konto ist keine Cloud-Office-Lizenz zugewiesen.')
    if (info.blocked) problems.push('Die Anmeldung für dieses Konto ist blockiert.')
    if (!info.hasMailbox && info.licensed) problems.push('Für das Konto wurde kein Postfach gefunden.')
  }
  if (!ep.outlook.configured) problems.push(`Profil nicht konfiguriert${ep.outlook.lastError ? `: ${ep.outlook.lastError}` : '.'}`)
  else if (ep.outlook.lastError) problems.push(ep.outlook.lastError)
  if (!info.online) problems.push('Getrennt – keine Verbindung zum E-Mail-Server (mail.cloudadmin.example).')
  const pct = info.quota ? Math.round((info.size / info.quota) * 100) : 0
  if (pct >= 90) problems.push(`Postfach fast voll (${pct} % von ${info.quota} GB) – Senden/Empfangen kann fehlschlagen.`)
  const ok = problems.length === 0
  return (
    <div className="flex h-full flex-col text-[12px]">
      <div className="flex items-center gap-2 bg-[#0f6cbd] px-3 py-2 text-white">
        <Mail size={16} /> E-Mail – {info.upn || ep.loggedOnUser}
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="w-44 shrink-0 border-r border-[#eee] p-2">
          {['Posteingang', 'Entwürfe', 'Gesendete Elemente', 'Gelöschte Elemente', 'Archiv'].map((f, i) => (
            <div key={f} className={i === 0 ? 'flex items-center gap-2 rounded bg-[#e5f1fb] px-2 py-1 font-medium' : 'flex items-center gap-2 px-2 py-1'}>
              {i === 0 && <Inbox size={13} />}
              {f}
            </div>
          ))}
        </div>
        <div className="min-w-0 flex-1 overflow-auto p-4">
          <div className={ok ? 'mb-3 flex items-center gap-2 text-emerald-700' : 'mb-3 flex items-center gap-2 font-semibold text-rose-700'}>
            {ok ? <CircleCheck size={18} /> : <CircleX size={18} className="fill-rose-600 text-white" />}
            {ok ? 'Verbunden – Alle Ordner sind auf dem neuesten Stand.' : 'Es gibt Probleme mit diesem Konto'}
          </div>
          {problems.map((p) => (
            <div key={p} className="mb-1.5 flex items-start gap-2 rounded border border-amber-200 bg-amber-50 p-2">
              <TriangleAlert size={14} className="mt-0.5 shrink-0 text-amber-600" />
              {p}
            </div>
          ))}
          <div className="mt-4 grid max-w-md grid-cols-[150px_1fr] gap-y-1">
            <span className="text-slate-500">Konto</span>
            <span>{info.upn || '–'}</span>
            <span className="text-slate-500">Lizenz</span>
            <span>{info.licensed ? info.sku : 'Keine'}</span>
            <span className="text-slate-500">Postfachgröße</span>
            <span>{info.quota ? `${info.size.toLocaleString('de-DE')} von ${info.quota} GB (${pct} %)` : '–'}</span>
            <span className="text-slate-500">Verbindungsstatus</span>
            <span>{info.online ? 'Online' : 'Offline'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
