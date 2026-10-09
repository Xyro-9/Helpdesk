import { useEffect } from 'react'
import { useStore, type ViewId } from '@/core/store'
import { Sidebar, Toasts, Topbar } from '@/layout/Shell'
import { AdView } from '@/modules/ad'
import { AssetsView, ShippingView } from '@/modules/assets'
import { BrowserView } from '@/modules/browser'
import { ChatView, MailView, PhoneView } from '@/modules/comms'
import { CallOverlay } from '@/modules/comms/overlay'
import { DashboardView } from '@/modules/dashboard'
import { HelpView } from '@/modules/help'
import { InfraView } from '@/modules/infra'
import { KbView } from '@/modules/kb'
import { ProgressView } from '@/modules/progress'
import { ScoreReportModal } from '@/modules/progress/report'
import { RdpView } from '@/modules/rdp'
import { PowerShellView } from '@/modules/terminal'
import { TicketsView } from '@/modules/tickets'
import { TrainerView } from '@/modules/trainer'
import { TrainingView } from '@/modules/training'

const VIEWS: Record<ViewId, () => React.ReactNode> = {
  dashboard: DashboardView,
  tickets: TicketsView,
  mail: MailView,
  chat: ChatView,
  phone: PhoneView,
  ad: AdView,
  rdp: RdpView,
  browser: BrowserView,
  powershell: PowerShellView,
  infra: InfraView,
  assets: AssetsView,
  shipping: ShippingView,
  kb: KbView,
  training: TrainingView,
  progress: ProgressView,
  trainer: TrainerView,
  help: HelpView,
}

export default function App() {
  const hydrated = useStore((s) => s.hydrated)
  const view = useStore((s) => s.ui.view)
  const tick = useStore((s) => s.tick)

  // Simulationstakt: neue Tickets, verpasste Anrufe, Szenario-Dynamik
  useEffect(() => {
    if (!hydrated) return
    const t = setInterval(tick, 5000)
    return () => clearInterval(t)
  }, [hydrated, tick])

  if (!hydrated) {
    return <div className="flex h-full items-center justify-center text-slate-500">Arbeitsplatz wird geladen …</div>
  }
  const View = VIEWS[view] ?? DashboardView
  return (
    <div className="flex h-full overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="min-h-0 flex-1 overflow-auto">
          {/* RDP bleibt gemountet, damit offene Fenster beim Wechseln erhalten bleiben */}
          <div className={view === 'rdp' ? 'h-full' : 'hidden'}>
            <RdpView />
          </div>
          {view !== 'rdp' && <View />}
        </main>
      </div>
      <CallOverlay />
      <ScoreReportModal />
      <Toasts />
    </div>
  )
}
