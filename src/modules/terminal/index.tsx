// Admin-PowerShell auf dem Azubi-Arbeitsplatz IT-ADM-01 (ActiveDirectory-Modul + PowerShell-Remoting)

import { useEffect, useState } from 'react'
import { BookOpen, Copy, SquareTerminal } from 'lucide-react'
import { ensureEndpoint, getEndpoint } from '@/core/ops/endpoint'
import { useStore } from '@/core/store'
import { Button, PageHeader } from '@/ui'
import { TerminalApp } from './TerminalApp'
import { ADMIN_WORKSTATION } from './interpreter'

export { TerminalApp } from './TerminalApp'

const EXAMPLES: { group: string; items: [string, string][] }[] = [
  {
    group: 'Konten',
    items: [
      ['Get-ADUser l.schulz -Properties LockedOut,PasswordExpired,LastBadPasswordAttempt', 'Kontostatus prüfen'],
      ['Search-ADAccount -LockedOut | ft Name,SamAccountName', 'Gesperrte Konten'],
      ['Unlock-ADAccount -Identity l.schulz', 'Konto entsperren'],
      ['Set-ADAccountPassword -Identity l.schulz -Reset -NewPassword (ConvertTo-SecureString "Neu!Kennwort26" -AsPlainText -Force)', 'Kennwort zurücksetzen'],
      ['Set-ADUser l.schulz -ChangePasswordAtLogon $true', 'Änderung bei Anmeldung erzwingen'],
    ],
  },
  {
    group: 'Gruppen',
    items: [
      ['Get-ADPrincipalGroupMembership p.braun | ft Name', 'Gruppen eines Benutzers'],
      ['Add-ADGroupMember -Identity GG_VPN_Benutzer -Members p.braun', 'Mitglied hinzufügen'],
      ['Get-ADGroupMember GG_IT_Helpdesk', 'Mitglieder anzeigen'],
    ],
  },
  {
    group: 'Clients & Remoting',
    items: [
      ['Test-NetConnection PC-VT-004 -Port 5985', 'WinRM erreichbar?'],
      ['Enter-PSSession -ComputerName PC-VT-004', 'Remotesitzung öffnen'],
      ['Invoke-Command -ComputerName PC-VT-004 -ScriptBlock { Get-Service Spooler }', 'Befehl remote ausführen'],
      ['Get-WinEvent -ComputerName DC01 -FilterHashtable @{LogName="Security"; Id=4740} -MaxEvents 5', 'Sperrquelle (Ereignis 4740)'],
      ['Start-ADSyncSyncCycle -PolicyType Delta', 'Cloud-Sync anstoßen'],
    ],
  },
]

export function PowerShellView() {
  const updateWorld = useStore((s) => s.updateWorld)
  const toast = useStore((s) => s.toast)
  const exists = useStore((s) => !!getEndpoint(s.world, ADMIN_WORKSTATION))
  const [showHelp, setShowHelp] = useState(true)
  const [session, setSession] = useState(0)

  useEffect(() => {
    if (!exists) updateWorld((w) => void ensureEndpoint(w, ADMIN_WORKSTATION))
  }, [exists, updateWorld])

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast('Befehl in die Zwischenablage kopiert – mit Strg+V einfügen.', 'success')
    } catch {
      toast('Kopieren nicht möglich – bitte Text markieren und kopieren.', 'warning')
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        icon={<SquareTerminal size={18} />}
        title="Admin-PowerShell"
        subtitle={`${ADMIN_WORKSTATION} · angemeldet als MUSTERWERK\\azubi · ActiveDirectory-Modul und PowerShell-Remoting verfügbar`}
        actions={
          <>
            <Button size="sm" icon={<BookOpen size={14} />} onClick={() => setShowHelp((v) => !v)}>
              {showHelp ? 'Beispiele ausblenden' : 'Beispiele'}
            </Button>
            <Button size="sm" onClick={() => setSession((n) => n + 1)}>
              Neue Konsole
            </Button>
          </>
        }
      />
      <div className="flex min-h-0 flex-1 gap-3 p-3">
        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-lg border border-slate-300 shadow-sm">
          {exists && <TerminalApp key={session} hostname={ADMIN_WORKSTATION} shell="powershell" admin className="h-full w-full" />}
        </div>
        {showHelp && (
          <aside className="hidden w-80 shrink-0 overflow-auto rounded-lg border border-slate-200 bg-white p-3 text-sm lg:block">
            <p className="mb-3 text-xs text-slate-500">
              Typische Helpdesk-Befehle. <kbd className="rounded border px-1">help</kbd> zeigt alle unterstützten Befehle, <kbd className="rounded border px-1">Tab</kbd> vervollständigt Cmdlets, <kbd className="rounded border px-1">↑</kbd>/<kbd className="rounded border px-1">↓</kbd> blättert im Verlauf.
            </p>
            {EXAMPLES.map((g) => (
              <div key={g.group} className="mb-3">
                <h3 className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">{g.group}</h3>
                <ul className="space-y-1">
                  {g.items.map(([cmd, label]) => (
                    <li key={cmd} className="group rounded border border-slate-100 p-1.5 hover:border-sky-200 hover:bg-sky-50">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-slate-600">{label}</span>
                        <button type="button" title="Kopieren" onClick={() => copy(cmd)} className="text-slate-400 hover:text-sky-600">
                          <Copy size={13} />
                        </button>
                      </div>
                      <code className="block font-mono text-[11px] break-all text-slate-800">{cmd}</code>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <p className="text-xs text-slate-500">Hinweis: Kennwörter niemals ins Ticket schreiben. Gruppenänderungen wirken auf dem Client erst nach Ab-/Anmeldung bzw. „klist purge“.</p>
          </aside>
        )}
      </div>
    </div>
  )
}
