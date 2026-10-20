// Systembefehle: systeminfo, whoami, Zeit, Gruppenrichtlinien, Kerberos, Prüfwerkzeuge, Ereignisse, Datenträger, Neustart

import { A } from '@/core/actions'
import { effectiveGroupsOf, findComputer, findGroup } from '@/core/ops/ad'
import { applyGpoMappings, freeGb, isServiceRunning, rebootEndpoint, refreshToken, tokenIsStale } from '@/core/ops/endpoint'
import type { Endpoint, WinEvent } from '@/core/types'
import { primaryConfig, reach } from '@/core/sim/network'
import { hashString } from '@/core/util'
import { canRemote } from './remote'
import { act, arg, argOrPos, elevationMsg, fmtD, fmtDT, fmtT, has, lowerArgs, num, obj, optVal, psArgs, psBool, psError, type Env, type Handler, type Rec } from './shell'

export const sid = (s: string) => `S-1-5-21-3623811015-3361044348-30300820-${1100 + (hashString(s) % 8000)}`

export function dcReachable(e: Env) {
  const ok = (ip: string, n: string) => reach(e.w, e.ep, ip).ok && !!e.w.infra.servers.find((s) => s.name === n)?.online
  return ok('10.10.0.10', 'DC01') || ok('10.10.0.11', 'DC02')
}

export const systeminfo: Handler = (e) => {
  const ep = e.ep
  const L = (k: string, v: string) => `${(k + ':').padEnd(47)}${v}`
  const cfgs = ep.adapters
  const used = ep.processes.reduce((s, p) => s + p.memMb, 0) + 2100
  return [
    '',
    L('Hostname', ep.hostname),
    L('Betriebssystemname', ep.os),
    L('Betriebssystemversion', `10.0.26100 Nicht zutreffend Build 26100`),
    L('Betriebssystemkonfiguration', 'Mitgliedsarbeitsstation'),
    L('Betriebssystem-Buildtyp', 'Multiprocessor Free'),
    L('Registrierter Benutzer', 'IT Musterwerk'),
    L('Registrierte Organisation', 'Musterwerk AG'),
    L('Ursprüngliches Installationsdatum', '01.01.2025, 00:00:00'),
    L('Systemstartzeit', `${fmtD(ep.lastBoot)}, ${fmtT(ep.lastBoot, true)}`),
    L('Systemhersteller', ep.manufacturer),
    L('Systemmodell', ep.model),
    L('Systemtyp', 'x64-based PC'),
    L('Prozessor(en)', '1 Prozessor(en) installiert.'),
    ' '.repeat(47) + `[01]: ${ep.cpu}`,
    L('BIOS-Version', `${ep.manufacturer} 1.24.0, 12.03.2025`),
    L('Seriennummer', ep.serial),
    L('Windows-Verzeichnis', 'C:\\Windows'),
    L('System-Verzeichnis', 'C:\\Windows\\system32'),
    L('Startgerät', '\\Device\\HarddiskVolume1'),
    L('Systemgebietsschema', 'de;Deutsch (Deutschland)'),
    L('Eingabegebietsschema', 'de;Deutsch (Deutschland)'),
    L('Zeitzone', ep.timeZone),
    L('Gesamter physischer Speicher', `${num(ep.ramGb * 1024)} MB`),
    L('Verfügbarer physischer Speicher', `${num(Math.max(512, ep.ramGb * 1024 - Math.round(used)))} MB`),
    L('Domäne', ep.domainJoined ? 'musterwerk.local' : 'WORKGROUP'),
    L('Anmeldeserver', '\\\\DC01'),
    L('Hotfix(es)', '3 Hotfix(e) installiert.'),
    ' '.repeat(47) + '[01]: KB5043080',
    ' '.repeat(47) + '[02]: KB5044284',
    ' '.repeat(47) + '[03]: KB5043937',
    L('Netzwerkkarte(n)', `${cfgs.length} Netzwerkadapter installiert.`),
    ...cfgs.flatMap((a, i) => [
      ' '.repeat(47) + `[${String(i + 1).padStart(2, '0')}]: ${a.description}`,
      ' '.repeat(53) + `Verbindungsname: ${a.name}`,
      ...(!a.enabled ? [' '.repeat(53) + 'Status:          Hardware nicht vorhanden'] : !a.mediaConnected ? [' '.repeat(53) + 'Status:          Medien getrennt'] : [' '.repeat(53) + `DHCP aktiviert:  ${a.dhcp ? 'Ja' : 'Nein'}`, ' '.repeat(53) + `IP-Adresse(n)`, ' '.repeat(53) + `[01]: ${a.ip}`]),
    ]),
    L('Hyper-V-Anforderungen', 'Ein Hypervisor wurde erkannt.'),
  ].join('\n')
}

// ─────────────── whoami ───────────────

const WELL_KNOWN = ['Jeder', 'VORDEFINIERT\\Benutzer', 'NT-AUTORITÄT\\INTERAKTIV', 'KONSOLENANMELDUNG', 'NT-AUTORITÄT\\Authentifizierte Benutzer', 'NT-AUTORITÄT\\Diese Organisation', 'LOKAL']

export function sessionGroups(e: Env): string[] {
  if (e.user === e.ep.loggedOnUser) return e.ep.tokenGroups
  return effectiveGroupsOf(e.w, e.user)
}

export const whoami: Handler = (e, args) => {
  const a = lowerArgs(args)
  const me = `musterwerk\\${e.user}`
  if (!a.length) return me
  if (a.includes('/upn')) return `${e.user}@musterwerk.example`
  if (a.includes('/fqdn')) return `CN=${e.user},OU=Benutzer,OU=Musterwerk,DC=musterwerk,DC=local`
  const out: string[] = []
  if (a.includes('/user') || a.includes('/all')) out.push('', 'BENUTZERINFORMATIONEN', '---------------------', '', 'Benutzername       SID', '================== =============================================', `${me.padEnd(18)} ${sid(e.user)}`)
  if (a.includes('/groups') || a.includes('/all')) {
    out.push('', '', 'GRUPPENINFORMATIONEN', '--------------------', '', `${'Gruppenname'.padEnd(46)} ${'Typ'.padEnd(16)} SID`, `${'='.repeat(46)} ${'='.repeat(16)} ${'='.repeat(46)}`)
    for (const g of WELL_KNOWN) out.push(`${g.padEnd(46)} ${'Bekannte Gruppe'.padEnd(16)} S-1-5-${hashString(g) % 40}`)
    if (e.admin) out.push(`${'VORDEFINIERT\\Administratoren'.padEnd(46)} ${'Alias'.padEnd(16)} S-1-5-32-544`)
    for (const g of sessionGroups(e)) {
      const grp = findGroup(e.w, g)
      out.push(`${('MUSTERWERK\\' + g).padEnd(46)} ${(grp?.scope === 'Lokal (Domäne)' ? 'Alias' : 'Gruppe').padEnd(16)} ${sid(g)}`)
    }
    out.push(`${(e.admin ? 'Verbindliche Beschriftung\\Hohe Verbindlichkeitsstufe' : 'Verbindliche Beschriftung\\Mittlere Verbindlichkeitsstufe').padEnd(46)} ${'Bezeichnung'.padEnd(16)} S-1-16-${e.admin ? 12288 : 8192}`)
    if (e.user === e.ep.loggedOnUser && tokenIsStale(e.w, e.ep)) out.push('', 'Hinweis (Simulator): Das Anmeldetoken ist veraltet – im AD wurden Gruppenmitgliedschaften geändert. Wirksam erst nach Ab-/Anmeldung oder "klist purge".')
  }
  if (a.includes('/priv') || a.includes('/all')) out.push('', 'BERECHTIGUNGSINFORMATIONEN', '--------------------------', '', 'SeShutdownPrivilege           Herunterfahren des Systems           Deaktiviert', 'SeChangeNotifyPrivilege       Auslassen der durchsuchenden Überprüfung Aktiviert', ...(e.admin ? ['SeDebugPrivilege              Debuggen von Programmen              Deaktiviert', 'SeBackupPrivilege             Sichern von Dateien und Verzeichnissen Deaktiviert'] : []))
  return out.length ? out.join('\n') : `FEHLER: Ungültiges Argument/ungültige Option - "${args[0]}".\nGeben Sie "WHOAMI /?" ein, um die Syntax anzuzeigen.`
}

// ─────────────── Zeit ───────────────

export const w32tm: Handler = (e, args) => {
  const s = lowerArgs(args).join(' ')
  const ep = e.ep
  const err = (m: string) => `Der folgende Fehler ist aufgetreten: ${m}`
  if (/\/tz/.test(s)) return 'Zeitzone: Aktuell:TIME_ZONE_ID_DAYLIGHT Abweichung: -60Min (UTC=Ortszeit+Abweichung)\n  [Standardname:"Mitteleuropäische Zeit" Abweichung:-0Min Datum:(M:10 D:5 DoW:0)]\n  [Sommerzeitname:"Mitteleuropäische Sommerzeit" Abweichung:-60Min Datum:(M:3 D:5 DoW:0)]'
  if (/\/stripchart/.test(s)) {
    const off = ep.timeOffsetMin * 60
    const rows = [0, 1, 2].map((i) => `${fmtT(new Date().toISOString(), true)}, d:+00.000${i}s o:${off >= 0 ? '+' : ''}${(off + i * 0.0003).toFixed(7)}s`)
    return `Verfolgung von DC01.musterwerk.local [10.10.0.10:123].\n3 Stichproben werden gesammelt.\nDie aktuelle Zeit ist ${fmtDT(new Date().toISOString())}.\n${rows.join('\n')}`
  }
  if (!isServiceRunning(ep, 'W32Time')) return err('Der Dienst wurde nicht gestartet. (0x80070426)\n(Tipp: Dienst "W32Time" (Windows-Zeitgeber) starten.)')
  if (/\/query/.test(s) && /\/status/.test(s)) {
    const synced = Math.abs(ep.timeOffsetMin) < 1
    return [
      'Sprungindikator: 0(keine Warnung)',
      `Stratum: ${synced ? '3 (Sekundärreferenz - synchronisiert über (S)NTP)' : '1 (Primärreferenz - synchronisiert über Funkuhr)'}`,
      'Präzision: -23 (119.209ns pro Tick)',
      'Stammverzögerung: 0.0011802s',
      'Stammabweichung: 7.7846934s',
      `Referenz-ID: ${synced ? '0x0A0A000A (Quell-IP:  10.10.0.10)' : '0x4C4F434C (Quellname:  "LOCL")'}`,
      `Letzte erfolgreiche Synchronisierungszeit: ${synced ? fmtDT(new Date(Date.now() - 1800_000).toISOString()) : 'nicht angegeben'}`,
      `Quelle: ${synced ? 'DC01.musterwerk.local' : 'Local CMOS Clock'}`,
      'Abrufintervall: 10 (1024s)',
      ...(synced ? [] : ['', `Hinweis (Simulator): Die Uhrzeit weicht um ${ep.timeOffsetMin} Minuten vom Domänencontroller ab. Kerberos toleriert max. 5 Minuten → "w32tm /resync".`]),
    ].join('\n')
  }
  if (/\/query/.test(s) && /\/source/.test(s)) return Math.abs(ep.timeOffsetMin) < 1 ? 'DC01.musterwerk.local' : 'Local CMOS Clock'
  if (/\/query/.test(s) && /\/peers/.test(s)) return '#Peers: 1\n\nPeer: DC01.musterwerk.local\nStatus: Aktiv\nVerbleibender Zeitraum: 812.1s\nModus: 3 (Client)\nStratum: 2 (Sekundärreferenz)'
  if (/\/resync/.test(s)) {
    if (!e.admin) return err('Zugriff verweigert (0x80070005).')
    if (!dcReachable(e)) return 'Befehl zum erneuten Synchronisieren wird an den lokalen Computer gesendet.\nDer Computer wurde nicht neu synchronisiert, da keine Zeitdaten verfügbar waren.\n(Domänencontroller nicht erreichbar.)'
    ep.timeOffsetMin = 0
    act(e, A.command, e.host, 'Zeit synchronisiert (w32tm /resync)')
    return 'Befehl zum erneuten Synchronisieren wird an den lokalen Computer gesendet.\nDer Befehl wurde erfolgreich ausgeführt.'
  }
  if (/\/config/.test(s)) {
    if (!e.admin) return err('Zugriff verweigert (0x80070005).')
    return 'Der Befehl wurde erfolgreich ausgeführt.'
  }
  return 'w32tm /query /status | /query /source | /query /peers | /resync [/force] | /tz | /stripchart /computer:dc01 /samples:3'
}

// ─────────────── Gruppenrichtlinien / Kerberos ───────────────

export function kerberosProblem(e: Env): string | undefined {
  const comp = findComputer(e.w, e.host)
  if (comp?.secureChannelBroken) return 'Die Vertrauensstellung zwischen dieser Arbeitsstation und der primären Domäne konnte nicht hergestellt werden.'
  if (Math.abs(e.ep.timeOffsetMin) > 5) return `Kerberos-Fehler: Die Systemzeit weicht um ${e.ep.timeOffsetMin} Minuten vom Domänencontroller ab (KRB_AP_ERR_SKEW).`
  return undefined
}

export const gpupdate: Handler = (e, args) => {
  const s = lowerArgs(args).join(' ')
  const ep = e.ep
  const out = ['Die Richtlinie wird aktualisiert...', '']
  if (!dcReachable(e)) {
    out.push('Die Computerrichtlinie konnte nicht erfolgreich aktualisiert werden. Folgende Fehler wurden festgestellt:', '', 'Fehler bei der Verarbeitung der Gruppenrichtlinie, da keine Verbindung mit einem Domänencontroller hergestellt werden konnte. Dies kann vorübergehend sein.', '', 'Die Benutzerrichtlinie konnte nicht erfolgreich aktualisiert werden.')
    return out.join('\n')
  }
  const krb = kerberosProblem(e)
  if (krb) {
    out.push('Die Computerrichtlinie konnte nicht erfolgreich aktualisiert werden. Folgende Fehler wurden festgestellt:', '', `Fehler bei der Verarbeitung der Gruppenrichtlinie. ${krb}`)
    return out.join('\n')
  }
  const msgs = applyGpoMappings(e.w, ep)
  act(e, A.gpupdate, e.host, s || undefined)
  if (!/target:user/.test(s)) out.push('Die Computerrichtlinie wurde erfolgreich aktualisiert.', '')
  if (!/target:computer/.test(s)) out.push('Die Benutzerrichtlinie wurde erfolgreich aktualisiert.', '')
  if (msgs.length) out.push('Ergebnis der Gruppenrichtlinien-Einstellungen:', ...msgs.map((m) => '  ' + m), '')
  if (tokenIsStale(e.w, ep)) out.push('Bestimmte Richtlinien (Gruppenmitgliedschaften, Freigabeberechtigungen) werden erst bei der nächsten Anmeldung wirksam:', 'Die Gruppenmitgliedschaften des Benutzers wurden im AD geändert – das Anmeldetoken ist noch alt.', 'Lösung: Benutzer ab- und wieder anmelden (oder "klist purge" bzw. Neustart).', '')
  if (ep.pendingReboot) out.push('Bestimmte Computerrichtlinien werden erst nach einem Neustart aktiviert.', '')
  return out.join('\n')
}

export const gpresult: Handler = (e, args) => {
  const s = lowerArgs(args).join(' ')
  if (/\/h\b|\/x\b/.test(s)) return 'Der HTML-/XML-Bericht steht im Simulator nicht zur Verfügung. Verwenden Sie "gpresult /r".'
  if (!/\/r|\/v|\/z/.test(s)) return 'Verwendung: gpresult /r [/scope user|computer]'
  const ep = e.ep
  const comp = findComputer(e.w, e.host)
  const nb = ep.kind === 'Notebook'
  const out = [
    '',
    'Gruppenrichtlinienergebnis-Tool v2.0',
    `Erstellt am ${fmtD(new Date().toISOString())} um ${fmtT(new Date().toISOString(), true)}`,
    '',
    '',
    `RSOP-Daten für MUSTERWERK\\${ep.loggedOnUser ?? e.user} auf ${ep.hostname} : Protokollierungsmodus`,
    '-'.repeat(70),
    '',
    'Betriebssystemkonfiguration:  Mitgliedsarbeitsstation',
    'Betriebssystemversion:        10.0.26100',
    'Standortname:                 Hamburg-Werk',
    'Servergespeichertes Profil:   Nicht zutreffend',
    `Lokales Profil:               C:\\Users\\${ep.loggedOnUser ?? e.user}`,
    'Über langsame Verbindung verbunden?: Nein',
    '',
  ]
  if (!/scope:?\s*user/.test(s)) {
    out.push('COMPUTEREINSTELLUNGEN', '-'.repeat(21), `    CN=${ep.hostname},${comp?.ou ?? 'OU=Computer,OU=Musterwerk,DC=musterwerk,DC=local'}`, `    Letzte Anwendung der Gruppenrichtlinie: ${fmtD(ep.gpo.lastApplied)} um ${fmtT(ep.gpo.lastApplied, true)}`, '    Gruppenrichtlinie wurde angewendet von: DC01.musterwerk.local', '    Schwellenwert für langsame Verbindung für Gruppenrichtlinie: 500 kbps', '    Domänenname:                  MUSTERWERK', '    Domänentyp:                   Windows 2008 oder höher', '')
    out.push('    Angewendete Gruppenrichtlinienobjekte', '    ' + '-'.repeat(37), '        MW-Computer-Basis', '        MW-WindowsUpdate (WSUS APP01)', ...(nb ? ['        MW-Notebooks-BitLocker-VPN'] : []), '        Default Domain Policy', '')
    out.push('    Der Computer ist Mitglied der folgenden Sicherheitsgruppen', '    ' + '-'.repeat(57), '        VORDEFINIERT\\Administratoren', '        Jeder', '        VORDEFINIERT\\Benutzer', '        NT-AUTORITÄT\\NETZWERK', '        NT-AUTORITÄT\\Authentifizierte Benutzer', '        Diese Organisation', `        ${ep.hostname}$`, '        Domänencomputer', '        Systemverbindlichkeitsstufe', '')
  }
  if (!/scope:?\s*computer/.test(s)) {
    out.push('BENUTZEREINSTELLUNGEN', '-'.repeat(21), `    CN=${ep.loggedOnUser ?? e.user},OU=Benutzer,OU=Musterwerk,DC=musterwerk,DC=local`, `    Letzte Anwendung der Gruppenrichtlinie: ${fmtD(ep.gpo.lastApplied)} um ${fmtT(ep.gpo.lastApplied, true)}`, '    Gruppenrichtlinie wurde angewendet von: DC01.musterwerk.local', '    Domänenname:                  MUSTERWERK', '')
    out.push('    Angewendete Gruppenrichtlinienobjekte', '    ' + '-'.repeat(37), '        MW-Benutzer-Basis', '        MW-Laufwerkszuordnungen', '        MW-Druckerzuordnungen', '        MW-Proxy-Einstellungen', '')
    out.push('    Der Benutzer ist Mitglied der folgenden Sicherheitsgruppen', '    ' + '-'.repeat(57), '        Jeder', '        VORDEFINIERT\\Benutzer', '        NT-AUTORITÄT\\INTERAKTIV', '        NT-AUTORITÄT\\Authentifizierte Benutzer', '        Diese Organisation', ...ep.tokenGroups.map((g) => `        ${g}`), '        Mittlere Verbindlichkeitsstufe')
    if (tokenIsStale(e.w, ep)) out.push('', '    Hinweis (Simulator): Die obige Liste stammt aus dem Anmeldetoken und weicht vom aktuellen AD-Stand ab.')
  }
  return out.join('\n')
}

export const klist: Handler = (e, args) => {
  const a = lowerArgs(args)
  const user = e.ep.loggedOnUser ?? e.user
  const head = `\nAktuelle Anmelde-ID ist 0:0x${(hashString(user) % 0xfffff).toString(16)}`
  if (a.includes('purge')) {
    refreshToken(e.w, e.ep)
    act(e, A.command, e.host, 'Kerberos-Tickets gelöscht (klist purge) – Token aktualisiert')
    return `${head}\n\tAlle Tickets löschen:\n\tTicket(s) gelöscht!\n\n(Simulator: Beim nächsten Zugriff werden neue Tickets mit den aktuellen Gruppenmitgliedschaften ausgestellt.)`
  }
  const krb = kerberosProblem(e)
  if (krb || !dcReachable(e)) return `${head}\n\nZwischengespeicherte Tickets: (0)\n${krb ? '\n' + krb : ''}`
  const now = Date.now()
  const t = (i: number, server: string) => [`#${i}>\tClient: ${user} @ MUSTERWERK.LOCAL`, `\tServer: ${server} @ MUSTERWERK.LOCAL`, '\tKerbTicket (Verschlüsselungstyp): AES-256-CTS-HMAC-SHA1-96', '\tTicketkennzeichen 0x40e10000 -> forwardable renewable initial pre_authent name_canonicalize', `\tStartzeit: ${fmtDT(new Date(now - 3600_000).toISOString())} (lokal)`, `\tEndzeit:   ${fmtDT(new Date(now + 9 * 3600_000).toISOString())} (lokal)`, `\tErneuerungszeit: ${fmtDT(new Date(now + 6 * 86400_000).toISOString())} (lokal)`, '\tSitzungsschlüsseltyp: AES-256-CTS-HMAC-SHA1-96', `\tCachekennzeichen: ${i === 0 ? '0x1 -> PRIMARY' : '0'}`, '\tKdc aufgerufen: DC01.musterwerk.local', ''].join('\n')
  const tickets = [t(0, 'krbtgt/MUSTERWERK.LOCAL'), t(1, 'cifs/FS01.musterwerk.local'), t(2, 'LDAP/DC01.musterwerk.local/musterwerk.local')]
  return `${head}\n\nZwischengespeicherte Tickets: (${tickets.length})\n\n${tickets.join('\n')}`
}

// ─────────────── Prüfwerkzeuge ───────────────

export const sfc: Handler = (e, args) => {
  if (!e.admin) return 'Sie müssen als Administrator eine Konsolensitzung ausführen, um das Hilfsprogramm "sfc" zu verwenden.'
  if (!lowerArgs(args).some((x) => x === '/scannow' || x === '/verifyonly')) return 'Systemdatei-Überprüfungsprogramm\n\nSFC [/SCANNOW] [/VERIFYONLY]'
  return 'Systemüberprüfung wird gestartet. Dieser Vorgang wird einige Zeit in Anspruch nehmen.\n\nÜberprüfungsphase der Systemüberprüfung wird gestartet.\nÜberprüfung 100 % abgeschlossen.\n\nDer Windows-Ressourcenschutz hat keine Integritätsverletzungen gefunden.'
}

export const dism: Handler = (e) => (e.admin ? 'Tool zur Imageverwaltung für die Bereitstellung\nVersion: 10.0.26100.1\n\nAbbildversion: 10.0.26100.2033\n\n[==========================100.0%==========================]\nEs wurde keine Komponentenspeicherbeschädigung erkannt.\nDer Vorgang wurde erfolgreich beendet.' : 'Fehler: 740\n\nFür DISM sind erhöhte Rechte erforderlich.\nFühren Sie DISM über eine Eingabeaufforderung mit erhöhten Rechten aus.')

function partition(ep: Endpoint, letter: string) {
  for (const d of ep.disks) for (const p of d.partitions) if (p.letter === letter.replace(':', '').toUpperCase()) return { d, p }
  return undefined
}

export const chkdsk: Handler = (e, args) => {
  const drive = (args.find((x) => /^[a-z]:$/i.test(x)) ?? 'C:').toUpperCase()
  const fix = lowerArgs(args).some((x) => x === '/f' || x === '/r')
  const part = partition(e.ep, drive)
  if (!part) return `Das Laufwerk ${drive} wurde nicht gefunden.`
  if (!e.admin) return 'Zugriff verweigert, da Sie nicht über ausreichende Berechtigungen verfügen\noder der Datenträger von einem anderen Prozess gesperrt wurde.\nSie müssen dieses Programm in einem Modus mit erhöhten Rechten ausführen.'
  if (fix) {
    e.ep.pendingReboot = true
    act(e, A.diskChanged, e.host, `chkdsk ${drive} beim Neustart geplant`)
    return `Der Typ des Dateisystems ist ${part.p.fs ?? 'NTFS'}.\nCHKDSK kann nicht ausgeführt werden, da das Volume von einem anderen\nProzess verwendet wird. Soll dieses Volume beim nächsten Neustart\ndes Systems überprüft werden? (J/N) J\n\nDieses Volume wird beim nächsten Neustart des Systems überprüft.`
  }
  const totalKb = Math.round(part.p.sizeGb * 1024 * 1024)
  const freeKb = Math.round((part.p.sizeGb - part.p.usedGb) * 1024 * 1024)
  return [`Der Typ des Dateisystems ist ${part.p.fs ?? 'NTFS'}.`, `Die Volumebezeichnung ist ${part.p.label ?? ''}.`, '', 'WARNUNG: Der Parameter /F wurde nicht angegeben.', 'CHKDSK wird im schreibgeschützten Modus ausgeführt.', '', 'Phase 1: Die Basisdateisystemstruktur wird untersucht...', 'Phase 2: Die Dateinamensverknüpfung wird untersucht...', 'Phase 3: Sicherheitsbeschreibungen werden untersucht...', '', part.p.health === 'Fehlerfrei' ? 'Windows hat das Dateisystem überprüft und keine Probleme festgestellt.\nKeine weiteren Aktionen erforderlich.' : 'Windows hat Probleme im Dateisystem gefunden.\nFühren Sie CHKDSK mit der Option /F (Fix) aus, um die Probleme zu beheben.', '', `${num(totalKb).padStart(15)} KB Speicherplatz auf dem Datenträger insgesamt.`, `${num(freeKb).padStart(15)} KB auf dem Datenträger verfügbar.`, '', `Datenträger-Status (SMART): ${part.d.smart}`].join('\n')
}

export const manageBde: Handler = (e, args) => {
  const a = lowerArgs(args)
  if (!e.admin) return 'FEHLER: Für diesen Vorgang sind Administratorrechte erforderlich.\n(Eingabeaufforderung als Administrator ausführen)'
  const head = 'BitLocker-Laufwerkverschlüsselung: Konfigurationstool, Version 10.0.26100\nCopyright (C) 2013 Microsoft Corporation. Alle Rechte vorbehalten.\n'.replace(/\nCopyright.*\n/, '\n')
  const drive = (args.find((x) => /^[a-z]:$/i.test(x)) ?? 'C:').toUpperCase()
  if (a.includes('-resume') || (a.includes('-protectors') && a.includes('-enable'))) {
    const part = partition(e.ep, drive)
    if (!part?.p.bitlocker || part.p.bitlocker === 'Aus') return `${head}\nFEHLER: Das Volume ${drive} ist nicht mit BitLocker verschlüsselt.`
    part.p.bitlocker = 'Ein'
    act(e, A.diskChanged, e.host, `BitLocker-Schutz auf ${drive} fortgesetzt`)
    return `${head}\nDer Schutz für Volume ${drive} wurde fortgesetzt.`
  }
  if (a.includes('-pause') || (a.includes('-protectors') && a.includes('-disable'))) {
    const part = partition(e.ep, drive)
    if (!part?.p.bitlocker || part.p.bitlocker === 'Aus') return `${head}\nFEHLER: Das Volume ${drive} ist nicht mit BitLocker verschlüsselt.`
    part.p.bitlocker = 'Angehalten'
    act(e, A.diskChanged, e.host, `BitLocker-Schutz auf ${drive} angehalten`)
    return `${head}\nDie Schlüsselschutzvorrichtungen für Volume ${drive} wurden deaktiviert.`
  }
  if (a.includes('-protectors') && a.includes('-get')) {
    const comp = findComputer(e.w, e.host)
    const k = comp?.bitlockerKeys[0]
    if (!k) return `${head}\nFEHLER: Für Volume ${drive} sind keine Schlüsselschutzvorrichtungen vorhanden.`
    return `${head}\nVolume "${drive}" [Windows]\nAlle Schlüsselschutzvorrichtungen\n\n    TPM:\n      ID: {${k.keyId}-0000-4000-8000-${k.keyId}0000}\n\n    Numerisches Kennwort:\n      ID: {${k.keyId}-...}\n      Kennwort:\n        ${k.recoveryPassword}`
  }
  if (!a.includes('-status')) return `${head}\nmanage-bde -status [Laufwerk] | -protectors -get C: | -resume C: | -pause C:`
  const out = [head, 'Volumes mit BitLocker-Laufwerkverschlüsselung:', '']
  for (const d of e.ep.disks)
    for (const p of d.partitions.filter((x) => x.letter)) {
      const on = p.bitlocker === 'Ein' || p.bitlocker === 'Angehalten'
      out.push(`Volume "${p.letter}:" [${p.label ?? ''}]`, '[Betriebssystemvolume]', '', `    Größe:                        ${num(p.sizeGb, 2)} GB`, '    BitLocker-Version:            2.0', `    Konvertierungsstatus:         ${on ? 'Nur verwendeter Speicherplatz verschlüsselt' : 'Vollständig entschlüsselt'}`, `    Verschlüsselt (Prozent):      ${on ? '100,0' : '0,0'} %`, `    Verschlüsselungsmethode:      ${on ? 'XTS-AES 128' : 'Kein'}`, `    Schutzstatus:                 ${p.bitlocker === 'Ein' ? 'Der Schutz ist aktiviert.' : p.bitlocker === 'Angehalten' ? 'Der Schutz ist deaktiviert (angehalten).' : 'Der Schutz ist deaktiviert.'}`, '    Sperrungsstatus:              Entsperrt', '    ID-Feld:                      Unbekannt', `    Schlüsselschutzvorrichtungen: ${on ? '\n        TPM\n        Numerisches Kennwort' : 'Keine gefunden'}`, '')
    }
  return out.join('\n')
}

export const cleanmgr: Handler = () => 'Die Datenträgerbereinigung ist ein grafisches Programm – bitte im Remote-Desktop öffnen.\nTipp (Terminal): temporäre Dateien löschen mit\n  del /q /s %TEMP%\\*            (cmd)\n  Remove-Item $env:TEMP\\* -Recurse -Force   (PowerShell)\nFreien Speicher prüfen: dir C:\\  bzw.  Get-PSDrive C'

export const wmic: Handler = (e, args) => {
  const s = lowerArgs(args).join(' ')
  const ep = e.ep
  if (/bios get serialnumber/.test(s)) return `SerialNumber\n${ep.serial}`
  if (/computersystem get/.test(s)) return `Manufacturer       Model                 Name\n${ep.manufacturer.padEnd(19)}${ep.model.padEnd(22)}${ep.hostname}`
  if (/os get/.test(s)) return `Caption\n${ep.os}`
  if (/logicaldisk get/.test(s)) return ['Caption  FreeSpace      Size', ...ep.disks.flatMap((d) => d.partitions.filter((p) => p.letter).map((p) => `${(p.letter + ':').padEnd(9)}${String(Math.round((p.sizeGb - p.usedGb) * 1073741824)).padEnd(15)}${Math.round(p.sizeGb * 1073741824)}`))].join('\n')
  if (/qfe/.test(s)) return 'HotFixID   InstalledOn\nKB5043080  12.09.2026\nKB5044284  08.10.2026\nKB5043937  12.09.2026'
  if (/cpu get/.test(s)) return `Name\n${ep.cpu}`
  return 'WMIC ist veraltet. Unterstützt: wmic bios get serialnumber | computersystem get model,manufacturer | os get caption | logicaldisk get caption,freespace,size | qfe list | cpu get name'
}

export const getComputerInfo: Handler = (e) => {
  const ep = e.ep
  return obj([{ WindowsProductName: ep.os, WindowsVersion: '2009', OsBuildNumber: '26100', OsVersion: '10.0.26100', OsDisplayVersion: '24H2', CsName: ep.hostname, CsDomain: 'musterwerk.local', CsManufacturer: ep.manufacturer, CsModel: ep.model, BiosSeralNumber: ep.serial, CsProcessors: ep.cpu, CsTotalPhysicalMemory: ep.ramGb * 1073741824, OsLastBootUpTime: fmtDT(ep.lastBoot), OsLocale: 'de-DE', TimeZone: ep.timeZone, LogonServer: '\\\\DC01', CsUserName: `MUSTERWERK\\${ep.loggedOnUser ?? e.user}` }], ['WindowsProductName', 'WindowsVersion', 'OsBuildNumber', 'OsDisplayVersion', 'CsName', 'CsDomain', 'CsManufacturer', 'CsModel', 'BiosSeralNumber', 'CsProcessors', 'CsTotalPhysicalMemory', 'OsLastBootUpTime', 'TimeZone', 'LogonServer', 'CsUserName'], true)
}

export const getHotFix: Handler = (e) =>
  obj(
    [
      ['Update', 'KB5043080', '12.09.2026'],
      ['Security Update', 'KB5044284', '08.10.2026'],
      ['Update', 'KB5043937', '12.09.2026'],
    ].map(([d, id, dt]) => ({ Source: e.host, Description: d, HotFixID: id, InstalledBy: 'NT-AUTORITÄT\\SYSTEM', InstalledOn: dt })),
    ['Source', 'Description', 'HotFixID', 'InstalledBy', 'InstalledOn'],
  )

// ─────────────── Ereignisse ───────────────

const LOGS: Record<string, WinEvent['log']> = { system: 'System', application: 'Anwendung', anwendung: 'Anwendung', security: 'Sicherheit', sicherheit: 'Sicherheit', setup: 'Setup' }
const LEVEL_EN: Record<string, string> = { Fehler: 'Error', Kritisch: 'Error', Warnung: 'Warning', Informationen: 'Information', 'Überprüfung erfolgreich': 'SuccessAudit', 'Überprüfung fehlgeschlagen': 'FailureAudit' }

function eventsFor(e: Env, computer: string | undefined): WinEvent[] | string {
  if (!computer || computer.toLowerCase() === e.host.toLowerCase() || computer === '.' || computer.toLowerCase() === 'localhost') return e.ep.events
  const srv = e.w.infra.servers.find((s) => s.name.toLowerCase() === computer.toLowerCase().replace(/\.musterwerk\.local$/, ''))
  if (srv) {
    if (!srv.online) return `Der RPC-Server ist nicht verfügbar. (${srv.name})`
    return srv.events
  }
  const r = canRemote(e, computer)
  return r.ok ? r.ep.events : r.error
}

export const getEventLog: Handler = (e, args) => {
  const a = psArgs(args, ['list', 'asstring'])
  if (has(a, 'list')) return obj(['Anwendung', 'Sicherheit', 'Setup', 'System'].map((l) => ({ 'Max(K)': 20480, Retain: 0, OverflowAction: 'OverwriteAsNeeded', Entries: 300, Log: l })), ['Max(K)', 'Retain', 'OverflowAction', 'Entries', 'Log'])
  const logName = argOrPos(a, 0, 'logname')
  const log = logName ? LOGS[logName.toLowerCase()] : undefined
  if (!log) return psError(e, `Das Ereignisprotokoll "${logName ?? ''}" auf dem Computer "." ist nicht vorhanden. Gültig: System, Application, Security, Setup.`, 'InvalidOperation')
  const src = eventsFor(e, arg(a, 'computername', 'cn'))
  if (typeof src === 'string') return psError(e, src, 'ResourceUnavailable')
  const type = arg(a, 'entrytype')
  const inst = arg(a, 'instanceid')
  const source = arg(a, 'source')
  let ev = src.filter((x) => x.log === log)
  if (type) ev = ev.filter((x) => type.split(',').some((t) => LEVEL_EN[x.level]?.toLowerCase() === t.trim().toLowerCase()))
  if (inst) ev = ev.filter((x) => inst.split(',').includes(String(x.eventId)))
  if (source) ev = ev.filter((x) => x.source.toLowerCase().includes(source.toLowerCase()))
  ev = [...ev].sort((x, y) => y.time.localeCompare(x.time)).slice(0, Number(arg(a, 'newest') ?? 50))
  if (!ev.length) return 'Keine Einträge gefunden, die den angegebenen Suchkriterien entsprechen.'
  return obj(
    ev.map((x, i) => ({ Index: 9000 - i, Time: `${fmtD(x.time).slice(0, 6)} ${fmtT(x.time)}`, EntryType: LEVEL_EN[x.level] ?? x.level, Source: x.source, InstanceID: x.eventId, Message: x.message.replace(/\n+/g, ' '), TimeGenerated: fmtDT(x.time), MachineName: x.computer, UserName: x.user ?? '' })),
    ['Index', 'Time', 'EntryType', 'Source', 'InstanceID', 'Message'],
  )
}

export const getWinEvent: Handler = (e, args, rest) => {
  const a = psArgs(args, ['listlog', 'oldest'])
  let logName: string | undefined = argOrPos(a, 0, 'logname')
  let level: string | undefined
  let id: string | undefined
  const fh = arg(a, 'filterhashtable')
  if (fh) {
    logName = fh.match(/logname\s*=\s*['"]?([\w-]+)/i)?.[1]
    level = fh.match(/level\s*=\s*['"]?(\d+)/i)?.[1]
    id = fh.match(/\bid\s*=\s*['"]?([\d,]+)/i)?.[1]
  } else if (/@\{/.test(rest)) {
    logName = rest.match(/logname\s*=\s*['"]?([\w-]+)/i)?.[1]
  }
  const log = logName ? LOGS[logName.toLowerCase()] : undefined
  if (!log) return psError(e, `Es wurden keine Ereignisprotokolle gefunden, die "${logName ?? ''}" entsprechen. Beispiel: Get-WinEvent -LogName System -MaxEvents 10`, 'ObjectNotFound')
  const src = eventsFor(e, arg(a, 'computername', 'cn'))
  if (typeof src === 'string') return psError(e, src, 'ResourceUnavailable')
  let ev = src.filter((x) => x.log === log)
  if (level) ev = ev.filter((x) => (level === '1' ? x.level === 'Kritisch' : level === '2' ? x.level === 'Fehler' : level === '3' ? x.level === 'Warnung' : x.level === 'Informationen' || x.level.startsWith('Überprüfung')))
  if (id) ev = ev.filter((x) => id!.split(',').includes(String(x.eventId)))
  ev = [...ev].sort((x, y) => y.time.localeCompare(x.time)).slice(0, Number(arg(a, 'maxevents') ?? 50))
  if (!ev.length) return psError(e, 'Es wurden keine Ereignisse gefunden, die den angegebenen Auswahlkriterien entsprechen.', 'ObjectNotFound')
  return obj(
    ev.map((x) => ({ TimeCreated: fmtDT(x.time), Id: x.eventId, LevelDisplayName: x.level, ProviderName: x.source, Message: x.message.replace(/\n+/g, ' | '), MachineName: x.computer })),
    ['TimeCreated', 'Id', 'LevelDisplayName', 'Message'],
  )
}

// ─────────────── Vertrauensstellung ───────────────

export const testComputerSecureChannel: Handler = (e, args) => {
  const a = psArgs(args, ['repair', 'verbose'])
  const comp = findComputer(e.w, e.host)
  if (!comp) return psError(e, 'Der Computer ist nicht Mitglied einer Domäne.')
  const verbose = has(a, 'verbose')
  if (has(a, 'repair')) {
    if (!e.admin) return psError(e, 'Zugriff verweigert. Für die Reparatur des sicheren Kanals sind Administratorrechte erforderlich.', 'PermissionDenied')
    if (!dcReachable(e)) return psError(e, 'Der Domänencontroller ist nicht erreichbar.', 'ResourceUnavailable')
    const was = comp.secureChannelBroken
    comp.secureChannelBroken = false
    if (was) act(e, A.adComputerUpdated, comp.name, 'Vertrauensstellung repariert (Test-ComputerSecureChannel -Repair)')
    return `${verbose ? `AUSFÜHRLICH: Der sichere Kanal zwischen dem lokalen Computer und der Domäne musterwerk.local wurde ${was ? 'erfolgreich repariert' : 'überprüft und ist in Ordnung'}.\n` : ''}True`
  }
  if (!dcReachable(e)) return `${verbose ? 'AUSFÜHRLICH: Der Domänencontroller ist nicht erreichbar.\n' : ''}False`
  const ok = !comp.secureChannelBroken
  return `${verbose ? `AUSFÜHRLICH: Der sichere Kanal zwischen dem lokalen Computer und der Domäne musterwerk.local ist ${ok ? 'in gutem Zustand' : 'unterbrochen'}.\n` : ''}${psBool(ok)}`
}

export const resetComputerMachinePassword: Handler = (e) => {
  if (!e.admin) return psError(e, 'Zugriff verweigert.', 'PermissionDenied')
  const comp = findComputer(e.w, e.host)
  if (!comp) return psError(e, 'Der Computer ist nicht Mitglied einer Domäne.')
  if (!dcReachable(e)) return psError(e, 'Der Domänencontroller ist nicht erreichbar.', 'ResourceUnavailable')
  const was = comp.secureChannelBroken
  comp.secureChannelBroken = false
  if (was) act(e, A.adComputerUpdated, comp.name, 'Computerkennwort zurückgesetzt (Reset-ComputerMachinePassword)')
  return ''
}

// ─────────────── Datenträger ───────────────

export const getPSDrive: Handler = (e, args) => {
  const a = psArgs(args)
  const name = argOrPos(a, 0, 'name')?.replace(':', '').toUpperCase()
  const rows: Rec[] = []
  for (const d of e.ep.disks) for (const p of d.partitions.filter((x) => x.letter)) rows.push({ Name: p.letter, 'Used (GB)': Math.round(p.usedGb * 100) / 100, 'Free (GB)': freeGb(e.ep, p.letter + ':'), Provider: 'FileSystem', Root: `${p.letter}:\\`, CurrentLocation: e.ctx.cwd.startsWith(p.letter + ':') ? e.ctx.cwd.slice(3) : '' })
  for (const m of e.ep.mappedDrives) rows.push({ Name: m.letter[0], 'Used (GB)': '', 'Free (GB)': '', Provider: 'FileSystem', Root: m.path, CurrentLocation: '' })
  if (!name) rows.push(...['Alias', 'Cert', 'Env', 'Function', 'HKCU', 'HKLM', 'Variable', 'WSMan'].map((n) => ({ Name: n, 'Used (GB)': '', 'Free (GB)': '', Provider: n.startsWith('HK') ? 'Registry' : n, Root: n.startsWith('HK') ? (n === 'HKCU' ? 'HKEY_CURRENT_USER' : 'HKEY_LOCAL_MACHINE') : '\\', CurrentLocation: '' })))
  const sel = name ? rows.filter((r) => String(r.Name).toUpperCase() === name) : rows
  if (name && !sel.length) return psError(e, `Es wurde kein Laufwerk mit dem Namen "${name}" gefunden.`, 'ObjectNotFound')
  return obj(sel, ['Name', 'Used (GB)', 'Free (GB)', 'Provider', 'Root', 'CurrentLocation'])
}

export const getVolume: Handler = (e) => {
  const rows: Rec[] = []
  for (const d of e.ep.disks)
    for (const p of d.partitions) rows.push({ DriveLetter: p.letter ?? '', FriendlyName: p.label ?? (p.type === 'Wiederherstellung' ? 'Wiederherstellung' : ''), FileSystemType: p.fs ?? 'Unknown', DriveType: d.kind === 'USB' ? 'Removable' : 'Fixed', HealthStatus: p.health === 'Fehlerfrei' ? 'Healthy' : p.health === 'Fehlerhaft' ? 'Unhealthy' : 'Unknown', OperationalStatus: 'OK', SizeRemaining: `${num(p.sizeGb - p.usedGb, 2)} GB`, Size: `${num(p.sizeGb, 2)} GB` })
  return obj(rows, ['DriveLetter', 'FriendlyName', 'FileSystemType', 'DriveType', 'HealthStatus', 'OperationalStatus', 'SizeRemaining', 'Size'])
}

const health = (s: string) => (s === 'OK' ? 'Healthy' : s === 'Warnung' ? 'Warning' : 'Unhealthy')

export const getDisk: Handler = (e) => obj(e.ep.disks.map((d) => ({ Number: d.number, 'Friendly Name': d.model, 'Serial Number': `S${hashString(d.model + e.host) % 100000000}`, 'HealthStatus': health(d.smart), 'OperationalStatus': d.status, 'Total Size': `${num(d.sizeGb, 2)} GB`, 'Partition Style': d.partitionStyle })), ['Number', 'Friendly Name', 'Serial Number', 'HealthStatus', 'OperationalStatus', 'Total Size', 'Partition Style'])

export const getPhysicalDisk: Handler = (e) => obj(e.ep.disks.map((d) => ({ Number: d.number, FriendlyName: d.model, SerialNumber: `S${hashString(d.model + e.host) % 100000000}`, MediaType: d.kind === 'HDD' ? 'HDD' : d.kind === 'SSD' ? 'SSD' : 'Unspecified', CanPool: false, OperationalStatus: d.status === 'Online' ? 'OK' : d.status, HealthStatus: health(d.smart), Usage: 'Auto-Select', Size: `${num(d.sizeGb, 2)} GB` })), ['Number', 'FriendlyName', 'SerialNumber', 'MediaType', 'CanPool', 'OperationalStatus', 'HealthStatus', 'Usage', 'Size'])

export const getBitLockerVolume: Handler = (e) => {
  if (!e.admin) return elevationMsg(e)
  const rows: Rec[] = []
  for (const d of e.ep.disks) for (const p of d.partitions.filter((x) => x.letter)) rows.push({ ComputerName: e.host, MountPoint: `${p.letter}:`, VolumeType: 'OperatingSystem', EncryptionMethod: p.bitlocker && p.bitlocker !== 'Aus' ? 'XtsAes128' : 'None', VolumeStatus: p.bitlocker && p.bitlocker !== 'Aus' ? 'FullyEncrypted' : 'FullyDecrypted', ProtectionStatus: p.bitlocker === 'Ein' ? 'On' : 'Off', LockStatus: 'Unlocked', EncryptionPercentage: p.bitlocker && p.bitlocker !== 'Aus' ? 100 : 0, KeyProtector: p.bitlocker && p.bitlocker !== 'Aus' ? '{Tpm, RecoveryPassword}' : '{}' })
  return obj(rows, ['ComputerName', 'MountPoint', 'VolumeType', 'EncryptionMethod', 'VolumeStatus', 'ProtectionStatus', 'LockStatus', 'EncryptionPercentage', 'KeyProtector'])
}

// ─────────────── Neustart / Abmelden ───────────────

export function doReboot(e: Env, ep: Endpoint = e.ep) {
  rebootEndpoint(e.w, ep)
  act(e, A.reboot, ep.hostname)
  if (ep === e.ep) {
    if (e.ctx.remote) e.res.exitRemote = true
    else e.res.exit = true
  }
  return `Die Sitzung wird getrennt … Der Computer ${ep.hostname} wird neu gestartet.\n(Die Verbindung zur Konsole wird beendet. Nach dem Neustart sind Dienste, DNS-Cache und Anmeldetoken neu initialisiert.)`
}

export const shutdown: Handler = (e, args) => {
  const a = lowerArgs(args)
  if (a.includes('/a')) return 'Es ist kein Herunterfahren geplant, das abgebrochen werden kann.(1116)'
  if (a.includes('/l')) return logoff(e, [], '')
  if (a.includes('/r') || a.includes('-r') || a.includes('/g')) {
    const m = optVal(a, '/m')
    if (m) {
      const r = canRemote(e, m.replace(/^\\\\/, ''))
      if (!r.ok) return `${m.replace(/^\\\\/, '')}: Der Netzwerkpfad wurde nicht gefunden.(53)`
      return doReboot(e, r.ep)
    }
    return doReboot(e)
  }
  if (a.includes('/s') || a.includes('/p')) return 'Herunterfahren wird im Simulator nicht unterstützt (der Rechner wäre danach nicht mehr erreichbar). Verwenden Sie "shutdown /r /t 0" für einen Neustart.'
  return 'Verwendung: shutdown /r /t 0 (Neustart) | /l (Abmelden) | /a (Abbrechen) | /m \\\\Computer /r'
}


export const restartComputer: Handler = (e, args) => {
  const a = psArgs(args, ['force', 'wait', 'confirm'])
  const target = argOrPos(a, 0, 'computername', 'cn')
  if (target && target.toLowerCase() !== e.host.toLowerCase() && target !== 'localhost' && target !== '.') {
    const r = canRemote(e, target)
    if (!r.ok) return psError(e, r.error, 'OpenError')
    if (r.ep.loggedOnUser && !has(a, 'force')) return psError(e, `Der Computer "${r.ep.hostname}" kann nicht neu gestartet werden: Auf dem Computer sind Benutzer angemeldet. Verwenden Sie -Force, um den Neustart zu erzwingen.`, 'OperationStopped')
    return doReboot(e, r.ep)
  }
  if (!e.admin) return elevationMsg(e)
  return doReboot(e)
}

export function logoff(e: Env, _a: string[], _r: string) {
  refreshToken(e.w, e.ep)
  applyGpoMappings(e.w, e.ep, true)
  act(e, A.command, e.host, 'Benutzer ab- und wieder angemeldet (Token aktualisiert)')
  if (e.ctx.remote) e.res.exitRemote = true
  else e.res.exit = true
  return 'Die Sitzung wird abgemeldet …\n(Simulator: Der Benutzer meldet sich danach neu an – Anmeldetoken und Gruppenrichtlinien sind aktualisiert.)'
}

export const getDate: Handler = (e) => {
  const d = new Date(Date.now() + e.ep.timeOffsetMin * 60000)
  return d.toLocaleString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export const ipFor = (e: Env) => primaryConfig(e.ep)?.ip ?? ''
