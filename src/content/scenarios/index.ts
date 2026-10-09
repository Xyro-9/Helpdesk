// Registry aller eingebauten Trainingsszenarien.
// Neue Szenario-Dateien hier importieren und an SCENARIOS anhängen.
import type { Scenario } from '@/core/scenarios/types'
import { BASIC_SCENARIOS } from './basics'

export const SCENARIOS: Scenario[] = [...BASIC_SCENARIOS]
