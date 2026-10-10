// Hilfsfunktionen & Konstanten für das Ticket-Modul

import { Globe, Mail, MapPin, MessageSquare, Phone } from 'lucide-react'
import { useEffect, useState } from 'react'
import { A } from '@/core/actions'
import { findTicket } from '@/core/scenarios/engine'
import { useStore } from '@/core/store'
import type { AssignmentGroup, Channel, Priority, ResolutionCode, Ticket, TicketKind, TicketStatus } from '@/core/types'
import { nowIso } from '@/core/util'
import type { Tone } from '@/ui'

export const KINDS: TicketKind[] = ['Störung', 'Serviceanfrage', 'Änderung']
export const CHANNELS: Channel[] = ['Telefon', 'E-Mail', 'Chat', 'Portal', 'Vor Ort']
export const GROUPS: AssignmentGroup[] = ['1st Level Support', '2nd Level Support', 'Netzwerk & Infrastruktur', 'Vor-Ort-Service', 'Informationssicherheit']
export const WORK_STATUSES: TicketStatus[] = ['Neu', 'In Bearbeitung', 'Wartet auf Benutzer', 'Wartet auf Dritte']
export const RESOLUTION_CODES: ResolutionCode[] = ['Gelöst (dauerhaft)', 'Gelöst (Workaround)', 'Anfrage erfüllt', 'Weitergeleitet / eskaliert', 'Kein Fehler feststellbar', 'Duplikat', 'Vom Benutzer zurückgezogen']

export const PRIORITY_TONE: Record<Priority, Tone> = { 'P1 – Kritisch': 'red', 'P2 – Hoch': 'amber', 'P3 – Mittel': 'sky', 'P4 – Niedrig': 'gray' }
export const STATUS_TONE: Record<TicketStatus, Tone> = { Neu: 'blue', 'In Bearbeitung': 'sky', 'Wartet auf Benutzer': 'amber', 'Wartet auf Dritte': 'violet', Gelöst: 'green', Geschlossen: 'gray' }

export const IMPACT_LABEL: Record<1 | 2 | 3, string> = { 1: '1 – Hoch (viele/Firma)', 2: '2 – Mittel (Gruppe/Abteilung)', 3: '3 – Niedrig (Einzelperson)' }
export const URGENCY_LABEL: Record<1 | 2 | 3, string> = { 1: '1 – Hoch (Arbeit unmöglich)', 2: '2 – Mittel (eingeschränkt)', 3: '3 – Niedrig (kann warten)' }

export const isOpen = (t: Ticket) => t.status !== 'Gelöst' && t.status !== 'Geschlossen'
export const isPendingCall = (t: Ticket) => t.tags.includes('anruf-ausstehend')

export function ChannelIcon({ channel, size = 14, className }: { channel: Channel; size?: number; className?: string }) {
  const props = { size, className, 'aria-label': channel }
  switch (channel) {
    case 'Telefon':
      return <Phone {...props} />
    case 'E-Mail':
      return <Mail {...props} />
    case 'Chat':
      return <MessageSquare {...props} />
    case 'Portal':
      return <Globe {...props} />
    default:
      return <MapPin {...props} />
  }
}

/** Re-Render im Intervall (für SLA-Countdowns) */
export function useNow(intervalMs = 10_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

function fmtSpan(ms: number) {
  const min = Math.floor(ms / 60_000)
  if (min < 1) return '< 1 Min.'
  if (min < 60) return `${min} Min.`
  const h = Math.floor(min / 60)
  if (h < 48) return `${h} Std. ${min % 60} Min.`
  return `${Math.floor(h / 24)} Tg.`
}

/** SLA-Anzeige: Countdown für Reaktion bzw. Lösung, farbcodiert */
export function slaInfo(t: Ticket, now: number): { label: string; tone: Tone; title: string } {
  if (!isOpen(t) || t.historical) {
    if (!t.resolvedAt) return { label: '–', tone: 'gray', title: '' }
    const ok = t.resolvedAt <= t.slaResolveDue
    return { label: ok ? 'SLA eingehalten' : 'SLA verletzt', tone: ok ? 'green' : 'red', title: 'Lösungszeit im Vergleich zur SLA' }
  }
  const responded = !!t.firstResponseAt
  const phase = responded ? 'Lösung' : 'Reaktion'
  const due = new Date(responded ? t.slaResolveDue : t.slaResponseDue).getTime()
  const total = Math.max(1, due - new Date(t.createdAt).getTime())
  const left = due - now
  const title = `${phase} fällig: ${new Date(due).toLocaleString('de-DE')}`
  if (left <= 0) return { label: `${phase} überfällig (${fmtSpan(-left)})`, tone: 'red', title }
  return { label: `${phase} in ${fmtSpan(left)}`, tone: left / total < 0.33 ? 'amber' : 'green', title }
}

const PRIO_ORDER: Record<Priority, number> = { 'P1 – Kritisch': 1, 'P2 – Hoch': 2, 'P3 – Mittel': 3, 'P4 – Niedrig': 4 }
export const byPriorityThenDue = (a: Ticket, b: Ticket) => PRIO_ORDER[a.priority] - PRIO_ORDER[b.priority] || a.slaResolveDue.localeCompare(b.slaResolveDue)

/** Ticket ändern (setzt updatedAt) und optional protokollieren */
export function useTicketUpdate(id: string) {
  const updateWorld = useStore((s) => s.updateWorld)
  return (fn: (t: Ticket) => void, log?: { type: string; detail?: string; target?: string }) =>
    updateWorld(
      (w) => {
        const t = findTicket(w, id)
        if (!t) return
        fn(t)
        t.updatedAt = nowIso()
      },
      log ? { ...log, ticketId: id } : undefined,
    )
}

/** Beschriftungen für die Ticket-Historie */
export const ACTION_LABEL: Record<string, string> = {
  [A.ticketCreated]: 'Ticket erstellt',
  [A.ticketClaimed]: 'Ticket übernommen',
  [A.ticketUpdated]: 'Ticket geändert',
  [A.ticketStatus]: 'Status geändert',
  [A.ticketWorkNote]: 'Arbeitsnotiz',
  [A.ticketComment]: 'Antwort an Benutzer',
  [A.ticketEscalated]: 'Eskaliert',
  [A.ticketResolved]: 'Gelöst',
  [A.hintUsed]: 'Tipp genutzt',
  [A.identityAsked]: 'Identität erfragt',
  [A.identityConfirmed]: 'Identitätsdaten genannt',
  [A.confirmAsked]: 'Lösung bestätigen lassen',
  [A.userConfirmedFix]: 'Benutzer bestätigt Lösung',
  [A.mailSent]: 'E-Mail gesendet',
  [A.chatSent]: 'Chatnachricht gesendet',
  [A.callAccepted]: 'Anruf angenommen',
  [A.callEnded]: 'Anruf beendet',
  [A.callOutgoing]: 'Ausgehender Anruf',
  [A.secretShared]: 'Vertrauliche Daten übermittelt',
  [A.remoteConsent]: 'Einverständnis Fernzugriff',
  [A.userInformed]: 'Benutzer informiert',
  [A.kbLinked]: 'KB-Artikel verknüpft',
  [A.kbViewed]: 'KB-Artikel gelesen',
  [A.rdpConnected]: 'Remote-Desktop verbunden',
  [A.rdpDisconnected]: 'Remote-Desktop getrennt',
  [A.command]: 'Befehl ausgeführt',
  [A.adUnlock]: 'AD: Konto entsperrt',
  [A.adPasswordReset]: 'AD: Kennwort zurückgesetzt',
  [A.adUserUpdated]: 'AD: Benutzer geändert',
  [A.adUserEnabled]: 'AD: Konto aktiviert',
  [A.adUserDisabled]: 'AD: Konto deaktiviert',
  [A.adGroupAdd]: 'AD: Gruppenmitglied hinzugefügt',
  [A.adGroupRemove]: 'AD: Gruppenmitglied entfernt',
  [A.adBitlockerViewed]: 'AD: BitLocker-Schlüssel angezeigt',
  [A.adLapsViewed]: 'AD: LAPS-Kennwort angezeigt',
  [A.cloudMfaReset]: 'Cloud: MFA zurückgesetzt',
  [A.cloudLicenseAssigned]: 'Cloud: Lizenz zugewiesen',
  [A.cloudPasswordReset]: 'Cloud: Kennwort zurückgesetzt',
  [A.cloudSessionsRevoked]: 'Cloud: Sitzungen widerrufen',
  [A.serviceChanged]: 'Client: Dienst geändert',
  [A.networkChanged]: 'Client: Netzwerk geändert',
  [A.printerChanged]: 'Client: Drucker geändert',
  [A.registryChanged]: 'Client: Registry geändert',
  [A.reboot]: 'Client: Neustart',
  [A.gpupdate]: 'Client: Gruppenrichtlinien aktualisiert',
  [A.shipmentCreated]: 'Versand angelegt',
  [A.assetAssigned]: 'Gerät zugewiesen',
  'comm.callDeclined': 'Anruf abgelehnt',
  'mail.reportedPhishing': 'Als Phishing gemeldet',
}
