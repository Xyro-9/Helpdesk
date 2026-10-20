// Verteilt eine Route auf die Komponente der simulierten Website.

import { CloudAdminSite } from './cloudadmin/CloudAdmin'
import { CloudLoginSite } from './cloudadmin/Login'
import { GenericHostPage, SuspiciousPage } from './ErrorPages'
import { CompanySite } from './sites/Company'
import { CloudStatusSite, VpnSite } from './sites/Misc'
import { ErpSite } from './sites/Erp'
import { IntranetSite } from './sites/Intranet'
import { KbSite } from './sites/Kb'
import { KontoSite } from './sites/Konto'
import { NewsSite } from './sites/News'
import { PhishingSite } from './sites/Phishing'
import { PrinterSite } from './sites/Printer'
import { SearchSite } from './sites/Search'
import { StatusSite } from './sites/Status'
import { TechDocsSite } from './sites/TechDocs'
import { TrackingSite } from './sites/Tracking'
import { WebmailSite } from './sites/Webmail'
import type { PageApi, Route } from './types'

export interface SiteProps {
  api: PageApi
  route: Route
}

export function SiteView({ route, api }: SiteProps) {
  switch (route.site) {
    case 'intranet':
      return <IntranetSite api={api} route={route} />
    case 'kb':
      return <KbSite api={api} route={route} />
    case 'status':
      return <StatusSite api={api} route={route} />
    case 'erp':
      return <ErpSite api={api} route={route} />
    case 'konto':
      return <KontoSite api={api} route={route} />
    case 'cloudadmin':
      return <CloudAdminSite api={api} route={route} />
    case 'cloudlogin':
      return <CloudLoginSite api={api} route={route} />
    case 'cloudstatus':
      return <CloudStatusSite api={api} route={route} />
    case 'webmail':
      return <WebmailSite api={api} route={route} />
    case 'search':
      return <SearchSite api={api} route={route} />
    case 'techdocs':
      return <TechDocsSite api={api} route={route} />
    case 'phishing':
      return <PhishingSite api={api} route={route} />
    case 'company':
      return <CompanySite api={api} route={route} />
    case 'tracking':
      return <TrackingSite api={api} route={route} />
    case 'news':
      return <NewsSite api={api} route={route} />
    case 'vpn':
      return <VpnSite api={api} route={route} />
    case 'printer':
      return <PrinterSite api={api} route={route} />
    case 'suspicious':
      return <SuspiciousPage api={api} />
    default:
      return <GenericHostPage api={api} />
  }
}
