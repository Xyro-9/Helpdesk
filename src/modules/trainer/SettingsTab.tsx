// Trainer-Modus · Einstellungen

import { Bot, Eye, EyeOff, KeyRound, Mic, Save, UserRound, Volume2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { DEFAULT_SETTINGS, useStore } from '@/core/store'
import { Button, Card, Checkbox, Field, Input } from '@/ui'

const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window
const sttSupported = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

export function SettingsTab() {
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const toast = useStore((s) => s.toast)
  const [name, setName] = useState(settings.traineeName)
  const [pin1, setPin1] = useState('')
  const [pin2, setPin2] = useState('')
  const [pinError, setPinError] = useState('')
  const [ai, setAi] = useState(settings.ai)
  const [showKey, setShowKey] = useState(false)

  const saveName = () => {
    const n = name.trim()
    if (n.length < 2) return toast('Bitte einen Namen mit mindestens 2 Zeichen eingeben.', 'error')
    updateSettings({ traineeName: n })
    toast('Name übernommen.', 'success')
  }

  const savePin = () => {
    if (!/^\d{4,8}$/.test(pin1)) return setPinError('Die PIN muss aus 4 bis 8 Ziffern bestehen.')
    if (pin1 !== pin2) return setPinError('Die beiden Eingaben stimmen nicht überein.')
    updateSettings({ trainerPin: pin1 })
    setPin1('')
    setPin2('')
    setPinError('')
    toast('PIN geändert.', 'success')
  }

  const saveAi = () => {
    updateSettings({ ai: { enabled: ai.enabled, apiKey: ai.apiKey.trim(), model: ai.model.trim() || DEFAULT_SETTINGS.ai.model } })
    toast('Einstellungen für den KI-Anrufer gespeichert.', 'success')
  }

  const aiDirty = ai.enabled !== settings.ai.enabled || ai.apiKey !== settings.ai.apiKey || ai.model !== settings.ai.model

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card
        title={
          <span className="flex items-center gap-2">
            <UserRound size={16} /> Azubi & Zugang
          </span>
        }
      >
        <div className="space-y-4">
          <Field label="Name des Azubis" hint="Erscheint in der Kopfzeile, in Tickets und Mails der simulierten Benutzer.">
            <div className="flex gap-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveName()} />
              <Button onClick={saveName} disabled={name.trim() === settings.traineeName}>
                Übernehmen
              </Button>
            </div>
          </Field>
          <div>
            <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-600">
              <KeyRound size={13} /> Trainer-PIN ändern
            </div>
            <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <Input type="password" inputMode="numeric" autoComplete="new-password" placeholder="Neue PIN" value={pin1} onChange={(e) => setPin1(e.target.value)} />
              <Input type="password" inputMode="numeric" autoComplete="new-password" placeholder="Wiederholen" value={pin2} onChange={(e) => setPin2(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && savePin()} />
              <Button onClick={savePin} disabled={!pin1}>
                Ändern
              </Button>
            </div>
            {pinError && <p className="mt-1 text-xs text-rose-700">{pinError}</p>}
            <p className="mt-1 text-xs text-slate-500">Standard-PIN ist 1234 – bitte ändern, damit Azubis die Musterlösungen nicht selbst freischalten.</p>
          </div>
        </div>
      </Card>

      <Card title="Lernhilfen & Bewertung">
        <div className="space-y-3">
          <Setting label="Tipps erlauben" hint="Azubis können im Ticket Tipps abrufen (kostet jeweils 2 Punkte).">
            <Checkbox label="aktiv" checked={settings.hintsEnabled} onChange={(v) => updateSettings({ hintsEnabled: v })} />
          </Setting>
          <Setting label="Musterlösung anzeigen" hint="Nach dem Abschluss im Bewertungsbericht (aufklappbar).">
            <Checkbox label="aktiv" checked={settings.showSolution} onChange={(v) => updateSettings({ showSolution: v })} />
          </Setting>
          <Setting label="„Zwischenstand prüfen“ erlauben" hint="Zeigt im Ticket, welche technischen Prüfungen schon erfüllt sind. Für Einsteiger hilfreich, für Prüfungssimulation abschalten.">
            <Checkbox label="aktiv" checked={settings.allowPreCheck} onChange={(v) => updateSettings({ allowPreCheck: v })} />
          </Setting>
          <Setting label="Antwortverzögerung der Benutzer" hint="Wie lange simulierte Benutzer im Chat/Telefon „tippen“ bzw. überlegen.">
            <div className="flex items-center gap-3">
              <input type="range" min={0} max={5000} step={100} value={settings.replyDelayMs} onChange={(e) => updateSettings({ replyDelayMs: Number(e.target.value) })} className="w-48 accent-sky-600" aria-label="Antwortverzögerung" />
              <span className="w-16 text-sm tabular-nums text-slate-700">{(settings.replyDelayMs / 1000).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s</span>
            </div>
          </Setting>
        </div>
      </Card>

      <Card
        title={
          <span className="flex items-center gap-2">
            <Volume2 size={16} /> Sprache
          </span>
        }
      >
        <div className="space-y-3">
          <Setting label="Sprachausgabe für Anrufer" hint={ttsSupported ? 'Anrufer sprechen ihre Antworten (Sprachsynthese des Browsers).' : 'Dieser Browser unterstützt keine Sprachausgabe.'}>
            <Checkbox label="aktiv" checked={settings.tts} onChange={(v) => updateSettings({ tts: v })} disabled={!ttsSupported} />
          </Setting>
          <Setting
            label={
              <span className="inline-flex items-center gap-1">
                <Mic size={13} /> Spracheingabe für den Azubi
              </span>
            }
            hint={sttSupported ? 'Antworten im Telefonat per Mikrofon diktieren.' : 'Dieser Browser unterstützt keine Spracherkennung.'}
          >
            <Checkbox label="aktiv" checked={settings.stt} onChange={(v) => updateSettings({ stt: v })} disabled={!sttSupported} />
          </Setting>
        </div>
      </Card>

      <Card
        title={
          <span className="flex items-center gap-2">
            <Bot size={16} /> KI-Anrufer (optional)
          </span>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-slate-500">Statt der regelbasierten Antworten können Anrufer frei formuliert über ein Sprachmodell antworten. Ohne Schlüssel bleibt der regelbasierte Modus aktiv.</p>
          <Checkbox label="KI-Anrufer aktivieren" checked={ai.enabled} onChange={(v) => setAi((cur) => ({ ...cur, enabled: v }))} />
          <Field label="API-Schlüssel" hint="Wird nur lokal in diesem Browser gespeichert und beim Export nicht mitgegeben.">
            <div className="flex gap-2">
              <Input type={showKey ? 'text' : 'password'} value={ai.apiKey} onChange={(e) => setAi((cur) => ({ ...cur, apiKey: e.target.value }))} autoComplete="off" spellCheck={false} className="font-mono" placeholder="sk-…" />
              <Button variant="ghost" onClick={() => setShowKey((v) => !v)} title={showKey ? 'Verbergen' : 'Anzeigen'} icon={showKey ? <EyeOff size={15} /> : <Eye size={15} />} />
            </div>
          </Field>
          <Field label="Modell-ID" hint={`Standard: ${DEFAULT_SETTINGS.ai.model}`}>
            <Input value={ai.model} onChange={(e) => setAi((cur) => ({ ...cur, model: e.target.value }))} className="font-mono" spellCheck={false} />
          </Field>
          {ai.enabled && !ai.apiKey.trim() && <p className="text-xs text-amber-700">Ohne API-Schlüssel wird der KI-Modus nicht verwendet.</p>}
          <div className="flex justify-end">
            <Button variant="primary" icon={<Save size={15} />} onClick={saveAi} disabled={!aiDirty}>
              Speichern
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

function Setting({ label, hint, children }: { label: ReactNode; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-slate-800">{label}</div>
        {hint && <div className="text-xs text-slate-500">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}
