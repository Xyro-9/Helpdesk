// Weboberfläche der Netzwerkdrucker (http://10.10.50.x): Status, Auftragsprotokoll, Admin-Einstellungen.

import { CircleCheck, FileText, Gauge, LogIn, LogOut, Network, Power, Printer, RotateCcw, Settings, Trash2, TriangleAlert } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { A } from '@/core/actions'
import { nextFreeIp } from '@/core/seed/infra'
import { dhcpServerOk, ownerOfIp } from '@/core/sim/network'
import { useStore } from '@/core/store'
import type { PrinterDevice } from '@/core/types'
import { fmtDateTime, hashString, isValidIp, nowIso } from '@/core/util'
import { cx } from '@/ui'
import { getSession, setSession, useSession } from '../session'
import type { SiteProps } from '../SiteView'
import { ConfirmButton, Link, logEntry, Meter, NotFoundBlock, Notice, runWorld, useTitle } from '../shared'

const HW_FAULTS: PrinterDevice['status'][] = ['Papierstau', 'Toner leer', 'Papier leer']

const statusTone = (s: PrinterDevice['status']) =>
  s === 'Bereit' ? 'bg-emerald-100 text-emerald-800 ring-emerald-300' : s === 'Energiesparmodus' ? 'bg-sky-100 text-sky-800 ring-sky-300' : 'bg-rose-100 text-rose-800 ring-rose-300'

export function PrinterSite({ api, route }: SiteProps) {
  const dev = useStore((s) => s.world.infra.printers.find((p) => p.id === route.printerId))
  const realm = `printer:${route.printerId}`
  const session = useSession(api.hostname, realm)
  useTitle(api, dev ? `${dev.name} – ${dev.model}` : 'Drucker')
  if (!dev) return <NotFoundBlock api={api} />
  const brand = dev.model.split(' ')[0]
  const page = api.segments[0] ?? ''
  const nav = [
    { href: '/', label: 'Status', icon: Gauge, id: '' },
    { href: '/protokoll', label: 'Auftragsprotokoll', icon: FileText, id: 'protokoll' },
    { href: '/einstellungen', label: 'Einstellungen', icon: Settings, id: 'einstellungen' },
  ]
  return (
    <div className="min-h-full bg-zinc-100 text-zinc-800">
      <header className="bg-zinc-800 text-white">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
          <Printer size={20} className="text-lime-400" />
          <div className="leading-tight">
            <div className="text-sm font-semibold">
              {brand} Web Console <span className="font-normal text-zinc-400">· {dev.model}</span>
            </div>
            <div className="text-[11px] text-zinc-400">
              {dev.name} · {dev.location}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2 text-xs">
            {session ? (
              <>
                <span className="text-zinc-300">Angemeldet: admin</span>
                <button type="button" onClick={() => setSession(api.hostname, realm)} className="flex items-center gap-1 rounded px-2 py-1 hover:bg-zinc-700">
                  <LogOut size={13} /> Abmelden
                </button>
              </>
            ) : (
              <Link api={api} href="/einstellungen" className="flex items-center gap-1 rounded px-2 py-1 hover:bg-zinc-700">
                <LogIn size={13} /> Administrator-Anmeldung
              </Link>
            )}
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3">
          {nav.map((n) => (
            <Link key={n.id} api={api} href={n.href} className={cx('flex items-center gap-1.5 rounded-t px-3 py-1.5 text-xs', page === n.id ? 'bg-zinc-100 font-medium text-zinc-900' : 'text-zinc-300 hover:bg-zinc-700')}>
              <n.icon size={13} /> {n.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-5xl p-4">
        {page === '' && <StatusPage dev={dev} />}
        {page === 'protokoll' && <LogPage dev={dev} />}
        {page === 'einstellungen' && (session ? <SettingsPage api={api} dev={dev} /> : <LoginPage api={api} dev={dev} realm={realm} />)}
        {!['', 'protokoll', 'einstellungen'].includes(page) && <NotFoundBlock api={api} />}
      </main>
    </div>
  )
}

function Box({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cx('rounded border border-zinc-300 bg-white', className)}>
      <h2 className="border-b border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-600">{title}</h2>
      <div className="p-3">{children}</div>
    </section>
  )
}

const TONER = [
  ['black', 'Schwarz (K)', 'bg-zinc-800'],
  ['cyan', 'Cyan (C)', 'bg-cyan-500'],
  ['magenta', 'Magenta (M)', 'bg-fuchsia-500'],
  ['yellow', 'Gelb (Y)', 'bg-yellow-400'],
] as const

function StatusPage({ dev }: { dev: PrinterDevice }) {
  return (
    <div className="grid gap-3 @3xl:grid-cols-2">
      <Box title="Gerätestatus" className="@3xl:col-span-2">
        <div className="flex flex-wrap items-center gap-3">
          <span className={cx('inline-flex items-center gap-1.5 rounded px-3 py-1 text-sm font-semibold ring-1', statusTone(dev.status))}>
            {dev.status === 'Bereit' ? <CircleCheck size={16} /> : <TriangleAlert size={16} />}
            {dev.status}
          </span>
          {dev.statusDetail && <span className="text-sm text-zinc-700">{dev.statusDetail}</span>}
        </div>
      </Box>
      <Box title="Verbrauchsmaterial">
        <div className="space-y-2.5">
          {TONER.map(([key, label, color]) => {
            const v = dev.toner[key]
            if (v === undefined) return null
            return (
              <div key={key} className="text-xs">
                <div className="mb-0.5 flex justify-between">
                  <span>{label}</span>
                  <span className={cx('font-mono', v <= 10 && 'font-semibold text-rose-700')}>
                    {v} %{v === 0 ? ' – leer' : v <= 10 ? ' – niedrig' : ''}
                  </span>
                </div>
                <Meter value={v} tone={color} className="h-3 rounded-sm" />
              </div>
            )
          })}
        </div>
      </Box>
      <Box title="Papierfächer">
        <div className="space-y-2.5">
          {dev.trays.map((t) => (
            <div key={t.name} className="text-xs">
              <div className="mb-0.5 flex justify-between">
                <span>
                  {t.name} ({t.size})
                </span>
                <span className={cx('font-mono', t.levelPct === 0 && 'font-semibold text-rose-700')}>{t.levelPct === 0 ? 'leer' : `${t.levelPct} %`}</span>
              </div>
              <Meter value={t.levelPct} tone="bg-zinc-500" className="h-3 rounded-sm" />
            </div>
          ))}
        </div>
      </Box>
      <Box title="Geräteinformationen" className="@3xl:col-span-2">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm @3xl:grid-cols-[auto_1fr_auto_1fr]">
          {[
            ['Modell', dev.model],
            ['Gerätename', dev.name],
            ['Standort', dev.location],
            ['Hostname', dev.hostname],
            ['IP-Adresse', dev.ip],
            ['Adressbezug', dev.dhcp ? 'DHCP' : 'Statisch'],
            ['Subnetzmaske', '255.255.255.0'],
            ['Standardgateway', '10.10.50.1'],
            ['MAC-Adresse', dev.mac],
            ['Seriennummer', dev.serial],
            ['Seitenzähler', dev.pageCount.toLocaleString('de-DE')],
            ['Farbe', dev.color ? 'Ja' : 'Nein (S/W)'],
          ].map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-xs text-zinc-500">{k}</dt>
              <dd className="font-mono text-xs">{v}</dd>
            </div>
          ))}
        </dl>
      </Box>
    </div>
  )
}

function LogPage({ dev }: { dev: PrinterDevice }) {
  const queues = useStore((s) => s.world.infra.printQueues)
  const jobs = useMemo(() => queues.filter((q) => q.deviceId === dev.id).flatMap((q) => q.jobs.map((j) => ({ ...j, queue: q.name }))), [queues, dev.id])
  const log = useMemo(() => [...dev.log].sort((a, b) => b.time.localeCompare(a.time)), [dev.log])
  return (
    <div className="space-y-3">
      <Box title="Aktuelle Aufträge (vom Druckserver)">
        {jobs.length ? (
          <table className="w-full text-left text-xs">
            <thead className="text-zinc-500">
              <tr>
                <th className="py-1">Nr.</th>
                <th>Dokument</th>
                <th>Besitzer</th>
                <th>Seiten</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={`${j.queue}-${j.id}`} className="border-t border-zinc-100">
                  <td className="py-1 font-mono">{j.id}</td>
                  <td>{j.document}</td>
                  <td>{j.owner}</td>
                  <td>{j.pages}</td>
                  <td className={j.status === 'Fehler' ? 'font-semibold text-rose-700' : ''}>{j.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-xs text-zinc-500">Keine Aufträge in Bearbeitung.</div>
        )}
      </Box>
      <Box title="Ereignis- und Auftragsprotokoll">
        <ul className="space-y-1 font-mono text-xs">
          {log.map((l, i) => (
            <li key={i} className="flex gap-3 border-b border-zinc-100 pb-1 last:border-0">
              <span className="shrink-0 text-zinc-500">{fmtDateTime(l.time)}</span>
              <span>{l.message}</span>
            </li>
          ))}
          {!log.length && <li className="text-zinc-500">Protokoll ist leer.</li>}
        </ul>
      </Box>
    </div>
  )
}

function LoginPage({ api, dev, realm }: { api: SiteProps['api']; dev: PrinterDevice; realm: string }) {
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  return (
    <Box title="Administrator-Anmeldung" className="mx-auto max-w-sm">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (pw === dev.adminPassword) {
            setSession(api.hostname, realm, { user: 'admin', at: Date.now() })
          } else {
            setErr('Anmeldung fehlgeschlagen: Kennwort ist falsch.')
            setPw('')
          }
        }}
      >
        <label className="block text-xs text-zinc-600">
          Benutzer
          <input value="admin" disabled className="mt-1 h-8 w-full rounded border border-zinc-300 bg-zinc-100 px-2 text-sm" />
        </label>
        <label className="block text-xs text-zinc-600">
          Kennwort
          <input type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} className="mt-1 h-8 w-full rounded border border-zinc-300 px-2 text-sm focus:border-lime-600 focus:outline-none" />
        </label>
        {err && <div className="text-xs font-medium text-rose-700">{err}</div>}
        <button type="submit" className="h-8 w-full rounded bg-zinc-800 text-sm font-medium text-white hover:bg-zinc-700">
          Anmelden
        </button>
      </form>
    </Box>
  )
}

type Msg = { tone: 'success' | 'warning' | 'error' | 'info'; text: React.ReactNode } | null

function SettingsPage({ api, dev }: { api: SiteProps['api']; dev: PrinterDevice }) {
  const [dhcp, setDhcp] = useState(dev.dhcp)
  const [ip, setIp] = useState(dev.ip)
  const [confirmOut, setConfirmOut] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)
  const [restarting, setRestarting] = useState(false)
  const outside = !dhcp && isValidIp(ip.trim()) && !ip.trim().startsWith('10.10.50.')

  useEffect(() => {
    if (!restarting) return
    const t = setTimeout(() => setRestarting(false), 2500)
    return () => clearTimeout(t)
  }, [restarting])

  const saveNetwork = () => {
    const newIp = ip.trim()
    if (!dhcp && !isValidIp(newIp)) return setMsg({ tone: 'error', text: 'Ungültige IP-Adresse.' })
    if (outside && !confirmOut) return setMsg({ tone: 'warning', text: 'Bitte bestätigen Sie, dass die Adresse außerhalb des Druckernetzes liegt.' })
    const res = runWorld<{ err?: string; detail?: string; ip?: string; offline?: boolean }>((w) => {
      const d = w.infra.printers.find((p) => p.id === dev.id)
      if (!d) return { err: 'Gerät nicht gefunden.' }
      const old = d.ip
      if (dhcp) {
        if (d.dhcp) return { err: 'DHCP ist bereits aktiviert – keine Änderung.' }
        d.dhcp = true
        const scope = w.infra.dhcpScopes.find((s) => s.id === '10.10.50.0' && s.active)
        const lease = scope && dhcpServerOk(w) ? nextFreeIp(scope) : undefined
        if (scope && lease) {
          scope.leases.push({ ip: lease, mac: d.mac, hostname: `${d.hostname}.musterwerk.local`, expires: new Date(Date.now() + scope.leaseHours * 3600000).toISOString(), state: 'Aktiv' })
          d.ip = lease
        } else {
          const h = hashString(d.mac)
          d.ip = `169.254.${(h % 250) + 1}.${((h >>> 8) % 250) + 1}`
          d.status = 'Offline'
          d.statusDetail = 'Keine IP-Adresse vom DHCP-Server erhalten (APIPA 169.254.x.x). Netzwerkkonfiguration am Bedienfeld des Geräts erforderlich.'
        }
        d.log.unshift({ time: nowIso(), message: `Netzwerk: DHCP aktiviert, neue Adresse ${d.ip} (vorher ${old})` })
        return { detail: `DHCP aktiviert: ${old} → ${d.ip}`, ip: d.ip, offline: d.status === 'Offline' }
      }
      if (!d.dhcp && newIp === d.ip) return { err: 'Keine Änderung.' }
      if (newIp.startsWith('10.')) {
        const owner = ownerOfIp(w, newIp)
        if (owner.kind !== 'none' && !(owner.kind === 'printer' && owner.name === d.id))
          return { err: `IP-Adresskonflikt: ${newIp} wird bereits im Netzwerk verwendet${owner.name ? ` (${owner.name})` : ''}. Einstellung wurde nicht übernommen.` }
      }
      d.dhcp = false
      d.ip = newIp
      if (!newIp.startsWith('10.10.50.')) {
        d.status = 'Offline'
        d.statusDetail = `IP-Adresse ${newIp} passt nicht zum Druckernetz 10.10.50.0/24 – Gateway nicht erreichbar. Netzwerkkonfiguration am Bedienfeld des Geräts erforderlich.`
      }
      d.log.unshift({ time: nowIso(), message: `Netzwerk: statische IP-Adresse ${newIp} (vorher ${old})` })
      return { detail: `IP-Adresse ${old} → ${newIp} (statisch)`, ip: newIp, offline: d.status === 'Offline' }
    })
    if (res.err) return setMsg({ tone: 'error', text: res.err })
    logEntry({ type: A.printerDeviceChanged, target: dev.id, detail: res.detail })
    setMsg({
      tone: res.offline ? 'warning' : 'success',
      text: res.offline ? (
        <>Einstellungen übernommen. Das Gerät startet die Netzwerkschnittstelle neu und ist unter der neuen Adresse {res.ip} voraussichtlich nicht mehr erreichbar.</>
      ) : (
        <>
          Einstellungen übernommen. Die Weboberfläche ist jetzt unter{' '}
          <Link api={api} href={`http://${res.ip}/`} className="font-medium underline">
            http://{res.ip}/
          </Link>{' '}
          erreichbar. Diese Seite reagiert nicht mehr.
        </>
      ),
    })
  }

  const reboot = () => {
    const out = runWorld<'fixed' | 'hardware' | 'ok' | 'persist'>((w) => {
      const d = w.infra.printers.find((p) => p.id === dev.id)
      if (!d) return 'persist'
      d.log.unshift({ time: nowIso(), message: 'Neustart durch Administrator (Weboberfläche)' })
      const soft = (d.status === 'Fehler' || d.status === 'Offline') && /neustart behebt/i.test(d.statusDetail ?? '')
      if (soft || d.status === 'Energiesparmodus') {
        d.status = 'Bereit'
        d.statusDetail = undefined
        d.log.unshift({ time: nowIso(), message: 'Selbsttest erfolgreich – Gerät bereit' })
        return 'fixed'
      }
      d.log.unshift({ time: nowIso(), message: d.status === 'Bereit' ? 'Selbsttest erfolgreich – Gerät bereit' : `Selbsttest: Störung besteht weiterhin (${d.status})` })
      if (HW_FAULTS.includes(d.status)) return 'hardware'
      return d.status === 'Bereit' ? 'ok' : 'persist'
    })
    logEntry({ type: A.printerDeviceChanged, target: dev.id, detail: `Neustart (${out === 'fixed' ? 'Störung behoben' : out === 'ok' ? 'ohne Befund' : 'Störung besteht weiter'})` })
    setRestarting(true)
    if (out === 'fixed') setMsg({ tone: 'success', text: 'Das Gerät wurde neu gestartet. Status: Bereit.' })
    else if (out === 'ok') setMsg({ tone: 'info', text: 'Das Gerät wurde neu gestartet. Es lag keine Störung vor.' })
    else if (out === 'hardware')
      setMsg({ tone: 'warning', text: `Neustart durchgeführt – die Störung „${dev.status}“ besteht weiterhin. Diese Störung kann nicht aus der Ferne behoben werden: Vor-Ort-Service erforderlich.` })
    else setMsg({ tone: 'warning', text: `Neustart durchgeführt – der Fehler besteht weiterhin${dev.statusDetail ? ` (${dev.statusDetail})` : ''}. Vor-Ort-Service bzw. Herstellersupport erforderlich.` })
  }

  const clearLog = () => {
    const fixed = runWorld((w) => {
      const d = w.infra.printers.find((p) => p.id === dev.id)
      if (!d) return false
      d.log = [{ time: nowIso(), message: 'Fehlerspeicher gelöscht (Administrator)' }]
      if (d.status === 'Fehler' && /fehlerspeicher/i.test(d.statusDetail ?? '')) {
        d.status = 'Bereit'
        d.statusDetail = undefined
        return true
      }
      return false
    })
    logEntry({ type: A.printerDeviceChanged, target: dev.id, detail: 'Fehlerspeicher gelöscht' })
    setMsg({ tone: 'success', text: fixed ? 'Fehlerspeicher gelöscht – das Gerät meldet wieder „Bereit“.' : 'Fehlerspeicher gelöscht.' })
  }

  const testPage = () => {
    const ok = runWorld((w) => {
      const d = w.infra.printers.find((p) => p.id === dev.id)
      if (!d || (d.status !== 'Bereit' && d.status !== 'Energiesparmodus')) return false
      d.status = 'Bereit'
      d.pageCount += 1
      d.log.unshift({ time: nowIso(), message: 'Konfigurationsseite gedruckt (1 Seite)' })
      return true
    })
    if (ok) logEntry({ type: A.printerDeviceChanged, target: dev.id, detail: 'Testseite gedruckt' })
    setMsg(ok ? { tone: 'success', text: 'Konfigurationsseite wird gedruckt.' } : { tone: 'error', text: `Druck nicht möglich – Gerät meldet „${dev.status}“.` })
  }

  if (restarting)
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-zinc-600">
        <RotateCcw className="animate-spin" size={32} />
        <div className="text-sm">Gerät wird neu gestartet … bitte warten.</div>
      </div>
    )

  const sessionOk = !!getSession(api.hostname, `printer:${dev.id}`)
  return (
    <div className="space-y-3">
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <div className="grid gap-3 @3xl:grid-cols-2">
        <Box title="Netzwerk (TCP/IP v4)">
          <div className="space-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" checked={dhcp} onChange={() => setDhcp(true)} className="accent-zinc-800" /> Adresse automatisch beziehen (DHCP)
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={!dhcp} onChange={() => setDhcp(false)} className="accent-zinc-800" /> Statische Adresse
            </label>
            <div className="grid grid-cols-[8rem_1fr] items-center gap-2 pl-6 text-xs">
              <span>IP-Adresse</span>
              <input value={ip} disabled={dhcp} onChange={(e) => setIp(e.target.value)} className="h-8 rounded border border-zinc-300 px-2 font-mono disabled:bg-zinc-100" />
              <span>Subnetzmaske</span>
              <input value="255.255.255.0" disabled className="h-8 rounded border border-zinc-300 bg-zinc-100 px-2 font-mono" />
              <span>Gateway</span>
              <input value="10.10.50.1" disabled className="h-8 rounded border border-zinc-300 bg-zinc-100 px-2 font-mono" />
            </div>
            {outside && (
              <label className="flex items-start gap-2 rounded bg-amber-50 p-2 text-xs text-amber-900">
                <input type="checkbox" checked={confirmOut} onChange={(e) => setConfirmOut(e.target.checked)} className="mt-0.5" />
                Die Adresse liegt außerhalb des Druckernetzes 10.10.50.0/24. Das Gerät ist danach voraussichtlich nicht mehr erreichbar – trotzdem übernehmen.
              </label>
            )}
            <div className="flex items-center gap-2 pt-1">
              <button type="button" onClick={saveNetwork} disabled={!sessionOk} className="flex h-8 items-center gap-1.5 rounded bg-zinc-800 px-3 text-xs font-medium text-white hover:bg-zinc-700">
                <Network size={13} /> Übernehmen
              </button>
              <span className="text-[11px] text-zinc-500">Achtung: Änderungen wirken sofort.</span>
            </div>
          </div>
        </Box>
        <Box title="Wartung">
          <div className="space-y-3 text-sm">
            <div>
              <ConfirmButton onConfirm={reboot} confirmText="Gerät jetzt neu starten?" className="flex h-8 items-center gap-1.5 rounded border border-zinc-300 bg-white px-3 text-xs font-medium hover:bg-zinc-50" icon={<Power size={13} />}>
                Gerät neu starten
              </ConfirmButton>
              <p className="mt-1 text-[11px] text-zinc-500">Behebt Software- bzw. Firmwarefehler. Papierstau, leerer Toner oder leere Fächer müssen vor Ort behoben werden.</p>
            </div>
            <div>
              <ConfirmButton onConfirm={clearLog} confirmText="Fehlerspeicher löschen?" className="flex h-8 items-center gap-1.5 rounded border border-zinc-300 bg-white px-3 text-xs font-medium hover:bg-zinc-50" icon={<Trash2 size={13} />}>
                Fehlerspeicher löschen
              </ConfirmButton>
            </div>
            <div>
              <button type="button" onClick={testPage} className="flex h-8 items-center gap-1.5 rounded border border-zinc-300 bg-white px-3 text-xs font-medium hover:bg-zinc-50">
                <FileText size={13} /> Konfigurationsseite drucken
              </button>
            </div>
            <div className="rounded bg-zinc-50 p-2 text-xs text-zinc-600">
              Aktueller Status: <strong>{dev.status}</strong>
              {dev.statusDetail && <> – {dev.statusDetail}</>}
            </div>
          </div>
        </Box>
      </div>
    </div>
  )
}
