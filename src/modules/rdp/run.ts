// "Ausführen"-Dialog (Win+R) und Suche: Befehle → Apps

import type { AppArgs, AppId } from './store'

export type RunResult =
  | { kind: 'app'; app: AppId; args?: AppArgs }
  | { kind: 'gpupdate' }
  | { kind: 'reboot' }
  | { kind: 'error'; message: string }

const TEXT_EXT = /\.(txt|log|ini|cfg|conf|xml|csv|bat|cmd|ps1|reg|json|md|inf)$/i

export const isTextFile = (name: string) => TEXT_EXT.test(name) || /^(hosts|networks|services|protocol|lmhosts\.sam)$/i.test(name)

const looksLikeUrl = (s: string) => /^(https?:\/\/|www\.)/i.test(s) || /^[a-z0-9-]+(\.[a-z0-9-]+)*\.(example|local|de|com|net|org)(\/.*)?$/i.test(s)

export function parseRun(input: string): RunResult {
  const cmd = input.trim()
  if (!cmd) return { kind: 'error', message: 'Geben Sie den Namen eines Programms, Ordners, Dokuments oder einer Internetressource an.' }
  const lower = cmd.toLowerCase()
  const [head, ...restParts] = cmd.split(/\s+/)
  const h = head.toLowerCase().replace(/\.exe$/, '')
  const rest = restParts.join(' ').replace(/^"|"$/g, '')

  // UNC / lokale Pfade
  if (cmd.startsWith('\\\\')) return { kind: 'app', app: 'explorer', args: { path: cmd.replace(/\\+$/, '') } }
  if (/^[a-z]:(\\|$)/i.test(cmd) || /^%[a-z]+%/i.test(cmd)) {
    const name = cmd.split('\\').pop() ?? ''
    if (isTextFile(name)) return { kind: 'app', app: 'notepad', args: { path: cmd } }
    return { kind: 'app', app: 'explorer', args: { path: cmd } }
  }
  if (looksLikeUrl(cmd)) return { kind: 'app', app: 'browser', args: { url: /^https?:\/\//i.test(cmd) ? cmd : `http://${cmd}` } }

  switch (h) {
    case 'services.msc':
      return { kind: 'app', app: 'services' }
    case 'eventvwr':
    case 'eventvwr.msc':
      return { kind: 'app', app: 'eventvwr' }
    case 'regedit':
    case 'regedt32':
      return { kind: 'app', app: 'regedit' }
    case 'diskmgmt.msc':
      return { kind: 'app', app: 'diskmgmt' }
    case 'devmgmt.msc':
    case 'hdwwiz.cpl':
      return { kind: 'app', app: 'devmgmt' }
    case 'taskmgr':
      return { kind: 'app', app: 'taskmgr' }
    case 'ncpa.cpl':
      return { kind: 'app', app: 'ncpa' }
    case 'cmd':
      return { kind: 'app', app: 'cmd' }
    case 'powershell':
    case 'pwsh':
      return { kind: 'app', app: 'powershell' }
    case 'notepad':
      return { kind: 'app', app: 'notepad', args: rest ? { path: rest } : {} }
    case 'explorer':
      return { kind: 'app', app: 'explorer', args: rest ? { path: rest } : {} }
    case 'msinfo32':
      return { kind: 'app', app: 'msinfo' }
    case 'cleanmgr':
      return { kind: 'app', app: 'cleanmgr' }
    case 'outlook':
      return { kind: 'app', app: 'outlook' }
    case 'msedge':
    case 'browser':
    case 'iexplore':
      return { kind: 'app', app: 'browser', args: rest ? { url: rest } : {} }
    case 'inetcpl.cpl':
      return { kind: 'app', app: 'settings', args: { page: 'proxy' } }
    case 'timedate.cpl':
      return { kind: 'app', app: 'settings', args: { page: 'zeit' } }
    case 'sysdm.cpl':
      return { kind: 'app', app: 'settings', args: { page: 'system' } }
    case 'appwiz.cpl':
      return { kind: 'app', app: 'settings', args: { page: 'apps' } }
    case 'printmanagement.msc':
      return { kind: 'app', app: 'printers' }
    case 'control':
      if (/printers/i.test(rest)) return { kind: 'app', app: 'printers' }
      if (/ncpa|netconnections/i.test(rest)) return { kind: 'app', app: 'ncpa' }
      if (/timedate/i.test(rest)) return { kind: 'app', app: 'settings', args: { page: 'zeit' } }
      return { kind: 'app', app: 'settings', args: { page: 'system' } }
    case 'gpupdate':
      return { kind: 'gpupdate' }
    case 'shutdown':
      if (/[/-]r/i.test(rest)) return { kind: 'reboot' }
      return { kind: 'error', message: 'Herunterfahren ist in einer Remotesitzung nicht vorgesehen – verwenden Sie "shutdown /r" für einen Neustart.' }
  }
  if (lower.startsWith('ms-settings:')) {
    const p = lower.slice('ms-settings:'.length)
    const page = p.startsWith('network-proxy') ? 'proxy' : p.startsWith('network-vpn') ? 'vpn' : p.startsWith('network') ? 'netzwerk' : p.startsWith('dateandtime') ? 'zeit' : p.startsWith('printers') ? 'drucker' : p.startsWith('appsfeatures') ? 'apps' : 'system'
    return { kind: 'app', app: 'settings', args: { page } }
  }
  return { kind: 'error', message: `"${cmd}" wurde nicht gefunden. Stellen Sie sicher, dass Sie den Namen richtig eingegeben haben, und wiederholen Sie den Vorgang.` }
}
