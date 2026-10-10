// Eine Remotesitzung: Verbindungsaufbau (Animation + Prüfungen), Fehler, Trennung, Desktop.

import { CircleX, Monitor, RotateCcw, Server, Unplug } from 'lucide-react'
import { useEffect, useState } from 'react'
import { A } from '@/core/actions'
import { ensureEndpoint } from '@/core/ops/endpoint'
import { useStore } from '@/core/store'
import { linkCheck, lookupTarget } from './connect'
import { Desktop } from './Desktop'
import { useRdp } from './store'
import { WBtn } from './ui'

const STEPS = ['Remotecomputer wird gesucht …', 'Verbindung wird gesichert …', 'Anmeldeinformationen werden geprüft …', 'Remotesitzung wird konfiguriert …']

export function Session({ sessionKey, active }: { sessionKey: string; active: boolean }) {
  const ses = useRdp((s) => s.sessions[sessionKey])
  const patch = useRdp((s) => s.patch)
  const updateWorld = useStore((s) => s.updateWorld)
  const log = useStore((s) => s.log)
  const phase = ses?.phase
  const attempt = ses?.attempt ?? 0
  const host = ses?.host ?? sessionKey

  // Verbindungsaufbau
  useEffect(() => {
    if (phase !== 'connecting') return
    const t = setTimeout(() => {
      const look = lookupTarget(useStore.getState().world, sessionKey)
      if (look.error || !look.computer) {
        patch(sessionKey, { phase: 'failed', error: look.error })
        return
      }
      const name = look.computer.name
      updateWorld((w) => {
        ensureEndpoint(w, name)
        ensureEndpoint(w, w.tech.workstation)
      })
      const w = useStore.getState().world
      const err = linkCheck(w, name)
      if (err) {
        patch(sessionKey, { phase: 'failed', error: err, host: name })
        return
      }
      patch(sessionKey, { phase: 'connected', host: name, banner: !!w.endpoints[name]?.loggedOnUser, rebootUntil: undefined, reason: undefined })
      log({ type: A.rdpConnected, target: name })
    }, 1700)
    return () => clearTimeout(t)
  }, [phase, attempt, sessionKey, patch, updateWorld, log])

  // Verbindung überwachen (Neustart, Netzwerk, Dienst)
  const linkErr = useStore((s) => {
    if (phase !== 'connected') return ''
    const e = linkCheck(s.world, host)
    return e ? (e.details ?? e.message) : ''
  })
  useEffect(() => {
    if (phase === 'connected' && linkErr) patch(sessionKey, { phase: 'disconnected', reason: linkErr })
  }, [phase, linkErr, sessionKey, patch])

  if (!ses) return null
  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0b2447]">
      {(ses.phase === 'connected' || ses.phase === 'disconnected') && <Desktop sessionKey={sessionKey} host={ses.host} active={active && ses.phase === 'connected'} />}
      {ses.phase === 'connecting' && <Connecting host={sessionKey} attempt={ses.attempt} />}
      {ses.phase === 'failed' && ses.error && (
        <Overlay>
          <div className="w-[480px] max-w-[94%] overflow-hidden rounded-[8px] border border-[#c8c8c8] bg-white text-[12px] shadow-2xl">
            <div className="flex items-center gap-2 bg-[#f3f3f3] px-3 py-2">
              <Monitor size={14} className="text-[#005fb8]" /> {ses.error.title}
            </div>
            <div className="flex gap-3 p-4">
              {ses.error.server ? <Server size={30} className="shrink-0 text-[#005fb8]" /> : <CircleX size={30} className="shrink-0 fill-rose-600 text-white" />}
              <div className="min-w-0">
                <p className="whitespace-pre-wrap">{ses.error.message}</p>
                {ses.error.details && <Details text={ses.error.details} />}
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-[#e3e3e3] bg-[#f3f3f3] px-4 py-2.5">
              {ses.error.server ? (
                <WBtn primary onClick={() => useStore.getState().navigate('infra')}>
                  Zum Modul Infrastruktur
                </WBtn>
              ) : (
                <WBtn primary onClick={() => useRdp.getState().connectStart(sessionKey)}>
                  Erneut versuchen
                </WBtn>
              )}
              <WBtn onClick={() => useStore.getState().closeRdp(sessionKey)}>Schließen</WBtn>
            </div>
          </div>
        </Overlay>
      )}
      {ses.phase === 'disconnected' && <Disconnected sessionKey={sessionKey} host={ses.host} reason={ses.reason} rebootUntil={ses.rebootUntil} />}
    </div>
  )
}

function Overlay({ children }: { children: React.ReactNode }) {
  return <div className="absolute inset-0 z-[9900] flex items-center justify-center bg-[#0b2447]/70 backdrop-blur-[2px]">{children}</div>
}

function Details({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-2">
      <button type="button" className="text-[#005fb8] hover:underline" onClick={() => setOpen(!open)}>
        {open ? '▾ Details ausblenden' : '▸ Details anzeigen'}
      </button>
      {open && <div className="mt-1 rounded border border-[#e3e3e3] bg-[#fafafa] p-2 font-mono text-[11px] whitespace-pre-wrap">{text}</div>}
    </div>
  )
}

function Connecting({ host, attempt }: { host: string; attempt: number }) {
  const [step, setStep] = useState(0)
  useEffect(() => {
    setStep(0)
    const t = setInterval(() => setStep((s) => Math.min(STEPS.length - 1, s + 1)), 420)
    return () => clearInterval(t)
  }, [attempt])
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-[#0b2447] to-[#19376d] text-white">
      <Monitor size={48} strokeWidth={1.2} className="mb-4 text-sky-300" />
      <div className="mb-1 text-[16px]">Verbindung mit {host} wird hergestellt …</div>
      <div className="mb-5 text-[12px] text-white/70">{STEPS[step]}</div>
      <div className="flex gap-1.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/80" style={{ animationDelay: `${i * 0.12}s` }} />
        ))}
      </div>
      <div className="mt-6 text-[11px] text-white/50">Benutzer: MUSTERWERK\azubi</div>
    </div>
  )
}

function Disconnected({ sessionKey, host, reason, rebootUntil }: { sessionKey: string; host: string; reason?: string; rebootUntil?: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!rebootUntil) return
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [rebootUntil])
  const reboot = reason === 'reboot'
  const wait = rebootUntil ? Math.max(0, Math.ceil((rebootUntil - now) / 1000)) : 0
  return (
    <Overlay>
      <div className="w-[440px] max-w-[94%] rounded-[8px] border border-[#c8c8c8] bg-white p-5 text-[12px] shadow-2xl">
        <div className="mb-2 flex items-center gap-2 text-[15px] font-semibold">
          {reboot ? <RotateCcw size={18} className={wait ? 'animate-spin text-[#005fb8]' : 'text-[#005fb8]'} /> : <Unplug size={18} className="text-rose-600" />}
          Verbindung getrennt
        </div>
        <p className="mb-2">{reboot ? (wait ? `${host} wird neu gestartet … (ca. ${wait} s)` : `${host} wurde neu gestartet. Sie können sich jetzt erneut verbinden.`) : `Die Remotesitzung mit ${host} wurde getrennt.`}</p>
        {!reboot && reason && <p className="mb-2 rounded border border-[#eee] bg-[#fafafa] p-2 font-mono text-[11px] whitespace-pre-wrap">{reason}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <WBtn primary disabled={wait > 0} onClick={() => useRdp.getState().connectStart(sessionKey)}>
            Erneut verbinden
          </WBtn>
          <WBtn onClick={() => useStore.getState().closeRdp(sessionKey)}>Schließen</WBtn>
        </div>
      </div>
    </Overlay>
  )
}
