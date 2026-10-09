// Fehlerbibliothek: wiederverwendbare Bausteine (Fehler einbauen + Prüfung),
// aus denen der Trainer-Modus eigene Szenarien zusammenklickt.

import { addGroupMember, findUser, isMemberOf, lockUser, primaryComputerOf, removeGroupMember } from '@/core/ops/ad'
import { findCloudUser } from '@/core/ops/cloud'
import { ensureEndpoint, findService, getEndpoint, isServiceRunning } from '@/core/ops/endpoint'
import { connectivity } from '@/core/sim/network'
import type { CustomScenarioDef, Scenario, ScenarioCheck } from '@/core/scenarios/types'
import type { World } from '@/core/types'

export interface FaultParam {
  name: string
  label: string
  kind: 'user' | 'computer' | 'group' | 'service' | 'text' | 'sku'
  /** Standard: Computer/Benutzer des Anfragenden */
  optional?: boolean
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

