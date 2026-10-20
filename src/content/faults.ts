// Fehlerbibliothek: wiederverwendbare Bausteine (Fehler einbauen + Prüfung),
// aus denen der Trainer-Modus eigene Szenarien zusammenklickt.

import { addGroupMember, findComputer, findUser, isMemberOf, lockUser, primaryComputerOf, removeGroupMember } from '@/core/ops/ad'
import { findCloudUser } from '@/core/ops/cloud'
import { addEvent, cpuTotal, ensureEndpoint, findService, freeGb, getEndpoint, getProxySettings, getRegValue, HOSTS_PATH, isServiceRunning, isStartupActive, nextPid, readFile, readHosts, refreshToken, setProxySettings, setRegValue, writeFile } from '@/core/ops/endpoint'
import { DEFAULT_HOSTS } from '@/core/seed/endpoints'
import { connectivity, httpRequest } from '@/core/sim/network'
import { putFile } from '@/content/scenarios/kit'
import type { CustomScenarioDef, Scenario, ScenarioCheck } from '@/core/scenarios/types'
import type { World } from '@/core/types'

export interface FaultParam {
  name: string
  label: string
  kind: 'user' | 'computer' | 'group' | 'service' | 'text' | 'sku'
  /** Standard: Computer/Benutzer des Anfragenden */
  optional?: boolean
  /** Beispiel-/Standardwert für das Eingabefeld (wird verwendet, wenn leer) */
  placeholder?: string
}

export interface FaultDef {
  type: string
  label: string
  description: string
  params: FaultParam[]
  apply: (w: World, p: Record<string, string>, requester: string) => void
  checks: (p: Record<string, string>, requester: string) => ScenarioCheck[]
}

const pcOf = (w: World, p: Record<string, string>, requester: string) => p.computer || primaryComputerOf(w, requester)?.name || ''
const ep = (w: World, host: string) => getEndpoint(w, host) ?? ensureEndpoint(w, host)

export const FAULTS: FaultDef[] = [
  {
    type: 'account-locked',
    label: 'AD-Konto gesperrt',
    description: 'Das Konto des Benutzers wird nach Fehlanmeldungen gesperrt.',
    params: [{ name: 'user', label: 'Benutzer', kind: 'user', optional: true }],
    apply: (w, p, r) => lockUser(w, p.user || r, primaryComputerOf(w, p.user || r)?.name ?? 'UNBEKANNT'),
    checks: (p, r) => [{ id: 'unlocked', label: 'Konto entsperrt', points: 10, test: (w) => !findUser(w, p.user || r)?.lockedOut }],
  },
  {
    type: 'password-expired',
    label: 'Kennwort abgelaufen',
    description: 'Das Kennwort des Benutzers ist abgelaufen.',
    params: [{ name: 'user', label: 'Benutzer', kind: 'user', optional: true }],
    apply: (w, p, r) => {
      const u = findUser(w, p.user || r)
      if (u) {
        u.passwordExpired = true
        u.pwdLastSet = new Date(Date.now() - 95 * 86400000).toISOString()
      }
    },
    checks: (p, r) => [{ id: 'pwd', label: 'Kennwort neu gesetzt', points: 10, test: (w) => !findUser(w, p.user || r)?.passwordExpired }],
  },
  {
    type: 'account-disabled',
    label: 'AD-Konto deaktiviert',
    description: 'Das Konto wurde versehentlich deaktiviert.',
    params: [{ name: 'user', label: 'Benutzer', kind: 'user', optional: true }],
    apply: (w, p, r) => {
      const u = findUser(w, p.user || r)
      if (u) u.enabled = false
    },
    checks: (p, r) => [{ id: 'enabled', label: 'Konto aktiviert', points: 10, test: (w) => !!findUser(w, p.user || r)?.enabled }],
  },
  {
    type: 'missing-group',
    label: 'Gruppenmitgliedschaft fehlt',
    description: 'Benutzer wird aus einer Gruppe entfernt und muss wieder hinzugefügt werden.',
    params: [
      { name: 'user', label: 'Benutzer', kind: 'user', optional: true },
      { name: 'group', label: 'Gruppe', kind: 'group' },
    ],
    apply: (w, p, r) => {
      removeGroupMember(w, p.group, p.user || r)
    },
    checks: (p, r) => [{ id: 'grp', label: `Mitglied von ${p.group}`, points: 10, test: (w) => isMemberOf(w, p.user || r, p.group) }],
  },
  {
    type: 'unwanted-group',
    label: 'Unerwünschte Gruppenmitgliedschaft',
    description: 'Benutzer ist Mitglied einer Gruppe, in die er nicht gehört.',
    params: [
      { name: 'user', label: 'Benutzer', kind: 'user', optional: true },
      { name: 'group', label: 'Gruppe', kind: 'group' },
    ],
    apply: (w, p, r) => {
      addGroupMember(w, p.group, p.user || r)
    },
    checks: (p, r) => [{ id: 'nogrp', label: `Nicht mehr Mitglied von ${p.group}`, points: 10, test: (w) => !isMemberOf(w, p.user || r, p.group, false) }],
  },
  {
    type: 'service-stopped',
    label: 'Windows-Dienst beendet/deaktiviert',
    description: 'Ein Dienst auf dem Client wird beendet und auf "Deaktiviert" gesetzt.',
    params: [
      { name: 'computer', label: 'Computer', kind: 'computer', optional: true },
      { name: 'service', label: 'Dienstname (z.B. Spooler)', kind: 'service' },
    ],
    apply: (w, p, r) => {
      const e = ep(w, pcOf(w, p, r))
      const s = e && findService(e.services, p.service)
      if (s) {
        s.status = 'Beendet'
        s.startType = 'Deaktiviert'
      }
    },
    checks: (p, r) => [
      {
        id: 'svc',
        label: `Dienst ${p.service} läuft wieder`,
        points: 8,
        test: (w) => {
          const e = getEndpoint(w, pcOf(w, p, r))
          return !!e && isServiceRunning(e, p.service)
        },
      },
      {
        id: 'svc-start',
        label: `Starttyp ${p.service} wieder automatisch`,
        points: 4,
        test: (w) => {
          const e = getEndpoint(w, pcOf(w, p, r))
          return !!e && !!findService(e.services, p.service)?.startType.startsWith('Automatisch')
        },
      },
    ],
  },
  {
    type: 'wrong-dns',
    label: 'Falscher DNS-Server (statisch)',
    description: 'Am Netzwerkadapter ist ein externer DNS-Server statisch eingetragen → interne Namen lösen nicht auf.',
    params: [{ name: 'computer', label: 'Computer', kind: 'computer', optional: true }],
    apply: (w, p, r) => {
      const e = ep(w, pcOf(w, p, r))
      const a = e?.adapters.find((x) => x.enabled && x.mediaConnected && x.kind !== 'VPN')
      if (a) {
        a.dnsFromDhcp = false
        a.dnsServers = ['8.8.8.8']
      }
    },
    checks: (p, r) => [
      {
        id: 'net',
        label: 'Intranet wieder erreichbar',
        points: 10,
        test: (w) => {
          const e = getEndpoint(w, pcOf(w, p, r))
          return !!e && connectivity(w, e).intranet
        },
      },
    ],
  },
  {
    type: 'adapter-disabled',
    label: 'Netzwerkadapter deaktiviert',
    description: 'Der aktive Netzwerkadapter wurde deaktiviert.',
    params: [{ name: 'computer', label: 'Computer', kind: 'computer', optional: true }],
    apply: (w, p, r) => {
      const e = ep(w, pcOf(w, p, r))
      const a = e?.adapters.find((x) => x.enabled && x.mediaConnected && x.kind !== 'VPN')
      if (a) a.enabled = false
    },
    checks: (p, r) => [
      {
        id: 'nic',
        label: 'Netzwerk wieder verbunden',
        points: 10,
        test: (w) => {
          const e = getEndpoint(w, pcOf(w, p, r))
          return !!e && connectivity(w, e).intranet
        },
      },
    ],
  },
  {
    type: 'license-missing',
    label: 'Cloud-Lizenz entfernt',
    description: 'Dem Benutzer wird die Cloud-Office-Lizenz entzogen.',
    params: [{ name: 'user', label: 'Benutzer', kind: 'user', optional: true }],
    apply: (w, p, r) => {
      const cu = findCloudUser(w, p.user || r)
      if (cu) cu.licenses = []
    },
    checks: (p, r) => [{ id: 'lic', label: 'Lizenz zugewiesen', points: 10, test: (w) => (findCloudUser(w, p.user || r)?.licenses.length ?? 0) > 0 }],
  },
  {
    type: 'mfa-reset-needed',
    label: 'MFA-Gerät verloren',
    description: 'Benutzer hat ein neues Handy – MFA-Methoden müssen zurückgesetzt werden.',
    params: [{ name: 'user', label: 'Benutzer', kind: 'user', optional: true }],
    apply: () => {},
    checks: (p, r) => [{ id: 'mfa', label: 'MFA-Registrierung zurückgesetzt', points: 10, test: (w) => !!findCloudUser(w, p.user || r)?.mfa.requireReRegister }],
  },
  {
    type: 'hosts-entry',
    label: 'hosts-Eintrag manipuliert',
    description: 'Ein Hostname wird per hosts-Datei auf eine fremde IP umgeleitet (Seite "sieht komisch aus").',
    params: [
      { name: 'computer', label: 'Computer', kind: 'computer', optional: true },
      { name: 'host', label: 'Hostname', kind: 'text', optional: true, placeholder: 'intranet.musterwerk.local' },
      { name: 'ip', label: 'Falsche IP', kind: 'text', optional: true, placeholder: '203.0.113.66' },
    ],
    apply: (w, p, r) => {
      const e = ep(w, pcOf(w, p, r))
      if (!e) return
      const host = (p.host || 'intranet.musterwerk.local').toLowerCase()
      const ip = p.ip || '203.0.113.66'
      writeFile(e, HOSTS_PATH, `${readFile(e, HOSTS_PATH) ?? DEFAULT_HOSTS}\n${ip}    ${host}\n`)
      e.dnsCache[host] = ip
    },
    checks: (p, r) => [
      {
        id: 'hosts',
        label: `Umleitung von ${p.host || 'intranet.musterwerk.local'} entfernt`,
        points: 10,
        test: (w) => {
          const e = getEndpoint(w, pcOf(w, p, r))
          const host = (p.host || 'intranet.musterwerk.local').toLowerCase()
          if (!e) return false
          const res = httpRequest(w, e, `http://${host}`)
          return !readHosts(e)[host] && res.ok && !res.spoofed
        },
      },
    ],
  },
  {
    type: 'proxy-wrong',
    label: 'Falscher Proxy eingetragen',
    description: 'Im Benutzerprofil ist ein nicht erreichbarer Proxy aktiv → Internet geht nicht, Intranet schon.',
    params: [
      { name: 'computer', label: 'Computer', kind: 'computer', optional: true },
      { name: 'server', label: 'Proxy (Host:Port)', kind: 'text', optional: true, placeholder: 'proxy.hotel-wlan.example:3128' },
    ],
    apply: (w, p, r) => {
      const e = ep(w, pcOf(w, p, r))
      if (e) setProxySettings(e, { enabled: true, server: p.server || 'proxy.hotel-wlan.example:3128', bypass: '<local>' })
    },
    checks: (p, r) => [
      {
        id: 'internet',
        label: 'Internet wieder erreichbar (Proxy korrigiert)',
        points: 10,
        test: (w) => {
          const e = getEndpoint(w, pcOf(w, p, r))
          return !!e && connectivity(w, e).internet && !getProxySettings(e).server.includes(p.server || 'hotel-wlan')
        },
      },
    ],
  },
  {
    type: 'time-offset',
    label: 'Zeitabweichung (W32Time deaktiviert)',
    description: 'Die Uhr des Clients weicht ab, der Windows-Zeitgeber ist deaktiviert → Kerberos-/VPN-Fehler.',
    params: [
      { name: 'computer', label: 'Computer', kind: 'computer', optional: true },
      { name: 'minutes', label: 'Abweichung in Minuten', kind: 'text', optional: true, placeholder: '12' },
    ],
    apply: (w, p, r) => {
      const e = ep(w, pcOf(w, p, r))
      if (!e) return
      e.timeOffsetMin = Number(p.minutes) || 12
      const t = findService(e.services, 'W32Time')
      if (t) {
        t.status = 'Beendet'
        t.startType = 'Deaktiviert'
      }
      addEvent(e, { log: 'System', eventId: 4, level: 'Fehler', source: 'Microsoft-Windows-Security-Kerberos', message: 'Der Kerberos-Client hat einen KRB_AP_ERR_SKEW-Fehler empfangen. Die Uhrzeit des Clients weicht um mehr als 5 Minuten ab.' })
    },
    checks: (p, r) => [
      {
        id: 'time',
        label: 'Uhrzeit synchron und Zeitgeber aktiv',
        points: 10,
        test: (w) => {
          const e = getEndpoint(w, pcOf(w, p, r))
          const t = e ? findService(e.services, 'W32Time') : undefined
          return !!e && Math.abs(e.timeOffsetMin) < 2 && !!t && t.status === 'Wird ausgeführt' && t.startType !== 'Deaktiviert'
        },
      },
    ],
  },
  {
    type: 'device-disabled',
    label: 'Gerät im Geräte-Manager deaktiviert',
    description: 'Ein Gerät (z. B. Kamera, Audio) wird deaktiviert (Code 22).',
    params: [
      { name: 'computer', label: 'Computer', kind: 'computer', optional: true },
      { name: 'category', label: 'Gerätekategorie', kind: 'text', optional: true, placeholder: 'Kameras' },
    ],
    apply: (w, p, r) => {
      const e = ep(w, pcOf(w, p, r))
      const cat = (p.category || 'Kameras').toLowerCase()
      const d = e?.devices.find((x) => x.category.toLowerCase().startsWith(cat)) ?? e?.devices.find((x) => x.category.toLowerCase().includes('audio'))
      if (d) {
        d.status = 'Deaktiviert'
        d.errorCode = 22
      }
    },
    checks: (p, r) => [
      {
        id: 'device',
        label: `Gerät (${p.category || 'Kameras'}) wieder aktiviert`,
        points: 10,
        test: (w) => {
          const e = getEndpoint(w, pcOf(w, p, r))
          return !!e && !e.devices.some((d) => d.status === 'Deaktiviert')
        },
      },
    ],
  },
  {
    type: 'disk-full',
    label: 'Laufwerk C: voll',
    description: 'Große temporäre Dateien füllen C: (unter 1 GB frei).',
    params: [{ name: 'computer', label: 'Computer', kind: 'computer', optional: true }],
    apply: (w, p, r) => {
      const e = ep(w, pcOf(w, p, r))
      if (!e) return
      const user = e.loggedOnUser ?? 'administrator'
      for (let i = 1; i <= 4; i++) putFile(e, `C:\\Users\\${user}\\AppData\\Local\\Temp\\Cache_${i}`, `daten_${i}.tmp`, 3000)
      const c = e.disks.flatMap((d) => d.partitions).find((x) => x.letter === 'C')
      if (c) c.usedGb = Math.round((c.sizeGb - 0.7) * 10) / 10
    },
    checks: (p, r) => [{ id: 'space', label: 'Mindestens 10 GB frei auf C:', points: 10, test: (w) => { const e = getEndpoint(w, pcOf(w, p, r)); return !!e && freeGb(e, 'C:') >= 10 } }],
  },
  {
    type: 'cpu-hog-autostart',
    label: 'Prozess mit Dauerlast im Autostart',
    description: 'Ein unerwünschtes Programm erzeugt ~90 % CPU und steht im Autostart.',
    params: [
      { name: 'computer', label: 'Computer', kind: 'computer', optional: true },
      { name: 'exe', label: 'Programmname', kind: 'text', optional: true, placeholder: 'TurboHelper.exe' },
    ],
    apply: (w, p, r) => {
      const e = ep(w, pcOf(w, p, r))
      if (!e) return
      const exe = p.exe || 'TurboHelper.exe'
      const name = exe.replace(/\.exe$/i, '')
      const cmd = `"C:\\Users\\${e.loggedOnUser ?? 'administrator'}\\AppData\\Roaming\\${name}\\${exe}"`
      e.processes.push({ pid: nextPid(e), name: exe, description: name, user: e.loggedOnUser ?? 'administrator', cpu: 90, memMb: 900 })
      e.startupApps.push({ name, publisher: 'Unbekannt', command: cmd, enabled: true, impact: 'Hoch' })
      setRegValue(e, 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', name, 'REG_SZ', cmd)
      e.flags[`cpu:${exe.toLowerCase()}`] = '90'
    },
    checks: (p, r) => [
      {
        id: 'cpu',
        label: 'Prozess beendet und Autostart deaktiviert',
        points: 10,
        test: (w) => {
          const e = getEndpoint(w, pcOf(w, p, r))
          const exe = p.exe || 'TurboHelper.exe'
          return !!e && cpuTotal(e) < 40 && !isStartupActive(e, exe.replace(/\.exe$/i, ''))
        },
      },
    ],
  },
  {
    type: 'print-queue-paused',
    label: 'Druckwarteschlange auf PRINT01 angehalten',
    description: 'Eine Warteschlange auf dem Druckserver wurde angehalten – Aufträge bleiben liegen.',
    params: [{ name: 'queue', label: 'Warteschlange', kind: 'text', optional: true, placeholder: '1OG-SW' }],
    apply: (w, p) => {
      const q = w.infra.printQueues.find((x) => x.name.toLowerCase() === (p.queue || '1OG-SW').toLowerCase())
      if (q) q.status = 'Angehalten'
    },
    checks: (p) => [{ id: 'queue', label: `Warteschlange ${p.queue || '1OG-SW'} fortgesetzt`, points: 10, test: (w) => w.infra.printQueues.find((x) => x.name.toLowerCase() === (p.queue || '1OG-SW').toLowerCase())?.status === 'Bereit' }],
  },
  {
    type: 'printer-device-fault',
    label: 'Druckergerät gestört (Vor-Ort-Fall)',
    description: 'Ein Netzwerkdrucker meldet einen physischen Fehler (Papierstau/Toner). Erwartet wird die Eskalation an den Vor-Ort-Service.',
    params: [
      { name: 'printer', label: 'Geräte-ID', kind: 'text', optional: true, placeholder: 'PRN-1OG-SW' },
      { name: 'status', label: 'Status (Papierstau / Toner leer)', kind: 'text', optional: true, placeholder: 'Papierstau' },
    ],
    apply: (w, p) => {
      const d = w.infra.printers.find((x) => x.id.toLowerCase() === (p.printer || 'PRN-1OG-SW').toLowerCase())
      if (!d) return
      d.status = p.status === 'Toner leer' ? 'Toner leer' : 'Papierstau'
      d.statusDetail = d.status === 'Papierstau' ? 'Papierstau in Fach 2 / Transportweg – Techniker erforderlich.' : 'Tonerkassette schwarz leer – Austausch vor Ort.'
      if (d.status === 'Toner leer') d.toner.black = 0
    },
    checks: () => [{ id: 'escalated', label: 'An den Vor-Ort-Service eskaliert', points: 10, test: (w, ctx) => w.tickets.find((t) => t.id === ctx.ticketId)?.assignmentGroup === 'Vor-Ort-Service' }],
  },
  {
    type: 'vpn-group-missing',
    label: 'VPN-Berechtigung fehlt',
    description: 'Benutzer wird aus GG_VPN_Benutzer entfernt → VPN meldet "Zugriff verweigert (691)".',
    params: [{ name: 'user', label: 'Benutzer', kind: 'user', optional: true }],
    apply: (w, p, r) => {
      const sam = p.user || r
      const g = w.groups.find((x) => x.name === w.infra.vpnGateway.allowedGroup)
      if (g) g.members = g.members.filter((m) => m !== sam)
      const pc = primaryComputerOf(w, sam)
      const e = pc ? ep(w, pc.name) : undefined
      if (e?.vpn.installed) {
        e.vpn.connected = false
        e.vpn.lastError = 'Zugriff verweigert: Benutzer ist nicht für den VPN-Zugang berechtigt (Fehler 691/Policy "MW-VPN").'
        refreshToken(w, e)
      }
    },
    checks: (p, r) => [{ id: 'vpn', label: 'Benutzer in GG_VPN_Benutzer', points: 10, test: (w) => isMemberOf(w, p.user || r, w.infra.vpnGateway.allowedGroup) }],
  },
  {
    type: 'mailbox-access-missing',
    label: 'Postfach-Vollzugriff fehlt',
    description: 'Der Vollzugriff des Benutzers auf ein (Team-)Postfach wird entfernt.',
    params: [
      { name: 'user', label: 'Benutzer', kind: 'user', optional: true },
      { name: 'mailbox', label: 'Postfach (Adresse)', kind: 'text', optional: true, placeholder: 'kundenservice@musterwerk.example' },
    ],
    apply: (w, p, r) => {
      const mb = findCloudUser(w, p.mailbox || 'kundenservice@musterwerk.example')?.mailbox
      const upn = findCloudUser(w, p.user || r)?.upn.toLowerCase()
      if (mb && upn) mb.fullAccess = mb.fullAccess.filter((x) => x.toLowerCase() !== upn)
    },
    checks: (p, r) => [
      {
        id: 'mbx',
        label: `Vollzugriff auf ${p.mailbox || 'kundenservice@musterwerk.example'}`,
        points: 10,
        test: (w) => {
          const mb = findCloudUser(w, p.mailbox || 'kundenservice@musterwerk.example')?.mailbox
          const upn = findCloudUser(w, p.user || r)?.upn.toLowerCase()
          return !!mb && !!upn && mb.fullAccess.some((x) => x.toLowerCase() === upn)
        },
      },
    ],
  },
  {
    type: 'secure-channel-broken',
    label: 'Vertrauensstellung defekt',
    description: 'Das Computerkonto-Kennwort passt nicht mehr – Domänenanmeldung schlägt fehl.',
    params: [{ name: 'computer', label: 'Computer', kind: 'computer', optional: true }],
    apply: (w, p, r) => {
      const c = findComputer(w, pcOf(w, p, r))
      if (c) c.secureChannelBroken = true
    },
    checks: (p, r) => [{ id: 'trust', label: 'Vertrauensstellung repariert', points: 10, test: (w) => { const c = findComputer(w, pcOf(w, p, r)); return !!c && !c.secureChannelBroken } }],
  },
  {
    type: 'disk-uninitialized',
    label: 'Neuer Datenträger nicht initialisiert',
    description: 'Eine zusätzliche Festplatte ist eingebaut, aber nicht initialisiert und ohne Laufwerksbuchstaben.',
    params: [{ name: 'computer', label: 'Computer', kind: 'computer', optional: true }],
    apply: (w, p, r) => {
      const e = ep(w, pcOf(w, p, r))
      if (!e || e.disks.some((d) => d.number === 1)) return
      e.disks.push({ number: 1, model: 'Seagate BarraCuda 1TB', sizeGb: 931, kind: 'HDD', status: 'Nicht initialisiert', partitionStyle: 'Unbekannt', smart: 'OK', partitions: [{ id: 'd1-free', type: 'Nicht zugeordnet', sizeGb: 931, usedGb: 0, health: 'Unbekannt' }] })
    },
    checks: (p, r) => [
      {
        id: 'disk',
        label: 'Datenträger 1 initialisiert, formatiert und mit Laufwerksbuchstaben',
        points: 10,
        test: (w) => {
          const d = getEndpoint(w, pcOf(w, p, r))?.disks.find((x) => x.number === 1)
          return !!d && d.status === 'Online' && d.partitionStyle !== 'Unbekannt' && d.partitions.some((x) => !!x.letter && x.fs === 'NTFS')
        },
      },
    ],
  },
  {
    type: 'usb-storage-blocked',
    label: 'USB-Speicher per Richtlinie gesperrt',
    description: 'USBSTOR Start=4. Nur mit Freigabe (z. B. Mail der Informationssicherheit) ändern – sonst ist die Erwartung "Richtlinie erklären/eskalieren".',
    params: [{ name: 'computer', label: 'Computer', kind: 'computer', optional: true }],
    apply: (w, p, r) => {
      const e = ep(w, pcOf(w, p, r))
      if (e) setRegValue(e, 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\USBSTOR', 'Start', 'REG_DWORD', 4)
    },
    checks: (p, r) => [
      {
        id: 'usb',
        label: 'USB-Speicher freigegeben (nur mit Freigabe!)',
        points: 10,
        test: (w) => {
          const e = getEndpoint(w, pcOf(w, p, r))
          return !!e && Number(getRegValue(e, 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\USBSTOR', 'Start')?.data ?? 4) === 3
        },
      },
    ],
  },
]

export const faultByType = (type: string) => FAULTS.find((f) => f.type === type)

const splitKw = (s: string) => s.split(/[,;]/).map((x) => x.trim()).filter(Boolean)

/** Wandelt eine im Trainer-Modus erstellte Definition in ein lauffähiges Szenario um */
export function compileCustomScenario(def: CustomScenarioDef): Scenario {
  const checks: ScenarioCheck[] = []
  const faults = def.faults.map((f) => ({ ...f, def: faultByType(f.type) })).filter((f) => f.def)
  return {
    id: def.id,
    title: def.title,
    summary: def.summary,
    difficulty: def.difficulty,
    category: def.category,
    skills: ['Eigenes Szenario'],
    requester: def.requester,
    channel: def.channel,
    ticket: { title: def.ticketTitle, description: def.ticketDescription },
    expected: { priority: def.priority, category: def.category },
    identityRequired: def.identityRequired,
    setup: (w, ctx) => {
      for (const f of faults) {
        const params = { ...f.params }
        if (f.def!.params.some((p) => p.kind === 'computer') && !params.computer) params.computer = primaryComputerOf(w, def.requester)?.name ?? ''
        ctx.vars[`${f.type}:computer`] = params.computer ?? ''
        f.def!.apply(w, params, def.requester)
      }
    },
    get checks() {
      if (checks.length) return checks
      for (const f of faults) {
        const params = { ...f.params }
        checks.push(...f.def!.checks(params, def.requester).map((c) => ({ ...c, id: `${f.type}-${c.id}`, test: (w: World, ctx: Parameters<ScenarioCheck['test']>[1]) => c.test(w, ctx) })))
      }
      return checks
    },
    workNoteKeywords: def.workNoteKeywords.map((k) => ({ label: k.label, any: splitKw(k.any) })),
    caller: { intro: def.callerIntro, facts: def.callerFacts.map((f) => ({ keywords: splitKw(f.keywords), answer: f.answer })) },
    hints: def.hints,
    solution: def.solution,
    custom: true,
  }
}

