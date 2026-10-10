// Anmeldelogik der simulierten Webanwendungen (AD-Kennwortprüfung mit Sperrzähler, Cloud-Anmeldung, MFA).

import { dcEvent, findUser, isMemberOf, lockUser } from '@/core/ops/ad'
import { getEndpoint } from '@/core/ops/endpoint'
import { uplinkConfig } from '@/core/sim/network'
import type { AdUser, CloudUser, World } from '@/core/types'
import { hashString } from '@/core/util'

export type PwOutcome = 'ok' | 'unknown' | 'locked' | 'bad' | 'locked-now'

/**
 * Prüft ein AD-Kennwort wie ein Domänencontroller (innerhalb von updateWorld aufrufen!):
 * Fehlversuche erhöhen badPwdCount, bei Erreichen des Schwellwerts wird das Konto gesperrt (Quelle = Rechner).
 * Erfolgreiche Anmeldung setzt den Zähler zurück.
 */
export function attemptAdPassword(w: World, login: string, password: string, source: string): PwOutcome {
  const u = findUser(w, login)
  if (!u || u.isServiceAccount) return 'unknown'
  if (u.lockedOut) return 'locked'
  if (u.password !== password) {
    u.badPwdCount += 1
    const threshold = w.domain.lockoutThreshold
    if (threshold > 0 && u.badPwdCount >= threshold) {
      lockUser(w, u.sam, source, u.badPwdCount)
      return 'locked-now'
    }
    dcEvent(
      w,
      4625,
      `Fehler beim Anmelden eines Kontos.\n\nKontoname: ${u.sam}\nFehlerursache: Unbekannter Benutzername oder ungültiges Kennwort.\nArbeitsstationsname: ${source}\nFehlversuche: ${u.badPwdCount}`,
      'Überprüfung fehlgeschlagen',
      'Anmelden',
    )
    return 'bad'
  }
  u.badPwdCount = 0
  return 'ok'
}

/** Kennwort abgelaufen bzw. muss geändert werden? */
export function passwordExpired(w: World, u: AdUser) {
  if (u.passwordExpired || u.mustChangePassword) return true
  if (u.passwordNeverExpires) return false
  const ageDays = (Date.now() - new Date(u.pwdLastSet).getTime()) / 86400000
  return w.domain.maxPasswordAgeDays > 0 && ageDays > w.domain.maxPasswordAgeDays
}

export const accountExpired = (u: AdUser) => !!u.accountExpires && new Date(u.accountExpires).getTime() < Date.now()

/** Rolle im Cloud Admin Center (null = kein Administrator) */
export function adminRole(w: World, cu: CloudUser): string | null {
  if (!cu.sam) return null
  if (isMemberOf(w, cu.sam, 'Domänen-Admins')) return 'Globaler Administrator'
  if (isMemberOf(w, cu.sam, 'GG_IT_Helpdesk')) return 'Helpdesk-Administrator'
  if (isMemberOf(w, cu.sam, 'GG_IT')) return 'Benutzeradministrator'
  return null
}

/**
 * Kann eine MFA-Anforderung bestätigt werden? Der Azubi hat sein eigenes Smartphone immer dabei;
 * andere Benutzer nur, wenn sie selbst am Rechner sitzen (angemeldeter Benutzer des Endpunkts).
 */
export function mfaApprovable(w: World, endpoint: string, cu: CloudUser) {
  if (!cu.sam) return false
  if (cu.sam === w.tech.sam) return true
  return getEndpoint(w, endpoint)?.loggedOnUser === cu.sam
}

/** Öffentliche IP und Standort, mit denen der Rechner im Internet auftritt (für Anmeldeprotokolle) */
export function publicOrigin(w: World, endpoint: string): { ip: string; location: string } {
  const ep = getEndpoint(w, endpoint)
  const up = ep ? uplinkConfig(ep) : undefined
  if (up?.adapter.network === 'home') {
    const h = hashString(endpoint)
    const u = ep?.loggedOnUser ? findUser(w, ep.loggedOnUser) : undefined
    return { ip: `84.${100 + (h % 50)}.${(h >>> 8) % 250}.${(h >>> 16) % 250}`, location: `${u?.homeAddress?.city ?? 'Hamburg'}, DE` }
  }
  return { ip: '203.0.113.10', location: 'Hamburg, DE' }
}
