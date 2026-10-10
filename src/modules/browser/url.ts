// URL-Hilfen: Eingaben der Adressleiste normalisieren, anzeigen, relative Links auflösen.

import { INTERNET_HOSTS } from '@/core/sim/network'
import { isValidIp } from '@/core/util'

export const HOME_URL = 'http://intranet.musterwerk.local/'
export const NEWTAB_URL = 'about:newtab'
export const SEARCH_HOME = 'https://www.suche.example/'
export const CLOUD_ADMIN_URL = 'https://admin.cloudadmin.example/'
export const CLOUD_LOGIN_URL = 'https://login.cloudadmin.example/'

export const searchUrl = (q: string) => `${SEARCH_HOME}?q=${encodeURIComponent(q.trim())}`

/** Bekannte Top-Level-Domains – alles andere mit Punkt wird als Suchbegriff behandelt */
const TLDS = new Set(['local', 'example', 'de', 'com', 'net', 'org', 'eu', 'info', 'io', 'test', 'lan', 'intern', 'at', 'ch', 'invalid', 'localhost'])

export function parseUrl(s: string): URL | null {
  try {
    return new URL(s)
  } catch {
    return null
  }
}

/** Fiktive Internetseiten sind nur per HTTPS erreichbar (HSTS) */
export function upgradeScheme(u: URL): URL {
  if (u.protocol === 'http:' && INTERNET_HOSTS[u.hostname]) {
    const c = new URL(u.href)
    c.protocol = 'https:'
    return c
  }
  return u
}

/**
 * Wandelt eine Eingabe der Adressleiste in eine URL um.
 * - ohne Schema → http://
 * - Suchbegriffe (Leerzeichen, kein Punkt, unbekannte Endung) → Suchmaschine
 * - einteilige interne Namen (intranet, erp, kb …) werden als Adresse erkannt
 */
export function normalizeInput(raw: string, shortNames: Set<string>): string {
  const s = raw.trim()
  if (!s) return ''
  if (/^about:/i.test(s)) return s.toLowerCase()
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
    const u = parseUrl(s)
    if (!u) return searchUrl(s)
    return /^https?:$/.test(u.protocol) ? upgradeScheme(u).href : u.href
  }
  if (/\s/.test(s)) return searchUrl(s)
  const hostPart = s.split(/[/?#]/)[0]
  const host = hostPart.replace(/:\d+$/, '').toLowerCase()
  const hasPath = s.length > hostPart.length
  const tld = host.includes('.') ? host.split('.').pop()! : ''
  const looksLikeHost =
    isValidIp(host) || host === 'localhost' || shortNames.has(host) || (!!tld && TLDS.has(tld)) || (hasPath && /^[a-z0-9-]+$/.test(host))
  if (!looksLikeHost) return searchUrl(s)
  const u = parseUrl('http://' + s)
  return u ? upgradeScheme(u).href : searchUrl(s)
}

export const hostOf = (url: string) => parseUrl(url)?.hostname ?? ''

/** Anzeige in der Adressleiste (dekodiert, ohne "/" am Ende der Startseite) */
export function displayUrl(href: string): string {
  if (href.startsWith('about:')) return ''
  const u = parseUrl(href)
  if (!u) return href
  let path = u.pathname === '/' && !u.search && !u.hash ? '' : u.pathname
  let search = u.search
  try {
    path = decodeURI(path)
    search = decodeURIComponent(search.replace(/\+/g, ' '))
  } catch {
    /* Anzeige wie geliefert */
  }
  return `${u.protocol}//${u.host}${path}${search}${u.hash}`
}

/** Relativen Link gegen die aktuelle URL auflösen */
export function resolveHref(base: string, href: string): string {
  if (/^about:/i.test(href)) return href
  try {
    const u = new URL(href, base)
    return /^https?:$/.test(u.protocol) ? upgradeScheme(u).href : u.href
  } catch {
    return href
  }
}

export const isHttps = (href: string) => href.startsWith('https:')
