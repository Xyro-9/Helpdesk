import { describe, expect, it } from 'vitest'
import { addGroupMember } from '@/core/ops/ad'
import { createInitialWorld } from '@/core/seed'
import { cancelJob, cleanupLeases, clearQueue, controlServerService, effectiveShareAccess, eventFields, filterEvents, membershipPath, normalizeMac, parseIdList, relativeName, scopeStats, syncReadiness, validateDnsRecord, validateReservation, validateScopeEdit } from './lib'

const fresh = () => createInitialWorld('Azubi Test')

describe('DHCP', () => {
  it('berechnet die Auslastung ohne Ausschlüsse', () => {
    const w = fresh()
    const s = w.infra.dhcpScopes.find((x) => x.id === '10.10.99.0')!
    const st = scopeStats(s)
    expect(st.total).toBe(150)
    expect(st.excluded).toBe(10)
    expect(st.pool).toBe(140)
    s.leases.push({ ip: '10.10.99.60', mac: '', hostname: 'a', expires: new Date(Date.now() + 1e6).toISOString(), state: 'Aktiv' })
    s.leases.push({ ip: '10.10.99.61', mac: '', hostname: 'b', expires: new Date(Date.now() - 1e6).toISOString(), state: 'Abgelaufen' })
    s.leases.push({ ip: '10.10.99.62', mac: '', hostname: '', expires: new Date().toISOString(), state: 'BAD_ADDRESS' })
    s.exclusions.push({ start: '10.10.99.55', end: '10.10.99.70' })
    const st2 = scopeStats(s)
    expect(st2.excluded).toBe(21) // 50-70 zusammengeführt
    expect(st2.used).toBe(0) // alle belegten Adressen liegen im Ausschluss
    expect(st2.bad).toBe(1)
    expect(cleanupLeases(s)).toEqual({ expired: 1, bad: 1 })
  })

  it('validiert Bereich, Reservierung und MAC', () => {
    const w = fresh()
    const s = w.infra.dhcpScopes[0]
    const base = { name: 'x', rangeStart: s.rangeStart, rangeEnd: s.rangeEnd, router: s.router, dnsServers: s.dnsServers, domainName: s.domainName, leaseHours: 8 }
    expect(validateScopeEdit(s, base)).toBeNull()
    expect(validateScopeEdit(s, { ...base, rangeEnd: '10.10.11.20' })).toMatch(/Subnetz/)
    expect(validateScopeEdit(s, { ...base, router: '10.10.10.100' })).toMatch(/Adresskonflikt/)
    expect(normalizeMac('3c:52:82:aa:bb:cc')).toBe('3C-52-82-AA-BB-CC')
    expect(normalizeMac('123')).toBeNull()
    expect(validateReservation(s, '10.10.10.150', '3c5282aabbcc', 'PC')).toBeNull()
    expect(validateReservation(s, '10.10.20.150', '3c5282aabbcc', 'PC')).toMatch(/Subnetz/)
  })
})

describe('DNS', () => {
  it('normalisiert Namen und prüft Einträge', () => {
    expect(relativeName('PC-1.musterwerk.local.', 'musterwerk.local')).toBe('pc-1')
    expect(relativeName('', 'musterwerk.local')).toBe('@')
    const recs = fresh().infra.dnsZones[0].records
    expect(validateDnsRecord('musterwerk.local', { name: 'neu', type: 'A', value: '10.10.0.99', ttl: 3600 }, recs)).toBeNull()
    expect(validateDnsRecord('musterwerk.local', { name: 'neu', type: 'A', value: '10.10.0.999', ttl: 3600 }, recs)).toMatch(/IPv4/)
    expect(validateDnsRecord('musterwerk.local', { name: 'intranet', type: 'A', value: '10.10.0.1', ttl: 3600 }, recs)).toMatch(/CNAME/)
    expect(validateDnsRecord('musterwerk.local', { name: 'x', type: 'MX', value: 'mail', ttl: 3600 }, recs)).toMatch(/MX/)
  })
})

describe('Server-Dienste & Druck', () => {
  it('Neustart des Spoolers auf PRINT01 verwirft hängende Aufträge', () => {
    const w = fresh()
    const q = w.infra.printQueues[0]
    q.jobs.push({ id: 1, document: 'a', owner: 'x', pages: 1, sizeKb: 1, status: 'Fehler', submitted: '' }, { id: 2, document: 'b', owner: 'x', pages: 1, sizeKb: 1, status: 'In Warteschlange', submitted: '' })
    expect(cancelJob(q, 1)).toBe('stuck')
    expect(clearQueue(q)).toEqual({ removed: 1, stuck: 1 })
    const r = controlServerService(w, 'PRINT01', 'Spooler', 'restart')
    expect(r.ok).toBe(true)
    expect(q.jobs).toHaveLength(0)
    expect(w.infra.servers.find((s) => s.name === 'PRINT01')!.events[0].log).toBe('Anwendung')
  })

  it('meldet Fehler bei deaktivierten Diensten und Offline-Servern', () => {
    const w = fresh()
    const dc = w.infra.servers.find((s) => s.name === 'DC01')!
    expect(controlServerService(w, 'DC01', 'DHCPServer', 'stop').ok).toBe(true)
    expect(dc.services.find((s) => s.name === 'DHCPServer')!.status).toBe('Beendet')
    dc.services.find((s) => s.name === 'DHCPServer')!.startType = 'Deaktiviert'
    expect(controlServerService(w, 'DC01', 'DHCPServer', 'start').ok).toBe(false)
    dc.online = false
    expect(controlServerService(w, 'DC01', 'DNS', 'restart').message).toMatch(/offline/)
  })

  it('Cloud-Sync-Bereitschaft folgt dem Dienststatus', () => {
    const w = fresh()
    expect(syncReadiness(w).ok).toBe(true)
    controlServerService(w, 'SYNC01', 'CloudSync', 'stop')
    expect(syncReadiness(w).ok).toBe(false)
  })
})

describe('Freigaben & Ereignisse', () => {
  it('ermittelt effektiven Zugriff über verschachtelte Gruppen', () => {
    const w = fresh()
    const share = w.infra.shares.find((s) => s.name === 'Vertrieb')!
    const r = effectiveShareAccess(w, 'l.schulz', share)
    expect(r.access).toBe('Ändern')
    expect(r.matches[0].path).toEqual(['l.schulz', 'GG_Vertrieb', 'FS_Vertrieb_RW'])
    expect(effectiveShareAccess(w, 'p.braun', share).access).toBe('Kein Zugriff')
    expect(membershipPath(w, 'p.jung', 'FS_Vertrieb_R')).toEqual(['p.jung', 'GG_Kundenservice', 'FS_Vertrieb_R'])
    share.permissions.push({ principal: 'GG_Vertrieb', access: 'Verweigern' })
    expect(effectiveShareAccess(w, 'l.schulz', share).access).toBe('Verweigert')
    addGroupMember(w, 'FS_Vertrieb_R', 'p.braun')
    expect(effectiveShareAccess(w, 'p.braun', share).access).toBe('Lesen')
  })

  it('filtert Ereignisse und liest Felder', () => {
    const ev = (id: number, t: string, msg: string) => ({ id: String(id) + t, log: 'Sicherheit' as const, eventId: id, level: 'Informationen' as const, source: 's', time: t, message: msg, computer: 'DC01' })
    const list = [ev(4625, '2026-01-01', 'Kontoname: a'), ev(4740, '2026-01-02', 'Gesperrtes Konto: MUSTERWERK\\l.schulz\nAufrufername des Computers: NB-VT-002')]
    expect(filterEvents(list, { ids: [4740] })).toHaveLength(1)
    expect(filterEvents(list, { query: 'l.schulz' })[0].eventId).toBe(4740)
    expect(filterEvents(list, {})[0].eventId).toBe(4740)
    expect(eventFields(list[1].message)).toContainEqual(['Aufrufername des Computers', 'NB-VT-002'])
    expect(parseIdList('4740, 4625;x')).toEqual([4740, 4625])
  })
})
