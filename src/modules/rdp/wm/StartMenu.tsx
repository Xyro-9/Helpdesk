// Startmenü mit Suche, angehefteten Apps, Alle Apps, Benutzer und Energie-Optionen.

import { ChevronRight, LogOut, Lock, Play, Power, RotateCcw, Search, Unplug } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { cx } from '@/ui'
import { APP_LIST, type AppDef } from '../apps/registry'
import { useDesk } from '../desk'
import { parseRun } from '../run'
import { ContextMenu, useContextMenu } from '../ui'

interface Props {
  query: string
  setQuery: (q: string) => void
  userName: string
  userSam: string
  onClose: () => void
  onLock: () => void
  onDisconnect: () => void
}

export function StartMenu({ query, setQuery, userName, userSam, onClose, onLock, onDisconnect }: Props) {
  const desk = useDesk()
  const ref = useRef<HTMLDivElement>(null)
  const [all, setAll] = useState(false)
  const [power, setPower] = useState(false)
  const [userMenu, setUserMenu] = useState(false)
  const ctx = useContextMenu<AppDef>()

  useEffect(() => {
    const h = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (ref.current && !ref.current.contains(t) && !t.closest('[data-startbtn]') && !t.closest('[data-searchbox]')) onClose()
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onClose])

  const q = query.trim().toLowerCase()
  const results = useMemo(() => (q ? APP_LIST.filter((a) => a.keywords && (a.title.toLowerCase().includes(q) || a.keywords.includes(q))) : []), [q])
  const cmd = q ? parseRun(query) : null

  const launch = (a: AppDef) => {
    onClose()
    desk.openApp(a.id)
  }
  const runAdmin = (a: AppDef) => {
    onClose()
    void desk.uac(a.title).then((ok) => ok && desk.openApp(a.id, a.id === 'notepad' ? { admin: '1' } : {}))
  }

  const tile = (a: AppDef) => {
    const Icon = a.icon
    return (
      <button
        key={a.id}
        type="button"
        onClick={() => launch(a)}
        onContextMenu={(e) => ctx.open(e, a)}
        className="flex flex-col items-center gap-1.5 rounded-[6px] px-1 py-2.5 text-center hover:bg-white/70"
        title={a.title}
      >
        <Icon size={26} className={a.tint} strokeWidth={1.6} />
        <span className="line-clamp-2 text-[11px] leading-tight text-slate-800">{a.title}</span>
      </button>
    )
  }

  return (
    <div ref={ref} className="absolute bottom-14 left-1/2 z-[8000] flex max-h-[calc(100%-70px)] w-[600px] max-w-[96%] -translate-x-1/2 flex-col overflow-hidden rounded-[10px] border border-white/60 bg-[#eef2f7]/95 shadow-[0_18px_50px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <div className="p-5 pb-3">
        <div className="relative">
          <Search size={14} className="absolute top-2.5 left-3 text-slate-500" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose()
              if (e.key === 'Enter' && q) {
                if (results[0] && !cmd?.kind.startsWith('app')) return launch(results[0])
                onClose()
                desk.runCommand(query, e.ctrlKey && e.shiftKey)
              }
            }}
            placeholder="Nach Apps, Einstellungen und Befehlen suchen"
            className="h-9 w-full rounded-full border border-[#d0d0d0] bg-white pr-3 pl-9 text-[12px] outline-none focus:border-b-2 focus:border-b-[#005fb8]"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-5 pb-3">
        {q ? (
          <div>
            <div className="mb-1.5 text-[12px] font-semibold text-slate-700">Höchste Übereinstimmung</div>
            {cmd && cmd.kind !== 'error' && (
              <button
                type="button"
                onClick={() => {
                  onClose()
                  desk.runCommand(query)
                }}
                className="mb-1 flex w-full items-center gap-3 rounded-[6px] bg-white/80 p-2 text-left hover:bg-white"
              >
                <Play size={20} className="text-[#005fb8]" />
                <span className="flex-1 text-[12px]">
                  <span className="font-mono">{query}</span>
                  <span className="block text-[11px] text-slate-500">Befehl ausführen</span>
                </span>
              </button>
            )}
            {results.map((a) => {
              const Icon = a.icon
              return (
                <button key={a.id} type="button" onClick={() => launch(a)} onContextMenu={(e) => ctx.open(e, a)} className="flex w-full items-center gap-3 rounded-[6px] p-2 text-left hover:bg-white/80">
                  <Icon size={20} className={a.tint} />
                  <span className="text-[12px]">
                    {a.title}
                    <span className="block text-[11px] text-slate-500">App</span>
                  </span>
                </button>
              )
            })}
            {!results.length && (!cmd || cmd.kind === 'error') && <div className="py-6 text-center text-[12px] text-slate-500">Keine Ergebnisse für „{query}“.</div>}
          </div>
        ) : all ? (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[12px] font-semibold">Alle Apps</span>
              <button type="button" className="rounded bg-white px-2 py-0.5 text-[11px] hover:bg-slate-50" onClick={() => setAll(false)}>
                ‹ Zurück
              </button>
            </div>
            {[...APP_LIST]
              .filter((a) => a.keywords)
              .sort((a, b) => a.title.localeCompare(b.title, 'de'))
              .map((a) => {
                const Icon = a.icon
                return (
                  <button key={a.id} type="button" onClick={() => launch(a)} onContextMenu={(e) => ctx.open(e, a)} className="flex w-full items-center gap-3 rounded-[6px] px-2 py-1.5 text-left text-[12px] hover:bg-white/80">
                    <Icon size={18} className={a.tint} />
                    {a.title}
                  </button>
                )
              })}
          </div>
        ) : (
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[12px] font-semibold">Angeheftet</span>
              <button type="button" className="flex items-center gap-0.5 rounded bg-white px-2 py-0.5 text-[11px] hover:bg-slate-50" onClick={() => setAll(true)}>
                Alle Apps <ChevronRight size={11} />
              </button>
            </div>
            <div className="grid grid-cols-6 gap-0.5">{APP_LIST.filter((a) => a.pinned).map(tile)}</div>
            <div className="mt-3 mb-1 text-[12px] font-semibold">Schnellzugriff</div>
            <button
              type="button"
              onClick={() => {
                onClose()
                desk.showRun()
              }}
              className="flex items-center gap-2 rounded-[6px] px-2 py-1.5 text-[12px] hover:bg-white/80"
            >
              <Play size={16} className="text-[#005fb8]" /> Ausführen … <span className="text-[11px] text-slate-500">(Win+R)</span>
            </button>
          </div>
        )}
      </div>
      <div className="relative flex items-center justify-between border-t border-black/5 bg-black/[0.03] px-6 py-2.5">
        <button type="button" className="flex items-center gap-2 rounded-[6px] px-2 py-1 hover:bg-white/70" onClick={() => setUserMenu(!userMenu)}>
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#005fb8] text-[11px] font-semibold text-white">{initials(userName)}</span>
          <span className="text-[12px]">{userName}</span>
        </button>
        {userMenu && (
          <div className="absolute bottom-12 left-6 w-56 rounded-[6px] border border-[#d6d6d6] bg-[#fbfbfb] py-1 text-[12px] shadow-xl">
            <div className="px-3 py-1.5 text-slate-500">MUSTERWERK\{userSam}</div>
            <MenuBtn icon={<Lock size={14} />} onClick={onLock}>
              Sperren
            </MenuBtn>
            <MenuBtn icon={<LogOut size={14} />} onClick={onLock}>
              Abmelden
            </MenuBtn>
          </div>
        )}
        <button type="button" title="Ein/Aus" className="rounded-[6px] p-2 hover:bg-white/70" onClick={() => setPower(!power)}>
          <Power size={16} />
        </button>
        {power && (
          <div className="absolute right-6 bottom-12 w-60 rounded-[6px] border border-[#d6d6d6] bg-[#fbfbfb] py-1 text-[12px] shadow-xl">
            <MenuBtn icon={<Unplug size={14} />} onClick={onDisconnect}>
              Trennen (Remotesitzung beenden)
            </MenuBtn>
            <MenuBtn
              icon={<RotateCcw size={14} />}
              onClick={() => {
                onClose()
                desk.requestReboot()
              }}
            >
              Neu starten
            </MenuBtn>
            <MenuBtn icon={<Power size={14} />} disabled title="Ein ausgeschaltetes Gerät kann remote nicht wieder eingeschaltet werden.">
              Herunterfahren (nicht empfohlen)
            </MenuBtn>
          </div>
        )}
      </div>
      {ctx.menu && (
        <ContextMenu
          x={ctx.menu.x}
          y={ctx.menu.y}
          onClose={ctx.close}
          items={[
            { label: 'Öffnen', bold: true, onClick: () => launch(ctx.menu!.data) },
            { label: 'Als Administrator ausführen', disabled: !ctx.menu.data.elevatable && ctx.menu.data.id !== 'cmd' && ctx.menu.data.id !== 'powershell', onClick: () => runAdmin(ctx.menu!.data) },
          ]}
        />
      )}
    </div>
  )
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((x) => x[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase()

function MenuBtn({ icon, children, onClick, disabled, title }: { icon: React.ReactNode; children: React.ReactNode; onClick?: () => void; disabled?: boolean; title?: string }) {
  return (
    <button type="button" disabled={disabled} title={title} onClick={onClick} className={cx('flex w-full items-center gap-2.5 px-3 py-1.5 text-left hover:bg-[#e8eef7] disabled:text-slate-400 disabled:hover:bg-transparent')}>
      {icon}
      {children}
    </button>
  )
}
