# Helpdesk-Trainer

IT-Helpdesk-Trainingssimulator für Auszubildende (Fachinformatiker/-innen). Läuft komplett im Browser,
ohne Server und ohne echte Firmendaten: Alle Personen, Systeme und Adressen der **fiktiven Musterwerk AG** sind erfunden.

## Funktionen

- **Ticket-Queue** mit Triage (Kategorie, Auswirkung × Dringlichkeit → Priorität, SLA), Arbeitsnotizen, Kommentaren, Eskalation und Abschluss
- **Kommunikation**: eingehende Anrufe (simulierte Anrufer, optional Sprachausgabe/-eingabe und KI-Anrufer), E-Mail, Chat
- **Active Directory**: Benutzer, Gruppen, Computer, OUs, Konten entsperren, Kennwörter, BitLocker-/LAPS-Schlüssel
- **Remote-Desktop** auf simulierte Windows-11-Clients mit Terminal (cmd/PowerShell), Dienste, Ereignisanzeige, Registry, Datenträgerverwaltung, Geräte-Manager, Task-Manager, Netzwerkeinstellungen, Drucker, Explorer, Editor
- **Webbrowser** mit Intranet, Cloud Admin Center (Lizenzen, MFA, Postfächer, Anmeldeprotokolle), Drucker-Weboberflächen, Kennwort-Portal
- **Infrastruktur**: Server, DHCP, DNS, Dateifreigaben, Druckserver, Cloud-Sync, DC-Sicherheitsprotokoll
- **Inventar & Versand**, **Wissensdatenbank**
- **Trainingsszenarien** mit automatischer Bewertung (Technik, Dokumentation, Kommunikation, Prozess), Tipps und Musterlösung
- **Trainer-Modus**: eigene Szenarien zusammenstellen, Ergebnisse auswerten, Export/Import

## Starten

Voraussetzung: [Node.js](https://nodejs.org) 20 oder neuer.

```bash
npm install
npm run dev
```

Dann im Browser **http://localhost:5173** öffnen. Andere Rechner im Netz erreichen die App über `http://<IP-dieses-PCs>:5173`.

Statischer Build (z. B. für einen internen Webserver): `npm run build` → Inhalt von `dist/` bereitstellen.

### GitHub Pages (ohne Installation)

1. In GitHub unter **Settings → Pages** als Quelle **GitHub Actions** wählen.
2. Nach dem Merge auf `main` baut der Workflow die Seite automatisch: `https://<benutzer>.github.io/<repo>/`.

## Entwicklung

```bash
npm run typecheck   # TypeScript prüfen
npm test            # Simulationstests (Vitest)
npm run build       # Produktions-Build
```

Der Spielstand wird im Browser (IndexedDB) gespeichert. Zurücksetzen und Export/Import im Trainer-Modus.
