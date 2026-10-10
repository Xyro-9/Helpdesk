// Kleine Anzeige-Bausteine für Szenarien (Kanal-Symbol, Schwierigkeit)

import { Globe, Mail, MapPin, MessageSquare, Phone, Star } from 'lucide-react'
import type { Channel } from '@/core/types'
import { cx } from '@/ui'

export function ChannelIcon({ channel, size = 16, className }: { channel: Channel; size?: number; className?: string }) {
  const p = { size, className, 'aria-hidden': true as const }
  switch (channel) {
    case 'Telefon':
      return <Phone {...p} />
    case 'E-Mail':
      return <Mail {...p} />
    case 'Chat':
      return <MessageSquare {...p} />
    case 'Vor Ort':
      return <MapPin {...p} />
    default:
      return <Globe {...p} />
  }
}

export function ChannelLabel({ channel, className }: { channel: Channel; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1 text-xs text-slate-600', className)} title={`Kanal: ${channel}`}>
      <ChannelIcon channel={channel} size={14} />
      {channel}
    </span>
  )
}

export const DIFFICULTY_LABEL: Record<1 | 2 | 3, string> = { 1: 'Einsteiger', 2: 'Fortgeschritten', 3: 'Profi' }

export function Stars({ value, size = 14 }: { value: 1 | 2 | 3; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" title={`Schwierigkeit ${value} von 3 – ${DIFFICULTY_LABEL[value]}`} aria-label={`Schwierigkeit ${value} von 3`}>
      {[1, 2, 3].map((i) => (
        <Star key={i} size={size} className={i <= value ? 'fill-amber-400 text-amber-400' : 'text-slate-300'} aria-hidden />
      ))}
    </span>
  )
}

export const CHANNELS: Channel[] = ['Telefon', 'E-Mail', 'Chat', 'Portal', 'Vor Ort']
