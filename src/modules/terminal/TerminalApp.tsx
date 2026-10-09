// Platzhalter – Terminal (cmd/PowerShell) auf einem simulierten Endpunkt. Wird vom Terminal-Modul implementiert.
export interface TerminalAppProps {
  /** Hostname des Endpunkts, auf dem die Befehle laufen (z.B. "PC-VT-001" oder "IT-ADM-01") */
  hostname: string
  shell: 'cmd' | 'powershell'
  /** Als Administrator gestartet (Titelzeile, erweiterte Rechte) */
  admin?: boolean
  className?: string
}

export function TerminalApp({ hostname, shell }: TerminalAppProps) {
  return <div className="h-full bg-black p-2 font-mono text-sm text-slate-200">{shell === 'cmd' ? 'C:\\>' : 'PS C:\\>'} ({hostname}) – Terminal wird gebaut …</div>
}
