// Arbeitsplatz-Browser des Azubis (Rechner IT-ADM-01).

import { useEffect } from 'react'
import { ensureEndpoint, getEndpoint } from '@/core/ops/endpoint'
import { useStore } from '@/core/store'
import { shortNames } from './router'
import { openBrowserTab } from './state'
import { normalizeInput } from './url'
import { WebBrowser } from './WebBrowser'

const WORKSTATION = 'IT-ADM-01'

export function BrowserView() {
  const hasEp = useStore((s) => !!getEndpoint(s.world, WORKSTATION))
  const updateWorld = useStore((s) => s.updateWorld)
  const browserUrl = useStore((s) => s.ui.browserUrl)

  useEffect(() => {
    if (!hasEp)
      updateWorld((w) => {
        ensureEndpoint(w, WORKSTATION)
      })
  }, [hasEp, updateWorld])

  // Von außen angeforderte URL (openBrowser) in neuem Tab öffnen und Anforderung quittieren,
  // damit derselbe Link erneut geöffnet werden kann.
  useEffect(() => {
    const live = useStore.getState().ui.browserUrl
    if (!browserUrl || live !== browserUrl) return
    const url = normalizeInput(browserUrl, shortNames(useStore.getState().world))
    useStore.setState((s) => {
      s.ui.browserUrl = undefined
    })
    if (url) openBrowserTab(WORKSTATION, url)
  }, [browserUrl])

  return (
    <div className="h-full p-2 @container">
      <WebBrowser hostname={WORKSTATION} className="rounded-lg border border-slate-300 shadow-sm" />
    </div>
  )
}
