# Architektur Helpdesk-Trainer

Vite + React 19 + TypeScript (strict) + Tailwind v4 + zustand 5 (mit immer) + lucide-react. Keine weiteren Abhängigkeiten.
Oberfläche komplett **deutsch**. Alle Namen, Firmen, Domains sind **fiktiv** (Musterwerk AG, `*.example`, `musterwerk.local`).
Keine echten Marken/Logos nachbauen (Windows-ähnliche Optik ist ok, aber eigene Gestaltung).

## Verzeichnisse

| Pfad | Inhalt |
|---|---|
| `src/core/types.ts` | **Datenmodell** der gesamten Welt (`World`) – zuerst lesen! |
| `src/core/store.ts` | zustand-Store: `world`, `settings`, `results`, `ui`, Aktionen (`updateWorld`, `navigate`, `openRdp`, `claimTicket`, `resolveTicket` …) |
| `src/core/actions.ts` | Konstanten `A.*` für das Aktionsprotokoll (Bewertung!) |
| `src/core/ops/ad.ts` | AD-Operationen: `findUser`, `unlockUser`, `resetPassword`, `addGroupMember`, `createUser`, `effectiveGroupsOf` … |
| `src/core/ops/cloud.ts` | Cloud-Mandant: `syncCloud`, `assignLicense`, `resetMfa`, `revokeSessions`, `grantMailboxRight` … |
| `src/core/ops/endpoint.ts` | Windows-Clients: `ensureEndpoint`, Dienste, Prozesse, Dateisystem, Registry, Drucker, Netzlaufwerke, GPO, VPN, Neustart |
| `src/core/sim/network.ts` | Netzwerk: `primaryConfig`, `renewDhcp`, `resolveName`, `reach`, `httpRequest`, `connectivity` |
| `src/core/scenarios/` | Szenario-Typen, Engine (Ticket erzeugen, Bewertung), regelbasierter Anrufer (`callerReply`) |
| `src/content/scenarios/` | Trainingsszenarien (Registry in `index.ts`) |
| `src/content/kb/` | Wissensdatenbank-Artikel |
| `src/content/faults.ts` | Fehlerbausteine für den Szenario-Editor im Trainer-Modus |
| `src/ui/index.tsx` | gemeinsame UI-Bausteine (`Button`, `Input`, `Select`, `Badge`, `Card`, `Modal`, `Tabs`, `PageHeader`, `Markdown`, `tableCls` …) |
| `src/modules/<modul>/` | Oberflächenmodule (jeweils `index.tsx` mit den exportierten Views) |

## Regeln für Module

1. **Weltzustand nur über `updateWorld` ändern**:
   ```ts
   const updateWorld = useStore((s) => s.updateWorld)
   updateWorld((w) => { unlockUser(w, sam) }, { type: A.adUnlock, target: sam })
   ```
   Das zweite Argument schreibt ins Aktionsprotokoll (mit aktuellem Ticket). **Bewertungsrelevante Aktionen immer loggen.**
   Fehlermeldungen der ops-Funktionen (`string | null`) dem Benutzer anzeigen (`toast(msg, 'error')`).
2. **Store-Selektoren dürfen keine neuen Arrays/Objekte zurückgeben** (React 19 + zustand 5 → Endlosschleife).
   Entweder stabile Referenz selektieren (`useStore(s => s.world.tickets)`) und mit `useMemo` filtern, oder `useShallow` aus `zustand/react/shallow` verwenden.
3. Store-Daten sind **eingefroren** (immer). Nie direkt mutieren, nie `arr.sort()` auf Store-Arrays → `[...arr].sort()`.
4. Lesefunktionen (`resolveName`, `httpRequest`, `connectivity`, `technicalStatus` …) dürfen im Render benutzt werden.
   Funktionen, die schreiben (`ensureEndpoint`, `renewDhcp`, `startService` …) nur innerhalb von `updateWorld`.
5. Endpunkte werden lazy erzeugt: vor Zugriff `getEndpoint(w, host)` prüfen; falls `undefined`, in einem `useEffect` `updateWorld(w => { ensureEndpoint(w, host) })` aufrufen.
6. Der Arbeitsplatz des Azubis ist der Endpunkt **`IT-ADM-01`** (Benutzer `azubi`, Gruppe `GG_IT_Helpdesk`).
7. Navigation: `useStore(s => s.navigate)('ad', { sam: 'l.schulz' })`, Remote-Desktop: `openRdp(hostname)`, Browser: `openBrowser(url)`.
8. Keine neuen npm-Pakete, keine Änderungen an `src/core/**` ohne Abstimmung. Eigene Hilfsfunktionen im eigenen Modulordner.
9. Typprüfung: `npx tsc -p tsconfig.app.json --noEmit`. Tests: `npx vitest run`.

## Bewertung (siehe `scenarios/engine.ts → evaluateTicket`)

- **Technik (50 %)**: Szenario-Checks prüfen den Weltzustand (egal, ob per GUI, Terminal oder Browser gelöst).
- **Dokumentation (20 %)**: Schlüsselwörter in Arbeitsnotizen + Lösungsbeschreibung.
- **Kommunikation (15 %)**: Benutzer informiert, Lösung bestätigen lassen (`A.confirmAsked`), Identitätsprüfung (`A.identityAsked`) bzw. Einverständnis für Fernzugriff (`A.remoteConsent`).
- **Prozess (15 %)**: Ticket übernommen, Kategorie, Priorität, SLA, Abschlusscode.
- **Abzüge**: Szenario-Strafen, Kennwort im Ticket, vertrauliche Daten per Mail/Chat, Tipps.

## Wichtige Aktionstypen

`A.adUnlock`, `A.adPasswordReset`, `A.adGroupAdd/Remove`, `A.adBitlockerViewed`, `A.cloudMfaReset`, `A.cloudLicenseAssigned`,
`A.rdpConnected`, `A.command` (Terminal, `detail` = Befehlszeile), `A.serviceChanged`, `A.networkChanged`, `A.registryChanged`,
`A.mailSent`, `A.chatSent`, `A.callAccepted`, `A.identityAsked`, `A.confirmAsked`, `A.remoteConsent`, `A.secretShared` (detail = Kanal).
