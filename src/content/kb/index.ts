// Wissensdatenbank der Musterwerk AG (Service Desk).
// Inhalte in einfachem Markdown: #, ##, ###, -, 1., **fett**, `code`, > Hinweis, ```Codeblock```.
// Schreibhilfe: `md` ist ein Raw-Template – Backslashes bleiben erhalten (UNC-Pfade!),
// und das Zeichen ´ wird zu einem Backtick (Inline-Code bzw. ´´´ für Codeblöcke).

import type { KbArticle } from '@/core/types'

const md = (strings: TemplateStringsArray, ...values: unknown[]) => String.raw({ raw: strings.raw }, ...values).replace(/´/g, '`').trim()

type Seed = Omit<KbArticle, 'views' | 'helpful' | 'author' | 'updated'> & { author?: string; updated?: string }

const a = (s: Seed): KbArticle => ({ author: 'Marie Frank', updated: '2026-09-15T08:00:00.000Z', views: 0, helpful: 0, ...s })

export const KB_ARTICLES: KbArticle[] = [
  a({
    id: 'KB0001',
    title: 'Konto gesperrt – entsperren und Sperrquelle finden',
    category: 'Konto & Zugriff',
    tags: ['AD', 'Sperre', 'Lockout', '4740', 'Ereignisanzeige'],
    body: md`
# Konto gesperrt – entsperren und Sperrquelle finden

Nach **5 Fehlversuchen** sperrt die Domäne ein Konto für 30 Minuten (Richtlinie Musterwerk). Entsperren ist schnell erledigt – wichtig ist, die **Ursache** zu finden, sonst ist das Konto gleich wieder gesperrt.

## Vorgehen
1. Identität prüfen (siehe KB0002).
2. AD-Konsole → Benutzer suchen → Registerkarte **Konto**: Ist "Konto ist gesperrt" markiert? Wie hoch ist ´badPwdCount´?
3. **Konto entsperren** (oder PowerShell: ´Unlock-ADAccount -Identity l.schulz´).
4. Sperrquelle ermitteln: Infrastruktur → **DC01 → Sicherheitsprotokoll** → Ereignis **4740** ("Ein Benutzerkonto wurde gesperrt"). Das Feld **Aufrufername des Computers** nennt das Gerät, von dem die Fehlversuche kamen. Ereignis **4625** zeigt die einzelnen Fehlanmeldungen.
5. Ursache auf dem genannten Gerät beseitigen, dann ggf. erneut entsperren.

## Typische Sperrquellen
- Smartphone/Tablet mit altem Kennwort im Mail-Konto
- Netzlaufwerk mit **gespeicherten Anmeldedaten** (´net use´, Registry ´HKCU\Network\<Buchstabe>´ mit Wert ´UserName´)
- Noch angemeldete Sitzung auf einem anderen PC (Schulungsraum, Kollegen-PC)
- Geplante Aufgaben oder Dienste, die mit dem Benutzerkonto laufen
- Gespeicherte Kennwörter in der Anmeldeinformationsverwaltung

## Gespeicherte Laufwerksverbindung entfernen
´´´
net use
net use Z: /delete
´´´

> Hinweis: Kennt der Benutzer sein Kennwort, ist **kein Kennwort-Reset** nötig. Ein Reset beseitigt die Ursache nicht!

## Dokumentation
Symptom, Sperrquelle (Ereignis 4740 + Computername), Ursache, Maßnahme und ob das Konto nach einigen Minuten weiterhin entsperrt ist.
`,
  }),
  a({
    id: 'KB0002',
    title: 'Identitätsprüfung am Telefon',
    category: 'Sicherheit',
    tags: ['Identität', 'Telefon', 'Personalnummer', 'Social Engineering'],
    body: md`
# Identitätsprüfung am Telefon

Bevor wir **Kennwörter zurücksetzen, MFA-Methoden ändern, BitLocker- oder LAPS-Schlüssel herausgeben**, muss die Identität des Anrufers geprüft sein. Eine angezeigte Rufnummer ist **kein** Beweis – sie kann gefälscht werden.

## Pflichtfragen
1. **Personalnummer** (Feld "Personalnummer" im AD)
2. **Geburtsdatum** (Feld "Geburtsdatum" im AD)

Beide Angaben müssen **exakt** übereinstimmen. Ein "fast richtig" (Zahlendreher, falscher Monat) gilt als **nicht bestätigt**.

## Formulierungsbeispiel
> "Bevor ich an Ihrem Konto etwas ändere, muss ich kurz Ihre Identität prüfen. Nennen Sie mir bitte Ihre Personalnummer und Ihr Geburtsdatum."

## Wenn die Daten nicht stimmen
- Keine Änderung am Konto, keine Herausgabe von Daten.
- Freundlich bleiben: "Ich darf das leider nicht ohne bestätigte Identität."
- **Rückruf** anbieten – aber nur über eine bekannte Nummer (Durchwahl aus dem AD) oder über die Führungskraft/Assistenz.
- Verdacht auf Täuschung → Ticket an **Informationssicherheit** (siehe KB0024).

## Dokumentation
"Identität geprüft (Personalnummer + Geburtsdatum)" – die Daten selbst **nicht** ins Ticket schreiben.
`,
  }),
  a({
    id: 'KB0003',
    title: 'Kennwort zurücksetzen – Richtlinie und Ablauf',
    category: 'Konto & Zugriff',
    tags: ['Kennwort', 'Passwort', 'Reset', 'Richtlinie'],
    body: md`
# Kennwort zurücksetzen

## Kennwortrichtlinie Musterwerk
- mindestens **10 Zeichen**
- 3 von 4 Zeichenklassen: Groß-, Kleinbuchstaben, Ziffern, Sonderzeichen
- darf keine Teile des Benutzernamens enthalten
- maximales Alter **90 Tage**

## Ablauf
1. Identität prüfen (KB0002).
2. AD-Konsole → Benutzer → **Kennwort zurücksetzen**.
3. Richtlinienkonformes **Initialkennwort** vergeben (z. B. Wort + Zahl + Sonderzeichen, jedes Mal ein anderes).
4. Häkchen **"Benutzer muss Kennwort bei der nächsten Anmeldung ändern"** setzen.
5. Bei Bedarf **"Konto entsperren"** mit anhaken.
6. Kennwort **ausschließlich telefonisch** mitteilen.

PowerShell (Admin-Konsole):
´´´
Set-ADAccountPassword -Identity t.richter -Reset -NewPassword (Read-Host -AsSecureString)
Set-ADUser -Identity t.richter -ChangePasswordAtLogon $true
Unlock-ADAccount -Identity t.richter
´´´

## Niemals
- Kennwort per **E-Mail, Chat, SMS** oder als Ticketkommentar übermitteln
- Kennwort in **Arbeitsnotizen** dokumentieren
- "Kennwort läuft nie ab" als Abkürzung setzen

> Ausnahme "muss ändern": Homeoffice-Benutzer ohne Verbindung zum Firmennetz können das Kennwort nicht ändern – siehe KB0004.

Durch die Kennwort-Hash-Synchronisierung gilt das neue Kennwort sofort auch für Cloud-Dienste.
`,
  }),
  a({
    id: 'KB0004',
    title: 'Kennwort abgelaufen im Homeoffice (VPN)',
    category: 'Konto & Zugriff',
    tags: ['Kennwort', 'abgelaufen', 'VPN', 'Homeoffice'],
    body: md`
# Kennwort abgelaufen im Homeoffice

## Problem
Ein abgelaufenes Kennwort kann nur geändert werden, wenn ein **Domänencontroller erreichbar** ist. Im Homeoffice ist das nur über VPN möglich – das VPN lehnt aber abgelaufene Kennwörter **und** Konten mit "muss Kennwort ändern" ab. Ein Teufelskreis.

Erkennbar an:
- VPN-Client: "Authentifizierung fehlgeschlagen: Das Kennwort ist abgelaufen"
- DC01-Sicherheitsprotokoll: Ereignis 4771 mit Fehlercode ´0x17´
- AD: "Kennwort zuletzt gesetzt" älter als 90 Tage

## Lösung
1. Identität prüfen (KB0002).
2. Temporäres Kennwort setzen – **ohne** "Benutzer muss Kennwort bei der nächsten Anmeldung ändern".
3. Kennwort telefonisch mitteilen.
4. Benutzer verbindet das VPN mit dem temporären Kennwort.
5. Benutzer ändert das Kennwort **sofort** über **Strg+Alt+Entf → Kennwort ändern**.

> Hinweis: Nicht "Kennwort läuft nie ab" setzen – das verstößt gegen die Richtlinie.

## Vorbeugen
Benutzer auf die Ablaufwarnung hinweisen: Kennwort rechtzeitig ändern, solange das VPN verbunden ist.
`,
  }),
  a({
    id: 'KB0005',
    title: 'MFA zurücksetzen (neues Smartphone)',
    category: 'E-Mail & Cloud',
    tags: ['MFA', 'Authenticator', 'Cloud', 'Smartphone'],
    body: md`
# MFA zurücksetzen

Bei Handywechsel, Defekt oder Verlust kann sich der Benutzer nicht mehr mit der Authenticator-App bestätigen.

## Ablauf
1. **Identität prüfen** (KB0002) – MFA-Reset ist eine sensible Aktion!
2. Bei **Verlust/Diebstahl**: zusätzlich Sitzungen widerrufen, Gerät im Inventar melden, ggf. Informationssicherheit informieren.
3. Cloud Admin Center → Benutzer → **Authentifizierungsmethoden** → **MFA zurücksetzen / erneute Registrierung erzwingen**.
4. Benutzer meldet sich neu an, erhält "Weitere Informationen erforderlich" und scannt den QR-Code mit der App auf dem neuen Gerät.

## Was NICHT nötig ist
- Kennwort zurücksetzen (das Kennwort ist ja bekannt)
- Anmeldung blockieren

## Unbekannte MFA-Methode entdeckt?
Eine Methode, die der Benutzer nicht kennt (z. B. "Android-Gerät (unbekannt)"), deutet auf ein **kompromittiertes Konto** hin → KB0030.

> MFA-Ermüdung: Benutzer müssen wissen, dass sie Anfragen, die sie nicht selbst ausgelöst haben, **ablehnen** und melden.
`,
  }),
  a({
    id: 'KB0006',
    title: 'Cloud-Lizenzen zuweisen und freigeben',
    category: 'E-Mail & Cloud',
    tags: ['Lizenz', 'Cloud Office', 'Outlook', 'nicht lizenziert'],
    body: md`
# Cloud-Lizenzen

- **Cloud Office Standard** – Büroarbeitsplätze (E-Mail 50 GB, Office-Apps)
- **Cloud Office Premium** – Führungskräfte und Homeoffice (Geräteverwaltung, erweiterter Schutz)
- **Cloud Office Frontline** – Produktion/Lager (nur Office im Browser, kein Desktop-Outlook)
- **Diagramm-Plan 2** – nur auf Anfrage

## Symptom "Produkt nicht lizenziert"
Outlook zeigt einen roten Balken, Senden ist nicht möglich → im Cloud Admin Center unter **Benutzer → Lizenzen** prüfen.

## Lizenz zuweisen
1. Cloud Admin Center → Benutzer → **Lizenzen** → passende Lizenz auswählen.
2. Wenn "Keine freien Lizenzen": Lizenzen **ausgeschiedener Mitarbeiter** (Benutzer in OU Deaktiviert, Anmeldung blockiert) freigeben oder eine Bestellung über die IT-Leitung anstoßen.
3. Benutzer startet Outlook neu.

## Neue Benutzer
Neue AD-Konten erscheinen erst **nach der Synchronisierung** (alle 30 Minuten oder manuell: ´Start-ADSyncSyncCycle -PolicyType Delta´ bzw. Infrastruktur → Cloud-Sync).

> Lizenz eines Austritts erst entfernen, **nachdem** das Postfach in ein freigegebenes Postfach umgewandelt wurde (KB0009).
`,
  }),
  a({
    id: 'KB0007',
    title: 'Postfachberechtigungen: Vollzugriff, Senden als, Senden im Auftrag',
    category: 'E-Mail & Cloud',
    tags: ['Postfach', 'Team-Postfach', 'Vollzugriff', 'Senden als', 'Shared Mailbox'],
    body: md`
# Postfachberechtigungen

## Die drei Rechte
- **Vollzugriff** – Postfach öffnen und lesen, Mails verschieben/löschen. Das Postfach erscheint automatisch in Outlook.
- **Senden als** – Absender ist **nur** das Postfach (z. B. "Einkauf"). Der Empfänger sieht den Mitarbeiter nicht.
- **Senden im Auftrag** – Absender lautet "Mitarbeiter **im Auftrag von** Postfach".

## Voraussetzung: Freigabe
Rechte auf fremde oder Team-Postfächer nur mit **schriftlicher Freigabe** der Führungskraft bzw. des Postfach-Verantwortlichen. Freigabe im Ticket vermerken.

## Ablauf
1. Freigabe prüfen (Posteingang/Ticket).
2. Cloud Admin Center → **Postfächer** → gewünschtes Postfach → **Berechtigungen**.
3. Nur die beantragten Rechte vergeben – nicht mehr.
4. Benutzer informieren: Das Postfach erscheint nach einiger Zeit in Outlook (ggf. Outlook neu starten).

> Prinzip der minimalen Rechte: Wer nur das Team-Postfach braucht, bekommt keinen Zugriff auf das persönliche Postfach der Führungskraft.
`,
  }),
  a({
    id: 'KB0008',
    title: 'Onboarding-Checkliste',
    category: 'Onboarding/Offboarding',
    tags: ['Onboarding', 'Neuer Mitarbeiter', 'Checkliste', 'Konto anlegen'],
    body: md`
# Onboarding-Checkliste

Grundlage ist der **HR-Antrag** (Personalabteilung) und ggf. die Mail der Führungskraft.

## 1. Active Directory
- Anmeldename nach Konvention **v.nachname** (Kleinbuchstaben, Umlaute ausschreiben: ü → ue)
- Konto in der **OU der Abteilung** anlegen: ´musterwerk.local/Musterwerk/Benutzer/<Abteilung>´ – nicht in "Users"!
- Attribute: Vor-/Nachname, **Personalnummer**, Geburtsdatum, Abteilung, Position, **Vorgesetzter**, Büro/Homeoffice, Privatanschrift (bei Homeoffice)
- Initialkennwort mit **"muss bei der nächsten Anmeldung ändern"**
- Gruppen wie die genannte **Vorlage** (Benutzer kopieren oder Gruppen übernehmen) – **keine** Admin- oder IT-Gruppen

## 2. Cloud
- Synchronisierung auslösen (´Start-ADSyncSyncCycle -PolicyType Delta´)
- Passende **Lizenz** zuweisen (KB0006) – auf freie Lizenzen achten
- MFA wird bei der ersten Anmeldung eingerichtet

## 3. Hardware
- Gerät aus dem **Lager** im Inventar zuweisen (Status "Im Versand"/"In Benutzung")
- Homeoffice: **Sendung** an die Privatanschrift anlegen (KB0026)

## 4. Abschluss
- Zugangsdaten **am Starttag telefonisch** an den neuen Mitarbeiter – nicht an HR oder Führungskraft
- Alle Schritte im Ticket dokumentieren
`,
  }),
  a({
    id: 'KB0009',
    title: 'Offboarding-Checkliste',
    category: 'Onboarding/Offboarding',
    tags: ['Offboarding', 'Austritt', 'Deaktivieren', 'Shared Mailbox', 'Rücksendung'],
    body: md`
# Offboarding-Checkliste

Grundlage: Bestätigung der **Personalabteilung**. Konten werden **deaktiviert, nicht gelöscht** (Aufbewahrungsfrist 90 Tage).

## 1. Active Directory
1. Konto **deaktivieren**
2. Beschreibung: "Ausgeschieden TT.MM. – Ticket T-xxxxx"
3. In OU **Deaktiviert** verschieben
4. Alle Gruppen entfernen – außer **Domänen-Benutzer**

## 2. Cloud
1. **Anmeldung blockieren**
2. **Sitzungen widerrufen** (sonst bleiben Handy-/Browser-Sitzungen gültig)
3. Postfach in ein **freigegebenes Postfach** umwandeln
4. **Vollzugriff** für die Vorgesetzte bzw. Nachfolge vergeben, optional Abwesenheitsnotiz
5. **Erst danach** Lizenz entfernen

## 3. Hardware
- Rückgabe vor Ort oder **Rücksendung** anlegen (Abholung an der Privatadresse), Assets im Inventar nachhalten

## 4. Dokumentation
Jeden Schritt kurz im Ticket vermerken.

> Hinweis: Ein gelöschtes Konto lässt sich nicht einfach wiederherstellen – Postfach, Gruppen und Berechtigungen wären verloren.
`,
  }),
  a({
    id: 'KB0010',
    title: 'Netzwerk-Fehlersuche Schritt für Schritt',
    category: 'Netzwerk',
    tags: ['ipconfig', 'ping', 'nslookup', 'Diagnose', 'Netzwerk'],
    body: md`
# Netzwerk-Fehlersuche Schritt für Schritt

Immer **von unten nach oben** arbeiten: Kabel/Adapter → IP-Adresse → Gateway → DNS → Anwendung/Proxy.

## 1. Adapter und IP
´´´
ipconfig /all
´´´
- Adapter deaktiviert oder "Medium getrennt"? → Geräte-Manager/Netzwerkverbindungen
- Adresse **169.254.x.x** → kein DHCP (KB0012)
- DNS-Server 8.8.8.8 o. ä. statt **10.10.0.10/10.10.0.11** → interne Namen lösen nicht auf

## 2. Gateway und Server
´´´
ping 10.10.20.1
ping 10.10.0.10
´´´

## 3. Namensauflösung
´´´
nslookup intranet
ping intranet
´´´
Liefern beide **unterschiedliche** IPs, ist die hosts-Datei oder der Cache im Spiel (KB0011).

## 4. Anwendung
- Browser: "ERR_PROXY_CONNECTION_FAILED" → Proxy (KB0013)
- Nur interne Ziele aus dem Homeoffice gestört → VPN (KB0014)

## Typische Reparaturen
´´´
ipconfig /release
ipconfig /renew
ipconfig /flushdns
´´´

> Erst messen, dann ändern – und jede Änderung dokumentieren.
`,
  }),
  a({
    id: 'KB0011',
    title: 'Namensauflösung: DNS, Cache und hosts-Datei',
    category: 'Netzwerk',
    tags: ['DNS', 'hosts', 'flushdns', 'nslookup', 'Manipulation'],
    body: md`
# Namensauflösung: DNS, Cache und hosts-Datei

Windows löst Namen in dieser Reihenfolge auf:
1. **hosts-Datei** ´C:\Windows\System32\drivers\etc\hosts´
2. **DNS-Client-Cache** (´ipconfig /displaydns´)
3. **DNS-Server** aus der IP-Konfiguration (intern: 10.10.0.10 / 10.10.0.11)

## Unterschied nslookup ↔ ping
- ´nslookup´ fragt **direkt den DNS-Server** – hosts und Cache werden ignoriert.
- ´ping´ und der Browser nutzen die **komplette Kette**.

Zeigt ´nslookup intranet´ 10.10.0.40, ´ping intranet´ aber eine fremde Adresse → **hosts-Datei oder Cache manipuliert**.

## hosts-Datei prüfen und bereinigen
1. Editor als Administrator öffnen, Datei ´hosts´ laden.
2. Standard-Image: nur Kommentarzeilen (´#´). Jede aktive Zeile mit firmenfremder IP ist verdächtig.
3. Fremde Zeilen entfernen, speichern.
4. Cache leeren: ´ipconfig /flushdns´
5. Testen: Intranet und Cloud-Anmeldung im Browser.

> Sicherheitsvorfall! Manipulierte hosts-Einträge stammen meist von unerwünschter Software. Ursache (Installer, Defender-Warnungen) suchen und die **Informationssicherheit** informieren.

## Interne Namen gehen nicht, Internet schon?
Wahrscheinlich ist ein **externer DNS-Server** (z. B. 8.8.8.8) eingetragen – der kennt ´musterwerk.local´ nicht. DNS wieder automatisch per DHCP beziehen.
`,
  }),
  a({
    id: 'KB0012',
    title: 'DHCP und APIPA (169.254.x.x)',
    category: 'Netzwerk',
    tags: ['DHCP', 'APIPA', '169.254', 'Lease', 'Bereich'],
    body: md`
# DHCP und APIPA

Bekommt ein Client keine Antwort vom DHCP-Server, vergibt er sich selbst eine **APIPA-Adresse 169.254.x.x**. Damit ist keine Kommunikation mit anderen Netzen möglich.

## Client oder Server?
- **Nur ein Client** betroffen, andere im selben Netz ok → Client prüfen (Kabel, Adapter, DHCP-Clientdienst ´Dhcp´).
- **Mehrere/neue Geräte** im selben Netz betroffen → **DHCP-Server** prüfen.

## DHCP-Server prüfen (Infrastruktur → DHCP, DC01)
1. Läuft der Dienst **DHCP-Server**?
2. Ist der **Bereich** aktiv?
3. **Auslastung**: Wie viele Adressen sind frei? (Ereignis 1020 "Bereich zu 100 % ausgelastet")
4. **Leases** ansehen: Viele Einträge eines Gerätetyps mit wechselnden MAC-Adressen → **MAC-Randomisierung**.

## Abhilfe bei vollem Bereich
- Verwaiste Leases löschen (nur die betroffenen Geräte – **nicht** die der Arbeitsplätze!)
- Bereich erweitern (Adressbereich bis zum Ende des Subnetzes)
- Dauerhaft: MAC-Randomisierung abschalten, Leasedauer verkürzen → **Netzwerk & Infrastruktur**

## Danach am Client
´´´
ipconfig /renew
´´´
Der Windows-Client fragt im APIPA-Zustand auch selbst alle paar Minuten erneut an.

> Keine statische IP als "Lösung" eintragen – das führt später zu Adresskonflikten.
`,
  }),
  a({
    id: 'KB0013',
    title: 'Proxy-Einstellungen prüfen',
    category: 'Netzwerk',
    tags: ['Proxy', 'Internet', 'ERR_PROXY_CONNECTION_FAILED', 'Registry'],
    body: md`
# Proxy-Einstellungen

## Firmenstandard
- Standard-Clients: **kein manueller Proxy** (ProxyEnable = 0)
- Wenn ein Proxy nötig ist: ´proxy.musterwerk.local:8080´ mit Ausnahmen ´*.musterwerk.local;10.*;<local>´

## Typisches Fehlerbild
- Browser: **ERR_PROXY_CONNECTION_FAILED**
- **Intranet geht, Internet nicht** (interne Adressen stehen in der Ausnahmeliste)
- Häufig nach Messe, Hotel oder Kundenbesuch, wo ein fremder Proxy eingetragen wurde

## Prüfen
- Einstellungen → Netzwerk → Proxy, oder Registry:
´´´
HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings
  ProxyEnable   (REG_DWORD, 1 = aktiv)
  ProxyServer   (REG_SZ, z. B. proxy.musterwerk.local:8080)
  ProxyOverride (REG_SZ, Ausnahmen)
´´´

## Korrigieren
1. Fremden Proxy entfernen bzw. ProxyEnable auf 0 setzen (oder Firmen-Proxy eintragen).
2. Browser neu laden und Internet + Intranet testen.

> Kommt der falsche Proxy immer wieder, verstellt ihn vermutlich eine Software (Autostart prüfen, KB0018).
`,
  }),
  a({
    id: 'KB0014',
    title: 'VPN (SecureLink) – Zugang und Fehlerbilder',
    category: 'Netzwerk',
    tags: ['VPN', 'SecureLink', 'Homeoffice', 'GG_VPN_Benutzer'],
    body: md`
# VPN (SecureLink)

## Berechtigung
VPN dürfen nur Mitglieder der Gruppe **GG_VPN_Benutzer**. Neuer Zugang nur mit **Freigabe der Führungskraft**. Der Client ist auf allen Firmen-Notebooks vorinstalliert.

## Fehlermeldungen und Ursachen
- **"Keine Internetverbindung"** → Heimnetz/WLAN des Benutzers prüfen
- **"Authentifizierung fehlgeschlagen (Konto gesperrt oder deaktiviert)"** → AD-Konto prüfen (KB0001)
- **"Das Kennwort ist abgelaufen"** → KB0004
- **"Zugriff verweigert … Policy MW-VPN" (Fehler 691)** → Benutzer ist nicht in GG_VPN_Benutzer
- **"Zertifikatsprüfung fehlgeschlagen: Systemzeit weicht ab"** → Uhrzeit (KB0022)
- **"Gateway antwortet nicht"** → Störung am VPN-Gateway → Netzwerk & Infrastruktur, ggf. Statusseite

## Hinweis Gruppenänderung
Eine neue Gruppenmitgliedschaft wirkt erst nach erneuter Anmeldung (neues Token).
`,
  }),
  a({
    id: 'KB0015',
    title: 'Netzlaufwerke, Gruppen und Anmeldetoken (AGDLP)',
    category: 'Konto & Zugriff',
    tags: ['Netzlaufwerk', 'Gruppen', 'Token', 'klist', 'gpupdate', 'AGDLP'],
    body: md`
# Netzlaufwerke und Gruppen

## So hängt es zusammen (AGDLP)
- **A**ccount (Benutzer) ist Mitglied einer **G**lobalen Rollengruppe (z. B. ´GG_Logistik´)
- Die globale Gruppe ist Mitglied einer **D**omänen**l**okalen Ressourcengruppe (z. B. ´FS_Logistik_RW´)
- Die domänenlokale Gruppe hat die **P**ermission auf der Freigabe ´\\FS01\Logistik´

Benutzer werden **immer in die Rollengruppe** aufgenommen – nie direkt in FS_-Gruppen.

## Laufwerkszuordnung per GPO
Laufwerk S: (Abteilung), P: (Allgemein) und Projektlaufwerke werden per Gruppenrichtlinie anhand der **Gruppenmitgliedschaft** verbunden.

## Das Token-Problem
Gruppenmitgliedschaften stehen im **Kerberos-Token**, das bei der Anmeldung erstellt wird. Nach einer Gruppenänderung gilt die neue Mitgliedschaft erst, wenn das Token erneuert wird:
´´´
klist purge
gpupdate /force
´´´
oder Abmelden/Anmelden bzw. Neustart.

## Fehlerbilder
- Laufwerk fehlt komplett → Gruppe fehlt (GPO-Zielgruppenadressierung)
- "Zugriff verweigert" trotz Gruppe → Token veraltet
- Laufwerk mit rotem Kreuz und Kontosperren → gespeicherte alte Anmeldedaten (KB0001)

## Wer hat die Gruppe geändert?
DC01-Sicherheitsprotokoll: Ereignis **4728/4729** (Mitglied hinzugefügt/entfernt) mit Antragsteller.
`,
  }),
  a({
    id: 'KB0016',
    title: 'Druckerprobleme: Client, Druckserver oder Gerät?',
    category: 'Drucker',
    tags: ['Drucker', 'Spooler', 'PRINT01', 'Warteschlange', 'Papierstau'],
    body: md`
# Druckerprobleme eingrenzen

Erste Frage: **Wie viele sind betroffen?**
- **Ein Benutzer, alle Drucker weg** → Client (Spooler-Dienst)
- **Viele Benutzer, mehrere Drucker "Offline"** → **Druckserver PRINT01**
- **Ein Drucker, alle Benutzer** → Warteschlange oder Gerät

## 1. Client
- Dienst **Druckwarteschlange** (´Spooler´) läuft? Starttyp **Automatisch**?
´´´
sc query spooler
Set-Service Spooler -StartupType Automatic
Start-Service Spooler
gpupdate /force
´´´
- Drucker fehlt → GPO-Gruppe (z. B. GG_Drucker_1OG_Farbe) und ´gpupdate´

## 2. Druckserver PRINT01
- Infrastruktur → PRINT01 → Dienst **Druckwarteschlange**
- Ereignisprotokoll: Stürzt ´spoolsv.exe´ ab? Oft löst ein **defekter Auftrag** den Absturz aus.
- Warteschlange: Aufträge mit Status **Fehler** löschen – **nur** den defekten, nicht die der Kollegen.
- Dienst starten und beobachten, ob er stabil bleibt.

## 3. Gerät (Drucker-Weboberfläche)
- Status, Toner, Papierfächer, Gerätelog
- **Softwarefehler** ("Neustart behebt …") → Gerät über die Weboberfläche neu starten
- **Papierstau, Toner leer, Hardwarefehler** → **Vor-Ort-Service** (KB0026); dem Benutzer einen **Ausweichdrucker** verbinden

> Viele Betroffene = hohe Auswirkung → Priorität entsprechend hoch setzen (KB0027).
`,
  }),
  a({
    id: 'KB0017',
    title: 'Festplatte voll – Speicherplatz freigeben',
    category: 'Hardware',
    tags: ['Speicherplatz', 'Datenträgerbereinigung', 'Temp', 'C:'],
    body: md`
# Festplatte voll

Ab weniger als **10 GB frei** auf C: drohen Probleme (Updates, Outlook-OST, Anwendungen).

## Gefahrlos löschbar
- Benutzer-Temp: ´%TEMP%´ (´C:\Users\<Benutzer>\AppData\Local\Temp´)
- System-Temp: ´C:\Windows\Temp´
- Update-Downloads: ´C:\Windows\SoftwareDistribution\Download´
- Papierkorb
→ am einfachsten mit der **Datenträgerbereinigung**

## Nur nach Rücksprache
- Downloads, Desktop, Dokumente, Videos – **jede Datei einzeln abstimmen**
- Große Dateien ggf. auf H: oder das Abteilungslaufwerk verschieben statt löschen

## Vorgehen
1. Freien Speicher feststellen (Explorer/Datenträgerverwaltung) und notieren.
2. Datenträgerbereinigung ausführen.
3. Große Benutzerdateien mit dem Benutzer besprechen.
4. Ziel prüfen (mind. 10 GB frei) und dokumentieren: vorher/nachher, was gelöscht wurde, mit wem abgestimmt.

> Niemals Systemordner, Programmordner oder das Benutzerprofil löschen.
`,
  }),
  a({
    id: 'KB0018',
    title: 'PC langsam – Task-Manager und Autostart',
    category: 'Software',
    tags: ['Performance', 'Task-Manager', 'Autostart', 'CPU', 'Adware'],
    body: md`
# PC langsam

## Diagnose
1. **Task-Manager** → Prozesse nach **CPU** und **Arbeitsspeicher** sortieren.
2. Unbekannte Prozesse mit Dauerlast notieren (Name, Hersteller, Pfad).
3. **Autostart**-Registerkarte: Einträge mit hoher Startauswirkung.
4. Ereignisanzeige → Anwendung: *Diagnostics-Performance* (langsamer Start), *Application Hang*.

## Beheben
1. **Erst Autostart deaktivieren** (Task-Manager → Autostart oder Registry), dann den Prozess beenden – manche Programme starten sich sonst sofort wieder (Updater).
´´´
HKCU\Software\Microsoft\Windows\CurrentVersion\Run
HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Run
taskkill /IM SmartSaver.exe /F
´´´
2. CPU-Last kontrollieren.
3. Deinstallation unerwünschter Software über den **2nd Level**; bei Verdacht auf Schadsoftware **Informationssicherheit**.

> Kritische Systemprozesse (lsass, csrss, services …) und den Virenschutz nie beenden.
`,
  }),
  a({
    id: 'KB0019',
    title: 'Geräte-Manager: Fehlercodes',
    category: 'Hardware',
    tags: ['Geräte-Manager', 'Treiber', 'Code 22', 'Code 28', 'Code 43'],
    body: md`
# Geräte-Manager: wichtige Fehlercodes

- **Code 22 – Gerät deaktiviert**: Rechtsklick → **Gerät aktivieren**. Oft versehentlich (z. B. Webcam).
- **Code 28 – Kein Treiber installiert**: Treiber über die Softwareverteilung (2nd Level) installieren lassen.
- **Code 10 – Gerät kann nicht gestartet werden**: Treiber aktualisieren, ggf. Gerät neu verbinden.
- **Code 43 – Gerät hat Probleme gemeldet**: häufig Hardwaredefekt → Vor-Ort-Service/Austausch.
- **Code 45 – Gerät nicht angeschlossen**: Kabel/Dock prüfen.

## Vorgehen
1. Geräte-Manager öffnen, Gerät mit Warnsymbol suchen.
2. Eigenschaften → Gerätestatus → **Code notieren**.
3. Passende Maßnahme, Ergebnis vom Benutzer bestätigen lassen.

> USB-Massenspeicher sind per Richtlinie gesperrt (KB0031) – das ist **kein** Fehler.
`,
  }),
  a({
    id: 'KB0020',
    title: 'BitLocker-Wiederherstellungsschlüssel herausgeben',
    category: 'Sicherheit',
    tags: ['BitLocker', 'Wiederherstellung', 'Schlüssel-ID', 'Notebook'],
    body: md`
# BitLocker-Wiederherstellung

Auslöser: BIOS/Firmware-Update, Mainboard-Tausch, geänderte Bootreihenfolge, TPM-Fehler.

## Ablauf
1. **Identität prüfen** (KB0002) – der Schlüssel entsperrt das komplette Gerät!
2. Benutzer liest die **Wiederherstellungsschlüssel-ID** vom Bildschirm vor (erste 8 Zeichen).
3. AD-Konsole → **Computerobjekt** des Notebooks → **BitLocker-Wiederherstellung**.
4. Schlüssel mit **passender ID** auswählen – nach Reparaturen gibt es oft **mehrere** Schlüssel.
5. 48-stelligen Schlüssel **blockweise am Telefon** vorlesen (8 Blöcke à 6 Ziffern).

## Niemals
- per E-Mail, Chat, SMS oder Ticketkommentar senden
- den Schlüssel im Ticket dokumentieren (Schlüssel-**ID** ist ok)

## Danach
- Hinweis an 2nd Level: Bei geplanten Firmware-Updates BitLocker vorher **anhalten** lassen.
`,
  }),
  a({
    id: 'KB0021',
    title: 'Vertrauensstellung zur Domäne reparieren',
    category: 'Konto & Zugriff',
    tags: ['Vertrauensstellung', 'Secure Channel', 'Computerkonto', 'LAPS'],
    body: md`
# Vertrauensstellung reparieren

## Fehlermeldung
"Die Vertrauensstellung zwischen dieser Arbeitsstation und der primären Domäne konnte nicht hergestellt werden."

## Ursache
Das **Computerkonto-Kennwort** im AD passt nicht zu dem auf dem Client – typischerweise nach dem Zurücksetzen auf ein **altes Image/Snapshot** oder nach "Computerkonto zurücksetzen" im AD. Spuren: NETLOGON 3210, Kerberos KRB_AP_ERR_MODIFIED.

## Reparatur
1. Am Client mit dem **lokalen Administrator** anmelden – Kennwort per **LAPS** in der AD-Konsole (Zugriff wird protokolliert).
2. Admin-PowerShell:
´´´
Test-ComputerSecureChannel -Verbose
Test-ComputerSecureChannel -Repair -Credential MUSTERWERK\<Admin>
´´´
alternativ ´Reset-ComputerMachinePassword´.
3. Neu starten, Domänenanmeldung testen.

> Das Computerkonto **nicht löschen** – Gruppen, BitLocker-Schlüssel und LAPS gingen verloren.

## Dauerhaft
Bei Kiosk-/Schulungsrechnern, die regelmäßig zurückgesetzt werden, das Image-Verfahren durch den 2nd Level anpassen lassen.
`,
  }),
  a({
    id: 'KB0022',
    title: 'Zeitsynchronisierung und Kerberos',
    category: 'Netzwerk',
    tags: ['Uhrzeit', 'W32Time', 'Kerberos', 'w32tm', 'Zeitabweichung'],
    body: md`
# Zeitsynchronisierung und Kerberos

Kerberos lässt höchstens **5 Minuten** Abweichung zwischen Client und Domänencontroller zu. Bei größerer Abweichung schlagen Anmeldungen, Netzlaufwerke, Gruppenrichtlinien und das VPN fehl.

## Symptome
- Uhr in der Taskleiste geht vor/nach
- Netzlaufwerke fehlen, "Anmeldeinformationen ungültig"
- Ereignisse: Kerberos **KRB_AP_ERR_SKEW**, GroupPolicy 1129
- VPN: "Zertifikatsprüfung fehlgeschlagen: Systemzeit weicht ab"

## Prüfen und beheben
1. Dienst **Windows-Zeitgeber** (´W32Time´): läuft? Starttyp **nicht** deaktiviert?
´´´
sc config w32time start= demand
net start w32time
w32tm /resync
w32tm /query /status
´´´
2. Danach Laufwerke/Richtlinien neu anwenden: ´gpupdate /force´.

> Die Domänenclients holen ihre Zeit automatisch vom DC (NT5DS). Keine manuellen NTP-Server eintragen.

Geht die Uhr nach jedem Neustart wieder falsch (BIOS-Batterie), an den Vor-Ort-Service geben.
`,
  }),
  a({
    id: 'KB0023',
    title: 'Phishing-Vorfall: Sofortmaßnahmen',
    category: 'Sicherheit',
    tags: ['Phishing', 'Sitzungen widerrufen', 'Kennwort', 'Absender sperren', 'Risiko'],
    body: md`
# Phishing-Vorfall: Sofortmaßnahmen

## Hat der Benutzer nur geklickt oder auch Daten eingegeben?
- **Nur gemeldet/nicht geklickt** → Mail in Quarantäne/löschen, Absender sperren, danken!
- **Zugangsdaten eingegeben** → Konto als **kompromittiert** behandeln.

## Bei eingegebenen Zugangsdaten
1. Cloud Admin Center → **Anmeldeprotokolle**: Anmeldungen von fremden Orten/Hostern?
2. **Alle Sitzungen widerrufen**.
3. **Kennwort zurücksetzen** – neues Kennwort nur **telefonisch** nach Identitätsprüfung.
4. MFA-Methoden prüfen (unbekannte Geräte entfernen, KB0005).
5. Postfach prüfen: Weiterleitungen, Posteingangsregeln (KB0030).
6. **Absender bzw. Domain sperren** (Mail-Sicherheit → gesperrte Absender), weitere Empfänger informieren.
7. Riskanten Benutzer als **behoben** markieren, sobald alles erledigt ist.
8. **Informationssicherheit** informieren.

> Den Phishing-Link **niemals selbst öffnen** – auch nicht "nur zum Ansehen".

## Kommunikation
Benutzer nicht beschuldigen – wer meldet, hilft. Kurz erklären, woran man Phishing erkennt (Absender, Zeitdruck, Link-Adresse).
`,
  }),
  a({
    id: 'KB0024',
    title: 'Social Engineering erkennen',
    category: 'Sicherheit',
    tags: ['Social Engineering', 'CEO-Fraud', 'Telefon', 'Eskalation'],
    body: md`
# Social Engineering erkennen

Angreifer nutzen Hilfsbereitschaft und Respekt vor Hierarchien.

## Warnsignale
- **Zeitdruck**: "Das muss JETZT passieren!"
- **Autorität**: "Ich bin der Vorstand – wissen Sie, mit wem Sie sprechen?"
- **Ungewöhnlicher Kanal**: private Mail-Adresse, geliehenes Telefon
- **Rückruf wird abgelehnt**
- **Identitätsdaten falsch oder ausweichend**
- Bitte, Sicherheitsmaßnahmen abzuschalten (MFA "kurz deaktivieren")

## Richtig reagieren
1. Ruhig und höflich bleiben – Prozesse gelten für **alle**, auch für die Geschäftsführung.
2. Keine Änderung am Konto, keine Daten herausgeben.
3. Rückruf über die **bekannte Nummer** oder die Assistenz anbieten.
4. Gespräch sachlich dokumentieren (Uhrzeit, Nummer, Forderungen, Antworten).
5. Ticket an die **Informationssicherheit** eskalieren.

> Niemand wird dafür kritisiert, einen Prozess eingehalten zu haben – wohl aber dafür, ihn auf Druck gebrochen zu haben.
`,
  }),
  a({
    id: 'KB0025',
    title: 'Richtlinie: Administratorrechte und Softwareinstallation',
    category: 'Software',
    tags: ['Admin-Rechte', 'Software', 'Richtlinie', 'Softwareverteilung'],
    body: md`
# Administratorrechte und Software

## Richtlinie
- Anwender erhalten **keine lokalen Administratorrechte** – auch nicht "kurz".
- Mitgliedschaften in ´GG_Lokale_Admins´, ´Domänen-Admins´ o. ä. nur für die IT und nur mit Freigabe der IT-Leitung.
- **LAPS-Kennwörter** werden nie an Benutzer weitergegeben.
- Software wird von der IT **geprüft, paketiert und verteilt** (2nd Level / Softwareverteilung).

## Warum?
Schadsoftware, Lizenzverstöße, instabile Systeme, fehlende Updates.

## Vorgehen bei Anfragen
1. Freundlich ablehnen und kurz begründen.
2. **Eigentlichen Bedarf** aufnehmen: Welche Software, Version, Quelle, für welchen PC, bis wann, wer genehmigt?
3. Ticket an den **2nd Level Support** weiterleiten.
4. Benutzer über das weitere Vorgehen informieren.

> Privat installierte "Tools" (Tuning, Gutscheine, Viewer) sind häufige Ursache für Störungen – siehe KB0018.
`,
  }),
  a({
    id: 'KB0026',
    title: 'Hardwaretausch, Vor-Ort-Service und Versand',
    category: 'Hardware',
    tags: ['Hardware', 'Austausch', 'Versand', 'Rücksendung', 'Vor-Ort-Service', 'Inventar'],
    body: md`
# Hardwaretausch und Versand

Physische Defekte (gebrochenes Display, Papierstau in der Fixiereinheit, defekte Tastatur …) sind **remote nicht lösbar**.

## Im Büro
- Ticket an den **Vor-Ort-Service** eskalieren, genaue Fehlerbeschreibung (Fehlercode, Standort, Erreichbarkeit).
- Workaround anbieten (Ausweichdrucker, Leihgerät).

## Im Homeoffice: Austauschgerät
1. **Inventar**: freies Gerät mit Status **Lager** auswählen, dem Benutzer **zuweisen** (Status "Im Versand").
2. Defektes Gerät auf **In Reparatur** setzen (Garantie/RMA prüfen) – nicht vorschnell "Ausgemustert".
3. **Versand**: ausgehende Sendung an die Homeoffice-Adresse (Adresse im AD bzw. Ticket prüfen), Versandart nach Dringlichkeit.
4. **Rücksendung** für das defekte Gerät anlegen (Abholung beim Benutzer).
5. Benutzer informieren: Lieferzeitraum, Rückgabe, Anmeldung am neuen Gerät.

## Dokumentation
Asset-Tags (alt/neu), Sendungsnummern, Status.
`,
  }),
  a({
    id: 'KB0027',
    title: 'Prioritätsmatrix und SLA',
    category: 'Sonstiges',
    tags: ['Priorität', 'SLA', 'Auswirkung', 'Dringlichkeit', 'ITIL'],
    body: md`
# Prioritätsmatrix und SLA

**Priorität = Auswirkung × Dringlichkeit**

## Auswirkung
- **Hoch (1)**: viele Benutzer, ganze Abteilung oder kritischer Prozess (Versand, Lohn)
- **Mittel (2)**: mehrere Benutzer oder eine Person ohne Arbeitsmöglichkeit
- **Gering (3)**: einzelne Person, Workaround vorhanden

## Dringlichkeit
- **Hoch (1)**: Schaden wächst sofort (Sicherheitsvorfall, Termin, Stillstand)
- **Mittel (2)**: zeitnah nötig
- **Gering (3)**: kann warten

## Ergebnis
- 1+1 → **P1 – Kritisch**
- Summe 3 → **P2 – Hoch**
- Summe 4 → **P3 – Mittel**
- Summe 5–6 → **P4 – Niedrig**

## SLA (Training)
- P1: Reaktion 5 Min., Lösung 30 Min.
- P2: Reaktion 10 Min., Lösung 45 Min.
- P3: Reaktion 15 Min., Lösung 60 Min.
- P4: Reaktion 30 Min., Lösung 120 Min.

> Die Position des Anrufers (VIP) ändert die Priorität nicht automatisch – entscheidend sind Auswirkung und Dringlichkeit. Sicherheitsvorfälle sind mindestens P2.
`,
  }),
  a({
    id: 'KB0028',
    title: 'Gute Arbeitsnotizen schreiben',
    category: 'Sonstiges',
    tags: ['Dokumentation', 'Arbeitsnotiz', 'Ticket'],
    body: md`
# Gute Arbeitsnotizen

Ein Kollege muss das Ticket **ohne Rückfrage** verstehen und weiterbearbeiten können.

## Aufbau
1. **Symptom**: Was meldet der Benutzer? (Fehlermeldung wörtlich)
2. **Analyse**: Was wurde geprüft? (Befehle, Ereignis-IDs, Werte)
3. **Ursache**
4. **Maßnahme**: Was wurde geändert?
5. **Ergebnis**: Vom Benutzer bestätigt?

## Beispiel
> Benutzerin meldet "Konto gesperrt". Identität geprüft (Personalnummer + Geburtsdatum). DC01 Ereignis 4740: Sperrquelle PC-VT-004. Ursache: altes Kennwort im Mail-Konto des Smartphones. Konto entsperrt, Benutzerin aktualisiert das Kennwort am Handy. Anmeldung bestätigt.

## Niemals ins Ticket
- Kennwörter, BitLocker-Schlüssel, LAPS-Kennwörter
- Personalnummer/Geburtsdatum des Benutzers
- Wertungen über Personen

> Kurze, sachliche Sätze. Lieber eine Zeile mehr als eine Rückfrage später.
`,
  }),
  a({
    id: 'KB0029',
    title: 'Telefonleitfaden Service Desk',
    category: 'Sonstiges',
    tags: ['Telefon', 'Kommunikation', 'Leitfaden', 'Gesprächsführung'],
    body: md`
# Telefonleitfaden

## 1. Begrüßung
> "IT-Service-Desk Musterwerk, [Name], guten Tag. Wie kann ich Ihnen helfen?"

## 2. Aufnehmen
- Name, Abteilung, Rückrufnummer
- Problem in eigenen Worten wiederholen
- Gezielt fragen: Seit wann? Fehlermeldung? Nur bei Ihnen? Was hat sich geändert?
- Rechnername erfragen (Aufkleber) oder im AD nachsehen

## 3. Sensible Anliegen
Identität prüfen, **bevor** etwas geändert wird (KB0002).

## 4. Fernzugriff
> "Darf ich mich auf Ihren PC aufschalten?" – erst nach Zustimmung verbinden.

## 5. Lösen oder eskalieren
- Während der Arbeit erklären, was passiert ("Ich prüfe gerade …")
- Wartezeiten ankündigen

## 6. Abschluss
- **Bestätigen lassen**: "Funktioniert es jetzt wieder?"
- Ticketnummer nennen, weiteres Vorgehen erklären
- Verabschieden

> Kennwörter und Schlüssel nur am Telefon und nur nach Identitätsprüfung nennen.
`,
  }),
  a({
    id: 'KB0030',
    title: 'Kompromittiertes Postfach (Weiterleitung, Regeln, MFA)',
    category: 'Sicherheit',
    tags: ['BEC', 'Weiterleitung', 'Posteingangsregel', 'MFA-Ermüdung', 'Incident'],
    body: md`
# Kompromittiertes Postfach

Typischer Ablauf eines Angriffs (Business E-Mail Compromise):
1. Zugangsdaten per Phishing erbeutet oder **MFA-Ermüdung** (Push-Anfragen, bis jemand "Genehmigen" drückt)
2. Angreifer registriert eine **eigene MFA-Methode**
3. **Externe Weiterleitung** und **Posteingangsregeln**, die Antworten verstecken (z. B. in "RSS-Abonnements")
4. Betrugsmails an Kunden/Lieferanten ("neue Bankverbindung")

## Prüfen (Cloud Admin Center)
- **Anmeldeprotokolle**: fremde IPs, Anonymisierungsdienste, viele "Unterbrochen (MFA)"
- **Authentifizierungsmethoden**: unbekannte Geräte
- **Postfach**: Weiterleitung, Regeln (seltsame Namen wie "..")

## Bereinigen
1. Weiterleitung entfernen
2. Verdächtige Regeln löschen (legitime Regeln stehen lassen)
3. Fremde MFA-Methode entfernen bzw. MFA zurücksetzen
4. **Sitzungen widerrufen**, **Kennwort zurücksetzen** (telefonisch, nach Identitätsprüfung)
5. Riskanten Benutzer als behoben markieren
6. **Informationssicherheit** informieren; betroffene Geschäftspartner warnen lassen

> Chronologie dokumentieren – sie wird für die Aufarbeitung gebraucht.
`,
  }),
  a({
    id: 'KB0031',
    title: 'USB-Datenträger: Richtlinie',
    category: 'Sicherheit',
    tags: ['USB', 'USBSTOR', 'Richtlinie', 'Datenschutz'],
    body: md`
# USB-Datenträger

USB-Massenspeicher sind auf Clients per Richtlinie gesperrt:
´´´
HKLM\SYSTEM\CurrentControlSet\Services\USBSTOR
  Start = 4   (deaktiviert)
´´´
Tastaturen, Mäuse, Headsets und Docks funktionieren weiterhin.

## Anfragen
- Ein "nicht erkannter USB-Stick" ist **kein Fehler**, sondern gewollt.
- Den Wert **nicht** ohne Freigabe ändern.
- Alternativen anbieten: Austausch über ´\\FS01\Allgemein\Austausch´, Cloud-Speicher-Freigabe für externe Partner.
- Ausnahmen nur mit **Freigabe der Informationssicherheit** (Ticket weiterleiten), dann zeitlich begrenzt.
`,
  }),
]
