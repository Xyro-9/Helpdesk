import { describe, expect, it } from 'vitest'
import { createInitialWorld } from '@/core/seed'
import { checkPasswordPolicy, rng } from '@/core/util'
import { ancestorDns, buildOuTree, diffObject, dnToPath, fmtYmd, generatePassword, isPrivilegedGroup, listContainer, parentDn, passwordState, searchDirectory, suggestSam, uacFlags } from './lib'

const w = createInitialWorld('Azubi Test')

describe('OU-Hierarchie', () => {
  it('ermittelt übergeordnete DNs', () => {
    expect(parentDn('OU=Vertrieb,OU=Benutzer,OU=Musterwerk,DC=musterwerk,DC=local')).toBe('OU=Benutzer,OU=Musterwerk,DC=musterwerk,DC=local')
    expect(ancestorDns('OU=Vertrieb,OU=Benutzer,DC=x,DC=y')).toEqual(['OU=Benutzer,DC=x,DC=y', 'DC=x,DC=y', 'DC=y'])
  })

  it('baut einen Baum mit der Domäne als einziger Wurzel', () => {
    const tree = buildOuTree(w.ous)
    expect(tree).toHaveLength(1)
    expect(tree[0].ou.kind).toBe('domain')
    const mw = tree[0].children.find((n) => n.ou.name === 'Musterwerk')!
    const benutzer = mw.children.find((n) => n.ou.name === 'Benutzer')!
    expect(benutzer.children.map((c) => c.ou.name)).toContain('Vertrieb')
    // OUs vor Containern
    const kinds = tree[0].children.map((c) => c.ou.kind)
    expect(kinds.indexOf('container')).toBeGreaterThan(kinds.indexOf('ou'))
  })

  it('formatiert DN als Pfad', () => {
    expect(dnToPath('OU=Vertrieb,OU=Benutzer,OU=Musterwerk,DC=musterwerk,DC=local')).toBe('musterwerk.local/Musterwerk/Benutzer/Vertrieb')
  })
})

describe('Objektliste und Suche', () => {
  it('listet Benutzer einer Abteilungs-OU', () => {
    const list = listContainer(w, 'OU=Vertrieb,OU=Benutzer,OU=Musterwerk,DC=musterwerk,DC=local')
    expect(list.some((e) => e.kind === 'user' && e.id === 'j.hoffmann')).toBe(true)
    expect(list.every((e) => e.kind === 'user')).toBe(true)
  })

  it('zeigt Unter-OUs zuerst', () => {
    const list = listContainer(w, 'OU=Musterwerk,DC=musterwerk,DC=local')
    expect(list[0].kind).toBe('ou')
  })

  it('findet über Personalnummer, Telefon, Anmeldename und Computername', () => {
    const u = w.users.find((x) => x.sam === 'l.schulz')!
    expect(searchDirectory(w, u.employeeId).map((e) => e.id)).toContain('l.schulz')
    const ext = u.phone.split('-').pop()!
    expect(searchDirectory(w, `5550 ${ext}`).map((e) => e.id)).toContain('l.schulz')
    expect(searchDirectory(w, 'schulz').map((e) => e.id)).toContain('l.schulz')
    expect(searchDirectory(w, 'koenig').map((e) => e.id)).toContain('r.koenig')
    expect(searchDirectory(w, 'König').map((e) => e.id)).toContain('r.koenig')
    expect(searchDirectory(w, 'it-adm').some((e) => e.kind === 'computer' && e.id === 'IT-ADM-01')).toBe(true)
    expect(searchDirectory(w, '   ')).toEqual([])
  })

  it('markiert gesperrte und deaktivierte Konten', () => {
    const list = searchDirectory(w, 'seidel')
    expect(list.find((e) => e.id === 'u.seidel')?.disabled).toBe(true)
  })
})

describe('Neuer Benutzer', () => {
  it('schlägt Anmeldenamen mit ersetzten Umlauten vor', () => {
    expect(suggestSam('Jürgen', 'Müller')).toBe('j.mueller')
    expect(suggestSam('Ayşe', 'Demir')).toBe('a.demir')
    expect(suggestSam('Zoë', 'Brontë')).toBe('z.bronte')
    expect(suggestSam('Hans', 'Groß-Weißenborn-Schulze')).toHaveLength(20)
    expect(suggestSam('', 'Meier')).toBe('meier')
    expect(suggestSam('', '')).toBe('')
  })

  it('generiert richtlinienkonforme Kennwörter', () => {
    const r = rng(42)
    for (let i = 0; i < 200; i++) {
      const pw = generatePassword(10, r)
      expect(pw.length).toBeGreaterThanOrEqual(12)
      expect(checkPasswordPolicy(pw, w.domain.minPasswordLength, w.domain.complexity, 'l.schulz')).toBeNull()
    }
  })
})

describe('Bearbeiten', () => {
  it('ermittelt nur geänderte Felder', () => {
    const u = w.users[0]
    const draft = { ...u, title: 'Neu', homeAddress: u.homeAddress ? { ...u.homeAddress } : undefined, description: u.description ?? '' }
    expect(Object.keys(diffObject(u, draft, ['title', 'homeAddress', 'description', 'department']))).toEqual(['title'])
  })

  it('erkennt privilegierte Gruppen', () => {
    expect(isPrivilegedGroup('Domänen-Admins')).toBe(true)
    expect(isPrivilegedGroup('GG_Lokale_Admins')).toBe(true)
    expect(isPrivilegedGroup('GG_Vertrieb')).toBe(false)
  })

  it('zeigt userAccountControl und Kennwortstatus', () => {
    const u = { ...w.users[0], enabled: false, passwordNeverExpires: true }
    expect(uacFlags(u)).toContain('ACCOUNTDISABLE')
    expect(uacFlags(u)).toMatch(/^0x10202 /)
    expect(passwordState({ ...u, mustChangePassword: true }, 90).tone).toBe('amber')
    expect(passwordState({ ...u, passwordNeverExpires: false, mustChangePassword: false, pwdLastSet: new Date(Date.now() - 100 * 86_400_000).toISOString() }, 90).label).toBe('Abgelaufen')
    expect(fmtYmd('1984-03-07')).toBe('07.03.1984')
  })
})
