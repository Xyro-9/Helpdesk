// Platzhalter – simulierter Webbrowser. Wird vom Browser-Modul implementiert.
export interface WebBrowserProps {
  /** Endpunkt, von dem aus gesurft wird (Netzwerk/Proxy/hosts dieses Rechners gelten) */
  hostname: string
  initialUrl?: string
  className?: string
}

export function WebBrowser({ hostname, initialUrl }: WebBrowserProps) {
  return <div className="p-4 text-sm text-slate-500">Webbrowser ({hostname}) wird gebaut … {initialUrl}</div>
}
