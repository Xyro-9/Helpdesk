// Regelbasierter "Anrufer": simuliert Antworten von Benutzern in Telefonat, Chat und E-Mail.
// Erkennt Absichten des Azubis (Begrüßung, Identitätsprüfung, Rechnername, "funktioniert es jetzt?" …)
// und antwortet mit Fakten aus dem Szenario bzw. dem Weltzustand.

import { A } from '../actions'
import { findUser, primaryComputerOf } from '../ops/ad'
import type { Ticket, World } from '../types'
import { containsAny, fmtDate, normalize } from '../util'
import { technicalStatus } from './engine'
import type { Scenario } from './types'

export interface CallerAction {
  type: string
  detail?: string
}

export interface CallerReply {
  text: string
  actions: CallerAction[]
  /** Benutzer verabschiedet sich */
  goodbye?: boolean
}

const I = {
  identity: ['personalnummer', 'personal-nr', 'personalnr', 'mitarbeiternummer', 'mitarbeiter-nr', 'mitarbeiter-id', 'mitarbeiterid', 'geburtsdatum', 'geburtstag', 'geboren', 'identität', 'verifizieren', 'verifikation', 'sicherheitsfrage', 'legitimieren'],
  confirm: ['funktioniert es', 'funktioniert das', 'geht es jetzt', 'geht es wieder', 'geht das jetzt', 'klappt es', 'klappt das', 'jetzt wieder', 'testen sie', 'probieren sie', 'versuchen sie', 'nochmal versuchen', 'noch einmal versuchen', 'erneut versuchen', 'jetzt gehen', 'können sie es', 'koennen sie es', 'ist es behoben', 'problem gelöst', 'problem geloest', 'funktioniert alles'],
  computer: ['rechnername', 'computername', 'pc-name', 'pcname', 'hostname', 'gerätename', 'geraetename', 'inventarnummer', 'aufkleber', 'welcher rechner', 'welcher pc', 'welches gerät', 'welches geraet', 'welchen pc', 'welchen rechner'],
  remote: ['aufschalten', 'fernwartung', 'remote', 'verbinden darf', 'darf ich mich', 'auf ihren pc', 'auf ihren rechner', 'zugriff auf ihren', 'fernzugriff', 'bildschirm übernehmen', 'bildschirm uebernehmen', 'teamviewer', 'rdp'],
  greeting: ['hallo', 'guten tag', 'guten morgen', 'moin', 'servus', 'grüß', 'gruess', 'service desk', 'servicedesk', 'helpdesk', 'it-support', 'it support', 'was kann ich', 'wie kann ich', 'womit kann ich'],
  restart: ['neu gestartet', 'neustart', 'neu starten', 'neugestartet', 'rebootet', 'ausgeschaltet'],
  error: ['fehlermeldung', 'meldung', 'fehlercode', 'was steht', 'was genau', 'screenshot', 'was passiert'],
  since: ['seit wann', 'wann trat', 'wann ist', 'seit heute', 'seit gestern', 'zum ersten mal', 'erstmals'],
  others: ['kollegen', 'andere auch', 'nur bei ihnen', 'mehrere', 'betroffen', 'ganze abteilung'],
  location: ['wo sitzen', 'standort', 'welches büro', 'welches buero', 'raum', 'homeoffice', 'home office', 'zuhause', 'zu hause'],
  phone: ['rückrufnummer', 'rueckrufnummer', 'telefonnummer', 'durchwahl', 'erreichbar'],
  bye: ['tschüss', 'tschuess', 'auf wiederhören', 'auf wiederhoeren', 'wiederhören', 'schönen tag', 'schoenen tag', 'ciao', 'bis dann', 'auf wiedersehen'],
  thanks: ['danke', 'vielen dank'],
  wait: ['einen moment', 'kurz warten', 'moment bitte', 'ich schaue', 'ich prüfe', 'ich pruefe', 'ich kümmere', 'ich kuemmere', 'bleiben sie dran'],
  ticket: ['ticketnummer', 'ticket-nummer', 'vorgangsnummer'],
}

const has = (msg: string, list: string[]) => containsAny(msg, list)

function pick<T>(arr: T[], seed: string): T {
  let h = 0
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) | 0
  return arr[Math.abs(h) % arr.length]
}

/** Erzeugt die Antwort des Benutzers auf eine Nachricht des Azubis */
export function callerReply(w: World, opts: { requester: string; message: string; channel: 'Telefon' | 'Chat' | 'E-Mail'; ticket?: Ticket; scenario?: Scenario; turn: number }): CallerReply {
  const { message, scenario, ticket, channel } = opts
  const u = findUser(w, opts.requester)
  const msg = message.trim()
  const actions: CallerAction[] = []
  const parts: string[] = []
  const first = u?.givenName ?? 'ich'

  // Kennwort im Klartext übermittelt?
  if (u && u.password.length >= 6 && msg.includes(u.password)) actions.push({ type: A.secretShared, detail: channel })
  // BitLocker-Schlüssel übermittelt?
  const pc = u ? primaryComputerOf(w, u.sam) : undefined
  if (pc?.bitlockerKeys.some((k) => msg.replace(/\s/g, '').includes(k.recoveryPassword.replace(/-/g, '').slice(0, 12)) || msg.includes(k.recoveryPassword.slice(0, 13)))) actions.push({ type: A.secretShared, detail: channel === 'Telefon' ? 'Telefon' : channel })

  if (has(msg, I.bye)) {
    return { text: pick(['Danke Ihnen, tschüss!', 'Alles klar, vielen Dank und einen schönen Tag noch!', 'Super, danke. Auf Wiederhören!'], msg), actions, goodbye: true }
  }

  // Identitätsprüfung
  if (has(msg, I.identity)) {
    actions.push({ type: A.identityAsked })
    if (scenario?.caller.identityAnswer) parts.push(scenario.caller.identityAnswer)
    else if (u) {
      actions.push({ type: A.identityConfirmed })
      const wantsBirth = has(msg, ['geburt', 'geboren'])
      const wantsId = has(msg, ['personal', 'mitarbeiter', 'identität', 'verifiz', 'legitim', 'sicherheitsfrage'])
      const bits: string[] = []
      if (wantsId || !wantsBirth) bits.push(`meine Personalnummer ist ${u.employeeId}`)
      if (wantsBirth || !wantsId) bits.push(`geboren bin ich am ${fmtDate(u.birthDate + 'T12:00:00')}`)
      parts.push(`Klar, ${bits.join(' und ')}.`)
    }
  }

  // Fernzugriff
  if (has(msg, I.remote)) {
    actions.push({ type: A.remoteConsent })
    parts.push(pick(['Ja, gerne, schalten Sie sich ruhig auf.', 'Ja, kein Problem – ich schaue zu.', 'Ja, machen Sie ruhig. Muss ich irgendwas klicken?'], msg))
  }

  // Rechnername
  if (has(msg, I.computer)) {
    const asset = pc ? w.assets.find((a) => a.hostname === pc.name) : undefined
    parts.push(pc ? `Auf dem Aufkleber steht ${pc.name}${asset ? `, Inventarnummer ${asset.tag}` : ''}.` : 'Hm, da steht nichts drauf, glaube ich.')
  }

  // Szenario-Fakten
  let factHit = false
  for (const f of scenario?.caller.facts ?? []) {
    if (has(msg, f.keywords)) {
      parts.push(f.answer)
      if (f.logAs) actions.push({ type: f.logAs })
      factHit = true
    }
  }

  // Bestätigung "funktioniert es jetzt?"
  if (has(msg, I.confirm)) {
    actions.push({ type: A.confirmAsked })
    if (scenario && ticket?.scenarioCtx) {
      const st = technicalStatus(w, ticket, scenario)
      if (st.passed) {
        actions.push({ type: A.userConfirmedFix })
        parts.push(scenario.caller.resolvedReply ?? 'Ja! Jetzt funktioniert es wieder. Super, vielen Dank!')
      } else {
        const open = st.items.filter((i) => !i.ok).length
        parts.push(scenario.caller.unresolvedReply ?? (open === st.items.length ? 'Nein, leider immer noch genau wie vorher.' : 'Hm, es hat sich etwas getan, aber ganz geht es noch nicht.'))
      }
    } else parts.push('Ja, sieht gut aus.')
  }

  if (!parts.length || (!factHit && parts.length === 0)) {
    if (has(msg, I.greeting) && opts.turn <= 1) {
      parts.push(scenario?.caller.intro ?? `Hallo, hier ist ${u?.displayName ?? 'ein Kollege'} aus ${u?.department || 'der Firma'}. Ich hätte da eine Frage.`)
    } else if (has(msg, I.restart)) {
      parts.push(pick(['Ja, neu gestartet habe ich schon, das hat nichts gebracht.', 'Ich habe den Rechner heute früh schon neu gestartet, leider ohne Erfolg.'], msg))
    } else if (has(msg, I.error)) {
      parts.push(pick(scenario?.caller.fallback ?? ['Eine genaue Meldung habe ich mir leider nicht notiert.'], msg))
    } else if (has(msg, I.since)) {
      parts.push(pick(['Seit heute Morgen.', 'Das fing so gegen halb neun an.', 'Gestern ging es noch, seit heute nicht mehr.'], msg))
    } else if (has(msg, I.others)) {
      parts.push(pick(['Soweit ich weiß, nur bei mir.', 'Ich habe die Kollegen nicht gefragt – ich glaube, bei denen geht es.'], msg))
    } else if (has(msg, I.location)) {
      parts.push(u?.homeOffice ? `Ich bin heute im Homeoffice in ${u.homeAddress?.city ?? 'meiner Wohnung'}.` : `Ich sitze im ${u?.office ?? 'Büro'}.`)
    } else if (has(msg, I.phone)) {
      parts.push(`Sie erreichen mich unter ${u?.phone ?? 'meiner Durchwahl'}${u?.mobile ? ` oder mobil unter ${u.mobile}` : ''}.`)
    } else if (has(msg, I.wait)) {
      parts.push(pick(['Okay, ich warte.', 'Alles klar, ich bleibe dran.', 'Ja, kein Problem.'], msg))
    } else if (has(msg, I.ticket)) {
      parts.push('Ah, gut, die notiere ich mir.')
    } else if (has(msg, I.thanks)) {
      parts.push('Gerne!')
    } else if (has(msg, ['kennwort', 'passwort', 'schlüssel', 'schluessel', 'code']) && has(msg, ['lautet', 'ist jetzt', 'neues', 'temporär', 'temporaer', 'initial'])) {
      parts.push(pick(['Okay, ich hab es mir notiert – muss ich das dann gleich ändern?', 'Moment, ich schreibe mit … ja, hab ich.'], msg))
    } else if (opts.turn === 0 && scenario) {
      parts.push(scenario.caller.intro)
    } else {
      parts.push(pick(scenario?.caller.fallback ?? [`Das weiß ich leider nicht so genau, ${first === 'ich' ? '' : 'ehrlich gesagt'}.`, 'Wie meinen Sie das?', 'Da müsste ich passen, ich kenne mich mit Technik nicht so aus.'], msg + opts.turn))
    }
  }
  return { text: parts.join(' '), actions }
}

/** Kurzbeschreibung für den optionalen KI-Modus (System-Prompt) */
export function callerSystemPrompt(w: World, requester: string, scenario?: Scenario) {
  const u = findUser(w, requester)
  const pc = u ? primaryComputerOf(w, u.sam) : undefined
  const facts = (scenario?.caller.facts ?? []).map((f) => `- Wenn nach ${f.keywords.slice(0, 3).join('/')} gefragt: ${f.answer}`).join('\n')
  return `Du spielst in einer IT-Helpdesk-Trainingssimulation einen Mitarbeiter der fiktiven Firma Musterwerk AG, der beim IT-Service-Desk anruft bzw. schreibt.
Antworte immer auf Deutsch, kurz (1-3 Sätze), natürlich und in der Rolle. Du bist kein Techniker und kennst keine Fachbegriffe, außer du wirst danach gefragt.
Verrate niemals die Lösung. Beschreibe nur Symptome und beantworte Fragen.

Deine Rolle: ${u?.displayName ?? requester}, ${u?.title ?? ''}, Abteilung ${u?.department ?? ''}, ${u?.homeOffice ? 'im Homeoffice' : 'im Büro ' + (u?.office ?? '')}.
Stimmung: ${scenario?.caller.mood ?? 'freundlich'}.
Dein Rechner: ${pc?.name ?? 'unbekannt'}.
Identitätsdaten (nur nennen, wenn danach gefragt): ${scenario?.caller.identityAnswer ?? `Personalnummer ${u?.employeeId}, Geburtsdatum ${u ? fmtDate(u.birthDate + 'T12:00:00') : ''}`}.
${scenario ? `Dein Anliegen: ${scenario.caller.intro}\nWeitere Fakten:\n${facts}` : ''}
${scenario?.caller.persona ?? ''}`
}

export const normalizeForMatch = normalize
