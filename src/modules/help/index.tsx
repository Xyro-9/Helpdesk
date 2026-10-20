// Hilfe: Einführung, Arbeitsablauf, Prioritätsmatrix/SLA, Bewertung, Werkzeuge & Befehle, Firmenüberblick, Telefonleitfaden, Tastenkürzel, FAQ

import { BookOpen, Building2, ClipboardCheck, HelpCircle, Keyboard, ListOrdered, MessagesSquare, Phone, Scale, SquareTerminal, Wrench } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { PRIORITIES, priorityFrom, SLA } from '@/core/scenarios/engine'
import { useStore } from '@/core/store'
import type { Priority } from '@/core/types'
import { IHK_SCALE } from '@/modules/progress/stats'
import { Badge, cx, Kbd, PageHeader, tableCls } from '@/ui'

const SECTIONS: { id: string; title: string; icon: ReactNode }[] = [
  { id: 'einfuehrung', title: 'Einführung', icon: <BookOpen size={15} /> },
  { id: 'ablauf', title: 'Arbeitsablauf', icon: <ListOrdered size={15} /> },
  { id: 'prioritaet', title: 'Priorität & SLA', icon: <Scale size={15} /> },
  { id: 'bewertung', title: 'Bewertung', icon: <ClipboardCheck size={15} /> },
  { id: 'werkzeuge', title: 'Werkzeuge', icon: <Wrench size={15} /> },
  { id: 'befehle', title: 'Befehls-Spickzettel', icon: <SquareTerminal size={15} /> },
  { id: 'firma', title: 'Firmenüberblick', icon: <Building2 size={15} /> },
  { id: 'telefon', title: 'Telefonleitfaden', icon: <Phone size={15} /> },
  { id: 'tasten', title: 'Tastenkürzel', icon: <Keyboard size={15} /> },
  { id: 'faq', title: 'Häufige Fragen', icon: <MessagesSquare size={15} /> },
]

const PRIO_TONE: Record<Priority, string> = {
  'P1 – Kritisch': 'bg-rose-100 text-rose-800',
  'P2 – Hoch': 'bg-amber-100 text-amber-900',
  'P3 – Mittel': 'bg-sky-100 text-sky-800',
  'P4 – Niedrig': 'bg-slate-100 text-slate-700',
}

const PRIO_EXAMPLE: Record<Priority, string> = {
  'P1 – Kritisch': 'ERP oder Internet für das ganze Werk ausgefallen, Sicherheitsvorfall mit Schadsoftware',
  'P2 – Hoch': 'Abteilungsdrucker defekt, Vorstand kann nicht arbeiten, Konto vor wichtiger Frist gesperrt',
  'P3 – Mittel': 'Einzelner Benutzer gestört, Workaround vorhanden (z. B. anderer Drucker)',
  'P4 – Niedrig': 'Serviceanfragen, Wünsche, planbare Änderungen (z. B. Zugang ab nächster Woche)',
}

const FLOW = [
  { title: 'Annahme', text: 'Anruf, Mail, Chat oder Portal: freundlich begrüßen, Ticket übernehmen, Anliegen in eigenen Worten zusammenfassen.' },
  { title: 'Triage', text: 'Kategorie wählen, Auswirkung × Dringlichkeit bewerten → Priorität. Bei sensiblen Anliegen: Identität prüfen.' },
  { title: 'Diagnose', text: 'Gezielte Fragen (Seit wann? Was hat sich geändert? Wer ist betroffen?), Fehlermeldung wörtlich, Prüfungen mit Werkzeugen.' },
  { title: 'Lösung', text: 'Ursache beheben (nicht nur Symptom), Einverständnis für Fernzugriff einholen, ggf. eskalieren. Benutzer testen lassen.' },
  { title: 'Dokumentation', text: 'Arbeitsnotizen: Symptom, Ursache, Maßnahmen, Ergebnis. Keine Kennwörter! Passenden KB-Artikel verknüpfen.' },
  { title: 'Abschluss', text: 'Lösung bestätigen lassen, Benutzer informieren, Abschlusscode wählen und Ticket lösen.' },
]

const COMMANDS: { cmd: string; what: string; when: string }[] = [
  { cmd: 'ipconfig /all', what: 'IP-Konfiguration aller Adapter (IP, Gateway, DNS, DHCP, MAC)', when: 'Erster Blick bei jedem Netzwerkproblem' },
  { cmd: 'ipconfig /release · /renew', what: 'DHCP-Adresse freigeben und neu anfordern', when: '169.254.x.x (APIPA) oder falsches Netz' },
  { cmd: 'ipconfig /flushdns', what: 'DNS-Cache des Clients leeren', when: 'Veraltete Namensauflösung nach Umzug eines Servers' },
  { cmd: 'ping <ziel>', what: 'Erreichbarkeit per ICMP testen', when: 'Gateway → DNS-Server → Zielserver der Reihe nach' },
  { cmd: 'tracert <ziel>', what: 'Weg der Pakete über die Router anzeigen', when: 'Wo bricht die Verbindung ab?' },
  { cmd: 'nslookup <name> [server]', what: 'DNS-Auflösung testen (optional gegen einen bestimmten Server)', when: 'Interne Namen lösen nicht auf, Internet geht' },
  { cmd: 'Test-NetConnection <ziel> -Port 443', what: 'TCP-Port auf Erreichbarkeit prüfen', when: 'Dienst/Webseite antwortet nicht, Ping geht' },
  { cmd: 'gpupdate /force', what: 'Gruppenrichtlinien sofort neu anwenden', when: 'Fehlendes Netzlaufwerk/Drucker nach Gruppenänderung' },
  { cmd: 'gpresult /r', what: 'Angewendete Richtlinien und Gruppen anzeigen', when: 'Prüfen, ob eine GPO greift' },
  { cmd: 'whoami /groups', what: 'Gruppen im aktuellen Anmeldetoken', when: 'Neue Berechtigung wirkt noch nicht' },
  { cmd: 'klist · klist purge', what: 'Kerberos-Tickets anzeigen bzw. verwerfen', when: 'Gruppenänderung ohne Neuanmeldung übernehmen' },
  { cmd: 'net use', what: 'Verbundene Netzlaufwerke anzeigen / verbinden (net use S: \\\\FS01\\Vertrieb)', when: 'Laufwerk fehlt oder zeigt rotes Kreuz' },
  { cmd: 'net user <name> /domain', what: 'Kontoinformationen aus dem AD (aktiv, gesperrt, Kennwort zuletzt gesetzt)', when: 'Schnellcheck ohne AD-Konsole' },
  { cmd: 'sc query <dienst> · sc start <dienst>', what: 'Dienststatus abfragen bzw. starten', when: 'Druckwarteschlange, DNS-Client & Co.' },
  { cmd: 'Get-Service · Start-Service · Set-Service -StartupType Automatic', what: 'Dienste in PowerShell anzeigen, starten, Starttyp setzen', when: 'Dienst beendet oder deaktiviert' },
  { cmd: 'Get-ADUser <sam> -Properties LockedOut · Unlock-ADAccount <sam>', what: 'Sperrstatus prüfen und Konto entsperren', when: 'Benutzer gesperrt (nach Identitätsprüfung!)' },
  { cmd: 'w32tm /query /status · w32tm /resync', what: 'Zeitquelle prüfen bzw. Uhrzeit neu synchronisieren', when: 'Kerberos-Fehler, Uhr geht > 5 Minuten falsch' },
  { cmd: 'tasklist · taskkill /im <name> /f', what: 'Prozesse anzeigen bzw. beenden', when: 'Hängende Anwendung, hohe CPU-Last' },
  { cmd: 'shutdown /r /t 0', what: 'Sofortiger Neustart', when: 'Nach Updates/Treibern – vorher Benutzer fragen!' },
]

const TOOLS: { title: string; text: string }[] = [
  { title: 'Tickets', text: 'Zentrale Arbeitsliste. Übernehmen, Kategorie/Priorität setzen, Arbeitsnotizen (intern) und Kommentare (an den Benutzer) schreiben, Tipps abrufen, lösen.' },
  { title: 'E-Mail, Chat, Telefon', text: 'Kommunikationskanäle. Anrufe klingeln ca. 90 Sekunden – danach wird ein Rückruf-Ticket angelegt. Im Gespräch kannst du gezielt nachfragen.' },
  { title: 'Active Directory', text: 'Benutzer, Gruppen und Computer verwalten: entsperren, Kennwort zurücksetzen, Gruppen pflegen, BitLocker-/LAPS-Informationen einsehen.' },
  { title: 'Remote-Desktop', text: 'Aufschalten auf Clients – mit Dienste-Konsole, Ereignisanzeige, Netzwerkeinstellungen, Druckern und Terminal. Vorher Einverständnis einholen!' },
  { title: 'Admin-PowerShell', text: 'Terminal auf deinem Arbeitsplatz IT-ADM-01 für AD-Befehle und Netzwerkdiagnose.' },
  { title: 'Infrastruktur', text: 'Server, DNS, DHCP, Freigaben, Druckserver und das Cloud Admin Center – inklusive Ereignisprotokollen der Server.' },
  { title: 'Webbrowser', text: 'Intranet, Weboberflächen der Drucker und externe Seiten – auch zum Prüfen, ob „das Internet geht“.' },
  { title: 'Inventar & Versand', text: 'Geräte ausgeben, zurücknehmen, Status pflegen und Sendungen ins Homeoffice anlegen und verfolgen.' },
  { title: 'Wissensdatenbank', text: 'Anleitungen für Standardfälle. Artikel mit dem Ticket verknüpfen oder eigene Artikel schreiben.' },
]

const FAQ: { q: string; a: ReactNode }[] = [
  { q: 'Kann ich hier etwas kaputt machen?', a: 'Nein. Alles ist simuliert – die Firma, die Personen und alle Systeme sind erfunden. Im Trainer-Modus lässt sich die Welt jederzeit zurücksetzen.' },
  { q: 'Warum habe ich Punkte für Kommunikation verloren, obwohl alles funktioniert?', a: 'Zu einer guten Lösung gehört auch der Mensch: Benutzer informieren, die Lösung bestätigen lassen und – je nach Fall – Identität prüfen bzw. vor dem Fernzugriff fragen. Sieh dir im Bericht die einzelnen Punkte an.' },
  { q: 'Der Anrufer versteht meine Frage nicht.', a: 'Die Anrufer reagieren auf Schlüsselwörter. Frage konkret, z. B. nach „Fehlermeldung“, „Smartphone“, „was hat sich geändert“ oder „Rechnername“. Wurde im Trainer-Modus ein KI-Anrufer eingerichtet, sind freie Formulierungen möglich.' },
  { q: 'Mein Ticket ist gelöst, aber die Technik-Punkte fehlen.', a: 'Bewertet wird der tatsächliche Zustand der Systeme – egal ob per Oberfläche, Terminal oder Browser gelöst. Prüfe, ob die Ursache wirklich behoben ist (z. B. Starttyp eines Dienstes, nicht nur gestartet).' },
  { q: 'Wann sollte ich eskalieren?', a: 'Wenn dir Berechtigungen fehlen, mehrere Benutzer oder Server betroffen sind, ein Sicherheitsvorfall vorliegt oder du nach strukturierter Diagnose nicht weiterkommst. Dokumentiere vorher, was du schon geprüft hast.' },
  { q: 'Darf ich ein Kennwort per Mail oder Chat schicken?', a: 'Nein. Kennwörter und Wiederherstellungsschlüssel werden nur telefonisch nach erfolgreicher Identitätsprüfung mitgeteilt – und nie in Tickets dokumentiert. Das gibt deutliche Abzüge.' },
  { q: 'Was bringen Tipps?', a: 'Tipps helfen, wenn du feststeckst, kosten aber jeweils 2 Punkte. Versuche es erst mit der Wissensdatenbank und gezielten Fragen an den Benutzer.' },
  { q: 'Wo sehe ich meinen Lernfortschritt?', a: 'Unter „Fortschritt“: Verlauf, Kompetenzen nach Kategorie, häufig verpasste Punkte und Abzeichen. Die Ergebnisse lassen sich als CSV exportieren.' },
]

export function HelpView() {
  const world = useStore((s) => s.world)
  const params = useStore((s) => s.ui.params)
  const [active, setActive] = useState(SECTIONS[0].id)
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (params.section) document.getElementById(`hilfe-${params.section}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [params])

  // aktiven Abschnitt im Inhaltsverzeichnis markieren
  useEffect(() => {
    const root = scroller.current?.closest('main') ?? null
    const obs = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (vis[0]) setActive(vis[0].target.id.replace('hilfe-', ''))
      },
      { root, rootMargin: '0px 0px -70% 0px' },
    )
    for (const s of SECTIONS) {
      const el = document.getElementById(`hilfe-${s.id}`)
      if (el) obs.observe(el)
    }
    return () => obs.disconnect()
  }, [])

  const { infra, company, domain } = world
  const deviceOf = (id: string) => infra.printers.find((p) => p.id === id)

  return (
    <div className="flex min-h-full flex-col" ref={scroller}>
      <PageHeader title="Hilfe" subtitle="Leitfäden und Nachschlagewerk für den Service Desk" icon={<HelpCircle size={20} />} />
      <div className="mx-auto flex w-full max-w-6xl gap-6 p-5">
        <nav className="sticky top-4 hidden h-fit w-52 shrink-0 rounded-lg border border-slate-200 bg-white p-2 lg:block" aria-label="Inhalt">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#hilfe-${s.id}`}
              onClick={(e) => {
                e.preventDefault()
                document.getElementById(`hilfe-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
              className={cx('flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm', active === s.id ? 'bg-sky-50 font-medium text-sky-800' : 'text-slate-600 hover:bg-slate-50')}
            >
              {s.icon}
              {s.title}
            </a>
          ))}
        </nav>

        <div className="min-w-0 flex-1 space-y-6">
          <HelpSection id="einfuehrung" title="Einführung">
            <p>
              Willkommen beim <strong>Helpdesk-Trainer</strong>! Du arbeitest als Auszubildende bzw. Auszubildender im IT-Service-Desk der <strong>{company.legalName}</strong> – einem fiktiven Hersteller mit Verwaltung, Vertrieb, Produktion und Logistik am Standort {company.address}. Alle Personen, Systeme und Daten sind frei erfunden.
            </p>
            <p>
              Als <strong>1st-Level-Support</strong> bist du die erste Anlaufstelle für alle IT-Anliegen der Mitarbeitenden: Konten entsperren, Kennwörter zurücksetzen, Drucker- und Netzwerkprobleme lösen, Geräte ausgeben und Zugänge einrichten. Was du nicht selbst lösen darfst oder kannst, gibst du sauber dokumentiert an den 2nd Level oder an Spezialistenteams weiter.
            </p>
            <p>
              Die Simulation reagiert wie eine echte Umgebung: Fehler stecken in Active Directory, auf den Clients oder in der Infrastruktur. Bewertet wird nicht nur, <em>ob</em> du das Problem löst, sondern auch <em>wie</em> – Kommunikation, Sicherheit, Dokumentation und Prozess zählen genauso.
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              <InfoTile label="Service-Desk-Hotline" value={company.helpdeskPhone} />
              <InfoTile label="Service-Desk-Mail" value={company.helpdeskMail} />
              <InfoTile label="Dein Arbeitsplatz" value={`${world.tech.workstation} (Benutzer ${world.tech.sam})`} />
            </div>
          </HelpSection>

          <HelpSection id="ablauf" title="Arbeitsablauf im Service Desk">
            <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {FLOW.map((f, i) => (
                <li key={f.title} className="relative rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-600 text-sm font-bold text-white">{i + 1}</span>
                    <span className="font-semibold text-slate-900">{f.title}</span>
                  </div>
                  <p className="mt-1.5 text-sm text-slate-600">{f.text}</p>
                </li>
              ))}
            </ol>
            <p className="text-sm text-slate-600">
              Faustregel: <strong>Erst verstehen, dann handeln.</strong> Jede Änderung einzeln durchführen und prüfen – so weißt du am Ende genau, was geholfen hat.
            </p>
          </HelpSection>

          <HelpSection id="prioritaet" title="Prioritätsmatrix & SLA">
            <p>
              Die Priorität ergibt sich aus <strong>Auswirkung</strong> (wie viele sind betroffen?) und <strong>Dringlichkeit</strong> (wie schnell muss es gehen, gibt es einen Workaround?).
            </p>
            <div className="overflow-x-auto">
              <table className="w-full max-w-2xl border-separate border-spacing-1 text-sm">
                <thead>
                  <tr>
                    <th className="p-2 text-left text-xs font-medium text-slate-500">Auswirkung ↓ / Dringlichkeit →</th>
                    {[
                      ['1 – hoch', 'Arbeit unmöglich'],
                      ['2 – mittel', 'eingeschränkt'],
                      ['3 – niedrig', 'planbar'],
                    ].map(([a, b]) => (
                      <th key={a} className="p-2 text-center text-xs font-medium text-slate-600">
                        {a}
                        <div className="font-normal text-slate-400">{b}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      [1, '1 – hoch', 'viele / Abteilung / Werk'],
                      [2, '2 – mittel', 'Gruppe / Schlüsselperson'],
                      [3, '3 – niedrig', 'einzelne Person'],
                    ] as const
                  ).map(([impact, label, sub]) => (
                    <tr key={impact}>
                      <th className="p-2 text-left text-xs font-medium text-slate-600">
                        {label}
                        <div className="font-normal text-slate-400">{sub}</div>
                      </th>
                      {([1, 2, 3] as const).map((urgency) => {
                        const p = priorityFrom(impact, urgency)
                        return (
                          <td key={urgency} className={cx('rounded-md p-2 text-center font-semibold', PRIO_TONE[p])}>
                            {p}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className={tableCls}>
                <thead>
                  <tr>
                    <th>Priorität</th>
                    <th>Reaktionszeit</th>
                    <th>Lösungszeit</th>
                    <th>Beispiele</th>
                  </tr>
                </thead>
                <tbody>
                  {PRIORITIES.map((p) => (
                    <tr key={p}>
                      <td>
                        <span className={cx('rounded px-1.5 py-0.5 text-xs font-semibold', PRIO_TONE[p])}>{p}</span>
                      </td>
                      <td className="tabular-nums">{SLA[p].response} Min.</td>
                      <td className="tabular-nums">{SLA[p].resolve} Min.</td>
                      <td className="text-slate-600">{PRIO_EXAMPLE[p]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-500">Hinweis: Die SLA-Zeiten sind für das Training bewusst kurz (Minuten statt Stunden), damit der Zeitdruck spürbar wird.</p>
          </HelpSection>

          <HelpSection id="bewertung" title="Bewertungskriterien">
            <p>Nach dem Lösen eines Trainingstickets erhältst du einen Bewertungsbericht. Die Punkte verteilen sich so:</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Criterion pct={50} title="Technische Lösung" text="Ist das Problem in den Systemen wirklich behoben? Geprüft wird der Zustand der Welt – egal, mit welchem Werkzeug du es gelöst hast." />
              <Criterion pct={20} title="Dokumentation" text="Schlüsselinformationen in den Arbeitsnotizen (Symptom, Ursache, Maßnahme), nachvollziehbare Länge und eine Lösungsbeschreibung beim Abschluss." />
              <Criterion pct={15} title="Kommunikation" text="Benutzer informiert, Lösung bestätigen lassen, Identitätsprüfung vor sensiblen Aktionen bzw. Einverständnis vor dem Fernzugriff." />
              <Criterion pct={15} title="Prozess & Triage" text="Ticket übernommen, Kategorie und Priorität passend, SLA eingehalten, passender Abschlusscode." />
            </div>
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
              <strong>Abzüge</strong> gibt es z. B. für ein Kennwort im Ticket (−5), vertrauliche Daten per Mail/Chat (−8), je genutztem Tipp (−2) und szenariospezifische Fehler wie zu weitreichende Berechtigungen.
            </div>
            <p>
              <strong>Bestanden</strong> ist ein Szenario mit mindestens 50 % <em>und</em> vollständig gelöster Technik. Die Note folgt dem IHK-Notenschlüssel:
            </p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {IHK_SCALE.map((g) => (
                <div key={g.note} className="rounded-md border border-slate-200 bg-white p-2 text-center text-sm">
                  <div className="font-semibold text-slate-900">Note {g.note}</div>
                  <div className="text-xs text-slate-500">{g.grade}</div>
                  <div className="text-xs tabular-nums text-slate-600">
                    {g.from}–{g.to} %
                  </div>
                </div>
              ))}
            </div>
          </HelpSection>

          <HelpSection id="werkzeuge" title="Werkzeuge im Überblick">
            <div className="grid gap-2 sm:grid-cols-2">
              {TOOLS.map((t) => (
                <div key={t.title} className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="font-semibold text-slate-900">{t.title}</div>
                  <p className="mt-0.5 text-sm text-slate-600">{t.text}</p>
                </div>
              ))}
            </div>
          </HelpSection>

          <HelpSection id="befehle" title="Befehls-Spickzettel (Terminal / PowerShell)">
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className={tableCls}>
                <thead>
                  <tr>
                    <th>Befehl</th>
                    <th>Was passiert?</th>
                    <th>Typischer Einsatz</th>
                  </tr>
                </thead>
                <tbody>
                  {COMMANDS.map((c) => (
                    <tr key={c.cmd}>
                      <td>
                        <code className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-xs whitespace-nowrap text-emerald-300">{c.cmd}</code>
                      </td>
                      <td className="text-slate-700">{c.what}</td>
                      <td className="text-slate-500">{c.when}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-500">Die Simulation unterstützt die gängigsten Befehle und Parameter. Ist etwas nicht nachgebildet, erscheint eine entsprechende Meldung – nutze dann die grafischen Werkzeuge.</p>
          </HelpSection>

          <HelpSection id="firma" title="Firmenüberblick">
            <div className="grid gap-2 sm:grid-cols-3">
              <InfoTile label="Unternehmen" value={company.legalName} />
              <InfoTile label="AD-Domäne" value={`${domain.dnsName} (${domain.netbios})`} />
              <InfoTile label="Anmeldenamen (UPN)" value={`vorname.nachname → v.nachname@${domain.upnSuffix}`} />
              <InfoTile label="Kennwortrichtlinie" value={`mind. ${domain.minPasswordLength} Zeichen${domain.complexity ? ', komplex' : ''}, ${domain.maxPasswordAgeDays} Tage gültig`} />
              <InfoTile label="Kontosperre" value={`nach ${domain.lockoutThreshold} Fehlversuchen für ${domain.lockoutDurationMin} Min.`} />
              <InfoTile label="Mitarbeitende" value={`${world.users.filter((u) => !u.isServiceAccount).length} Konten · ${world.computers.length} Computer`} />
            </div>
            <h3 className="mt-2 font-semibold text-slate-900">Netze & VLANs</h3>
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className={tableCls}>
                <thead>
                  <tr>
                    <th>VLAN</th>
                    <th>Netz</th>
                    <th>Subnetz</th>
                    <th>Gateway</th>
                    <th>Beschreibung</th>
                  </tr>
                </thead>
                <tbody>
                  {infra.networks.map((n) => (
                    <tr key={n.subnet}>
                      <td className="tabular-nums">{n.vlan}</td>
                      <td className="font-medium">{n.name}</td>
                      <td className="font-mono text-xs">{n.subnet}</td>
                      <td className="font-mono text-xs">{n.gateway}</td>
                      <td className="text-slate-600">{n.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3 className="mt-2 font-semibold text-slate-900">Server</h3>
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className={tableCls}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>IP-Adresse</th>
                    <th>Rollen</th>
                    <th>Standort</th>
                  </tr>
                </thead>
                <tbody>
                  {infra.servers.map((s) => (
                    <tr key={s.name}>
                      <td className="font-mono text-xs font-medium">{s.name}</td>
                      <td className="font-mono text-xs">{s.ip}</td>
                      <td className="text-slate-700">{s.roles.join(', ')}</td>
                      <td className="text-slate-500">{s.location}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3 className="mt-2 font-semibold text-slate-900">Drucker (Druckserver PRINT01)</h3>
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className={tableCls}>
                <thead>
                  <tr>
                    <th>Freigabe</th>
                    <th>Modell</th>
                    <th>Standort</th>
                    <th>IP-Adresse</th>
                    <th>Verteilt an</th>
                  </tr>
                </thead>
                <tbody>
                  {infra.printQueues.map((q) => {
                    const dev = deviceOf(q.deviceId)
                    return (
                      <tr key={q.name}>
                        <td className="font-mono text-xs">
                          \\{q.server}\{q.name}
                        </td>
                        <td>
                          {dev?.model ?? '–'} {dev?.color && <Badge tone="violet">Farbe</Badge>}
                        </td>
                        <td className="text-slate-600">{q.location}</td>
                        <td className="font-mono text-xs">{dev?.ip ?? '–'}</td>
                        <td className="font-mono text-xs text-slate-500">{q.deployedTo ?? 'manuell'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </HelpSection>

          <HelpSection id="telefon" title="Telefonleitfaden">
            <div className="grid gap-3 md:grid-cols-2">
              <Script title="1. Begrüßung" lines={[`„${company.legalName}, IT-Service-Desk, mein Name ist ${world.tech.name}. Was kann ich für Sie tun?“`, 'Namen des Anrufers notieren und im Gespräch verwenden.']} />
              <Script
                title="2. Identitätsprüfung (bei Kennwort, MFA, BitLocker)"
                lines={['„Bevor ich Ihnen helfen kann, muss ich kurz Ihre Identität prüfen. Nennen Sie mir bitte Ihre Personalnummer und Ihr Geburtsdatum.“', 'Angaben mit dem AD-Eintrag vergleichen. Stimmt etwas nicht: freundlich ablehnen, Rückruf über die hinterlegte Nummer oder Vorgesetzte einbeziehen.']}
              />
              <Script title="3. Problemaufnahme" lines={['Was genau passiert? Wie lautet die Fehlermeldung?', 'Seit wann? Was hat sich davor geändert?', 'Sind Kolleginnen/Kollegen auch betroffen?', 'Rechnername (steht auf dem Aufkleber / im Inventar).']} />
              <Script title="4. Fernzugriff" lines={['„Darf ich mich kurz auf Ihren Rechner aufschalten? Sie sehen dabei alles, was ich mache.“', 'Erst nach einem „Ja“ verbinden – und vertrauliche Fenster schließen lassen.']} />
              <Script title="5. Lösung prüfen" lines={['„Probieren Sie es bitte noch einmal – funktioniert es jetzt wieder?“', 'Erst schließen, wenn der Benutzer bestätigt.']} />
              <Script title="6. Abschluss" lines={['Kurz zusammenfassen, was die Ursache war und was der Benutzer künftig beachten sollte.', '„Gibt es noch etwas, wobei ich helfen kann?“ – Ticketnummer nennen, freundlich verabschieden.']} />
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <strong>Vorsicht Social Engineering:</strong> Druck („Der Chef braucht das sofort!“), ungewöhnliche Wege („Schicken Sie mir das Kennwort an meine private Adresse“) und fehlende Angaben sind Warnsignale. Im Zweifel: Rückruf über die im AD hinterlegte Nummer.
            </div>
          </HelpSection>

          <HelpSection id="tasten" title="Tastenkürzel">
            <ul className="grid gap-2 text-sm sm:grid-cols-2">
              <Shortcut keys={['Esc']} text="Dialog bzw. Bericht schließen" />
              <Shortcut keys={['Enter']} text="Eingabe absenden (Chat, Telefon, Terminal, PIN)" />
              <Shortcut keys={['↑', '↓']} text="Vorherige Befehle im Terminal" />
              <Shortcut keys={['Tab']} text="Zum nächsten Eingabefeld wechseln" />
              <Shortcut keys={['Strg', 'F']} text="Suchen auf der Seite (Browser-Funktion)" />
              <Shortcut keys={['Strg', 'P']} text="Drucken – z. B. ein Versandetikett" />
            </ul>
          </HelpSection>

          <HelpSection id="faq" title="Häufige Fragen">
            <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
              {FAQ.map((f) => (
                <details key={f.q} className="group px-4 py-3 [&_summary]:cursor-pointer">
                  <summary className="flex items-center justify-between gap-2 font-medium text-slate-900">
                    {f.q}
                    <span className="text-slate-400 transition-transform group-open:rotate-90">›</span>
                  </summary>
                  <div className="mt-2 text-sm text-slate-600">{f.a}</div>
                </details>
              ))}
            </div>
          </HelpSection>
        </div>
      </div>
    </div>
  )
}

function HelpSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={`hilfe-${id}`} className="scroll-mt-4">
      <h2 className="mb-3 border-b border-slate-200 pb-1.5 text-lg font-semibold text-slate-900">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-slate-700">{children}</div>
    </section>
  )
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-sm font-medium break-words text-slate-900">{value}</div>
    </div>
  )
}

function Criterion({ pct, title, text }: { pct: number; title: string; text: string }) {
  return (
    <div className="flex gap-3 rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-sky-50 text-sm font-bold text-sky-700 ring-1 ring-sky-200">{pct} %</div>
      <div>
        <div className="font-semibold text-slate-900">{title}</div>
        <p className="text-sm text-slate-600">{text}</p>
      </div>
    </div>
  )
}

function Script({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-1 font-semibold text-slate-900">{title}</div>
      <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </div>
  )
}

function Shortcut({ keys, text }: { keys: string[]; text: string }) {
  return (
    <li className="flex items-center gap-3 rounded-md border border-slate-200 bg-white px-3 py-2">
      <span className="flex shrink-0 items-center gap-1">
        {keys.map((k, i) => (
          <span key={k} className="flex items-center gap-1">
            {i > 0 && <span className="text-xs text-slate-400">+</span>}
            <Kbd>{k}</Kbd>
          </span>
        ))}
      </span>
      <span className="text-slate-700">{text}</span>
    </li>
  )
}
