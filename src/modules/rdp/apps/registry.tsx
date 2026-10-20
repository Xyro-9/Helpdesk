// App-Katalog des Remote-Desktops

import { Activity, Binary, Cpu, Eraser, Folder, Globe, HardDrive, Info, Mail, Network, NotebookPen, Printer, ScrollText, Settings, SquareTerminal, Cog, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { TerminalApp } from '@/modules/terminal/TerminalApp'
import { WebBrowser } from '@/modules/browser/WebBrowser'
import type { AppId } from '../store'
import { DeviceManagerApp } from './DeviceManager'
import { DiskMgmtApp } from './DiskMgmt'
import { EventViewerApp } from './EventViewer'
import { CleanupApp, ExplorerApp } from './Explorer'
import { NcpaApp } from './Network'
import { NotepadApp } from './Notepad'
import { OutlookApp } from './Outlook'
import { PrintersApp, PrintQueueApp } from './Printers'
import { RegeditApp } from './Regedit'
import { ServicesApp } from './Services'
import { MsinfoApp, SettingsApp } from './Settings'
import { TaskManagerApp } from './TaskManager'
import type { AppProps } from './types'

export interface AppDef {
  id: AppId
  title: string
  icon: LucideIcon
  tint: string
  w: number
  h: number
  keywords: string
  /** im Startmenü (angeheftet) anzeigen */
  pinned?: boolean
  /** "Als Administrator ausführen" möglich */
  elevatable?: boolean
  render: (p: AppProps) => ReactNode
}

export const APPS: Record<AppId, AppDef> = {
  explorer: { id: 'explorer', title: 'Datei-Explorer', icon: Folder, tint: 'text-amber-500 fill-amber-300', w: 860, h: 520, keywords: 'explorer dieser pc dateien ordner laufwerk netzlaufwerk', pinned: true, render: (p) => <ExplorerApp {...p} /> },
  browser: { id: 'browser', title: 'Webbrowser', icon: Globe, tint: 'text-sky-600', w: 980, h: 620, keywords: 'browser internet edge web intranet', pinned: true, render: (p) => <WebBrowser hostname={p.host} initialUrl={p.args.url} className="h-full" /> },
  outlook: { id: 'outlook', title: 'E-Mail', icon: Mail, tint: 'text-[#0f6cbd]', w: 760, h: 480, keywords: 'outlook mail e-mail postfach', pinned: true, render: (p) => <OutlookApp {...p} /> },
  notepad: { id: 'notepad', title: 'Editor', icon: NotebookPen, tint: 'text-sky-700', w: 720, h: 480, keywords: 'notepad editor text hosts', pinned: true, elevatable: true, render: (p) => <NotepadApp {...p} /> },
  cmd: { id: 'cmd', title: 'Eingabeaufforderung', icon: SquareTerminal, tint: 'text-slate-700', w: 800, h: 480, keywords: 'cmd eingabeaufforderung konsole terminal ipconfig ping', pinned: true, render: (p) => <TerminalApp hostname={p.host} shell="cmd" admin className="h-full" /> },
  powershell: { id: 'powershell', title: 'Windows PowerShell (Administrator)', icon: SquareTerminal, tint: 'text-[#2a5bb8]', w: 820, h: 500, keywords: 'powershell terminal admin konsole', pinned: true, render: (p) => <TerminalApp hostname={p.host} shell="powershell" admin className="h-full" /> },
  settings: { id: 'settings', title: 'Einstellungen', icon: Settings, tint: 'text-slate-600', w: 900, h: 600, keywords: 'einstellungen systemsteuerung control proxy vpn zeit uhrzeit datum system info apps', pinned: true, render: (p) => <SettingsApp {...p} /> },
  taskmgr: { id: 'taskmgr', title: 'Task-Manager', icon: Activity, tint: 'text-emerald-600', w: 860, h: 560, keywords: 'taskmgr task-manager prozesse leistung autostart', pinned: true, render: (p) => <TaskManagerApp {...p} /> },
  services: { id: 'services', title: 'Dienste', icon: Cog, tint: 'text-slate-600', w: 920, h: 560, keywords: 'services.msc dienste dienst spooler', pinned: true, render: (p) => <ServicesApp {...p} /> },
  eventvwr: { id: 'eventvwr', title: 'Ereignisanzeige', icon: ScrollText, tint: 'text-rose-700', w: 960, h: 600, keywords: 'eventvwr ereignisanzeige protokoll log ereignis', pinned: true, render: (p) => <EventViewerApp {...p} /> },
  devmgmt: { id: 'devmgmt', title: 'Geräte-Manager', icon: Cpu, tint: 'text-slate-600', w: 640, h: 540, keywords: 'devmgmt.msc geräte-manager gerätemanager treiber hardware', pinned: true, render: (p) => <DeviceManagerApp {...p} /> },
  diskmgmt: { id: 'diskmgmt', title: 'Datenträgerverwaltung', icon: HardDrive, tint: 'text-slate-600', w: 920, h: 580, keywords: 'diskmgmt.msc datenträgerverwaltung partition volume festplatte', pinned: true, render: (p) => <DiskMgmtApp {...p} /> },
  regedit: { id: 'regedit', title: 'Registrierungs-Editor', icon: Binary, tint: 'text-sky-700', w: 900, h: 560, keywords: 'regedit registrierung registry', pinned: true, render: (p) => <RegeditApp {...p} /> },
  ncpa: { id: 'ncpa', title: 'Netzwerkverbindungen', icon: Network, tint: 'text-[#005fb8]', w: 720, h: 420, keywords: 'ncpa.cpl netzwerkverbindungen netzwerk adapter ipv4 dns ip', pinned: true, render: (p) => <NcpaApp {...p} /> },
  printers: { id: 'printers', title: 'Drucker und Scanner', icon: Printer, tint: 'text-slate-600', w: 760, h: 560, keywords: 'drucker printers scanner warteschlange', pinned: true, render: (p) => <PrintersApp {...p} /> },
  printqueue: { id: 'printqueue', title: 'Druckwarteschlange', icon: Printer, tint: 'text-slate-600', w: 680, h: 360, keywords: '', render: (p) => <PrintQueueApp {...p} /> },
  cleanmgr: { id: 'cleanmgr', title: 'Datenträgerbereinigung', icon: Eraser, tint: 'text-[#005fb8]', w: 440, h: 500, keywords: 'cleanmgr datenträgerbereinigung speicher temp bereinigen', pinned: true, render: (p) => <CleanupApp {...p} /> },
  msinfo: { id: 'msinfo', title: 'Systeminformationen', icon: Info, tint: 'text-[#005fb8]', w: 760, h: 480, keywords: 'msinfo32 systeminformationen seriennummer modell', pinned: true, render: (p) => <MsinfoApp {...p} /> },
}

export const APP_LIST = Object.values(APPS)
