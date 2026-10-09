// Operationen im fiktiven Cloud-Mandanten (E-Mail, Lizenzen, MFA, Anmeldungen)

import type { CloudUser, World } from '../types'
import { nowIso, uid } from '../util'
import { mailboxFor } from '../seed/cloud'
import { findUser } from './ad'

export const findCloudUser = (w: World, q: string): CloudUser | undefined => {
  const s = q.trim().toLowerCase()
  return w.cloud.users.find((c) => c.upn.toLowerCase() === s || c.sam?.toLowerCase() === s || c.displayName.toLowerCase() === s)
}

export const skuUsage = (w: World, skuId: string) => w.cloud.users.filter((u) => u.licenses.includes(skuId)).length

export const skuAvailable = (w: World, skuId: string) => {
  const sku = w.cloud.skus.find((s) => s.id === skuId)
  return sku ? sku.total - skuUsage(w, skuId) : 0
}

/**
 * Hybrid-Synchronisierung AD → Cloud.
 * Neue AD-Benutzer erscheinen erst nach einem Sync in der Cloud (Standard: alle 30 Min. – manuell auslösbar).
 * Deaktivierte AD-Konten werden in der Cloud für die Anmeldung gesperrt.
 */
export function syncCloud(w: World): { created: string[]; updated: string[]; blocked: string[] } {
  const created: string[] = []
  const updated: string[] = []
  const blocked: string[] = []
  const syncSvc = w.infra.servers.find((s) => s.name === 'SYNC01')
  const running = syncSvc?.online && syncSvc.services.find((s) => s.name === 'CloudSync')?.status === 'Wird ausgeführt'
  if (!running || !w.infra.sync.enabled) {
    w.infra.sync.errors.unshift(`${new Date().toLocaleString('de-DE')}: Synchronisierung fehlgeschlagen – Dienst nicht erreichbar`)
    return { created, updated, blocked }
  }
  for (const u of w.users) {
    if (u.isServiceAccount || !u.mail) continue
    // nur OUs unterhalb "Musterwerk" werden synchronisiert
    if (!u.ou.includes('OU=Musterwerk')) continue
    let cu = w.cloud.users.find((c) => c.sam === u.sam)
    if (!cu) {
      cu = {
        upn: u.upn,
        displayName: u.displayName,
        sam: u.sam,
        synced: true,
        signInBlocked: !u.enabled,
        licenses: [],
        mfa: { enforced: true, methods: [], requireReRegister: true },
        mailbox: undefined,
        signIns: [],
        riskState: 'keines',
        lastPasswordChange: u.pwdLastSet,
        devices: [],
        usageLocation: 'DE',
      }
      w.cloud.users.push(cu)
      created.push(u.sam)
      continue
    }
    if (cu.displayName !== u.displayName || cu.upn !== u.upn) {
      cu.displayName = u.displayName
      cu.upn = u.upn
      updated.push(u.sam)
    }
    if (!u.enabled && !cu.signInBlocked) {
      cu.signInBlocked = true
      blocked.push(u.sam)
    }
    if (u.enabled && cu.signInBlocked && u.ou.includes('OU=Benutzer')) {
      cu.signInBlocked = false
      updated.push(u.sam)
    }
  }
  w.infra.sync.lastRun = nowIso()
  return { created, updated, blocked }
}

export function assignLicense(w: World, upn: string, skuId: string): string | null {
  const cu = findCloudUser(w, upn)
  if (!cu) return 'Benutzer nicht im Cloud-Verzeichnis gefunden (Synchronisierung abgewartet?).'
  if (cu.licenses.includes(skuId)) return 'Lizenz ist bereits zugewiesen.'
  if (skuAvailable(w, skuId) <= 0) return 'Keine freien Lizenzen verfügbar. Bitte Lizenz eines ausgeschiedenen Mitarbeiters freigeben oder Bestellung anstoßen.'
  cu.licenses.push(skuId)
  // Postfach wird mit E-Mail-Lizenz bereitgestellt
  if (!cu.mailbox) cu.mailbox = mailboxFor('Benutzer', 0.01)
  return null
}

export function removeLicense(w: World, upn: string, skuId: string): string | null {
  const cu = findCloudUser(w, upn)
  if (!cu) return 'Benutzer nicht gefunden.'
  cu.licenses = cu.licenses.filter((l) => l !== skuId)
  return null
}

export function resetMfa(w: World, upn: string): string | null {
  const cu = findCloudUser(w, upn)
  if (!cu) return 'Benutzer nicht gefunden.'
  cu.mfa.methods = []
  cu.mfa.requireReRegister = true
  return null
}

export function setSignInBlocked(w: World, upn: string, blocked: boolean): string | null {
  const cu = findCloudUser(w, upn)
  if (!cu) return 'Benutzer nicht gefunden.'
  cu.signInBlocked = blocked
  return null
}

export function revokeSessions(w: World, upn: string): string | null {
  const cu = findCloudUser(w, upn)
  if (!cu) return 'Benutzer nicht gefunden.'
  cu.sessionsRevokedAt = nowIso()
  return null
}

/** Cloud-Kennwort zurücksetzen – bei synchronisierten Benutzern wird das AD-Kennwort gesetzt (Kennwortrückschreiben) */
export function cloudResetPassword(w: World, upn: string, password: string): string | null {
  const cu = findCloudUser(w, upn)
  if (!cu) return 'Benutzer nicht gefunden.'
  if (cu.sam) {
    const u = findUser(w, cu.sam)
    if (u) {
      u.password = password
      u.pwdLastSet = nowIso()
      u.mustChangePassword = true
      u.passwordExpired = false
    }
  }
  cu.lastPasswordChange = nowIso()
  return null
}

export type MailboxRight = 'fullAccess' | 'sendAs' | 'sendOnBehalf'

export function grantMailboxRight(w: World, mailboxUpn: string, right: MailboxRight, granteeUpn: string): string | null {
  const mb = findCloudUser(w, mailboxUpn)
  if (!mb?.mailbox) return 'Postfach nicht gefunden.'
  const grantee = findCloudUser(w, granteeUpn)
  if (!grantee) return 'Empfänger der Berechtigung nicht gefunden.'
  const list = mb.mailbox[right]
  if (list.includes(grantee.upn)) return 'Berechtigung ist bereits vorhanden.'
  list.push(grantee.upn)
  return null
}

export function revokeMailboxRight(w: World, mailboxUpn: string, right: MailboxRight, granteeUpn: string): string | null {
  const mb = findCloudUser(w, mailboxUpn)
  if (!mb?.mailbox) return 'Postfach nicht gefunden.'
  mb.mailbox[right] = mb.mailbox[right].filter((u) => u.toLowerCase() !== granteeUpn.toLowerCase())
  return null
}

/** Benutzerpostfach in freigegebenes Postfach umwandeln (Offboarding) */
export function convertToShared(w: World, upn: string): string | null {
  const cu = findCloudUser(w, upn)
  if (!cu?.mailbox) return 'Postfach nicht gefunden.'
  cu.mailbox.type = 'Freigegeben'
  return null
}

export function addSignIn(w: World, upn: string, entry: Omit<CloudUser['signIns'][number], 'id'>) {
  const cu = findCloudUser(w, upn)
  if (!cu) return
  cu.signIns.unshift({ ...entry, id: uid('si') })
}
