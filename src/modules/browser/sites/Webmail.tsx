// Webmail (mail.cloudadmin.example): einfache Lesesicht des Helpdesk-Postfachs.

import { ExternalLink, Inbox, LogOut, Mail, Paperclip, TriangleAlert } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { findCloudUser } from '@/core/ops/cloud'
import { useStore } from '@/core/store'
import type { MailMessage } from '@/core/types'
import { fmtDateTime } from '@/core/util'
import { cx } from '@/ui'
import { setSession, useSession } from '../session'
import type { SiteProps } from '../SiteView'
import { Linkify, useTitle } from '../shared'
import { CLOUD_LOGIN_URL } from '../url'

const FOLDERS: MailMessage['folder'][] = ['Posteingang', 'Gesendet', 'Archiv', 'Papierkorb']

export function WebmailSite({ api }: SiteProps) {
  const session = useSession(api.hostname, 'cloud')
  const world = useStore((s) => s.world)
  const cu = session ? findCloudUser(world, session.user) : undefined
  const valid = !!cu && !!session && !cu.signInBlocked && !(cu.sessionsRevokedAt && Date.parse(cu.sessionsRevokedAt) > session.at)
  useTitle(api, 'Webmail')
  useEffect(() => {
    if (!valid) api.navigate(`${CLOUD_LOGIN_URL}?ru=${encodeURIComponent(api.href)}`, { replace: true })
  }, [valid, api])
  const [folder, setFolder] = useState<MailMessage['folder']>('Posteingang')
  const [sel, setSel] = useState<string>()
  const own = cu?.sam === world.tech.sam
  const mails = useMemo(() => (own ? world.mails.filter((m) => m.folder === folder).sort((a, b) => b.date.localeCompare(a.date)) : []), [own, world.mails, folder])
  const cur = mails.find((m) => m.id === sel)
  if (!valid || !cu) return null
  return (
    <div className="flex h-full flex-col bg-white">
      <header className="flex items-center gap-2 bg-indigo-700 px-3 py-2 text-white">
        <Mail size={18} /> <span className="font-semibold">Webmail</span>
        <span className="ml-auto truncate text-xs text-indigo-100">{cu.upn}</span>
        <button type="button" onClick={() => setSession(api.hostname, 'cloud')} className="flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-indigo-600">
          <LogOut size={13} /> Abmelden
        </button>
      </header>
      <div className="flex flex-wrap items-center gap-2 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
        Nur Lesesicht. Vollständige Bearbeitung (Antworten, Verschieben …) im Modul E-Mail.
        <button type="button" onClick={() => useStore.getState().navigate('mail')} className="flex items-center gap-1 font-medium underline">
          <ExternalLink size={12} /> Modul E-Mail öffnen
        </button>
      </div>
      <div className="flex min-h-0 flex-1">
        <nav className="hidden w-40 shrink-0 border-r border-slate-200 p-2 @2xl:block">
          {FOLDERS.map((f) => (
            <button key={f} type="button" onClick={() => setFolder(f)} className={cx('flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm', folder === f ? 'bg-indigo-50 font-medium text-indigo-800' : 'text-slate-700 hover:bg-slate-50')}>
              <Inbox size={14} /> {f}
            </button>
          ))}
        </nav>
        <div className={cx('min-h-0 w-full overflow-auto border-r border-slate-200 @3xl:w-80 @3xl:shrink-0', cur && 'hidden @3xl:block')}>
          {!own && <div className="p-4 text-sm text-slate-500">In der Simulation sind für dieses Postfach keine Nachrichten verfügbar.</div>}
          {mails.map((m) => (
            <button key={m.id} type="button" onClick={() => setSel(m.id)} className={cx('block w-full border-b border-slate-100 px-3 py-2 text-left', sel === m.id ? 'bg-indigo-50' : 'hover:bg-slate-50')}>
              <div className={cx('truncate text-sm', !m.read && 'font-semibold')}>{m.from.name}</div>
              <div className="truncate text-xs text-slate-700">{m.subject}</div>
              <div className="text-[11px] text-slate-400">{fmtDateTime(m.date)}</div>
            </button>
          ))}
          {own && !mails.length && <div className="p-4 text-sm text-slate-500">Dieser Ordner ist leer.</div>}
        </div>
        <div className={cx('min-h-0 flex-1 overflow-auto p-4', !cur && 'hidden @3xl:block')}>
          {cur ? (
            <>
              <button type="button" className="mb-2 text-xs text-indigo-700 @3xl:hidden" onClick={() => setSel(undefined)}>
                ← Zurück zur Liste
              </button>
              <h2 className="text-lg font-semibold text-slate-900">{cur.subject}</h2>
              <div className="mt-1 text-xs text-slate-600">
                Von: {cur.from.name} &lt;{cur.from.address}&gt; · {fmtDateTime(cur.date)}
              </div>
              {cur.from.address && !cur.from.address.endsWith('@musterwerk.example') && (
                <div className="mt-2 flex items-center gap-1.5 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
                  <TriangleAlert size={13} /> Externer Absender – Vorsicht bei Links und Anhängen.
                </div>
              )}
              <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                <Linkify api={api} text={cur.body} />
              </div>
              {!!cur.attachments.length && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {cur.attachments.map((a) => (
                    <span key={a.name} className="flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-xs">
                      <Paperclip size={12} /> {a.name}
                    </span>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="pt-10 text-center text-sm text-slate-400">Nachricht auswählen</div>
          )}
        </div>
      </div>
    </div>
  )
}
