// Hilfsfunktionen für Inventar & Versand (nur lesend bzw. auf World-Drafts innerhalb von updateWorld)

import type { AdUser, Asset, AssetStatus, AssetType, Shipment, ShipmentStatus, World } from '@/core/types'
import { nowIso } from '@/core/util'
import type { Tone } from '@/ui'

export const ASSET_TYPES: AssetType[] = ['Notebook', 'Desktop', 'Monitor', 'Dockingstation', 'Smartphone', 'Headset', 'Tastatur/Maus', 'Drucker', 'Tablet', 'Sonstiges']
export const ASSET_STATUSES: AssetStatus[] = ['In Benutzung', 'Lager', 'In Reparatur', 'Bestellt', 'Im Versand', 'Ausgemustert', 'Verloren/Gestohlen']

export const STATUS_TONE: Record<AssetStatus, Tone> = {
  'In Benutzung': 'green',
  Lager: 'blue',
  'In Reparatur': 'amber',
  Bestellt: 'violet',
  'Im Versand': 'sky',
  Ausgemustert: 'gray',
  'Verloren/Gestohlen': 'red',
}

export const SHIP_TONE: Record<ShipmentStatus, Tone> = {
  Entwurf: 'gray',
  Beauftragt: 'violet',
  Abgeholt: 'blue',
  Unterwegs: 'sky',
  Zugestellt: 'green',
  Problem: 'red',
  Storniert: 'gray',
}

export const TAG_PREFIX: Record<AssetType, string> = {
  Notebook: 'NB',
  Desktop: 'PC',
  Monitor: 'MON',
  Dockingstation: 'DOCK',
  Smartphone: 'MOB',
  Headset: 'HS',
  'Tastatur/Maus': 'KM',
  Drucker: 'PRN',
  Tablet: 'TAB',
  Sonstiges: 'SON',
}

export const WEIGHT_KG: Record<AssetType, number> = {
  Notebook: 2.4,
  Desktop: 7,
  Monitor: 6.5,
  Dockingstation: 1,
  Smartphone: 0.5,
  Headset: 0.4,
  'Tastatur/Maus': 1.1,
  Drucker: 12,
  Tablet: 0.9,
  Sonstiges: 1,
}

export const CARRIERS: Shipment['carrier'][] = ['DHL', 'UPS', 'DPD', 'GLS', 'Hauspost']
export const SERVICES: Shipment['service'][] = ['Standard', 'Express', 'Overnight']

export const STOCK_LOCATION = 'IT-Lager EG'

/** Standort eines Geräts, das einem Benutzer ausgegeben wird (Homeoffice oder Büro) */
export const locationFor = (u: AdUser | undefined) => (!u ? STOCK_LOCATION : u.homeOffice ? `Homeoffice ${u.homeAddress?.city ?? ''}`.trim() : u.office)

export const warrantyExpired = (a: Asset) => !!a.warrantyUntil && a.warrantyUntil < new Date().toISOString().slice(0, 10)

export const userName = (users: AdUser[], sam?: string) => (sam ? (users.find((u) => u.sam === sam)?.displayName ?? sam) : '')

export const addHistory = (a: Asset, text: string) => a.history.push({ time: nowIso(), text })

/** Nächstes freies Inventarkennzeichen (zählt world.counters.asset hoch – nur im Draft aufrufen) */
export function nextAssetTag(w: World, type: AssetType): string {
  let tag = ''
  do {
    tag = `MW-${TAG_PREFIX[type]}-${String(++w.counters.asset).padStart(4, '0')}`
  } while (w.assets.some((a) => a.tag === tag))
  return tag
}

export const addYears = (iso: string, years: number) => {
  const d = new Date(iso)
  d.setFullYear(d.getFullYear() + years)
  return d.toISOString().slice(0, 10)
}

export const companySender = (w: World) => {
  const [street, rest = ''] = w.company.address.split(',').map((x) => x.trim())
  const [postalCode, ...city] = rest.split(' ')
  return { name: `${w.company.legalName} – IT-Service`, street, postalCode, city: city.join(' '), country: 'Deutschland' }
}

export const SHIP_FLOW: ShipmentStatus[] = ['Beauftragt', 'Abgeholt', 'Unterwegs', 'Zugestellt']
