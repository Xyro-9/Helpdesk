// Gemeinsamer Start eines Trainingsszenarios inkl. Navigation passend zum Kanal.
// Wird von Training, Übersicht, Bewertungsbericht und Trainer-Modus genutzt.

import { getScenario } from '@/core/scenarios/engine'
import { useStore } from '@/core/store'
import type { Ticket } from '@/core/types'

export const isOpenTicket = (t: Ticket) => !t.historical && t.status !== 'Gelöst' && t.status !== 'Geschlossen'

/** Offenes Ticket zu einem Szenario (falls das Szenario gerade läuft) */
export const openTicketOfScenario = (tickets: Ticket[], scenarioId: string) => tickets.find((t) => t.scenarioId === scenarioId && isOpenTicket(t))

/**
 * Startet ein Szenario und wechselt in die passende Ansicht:
 * Telefon → bleibt (Anruf klingelt im Overlay), E-Mail → Posteingang, Chat → Chat, Portal/Vor Ort → Ticket.
 */
export function launchScenario(id: string): string | undefined {
  const st = useStore.getState()
  const sc = getScenario(id, st.customScenarios)
  if (!sc) {
    st.toast('Szenario wurde nicht gefunden.', 'error')
    return undefined
  }
  const ticketId = st.startScenario(id)
  if (!ticketId) {
    st.toast('Szenario konnte nicht gestartet werden.', 'error')
    return undefined
  }
  switch (sc.channel) {
    case 'Telefon':
      break
    case 'E-Mail':
      st.navigate('mail')
      break
    case 'Chat':
      st.navigate('chat')
      break
    default:
      st.navigate('tickets', { id: ticketId })
  }
  return ticketId
}
