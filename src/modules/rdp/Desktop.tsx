// Desktop einer Remotesitzung: Hintergrund, Symbole, Fenster, Taskleiste, Startmenü,
// Ausführen-Dialog, Meldungsfenster, Benutzerkontensteuerung, Neustart, Sperrbildschirm.

import { FileText, Folder, Globe, Info, Laptop, Lock, ShieldCheck, SquareTerminal, Trash2, X, type LucideIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { A } from '@/core/actions'
import { findUser } from '@/core/ops/ad'
import { applyGpoMappings, getEndpoint, rebootEndpoint, resolveFs } from '@/core/ops/endpoint'
import { useStore } from '@/core/store'
import type { Endpoint } from '@/core/types'
import { cx } from '@/ui'
import { redetectDevices } from './apps/DeviceManager'
import { APPS } from './apps/registry'
import { DeskCtx, useEp, type DeskApi, type MsgOptions } from './desk'
import { isTextFile, parseRun } from './run'
import { useRdp, type AppArgs, type AppId } from './store'
import { AppLoading, ContextMenu, MsgIconView, useContextMenu, WBtn, WInput, type MenuItem } from './ui'
import { RunDialog } from './wm/RunDialog'
import { StartMenu } from './wm/StartMenu'
import { Taskbar } from './wm/Taskbar'
import { Window } from './wm/Window'

type DlgEntry =
  | { id: number; kind: 'msg'; o: MsgOptions; resolve: (b: string) => void }
  | { id: number; kind: 'prompt'; o: { title: string; label: string; value?: string; placeholder?: string }; resolve: (v: string | null) => void }
  | { id: number; kind: 'uac'; program: string; resolve: (ok: boolean) => void }

type NoId<T> = T extends unknown ? Omit<T, 'id'> : never

let dlgSeq = 0

export function Desktop({ sessionKey, host, active }: { sessionKey: string; host: string; active: boolean }) {
  const ep = useEp(host)
  if (!ep) return <AppLoading />
  return <DesktopInner sessionKey={sessionKey} host={host} active={active} ep={ep} />
}

function DesktopInner({ sessionKey, host, active, ep }: { sessionKey: string; host: string; active: boolean; ep: Endpoint }) {
  const ses = useRdp((s) => s.sessions[sessionKey])
  const updateWorld = useStore((s) => s.updateWorld)
  const closeRdp = useStore((s) => s.closeRdp)
  const userName = useStore((s) => (ep.loggedOnUser ? (findUser(s.world, ep.loggedOnUser)?.displayName ?? ep.loggedOnUser) : s.world.tech.name))
  const deskRef = useRef<HTMLDivElement>(null)
  const [layer, setLayer] = useState<HTMLDivElement | null>(null)
  const [dialogs, setDialogs] = useState<DlgEntry[]>([])
  const [startOpen, setStartOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [runOpen, setRunOpen] = useState(false)
  const [selIcon, setSelIcon] = useState<string | null>(null)
  const winx = useContextMenu<null>()
  const deskMenu = useContextMenu<null>()
  const activeRef = useRef(active)
  activeRef.current = active

  const push = useCallback((d: NoId<DlgEntry>) => setDialogs((l) => [...l, { ...d, id: ++dlgSeq } as DlgEntry]), [])
  const pop = (id: number) => setDialogs((l) => l.filter((d) => d.id !== id))

  const api = useMemo<DeskApi>(() => {
    const msg = (o: MsgOptions) => new Promise<string>((resolve) => push({ kind: 'msg', o, resolve }))
    const alert = async (text: string, opts: { title?: string; icon?: MsgOptions['icon'] } = {}) => {
      await msg({ text, title: opts.title, icon: opts.icon ?? 'info', buttons: ['OK'] })
    }
    const confirm = async (text: string, opts: { title?: string; icon?: MsgOptions['icon']; ok?: string; cancel?: string } = {}) => {
      const ok = opts.ok ?? 'OK'
      const r = await msg({ text, title: opts.title, icon: opts.icon ?? 'question', buttons: [ok, opts.cancel ?? 'Abbrechen'] })
      return r === ok
    }
    const openApp = (app: AppId, args: AppArgs = {}) => {
      const def = APPS[app]
      const r = deskRef.current?.getBoundingClientRect()
      useRdp.getState().openWindow(sessionKey, app, args, { w: def.w, h: def.h, title: def.title, deskW: r?.width ?? 1200, deskH: (r?.height ?? 700) - 48 })
    }
    const uac = (program: string) => new Promise<boolean>((resolve) => push({ kind: 'uac', program, resolve }))
    const requestReboot = async () => {
      const cur = useStore.getState().world.endpoints[host]
      const user = cur?.loggedOnUser ? (findUser(useStore.getState().world, cur.loggedOnUser)?.displayName ?? cur.loggedOnUser) : undefined
      const ok = await confirm(`Möchten Sie ${host} jetzt neu starten?${user ? `\n\nDer angemeldete Benutzer (${user}) verliert dabei ungespeicherte Daten – vorher Bescheid geben!` : ''}\n\nDie Remotesitzung wird getrennt.`, { title: 'Neu starten', icon: 'warning', ok: 'Neu starten', cancel: 'Abbrechen' })
      if (!ok) return
      updateWorld(
        (w) => {
          const e = getEndpoint(w, host)
          if (!e) return
          rebootEndpoint(w, e)
          redetectDevices(e)
        },
        { type: A.reboot, target: host, detail: 'Neustart über Remotedesktop' },
      )
      useRdp.getState().clearWindows(sessionKey)
      useRdp.getState().patch(sessionKey, { phase: 'disconnected', reason: 'reboot', rebootUntil: Date.now() + 5000, locked: false })
    }
    const gpupdate = () => {
      let msgs: string[] = []
      updateWorld(
        (w) => {
          const e = getEndpoint(w, host)
          if (e) msgs = applyGpoMappings(w, e)
        },
        { type: A.gpupdate, target: host, detail: 'gpupdate /force (Ausführen)' },
      )
      void alert(`Die Richtlinie wird aktualisiert …\n\nDie Aktualisierung der Computerrichtlinie wurde erfolgreich abgeschlossen.\nDie Aktualisierung der Benutzerrichtlinie wurde erfolgreich abgeschlossen.${msgs.length ? '\n\n' + msgs.join('\n') : ''}`, { title: 'gpupdate', icon: 'info' })
    }
    const runCommand = (cmd: string, admin = false) => {
      const r = parseRun(cmd)
      if (r.kind === 'error') return void alert(r.message, { title: cmd.trim() || 'Ausführen', icon: 'error' })
      if (r.kind === 'gpupdate') return gpupdate()
      if (r.kind === 'reboot') return void requestReboot()
      if (admin && r.app === 'notepad') return void uac('Editor').then((y) => y && openApp('notepad', { ...(r.args ?? {}), admin: '1' }))
      openApp(r.app, r.args)
    }
    return {
      sessionKey,
      host,
      dialogLayer: layer,
      isActive: () => activeRef.current,
      openApp,
      msg,
      alert,
      confirm,
      prompt: (o) => new Promise<string | null>((resolve) => push({ kind: 'prompt', o, resolve })),
      uac,
      runCommand,
      showRun: () => setRunOpen(true),
      requestReboot: () => void requestReboot(),
    }
  }, [sessionKey, host, layer, push, updateWorld])

  // Strg+Umschalt+Esc → Task-Manager
  useEffect(() => {
    if (!active) return
    const k = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'Escape') {
        e.preventDefault()
        api.openApp('taskmgr')
      }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [active, api])

  const user = ep.loggedOnUser ?? 'azubi'
  const desktopFiles = useMemo(() => (resolveFs(ep, `C:\\Users\\${user}\\Desktop`)?.children ?? []).filter((c) => !c.hidden), [ep, user])
  if (!ses) return null

  const icons: { id: string; label: string; icon: LucideIcon; cls: string; open: () => void }[] = [
    { id: 'pc', label: 'Dieser PC', icon: Laptop, cls: 'text-sky-200', open: () => api.openApp('explorer', { path: 'Dieser PC' }) },
    { id: 'bin', label: 'Papierkorb', icon: Trash2, cls: 'text-slate-100', open: () => api.openApp('explorer', { path: 'Papierkorb' }) },
    { id: 'web', label: 'Webbrowser', icon: Globe, cls: 'text-sky-200', open: () => api.openApp('browser') },
    { id: 'term', label: 'Terminal', icon: SquareTerminal, cls: 'text-slate-100', open: () => api.openApp('powershell') },
    ...desktopFiles.map((f) => ({
      id: `f:${f.name}`,
      label: f.name.replace(/\.lnk$/i, ''),
      icon: f.type === 'dir' ? Folder : FileText,
      cls: f.type === 'dir' ? 'text-amber-200' : 'text-white',
      open: () => {
        const p = `C:\\Users\\${user}\\Desktop\\${f.name}`
        if (f.type === 'dir') api.openApp('explorer', { path: p })
        else if (isTextFile(f.name)) api.openApp('notepad', { path: p })
        else void api.alert(`„${f.name}“ wurde gestartet.\n\n(In der Simulation öffnet das Programm kein eigenes Fenster.)`, { title: f.name, icon: 'info' })
      },
    })),
  ]

  const winxItems: MenuItem[] = [
    { label: 'Installierte Apps', onClick: () => api.openApp('settings', { page: 'apps' }) },
    { label: 'Ereignisanzeige', onClick: () => api.openApp('eventvwr') },
    { label: 'System', onClick: () => api.openApp('settings', { page: 'system' }) },
    { label: 'Geräte-Manager', onClick: () => api.openApp('devmgmt') },
    { label: 'Netzwerkverbindungen', onClick: () => api.openApp('ncpa') },
    { label: 'Datenträgerverwaltung', onClick: () => api.openApp('diskmgmt') },
    { label: 'Terminal (Administrator)', onClick: () => api.openApp('powershell') },
    { sep: true },
    { label: 'Task-Manager', onClick: () => api.openApp('taskmgr') },
    { label: 'Einstellungen', onClick: () => api.openApp('settings') },
    { label: 'Datei-Explorer', onClick: () => api.openApp('explorer') },
    { label: 'Suchen', onClick: () => setStartOpen(true) },
    { label: 'Ausführen', onClick: () => setRunOpen(true) },
    { sep: true },
    { label: 'Neu starten', onClick: () => api.requestReboot() },
    { label: 'Desktop', onClick: () => useRdp.getState().minimizeAll(sessionKey) },
  ]

  const locked = ses.locked || ep.locked

  return (
    <DeskCtx.Provider value={api}>
      <div
        ref={deskRef}
        className="relative h-full w-full overflow-hidden select-none"
        style={{
          background:
            'radial-gradient(ellipse at 18% 85%, rgba(56,189,248,0.55), transparent 55%), radial-gradient(ellipse at 85% 20%, rgba(129,140,248,0.6), transparent 55%), radial-gradient(ellipse at 60% 70%, rgba(14,116,144,0.6), transparent 60%), linear-gradient(135deg, #0b2447 0%, #19376d 45%, #0e7490 100%)',
        }}
        onContextMenu={(e) => {
          if (e.target === e.currentTarget) deskMenu.open(e, null)
        }}
        onClick={(e) => e.target === e.currentTarget && setSelIcon(null)}
      >
        {/* Firmen-Kennzeichnung */}
        <div className="pointer-events-none absolute right-6 bottom-16 text-right text-white/35">
          <div className="text-[22px] font-light tracking-wide">Musterwerk AG</div>
          <div className="text-[11px]">
            {ep.hostname} · {ep.os}
          </div>
        </div>

        {/* Symbole */}
        <div className="absolute top-2 left-2 flex max-h-[calc(100%-64px)] flex-col flex-wrap gap-1">
          {icons.map((i) => {
            const Icon = i.icon
            return (
              <button
                key={i.id}
                type="button"
                onClick={() => setSelIcon(i.id)}
                onDoubleClick={i.open}
                className={cx('flex w-[78px] flex-col items-center gap-1 rounded-[4px] border px-1 py-1.5 text-center', selIcon === i.id ? 'border-white/40 bg-white/25' : 'border-transparent hover:bg-white/15')}
              >
                <Icon size={30} className={cx(i.cls, 'drop-shadow')} strokeWidth={1.4} />
                <span className="line-clamp-2 text-[11px] leading-tight text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.8)]">{i.label}</span>
              </button>
            )
          })}
        </div>

        {/* Fenster */}
        <div className="pointer-events-none absolute inset-x-0 top-0 bottom-12 [&>*]:pointer-events-auto">
          {ses.windows.map((w) => {
            const def = APPS[w.app]
            const Icon = def.icon
            return (
              <Window key={w.id} sessionKey={sessionKey} win={w} focused={ses.focused === w.id} icon={<Icon size={14} className={def.tint} />}>
                {def.render({ host, args: w.args })}
              </Window>
            )
          })}
        </div>

        {/* Einverständnis-Hinweis */}
        {ses.banner && ep.loggedOnUser && (
          <div className="absolute bottom-16 left-1/2 z-[7500] flex max-w-[92%] -translate-x-1/2 items-center gap-2 rounded-[8px] border border-amber-300 bg-amber-50/95 px-3 py-2 text-[12px] text-amber-900 shadow-lg">
            <Info size={15} className="shrink-0" />
            <span>
              Benutzer <b>{userName}</b> ist angemeldet – Sitzung wird gespiegelt (Einverständnis eingeholt?)
            </span>
            <button type="button" className="ml-1 rounded p-0.5 hover:bg-amber-100" title="Ausblenden" onClick={() => useRdp.getState().patch(sessionKey, { banner: false })}>
              <X size={13} />
            </button>
          </div>
        )}

        <Taskbar
          ep={ep}
          windows={ses.windows}
          focused={ses.focused}
          startOpen={startOpen}
          onStart={() => {
            setStartOpen(!startOpen)
            if (startOpen) setSearch('')
          }}
          onStartContext={(e) => winx.open(e, null)}
          search={search}
          setSearch={(s) => {
            setSearch(s)
            setStartOpen(true)
          }}
          userName={userName}
        />
        {startOpen && (
          <StartMenu
            query={search}
            setQuery={setSearch}
            userName={userName}
            userSam={user}
            onClose={() => {
              setStartOpen(false)
              setSearch('')
            }}
            onLock={() => {
              setStartOpen(false)
              useRdp.getState().patch(sessionKey, { locked: true })
            }}
            onDisconnect={() => closeRdp(sessionKey)}
          />
        )}
        {runOpen && <RunDialog onClose={() => setRunOpen(false)} />}

        {/* Dialogebene für App-Dialoge */}
        <div ref={setLayer} className="pointer-events-none absolute inset-x-0 top-0 bottom-12 z-[9000] [&>*]:pointer-events-auto" />

        {/* Meldungsfenster */}
        {dialogs.length > 0 && (
          <div className="absolute inset-0 z-[9500] flex items-center justify-center bg-black/10">
            {dialogs.map((d, i) => (
              <div key={d.id} className="absolute" style={{ transform: `translate(${i * 16}px, ${i * 16}px)` }}>
                <DialogView d={d} host={host} onDone={() => pop(d.id)} />
              </div>
            ))}
          </div>
        )}

        {/* Sperrbildschirm */}
        {locked && (
          <div className="absolute inset-0 z-[9800] flex flex-col items-center justify-center bg-gradient-to-br from-[#0b2447]/95 to-[#0e7490]/95 text-white backdrop-blur">
            <Clock offset={ep.timeOffsetMin} />
            <div className="mt-10 flex flex-col items-center gap-3">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/20 text-[26px]">
                <Lock size={30} />
              </div>
              <div className="text-[16px]">{userName}</div>
              <div className="text-[12px] text-white/70">{ep.locked ? 'Der Computer wurde vom Benutzer gesperrt.' : 'Gesperrt'}</div>
              <WBtn
                primary
                onClick={() => {
                  useRdp.getState().patch(sessionKey, { locked: false })
                  if (ep.locked)
                    updateWorld((w) => {
                      const e = getEndpoint(w, host)
                      if (e) e.locked = false
                    })
                }}
              >
                Anmelden
              </WBtn>
            </div>
          </div>
        )}
      </div>
      {winx.menu && <ContextMenu x={winx.menu.x} y={winx.menu.y} onClose={winx.close} items={winxItems} />}
      {deskMenu.menu && (
        <ContextMenu
          x={deskMenu.menu.x}
          y={deskMenu.menu.y}
          onClose={deskMenu.close}
          items={[
            { label: 'Aktualisieren', onClick: () => {} },
            { label: 'Ausführen…', onClick: () => setRunOpen(true) },
            { label: 'Im Terminal öffnen', onClick: () => api.openApp('powershell') },
            { sep: true },
            { label: 'Anzeigeeinstellungen', disabled: true },
            { label: 'Anpassen', disabled: true },
          ]}
        />
      )}
    </DeskCtx.Provider>
  )
}

function Clock({ offset }: { offset: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const d = new Date(now + offset * 60000)
  return (
    <div className="text-center">
      <div className="text-[64px] font-light">{d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</div>
      <div className="text-[16px]">{d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
    </div>
  )
}

function DialogView({ d, host, onDone }: { d: DlgEntry; host: string; onDone: () => void }) {
  const [val, setVal] = useState(d.kind === 'prompt' ? (d.o.value ?? '') : '')
  // Kurze Sperre: ein Enter, das den Dialog ausgelöst hat, darf ihn nicht sofort wieder schließen
  const armed = useRef(false)
  useEffect(() => {
    const t = setTimeout(() => (armed.current = true), 300)
    return () => clearTimeout(t)
  }, [])
  const box = (title: string, body: React.ReactNode, footer: React.ReactNode, w = 400) => (
    <div className="flex flex-col overflow-hidden rounded-[8px] border border-[#c8c8c8] bg-[#f3f3f3] text-[12px] shadow-[0_12px_40px_rgba(0,0,0,0.3)]" style={{ width: w, maxWidth: '92vw' }}>
      <div className="flex h-8 items-center pl-3 text-slate-800">
        <span className="flex-1 truncate">{title}</span>
      </div>
      <div className="max-h-[60vh] overflow-auto bg-white px-4 py-4 text-slate-800">{body}</div>
      <div className="flex justify-end gap-2 border-t border-[#e3e3e3] px-4 py-2.5">{footer}</div>
    </div>
  )
  if (d.kind === 'msg') {
    const buttons = d.o.buttons ?? ['OK']
    const finish = (b: string) => {
      if (!armed.current) return
      onDone()
      d.resolve(b)
    }
    return box(
      d.o.title ?? host,
      <div className="flex gap-3">
        <MsgIconView icon={d.o.icon ?? 'info'} />
        <p className="pt-1 whitespace-pre-wrap select-text">{d.o.text}</p>
      </div>,
      buttons.map((b, i) => (
        <WBtn key={b} primary={i === (d.o.defaultIndex ?? 0)} autoFocus={i === (d.o.defaultIndex ?? 0)} onClick={() => finish(b)}>
          {b}
        </WBtn>
      )),
      Math.min(520, Math.max(360, d.o.text.length * 2.4)),
    )
  }
  if (d.kind === 'prompt') {
    const finish = (v: string | null) => {
      if (!armed.current) return
      onDone()
      d.resolve(v)
    }
    return box(
      d.o.title,
      <label className="block">
        <span className="mb-1 block">{d.o.label}</span>
        <WInput autoFocus value={val} placeholder={d.o.placeholder} onChange={(e) => setVal(e.target.value)} onFocus={(e) => e.target.select()} onKeyDown={(e) => {
          if (e.key === 'Enter') finish(val)
          if (e.key === 'Escape') finish(null)
        }} />
      </label>,
      <>
        <WBtn primary onClick={() => finish(val)}>
          OK
        </WBtn>
        <WBtn onClick={() => finish(null)}>Abbrechen</WBtn>
      </>,
      440,
    )
  }
  const finish = (ok: boolean) => {
    if (!armed.current) return
    onDone()
    d.resolve(ok)
  }
  return (
    <div className="w-[420px] overflow-hidden rounded-[8px] border border-[#2b5797] bg-white text-[12px] shadow-[0_12px_40px_rgba(0,0,0,0.4)]">
      <div className="bg-[#1f4f8f] px-4 py-3 text-white">
        <div className="mb-1 text-[11px] opacity-80">Benutzerkontensteuerung</div>
        <div className="text-[15px]">Möchten Sie zulassen, dass durch diese App Änderungen an Ihrem Gerät vorgenommen werden?</div>
      </div>
      <div className="space-y-2 px-4 py-3">
        <div className="flex items-center gap-2">
          <ShieldCheck size={22} className="text-[#1f4f8f]" />
          <span className="text-[13px] font-semibold">{d.program}</span>
        </div>
        <div className="text-slate-600">Verifizierter Herausgeber: Betriebssystem-Hersteller</div>
        <div className="rounded border border-[#d6d6d6] bg-[#f7f7f7] p-2 text-slate-700">
          Anmeldung als <b>MUSTERWERK\azubi</b> (Mitglied von GG_IT → GG_Lokale_Admins)
        </div>
      </div>
      <div className="flex gap-2 px-4 pb-4">
        <WBtn primary className="flex-1" autoFocus onClick={() => finish(true)}>
          Ja
        </WBtn>
        <WBtn className="flex-1" onClick={() => finish(false)}>
          Nein
        </WBtn>
      </div>
    </div>
  )
}
