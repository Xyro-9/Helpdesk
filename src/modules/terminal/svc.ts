// Dienste und Prozesse: sc, net start/stop, tasklist, taskkill, Get-/Start-/Stop-/Restart-/Set-Service, Get-/Stop-Process

import { A } from '@/core/actions'
import type { StartType, WinProcess, WinService } from '@/core/types'
import { findService, killProcess, setServiceStartType, startService, stopService } from '@/core/ops/endpoint'
import { act, arg, elevationMsg, isObj, num, obj, psArgs, psError, wildToRe, type Env, type Handler } from './shell'

const SC_STATE = (s: WinService) => (s.status === 'Wird ausgeführt' ? '4  RUNNING' : s.status === 'Angehalten' ? '7  PAUSED' : '1  STOPPED')
const SC_START: Record<StartType, string> = { Automatisch: '2   AUTO_START', 'Automatisch (Verzögerter Start)': '2   AUTO_START  (DELAYED)', Manuell: '3   DEMAND_START', Deaktiviert: '4   DISABLED' }
const PS_STATUS = (s: WinService) => (s.status === 'Wird ausgeführt' ? 'Running' : s.status === 'Angehalten' ? 'Paused' : 'Stopped')
const PS_START = (t: StartType) => (t.startsWith('Automatisch') ? 'Automatic' : t === 'Manuell' ? 'Manual' : 'Disabled')

function scBlock(s: WinService) {
  return [`SERVICE_NAME: ${s.name}`, `DISPLAY_NAME: ${s.displayName}`, '        TYPE               : 30  WIN32', `        STATE              : ${SC_STATE(s)}`, s.status === 'Wird ausgeführt' ? '                                (STOPPABLE, NOT_PAUSABLE, ACCEPTS_SHUTDOWN)' : '', `        WIN32_EXIT_CODE    : ${s.status === 'Beendet' && s.startError ? '1067  (0x42b)' : '0  (0x0)'}`, '        SERVICE_EXIT_CODE  : 0  (0x0)', '        CHECKPOINT         : 0x0', '        WAIT_HINT          : 0x0']
    .filter(Boolean)
    .join('\n')
}

const scNotFound = (op: string) => `[SC] ${op} FEHLER 1060:\n\nDer angegebene Dienst ist kein installierter Dienst.`

export const sc: Handler = (e, args) => {
  const op = (args[0] ?? '').toLowerCase()
  const name = args[1]
  const ep = e.ep
  if (!op || op === '/?') return 'BESCHREIBUNG:\n        SC ist ein Befehlszeilenprogramm für die Kommunikation mit dem Dienststeuerungs-Manager.\nVERWENDUNG:\n        sc query [Dienst] | sc qc <Dienst> | sc start <Dienst> | sc stop <Dienst>\n        sc config <Dienst> start= auto|delayed-auto|demand|disabled'
  if (op === 'query' || op === 'queryex') {
    if (!name || /^(type|state)=/i.test(name)) {
      const all = /state=\s*all/i.test(args.join(' ')) || args.some((x) => x.toLowerCase() === 'all')
      return ep.services.filter((s) => all || s.status === 'Wird ausgeführt').map(scBlock).join('\n\n')
    }
    const s = findService(ep.services, name)
    return s ? scBlock(s) : scNotFound('EnumQueryServicesStatus:OpenService')
  }
  const s = name ? findService(ep.services, name) : undefined
  if (op === 'qc') {
    if (!s) return scNotFound('OpenService')
    return [
      '[SC] QueryServiceConfig ERFOLG',
      '',
      `SERVICE_NAME: ${s.name}`,
      '        TYPE               : 20  WIN32_SHARE_PROCESS',
      `        START_TYPE         : ${SC_START[s.startType]}`,
      '        ERROR_CONTROL      : 1   NORMAL',
      `        BINARY_PATH_NAME   : ${s.name === 'Spooler' ? 'C:\\Windows\\System32\\spoolsv.exe' : `C:\\Windows\\system32\\svchost.exe -k netsvcs -p -s ${s.name}`}`,
      '        LOAD_ORDER_GROUP   :',
      '        TAG                : 0',
      `        DISPLAY_NAME       : ${s.displayName}`,
      `        DEPENDENCIES       : ${(s.dependsOn ?? ['RPCSS']).join('\n                           : ')}`,
      `        SERVICE_START_NAME : ${s.account}`,
    ].join('\n')
  }
  if (op === 'start' || op === 'stop' || op === 'config') {
    if (!name) return `Syntax: sc ${op} <Dienstname>`
    if (!e.admin) return '[SC] OpenService FEHLER 5:\n\nZugriff verweigert'
    if (!s) return scNotFound('OpenService')
    if (op === 'start') {
      if (s.status === 'Wird ausgeführt') return '[SC] StartService FEHLER 1056:\n\nEine Instanz des Dienstes wird bereits ausgeführt.'
      const err = startService(ep, s.name)
      if (err) return `[SC] StartService FEHLER ${err.match(/Systemfehler (\d+)/)?.[1] ?? 1053}:\n\n${err}`
      act(e, A.serviceChanged, e.host, `${s.name} gestartet`)
      return scBlock(s).replace('4  RUNNING', '2  START_PENDING')
    }
    if (op === 'stop') {
      if (s.status === 'Beendet') return '[SC] ControlService FEHLER 1062:\n\nDer Dienst wurde nicht gestartet.'
      stopService(ep, s.name)
      act(e, A.serviceChanged, e.host, `${s.name} beendet`)
      return scBlock(s).replace('1  STOPPED', '3  STOP_PENDING')
    }
    const joined = args.slice(2).join(' ').toLowerCase().replace(/start=\s*/, 'start=')
    const m = joined.match(/start=(auto|delayed-auto|demand|disabled)/)
    if (!m) return 'Syntax: sc config <Dienst> start= auto|delayed-auto|demand|disabled\n(Achtung: nach "start=" muss ein Leerzeichen stehen.)'
    const t: StartType = m[1] === 'auto' ? 'Automatisch' : m[1] === 'delayed-auto' ? 'Automatisch (Verzögerter Start)' : m[1] === 'demand' ? 'Manuell' : 'Deaktiviert'
    setServiceStartType(ep, s.name, t)
    act(e, A.serviceChanged, e.host, `${s.name} Starttyp: ${t}`)
    return '[SC] ChangeServiceConfig ERFOLG'
  }
  return `FEHLER: Unbekannter Befehl "${args[0]}". Unterstützt: query, queryex, qc, start, stop, config`
}

/** net start / net stop */
export function netService(e: Env, start: boolean, nameParts: string[]): string {
  const ep = e.ep
  if (!nameParts.length) {
    if (!start) return 'Die Syntax dieses Befehls lautet:\n\nNET STOP\nDienst'
    return ['Folgende Windows-Dienste wurden gestartet:', '', ...ep.services.filter((s) => s.status === 'Wird ausgeführt').map((s) => `   ${s.displayName}`), '', 'Der Befehl wurde erfolgreich ausgeführt.'].join('\n')
  }
  const name = nameParts.join(' ')
  const s = findService(ep.services, name)
  if (!s) return 'Der Dienstname ist ungültig.\n\nWeitere Hilfe erhalten Sie, wenn Sie NET HELPMSG 2185 eingeben.'
  if (!e.admin) return 'Systemfehler 5 aufgetreten.\n\nZugriff verweigert.'
  if (start) {
    if (s.status === 'Wird ausgeführt') return 'Der angeforderte Dienst wurde bereits gestartet.\n\nWeitere Hilfe erhalten Sie, wenn Sie NET HELPMSG 2182 eingeben.'
    const err = startService(ep, s.name)
    if (err) {
      const code = err.match(/Systemfehler (\d+)/)?.[1]
      return code ? `Systemfehler ${code} aufgetreten.\n\n${err.replace(/\s*\(Systemfehler \d+\)/, '')}` : `${s.displayName} wird gestartet.\n${s.displayName} konnte nicht gestartet werden.\n\n${err}`
    }
    act(e, A.serviceChanged, e.host, `${s.name} gestartet`)
    return `${s.displayName} wird gestartet.\n${s.displayName} wurde erfolgreich gestartet.`
  }
  if (s.status === 'Beendet') return 'Der Dienst wurde nicht gestartet.\n\nWeitere Hilfe erhalten Sie, wenn Sie NET HELPMSG 3521 eingeben.'
  const deps = ep.services.filter((o) => o.dependsOn?.some((d) => d.toLowerCase() === s.name.toLowerCase()) && o.status === 'Wird ausgeführt')
  stopService(ep, s.name)
  act(e, A.serviceChanged, e.host, `${s.name} beendet`)
  return `${deps.length ? `Folgende Dienste sind vom Dienst "${s.displayName}" abhängig und werden ebenfalls beendet:\n\n${deps.map((d) => '   ' + d.displayName).join('\n')}\n\n` : ''}${s.displayName} wird beendet.\n${s.displayName} wurde erfolgreich beendet.`
}

// ─────────────── PowerShell-Dienste ───────────────

const svcRec = (s: WinService) => ({ Status: PS_STATUS(s), Name: s.name, DisplayName: s.displayName, StartType: PS_START(s.startType), ServiceName: s.name, CanStop: s.status === 'Wird ausgeführt', ServicesDependedOn: s.dependsOn ?? [], Account: s.account })

function svcNames(e: Env, args: string[], extraSwitches: string[] = []): { names: string[]; a: ReturnType<typeof psArgs> } {
  const a = psArgs(args, ['force', 'passthru', 'confirm', ...extraSwitches])
  let names = [arg(a, 'name', 'servicename') ?? '', ...a.pos].flatMap((x) => x.split(',')).map((x) => x.trim()).filter(Boolean)
  const disp = arg(a, 'displayname')
  if (disp) names = e.ep.services.filter((s) => wildToRe(disp).test(s.displayName)).map((s) => s.name)
  if (!names.length && isObj(e.input)) names = e.input.objs.map((o) => String(o.Name ?? '')).filter(Boolean)
  return { names, a }
}

export const getService: Handler = (e, args) => {
  const { names } = svcNames(e, args)
  if (!names.length) return obj(e.ep.services.map(svcRec), ['Status', 'Name', 'DisplayName'])
  const found: WinService[] = []
  const errs: string[] = []
  for (const n of names) {
    const re = wildToRe(n)
    const m = n.includes('*') || n.includes('?') ? e.ep.services.filter((s) => re.test(s.name) || re.test(s.displayName)) : [findService(e.ep.services, n)].filter((x): x is WinService => !!x)
    if (!m.length && !n.includes('*')) errs.push(psError(e, `Es kann kein Dienst mit dem Dienstnamen "${n}" gefunden werden.`, 'ObjectNotFound'))
    found.push(...m.filter((x) => !found.includes(x)))
  }
  if (errs.length && !found.length) return errs.join('\n')
  return obj(found.map(svcRec), ['Status', 'Name', 'DisplayName'])
}

const serviceAction = (kind: 'start' | 'stop' | 'restart'): Handler => (e, args) => {
  const { names } = svcNames(e, args)
  if (!names.length) return psError(e, 'Der Parameter "-Name" fehlt. Beispiel: Start-Service -Name Spooler', 'InvalidArgument')
  const out: string[] = []
  for (const n of names) {
    const s = findService(e.ep.services, n)
    if (!s) {
      out.push(psError(e, `Es kann kein Dienst mit dem Dienstnamen "${n}" gefunden werden.`, 'ObjectNotFound'))
      continue
    }
    if (!e.admin) {
      out.push(psError(e, `Der Dienst "${s.displayName} (${s.name})" kann auf dem Computer "." nicht ${kind === 'stop' ? 'beendet' : 'gestartet'} werden. Zugriff verweigert – für diesen Vorgang sind erhöhte Rechte erforderlich (PowerShell "Als Administrator ausführen").`, 'PermissionDenied'))
      continue
    }
    if (kind !== 'start') {
      stopService(e.ep, s.name)
      if (kind === 'stop') act(e, A.serviceChanged, e.host, `${s.name} beendet`)
      if (kind === 'restart') out.push(`WARNUNG: Warten auf Beenden des Diensts "${s.displayName} (${s.name})"...`)
    }
    if (kind !== 'stop') {
      const err = startService(e.ep, s.name)
      if (err) out.push(psError(e, `Der Dienst "${s.displayName} (${s.name})" kann aufgrund des folgenden Fehlers nicht gestartet werden: ${err}`, 'OpenError'))
      else act(e, A.serviceChanged, e.host, `${s.name} ${kind === 'restart' ? 'neu gestartet' : 'gestartet'}`)
    }
  }
  return out.join('\n')
}
export const startServiceCmd = serviceAction('start')
export const stopServiceCmd = serviceAction('stop')
export const restartServiceCmd = serviceAction('restart')

export const setService: Handler = (e, args) => {
  const { names, a } = svcNames(e, args)
  if (!names.length) return psError(e, 'Der Parameter "-Name" fehlt.', 'InvalidArgument')
  if (!e.admin) return elevationMsg(e)
  const s = findService(e.ep.services, names[0])
  if (!s) return psError(e, `Der Dienst "${names[0]}" wurde nicht gefunden.`, 'ObjectNotFound')
  const st = arg(a, 'startuptype', 'starttype')
  if (st) {
    const map: Record<string, StartType> = { automatic: 'Automatisch', auto: 'Automatisch', automaticdelayedstart: 'Automatisch (Verzögerter Start)', manual: 'Manuell', disabled: 'Deaktiviert' }
    const t = map[st.toLowerCase()]
    if (!t) return psError(e, `Der Wert "${st}" ist für -StartupType ungültig. Gültig: Automatic, AutomaticDelayedStart, Manual, Disabled.`, 'InvalidArgument')
    setServiceStartType(e.ep, s.name, t)
    act(e, A.serviceChanged, e.host, `${s.name} Starttyp: ${t}`)
  }
  const status = arg(a, 'status')
  if (status) {
    const err = /running/i.test(status) ? startService(e.ep, s.name) : /stopped/i.test(status) ? stopService(e.ep, s.name) : null
    if (err) return psError(e, err)
    act(e, A.serviceChanged, e.host, `${s.name} ${/running/i.test(status) ? 'gestartet' : 'beendet'}`)
  }
  return ''
}

// ─────────────── Prozesse ───────────────

const isSystemProc = (p: WinProcess) => ['SYSTEM', 'NETZWERKDIENST', 'LOKALER DIENST'].includes(p.user)

export const tasklist: Handler = (e, args) => {
  const filt = args.map((x, i) => (x.toLowerCase() === '/fi' ? args[i + 1] : undefined)).filter((x): x is string => !!x)
  let procs = [...e.ep.processes]
  for (const f of filt) {
    const m = f.match(/^\s*(imagename|pid|username|services)\s+(eq|ne)\s+(.+?)\s*$/i)
    if (!m) return `FEHLER: Ungültiger Filter "${f}". Beispiel: tasklist /fi "imagename eq chrome.exe"`
    const [, key, op, val] = m
    const re = wildToRe(val)
    procs = procs.filter((p) => {
      const v = key.toLowerCase() === 'imagename' ? p.name : key.toLowerCase() === 'pid' ? String(p.pid) : key.toLowerCase() === 'username' ? p.user : p.service ?? ''
      return op.toLowerCase() === 'eq' ? re.test(v) : !re.test(v)
    })
  }
  if (!procs.length) return 'INFORMATION: Es werden keine Aufgaben mit den angegebenen Kriterien ausgeführt.'
  const svc = args.some((x) => x.toLowerCase() === '/svc')
  const head = svc ? ['', 'Abbildname                     PID Dienste', '========================= ======== ============================================'] : ['', 'Abbildname                     PID Sitzungsname       Sitz.-Nr. Speichernutzung', '========================= ======== ================ =========== ===============']
  return [...head, ...procs.map((p) => (svc ? `${p.name.slice(0, 25).padEnd(25)} ${String(p.pid).padStart(8)} ${p.service ?? 'Nicht zutreffend'}` : `${p.name.slice(0, 25).padEnd(25)} ${String(p.pid).padStart(8)} ${(isSystemProc(p) ? 'Services' : 'Console').padEnd(16)} ${String(isSystemProc(p) ? 0 : 1).padStart(11)} ${(num(Math.round(p.memMb * 1024)) + ' K').padStart(15)}`))].join('\n')
}

function killChecked(e: Env, p: WinProcess): string | null {
  if (!e.admin && (isSystemProc(p) || p.user.toLowerCase() !== e.user.toLowerCase())) return 'Zugriff verweigert'
  const err = killProcess(e.ep, String(p.pid))
  if (err) return err.replace(/^FEHLER: /, '')
  act(e, A.processKilled, e.host, `${p.name} (PID ${p.pid})`)
  return null
}

export const taskkill: Handler = (e, args) => {
  const im = args.map((x, i) => (x.toLowerCase() === '/im' ? args[i + 1] : undefined)).filter((x): x is string => !!x)
  const pids = args.map((x, i) => (x.toLowerCase() === '/pid' ? args[i + 1] : undefined)).filter((x): x is string => !!x)
  if (!im.length && !pids.length) return 'FEHLER: Ungültige Syntax. Verwendung: taskkill /im <Name.exe> [/f] [/t]  bzw.  taskkill /pid <PID> [/f]'
  const out: string[] = []
  for (const n of im) {
    const re = wildToRe(n)
    const procs = e.ep.processes.filter((p) => re.test(p.name) || re.test(p.name.replace(/\.exe$/i, '')))
    if (!procs.length) out.push(`FEHLER: Der Prozess "${n}" wurde nicht gefunden.`)
    for (const p of procs) {
      const err = killChecked(e, p)
      out.push(err ? `FEHLER: Der Prozess "${p.name}" mit PID ${p.pid} konnte nicht beendet werden.\nUrsache: ${err}` : `ERFOLGREICH: Der Prozess "${p.name}" mit PID ${p.pid} wurde beendet.`)
    }
  }
  for (const id of pids) {
    const p = e.ep.processes.find((x) => String(x.pid) === id)
    if (!p) {
      out.push(`FEHLER: Der Prozess "${id}" wurde nicht gefunden.`)
      continue
    }
    const err = killChecked(e, p)
    out.push(err ? `FEHLER: Der Prozess mit PID ${id} konnte nicht beendet werden.\nUrsache: ${err}` : `ERFOLGREICH: Der Prozess mit PID ${id} wurde beendet.`)
  }
  return out.join('\n')
}

const procRec = (p: WinProcess) => ({ Handles: 100 + ((p.pid * 7) % 900), 'WS(K)': Math.round(p.memMb * 1024), 'CPU(s)': Math.round(p.cpu * 37 * 100) / 100, Id: p.pid, SI: isSystemProc(p) ? 0 : 1, ProcessName: p.name.replace(/\.exe$/i, ''), UserName: p.user, Description: p.description })

export const getProcess: Handler = (e, args) => {
  const a = psArgs(args, ['includeusername'])
  const names = [arg(a, 'name') ?? '', ...a.pos].flatMap((x) => x.split(',')).filter(Boolean)
  const id = arg(a, 'id')
  let procs = e.ep.processes
  if (id) procs = procs.filter((p) => String(p.pid) === id)
  if (names.length) {
    procs = procs.filter((p) => names.some((n) => wildToRe(n).test(p.name.replace(/\.exe$/i, '')) || wildToRe(n).test(p.name)))
    if (!procs.length) return psError(e, `Es kann kein Prozess mit dem Namen "${names[0]}" gefunden werden. Überprüfen Sie den Prozessnamen, und rufen Sie das Cmdlet erneut auf.`, 'ObjectNotFound')
  }
  const sorted = [...procs].sort((x, y) => x.name.localeCompare(y.name))
  return obj(sorted.map(procRec), a.flags.has('includeusername') ? ['WS(K)', 'CPU(s)', 'Id', 'UserName', 'ProcessName'] : ['Handles', 'WS(K)', 'CPU(s)', 'Id', 'SI', 'ProcessName'])
}

export const stopProcess: Handler = (e, args) => {
  const a = psArgs(args, ['force', 'passthru', 'confirm'])
  const id = arg(a, 'id')
  const names = [arg(a, 'name', 'processname') ?? '', ...a.pos].flatMap((x) => x.split(',')).filter(Boolean)
  let procs: WinProcess[] = []
  if (id) procs = e.ep.processes.filter((p) => list2(id).includes(String(p.pid)))
  else if (names.length) procs = e.ep.processes.filter((p) => names.some((n) => wildToRe(n).test(p.name.replace(/\.exe$/i, '')) || wildToRe(n).test(p.name)))
  else if (isObj(e.input)) procs = e.ep.processes.filter((p) => isObj(e.input) && e.input.objs.some((o) => o.Id === p.pid))
  if (!procs.length) return psError(e, `Es kann kein Prozess mit dem ${id ? `Bezeichner ${id}` : `Namen "${names[0] ?? ''}"`} gefunden werden.`, 'ObjectNotFound')
  const out: string[] = []
  for (const p of procs) {
    const err = killChecked(e, p)
    if (err) out.push(psError(e, `Der Prozess "${p.name.replace(/\.exe$/i, '')} (${p.pid})" kann aufgrund des folgenden Fehlers nicht beendet werden: ${err}`, 'CloseError'))
  }
  return out.join('\n')
}

const list2 = (v: string) => v.split(',').map((x) => x.trim())
