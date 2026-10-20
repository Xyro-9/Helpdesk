// PowerShell-Remoting-Prüfung (Enter-PSSession, Invoke-Command, Restart-Computer -ComputerName)

import { findComputer, isMemberOf } from '@/core/ops/ad'
import { ensureEndpoint, isServiceRunning } from '@/core/ops/endpoint'
import type { Endpoint } from '@/core/types'
import { reach, resolveName } from '@/core/sim/network'
import type { Env } from './shell'

export function canRemote(e: Env, target: string): { ok: true; ep: Endpoint } | { ok: false; error: string } {
  const t = target.replace(/\.musterwerk\.local$/i, '')
  const pre = `Verbindung mit dem Remoteserver "${t}" fehlgeschlagen mit folgender Fehlermeldung: `
  const tail = ' Weitere Informationen finden Sie im Hilfethema "about_Remote_Troubleshooting".'
  const r = resolveName(e.w, e.ep, t, { writeCache: true })
  if (!r.ok || !r.ip) return { ok: false, error: `${pre}Der WinRM-Client kann die Anforderung nicht verarbeiten, da der Servername nicht aufgelöst werden kann.${tail}` }
  const comp = findComputer(e.w, t)
  if (comp && (comp.ou.includes('Domain Controllers') || comp.ou.includes('OU=Server'))) return { ok: false, error: `${pre}Remoting auf Server ist für den Helpdesk nicht freigegeben (nur 2nd Level). Verwenden Sie die Infrastruktur-Konsole.${tail}` }
  const ep = comp ? ensureEndpoint(e.w, comp.name) : undefined
  if (!ep || !comp) return { ok: false, error: `${pre}Der WinRM-Client kann keine Verbindung mit dem angegebenen Ziel herstellen (kein Computerkonto in der Domäne gefunden).${tail}` }
  if (!reach(e.w, e.ep, r.ip).ok || !ep.online) return { ok: false, error: `${pre}Der WinRM-Client kann die Anforderung nicht verarbeiten. Der Zielcomputer antwortet nicht (Netzwerkpfad nicht erreichbar oder Computer ausgeschaltet).${tail}` }
  if (!isServiceRunning(ep, 'WinRM')) return { ok: false, error: `${pre}Der WinRM-Client kann keine Verbindung mit dem angegebenen Ziel herstellen. Überprüfen Sie, ob der Dienst (WinRM) auf dem Ziel ausgeführt wird und Anforderungen annimmt.${tail}` }
  if (comp.secureChannelBroken || Math.abs(ep.timeOffsetMin) > 5)
    return { ok: false, error: `${pre}Kerberos-Authentifizierungsfehler – ${comp.secureChannelBroken ? 'die Vertrauensstellung zwischen dem Zielcomputer und der Domäne ist gestört.' : 'die Systemzeit des Zielcomputers weicht zu stark ab.'}${tail}` }
  if (!(isMemberOf(e.w, e.user, 'GG_Lokale_Admins') || isMemberOf(e.w, e.user, 'Domänen-Admins'))) return { ok: false, error: `${pre}Zugriff verweigert.${tail}` }
  return { ok: true, ep }
}
