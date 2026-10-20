// Trainer-Modus · Szenario-Editor für eigene Szenarien (CustomScenarioDef aus Fehlerbausteinen)

import { ArrowLeft, Copy, FlaskConical, ListChecks, Pencil, Play, Plus, Puzzle, Save, Trash2, X } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { FAULTS, faultByType, type FaultParam } from '@/content/faults'
import { CATEGORIES, PRIORITIES } from '@/core/scenarios/engine'
import type { CustomScenarioDef } from '@/core/scenarios/types'
import { clientServices } from '@/core/seed/endpoints'
import { useStore } from '@/core/store'
import type { Channel, Priority, TicketCategory } from '@/core/types'
import { fmtDateTime, nowIso } from '@/core/util'
import { launchScenario } from '@/modules/training/launch'
import { ChannelLabel, CHANNELS, DIFFICULTY_LABEL, Stars } from '@/modules/training/meta'
import { Badge, Button, Card, Checkbox, EmptyState, Field, IconButton, Input, Modal, Select, Textarea } from '@/ui'

const blank = (): CustomScenarioDef => ({
  id: `custom-${Date.now()}`,
  title: '',
  summary: '',
  difficulty: 1,
  category: 'Konto & Zugriff',
  requester: '',
  channel: 'Telefon',
  ticketTitle: '',
  ticketDescription: '',
  priority: 'P3 – Mittel',
  identityRequired: false,
  faults: [],
  callerIntro: '',
  callerFacts: [],
  workNoteKeywords: [
    { label: 'Symptom', any: '' },
    { label: 'Ursache', any: '' },
    { label: 'Lösung', any: '' },
  ],
  hints: [],
  solution: [],
  created: nowIso(),
})

export function ScenarioEditorTab() {
  const custom = useStore((s) => s.customScenarios)
  const deleteCustomScenario = useStore((s) => s.deleteCustomScenario)
  const toast = useStore((s) => s.toast)
  const [draft, setDraft] = useState<CustomScenarioDef | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<CustomScenarioDef | null>(null)

  if (draft) {
    return (
      <ScenarioForm
        key={draft.id}
        initial={draft}
        isNew={isNew}
        onClose={() => {
          setDraft(null)
          setIsNew(false)
        }}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
        <div className="flex items-start gap-2">
          <Puzzle size={18} className="mt-0.5 shrink-0" />
          <div>
            <strong>Eigene Szenarien</strong> werden aus Fehlerbausteinen zusammengesetzt: Jeder Baustein baut beim Start einen Fehler in die Welt ein und bringt die passende technische Prüfung für die Bewertung mit. Dokumentation, Kommunikation und Prozess werden wie bei allen Szenarien bewertet.
          </div>
        </div>
        <Button
          variant="primary"
          icon={<Plus size={16} />}
          onClick={() => {
            setDraft(blank())
            setIsNew(true)
          }}
        >
          Neues Szenario
        </Button>
      </div>

      {custom.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {custom.map((c) => (
            <Card key={c.id} bodyClassName="p-4">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-slate-900">{c.title || 'Ohne Titel'}</h3>
                    <Stars value={c.difficulty} size={12} />
                  </div>
                  <p className="mt-0.5 text-sm text-slate-600">{c.summary || <span className="italic text-slate-400">Keine Zusammenfassung</span>}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <ChannelLabel channel={c.channel} />
                    <span>· {c.category}</span>
                    <span>· Anforderer: {c.requester || '–'}</span>
                    <span>· {c.faults.length} Fehlerbaustein(e)</span>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-400">
                    {c.id} · erstellt {fmtDateTime(c.created)}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
                <Button size="sm" icon={<Pencil size={13} />} onClick={() => setDraft(c)}>
                  Bearbeiten
                </Button>
                <Button
                  size="sm"
                  icon={<Copy size={13} />}
                  onClick={() => {
                    setDraft({ ...structuredClone(c), id: `custom-${Date.now()}`, title: `${c.title} (Kopie)`, created: nowIso() })
                    setIsNew(true)
                  }}
                >
                  Duplizieren
                </Button>
                <Button size="sm" icon={<Play size={13} />} onClick={() => launchScenario(c.id)} disabled={!c.faults.length}>
                  Testen
                </Button>
                <span className="flex-1" />
                <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} className="text-rose-700" onClick={() => setConfirmDelete(c)}>
                  Löschen
                </Button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState icon={<FlaskConical size={40} />} title="Noch keine eigenen Szenarien">
            Erstelle ein Szenario, das zu euren Ausbildungsinhalten passt – z. B. „Kennwort abgelaufen nach Elternzeit“ oder „Netzlaufwerk fehlt nach Abteilungswechsel“.
          </EmptyState>
        </Card>
      )}

      {confirmDelete && (
        <Modal
          title="Szenario löschen?"
          onClose={() => setConfirmDelete(null)}
          size="sm"
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
                Abbrechen
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  deleteCustomScenario(confirmDelete.id)
                  toast(`Szenario „${confirmDelete.title}“ gelöscht.`, 'info')
                  setConfirmDelete(null)
                }}
              >
                Löschen
              </Button>
            </>
          }
        >
          <p className="text-sm text-slate-700">„{confirmDelete.title}“ wird gelöscht. Bereits erzielte Ergebnisse bleiben erhalten, können aber nicht mehr wiederholt werden.</p>
        </Modal>
      )}
    </div>
  )
}

// ─────────────── Formular ───────────────

function Section({ title, icon, children, hint }: { title: string; icon?: ReactNode; children: ReactNode; hint?: string }) {
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          {icon}
          {title}
        </span>
      }
    >
      {hint && <p className="-mt-1 mb-3 text-xs text-slate-500">{hint}</p>}
      {children}
    </Card>
  )
}

function ScenarioForm({ initial, isNew, onClose }: { initial: CustomScenarioDef; isNew: boolean; onClose: () => void }) {
  const users = useStore((s) => s.world.users)
  const computers = useStore((s) => s.world.computers)
  const groups = useStore((s) => s.world.groups)
  const skus = useStore((s) => s.world.cloud.skus)
  const saveCustomScenario = useStore((s) => s.saveCustomScenario)
  const toast = useStore((s) => s.toast)
  const [d, setD] = useState<CustomScenarioDef>(initial)
  const [addType, setAddType] = useState(FAULTS[0]?.type ?? '')
  const [errors, setErrors] = useState<string[]>([])
  const [saved, setSaved] = useState(!isNew)

  const people = useMemo(() => users.filter((u) => !u.isServiceAccount && u.sam !== 'azubi').sort((a, b) => a.surname.localeCompare(b.surname, 'de')), [users])
  const clients = useMemo(() => computers.filter((c) => !c.ou.includes('OU=Server') && !c.ou.includes('Domain Controllers')).sort((a, b) => a.name.localeCompare(b.name)), [computers])
  const services = useMemo(() => clientServices(true).sort((a, b) => a.displayName.localeCompare(b.displayName, 'de')), [])
  const sortedGroups = useMemo(() => [...groups].sort((a, b) => Number(!!a.builtin) - Number(!!b.builtin) || a.name.localeCompare(b.name)), [groups])
  const requester = users.find((u) => u.sam === d.requester)
  const requesterPc = requester ? computers.find((c) => c.managedBy === requester.sam) : undefined

  const set = <K extends keyof CustomScenarioDef>(k: K, v: CustomScenarioDef[K]) => {
    setD((cur) => ({ ...cur, [k]: v }))
    setSaved(false)
  }

  const checkLabels = useMemo(
    () =>
      d.faults.flatMap((f) => {
        const def = faultByType(f.type)
        if (!def) return []
        try {
          return def.checks(f.params, d.requester || 'anforderer').map((c) => ({ label: c.label, points: c.points }))
        } catch {
          return []
        }
      }),
    [d.faults, d.requester],
  )

  const validate = (): string[] => {
    const e: string[] = []
    if (d.title.trim().length < 4) e.push('Titel fehlt (mind. 4 Zeichen).')
    if (!d.requester) e.push('Bitte einen Anforderer (AD-Benutzer) auswählen.')
    if (!d.ticketTitle.trim()) e.push('Ticket-Titel fehlt.')
    if ((d.channel === 'E-Mail' || d.channel === 'Portal') && d.ticketDescription.trim().length < 10) e.push('Für E-Mail/Portal wird ein Ticket-Text benötigt (das schreibt der Benutzer).')
    if ((d.channel === 'Telefon' || d.channel === 'Chat') && d.callerIntro.trim().length < 10) e.push('Für Telefon/Chat wird eine Anrufer-Einleitung benötigt (erster Satz des Benutzers).')
    if (!d.faults.length) e.push('Mindestens einen Fehlerbaustein hinzufügen – sonst gibt es nichts zu lösen.')
    d.faults.forEach((f, i) => {
      const def = faultByType(f.type)
      if (!def) return e.push(`Baustein ${i + 1}: unbekannter Typ „${f.type}“.`)
      for (const p of def.params) if (!p.optional && !f.params[p.name]?.trim()) e.push(`Baustein ${i + 1} (${def.label}): „${p.label}“ fehlt.`)
    })
    if (!d.workNoteKeywords.some((k) => k.any.trim())) e.push('Mindestens ein Doku-Schlüsselwort angeben (bewertet die Arbeitsnotizen).')
    return e
  }

  const cleaned = (): CustomScenarioDef => ({
    ...d,
    title: d.title.trim(),
    summary: d.summary.trim(),
    ticketTitle: d.ticketTitle.trim(),
    ticketDescription: d.ticketDescription.trim() || d.callerIntro.trim(),
    callerIntro: d.callerIntro.trim() || d.ticketDescription.trim(),
    callerFacts: d.callerFacts.filter((f) => f.keywords.trim() && f.answer.trim()).map((f) => ({ keywords: f.keywords.trim(), answer: f.answer.trim() })),
    workNoteKeywords: d.workNoteKeywords.filter((k) => k.any.trim()).map((k) => ({ label: k.label.trim() || 'Schlüsselwort', any: k.any.trim() })),
    hints: d.hints.map((h) => h.trim()).filter(Boolean),
    solution: d.solution.map((h) => h.trim()).filter(Boolean),
    faults: d.faults.map((f) => ({ type: f.type, params: Object.fromEntries(Object.entries(f.params).filter(([, v]) => v.trim())) })),
  })

  const save = (andTest = false) => {
    const e = validate()
    setErrors(e)
    if (e.length) {
      toast('Bitte die markierten Punkte ergänzen.', 'error')
      return
    }
    const def = cleaned()
    saveCustomScenario(def)
    setD(def)
    setSaved(true)
    toast(`Szenario „${def.title}“ gespeichert.`, 'success')
    if (andTest) launchScenario(def.id)
  }

  const updateFault = (i: number, name: string, value: string) => {
    set(
      'faults',
      d.faults.map((f, j) => (j === i ? { ...f, params: { ...f.params, [name]: value } } : f)),
    )
  }

  const paramInput = (p: FaultParam, value: string, onChange: (v: string) => void) => {
    const def = p.optional ? (p.kind === 'computer' ? `(PC des Anforderers${requesterPc ? `: ${requesterPc.name}` : ''})` : '(Anforderer)') : '– bitte wählen –'
    switch (p.kind) {
      case 'user':
        return (
          <Select value={value} onChange={(e) => onChange(e.target.value)}>
            <option value="">{def}</option>
            {people.map((u) => (
              <option key={u.sam} value={u.sam}>
                {u.surname}, {u.givenName} ({u.sam})
              </option>
            ))}
          </Select>
        )
      case 'computer':
        return (
          <Select value={value} onChange={(e) => onChange(e.target.value)}>
            <option value="">{def}</option>
            {clients.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
                {c.managedBy ? ` – ${c.managedBy}` : ''}
              </option>
            ))}
          </Select>
        )
      case 'group':
        return (
          <Select value={value} onChange={(e) => onChange(e.target.value)}>
            <option value="">{def}</option>
            {sortedGroups.map((g) => (
              <option key={g.name} value={g.name}>
                {g.name}
                {g.description ? ` – ${g.description.slice(0, 40)}` : ''}
              </option>
            ))}
          </Select>
        )
      case 'service':
        return (
          <Select value={value} onChange={(e) => onChange(e.target.value)}>
            <option value="">{def}</option>
            {services.map((s) => (
              <option key={s.name} value={s.name}>
                {s.displayName} ({s.name})
              </option>
            ))}
          </Select>
        )
      case 'sku':
        return (
          <Select value={value} onChange={(e) => onChange(e.target.value)}>
            <option value="">{def}</option>
            {skus.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        )
      default:
        return <Input value={value} onChange={(e) => onChange(e.target.value)} />
    }
  }

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 -mx-5 flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-100/95 px-5 py-2 backdrop-blur">
        <Button variant="ghost" icon={<ArrowLeft size={15} />} onClick={onClose}>
          Zur Liste
        </Button>
        <div className="min-w-0 flex-1 truncate text-sm text-slate-600">
          {isNew && !saved ? 'Neues Szenario' : 'Szenario bearbeiten'}: <strong className="text-slate-900">{d.title || 'Ohne Titel'}</strong>
          {!saved && <Badge tone="amber" className="ml-2">ungespeichert</Badge>}
        </div>
        <Button icon={<Save size={15} />} onClick={() => save(false)}>
          Speichern
        </Button>
        <Button variant="primary" icon={<Play size={15} />} onClick={() => save(true)}>
          Speichern & testen
        </Button>
      </div>

      {errors.length > 0 && (
        <div className="rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-900 ring-1 ring-rose-200">
          <div className="mb-1 font-semibold">Bitte ergänzen:</div>
          <ul className="list-disc space-y-0.5 pl-5">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Katalog">
          <div className="space-y-3">
            <Field label="Titel *">
              <Input value={d.title} onChange={(e) => set('title', e.target.value)} placeholder="z. B. Kennwort abgelaufen nach Elternzeit" />
            </Field>
            <Field label="Zusammenfassung (was wird trainiert?)">
              <Textarea rows={2} value={d.summary} onChange={(e) => set('summary', e.target.value)} />
            </Field>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Schwierigkeit">
                <Select value={d.difficulty} onChange={(e) => set('difficulty', Number(e.target.value) as 1 | 2 | 3)}>
                  {([1, 2, 3] as const).map((n) => (
                    <option key={n} value={n}>
                      {n} – {DIFFICULTY_LABEL[n]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Kategorie (erwartet)">
                <Select value={d.category} onChange={(e) => set('category', e.target.value as TicketCategory)}>
                  {CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Priorität (erwartet)">
                <Select value={d.priority ?? ''} onChange={(e) => set('priority', (e.target.value || undefined) as Priority | undefined)}>
                  <option value="">– nicht bewerten –</option>
                  {PRIORITIES.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </Select>
              </Field>
            </div>
          </div>
        </Section>

        <Section title="Anforderer & Kanal">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Anforderer (AD-Benutzer) *" hint={requester ? `${requester.department} · ${requester.office}${requesterPc ? ` · PC: ${requesterPc.name}` : ''}` : undefined}>
                <Select value={d.requester} onChange={(e) => set('requester', e.target.value)}>
                  <option value="">– bitte wählen –</option>
                  {people.map((u) => (
                    <option key={u.sam} value={u.sam}>
                      {u.surname}, {u.givenName} ({u.department})
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Kanal">
                <Select value={d.channel} onChange={(e) => set('channel', e.target.value as Channel)}>
                  {CHANNELS.filter((c) => c !== 'Vor Ort').map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Ticket-Titel *">
              <Input value={d.ticketTitle} onChange={(e) => set('ticketTitle', e.target.value)} placeholder="z. B. Anmeldung nicht möglich" />
            </Field>
            <Field label={d.channel === 'E-Mail' || d.channel === 'Portal' ? 'Ticket-Text (vom Benutzer geschrieben) *' : 'Ticket-Text (optional)'} hint={d.channel === 'Telefon' ? 'Bei Telefon-Szenarien beschreibt der Azubi das Problem selbst – der Text dient nur als Vorlage.' : undefined}>
              <Textarea rows={4} value={d.ticketDescription} onChange={(e) => set('ticketDescription', e.target.value)} />
            </Field>
            <Checkbox label="Identitätsprüfung erforderlich (vor Kennwort-/MFA-/BitLocker-Aktionen)" checked={d.identityRequired} onChange={(v) => set('identityRequired', v)} />
          </div>
        </Section>
      </div>

      <Section title="Fehlerbausteine" icon={<Puzzle size={16} className="text-violet-600" />} hint="Werden beim Start in die Welt eingebaut. Optionale Felder leer lassen = Anforderer bzw. dessen PC.">
        <div className="space-y-3">
          {d.faults.map((f, i) => {
            const def = faultByType(f.type)
            return (
              <div key={i} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                <div className="mb-2 flex items-start gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-900">{def?.label ?? f.type}</div>
                    <div className="text-xs text-slate-500">{def?.description ?? 'Unbekannter Baustein'}</div>
                  </div>
                  <IconButton title="Baustein entfernen" onClick={() => set('faults', d.faults.filter((_, j) => j !== i))}>
                    <X size={16} />
                  </IconButton>
                </div>
                {def && def.params.length > 0 && (
                  <div className="grid gap-2 md:grid-cols-2">
                    {def.params.map((p) => (
                      <Field key={p.name} label={`${p.label}${p.optional ? '' : ' *'}`}>
                        {paramInput(p, f.params[p.name] ?? '', (v) => updateFault(i, p.name, v))}
                      </Field>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Baustein hinzufügen" className="min-w-64 flex-1">
              <Select value={addType} onChange={(e) => setAddType(e.target.value)}>
                {FAULTS.map((f) => (
                  <option key={f.type} value={f.type}>
                    {f.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Button icon={<Plus size={15} />} onClick={() => addType && set('faults', [...d.faults, { type: addType, params: {} }])}>
              Hinzufügen
            </Button>
          </div>
          {checkLabels.length > 0 && (
            <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900 ring-1 ring-emerald-200">
              <div className="mb-1 flex items-center gap-1.5 font-medium">
                <ListChecks size={15} /> Technische Prüfungen (Bewertung „Technik“)
              </div>
              <ul className="list-disc pl-5 text-xs">
                {checkLabels.map((c, i) => (
                  <li key={i}>
                    {c.label} <span className="text-emerald-700">({c.points} P.)</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Section>

      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Anrufer / Benutzer" hint="Der simulierte Benutzer antwortet auf Fragen, die eines der Schlüsselwörter enthalten (Groß-/Kleinschreibung und Umlaute egal).">
          <div className="space-y-3">
            <Field label={d.channel === 'Telefon' || d.channel === 'Chat' ? 'Einleitung (erster Satz) *' : 'Einleitung (bei Rückfragen)'}>
              <Textarea rows={3} value={d.callerIntro} onChange={(e) => set('callerIntro', e.target.value)} placeholder="Hallo, hier ist … Ich komme nicht mehr in …" />
            </Field>
            <div className="text-xs font-medium text-slate-600">Fakten (Schlüsselwörter → Antwort)</div>
            {d.callerFacts.map((f, i) => (
              <div key={i} className="grid grid-cols-[1fr_2fr_auto] items-start gap-2">
                <Input
                  value={f.keywords}
                  placeholder="handy, smartphone"
                  onChange={(e) =>
                    set(
                      'callerFacts',
                      d.callerFacts.map((x, j) => (j === i ? { ...x, keywords: e.target.value } : x)),
                    )
                  }
                />
                <Textarea
                  rows={2}
                  value={f.answer}
                  placeholder="Antwort des Benutzers"
                  onChange={(e) =>
                    set(
                      'callerFacts',
                      d.callerFacts.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)),
                    )
                  }
                />
                <IconButton title="Fakt entfernen" onClick={() => set('callerFacts', d.callerFacts.filter((_, j) => j !== i))}>
                  <X size={16} />
                </IconButton>
              </div>
            ))}
            <Button size="sm" icon={<Plus size={13} />} onClick={() => set('callerFacts', [...d.callerFacts, { keywords: '', answer: '' }])}>
              Fakt hinzufügen
            </Button>
          </div>
        </Section>

        <Section title="Dokumentation" hint="Die Arbeitsnotizen werden auf diese Schlüsselwörter geprüft – eines je Zeile genügt (kommagetrennte Alternativen).">
          <div className="space-y-2">
            {d.workNoteKeywords.map((k, i) => (
              <div key={i} className="grid grid-cols-[1fr_2fr_auto] items-center gap-2">
                <Input
                  value={k.label}
                  placeholder="Bezeichnung"
                  onChange={(e) =>
                    set(
                      'workNoteKeywords',
                      d.workNoteKeywords.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                    )
                  }
                />
                <Input
                  value={k.any}
                  placeholder="gesperrt, sperre, lockout"
                  onChange={(e) =>
                    set(
                      'workNoteKeywords',
                      d.workNoteKeywords.map((x, j) => (j === i ? { ...x, any: e.target.value } : x)),
                    )
                  }
                />
                <IconButton title="Zeile entfernen" onClick={() => set('workNoteKeywords', d.workNoteKeywords.filter((_, j) => j !== i))}>
                  <X size={16} />
                </IconButton>
              </div>
            ))}
            <Button size="sm" icon={<Plus size={13} />} onClick={() => set('workNoteKeywords', [...d.workNoteKeywords, { label: '', any: '' }])}>
              Schlüsselwort hinzufügen
            </Button>
          </div>
        </Section>

        <Section title="Tipps" hint="Ein Tipp je Zeile – in der Reihenfolge, in der sie abgerufen werden (jeder Tipp kostet 2 Punkte).">
          <Textarea rows={5} value={d.hints.join('\n')} onChange={(e) => set('hints', e.target.value.split('\n'))} placeholder={'Prüfe zuerst …\nIn der AD-Konsole …'} />
        </Section>

        <Section title="Musterlösung" hint="Ein Schritt je Zeile – wird nach dem Abschluss im Bericht gezeigt (falls aktiviert).">
          <Textarea rows={5} value={d.solution.join('\n')} onChange={(e) => set('solution', e.target.value.split('\n'))} placeholder={'Ticket übernehmen, Kategorie …\nIdentität prüfen …'} />
        </Section>
      </div>
    </div>
  )
}
