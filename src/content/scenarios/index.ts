// Registry aller eingebauten Trainingsszenarien.
// Neue Szenario-Dateien hier importieren und an SCENARIOS anhängen.
import type { Scenario } from '@/core/scenarios/types'
import { ACCOUNT_SCENARIOS } from './accounts'
import { BASIC_SCENARIOS } from './basics'
import { CLOUD_SCENARIOS } from './cloud'
import { ENDPOINT_SCENARIOS } from './endpoint'
import { HARDWARE_SCENARIOS } from './hardware'
import { LIFECYCLE_SCENARIOS } from './lifecycle'
import { NETWORK_SCENARIOS } from './network'
import { PRINTING_SCENARIOS } from './printing'
import { SECURITY_SCENARIOS } from './security'

export const SCENARIOS: Scenario[] = [
  ...BASIC_SCENARIOS,
  ...ACCOUNT_SCENARIOS,
  ...SECURITY_SCENARIOS,
  ...NETWORK_SCENARIOS,
  ...PRINTING_SCENARIOS,
  ...ENDPOINT_SCENARIOS,
  ...CLOUD_SCENARIOS,
  ...LIFECYCLE_SCENARIOS,
  ...HARDWARE_SCENARIOS,
]
