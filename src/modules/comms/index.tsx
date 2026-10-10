// Kommunikationsmodul: E-Mail, Chat, Telefon (+ CallOverlay in ./overlay)
// Exportiert zusätzlich Funktionen für andere Module (z. B. Ticket-Modul: Anrufen, Mail an Benutzer).

export { ChatView } from './chat'
export { MailView } from './mail'
export { PhoneView } from './phone'
export { fileSentMail, sendMail, startChat, startOutgoingCall, type OutgoingMail } from './logic'
