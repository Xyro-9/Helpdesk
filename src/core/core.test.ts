import { describe, expect, it } from 'vitest'
import { produce } from 'immer'
import { createInitialWorld } from './seed'
import { allScenarios, evaluateTicket, spawnScenario, technicalStatus } from './scenarios/engine'
import { callerReply } from './scenarios/caller'
import { findUser, primaryComputerOf, unlockUser } from './ops/ad'
import { ensureEndpoint, getEndpoint, isServiceRunning, setServiceStartType, startService } from './ops/endpoint'
import { connectivity, resolveName } from './sim/network'
import type { World } from './types'

const fresh = () => createInitialWorld('Test Azubi')

describe('Seed-Welt', () => {
  it('erzeugt Benutzer, Gruppen, Computer und Cloud-Konten', () => {
    const w = fresh()
    expect(w.users.length).toBeGreaterThan(30)
    expect(w.groups.find((g) => g.name === 'GG_VPN_Benutzer')).toBeTruthy()
    expect(primaryComputerOf(w, 'l.schulz')?.name).toMatch(/^PC-VT-/)
    expect(w.cloud.users.some((c) => c.sam === 'l.schulz')).toBe(true)
  })

  it('Endpunkte haben funktionierendes Netzwerk', () => {
    const w = produce(fresh(), (d) => {
      spawnScenario(d, allScenarios().find((s) => s.id === 'vpn-berechtigung-portal')!)
    })
    const w2 = produce(w, (d) => {
      ensureEndpoint(d, primaryComputerOf(d, 'l.lehmann')!.name)
    })
    const ep = getEndpoint(w2, primaryComputerOf(w2, 'l.lehmann')!.name)!
    expect(connectivity(w2, ep)).toEqual({ intranet: true, internet: true })
    expect(resolveName(w2, ep, 'fs01').ip).toBe('10.10.0.20')
  })
})

describe('Szenarien', () => {
  it('Konto gesperrt: Setup, Anrufer, Lösung, Bewertung', () => {
    const s = allScenarios().find((x) => x.id === 'konto-gesperrt-telefon')!
    let w: World = fresh()
    let ticketId = ''
    w = produce(w, (d) => {
      ticketId = spawnScenario(d, s).id
    })
    expect(findUser(w, 'l.schulz')!.lockedOut).toBe(true)
    expect(w.calls[0].state).toBe('klingelt')
    const t = () => w.tickets.find((x) => x.id === ticketId)!
    expect(technicalStatus(w, t(), s).passed).toBe(false)

    const r1 = callerReply(w, { requester: 'l.schulz', message: 'Können Sie mir bitte Ihre Personalnummer und Ihr Geburtsdatum nennen?', channel: 'Telefon', ticket: t(), scenario: s, turn: 1 })
    expect(r1.text).toContain(findUser(w, 'l.schulz')!.employeeId)
    expect(r1.actions.map((a) => a.type)).toContain('comm.identityAsked')

    const r2 = callerReply(w, { requester: 'l.schulz', message: 'Funktioniert es jetzt?', channel: 'Telefon', ticket: t(), scenario: s, turn: 2 })
    expect(r2.text).toMatch(/immer noch/)

    w = produce(w, (d) => {
      d.actionLog.push({ id: 'a1', time: new Date().toISOString(), type: 'comm.identityAsked', ticketId })
      d.actionLog.push({ id: 'a0', time: new Date().toISOString(), type: 'ticket.claimed', ticketId })
      unlockUser(d, 'l.schulz')
      d.actionLog.push({ id: 'a2', time: new Date().toISOString(), type: 'ad.unlock', ticketId })
      d.actionLog.push({ id: 'a3', time: new Date().toISOString(), type: 'comm.confirmAsked', ticketId })
      const tk = d.tickets.find((x) => x.id === ticketId)!
      tk.category = 'Konto & Zugriff'
      tk.priority = 'P3 – Mittel'
      tk.status = 'Gelöst'
      tk.resolutionCode = 'Gelöst (dauerhaft)'
      tk.resolvedAt = new Date().toISOString()
      tk.resolutionNote = 'Konto entsperrt, Ursache: altes Kennwort auf dem Handy.'
      tk.workNotes.push({ id: 'n', author: 'Azubi', time: new Date().toISOString(), text: 'Identität geprüft (Personalnummer + Geburtsdatum). Konto war gesperrt (Lockout durch Handy mit altem Kennwort). Konto entsperrt, Benutzerin kann sich wieder anmelden.' })
    })
    const r3 = callerReply(w, { requester: 'l.schulz', message: 'Funktioniert es jetzt wieder?', channel: 'Telefon', ticket: t(), scenario: s, turn: 3 })
    expect(r3.text).toMatch(/komme ich rein/)
    const score = evaluateTicket(w, t(), s)
    expect(score.sections[0].earned).toBe(score.sections[0].max)
    expect(score.percent).toBeGreaterThanOrEqual(80)
    expect(score.passed).toBe(true)
  })

  it('Spooler-Szenario: Dienst starten + Starttyp korrigieren', () => {
    const s = allScenarios().find((x) => x.id === 'drucker-spooler-mail')!
    let ticketId = ''
    let w = produce(fresh(), (d) => {
      ticketId = spawnScenario(d, s).id
    })
    const t = () => w.tickets.find((x) => x.id === ticketId)!
    const host = t().scenarioCtx!.vars.computer
    expect(isServiceRunning(getEndpoint(w, host)!, 'Spooler')).toBe(false)
    w = produce(w, (d) => {
      const ep = getEndpoint(d, host)!
      expect(startService(ep, 'Spooler')).toMatch(/deaktiviert/)
      setServiceStartType(ep, 'Spooler', 'Automatisch')
      expect(startService(ep, 'Spooler')).toBeNull()
    })
    expect(technicalStatus(w, t(), s).passed).toBe(true)
  })

  it('DNS-Szenario: Intranet erst nach Korrektur erreichbar', () => {
    const s = allScenarios().find((x) => x.id === 'dns-falsch-chat')!
    let ticketId = ''
    let w = produce(fresh(), (d) => {
      ticketId = spawnScenario(d, s).id
    })
    const host = w.tickets.find((x) => x.id === ticketId)!.scenarioCtx!.vars.computer
    expect(connectivity(w, getEndpoint(w, host)!)).toEqual({ intranet: false, internet: true })
    w = produce(w, (d) => {
      const a = getEndpoint(d, host)!.adapters.find((x) => x.kind === 'Ethernet')!
      a.dnsFromDhcp = true
      a.dnsServers = ['10.10.0.10', '10.10.0.11']
    })
    expect(connectivity(w, getEndpoint(w, host)!)).toEqual({ intranet: true, internet: true })
  })
})
