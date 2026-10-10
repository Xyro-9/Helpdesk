// Reiner Kommandozeilen-Interpreter (cmd + PowerShell) für simulierte Windows-Clients.
// Läuft innerhalb von updateWorld auf einem immer-Draft und nutzt ausschließlich die Core-ops.

import { A } from '@/core/actions'
import { ensureEndpoint, getEndpoint } from '@/core/ops/endpoint'
import type { World } from '@/core/types'
import { httpRequest } from '@/core/sim/network'
import * as ad from './adCmds'
import * as fs from './fs'
import * as nc from './netCmd'
import * as np from './netPs'
import * as nr from './netres'
import { canRemote } from './remote'
import { FILTER_NAMES, act, applyFilter, arg, argOrPos, expand, fmtD, fmtT, isObj, list, obj, parseRedirect, psArgs, psError, render, splitTop, tokenize, type Env, type Handler, type Out, type RunResult, type ShellCtx } from './shell'
import * as sv from './svc'
import * as sy from './sys'

export type { ActionReq, RunResult, ShellCtx } from './shell'

export const ADMIN_WORKSTATION = 'IT-ADM-01'
export const REMOTE_HOME = 'C:\\Users\\azubi\\Documents'

type Where = 'both' | 'cmd' | 'ps'
interface Entry {
  fn: Handler
  where: Where
  ad?: boolean
  /** Kategorie + Kurzbeschreibung für "help" */
  help?: [string, string]
}

const C: Record<string, Entry> = {}
function def(names: string, fn: Handler, where: Where = 'both', help?: [string, string], adOnly = false) {
  for (const n of names.split('|')) C[n.toLowerCase()] = { fn, where, help: n === names.split('|')[0] ? help : undefined, ad: adOnly }
}

// ─────────────── kleine eingebaute Befehle ───────────────

const echo: Handler = (e, args, rest) => {
  if (!e.ps) {
    if (/^[.:]$/.test(rest) || rest === '') return rest === '' && !/^echo[.:]/i.test(e.cmd) ? 'ECHO ist eingeschaltet (ON).' : ''
    return rest.replace(/\s+$/, '')
  }
  return args.join(' ')
}

function envVars(e: Env): [string, string][] {
  const u = e.ep.loggedOnUser ?? 'administrator'
  return [
    ['ALLUSERSPROFILE', 'C:\\ProgramData'],
    ['APPDATA', `C:\\Users\\${u}\\AppData\\Roaming`],
    ['COMPUTERNAME', e.host],
    ['ComSpec', 'C:\\Windows\\system32\\cmd.exe'],
    ['HOMEDRIVE', 'C:'],
    ['HOMEPATH', `\\Users\\${u}`],
    ['LOCALAPPDATA', `C:\\Users\\${u}\\AppData\\Local`],
    ['LOGONSERVER', '\\\\DC01'],
    ['NUMBER_OF_PROCESSORS', '8'],
    ['OS', 'Windows_NT'],
    ['Path', 'C:\\Windows\\system32;C:\\Windows;C:\\Windows\\System32\\Wbem;C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\'],
    ['PROCESSOR_ARCHITECTURE', 'AMD64'],
    ['ProgramData', 'C:\\ProgramData'],
    ['ProgramFiles', 'C:\\Program Files'],
    ['PUBLIC', 'C:\\Users\\Public'],
    ['SystemDrive', 'C:'],
    ['SystemRoot', 'C:\\Windows'],
    ['TEMP', `C:\\Users\\${u}\\AppData\\Local\\Temp`],
    ['TMP', `C:\\Users\\${u}\\AppData\\Local\\Temp`],
    ['USERDNSDOMAIN', 'MUSTERWERK.LOCAL'],
    ['USERDOMAIN', 'MUSTERWERK'],
    ['USERNAME', u],
    ['USERPROFILE', `C:\\Users\\${u}`],
    ['windir', 'C:\\Windows'],
  ]
}

const setCmd: Handler = (e, args) => {
  const f = args[0]?.toLowerCase()
  if (f?.includes('=')) return ''
  const vars = envVars(e).filter(([k]) => !f || k.toLowerCase().startsWith(f))
  return vars.length ? vars.map(([k, v]) => `${k}=${v}`).join('\n') : `Die Umgebungsvariable "${args[0]}" ist nicht definiert.`
}

const GUI_HINT: Handler = (e) => `"${e.cmd}" ist ein grafisches Programm. Bitte im Remote-Desktop über das Startmenü öffnen.`

const ver: Handler = () => '\nMicrosoft Windows [Version 10.0.26100.2033]'

const dateCmd: Handler = (e, args) => {
  const now = new Date(Date.now() + e.ep.timeOffsetMin * 60000).toISOString()
  const day = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][new Date(now).getDay()]
  if (/^time/i.test(e.cmd)) return args.some((x) => x.toLowerCase() === '/t') ? fmtT(now) : `Aktuelle Zeit: ${fmtT(now, true)},00\n(Das Ändern der Uhrzeit ist im Simulator nicht möglich – "w32tm /resync" verwenden.)`
  return args.some((x) => x.toLowerCase() === '/t') ? `${day} ${fmtD(now)}` : `Aktuelles Datum: ${day} ${fmtD(now)}\n(Das Ändern des Datums ist im Simulator nicht möglich.)`
}

const scPsHint: Handler = () => 'Hinweis: In PowerShell ist "sc" ein Alias für "Set-Content" (Datei schreiben)!\nVerwenden Sie "sc.exe query Spooler" bzw. die Cmdlets Get-Service / Start-Service / Set-Service.'

const webRequest: Handler = (e, args) => {
  const a = psArgs(args, ['usebasicparsing', 'usedefaultcredentials', 'i', 'k', 's', 'v'])
  const url = argOrPos(a, 0, 'uri', 'url')
  if (!url) return e.ps ? psError(e, 'Der Parameter "-Uri" fehlt.') : 'curl: no URL specified!'
  const r = httpRequest(e.w, e.ep, url.includes('://') ? url : `http://${url}`)
  if (!r.ok) {
    const map: Record<string, string> = { ERR_PROXY_CONNECTION_FAILED: 'Die Verbindung mit dem Proxyserver konnte nicht hergestellt werden.', DNS_PROBE_FINISHED_NXDOMAIN: 'Der Remotename konnte nicht aufgelöst werden', DNS_PROBE_FINISHED_NO_INTERNET: 'Der Remotename konnte nicht aufgelöst werden (keine Internetverbindung)', ERR_CONNECTION_TIMED_OUT: 'Zeitüberschreitung beim Vorgang', ERR_CONNECTION_REFUSED: 'Es konnte keine Verbindung hergestellt werden, da der Zielcomputer die Verbindung verweigerte', ERR_INTERNET_DISCONNECTED: 'Keine Netzwerkverbindung', ERR_ADDRESS_UNREACHABLE: 'Das Netzwerk ist nicht erreichbar' }
    const msg = `${map[r.error ?? ''] ?? r.error}: "${r.host}"${r.detail ? ` (${r.detail})` : ''}`
    return e.ps ? psError(e, msg, 'InvalidOperation') : `curl: (6) ${msg}`
  }
  const body = `<html><head><title>${r.host}</title></head><body>…</body></html>`
  if (!e.ps) return `HTTP/1.1 200 OK\nServer: ${r.host}\nContent-Type: text/html; charset=utf-8\n${r.viaProxy ? 'Via: 1.1 proxy.musterwerk.local:8080\n' : ''}\n${body}${r.spoofed ? `\n\n(Simulator-Hinweis: Die Antwort kam von ${r.ip} – das ist NICHT die offizielle Adresse von ${r.host}! hosts-Datei prüfen.)` : ''}`
  return obj([{ StatusCode: 200, StatusDescription: 'OK', Content: body, RawContent: `HTTP/1.1 200 OK\nContent-Type: text/html`, Headers: `{[Content-Type, text/html]${r.viaProxy ? ', [Via, 1.1 proxy.musterwerk.local:8080]' : ''}}`, RawContentLength: body.length, RemoteAddress: r.ip ?? '', ...(r.spoofed ? { Warnung: `Antwort von ${r.ip} – nicht die offizielle Adresse (hosts-Datei?)` } : {}) }], ['StatusCode', 'StatusDescription', 'Content', 'RawContent', 'Headers', 'RawContentLength', 'RemoteAddress', ...(r.spoofed ? ['Warnung'] : [])], true)
}

// ─────────────── Remoting ───────────────

const enterPSSession: Handler = (e, args) => {
  const a = psArgs(args)
  const target = argOrPos(a, 0, 'computername', 'cn')
  if (!target) return psError(e, 'Der Parameter "-ComputerName" fehlt. Beispiel: Enter-PSSession -ComputerName PC-VT-001', 'InvalidArgument')
  if (e.ctx.remote) return psError(e, 'Eine Remotesitzung ist bereits geöffnet. Verschachtelte Sitzungen werden nicht unterstützt – zuerst "Exit-PSSession".', 'InvalidOperation')
  const r = canRemote(e, target)
  if (!r.ok) return psError(e, r.error, 'OpenError')
  e.res.enterRemote = r.ep.hostname
  e.res.cwd = REMOTE_HOME
  act(e, A.command, r.ep.hostname, 'PowerShell-Remotesitzung geöffnet (Enter-PSSession)')
  return ''
}

const exitPSSession: Handler = (e) => {
  if (e.ctx.remote) e.res.exitRemote = true
  return ''
}

const exitCmd: Handler = (e) => {
  if (e.ctx.remote) e.res.exitRemote = true
  else e.res.exit = true
  return ''
}

const invokeCommand: Handler = (e, args) => {
  const a = psArgs(args, ['asjob', 'hidecomputername'])
  const sb = arg(a, 'scriptblock') ?? a.pos.find((x) => x.startsWith('{'))
  const targets = list(arg(a, 'computername', 'cn') ?? a.pos.find((x) => !x.startsWith('{')))
  if (!sb) return psError(e, 'Der Parameter "-ScriptBlock" fehlt. Beispiel: Invoke-Command -ComputerName PC-VT-001 -ScriptBlock { Get-Service Spooler }', 'InvalidArgument')
  const inner = sb.replace(/^\{|\}$/g, '').trim()
  if (!targets.length) return runCommand(e.w, { ...e.ctx }, inner).output
  const out: string[] = []
  for (const t of targets) {
    const r = canRemote(e, t)
    if (!r.ok) {
      out.push(psError(e, `[${t}] ${r.error}`, 'OpenError'))
      continue
    }
    const res = runCommand(e.w, { hostname: e.ctx.hostname, shell: 'powershell', cwd: REMOTE_HOME, admin: true, remote: r.ep.hostname, user: e.user }, inner)
    e.actions.push(...res.actions)
    out.push(targets.length > 1 ? `── ${r.ep.hostname} ──\n${res.output}` : res.output)
  }
  return out.join('\n')
}

// ─────────────── Hilfe ───────────────

const getCommand: Handler = (e, args) => {
  const n = argOrPos(psArgs(args), 0, 'name')
  if (!n) return psError(e, 'Bitte einen Befehlsnamen angeben.')
  const entry = C[n.toLowerCase()]
  if (!entry || !available(e, entry)) return psError(e, `Die Benennung "${n}" wurde nicht als Name eines Cmdlet, einer Funktion, einer Skriptdatei oder eines ausführbaren Programms erkannt.`, 'ObjectNotFound')
  return obj([{ CommandType: n.includes('-') ? 'Cmdlet' : 'Application', Name: n, Version: '1.0.0.0', Source: entry.ad ? 'ActiveDirectory' : n.includes('-') ? 'Microsoft.PowerShell.Management' : `C:\\Windows\\system32\\${n}.exe` }], ['CommandType', 'Name', 'Version', 'Source'])
}

const helpCmd: Handler = (e, args) => {
  const topic = args.find((x) => !x.startsWith('-'))
  if (topic) {
    const t = topic.toLowerCase()
    const entry = C[t]
    const key = Object.keys(C).find((k) => C[k] === entry && C[k].help)
    const h = key ? C[key].help : undefined
    if (!entry) return `Für "${topic}" ist keine Hilfe vorhanden. "help" zeigt alle unterstützten Befehle.`
    return `${topic}\n  ${h?.[1] ?? 'Siehe "help" für die Übersicht.'}\n\nTipp: Viele Befehle zeigen ihre Syntax, wenn man sie ohne Parameter aufruft.`
  }
  const groups = new Map<string, string[]>()
  for (const [name, entry] of Object.entries(C)) {
    if (!entry.help || !available(e, entry)) continue
    const [cat, text] = entry.help
    if (!groups.has(cat)) groups.set(cat, [])
    groups.get(cat)!.push(`  ${prettyName(name).padEnd(e.ps ? 34 : 22)} ${text}`)
  }
  const out = [`Unterstützte Befehle (${e.ps ? 'PowerShell' : 'Eingabeaufforderung'}, Simulator):`, '']
  for (const [cat, lines] of groups) out.push(cat, ...lines, '')
  out.push('Pipelines: | findstr <Text>, | Select-Object Name,Status / -First 5, | Where-Object {$_.Status -eq "Running"}, | Format-List *, | ft, | Sort-Object', 'Umleitung: echo Text > Datei  bzw.  >> Datei (anhängen)', 'Umgebungsvariablen: %TEMP%, %USERPROFILE%, $env:TEMP …   Verlauf: ↑/↓   Leeren: cls / Strg+L')
  if (!e.ps) out.push('', 'Hinweis: PowerShell-Cmdlets (Get-Service …) gibt es nur in der PowerShell. Starten mit "powershell".')
  return out.join('\n')
}

function available(e: Env, entry: Entry) {
  if (entry.ad && !e.adTools) return false
  if (entry.where === 'ps' && !e.ps) return false
  if (entry.where === 'cmd' && e.ps) return false
  return true
}

// ─────────────── Registrierung ───────────────

const N = 'Netzwerk'
const S = 'Dienste & Prozesse'
const Y = 'System & Diagnose'
const F = 'Dateien & Registry'
const D = 'Active Directory & Cloud (nur IT-ADM-01)'
const R = 'Remoting'

def('ipconfig', nc.ipconfig, 'both', [N, 'IP-Konfiguration (/all, /release, /renew, /flushdns, /displaydns)'])
def('ping', nc.ping, 'both', [N, 'Erreichbarkeit prüfen (ping fs01 -n 2)'])
def('tracert', nc.tracert, 'both', [N, 'Route zum Ziel verfolgen'])
def('pathping', nc.pathping, 'both')
def('nslookup', nc.nslookup, 'both', [N, 'DNS-Abfrage (nslookup intranet [Server])'])
def('netstat', nc.netstat, 'both', [N, 'Verbindungen/Ports (netstat -an)'])
def('arp', nc.arp, 'both', [N, 'ARP-Cache (arp -a)'])
def('route', nc.route, 'both', [N, 'Routingtabelle (route print)'])
def('getmac', nc.getmac, 'both', [N, 'MAC-Adressen'])
def('hostname', nc.hostnameCmd, 'both', [N, 'Computername'])
def('netsh', nc.netsh, 'both', [N, 'netsh interface ip show config | set address/dns | set interface | winhttp | wlan'])
def('test-netconnection|tnc', np.testNetConnection, 'ps', [N, 'Test-NetConnection fs01 [-Port 445]'])
def('test-connection', np.testConnection, 'ps', [N, 'Ping als Cmdlet (-Count, -Quiet)'])
def('resolve-dnsname', np.resolveDnsName, 'ps', [N, 'DNS-Abfrage (-Server)'])
def('get-netadapter', np.getNetAdapter, 'ps', [N, 'Netzwerkadapter anzeigen'])
def('enable-netadapter', np.enableNetAdapter, 'ps', [N, 'Adapter aktivieren (-Name Ethernet)'])
def('disable-netadapter', np.disableNetAdapter, 'ps', [N, 'Adapter deaktivieren'])
def('restart-netadapter', np.restartNetAdapter, 'ps')
def('get-netipconfiguration|gip', np.getNetIPConfiguration, 'ps', [N, 'IP-Konfiguration'])
def('get-netipaddress', np.getNetIPAddress, 'ps', [N, 'IP-Adressen'])
def('get-dnsclientserveraddress', np.getDnsClientServerAddress, 'ps', [N, 'DNS-Server je Adapter'])
def('set-dnsclientserveraddress', np.setDnsClientServerAddress, 'ps', [N, '-InterfaceAlias Ethernet -ServerAddresses 10.10.0.10,10.10.0.11 | -ResetServerAddresses'])
def('clear-dnsclientcache', np.clearDnsClientCache, 'ps', [N, 'DNS-Cache leeren'])
def('get-dnsclientcache', np.getDnsClientCache, 'ps', [N, 'DNS-Cache anzeigen'])
def('invoke-webrequest|iwr|curl', webRequest, 'both', [N, 'HTTP-Abruf testen (curl http://intranet)'])

def('sc', sv.sc, 'cmd', [S, 'Dienststeuerung: sc query|qc|start|stop|config <Dienst> start= auto'])
def('sc.exe', sv.sc, 'both')
def('net', nr.net, 'both', [S, 'net start|stop|use|user <sam> /domain|localgroup|view|accounts'])
def('tasklist', sv.tasklist, 'both', [S, 'Prozesse (/fi "imagename eq x", /svc)'])
def('taskkill', sv.taskkill, 'both', [S, 'Prozess beenden (/im name.exe /f, /pid n)'])
def('get-service|gsv', sv.getService, 'ps', [S, 'Dienste anzeigen (Get-Service Spooler, *update*)'])
def('start-service|sasv', sv.startServiceCmd, 'ps', [S, 'Dienst starten'])
def('stop-service|spsv', sv.stopServiceCmd, 'ps', [S, 'Dienst beenden'])
def('restart-service', sv.restartServiceCmd, 'ps', [S, 'Dienst neu starten'])
def('set-service', sv.setService, 'ps', [S, '-Name x -StartupType Automatic|Manual|Disabled'])
def('get-process|gps|ps', sv.getProcess, 'ps', [S, 'Prozesse anzeigen'])
def('stop-process|kill|spps', sv.stopProcess, 'ps', [S, '-Name x | -Id n [-Force]'])

def('systeminfo', sy.systeminfo, 'both', [Y, 'Systeminformationen'])
def('whoami', sy.whoami, 'both', [Y, 'Benutzer und Token-Gruppen (/groups)'])
def('w32tm', sy.w32tm, 'both', [Y, 'Zeitdienst: /query /status, /resync, /tz'])
def('gpupdate', sy.gpupdate, 'both', [Y, 'Gruppenrichtlinien aktualisieren (/force)'])
def('gpresult', sy.gpresult, 'both', [Y, 'Angewendete GPOs und Gruppen (/r)'])
def('klist', sy.klist, 'both', [Y, 'Kerberos-Tickets (klist purge = Token erneuern)'])
def('sfc', sy.sfc, 'both', [Y, 'Systemdateien prüfen (/scannow)'])
def('dism', sy.dism, 'both')
def('chkdsk', sy.chkdsk, 'both', [Y, 'Datenträger prüfen'])
def('manage-bde', sy.manageBde, 'both', [Y, 'BitLocker-Status (-status)'])
def('cleanmgr', sy.cleanmgr, 'both', [Y, 'Datenträgerbereinigung (Hinweis)'])
def('wmic', sy.wmic, 'both', [Y, 'wmic bios get serialnumber'])
def('shutdown', sy.shutdown, 'both', [Y, 'Neustart: shutdown /r /t 0'])
def('logoff', sy.logoff, 'both', [Y, 'Benutzer abmelden (Token erneuern)'])
def('restart-computer', sy.restartComputer, 'ps', [Y, 'Neustart [-ComputerName x -Force]'])
def('get-computerinfo', sy.getComputerInfo, 'ps', [Y, 'Systeminformationen'])
def('get-hotfix', sy.getHotFix, 'ps', [Y, 'Installierte Updates'])
def('get-eventlog', sy.getEventLog, 'ps', [Y, '-LogName System -Newest 10 [-EntryType Error] [-ComputerName DC01]'])
def('get-winevent', sy.getWinEvent, 'ps', [Y, '-LogName System -MaxEvents 10'])
def('test-computersecurechannel', sy.testComputerSecureChannel, 'ps', [Y, 'Vertrauensstellung prüfen [-Repair]'])
def('reset-computermachinepassword', sy.resetComputerMachinePassword, 'ps', [Y, 'Computerkennwort zurücksetzen'])
def('get-printer', nr.getPrinter, 'ps', [Y, 'Drucker anzeigen'])
def('get-printjob', nr.getPrintJob, 'ps', [Y, '-PrinterName x'])
def('remove-printjob', nr.removePrintJob, 'ps', [Y, 'Druckauftrag löschen'])
def('add-printer', nr.addPrinter, 'ps', [Y, '-ConnectionName \\\\PRINT01\\1OG-Farbe'])
def('remove-printer', nr.removePrinterCmd, 'ps', [Y, 'Drucker entfernen'])
def('rundll32', nr.rundll32, 'both')
def('get-psdrive|gdr', sy.getPSDrive, 'ps', [Y, 'Laufwerke inkl. frei/belegt (Get-PSDrive C)'])
def('new-psdrive|ndr', nr.newPSDrive, 'ps', [Y, 'Netzlaufwerk verbinden'])
def('remove-psdrive|rdr', nr.removePSDrive, 'ps')
def('get-smbmapping', nr.getSmbMapping, 'ps')
def('get-volume', sy.getVolume, 'ps', [Y, 'Volumes'])
def('get-disk', sy.getDisk, 'ps', [Y, 'Datenträger'])
def('get-physicaldisk', sy.getPhysicalDisk, 'ps', [Y, 'Physische Datenträger (Zustand)'])
def('get-bitlockervolume', sy.getBitLockerVolume, 'ps')
def('get-date', sy.getDate, 'ps', [Y, 'Datum/Uhrzeit'])
def('ver', ver, 'cmd', [Y, 'Windows-Version'])
def('date', dateCmd, 'cmd', [Y, 'Datum (/t)'])
def('time', dateCmd, 'cmd', [Y, 'Uhrzeit (/t)'])
def('set', setCmd, 'cmd', [Y, 'Umgebungsvariablen'])
def('echo|write-output|write-host|echo.|echo:', echo, 'both', [Y, 'Text ausgeben (mit > Datei umleiten)'])
def('cls|clear|clear-host', (e) => ((e.res.clear = true), ''), 'both', [Y, 'Bildschirm leeren'])
def('exit', exitCmd, 'both', [Y, 'Konsole schließen'])
def('help|get-help|man', helpCmd, 'both', [Y, 'Diese Übersicht'])
def('get-command|gcm', getCommand, 'ps')

def('dir|ls', fs.dirCmd, 'both', [F, 'Verzeichnisinhalt (/a = versteckte)'])
def('get-childitem|gci', fs.getChildItem, 'ps', [F, 'Verzeichnis/Registry auflisten (-Force, -Recurse)'])
def('cd|chdir|set-location|sl', fs.cdCmd, 'both', [F, 'Verzeichnis wechseln (cd .., cd /d D:\\)'])
def('pwd|get-location|gl', fs.pwd, 'ps')
def('type|cat|get-content|gc', fs.typeCmd, 'both', [F, 'Dateiinhalt anzeigen'])
def('del|erase|rm|rd|rmdir|remove-item|ri', fs.delCmd, 'both', [F, 'Löschen (del /q /s %TEMP%\\*, Remove-Item $env:TEMP\\* -Recurse -Force)'])
def('mkdir|md', fs.mkdirCmd, 'both', [F, 'Ordner anlegen'])
def('new-item|ni', fs.newItem, 'ps', [F, '-ItemType Directory|File -Path x'])
def('set-content', fs.setContent, 'ps', [F, 'Datei schreiben'])
def('add-content|ac', fs.addContent, 'ps', [F, 'An Datei anhängen (z.B. hosts)'])
def('clear-content|clc', fs.clearContent, 'ps')
def('out-file', fs.outFile, 'ps')
def('copy|cp|copy-item|cpi', fs.copyCmd, 'both', [F, 'Kopieren'])
def('move|mv|move-item|mi', fs.moveCmd, 'both', [F, 'Verschieben'])
def('ren|rename|rename-item|rni', fs.renCmd, 'both', [F, 'Umbenennen'])
def('attrib', fs.attrib, 'both', [F, 'Dateiattribute (+r/-r, +h/-h)'])
def('test-path', fs.testPath, 'ps', [F, 'Pfad vorhanden?'])
def('notepad|notepad.exe', fs.notepad, 'both', [F, 'Editor (Hinweis)'])
def('reg', fs.reg, 'both', [F, 'reg query|add|delete <Pfad> [/v Name /t REG_DWORD /d 0 /f]'])
def('get-itemproperty|gp', fs.getItemProperty, 'ps', [F, 'Registry-Werte lesen (HKCU:\\…)'])
def('get-itempropertyvalue|gpv', fs.getItemPropertyValue, 'ps')
def('set-itemproperty|sp', fs.setItemProperty, 'ps', [F, 'Registry-Wert setzen (-Path -Name -Value)'])
def('new-itemproperty', fs.setItemProperty, 'ps')
def('remove-itemproperty|rp', fs.removeItemProperty, 'ps')

def('get-aduser', ad.getADUser, 'ps', [D, 'Get-ADUser <sam> [-Properties *|LockedOut,…] / -Filter'], true)
def('search-adaccount', ad.searchADAccount, 'ps', [D, '-LockedOut | -AccountDisabled | -PasswordExpired'], true)
def('unlock-adaccount', ad.unlockADAccount, 'ps', [D, 'Konto entsperren (-Identity)'], true)
def('set-adaccountpassword', ad.setADAccountPassword, 'ps', [D, '-Identity x -Reset -NewPassword (ConvertTo-SecureString "…" -AsPlainText -Force)'], true)
def('set-aduser', ad.setADUser, 'ps', [D, '-ChangePasswordAtLogon $true | -Department | -Title | -Manager'], true)
def('enable-adaccount', ad.enableADAccount, 'ps', [D, 'Konto aktivieren'], true)
def('disable-adaccount', ad.disableADAccount, 'ps', [D, 'Konto deaktivieren'], true)
def('new-aduser', ad.newADUser, 'ps', [D, 'Benutzer anlegen'], true)
def('get-adgroup', ad.getADGroup, 'ps', [D, 'Gruppe anzeigen / -Filter'], true)
def('get-adgroupmember', ad.getADGroupMember, 'ps', [D, 'Mitglieder [-Recursive]'], true)
def('add-adgroupmember', ad.addADGroupMember, 'ps', [D, '-Identity Gruppe -Members sam'], true)
def('remove-adgroupmember', ad.removeADGroupMember, 'ps', [D, '-Identity Gruppe -Members sam -Confirm:$false'], true)
def('get-adprincipalgroupmembership', ad.getADPrincipalGroupMembership, 'ps', [D, 'Gruppen eines Benutzers'], true)
def('get-adcomputer', ad.getADComputer, 'ps', [D, 'Computerkonto anzeigen'], true)
def('move-adobject', ad.moveADObject, 'ps', [D, 'Objekt verschieben (-TargetPath)'], true)
def('get-addefaultdomainpasswordpolicy', ad.getADDefaultDomainPasswordPolicy, 'ps', [D, 'Kennwortrichtlinie'], true)
def('get-addomain', ad.getADDomain, 'ps', undefined, true)
def('get-adreplicationfailure', ad.getADReplicationFailure, 'ps', undefined, true)
def('start-adsyncsynccycle', ad.startADSyncSyncCycle, 'ps', [D, 'Cloud-Sync anstoßen (-PolicyType Delta)'], true)

def('enter-pssession|etsn', enterPSSession, 'ps', [R, 'Enter-PSSession -ComputerName PC-…'])
def('exit-pssession|exsn', exitPSSession, 'ps', [R, 'Remotesitzung beenden'])
def('invoke-command|icm', invokeCommand, 'ps', [R, 'Invoke-Command -ComputerName x -ScriptBlock { … }'])

for (const g of ['control', 'mmc', 'services.msc', 'devmgmt.msc', 'eventvwr', 'eventvwr.msc', 'compmgmt.msc', 'diskmgmt.msc', 'ncpa.cpl', 'taskmgr', 'regedit', 'explorer', 'mstsc', 'msinfo32', 'printmanagement.msc', 'dsa.msc', 'gpedit.msc', 'lusrmgr.msc', 'appwiz.cpl', 'inetcpl.cpl', 'firewall.cpl']) def(g, GUI_HINT, 'both')
def('title|color|prompt|chcp', (e) => (e.cmd.toLowerCase() === 'chcp' ? 'Aktive Codepage: 850.' : ''), 'cmd')
def('import-module|ipmo', (e, args) => {
  const m = args.filter((x) => !x.startsWith('-'))[0] ?? ''
  if (/activedirectory/i.test(m) && !e.adTools) return psError(e, `Das angegebene Modul "${m}" wurde nicht geladen, da in keinem Modulverzeichnis eine gültige Moduldatei gefunden wurde. (RSAT ist nur auf dem Admin-Arbeitsplatz IT-ADM-01 installiert.)`, 'ResourceUnavailable')
  return ''
}, 'ps')
def('get-module', (e) => obj([{ ModuleType: 'Manifest', Version: '3.1.0.0', Name: 'Microsoft.PowerShell.Management' }, ...(e.adTools ? [{ ModuleType: 'Manifest', Version: '1.0.1.0', Name: 'ActiveDirectory' }, { ModuleType: 'Script', Version: '2.4.0', Name: 'ADSync' }] : []), { ModuleType: 'Manifest', Version: '2.0.0.0', Name: 'NetTCPIP' }], ['ModuleType', 'Version', 'Name']), 'ps')
def('get-executionpolicy', () => 'RemoteSigned', 'ps')
def('set-executionpolicy', (e) => (e.admin ? '' : psError(e, 'Zugriff verweigert. Für die Änderung der Ausführungsrichtlinie sind Administratorrechte erforderlich.', 'PermissionDenied')), 'ps')
def('convertto-securestring', () => 'System.Security.SecureString', 'ps')
def('get-credential', (e) => `(Simulator: Der Anmeldedialog ist nicht verfügbar – es werden die Anmeldedaten von MUSTERWERK\\${e.user} verwendet.)`, 'ps')
def('get-localgroupmember', (e, args) => (/admin/i.test(args.join(' ')) || !args.length ? obj([{ ObjectClass: 'Benutzer', Name: `${e.host}\\Administrator`, PrincipalSource: 'Local' }, { ObjectClass: 'Gruppe', Name: 'MUSTERWERK\\Domänen-Admins', PrincipalSource: 'ActiveDirectory' }, { ObjectClass: 'Gruppe', Name: 'MUSTERWERK\\GG_Lokale_Admins', PrincipalSource: 'ActiveDirectory' }], ['ObjectClass', 'Name', 'PrincipalSource']) : psError(e, 'Gruppe nicht gefunden.', 'ObjectNotFound')), 'ps')
def('query|quser', (e) => ` BENUTZERNAME          SITZUNGSNAME       ID  STATUS  LEERLAUF   ANMELDEZEIT\n>${(e.ep.loggedOnUser ?? '-').padEnd(21)} console             1  Aktiv      Kein   ${fmtD(e.ep.lastBoot)} ${fmtT(e.ep.lastBoot)}`, 'both')
def('powershell|pwsh|cmd', (e) => `(Simulator: Bitte eine eigene ${e.cmd.toLowerCase() === 'cmd' ? 'Eingabeaufforderung' : 'PowerShell'} über das Startmenü öffnen.)`, 'both')

export const COMMAND_NAMES = Object.keys(C)

const NOUNS: Record<string, string> = {
  adaccount: 'ADAccount', adaccountpassword: 'ADAccountPassword', aduser: 'ADUser', adgroup: 'ADGroup', adgroupmember: 'ADGroupMember', adcomputer: 'ADComputer', adobject: 'ADObject', adprincipalgroupmembership: 'ADPrincipalGroupMembership', addefaultdomainpasswordpolicy: 'ADDefaultDomainPasswordPolicy', addomain: 'ADDomain', adreplicationfailure: 'ADReplicationFailure', adsyncsynccycle: 'ADSyncSyncCycle',
  netconnection: 'NetConnection', dnsname: 'DnsName', netadapter: 'NetAdapter', netipconfiguration: 'NetIPConfiguration', netipaddress: 'NetIPAddress', dnsclientserveraddress: 'DnsClientServerAddress', dnsclientcache: 'DnsClientCache', webrequest: 'WebRequest',
  computerinfo: 'ComputerInfo', hotfix: 'HotFix', eventlog: 'EventLog', winevent: 'WinEvent', computersecurechannel: 'ComputerSecureChannel', computermachinepassword: 'ComputerMachinePassword', printjob: 'PrintJob', psdrive: 'PSDrive', smbmapping: 'SmbMapping', physicaldisk: 'PhysicalDisk', bitlockervolume: 'BitLockerVolume',
  childitem: 'ChildItem', itemproperty: 'ItemProperty', itempropertyvalue: 'ItemPropertyValue', pssession: 'PSSession', executionpolicy: 'ExecutionPolicy', securestring: 'SecureString', localgroupmember: 'LocalGroupMember', convertto: 'ConvertTo',
}

/** Anzeigename: get-aduser → Get-ADUser */
export const prettyName = (n: string) => (n.includes('-') ? n.split('-').map((p) => NOUNS[p] ?? p.replace(/^./, (c) => c.toUpperCase())).join('-') : n)

/** Namen für die Tab-Vervollständigung (Original-Schreibweise der Cmdlets) */
export function completions(shell: 'cmd' | 'powershell', adTools: boolean): string[] {
  return Object.entries(C)
    .filter(([, e]) => (!e.ad || adTools) && !(e.where === 'ps' && shell === 'cmd') && !(e.where === 'cmd' && shell === 'powershell'))
    .map(([n]) => prettyName(n))
}

// ─────────────── Ausführung ───────────────

function unknown(e: Env, name: string): string {
  if (!e.ps) return `Der Befehl "${name}" ist entweder falsch geschrieben oder\nkonnte nicht gefunden werden.\n(Tipp: "help" zeigt alle Befehle des Simulators.)`
  const isAd = ad.AD_CMDLETS.includes(name.toLowerCase())
  return `${name} : Die Benennung "${name}" wurde nicht als Name eines Cmdlet, einer Funktion, einer Skriptdatei oder eines ausführbaren Programms erkannt. Überprüfen Sie die Schreibweise des Namens, oder ob der Pfad korrekt ist (sofern enthalten), und wiederholen Sie den Vorgang.\nIn Zeile:1 Zeichen:1\n+ ${name}\n+ ${'~'.repeat(name.length)}\n    + CategoryInfo          : ObjectNotFound: (${name}:String) [], CommandNotFoundException\n    + FullyQualifiedErrorId : CommandNotFoundException\n${isAd ? '(Tipp: Das ActiveDirectory-Modul ist nur auf dem Admin-Arbeitsplatz IT-ADM-01 installiert – Admin-PowerShell verwenden.)' : '(Tipp: "help" zeigt alle Befehle des Simulators.)'}`
}

function runStage(e: Env, stage: string, input: Out | undefined, first: boolean): Out {
  const text = stage.trim()
  if (!text) return input ?? ''
  const tokens = tokenize(text)
  let name = tokens[0] ?? ''
  let args = tokens.slice(1)
  let rest = text.replace(/^\S+\s?/, '')
  // cd.. / cd\ / echo. ohne Leerzeichen
  const glued = name.match(/^(cd|chdir)(\.\.|\\.*)$/i)
  if (glued) {
    name = glued[1]
    args = [glued[2], ...args]
    rest = glued[2] + (rest && rest !== text ? ' ' + rest : '')
  }
  if (/^echo[.:]/i.test(name)) {
    rest = name.slice(5) + (tokens.length > 1 ? ' ' + rest : '')
    name = 'echo'
  }
  e.cmd = name
  e.input = input
  const lower = name.toLowerCase()
  if (/^[a-z]:\\?$/i.test(name) && first && !args.length) return fs.driveChange(e, name.slice(0, 2))
  if (e.ps && /^\$/.test(name)) {
    if (/=/.test(text)) return ''
    const m = name.match(/^\$env:(\w+)$/i)
    if (m) return envVars(e).find(([k]) => k.toLowerCase() === m[1].toLowerCase())?.[1] ?? ''
    if (/^\$psversiontable$/i.test(name)) return obj([{ Name: 'PSVersion', Value: '5.1.26100.2033' }, { Name: 'PSEdition', Value: 'Desktop' }, { Name: 'BuildVersion', Value: '10.0.26100.2033' }, { Name: 'CLRVersion', Value: '4.0.30319.42000' }], ['Name', 'Value'])
    if (/^\$(true|false|null)$/i.test(name)) return name.slice(1).replace(/^./, (c) => c.toUpperCase()).replace('Null', '')
    return ''
  }
  if (e.ps && /^(gci|ls|dir|get-childitem)$/i.test(lower) && /^env:/i.test(args[0] ?? '')) {
    const f = args[0].slice(4).replace(/^\\/, '')
    return obj(envVars(e).filter(([k]) => !f || new RegExp('^' + f.replace(/\*/g, '.*') + '$', 'i').test(k)).map(([k, v]) => ({ Name: k, Value: v })), ['Name', 'Value'])
  }
  if (!first && FILTER_NAMES.includes(lower)) return applyFilter(lower, args, rest, input ?? '') ?? input ?? ''
  if (/^(-\?|\/\?)$/.test(args[0] ?? '')) return helpCmd(e, [name], '')
  const exe = lower.endsWith('.exe') && lower !== 'sc.exe' ? lower.slice(0, -4) : lower
  if (exe === 'sc' && e.ps) return scPsHint(e, args, rest)
  const entry = C[exe]
  if (!entry || !available(e, entry)) return unknown(e, name)
  return entry.fn(e, args, rest)
}

function runStatement(e: Env, stmt: string): string {
  const red = parseRedirect(stmt)
  const stages = splitTop(red.cmd, '|')
  let out: Out | undefined
  stages.forEach((s, i) => {
    out = runStage(e, s, out, i === 0)
  })
  const text = render(out).replace(/\n+$/, out && isObj(out) ? '\n' : '')
  if (red.file !== undefined) {
    if (!red.file) return e.ps ? psError(e, 'Fehlender Dateiname nach dem Umleitungsoperator.') : 'Die Syntax für den Dateinamen, Verzeichnisnamen oder die Datenträgerbezeichnung ist falsch.'
    const err = fs.writeOut(e, red.file, text.replace(/^\n/, ''), !!red.append)
    return err ?? ''
  }
  return text
}

/**
 * Führt eine Befehlszeile aus. Muss innerhalb von updateWorld laufen (w ist ein immer-Draft).
 * Liefert Ausgabe, Zustandsänderungen der Konsole und semantische Aktionen für das Protokoll.
 */
export function runCommand(w: World, ctx: ShellCtx, line: string): RunResult {
  const host = ctx.remote ?? ctx.hostname
  const ep = getEndpoint(w, host) ?? ensureEndpoint(w, host)
  const res: Partial<RunResult> = {}
  const actions: RunResult['actions'] = []
  if (!ep) return { output: `Der Computer "${host}" ist nicht verfügbar.`, actions, exitRemote: !!ctx.remote }
  const trimmed = line.trim()
  if (!trimmed) return { output: '', actions }
  const e: Env = {
    w,
    ep,
    ctx,
    host: ep.hostname,
    ps: ctx.shell === 'powershell',
    admin: ctx.admin || !!ctx.remote,
    user: ctx.remote ? w.tech.sam : ctx.user,
    adTools: !ctx.remote && ep.hostname.toUpperCase() === ADMIN_WORKSTATION,
    actions,
    res,
    cmd: '',
  }
  let output: string
  try {
    const statements = e.ps ? splitTop(trimmed, ';') : splitTop(trimmed, '&&')
    const outs: string[] = []
    for (const s of statements) {
      // Expansion von Umgebungsvariablen (%TEMP%, $env:TEMP …) vor dem Zerlegen
      const envOnly = e.ps ? s.trim().match(/^\$env:(\w+)$/i) : null
      if (envOnly) {
        outs.push(envVars(e).find(([k]) => k.toLowerCase() === envOnly[1].toLowerCase())?.[1] ?? '')
        continue
      }
      const expanded = expand(e, s)
      outs.push(runStatement(e, expanded))
      if (res.cwd) e.ctx = { ...e.ctx, cwd: res.cwd }
      if (res.exit || res.exitRemote || res.enterRemote) break
    }
    output = outs.filter((o, i) => o !== '' || i === outs.length - 1).join('\n')
  } catch (err) {
    output = `Interner Fehler des Simulators: ${(err as Error).message}`
  }
  return { output, ...res, actions }
}

