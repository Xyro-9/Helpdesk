// Seed: Inventar (Assets) und Versandhistorie

import type { AdComputer, AdUser, Asset, Shipment } from '../types'
import { daysAgo, hashString, rng, uid } from '../util'

const hist = (text: string, d: number) => ({ time: daysAgo(d), text })

export function buildAssets(users: AdUser[], computers: AdComputer[]): Asset[] {
  const assets: Asset[] = []
  let n = { NB: 1, PC: 1, MON: 1, DOCK: 1, PHONE: 1, HS: 1, KM: 1 }
  const tag = (k: keyof typeof n, prefix: string) => `MW-${prefix}-${String(n[k]++).padStart(4, '0')}`
  const serial = (s: string) => `${s.slice(0, 2).toUpperCase()}${(hashString(s) % 9_000_000) + 1_000_000}`

  for (const c of computers) {
    if (c.ou.includes('Domain Controllers') || c.ou.includes('OU=Server')) continue
    const nb = c.name.startsWith('NB-')
    const user = users.find((u) => u.sam === c.managedBy)
    const t = nb ? tag('NB', 'NB') : tag('PC', 'PC')
    const r = rng(hashString(c.name))
    const bought = 200 + Math.floor(r() * 900)
    assets.push({
      tag: t,
      type: nb ? 'Notebook' : 'Desktop',
      manufacturer: nb ? 'Nordtec Computer' : 'Delta Computer',
      model: nb ? 'ProBook 14 G10' : 'OptiDesk 7020 SFF',
      serial: serial(c.name),
      status: user ? 'In Benutzung' : 'Lager',
      assignedTo: user?.sam,
      location: user ? (user.homeOffice ? `Homeoffice ${user.homeAddress?.city ?? ''}` : user.office) : 'IT-Lager EG',
      hostname: c.name,
      purchaseDate: daysAgo(bought).slice(0, 10),
      warrantyUntil: daysAgo(bought - 1095).slice(0, 10),
      costEur: nb ? 1349 : 899,
      notes: '',
      history: [hist('Inventarisiert', bought), ...(user ? [hist(`Ausgegeben an ${user.displayName}`, bought - 3)] : [])],
    })
    if (user) {
      assets.push({
        tag: tag('MON', 'MON'),
        type: 'Monitor',
        manufacturer: 'Viewline',
        model: 'VL-2723 27" QHD',
        serial: serial(c.name + 'mon'),
        status: 'In Benutzung',
        assignedTo: user.sam,
        location: user.homeOffice ? `Homeoffice ${user.homeAddress?.city ?? ''}` : user.office,
        purchaseDate: daysAgo(bought).slice(0, 10),
        warrantyUntil: daysAgo(bought - 1095).slice(0, 10),
        costEur: 289,
        notes: '',
        history: [hist(`Ausgegeben an ${user.displayName}`, bought - 3)],
      })
      if (nb) {
        assets.push({
          tag: tag('DOCK', 'DOCK'),
          type: 'Dockingstation',
          manufacturer: 'Nordtec Computer',
          model: 'USB-C Dock G5',
          serial: serial(c.name + 'dock'),
          status: 'In Benutzung',
          assignedTo: user.sam,
          location: user.homeOffice ? `Homeoffice ${user.homeAddress?.city ?? ''}` : user.office,
          purchaseDate: daysAgo(bought).slice(0, 10),
          warrantyUntil: daysAgo(bought - 1095).slice(0, 10),
          costEur: 219,
          notes: '',
          history: [hist(`Ausgegeben an ${user.displayName}`, bought - 3)],
        })
      }
      if (user.mobile) {
        assets.push({
          tag: tag('PHONE', 'MOB'),
          type: 'Smartphone',
          manufacturer: 'Phonix',
          model: 'Phonix 14 128 GB',
          serial: serial(user.sam + 'phone'),
          status: 'In Benutzung',
          assignedTo: user.sam,
          location: user.office,
          purchaseDate: daysAgo(400).slice(0, 10),
          warrantyUntil: daysAgo(-330).slice(0, 10),
          costEur: 749,
          notes: `Rufnummer ${user.mobile}`,
          history: [hist(`Ausgegeben an ${user.displayName}`, 395)],
        })
      }
      if (user.department === 'Kundenservice') {
        assets.push({
          tag: tag('HS', 'HS'),
          type: 'Headset',
          manufacturer: 'Klangwerk',
          model: 'Office Duo USB',
          serial: serial(user.sam + 'hs'),
          status: 'In Benutzung',
          assignedTo: user.sam,
          location: user.office,
          purchaseDate: daysAgo(300).slice(0, 10),
          warrantyUntil: daysAgo(-430).slice(0, 10),
          costEur: 129,
          notes: '',
          history: [hist(`Ausgegeben an ${user.displayName}`, 298)],
        })
      }
    }
  }

  // Lagerbestand
  const stock = (type: Asset['type'], prefix: keyof typeof n, p: string, manufacturer: string, model: string, costEur: number, count: number, notes = '') => {
    for (let i = 0; i < count; i++)
      assets.push({
        tag: tag(prefix, p),
        type,
        manufacturer,
        model,
        serial: serial(model + i),
        status: 'Lager',
        location: 'IT-Lager EG',
        purchaseDate: daysAgo(60).slice(0, 10),
        warrantyUntil: daysAgo(-1035).slice(0, 10),
        costEur,
        notes,
        history: [hist('Wareneingang', 60)],
      })
  }
  stock('Monitor', 'MON', 'MON', 'Viewline', 'VL-2723 27" QHD', 289, 5)
  stock('Dockingstation', 'DOCK', 'DOCK', 'Nordtec Computer', 'USB-C Dock G5', 219, 3)
  stock('Smartphone', 'PHONE', 'MOB', 'Phonix', 'Phonix 15 128 GB', 799, 3, 'Neu, originalverpackt')
  stock('Headset', 'HS', 'HS', 'Klangwerk', 'Office Duo USB', 129, 6)
  stock('Tastatur/Maus', 'KM', 'KM', 'Inputec', 'Desk Set Wireless DE', 49, 8)

  // ein Gerät in Reparatur
  const rep = assets.find((a) => a.type === 'Monitor' && a.status === 'Lager')
  if (rep) {
    rep.status = 'In Reparatur'
    rep.location = 'Hersteller-Service (RMA 88412)'
    rep.notes = 'Pixelfehler – RMA beim Hersteller'
    rep.history.push(hist('An Hersteller versendet (RMA 88412)', 9))
  }
  return assets
}

export function buildShipments(users: AdUser[], assets: Asset[]): Shipment[] {
  const u = users.find((x) => x.sam === 'j.wagner')
  const a = assets.find((x) => x.type === 'Dockingstation' && x.assignedTo === 'j.wagner')
  if (!u || !u.homeAddress || !a) return []
  return [
    {
      id: 'SH-2026-00031',
      direction: 'Ausgehend',
      recipientName: u.displayName,
      recipientSam: u.sam,
      address: { ...u.homeAddress, country: 'Deutschland' },
      items: [a.tag],
      carrier: 'DHL',
      service: 'Standard',
      tracking: '00340434161094042557',
      status: 'Zugestellt',
      created: daysAgo(40),
      updated: daysAgo(38),
      notes: 'Ersatz-Dockingstation',
      events: [
        { time: daysAgo(40), text: 'Sendung angelegt' },
        { time: daysAgo(39.5), text: 'Abgeholt durch DHL' },
        { time: daysAgo(38), text: 'Zugestellt – Empfänger persönlich' },
      ],
    },
  ]
}

export const shipmentId = (n: number) => `SH-${new Date().getFullYear()}-${String(n).padStart(5, '0')}`
export const trackingFor = (carrier: string) => {
  const r = rng(Date.now() % 100000)
  const digits = (k: number) => Array.from({ length: k }, () => Math.floor(r() * 10)).join('')
  if (carrier === 'UPS') return `1Z${digits(16)}`
  if (carrier === 'DPD') return digits(14)
  if (carrier === 'GLS') return digits(11)
  if (carrier === 'Hauspost') return `HP-${digits(6)}`
  return `00${digits(18)}`
}

export const newAssetHistory = (text: string) => ({ time: new Date().toISOString(), text, id: uid('h') })
