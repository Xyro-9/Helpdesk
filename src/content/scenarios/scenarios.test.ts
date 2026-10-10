import { afterEach, describe, expect, it, vi } from 'vitest'
import { produce } from 'immer'
import { A } from '@/core/actions'
import { createInitialWorld } from '@/core/seed'
import { OU } from '@/core/seed/company'
import { evaluateTicket, spawnScenario, technicalStatus, tickWorld } from '@/core/scenarios/engine'
import { callerReply } from '@/core/scenarios/caller'
import type { Scenario } from '@/core/scenarios/types'
import type { Asset, ScenarioCtx, Shipment, Ticket, World } from '@/core/types'
import { addGroupMember, copyGroupsFrom, createUser, directGroupsOf, findComputer, findGroup, findUser, moveObject, removeGroupMember, resetPassword, setUserEnabled, unlockUser } from '@/core/ops/ad'
import { assignLicense, cloudResetPassword, convertToShared, findCloudUser, grantMailboxRight, removeLicense, resetMfa, revokeSessions, setSignInBlocked, syncCloud } from '@/core/ops/cloud'
import { applyGpoMappings, connectPrinter, deleteFs, emptyDir, findService, getEndpoint, HOSTS_PATH, killProcess, refreshToken, setProxySettings, setServiceStartType, startService, unmapDrive, writeFile } from '@/core/ops/endpoint'
import { DEFAULT_HOSTS } from '@/core/seed/endpoints'
import { fmtDate } from '@/core/util'
import { compileCustomScenario, FAULTS } from '@/content/faults'
import { KB_ARTICLES } from '@/content/kb'
import { SCENARIOS } from '@/content/scenarios'
import { KOENIG_KEY } from './endpoint'
import { NEW_HIRE } from './lifecycle'

type Solve = (w: World, ctx: ScenarioCtx, t: Ticket) => void

const log = (w: World, t: Ticket, type: string, detail?: string, target?: string) => w.actionLog.push({ id: `test-${w.actionLog.length}`, time: new Date().toISOString(), type, ticketId: t.id, detail, target })
const ep = (w: World, ctx: ScenarioCtx) => getEndpoint(w, ctx.vars.computer)!
const PW = 'Kompass#2026x'

function ship(w: World, t: Ticket, direction: Shipment['direction'], sam: string, items: string[], address: Shipment['address']): void {
  const u = findUser(w, sam)
  w.shipments.push({ id: `SH-TEST-${w.shipments.length}`, direction, ticketId: t.id, recipientName: u?.displayName ?? sam, recipientSam: sam, address, items, carrier: 'DHL', service: 'Standard', status: 'Beauftragt', created: new Date().toISOString(), updated: new Date().toISOString(), notes: '', events: [] })
}
const stockNotebook = (w: World): Asset => w.assets.find((a) => a.type === 'Notebook' && a.status === 'Lager')!

/** Musterlösungen über Core-Operationen – unabhängig von der Oberfläche */
const SOLUTIONS: Record<string, Solve> = {
  'konto-gesperrt-telefon': (w) => void unlockUser(w, 'l.schulz'),
  'drucker-spooler-mail': (w, ctx) => {
    setServiceStartType(ep(w, ctx), 'Spooler', 'Automatisch')
    startService(ep(w, ctx), 'Spooler')
  },
  'dns-falsch-chat': (w, ctx) => {
    const a = ep(w, ctx).adapters.find((x) => x.kind === 'Ethernet')!
    a.dnsFromDhcp = true
    a.dnsServers = ['10.10.0.10', '10.10.0.11']
  },
  'vpn-berechtigung-portal': (w) => void addGroupMember(w, 'GG_VPN_Benutzer', 'p.braun'),

  'kennwort-vergessen-telefon': (w) => void resetPassword(w, 't.richter', PW, { mustChange: true, unlock: true }),
  'kennwort-abgelaufen-homeoffice': (w) => void resetPassword(w, 'j.hoffmann', PW, { mustChange: false }),
  'konto-sperrt-wiederholt': (w, ctx) => {
    unmapDrive(ep(w, ctx), 'Z:')
    unlockUser(w, 's.peters')
  },
  'mfa-neues-smartphone': (w) => void resetMfa(w, 'j.hahn'),

  'social-engineering-vorstand': (w, _ctx, t) => {
    w.tickets.find((x) => x.id === t.id)!.assignmentGroup = 'Informationssicherheit'
  },
  'postfach-kompromittiert-weiterleitung': (w) => {
    const cu = findCloudUser(w, 'c.zimmermann')!
    cu.mailbox!.forwardingTo = undefined
    cu.mailbox!.inboxRules = cu.mailbox!.inboxRules.filter((r) => !r.suspicious)
    cu.mfa.methods = cu.mfa.methods.filter((m) => m.id !== 'mfa-attacker-bec')
    revokeSessions(w, cu.upn)
    cloudResetPassword(w, cu.upn, PW)
    cu.riskState = 'behoben'
  },
  'phishing-zugangsdaten-eingegeben': (w) => {
    revokeSessions(w, 'e.vogel')
    resetPassword(w, 'e.vogel', PW, { mustChange: true })
    w.cloud.blockedSenders.push('secure-verify.example')
    findCloudUser(w, 'e.vogel')!.riskState = 'behoben'
  },
  'hosts-datei-manipuliert': (w, ctx) => {
    const e = ep(w, ctx)
    writeFile(e, HOSTS_PATH, DEFAULT_HOSTS)
    e.dnsCache = {}
    deleteFs(e, ctx.vars.installer)
  },
  'adminrechte-anfrage': (w, _ctx, t) => {
    w.tickets.find((x) => x.id === t.id)!.assignmentGroup = '2nd Level Support'
  },

  'dhcp-bereich-voll': (w) => {
    const s = w.infra.dhcpScopes.find((x) => x.id === '10.10.30.0')!
    s.leases = s.leases.filter((l) => !l.hostname.startsWith('mde-'))
    // Client erneuert per tick (APIPA-Retry)
  },
  'proxy-messe-falsch': (w, ctx) => setProxySettings(ep(w, ctx), { enabled: false }),
  'vertrauensstellung-schulungs-pc': (w) => {
    findComputer(w, 'PC-SCHULUNG-01')!.secureChannelBroken = false
  },
  'zeitabweichung-kerberos': (w, ctx) => {
    const e = ep(w, ctx)
    setServiceStartType(e, 'W32Time', 'Manuell')
    startService(e, 'W32Time')
    e.timeOffsetMin = 0
    applyGpoMappings(w, e)
  },
  'netzlaufwerk-fehlt-gruppe': (w, ctx) => {
    addGroupMember(w, 'GG_Logistik', 'o.nowak')
    refreshToken(w, ep(w, ctx))
    applyGpoMappings(w, ep(w, ctx))
  },

  'druckserver-spooler-ausfall': (w) => {
    const q = w.infra.printQueues.find((x) => x.name === '1OG-Farbe')!
    q.jobs = q.jobs.filter((j) => j.status !== 'Fehler')
    w.infra.servers.find((s) => s.name === 'PRINT01')!.services.find((s) => s.name === 'Spooler')!.status = 'Wird ausgeführt'
  },
  'papierstau-eskalation': (w, ctx, t) => {
    w.tickets.find((x) => x.id === t.id)!.assignmentGroup = 'Vor-Ort-Service'
    expect(connectPrinter(w, ep(w, ctx), '\\\\PRINT01\\1OG-SW')).toBeNull()
  },

  'festplatte-voll': (w, ctx) => {
    const e = ep(w, ctx)
    emptyDir(e, '%TEMP%')
    deleteFs(e, 'C:\\Windows\\SoftwareDistribution\\Download\\feature-update-26h1.esd')
    emptyDir(e, 'C:\\$Recycle.Bin')
  },
  'pc-langsam-autostart': (w, ctx) => {
    const e = ep(w, ctx)
    e.startupApps.find((s) => s.name === 'SmartSaver Helper')!.enabled = false
    expect(killProcess(e, 'SmartSaver.exe')).toBeNull()
  },
  'bitlocker-wiederherstellung': (w, ctx, t) => {
    log(w, t, A.identityAsked)
    log(w, t, A.adBitlockerViewed, KOENIG_KEY.keyId, ctx.vars.computer)
    const call = w.calls.find((c) => c.ticketId === t.id)!
    call.transcript.push({ id: 'm1', from: 'tech', text: `Der Schlüssel lautet ${KOENIG_KEY.recoveryPassword}`, time: new Date().toISOString() })
    log(w, t, A.secretShared, 'Telefon')
  },

  'lizenz-fehlt-outlook': (w) => void assignLicense(w, 'd.krueger', 'CO_STANDARD'),
  'teampostfach-zugriff': (w) => {
    grantMailboxRight(w, 'einkauf@musterwerk.example', 'fullAccess', 's.schwarz')
    grantMailboxRight(w, 'einkauf@musterwerk.example', 'sendAs', 's.schwarz')
  },

  'onboarding-aussendienst': (w, _ctx, t) => {
    expect(createUser(w, { givenName: NEW_HIRE.given, surname: NEW_HIRE.sur, sam: NEW_HIRE.sam, password: PW, ou: OU.dept('Vertrieb'), department: 'Vertrieb', title: NEW_HIRE.title, manager: 'm.becker', employeeId: NEW_HIRE.employeeId, birthDate: NEW_HIRE.birthDate, homeOffice: true, homeAddress: { street: NEW_HIRE.street, postalCode: NEW_HIRE.postalCode, city: NEW_HIRE.city } })).toBeNull()
    copyGroupsFrom(w, 'n.krause', NEW_HIRE.sam)
    syncCloud(w)
    expect(assignLicense(w, NEW_HIRE.sam, 'CO_STANDARD')).toBeNull()
    const nb = stockNotebook(w)
    nb.assignedTo = NEW_HIRE.sam
    nb.status = 'Im Versand'
    ship(w, t, 'Ausgehend', NEW_HIRE.sam, [nb.tag], { street: NEW_HIRE.street, postalCode: NEW_HIRE.postalCode, city: NEW_HIRE.city, country: 'Deutschland' })
  },
  'offboarding-marketing': (w, ctx, t) => {
    const sam = 'a.koehler'
    setUserEnabled(w, sam, false)
    expect(moveObject(w, 'user', sam, OU.disabled)).toBeNull()
    for (const g of directGroupsOf(w, sam)) if (g !== 'Domänen-Benutzer') removeGroupMember(w, g, sam)
    setSignInBlocked(w, sam, true)
    revokeSessions(w, sam)
    convertToShared(w, sam)
    grantMailboxRight(w, sam, 'fullAccess', 's.meier')
    for (const l of [...findCloudUser(w, sam)!.licenses]) removeLicense(w, sam, l)
    const u = findUser(w, sam)!
    ship(w, t, 'Rücksendung', sam, [ctx.vars.assetTag], { ...u.homeAddress!, country: 'Deutschland' })
  },
  'notebook-display-defekt': (w, ctx, t) => {
    const nb = stockNotebook(w)
    nb.assignedTo = 'j.wagner'
    nb.status = 'Im Versand'
    w.assets.find((a) => a.tag === ctx.vars.oldTag)!.status = 'In Reparatur'
    const addr = { ...findUser(w, 'j.wagner')!.homeAddress!, country: 'Deutschland' }
    ship(w, t, 'Ausgehend', 'j.wagner', [nb.tag], addr)
    ship(w, t, 'Rücksendung', 'j.wagner', [ctx.vars.oldTag], addr)
  },
}

const BASIC_IDS = new Set(['konto-gesperrt-telefon', 'drucker-spooler-mail', 'dns-falsch-chat', 'vpn-berechtigung-portal'])

function start(s: Scenario, base: World = createInitialWorld('Test Azubi')) {
  let ticketId = ''
  const w = produce(base, (d) => {
    ticketId = spawnScenario(d, s).id
  })
  return { w, ticketId }
}
const ticket = (w: World, id: string) => w.tickets.find((x) => x.id === id)!
const tick = (w: World) => produce(w, (d) => void tickWorld(d, []))
const penaltiesHit = (w: World, t: Ticket, s: Scenario) => (s.penalties ?? []).filter((p) => p.test(w, t.scenarioCtx!)).map((p) => p.id)

afterEach(() => vi.useRealTimers())

describe('Szenario-Katalog', () => {
  it('hat eindeutige IDs, ausreichend viele Szenarien und die gewünschte Kanalmischung', () => {
    const ids = SCENARIOS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(SCENARIOS.length).toBeGreaterThanOrEqual(26)
    expect(SCENARIOS.filter((s) => s.channel === 'Telefon').length).toBeGreaterThanOrEqual(9)
    for (const d of [1, 2, 3] as const) expect(SCENARIOS.filter((s) => s.difficulty === d).length).toBeGreaterThanOrEqual(6)
  })

  it('verweist nur auf existierende KB-Artikel; KB-IDs sind eindeutig', () => {
    const kb = new Set(KB_ARTICLES.map((a) => a.id))
    expect(kb.size).toBe(KB_ARTICLES.length)
    expect(KB_ARTICLES.length).toBeGreaterThanOrEqual(25)
    for (const a of KB_ARTICLES) {
      expect(a.id).toMatch(/^KB\d{4}$/)
      expect(a.body.length).toBeGreaterThan(300)
      expect(a.body).not.toContain('´')
    }
    for (const s of SCENARIOS) for (const id of s.kb ?? []) expect(kb.has(id), `${s.id} → ${id}`).toBe(true)
  })

  it('jedes Szenario hat eine Musterlösung im Test', () => {
    for (const s of SCENARIOS) expect(SOLUTIONS[s.id], s.id).toBeTypeOf('function')
  })

  it.each(SCENARIOS.filter((s) => !BASIC_IDS.has(s.id)).map((s) => [s.id, s] as const))('Inhaltsqualität: %s', (_id, s) => {
    expect(s.hints).toHaveLength(3)
    expect(s.caller.facts.length).toBeGreaterThanOrEqual(3)
    expect(s.caller.facts.length).toBeLessThanOrEqual(6)
    expect(s.checks.length).toBeGreaterThanOrEqual(2)
    expect(s.checks.length).toBeLessThanOrEqual(5)
    expect(s.workNoteKeywords.length).toBeGreaterThanOrEqual(2)
    expect(s.workNoteKeywords.length).toBeLessThanOrEqual(4)
    expect(s.solution.length).toBeGreaterThanOrEqual(4)
    expect(s.caller.resolvedReply && s.caller.unresolvedReply && s.caller.persona && s.caller.fallback?.length).toBeTruthy()
    expect(s.expected?.priority && s.expected.category && s.expected.resolutionCodes?.length).toBeTruthy()
    expect(findUser(createInitialWorld('x'), s.requester), 'Anfragender aus den Seed-Daten').toBeTruthy()
  })
})

describe.each(SCENARIOS.map((s) => [s.id, s] as const))('Szenario %s', (_id, s) => {
  it('Setup erzeugt einen offenen Fehler, die Musterlösung macht alle Checks grün (auch nach tick)', () => {
    let { w, ticketId } = start(s)
    const t0 = ticket(w, ticketId)
    expect(t0.scenarioCtx).toBeTruthy()
    expect(technicalStatus(w, t0, s).passed, 'direkt nach dem Setup darf nichts gelöst sein').toBe(false)
    expect(penaltiesHit(w, t0, s), 'keine Abzüge direkt nach dem Setup').toEqual([])
    // ein tick ohne Lösung darf nichts "von selbst" lösen
    w = tick(w)
    expect(technicalStatus(w, ticket(w, ticketId), s).passed).toBe(false)

    w = produce(w, (d) => {
      const t = ticket(d, ticketId)
      SOLUTIONS[s.id](d, t.scenarioCtx!, t)
    })
    w = tick(w)
    const st = technicalStatus(w, ticket(w, ticketId), s)
    expect(st.items.filter((i) => !i.ok).map((i) => i.label)).toEqual([])
    w = tick(w)
    expect(technicalStatus(w, ticket(w, ticketId), s).passed).toBe(true)
    expect(penaltiesHit(w, ticket(w, ticketId), s)).toEqual([])

    // Bewertung läuft durch und gibt volle Technikpunkte
    const score = evaluateTicket(w, ticket(w, ticketId), s)
    expect(score.sections[0].earned).toBe(score.sections[0].max)
  })
})

describe('Zusammenspiel', () => {
  it('alle Szenarien gleichzeitig auf einer Welt starten und ticken wirft nicht', () => {
    let w = createInitialWorld('Test Azubi')
    const ids: string[] = []
    w = produce(w, (d) => {
      for (const s of SCENARIOS) ids.push(spawnScenario(d, s).id)
    })
    for (let i = 0; i < 3; i++) w = tick(w)
    SCENARIOS.forEach((s, i) => {
      const st = technicalStatus(w, ticket(w, ids[i]), s)
      expect(st.items.length).toBeGreaterThan(0)
    })
    // Lösungen nacheinander auf der gemeinsamen Welt anwenden → alle grün
    w = produce(w, (d) => {
      SCENARIOS.forEach((s, i) => {
        const t = ticket(d, ids[i])
        SOLUTIONS[s.id](d, t.scenarioCtx!, t)
      })
    })
    for (let i = 0; i < 2; i++) w = tick(w)
    // Druck-GPOs von Endpunkten, die während des Druckserver-Ausfalls entstanden, nachholen
    w = produce(w, (d) => {
      for (const e of Object.values(d.endpoints)) applyGpoMappings(d, e, true)
    })
    w = tick(w)
    const open = SCENARIOS.filter((s, i) => !technicalStatus(w, ticket(w, ids[i]), s).passed).map((s) => s.id)
    expect(open).toEqual([])
  })
})

describe('Spezialfälle', () => {
  const byId = (id: string) => SCENARIOS.find((s) => s.id === id)!

  it('Social Engineering: Anrufer nennt falsche Identitätsdaten; Reset wird bestraft', () => {
    const s = byId('social-engineering-vorstand')
    const { w, ticketId } = start(s)
    const u = findUser(w, 't.brandt')!
    const r = callerReply(w, { requester: 't.brandt', message: 'Bitte nennen Sie mir Ihre Personalnummer und Ihr Geburtsdatum.', channel: 'Telefon', ticket: ticket(w, ticketId), scenario: s, turn: 1 })
    expect(r.text).not.toContain(u.employeeId)
    expect(r.text).not.toContain(fmtDate(u.birthDate + 'T12:00:00'))
    const bad = produce(w, (d) => void resetPassword(d, 't.brandt', PW, { mustChange: true }))
    expect(penaltiesHit(bad, ticket(bad, ticketId), s)).toContain('reset')
  })

  it('Konto sperrt wiederholt: nur entsperren reicht nicht – tick sperrt erneut', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-10T08:00:00Z'))
    const s = byId('konto-sperrt-wiederholt')
    let { w } = start(s)
    w = produce(w, (d) => void unlockUser(d, 's.peters'))
    w = tick(w)
    expect(findUser(w, 's.peters')!.lockedOut).toBe(false)
    vi.setSystemTime(new Date('2026-10-10T08:01:00Z'))
    w = tick(w)
    expect(findUser(w, 's.peters')!.lockedOut).toBe(true)
  })

  it('Druckserver: Spooler ohne Entfernen des defekten Auftrags stürzt erneut ab', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-10T08:00:00Z'))
    const s = byId('druckserver-spooler-ausfall')
    let { w } = start(s)
    const spooler = (x: World) => x.infra.servers.find((v) => v.name === 'PRINT01')!.services.find((v) => v.name === 'Spooler')!.status
    w = produce(w, (d) => {
      d.infra.servers.find((v) => v.name === 'PRINT01')!.services.find((v) => v.name === 'Spooler')!.status = 'Wird ausgeführt'
    })
    w = tick(w)
    vi.setSystemTime(new Date('2026-10-10T08:01:00Z'))
    w = tick(w)
    expect(spooler(w)).toBe('Beendet')
  })

  it('PC langsam: nur Prozess beenden reicht nicht – Updater startet ihn neu', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-10T08:00:00Z'))
    const s = byId('pc-langsam-autostart')
    let { w, ticketId } = start(s)
    const host = ticket(w, ticketId).scenarioCtx!.vars.computer
    w = produce(w, (d) => void killProcess(getEndpoint(d, host)!, 'SmartSaver.exe'))
    w = tick(w)
    vi.setSystemTime(new Date('2026-10-10T08:01:00Z'))
    w = tick(w)
    expect(getEndpoint(w, host)!.processes.some((p) => p.name === 'SmartSaver.exe')).toBe(true)
  })

  it('BitLocker: alter Schlüssel am Telefon wird erkannt und bestraft', () => {
    const s = byId('bitlocker-wiederherstellung')
    let { w, ticketId } = start(s)
    w = produce(w, (d) => {
      const t = ticket(d, ticketId)
      const old = findComputer(d, t.scenarioCtx!.vars.computer)!.bitlockerKeys.find((k) => k.keyId === t.scenarioCtx!.vars.oldKeyId)!
      d.calls.find((c) => c.ticketId === t.id)!.transcript.push({ id: 'x', from: 'tech', text: old.recoveryPassword, time: new Date().toISOString() })
    })
    expect(penaltiesHit(w, ticket(w, ticketId), s)).toContain('wrong-key')
    expect(findComputer(w, ticket(w, ticketId).scenarioCtx!.vars.computer)!.bitlockerKeys.length).toBe(2)
  })

  it('Kennwort abgelaufen: "muss ändern" verhindert die VPN-Anmeldung', () => {
    const s = byId('kennwort-abgelaufen-homeoffice')
    let { w, ticketId } = start(s)
    w = produce(w, (d) => void resetPassword(d, 'j.hoffmann', PW, { mustChange: true }))
    w = tick(w)
    const st = technicalStatus(w, ticket(w, ticketId), s)
    expect(st.items.find((i) => i.id === 'vpn')!.ok).toBe(false)
    expect(getEndpoint(w, ticket(w, ticketId).scenarioCtx!.vars.computer)!.vpn.connected).toBe(false)
  })

  it('Netzlaufwerk: Gruppe allein reicht nicht – das Token muss erneuert werden', () => {
    const s = byId('netzlaufwerk-fehlt-gruppe')
    let { w, ticketId } = start(s)
    const host = ticket(w, ticketId).scenarioCtx!.vars.computer
    w = produce(w, (d) => {
      addGroupMember(d, 'GG_Logistik', 'o.nowak')
      applyGpoMappings(d, getEndpoint(d, host)!)
    })
    expect(technicalStatus(w, ticket(w, ticketId), s).items.find((i) => i.id === 'drive')!.ok).toBe(false)
    expect(findGroup(w, 'GG_Logistik')!.members).toContain('o.nowak')
  })

  it('Onboarding ist wiederholbar (Reste eines früheren Durchlaufs werden entfernt)', () => {
    const s = byId('onboarding-aussendienst')
    let { w, ticketId } = start(s)
    w = produce(w, (d) => {
      const t = ticket(d, ticketId)
      SOLUTIONS[s.id](d, t.scenarioCtx!, t)
    })
    const again = start(s, w)
    expect(findUser(again.w, NEW_HIRE.sam)).toBeUndefined()
    expect(technicalStatus(again.w, ticket(again.w, again.ticketId), s).passed).toBe(false)
  })

  it('Spooler-Mail (Basis) bleibt kompatibel: Dienst deaktiviert', () => {
    const s = byId('drucker-spooler-mail')
    const { w, ticketId } = start(s)
    expect(findService(getEndpoint(w, ticket(w, ticketId).scenarioCtx!.vars.computer)!.services, 'Spooler')!.startType).toBe('Deaktiviert')
  })
})

describe('Fehlerbibliothek', () => {
  const params: Record<string, Record<string, string>> = {
    'missing-group': { group: 'GG_ERP_Benutzer' },
    'unwanted-group': { group: 'GG_Lokale_Admins' },
    'service-stopped': { service: 'Spooler' },
  }
  it.each(FAULTS.map((f) => [f.type] as const))('%s: kompiliert, Setup läuft, Prüfung ist zunächst offen', (type) => {
    const s = compileCustomScenario({
      id: `custom-${type}`,
      title: type,
      summary: '',
      difficulty: 1,
      category: 'Sonstiges',
      requester: 'l.werner',
      channel: 'Portal',
      ticketTitle: type,
      ticketDescription: '',
      identityRequired: false,
      faults: [{ type, params: params[type] ?? {} }],
      callerIntro: 'Hallo',
      callerFacts: [],
      workNoteKeywords: [],
      hints: [],
      solution: [],
      created: new Date().toISOString(),
    })
    const { w, ticketId } = start(s)
    expect(s.checks.length).toBeGreaterThan(0)
    expect(technicalStatus(w, ticket(w, ticketId), s).passed).toBe(false)
  })
})
