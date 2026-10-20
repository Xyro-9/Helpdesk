// Routing: Hostname → simulierte Website. Drucker werden über IP bzw. Hostname erkannt.

import type { LucideIcon } from 'lucide-react'
import {
  BookOpen,
  Building2,
  Cloud,
  CloudCog,
  Factory,
  Globe,
  KeyRound,
  Mail,
  Newspaper,
  Activity,
  Printer,
  Search,
  ShieldAlert,
  Truck,
  Network,
  Database,
  MessagesSquare,
  TriangleAlert,
} from 'lucide-react'
import { INTERNET_HOSTS } from '@/core/sim/network'
import type { World } from '@/core/types'
import type { Route, SiteId } from './types'

export const SITE_META: Record<SiteId, { title: string; icon: LucideIcon; color: string }> = {
  intranet: { title: 'Musterwerk Intranet', icon: Factory, color: 'text-teal-700' },
  kb: { title: 'IT-Wissensdatenbank', icon: BookOpen, color: 'text-teal-700' },
  status: { title: 'IT-Status', icon: Activity, color: 'text-emerald-600' },
  erp: { title: 'MW-ERP', icon: Database, color: 'text-orange-600' },
  konto: { title: 'Kennwort-Portal', icon: KeyRound, color: 'text-teal-700' },
  cloudadmin: { title: 'Cloud Admin Center', icon: CloudCog, color: 'text-indigo-600' },
  cloudlogin: { title: 'Anmelden – Cloud-Konto', icon: Cloud, color: 'text-indigo-600' },
  cloudstatus: { title: 'Cloud-Dienststatus', icon: Cloud, color: 'text-indigo-600' },
  webmail: { title: 'Webmail', icon: Mail, color: 'text-indigo-600' },
  search: { title: 'Suche', icon: Search, color: 'text-violet-600' },
  techdocs: { title: 'Fachartikel', icon: MessagesSquare, color: 'text-cyan-700' },
  phishing: { title: 'Anmelden', icon: Cloud, color: 'text-blue-500' },
  company: { title: 'Musterwerk AG', icon: Building2, color: 'text-teal-700' },
  tracking: { title: 'Sendungsverfolgung', icon: Truck, color: 'text-amber-600' },
  news: { title: 'Nachrichten', icon: Newspaper, color: 'text-red-600' },
  vpn: { title: 'SecureLink VPN-Portal', icon: Network, color: 'text-slate-700' },
  printer: { title: 'Drucker-Weboberfläche', icon: Printer, color: 'text-slate-700' },
  generic: { title: 'Seite nicht verfügbar', icon: Globe, color: 'text-slate-500' },
  suspicious: { title: 'Gewinnbenachrichtigung', icon: TriangleAlert, color: 'text-amber-500' },
}

export const CERT_ICON = ShieldAlert

const HOST_SITES: Record<string, SiteId> = {
  'intranet.musterwerk.local': 'intranet',
  intranet: 'intranet',
  'app01.musterwerk.local': 'intranet',
  app01: 'intranet',
  '10.10.0.40': 'intranet',
  'kb.musterwerk.local': 'kb',
  kb: 'kb',
  'status.musterwerk.local': 'status',
  status: 'status',
  'erp.musterwerk.local': 'erp',
  erp: 'erp',
  'konto.musterwerk.example': 'konto',
  'admin.cloudadmin.example': 'cloudadmin',
  'portal.cloudadmin.example': 'cloudadmin',
  'login.cloudadmin.example': 'cloudlogin',
  'mail.cloudadmin.example': 'webmail',
  'outlook.cloudadmin.example': 'webmail',
  'status.cloudadmin.example': 'cloudstatus',
  'www.suche.example': 'search',
  'suche.example': 'search',
  'docs.techwissen.example': 'techdocs',
  'forum.adminhilfe.example': 'techdocs',
  'cloudadmin-login.secure-verify.example': 'phishing',
  'paket-zustellung-info.example': 'phishing',
  'www.musterwerk.example': 'company',
  'musterwerk.example': 'company',
  'tracking.versand.example': 'tracking',
  'www.paketdienst.example': 'tracking',
  'www.nachrichten.example': 'news',
  'vpn.musterwerk.example': 'vpn',
}

export function findPrinterByHost(w: World, host: string) {
  const h = host.toLowerCase().replace(/\.$/, '')
  const short = h.replace(/\.musterwerk\.local$/, '')
  return w.infra.printers.find((p) => p.ip === h || p.hostname.toLowerCase() === short)
}

/** Welche Website liefert der Server für diesen Host aus? */
export function routeFor(w: World, rawHost: string): Route {
  const host = rawHost.toLowerCase().replace(/\.$/, '')
  const prn = findPrinterByHost(w, host)
  if (prn) return { site: 'printer', host, printerId: prn.id }
  const site = HOST_SITES[host]
  if (site) return { site, host }
  return { site: 'generic', host }
}

/** Manipulierte Namensauflösung: Welcher Host gehört eigentlich zu dieser IP? */
export function reverseHost(w: World, ip: string): string | undefined {
  const ext = Object.entries(INTERNET_HOSTS).find(([, v]) => v === ip)
  if (ext) return ext[0]
  const srv = w.infra.servers.find((s) => s.ip === ip)
  if (srv) return srv.name === 'APP01' ? 'intranet.musterwerk.local' : `${srv.name.toLowerCase()}.musterwerk.local`
  const prn = w.infra.printers.find((p) => p.ip === ip)
  if (prn) return prn.ip
  return undefined
}

/** Einteilige Namen, die in der Adressleiste als Adresse (nicht als Suchbegriff) gelten */
export function shortNames(w: World): Set<string> {
  const set = new Set<string>(['localhost', 'intranet', 'erp', 'kb', 'status'])
  const zone = w.infra.dnsZones.find((z) => z.name === 'musterwerk.local')
  for (const r of zone?.records ?? []) if ((r.type === 'A' || r.type === 'CNAME') && /^[a-z0-9-]+$/i.test(r.name)) set.add(r.name.toLowerCase())
  for (const p of w.infra.printers) set.add(p.hostname.toLowerCase())
  return set
}

export interface Bookmark {
  label: string
  url: string
  site: SiteId
}

export const BOOKMARKS: Bookmark[] = [
  { label: 'Intranet', url: 'http://intranet.musterwerk.local/', site: 'intranet' },
  { label: 'Cloud Admin Center', url: 'https://admin.cloudadmin.example/', site: 'cloudadmin' },
  { label: 'Kennwort-Portal', url: 'https://konto.musterwerk.example/', site: 'konto' },
  { label: 'Status', url: 'http://status.musterwerk.local/', site: 'status' },
  { label: 'Wissensdatenbank', url: 'http://kb.musterwerk.local/', site: 'kb' },
  { label: 'Suche', url: 'https://www.suche.example/', site: 'search' },
  { label: 'Drucker 1. OG', url: 'http://10.10.50.21/', site: 'printer' },
]
