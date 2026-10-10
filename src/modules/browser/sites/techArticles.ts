// Fiktive Fachartikel und Forenbeiträge (docs.techwissen.example, forum.adminhilfe.example).
// Eigene, kurze Inhalte – für die Suchmaschine und als Nachschlagewerk.

export interface TechPost {
  author: string
  accepted?: boolean
  body: string
}

export interface TechArticle {
  host: 'docs.techwissen.example' | 'forum.adminhilfe.example'
  path: string
  title: string
  snippet: string
  tags: string[]
  /** Markdown (Doku) bzw. Beiträge (Forum) */
  body?: string
  posts?: TechPost[]
}

export const TECH_ARTICLES: TechArticle[] = [
  {
    host: 'docs.techwissen.example',
    path: '/netzwerk/dns-grundlagen',
    title: 'DNS-Grundlagen: Wie Namen zu IP-Adressen werden',
    snippet: 'Auflösungsreihenfolge unter Windows, typische Fehlerbilder und die wichtigsten Befehle nslookup und ipconfig /flushdns.',
    tags: ['dns', 'nslookup', 'namensauflösung', 'flushdns', 'hosts', 'nxdomain'],
    body: `# DNS-Grundlagen

Das Domain Name System übersetzt Namen wie \`intranet.firma.local\` in IP-Adressen.

## Reihenfolge unter Windows
1. **hosts-Datei** (\`C:\\Windows\\System32\\drivers\\etc\\hosts\`) – hat Vorrang vor allem anderen!
2. **DNS-Client-Cache** (\`ipconfig /displaydns\`)
3. **DNS-Server** aus der IP-Konfiguration (\`ipconfig /all\`)

## Typische Fehler
- Falscher DNS-Server eingetragen (z. B. öffentlicher DNS statt Domänencontroller) → interne Namen werden nicht gefunden.
- Veralteter Cache-Eintrag → \`ipconfig /flushdns\`
- Manipulierte hosts-Datei → Name zeigt auf eine falsche IP, der Browser meldet ggf. ein ungültiges Zertifikat.

## Befehle
\`\`\`
nslookup intranet.firma.local
ipconfig /all
ipconfig /flushdns
\`\`\`

> In Active-Directory-Umgebungen müssen Clients immer die internen DNS-Server (Domänencontroller) verwenden.`,
  },
  {
    host: 'forum.adminhilfe.example',
    path: '/thread/apipa-169-254',
    title: 'APIPA-Adresse 169.254.x.x – was bedeutet das?',
    snippet: 'Mein PC hat plötzlich die IP 169.254.12.7 und kein Netzwerk mehr. Woran liegt das?',
    tags: ['apipa', '169.254', 'dhcp', 'ipconfig', 'renew', 'keine ip'],
    posts: [
      { author: 'neuling_42', body: 'Hallo zusammen, ein Rechner bei uns hat seit heute früh die Adresse 169.254.12.7 und erreicht nichts mehr. Kabel steckt. Was ist da los?' },
      {
        author: 'netzwerkfuchs',
        accepted: true,
        body: `Das ist eine **APIPA-Adresse** (Automatic Private IP Addressing). Windows vergibt sie sich selbst, wenn **kein DHCP-Server antwortet**.

Prüfe der Reihe nach:
1. Läuft der DHCP-Server (Dienst) und ist der Bereich aktiv?
2. Hat der Bereich noch freie Adressen?
3. Läuft auf dem Client der Dienst „DHCP-Client“?
4. Stimmt das VLAN / der Switchport?

Danach: \`ipconfig /release\` und \`ipconfig /renew\`.`,
      },
      { author: 'neuling_42', body: 'Danke! Der Bereich war deaktiviert. Nach dem Aktivieren und ipconfig /renew läuft alles wieder.' },
    ],
  },
  {
    host: 'forum.adminhilfe.example',
    path: '/thread/druckwarteschlange-haengt',
    title: 'Druckwarteschlange hängt – Auftrag lässt sich nicht löschen',
    snippet: 'Ein Druckauftrag steht auf „Fehler“ und blockiert alle weiteren Ausdrucke. Löschen geht nicht.',
    tags: ['drucker', 'spooler', 'warteschlange', 'druckauftrag', 'druckserver'],
    posts: [
      { author: 'buero_heldin', body: 'Bei uns hängt ein PDF in der Warteschlange und nichts geht mehr raus. „Abbrechen“ bewirkt nichts.' },
      {
        author: 'printmaster',
        accepted: true,
        body: `Klassiker. Vorgehen:
1. Prüfen, **wo** der Auftrag hängt: lokal oder auf dem Druckserver?
2. Auf dem betroffenen System den Dienst **Druckwarteschlange (Spooler)** beenden.
3. Ordner \`C:\\Windows\\System32\\spool\\PRINTERS\` leeren.
4. Dienst wieder starten, Testseite drucken.

Wenn das Gerät selbst „Papierstau“ oder „Toner leer“ meldet, hilft das alles nichts – dann muss jemand vor Ort ran.`,
      },
    ],
  },
  {
    host: 'docs.techwissen.example',
    path: '/windows/kerberos-zeitabweichung',
    title: 'Kerberos und Zeitabweichung: Warum 5 Minuten entscheiden',
    snippet: 'Weicht die Uhrzeit eines Clients mehr als 5 Minuten vom Domänencontroller ab, schlägt die Kerberos-Anmeldung fehl.',
    tags: ['kerberos', 'zeit', 'uhrzeit', 'w32tm', 'anmeldung', 'zeitabweichung'],
    body: `# Kerberos und Zeitabweichung

Kerberos-Tickets enthalten Zeitstempel. Standardmäßig darf die Uhrzeit von Client und Domänencontroller **höchstens 5 Minuten** voneinander abweichen.

## Symptome
- Anmeldung schlägt fehl, Netzlaufwerke nicht erreichbar
- Ereignisse mit „KRB_AP_ERR_SKEW“

## Lösung
\`\`\`
w32tm /query /status
w32tm /resync
\`\`\`
Domänenmitglieder synchronisieren ihre Zeit automatisch mit dem Domänencontroller – stimmt die Zeitzone?`,
  },
  {
    host: 'forum.adminhilfe.example',
    path: '/thread/vertrauensstellung-repariert',
    title: 'Vertrauensstellung zwischen Arbeitsstation und Domäne fehlgeschlagen – repariert!',
    snippet: '„Die Vertrauensstellung zwischen dieser Arbeitsstation und der primären Domäne konnte nicht hergestellt werden.“ So habe ich es gelöst.',
    tags: ['vertrauensstellung', 'secure channel', 'domäne', 'computerkonto', 'test-computersecurechannel'],
    posts: [
      { author: 'it_azubi_sven', body: 'Nach einem Image-Restore meldet ein Notebook beim Anmelden: Vertrauensstellung fehlgeschlagen. Neu in die Domäne aufnehmen?' },
      {
        author: 'admin_oldschool',
        accepted: true,
        body: `Nicht gleich neu aufnehmen. Das Computerkonto-Kennwort passt nicht mehr zum AD. Lokal als Administrator anmelden (z. B. mit LAPS-Kennwort) und in einer Admin-PowerShell:

\`\`\`
Test-ComputerSecureChannel -Repair -Credential MUSTERFIRMA\\admin
\`\`\`

Danach neu starten. Erst wenn das nicht hilft: aus der Domäne nehmen und wieder aufnehmen.`,
      },
    ],
  },
  {
    host: 'docs.techwissen.example',
    path: '/windows/proxy-einstellungen',
    title: 'Proxy-Einstellungen unter Windows prüfen',
    snippet: 'ERR_PROXY_CONNECTION_FAILED? So finden Sie heraus, welcher Proxy eingetragen ist und ob er stimmt.',
    tags: ['proxy', 'err_proxy_connection_failed', 'internetoptionen', 'registry', 'browser'],
    body: `# Proxy-Einstellungen prüfen

Meldet der Browser **ERR_PROXY_CONNECTION_FAILED**, versucht er, über einen Proxyserver zu gehen, der nicht erreichbar ist.

## Wo steht die Einstellung?
- Einstellungen → Netzwerk und Internet → Proxy
- Internetoptionen → Verbindungen → LAN-Einstellungen
- Registry: \`HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings\` → \`ProxyEnable\`, \`ProxyServer\`, \`ProxyOverride\`

## Prüfen
1. Soll überhaupt ein Proxy genutzt werden? (Firmenvorgabe)
2. Stimmen Servername und Port?
3. Ist der Proxy erreichbar?

> Schadsoftware trägt gern einen eigenen Proxy ein, um Datenverkehr umzuleiten.`,
  },
  {
    host: 'docs.techwissen.example',
    path: '/sicherheit/phishing-erkennen',
    title: 'Phishing erkennen: Die Adresszeile lügt nicht',
    snippet: 'Gefälschte Anmeldeseiten sehen echt aus – auch mit Schloss-Symbol. Worauf Sie achten sollten und was nach einer Eingabe zu tun ist.',
    tags: ['phishing', 'anmeldeseite', 'kennwort', 'sicherheit', 'mfa', 'sitzungen'],
    body: `# Phishing erkennen

- **Domain prüfen**: \`login.anbieter.example\` ist nicht \`anbieter-login.secure-verify.example\`.
- Das **Schloss** bedeutet nur „verschlüsselt“ – nicht „vertrauenswürdig“.
- Druck und Drohungen („Konto wird in 24 Stunden gesperrt“) sind typisch.

## Kennwort eingegeben – was tun?
1. Kennwort sofort zurücksetzen
2. **Alle Sitzungen widerrufen**
3. Anmeldeprotokolle auf fremde Anmeldungen prüfen
4. MFA-Methoden kontrollieren, verdächtige Posteingangsregeln/Weiterleitungen entfernen
5. Informationssicherheit informieren`,
  },
  {
    host: 'docs.techwissen.example',
    path: '/windows/netzwerk-befehle',
    title: 'ipconfig, ping, nslookup, tracert – die wichtigsten Netzwerkbefehle',
    snippet: 'Kurzreferenz für die Fehlersuche im Netzwerk von der IP-Konfiguration bis zur Routenverfolgung.',
    tags: ['ipconfig', 'ping', 'nslookup', 'tracert', 'gateway', 'netzwerk'],
    body: `# Netzwerkbefehle

- \`ipconfig /all\` – IP, Maske, Gateway, DNS-Server, DHCP
- \`ping <Ziel>\` – Erreichbarkeit
- \`tracert <Ziel>\` – Weg der Pakete
- \`nslookup <Name>\` – Namensauflösung testen

## Vorgehen von innen nach außen
1. Eigene IP gültig? (keine 169.254.x.x)
2. Gateway erreichbar?
3. DNS-Server erreichbar, Namen auflösbar?
4. Ziel erreichbar?`,
  },
  {
    host: 'forum.adminhilfe.example',
    path: '/thread/konto-sperrt-sich-immer-wieder',
    title: 'Konto sperrt sich immer wieder – woher kommen die Fehlversuche?',
    snippet: 'Kaum entsperrt, ist das Konto wieder gesperrt. Ursache finden mit Ereignis 4740.',
    tags: ['kontosperre', 'gesperrt', 'lockout', '4740', 'smartphone', 'kennwort'],
    posts: [
      { author: 'helpdesk_hanna', body: 'Eine Kollegin wird alle paar Minuten gesperrt, obwohl sie ihr neues Kennwort richtig eingibt.' },
      {
        author: 'netzwerkfuchs',
        accepted: true,
        body: `Im Sicherheitsprotokoll des Domänencontrollers nach **Ereignis 4740** suchen – dort steht der **Aufrufer-Computer** (Sperrquelle).
Häufige Ursachen: Smartphone mit altem Kennwort, gespeicherte Anmeldeinformationen, gemappte Laufwerke, alte RDP-Sitzung.`,
      },
    ],
  },
  {
    host: 'docs.techwissen.example',
    path: '/cloud/mfa-zuruecksetzen',
    title: 'MFA zurücksetzen: wann es nötig ist und worauf zu achten ist',
    snippet: 'Neues Smartphone, verlorenes Gerät: So setzen Administratoren Authentifizierungsmethoden sicher zurück.',
    tags: ['mfa', 'authenticator', 'smartphone', 'zurücksetzen', 'cloud', 'identität'],
    body: `# MFA zurücksetzen

**Nur nach sorgfältiger Identitätsprüfung!** Ein MFA-Reset ist ein beliebtes Ziel von Social Engineering.

1. Identität prüfen (z. B. Personalnummer + Geburtsdatum, Rückruf)
2. Im Admin-Portal: Authentifizierungsmethoden → „Registrierung erneut anfordern“
3. Benutzer richtet die App bei der nächsten Anmeldung neu ein
4. Bei Verlust des Geräts zusätzlich Sitzungen widerrufen`,
  },
]

export const findTechArticle = (host: string, path: string) => TECH_ARTICLES.find((a) => a.host === host && a.path === path)
