// Bekannte Aktionstypen für das Aktionsprotokoll (world.actionLog).
// Szenarien bewerten primär den Weltzustand; das Protokoll dient für Prozess-Punkte
// (z.B. Identitätsprüfung VOR dem Kennwort-Reset) und für die Trainer-Auswertung.
// Module dürfen eigene Typen ergänzen – dann bitte hier eintragen.

export const A = {
  // Tickets
  ticketCreated: 'ticket.created',
  ticketClaimed: 'ticket.claimed',
  ticketUpdated: 'ticket.updated',
  ticketStatus: 'ticket.status',
  ticketWorkNote: 'ticket.worknote',
  ticketComment: 'ticket.comment',
  ticketEscalated: 'ticket.escalated',
  ticketResolved: 'ticket.resolved',
  hintUsed: 'ticket.hint',
  // Kommunikation
  identityAsked: 'comm.identityAsked', // Azubi hat nach Personalnummer/Geburtsdatum gefragt
  identityConfirmed: 'comm.identityConfirmed', // Benutzer hat Daten genannt
  confirmAsked: 'comm.confirmAsked', // "Funktioniert es jetzt?"
  userConfirmedFix: 'comm.userConfirmedFix',
  mailSent: 'comm.mailSent',
  chatSent: 'comm.chatSent',
  callAccepted: 'comm.callAccepted',
  callEnded: 'comm.callEnded',
  callOutgoing: 'comm.callOutgoing',
  secretShared: 'comm.secretShared', // z.B. Kennwort/BitLocker-Key übermittelt (detail = Kanal)
  remoteConsent: 'comm.remoteConsent', // Einverständnis für Fernzugriff eingeholt
  userInformed: 'comm.userInformed', // Benutzer über Lösung/Status informiert
  // Active Directory
  adUnlock: 'ad.unlock',
  adPasswordReset: 'ad.passwordReset',
  adUserCreated: 'ad.userCreated',
  adUserUpdated: 'ad.userUpdated',
  adUserEnabled: 'ad.userEnabled',
  adUserDisabled: 'ad.userDisabled',
  adUserMoved: 'ad.userMoved',
  adUserDeleted: 'ad.userDeleted',
  adGroupAdd: 'ad.groupAdd',
  adGroupRemove: 'ad.groupRemove',
  adGroupCreated: 'ad.groupCreated',
  adComputerReset: 'ad.computerReset',
  adComputerUpdated: 'ad.computerUpdated',
  adBitlockerViewed: 'ad.bitlockerViewed',
  adLapsViewed: 'ad.lapsViewed',
  // Cloud
  cloudLicenseAssigned: 'cloud.licenseAssigned',
  cloudLicenseRemoved: 'cloud.licenseRemoved',
  cloudMfaReset: 'cloud.mfaReset',
  cloudSignInBlocked: 'cloud.signInBlocked',
  cloudSignInUnblocked: 'cloud.signInUnblocked',
  cloudSessionsRevoked: 'cloud.sessionsRevoked',
  cloudMailboxPermission: 'cloud.mailboxPermission',
  cloudMailboxUpdated: 'cloud.mailboxUpdated',
  cloudPasswordReset: 'cloud.passwordReset',
  cloudSync: 'cloud.sync',
  cloudSenderBlocked: 'cloud.senderBlocked',
  cloudQuarantine: 'cloud.quarantine',
  // Endpunkte
  rdpConnected: 'rdp.connected',
  rdpDisconnected: 'rdp.disconnected',
  command: 'endpoint.command',
  serviceChanged: 'endpoint.service',
  processKilled: 'endpoint.processKilled',
  networkChanged: 'endpoint.network',
  printerChanged: 'endpoint.printer',
  registryChanged: 'endpoint.registry',
  fileChanged: 'endpoint.file',
  diskChanged: 'endpoint.disk',
  deviceChanged: 'endpoint.device',
  reboot: 'endpoint.reboot',
  gpupdate: 'endpoint.gpupdate',
  // Infrastruktur
  dhcpChanged: 'infra.dhcp',
  dnsChanged: 'infra.dns',
  shareChanged: 'infra.share',
  printQueueChanged: 'infra.printQueue',
  printerDeviceChanged: 'infra.printerDevice',
  serverServiceChanged: 'infra.serverService',
  // Assets & Versand
  assetAssigned: 'asset.assigned',
  assetUpdated: 'asset.updated',
  shipmentCreated: 'shipment.created',
  shipmentUpdated: 'shipment.updated',
  // Wissen
  kbViewed: 'kb.viewed',
  kbCreated: 'kb.created',
  kbLinked: 'kb.linked',
  browserVisit: 'browser.visit',
} as const

export type ActionType = (typeof A)[keyof typeof A]
