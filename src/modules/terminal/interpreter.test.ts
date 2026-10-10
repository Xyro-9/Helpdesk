import { beforeEach, describe, expect, it } from 'vitest'
import { produce } from 'immer'
import { createInitialWorld } from '@/core/seed'
import { A } from '@/core/actions'
import { findGroup, findUser, isMemberOf, lockUser, primaryComputerOf } from '@/core/ops/ad'
import { findService, getEndpoint, HOSTS_PATH, readFile } from '@/core/ops/endpoint'
import type { World } from '@/core/types'
import { runCommand, type RunResult, type ShellCtx } from './interpreter'

let w: World
let pc: string

function run(line: string, opts: Partial<ShellCtx> = {}): RunResult {
  let r!: RunResult
  w = produce(w, (d) => {
    r = runCommand(d, { hostname: pc, shell: 'cmd', cwd: 'C:\\Windows\\system32', admin: true, user: 'l.schulz', ...opts }, line)
  })
  return r
}
const ps = (line: string, opts: Partial<ShellCtx> = {}) => run(line, { shell: 'powershell', ...opts })
const adm = (line: string, opts: Partial<ShellCtx> = {}) => ps(line, { hostname: 'IT-ADM-01', user: 'azubi', ...opts })
const ep = () => getEndpoint(w, pc)!

beforeEach(() => {
  w = createInitialWorld('Test Azubi')
  pc = primaryComputerOf(w, 'l.schulz')!.name
})

describe('Netzwerk', () => {
  it('ipconfig /all zeigt die Konfiguration', () => {
    const r = run('ipconfig /all')
    expect(r.output).toContain('Windows-IP-Konfiguration')
    expect(r.output).toContain('Ethernet-Adapter Ethernet:')
    expect(r.output).toMatch(/DNS-Server[ .]*: 10\.10\.0\.10/)
    expect(r.output).toContain(`Hostname`)
    expect(r.output).toContain(pc)
  })

  it('ping fs01 funktioniert', () => {
    const r = run('ping fs01 -n 2')
    expect(r.output).toContain('Ping wird ausgeführt für fs01.musterwerk.local [10.10.0.20]')
    expect(r.output).toMatch(/Antwort von 10\.10\.0\.20: Bytes=32 Zeit[<=]\d+ms TTL=\d+/)
    expect(r.output).toContain('Gesendet = 2, Empfangen = 2, Verloren = 0')
  })

  it('falscher DNS-Server: ping und nslookup schlagen fehl, nach Korrektur ok', () => {
    expect(run('netsh interface ip set dns "Ethernet" static 8.8.8.8').output).toBe('Ok.')
    run('ipconfig /flushdns')
    expect(run('ping fs01').output).toContain('Ping-Anforderung konnte Host "fs01" nicht finden')
    const ns = run('nslookup intranet')
    expect(ns.output).toContain('Address:  8.8.8.8')
    expect(ns.output).toContain('Non-existent domain')
    const r = ps('Set-DnsClientServerAddress -InterfaceAlias Ethernet -ResetServerAddresses')
    expect(r.actions.map((a) => a.type)).toContain(A.networkChanged)
    expect(run('ping fs01 -n 1').output).toContain('Antwort von 10.10.0.20')
  })

  it('netsh ohne Adminrechte wird abgelehnt', () => {
    expect(run('netsh interface ip set dns "Ethernet" static 8.8.8.8', { admin: false }).output).toContain('erhöhte Rechte')
    expect(ep().adapters[0].dnsFromDhcp).toBe(true)
  })

  it('nslookup intern und extern', () => {
    const r = run('nslookup fs01')
    expect(r.output).toContain('Server:  dc01.musterwerk.local')
    expect(r.output).toContain('Address:  10.10.0.10')
    expect(r.output).toContain('Name:    fs01.musterwerk.local')
    expect(r.output).toContain('Address:  10.10.0.20')
    expect(run('nslookup www.suche.example').output).toContain('Nicht autorisierende Antwort')
    expect(run('nslookup gibtsnicht').output).toContain('*** dc01.musterwerk.local wurde gibtsnicht nicht gefunden: Non-existent domain')
  })

  it('Test-NetConnection mit Port', () => {
    const r = ps('Test-NetConnection fs01 -Port 445')
    expect(r.output).toMatch(/TcpTestSucceeded\s+: True/)
  })
})

describe('Dienste', () => {
  it('Get-Service / Start-Service in Admin- und Nicht-Admin-Shell', () => {
    expect(ps('Get-Service Spooler').output).toMatch(/Running\s+Spooler\s+Druckwarteschlange/)
    const denied = ps('Stop-Service Spooler', { admin: false })
    expect(denied.output).toContain('Zugriff verweigert')
    expect(findService(ep().services, 'Spooler')!.status).toBe('Wird ausgeführt')
    const stop = ps('Stop-Service -Name Spooler')
    expect(stop.actions).toContainEqual({ type: A.serviceChanged, target: pc, detail: 'Spooler beendet' })
    expect(ps('Get-Service Spooler').output).toContain('Stopped')
    expect(ps('Start-Service Spooler', { admin: false }).output).toContain('erhöhte Rechte')
    ps('Start-Service Spooler')
    expect(findService(ep().services, 'Spooler')!.status).toBe('Wird ausgeführt')
  })

  it('sc config und net start', () => {
    expect(run('sc config spooler start= disabled').output).toBe('[SC] ChangeServiceConfig ERFOLG')
    expect(findService(ep().services, 'Spooler')!.startType).toBe('Deaktiviert')
    run('net stop spooler')
    expect(run('net start spooler').output).toContain('Systemfehler 1058')
    expect(run('sc config spooler start= auto', { admin: false }).output).toContain('FEHLER 5')
    run('sc config spooler start= auto')
    expect(run('net start spooler').output).toContain('wurde erfolgreich gestartet')
    expect(run('sc query spooler').output).toContain('RUNNING')
  })

  it('Pipeline mit Where-Object und Select-Object', () => {
    ps('Stop-Service Spooler')
    const r = ps("Get-Service | Where-Object {$_.Status -eq 'Stopped'} | Select-Object Name,Status")
    expect(r.output).toContain('Spooler')
    expect(r.output).not.toContain('Dnscache')
    expect(run('tasklist | findstr spoolsv').output).toBe('')
  })
})

describe('Dateien, Netzlaufwerke, hosts', () => {
  it('net use: verbinden, löschen, Zugriff verweigert', () => {
    expect(run('net use').output).toContain('\\\\FS01\\Vertrieb')
    expect(run('net use S: /delete').output).toContain('S: wurde erfolgreich gelöscht.')
    expect(run('net use S: \\\\FS01\\Vertrieb /persistent:yes').output).toContain('Der Befehl wurde erfolgreich ausgeführt.')
    expect(ep().mappedDrives.some((d) => d.letter === 'S:')).toBe(true)
    const denied = run('net use X: \\\\FS01\\Buchhaltung')
    expect(denied.output).toContain('Systemfehler 5 aufgetreten.')
    expect(denied.output).toContain('Zugriff verweigert.')
  })

  it('hosts-Datei schreiben wirkt auf ping (nur als Admin)', () => {
    expect(run('echo 10.10.0.99 fs01 >> C:\\Windows\\System32\\drivers\\etc\\hosts', { admin: false }).output).toContain('Zugriff verweigert')
    const r = run('echo 10.10.0.99 fs01 >> %windir%\\System32\\drivers\\etc\\hosts')
    expect(r.output).toBe('')
    expect(r.actions[0].type).toBe(A.fileChanged)
    expect(readFile(ep(), HOSTS_PATH)).toContain('10.10.0.99 fs01')
    const p = run('ping fs01 -n 1')
    expect(p.output).toContain('[10.10.0.99]')
    expect(p.output).toContain('Zeitüberschreitung der Anforderung.')
    expect(run('type C:\\Windows\\System32\\drivers\\etc\\hosts').output).toContain('10.10.0.99 fs01')
    // per PowerShell wieder bereinigen
    ps('Set-Content -Path C:\\Windows\\System32\\drivers\\etc\\hosts -Value "# leer"')
    expect(run('ping fs01 -n 1').output).toContain('Antwort von 10.10.0.20')
  })

  it('del %TEMP%\\* gibt Speicher frei', () => {
    const part = () => ep().disks[0].partitions.find((p) => p.letter === 'C')!
    run('dir') // Endpunkt materialisieren
    const before = part().usedGb
    expect(run('dir %TEMP%').output).toContain('~tmp001.tmp')
    const r = run('del /q /s %TEMP%\\*')
    expect(r.actions.some((a) => a.type === A.fileChanged)).toBe(true)
    expect(part().usedGb).toBeLessThan(before)
    expect(run('dir %TEMP%').output).toContain('0 Datei(en)')
  })

  it('Remove-Item $env:TEMP\\* -Recurse und Ordnerwechsel', () => {
    ps('Remove-Item $env:TEMP\\* -Recurse -Force')
    expect(ps('Get-ChildItem $env:TEMP').output.trim()).toBe('')
    const cd = run('cd %USERPROFILE%\\Desktop')
    expect(cd.cwd).toBe('C:\\Users\\l.schulz\\Desktop')
    expect(run('cd ..', { cwd: 'C:\\Users\\l.schulz\\Desktop' }).cwd).toBe('C:\\Users\\l.schulz')
    expect(run('cd C:\\gibtsnicht').output).toContain('Das System kann den angegebenen Pfad nicht finden.')
  })

  it('Registry: reg add / Get-ItemProperty', () => {
    run('reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable /t REG_DWORD /d 1 /f')
    expect(ps('Get-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" -Name ProxyEnable').output).toMatch(/ProxyEnable\s+: 1/)
    ps('Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" -Name ProxyEnable -Value 0')
    expect(run('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable').output).toContain('REG_DWORD    0x0')
  })
})

describe('System', () => {
  it('gpupdate mit veraltetem Token und klist purge', () => {
    w = produce(w, (d) => {
      runCommand(d, { hostname: pc, shell: 'cmd', cwd: 'C:\\', admin: true, user: 'l.schulz' }, 'hostname')
      findGroup(d, 'GG_Projekt_Messe2026')!.members.push('l.schulz')
    })
    const r = run('gpupdate /force')
    expect(r.output).toContain('Die Computerrichtlinie wurde erfolgreich aktualisiert.')
    expect(r.output).toContain('ab- und wieder anmelden')
    expect(r.actions.map((a) => a.type)).toContain(A.gpupdate)
    expect(run('whoami /groups', { admin: false }).output).not.toContain('GG_Projekt_Messe2026')
    run('klist purge')
    expect(run('whoami /groups', { admin: false }).output).toContain('MUSTERWERK\\GG_Projekt_Messe2026')
  })

  it('Neustart', () => {
    const r = run('shutdown /r /t 0')
    expect(r.exit).toBe(true)
    expect(r.output).toContain('Die Sitzung wird getrennt')
    expect(r.actions).toContainEqual({ type: A.reboot, target: pc, detail: undefined })
  })

  it('Test-ComputerSecureChannel -Repair', () => {
    w = produce(w, (d) => {
      d.computers.find((c) => c.name === pc)!.secureChannelBroken = true
    })
    expect(ps('Test-ComputerSecureChannel').output).toBe('False')
    expect(ps('Test-ComputerSecureChannel -Repair', { admin: false }).output).toContain('Zugriff verweigert')
    expect(ps('Test-ComputerSecureChannel -Repair').output).toBe('True')
    expect(w.computers.find((c) => c.name === pc)!.secureChannelBroken).toBe(false)
  })

  it('unbekannter Befehl', () => {
    expect(run('xyz').output).toContain('Der Befehl "xyz" ist entweder falsch geschrieben oder')
    expect(ps('xyz').output).toContain('Die Benennung "xyz" wurde nicht als Name eines Cmdlet')
    expect(run('Get-Service').output).toContain('ist entweder falsch geschrieben')
    expect(run('help').output).toContain('ipconfig')
  })
})

describe('Active Directory (IT-ADM-01)', () => {
  it('Get-ADUser / Unlock-ADAccount / Set-ADAccountPassword', () => {
    w = produce(w, (d) => lockUser(d, 'l.schulz', pc))
    expect(adm('Get-ADUser l.schulz -Properties LockedOut').output).toMatch(/LockedOut\s+: True/)
    expect(adm('Search-ADAccount -LockedOut').output).toContain('l.schulz')
    const u = adm('Unlock-ADAccount -Identity l.schulz')
    expect(u.actions).toContainEqual({ type: A.adUnlock, target: 'l.schulz', detail: 'Unlock-ADAccount' })
    expect(findUser(w, 'l.schulz')!.lockedOut).toBe(false)
    expect(adm('Set-ADAccountPassword -Identity l.schulz -Reset -NewPassword (ConvertTo-SecureString "kurz" -AsPlainText -Force)').output).toContain('Domänenkennwortrichtlinie')
    const r = adm('Set-ADAccountPassword -Identity l.schulz -Reset -NewPassword (ConvertTo-SecureString "Leuchtturm42!x" -AsPlainText -Force)')
    expect(r.output).toBe('')
    expect(findUser(w, 'l.schulz')!.password).toBe('Leuchtturm42!x')
    expect(r.actions[0].type).toBe(A.adPasswordReset)
    expect(r.actions[0].detail).not.toContain('Leuchtturm')
    adm('Set-ADUser l.schulz -ChangePasswordAtLogon $true')
    expect(findUser(w, 'l.schulz')!.mustChangePassword).toBe(true)
  })

  it('Add-ADGroupMember / Get-ADGroupMember', () => {
    const r = adm('Add-ADGroupMember -Identity GG_VPN_Benutzer -Members p.braun')
    expect(r.actions).toContainEqual({ type: A.adGroupAdd, target: 'p.braun', detail: 'GG_VPN_Benutzer' })
    expect(isMemberOf(w, 'p.braun', 'GG_VPN_Benutzer')).toBe(true)
    expect(adm('Get-ADGroupMember GG_VPN_Benutzer | Select-Object SamAccountName').output).toContain('p.braun')
    expect(adm('Add-ADGroupMember -Identity Domänen-Admins -Members p.braun').output).toContain('Unzureichende Zugriffsrechte')
    adm('Remove-ADGroupMember -Identity GG_VPN_Benutzer -Members p.braun -Confirm:$false')
    expect(isMemberOf(w, 'p.braun', 'GG_VPN_Benutzer')).toBe(false)
  })

  it('AD-Cmdlets fehlen auf Clients', () => {
    expect(ps('Get-ADUser l.schulz').output).toContain('Die Benennung "Get-ADUser" wurde nicht als Name eines Cmdlet')
    expect(run('net user l.schulz /domain').output).toContain('Konto aktiv                           Ja')
  })

  it('Enter-PSSession, Befehle auf dem Ziel, Exit-PSSession', () => {
    run('hostname') // Ziel-Endpunkt erzeugen
    const enter = adm(`Enter-PSSession -ComputerName ${pc}`)
    expect(enter.enterRemote).toBe(pc)
    expect(enter.cwd).toBe('C:\\Users\\azubi\\Documents')
    const remote = { remote: pc, cwd: 'C:\\Users\\azubi\\Documents' }
    expect(adm('hostname', remote).output).toBe(pc)
    adm('Stop-Service Spooler', remote)
    expect(findService(ep().services, 'Spooler')!.status).toBe('Beendet')
    expect(adm('Get-ADUser l.schulz', remote).output).toContain('wurde nicht als Name eines Cmdlet')
    expect(adm('Exit-PSSession', remote).exitRemote).toBe(true)
    const inv = adm(`Invoke-Command -ComputerName ${pc} -ScriptBlock { Start-Service Spooler }`)
    expect(inv.actions.map((a) => a.type)).toContain(A.serviceChanged)
    expect(findService(ep().services, 'Spooler')!.status).toBe('Wird ausgeführt')
    // WinRM beendet → Verbindung schlägt fehl
    adm('Stop-Service WinRM', remote)
    expect(adm(`Enter-PSSession ${pc}`).output).toContain('WinRM')
  })

  it('Sperrquelle im DC-Sicherheitsprotokoll (Get-WinEvent -FilterHashtable)', () => {
    w = produce(w, (d) => lockUser(d, 'l.schulz', pc))
    const r = adm('Get-WinEvent -ComputerName DC01 -FilterHashtable @{LogName="Security"; Id=4740} -MaxEvents 5 | Format-List')
    expect(r.output).toContain('4740')
    expect(r.output).toContain(pc)
    expect(pc).toBe('PC-VT-004')
  })

  it('Start-ADSyncSyncCycle', () => {
    const r = adm('Start-ADSyncSyncCycle -PolicyType Delta')
    expect(r.output).toContain('Success')
    expect(r.actions[0].type).toBe(A.cloudSync)
  })
})
