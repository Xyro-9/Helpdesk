// "net"-Befehle (use, user, localgroup, view, accounts, start/stop) und Drucker-Cmdlets

import { A } from '@/core/actions'
import { directGroupsOf, findGroup, findUser, isMemberOf, resetPassword } from '@/core/ops/ad'
import { connectPrinter, mapDrive, parseUnc, printerEffectiveStatus, removePrinter, setDefaultPrinter, shareAccess, unmapDrive } from '@/core/ops/endpoint'
import { reach, resolveName } from '@/core/sim/network'
import { netService } from './svc'
import { dcReachable } from './sys'
import { act, arg, argOrPos, fmtDT, has, isObj, obj, psArgs, psError, wildToRe, type Env, type Handler } from './shell'

const OK = 'Der Befehl wurde erfolgreich ausgeführt.'

export const sysErr = (msg: string) => {
  const m = msg.match(/^Systemfehler (\d+):\s*(.*)$/)
  return m ? `Systemfehler ${m[1]} aufgetreten.\n\n${m[2]}` : msg
}

/** Server einer UNC-Freigabe erreichbar? (Namensauflösung + Netzwerk) */
export function uncReachable(e: Env, unc: string): string | null {
  const u = parseUnc(unc)
  if (!u) return 'Systemfehler 67: Der Netzwerkname wurde nicht gefunden.'
  const r = resolveName(e.w, e.ep, u.server, { writeCache: true })
  if (!r.ok || !r.ip) return 'Systemfehler 53: Der Netzwerkpfad wurde nicht gefunden.'
  if (!reach(e.w, e.ep, r.ip).ok) return 'Systemfehler 53: Der Netzwerkpfad wurde nicht gefunden.'
  const srv = e.w.infra.servers.find((s) => s.name === u.server)
  if (srv && srv.ip !== r.ip) return 'Systemfehler 53: Der Netzwerkpfad wurde nicht gefunden. (Der Name wird auf eine falsche Adresse aufgelöst.)'
  return null
}

function netUse(e: Env, args: string[]): string {
  const ep = e.ep
  const low = args.map((x) => x.toLowerCase())
  const persistentArg = low.find((x) => x.startsWith('/persistent:'))
  if (!args.length || (args.length === 1 && persistentArg)) {
    const rows = ep.mappedDrives.map((d) => {
      const okNet = !uncReachable(e, d.path)
      const acc = okNet ? shareAccess(e.w, ep, d.path) : { ok: false }
      return `${(acc.ok ? 'OK' : 'Nicht verfügbar').padEnd(13)}${d.letter.padEnd(10)}${d.path.padEnd(26)}Netzwerk (SMB)`
    })
    return ['Neue Verbindungen werden gespeichert.', '', '', 'Status       Lokal     Remote                    Netzwerk', '', '-'.repeat(79), ...rows, rows.length ? OK : 'Es sind keine Einträge in der Liste vorhanden.'].join('\n')
  }
  const letter = args.find((x) => /^[a-z]:$|^\*$/i.test(x))
  const path = args.find((x) => x.startsWith('\\\\'))
  if (low.includes('/delete') || low.includes('/d')) {
    const target = letter ?? path
    if (!target) return 'Die Syntax dieses Befehls lautet: NET USE [Laufwerk: | *] /DELETE'
    if (target === '*') {
      const n = ep.mappedDrives.length
      for (const d of [...ep.mappedDrives]) unmapDrive(ep, d.letter)
      act(e, A.networkChanged, e.host, 'Alle Netzlaufwerke getrennt')
      return n ? `Es bestehen ${n} Remoteverbindungen.\nAlle Verbindungen wurden getrennt.\n${OK}` : 'Es sind keine Einträge in der Liste vorhanden.'
    }
    const d = ep.mappedDrives.find((x) => x.letter.toLowerCase() === target.toLowerCase() || x.path.toLowerCase() === target.toLowerCase())
    if (!d) return 'Die Netzwerkverbindung konnte nicht gefunden werden.\n\nWeitere Hilfe erhalten Sie, wenn Sie NET HELPMSG 2250 eingeben.'
    unmapDrive(ep, d.letter)
    act(e, A.networkChanged, e.host, `Netzlaufwerk ${d.letter} getrennt (${d.path})`)
    return `${d.letter} wurde erfolgreich gelöscht.`
  }
  if (!path) return 'Die Syntax dieses Befehls lautet:\n\nNET USE [Laufwerk: | *] [\\\\Computer\\Freigabe] [/PERSISTENT:{YES | NO}]\nNET USE Laufwerk: /DELETE'
  const net = uncReachable(e, path)
  if (net) return sysErr(net)
  if (!letter) {
    const acc = shareAccess(e.w, ep, path)
    return acc.ok ? OK : sysErr(acc.error ?? 'Fehler')
  }
  let L = letter
  if (L === '*') {
    const free = 'ZYXWVUTSRQPONMLKJIHG'.split('').find((c) => !ep.fs[c + ':'] && !ep.mappedDrives.some((d) => d.letter === c + ':'))
    if (!free) return 'Es sind keine Laufwerksbuchstaben mehr verfügbar.'
    L = free + ':'
  }
  const persistent = persistentArg ? /yes|ja/.test(persistentArg) : true
  const err = mapDrive(e.w, ep, L, path, persistent)
  if (err) return sysErr(err)
  act(e, A.networkChanged, e.host, `Netzlaufwerk ${L.toUpperCase()} → ${path}${persistent ? ' (persistent)' : ''}`)
  return letter === '*' ? `Laufwerk ${L.toUpperCase()} ist jetzt mit ${path} verbunden.\n\n${OK}` : OK
}

function netUserDomain(e: Env, sam: string): string {
  const u = findUser(e.w, sam)
  if (!dcReachable(e)) return 'Systemfehler 1355 aufgetreten.\n\nDie angegebene Domäne ist nicht vorhanden, oder es konnte keine Verbindung mit ihr hergestellt werden.'
  if (!u) return 'Die Anforderung wird bei einem Domänencontroller für Domäne musterwerk.local bearbeitet.\n\nDer Benutzername konnte nicht gefunden werden.\n\nWeitere Hilfe erhalten Sie, wenn Sie NET HELPMSG 2221 eingeben.'
  const L = (k: string, v = '') => `${k.padEnd(38)}${v}`
  const exp = u.passwordNeverExpires ? 'Nie' : fmtDT(new Date(new Date(u.pwdLastSet).getTime() + e.w.domain.maxPasswordAgeDays * 86400000).toISOString())
  const groups = directGroupsOf(e.w, u.sam).filter((g) => findGroup(e.w, g)?.scope !== 'Lokal (Domäne)')
  const gl: string[] = []
  for (let i = 0; i < groups.length; i += 2) gl.push(`*${groups[i]}`.padEnd(22) + (groups[i + 1] ? `*${groups[i + 1]}` : ''))
  return [
    'Die Anforderung wird bei einem Domänencontroller für Domäne musterwerk.local bearbeitet.',
    '',
    L('Benutzername', u.sam),
    L('Vollständiger Name', u.displayName),
    L('Beschreibung', u.description ?? ''),
    L('Benutzerkommentar'),
    L('Ländercode (Landeskennzahl)', '000 (Standard des Systems)'),
    L('Konto aktiv', !u.enabled ? 'Nein' : u.lockedOut ? 'Gesperrt' : 'Ja'),
    L('Konto abgelaufen', u.accountExpires ? fmtDT(u.accountExpires) : 'Nie'),
    '',
    L('Letzte Kennwortänderung', u.mustChangePassword ? 'Benutzer muss Kennwort bei nächster Anmeldung ändern' : fmtDT(u.pwdLastSet)),
    L('Kennwort läuft ab', u.passwordExpired ? 'Abgelaufen' : exp),
    L('Kennwort änderbar', fmtDT(u.pwdLastSet)),
    L('Kennwort erforderlich', 'Ja'),
    L('Benutzer kann Kennwort ändern', u.cannotChangePassword ? 'Nein' : 'Ja'),
    '',
    L('Erlaubte Arbeitsstationen', 'Alle'),
    L('Anmeldeskript', u.logonScript ?? ''),
    L('Benutzerprofil'),
    L('Basisverzeichnis', u.homeDirectory ?? ''),
    L('Letzte Anmeldung', u.lastLogon ? fmtDT(u.lastLogon) : 'Nie'),
    '',
    L('Erlaubte Anmeldezeiten', 'Alle'),
    '',
    L('Mitgliedschaften lokaler Gruppen'),
    L('Mitgliedschaften globaler Gruppen', gl[0] ?? '*Kein'),
    ...gl.slice(1).map((x) => ' '.repeat(38) + x),
    OK,
  ].join('\n')
}

export const net: Handler = (e, args) => {
  const sub = (args[0] ?? '').toLowerCase()
  const rest = args.slice(1)
  const low = rest.map((x) => x.toLowerCase())
  const ep = e.ep
  switch (sub) {
    case 'use':
      return netUse(e, rest)
    case 'start':
      return netService(e, true, rest)
    case 'stop':
      return netService(e, false, rest)
    case 'user': {
      const domain = low.includes('/domain') || low.includes('/do')
      const pos = rest.filter((x) => !x.startsWith('/'))
      if (!pos.length) {
        if (domain) return `Benutzerkonten für \\\\DC01.musterwerk.local\n\n${'-'.repeat(79)}\n${e.w.users.map((u) => u.sam.padEnd(25)).reduce((acc, s, i) => acc + s + ((i + 1) % 3 === 0 ? '\n' : ''), '')}\n${OK}`
        return `Benutzerkonten für \\\\${e.host}\n\n${'-'.repeat(79)}\nAdministrator            DefaultAccount           Gast\nWDAGUtilityAccount\n${OK}`
      }
      if (!domain) {
        if (/^(administrator|gast|defaultaccount)$/i.test(pos[0])) return `Benutzername                           ${pos[0]}\nKonto aktiv                           ${/^administrator$/i.test(pos[0]) ? 'Nein' : 'Nein'}\n(Lokales Konto – für Domänenkonten "/domain" anhängen.)\n${OK}`
        return 'Der Benutzername konnte nicht gefunden werden.\n\nWeitere Hilfe erhalten Sie, wenn Sie NET HELPMSG 2221 eingeben.\n(Tipp: Für Domänenkonten "net user <name> /domain" verwenden.)'
      }
      if (pos[1]) {
        if (!(isMemberOf(e.w, e.user, 'GG_IT_Helpdesk') || isMemberOf(e.w, e.user, 'Domänen-Admins'))) return 'Systemfehler 5 aufgetreten.\n\nZugriff verweigert.'
        if (pos[1] === '*') return 'Die interaktive Kennworteingabe wird im Simulator nicht unterstützt. Verwenden Sie: net user <name> <Kennwort> /domain'
        const err = resetPassword(e.w, pos[0], pos[1], { mustChange: findUser(e.w, pos[0])?.mustChangePassword })
        if (err) return `Systemfehler 2245 aufgetreten.\n\nDas Kennwort entspricht nicht den Kennwortrichtlinien. ${err}`
        act(e, A.adPasswordReset, findUser(e.w, pos[0])?.sam ?? pos[0], 'net user /domain')
        return `Die Anforderung wird bei einem Domänencontroller für Domäne musterwerk.local bearbeitet.\n\n${OK}`
      }
      return netUserDomain(e, pos[0])
    }
    case 'localgroup': {
      const g = rest.filter((x) => !x.startsWith('/')).join(' ')
      if (!g) return `Aliase für \\\\${e.host}\n\n${'-'.repeat(79)}\n*Administratoren\n*Benutzer\n*Gäste\n*Remotedesktopbenutzer\n*Remoteverwaltungsbenutzer\n${OK}`
      if (/^(administratoren|administrators)$/i.test(g)) return `Aliasname     Administratoren\nBeschreibung  Administratoren haben uneingeschränkten Vollzugriff auf den Computer bzw. die Domäne.\n\nMitglieder\n\n${'-'.repeat(79)}\nAdministrator\nMUSTERWERK\\Domänen-Admins\nMUSTERWERK\\GG_Lokale_Admins\n${OK}`
      if (/^remotedesktopbenutzer$/i.test(g)) return `Aliasname     Remotedesktopbenutzer\nBeschreibung  Die Mitglieder dieser Gruppe haben die Berechtigung, sich remote anzumelden.\n\nMitglieder\n\n${'-'.repeat(79)}\nMUSTERWERK\\Remotedesktopbenutzer\n${OK}`
      if (/^benutzer$/i.test(g)) return `Aliasname     Benutzer\n\nMitglieder\n\n${'-'.repeat(79)}\nMUSTERWERK\\Domänen-Benutzer\nNT-AUTORITÄT\\Authentifizierte Benutzer\nNT-AUTORITÄT\\INTERAKTIV\n${OK}`
      return 'Die angegebene lokale Gruppe ist nicht vorhanden.\n\nWeitere Hilfe erhalten Sie, wenn Sie NET HELPMSG 3780 eingeben.'
    }
    case 'view': {
      const target = rest.find((x) => x.startsWith('\\\\'))
      if (!target) return `Servername            Beschreibung\n\n${'-'.repeat(79)}\n\\\\DC01                 Domänencontroller\n\\\\DC02                 Domänencontroller\n\\\\FS01                 Dateiserver\n\\\\PRINT01              Druckserver\n\\\\APP01                ERP-Anwendungsserver\n${OK}`
      const server = target.replace(/^\\\\/, '').toUpperCase().replace(/\.MUSTERWERK\.LOCAL$/, '')
      const err = uncReachable(e, `\\\\${server}\\x`)
      if (err) return sysErr(err)
      const shares = e.w.infra.shares.filter((s) => s.server === server && !s.name.endsWith('$'))
      const queues = server === 'PRINT01' ? e.w.infra.printQueues.filter((q) => q.shared) : []
      const srv = e.w.infra.servers.find((s) => s.name === server)
      if (!srv) return 'Systemfehler 53 aufgetreten.\n\nDer Netzwerkpfad wurde nicht gefunden.'
      const rows = [...shares.map((s) => `${s.name.padEnd(20)}Platte  ${''.padEnd(14)}${s.description}`), ...queues.map((q) => `${q.name.padEnd(20)}Druck   ${''.padEnd(14)}${q.location}`), ...(['DC01', 'DC02'].includes(server) ? ['NETLOGON            Platte                Anmeldeserverfreigabe', 'SYSVOL              Platte                Anmeldeserverfreigabe'] : [])]
      return [`Freigegebene Ressourcen auf ${target}`, '', srv.roles.join(', '), '', 'Freigabename        Typ     Verwendet als Kommentar', '', '-'.repeat(79), ...rows, OK].join('\n')
    }
    case 'accounts': {
      const d = e.w.domain
      return [`Erzwungene Abmeldung nach Ablauf der Zeit:          Nie`, `Minimale Kennwortgültigkeit (Tage):                 1`, `Maximale Kennwortgültigkeit (Tage):                 ${d.maxPasswordAgeDays}`, `Minimale Kennwortlänge:                             ${d.minPasswordLength}`, `Länge der Kennwortchronik:                          24`, `Sperrschwelle:                                      ${d.lockoutThreshold}`, `Sperrdauer (Minuten):                               ${d.lockoutDurationMin}`, `Zurücksetzungsdauer des Sperrzählers (Minuten):     ${d.lockoutDurationMin}`, 'Computerrolle:                                      ARBEITSSTATION', OK].join('\n')
    }
    case 'time':
      return `Die aktuelle Zeit auf \\\\DC01.musterwerk.local ist ${fmtDT(new Date().toISOString())}.\n${ep.timeOffsetMin ? `(Lokale Abweichung: ${ep.timeOffsetMin} Minuten)\n` : ''}\n${OK}`
    case 'session':
    case 'share':
      return sub === 'share' ? `Freigabename   Ressource                       Beschreibung\n\n${'-'.repeat(79)}\nC$             C:\\                             Standardfreigabe\nIPC$                                           Remote-IPC\nADMIN$         C:\\Windows                      Remoteverwaltung\n${OK}` : 'Es sind keine Einträge in der Liste vorhanden.'
    case 'helpmsg':
      return `Weitere Hilfe zu Meldung ${rest[0] ?? ''}: siehe Fehlermeldung oben (Simulator).`
  }
  return 'Die Syntax dieses Befehls lautet:\n\nNET\n    [ ACCOUNTS | LOCALGROUP | SHARE | START | STOP | TIME | USE | USER | VIEW ]'
}

// ─────────────── PSDrive ───────────────

export const newPSDrive: Handler = (e, args) => {
  const a = psArgs(args, ['persist'])
  const name = argOrPos(a, 0, 'name')
  const root = arg(a, 'root') ?? a.pos[2] ?? a.pos[1]
  if (!name || !root?.startsWith('\\\\')) return psError(e, 'Beispiel: New-PSDrive -Name S -PSProvider FileSystem -Root \\\\FS01\\Vertrieb -Persist', 'InvalidArgument')
  const net = uncReachable(e, root)
  if (net) return psError(e, `Der angegebene Netzwerkpfad "${root}" ist nicht erreichbar. ${net}`, 'OpenError')
  const err = mapDrive(e.w, e.ep, name, root, has(a, 'persist'))
  if (err) return psError(e, err, 'WriteError')
  act(e, A.networkChanged, e.host, `Netzlaufwerk ${name.toUpperCase().replace(/:?$/, ':')} → ${root}`)
  return obj([{ Name: name.toUpperCase().replace(':', ''), 'Used (GB)': '', 'Free (GB)': '', Provider: 'FileSystem', Root: root, CurrentLocation: '' }], ['Name', 'Used (GB)', 'Free (GB)', 'Provider', 'Root', 'CurrentLocation'])
}

export const removePSDrive: Handler = (e, args) => {
  const a = psArgs(args, ['force'])
  const name = argOrPos(a, 0, 'name', 'literalname')
  if (!name) return psError(e, 'Der Parameter "-Name" fehlt.')
  const d = e.ep.mappedDrives.find((x) => x.letter[0].toLowerCase() === name[0].toLowerCase())
  if (!d) return psError(e, `Es wurde kein Laufwerk mit dem Namen "${name}" gefunden.`, 'ObjectNotFound')
  unmapDrive(e.ep, d.letter)
  act(e, A.networkChanged, e.host, `Netzlaufwerk ${d.letter} getrennt (${d.path})`)
  return ''
}

export const getSmbMapping: Handler = (e) => obj(e.ep.mappedDrives.map((d) => ({ Status: shareAccess(e.w, e.ep, d.path).ok && !uncReachable(e, d.path) ? 'OK' : 'Unavailable', 'Local Path': d.letter, 'Remote Path': d.path })), ['Status', 'Local Path', 'Remote Path'])

// ─────────────── Drucker ───────────────

export const getPrinter: Handler = (e, args) => {
  const a = psArgs(args)
  const name = argOrPos(a, 0, 'name')
  const ps = e.ep.printers.filter((p) => !name || wildToRe(name).test(p.name))
  if (name && !ps.length) return psError(e, `Der Drucker "${name}" wurde nicht gefunden.`, 'ObjectNotFound')
  return obj(
    ps.map((p) => {
      const st = printerEffectiveStatus(e.w, e.ep, p)
      return { Name: p.name, ComputerName: p.serverQueue ? 'PRINT01' : '', Type: p.serverQueue ? 'Connection' : 'Local', DriverName: p.driver, PortName: p.port, Shared: false, Published: false, PrinterStatus: st.ok ? 'Normal' : st.status, Default: p.isDefault, Jobs: p.jobs.length }
    }),
    ['Name', 'ComputerName', 'Type', 'DriverName', 'PortName', 'Shared', 'Published'],
  )
}

export const getPrintJob: Handler = (e, args) => {
  const a = psArgs(args)
  const name = arg(a, 'printername') ?? a.pos[0] ?? (isObj(e.input) ? String(e.input.objs[0]?.Name ?? '') : undefined)
  const p = name ? e.ep.printers.find((x) => x.name.toLowerCase() === name.toLowerCase() || x.name.toLowerCase().endsWith('\\' + name.toLowerCase())) : undefined
  if (!p) return psError(e, `Der Drucker "${name ?? ''}" wurde nicht gefunden. Beispiel: Get-PrintJob -PrinterName "\\\\PRINT01\\1OG-Farbe"`, 'ObjectNotFound')
  return obj(p.jobs.map((j) => ({ Id: j.id, ComputerName: p.serverQueue ? 'PRINT01' : e.host, PrinterName: p.name, DocumentName: j.document, SubmittedTime: fmtDT(j.submitted), JobStatus: j.status === 'Fehler' ? 'Error, Printing' : j.status === 'In Warteschlange' ? 'Normal' : j.status, UserName: j.owner, Pages: j.pages })), ['Id', 'ComputerName', 'PrinterName', 'DocumentName', 'SubmittedTime', 'JobStatus'])
}

export const removePrintJob: Handler = (e, args) => {
  const a = psArgs(args)
  if (!e.admin) return psError(e, 'Zugriff verweigert.', 'PermissionDenied')
  let targets: { printer: string; id: number }[] = []
  if (isObj(e.input)) targets = e.input.objs.filter((o) => o.PrinterName && o.Id !== undefined).map((o) => ({ printer: String(o.PrinterName), id: Number(o.Id) }))
  const pn = arg(a, 'printername')
  const id = arg(a, 'id')
  if (pn && id) targets.push({ printer: pn, id: Number(id) })
  if (!targets.length) return psError(e, 'Beispiel: Remove-PrintJob -PrinterName "\\\\PRINT01\\1OG-Farbe" -ID 123   oder   Get-PrintJob -PrinterName x | Remove-PrintJob', 'InvalidArgument')
  for (const t of targets) {
    const p = e.ep.printers.find((x) => x.name.toLowerCase() === t.printer.toLowerCase() || x.name.toLowerCase().endsWith('\\' + t.printer.toLowerCase()))
    if (!p) return psError(e, `Der Drucker "${t.printer}" wurde nicht gefunden.`, 'ObjectNotFound')
    const before = p.jobs.length
    p.jobs = p.jobs.filter((j) => j.id !== t.id)
    if (p.jobs.length === before) return psError(e, `Der Druckauftrag ${t.id} wurde nicht gefunden.`, 'ObjectNotFound')
    act(e, A.printerChanged, e.host, `Druckauftrag ${t.id} auf ${p.name} gelöscht`)
  }
  return ''
}

function addPrinterConn(e: Env, unc: string, setDefault = false): string | null {
  const net = uncReachable(e, unc)
  if (net) return 'Windows kann keine Verbindung mit dem Drucker herstellen. Der Server wurde nicht gefunden oder ist nicht erreichbar. (0x00000709)'
  const err = connectPrinter(e.w, e.ep, unc, setDefault)
  if (err) return err
  act(e, A.printerChanged, e.host, `Drucker ${unc} verbunden`)
  return null
}

export const addPrinter: Handler = (e, args) => {
  const a = psArgs(args)
  const unc = arg(a, 'connectionname') ?? a.pos[0]
  if (!unc) return psError(e, 'Beispiel: Add-Printer -ConnectionName \\\\PRINT01\\1OG-Farbe', 'InvalidArgument')
  const err = addPrinterConn(e, unc)
  return err ? psError(e, err, 'NotSpecified') : ''
}

export const removePrinterCmd: Handler = (e, args) => {
  const a = psArgs(args)
  const name = argOrPos(a, 0, 'name') ?? (isObj(e.input) ? String(e.input.objs[0]?.Name ?? '') : undefined)
  if (!name) return psError(e, 'Der Parameter "-Name" fehlt.')
  const err = removePrinter(e.ep, name)
  if (err) return psError(e, `Der Drucker "${name}" wurde nicht gefunden.`, 'ObjectNotFound')
  act(e, A.printerChanged, e.host, `Drucker ${name} entfernt`)
  return ''
}

export const rundll32: Handler = (e, _args, rest) => {
  if (!/printui/i.test(rest)) return '(rundll32: Nur "printui.dll,PrintUIEntry" wird im Simulator unterstützt.)'
  const n = rest.match(/\/n\s*"?(\\\\[^"\s]+)"?/i)?.[1]
  if (!n) return 'Syntax: rundll32 printui.dll,PrintUIEntry /in /n\\\\PRINT01\\1OG-Farbe   (/dn = entfernen, /y = Standarddrucker)'
  if (/\/dn\b|\/dl\b/i.test(rest)) {
    if (removePrinter(e.ep, n)) return 'Der Vorgang konnte nicht abgeschlossen werden: Drucker nicht gefunden.'
    act(e, A.printerChanged, e.host, `Drucker ${n} entfernt`)
    return ''
  }
  if (/\/y\b/i.test(rest)) {
    if (setDefaultPrinter(e.ep, n)) return 'Der Vorgang konnte nicht abgeschlossen werden: Drucker nicht gefunden.'
    act(e, A.printerChanged, e.host, `Standarddrucker ${n}`)
    return ''
  }
  const err = addPrinterConn(e, n)
  return err ? `Vorgang konnte nicht abgeschlossen werden (Fehler 0x00000709).\n${err}` : ''
}
