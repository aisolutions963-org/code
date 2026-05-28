export const STAGE_ORDER = ['Preparing', 'Open', 'Installation Completed', 'Closed'] as const
export type Stage = (typeof STAGE_ORDER)[number]

export const PHASE_CONFIG = {
  Preparing: {
    autoCompleteFirstTask: true,
    universalActionOrderMin: 3,
    universalActionOrderMax: 18,
  },
  Open: {
    autoCompleteFirstTask: false,
    projectLevelOrderMax: 22,
    perItemOrderMin: 23,
    phaseLabel: 'Phase 2 — Opening',
  },
  Working: {
    phaseLabel: 'Phase 3 — Working',
    triggerOrder: 29,
    perItemOrderMin: 31,
  },
  Closing: {
    phaseLabel: 'Phase 4 — Closing',
    // Task name prefix that triggers Phase 4 generation on completion
    triggerTaskPrefix: 'handing over form',
  },
} as const

export const TASK_MARKERS = {
  GATE_PREFIX: '[gate]',
  AUTO_MARKER: '(auto)',
  HEADLINE_PREFIX: 'to follow tasks progress',
  CALL_CLIENT_PREFIX: 'call the client',
  TAKE_APPROVAL_PREFIX: 'take approval from client',
} as const
