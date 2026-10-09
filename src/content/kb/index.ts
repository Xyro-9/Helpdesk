// Wissensdatenbank – Startartikel. (Wird vom Content-Paket erweitert.)
import type { KbArticle } from '@/core/types'

export const KB_ARTICLES: KbArticle[] = [
  {
    id: 'KB0001',
    title: 'Konto gesperrt – Benutzer entsperren',
    category: 'Konto & Zugriff',
    tags: ['AD', 'Sperre', 'Lockout'],
    body: '# Konto gesperrt\n\n1. Identität prüfen.\n2. In "Active Directory" Benutzer suchen → **Konto entsperren**.\n3. Ursache klären (Sperrquelle im DC-Sicherheitsprotokoll, Ereignis 4740).',
    author: 'Marie Frank',
    updated: '2026-06-01T08:00:00.000Z',
    views: 0,
    helpful: 0,
  },
]
