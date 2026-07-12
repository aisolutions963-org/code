export const STAGE_ORDER = ['Preparing', 'Open', 'Production', 'Closed and active warranty', 'Warranty expired'] as const
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
  // 'Working' is the Phase 3 config key (matches phaseLabel 'Phase 3 — Working').
  // The project's live Project Stage during this phase is 'Production'.
  Working: {
    phaseLabel: 'Phase 3 — Working',
    triggerOrder: 29,
    perItemOrderMin: 30,
  },
  Closing: {
    phaseLabel: 'Phase 4 — Closing',
    // Phase 4 generates when all per-item tasks across all items are Completed
  },
} as const

// Phase 3 (Working) sub-stages — mirrors the Airtable "Sub-stage" field
// (Material → Fabrication → Fixing), derived from the template order ranges so the
// app can surface which part of Production a project is currently in.
export type WorkingSubStage = 'Material' | 'Fabrication' | 'Fixing'
export function workingSubStage(order: number | null | undefined): WorkingSubStage | null {
  if (order == null) return null
  if (order >= 30 && order <= 37) return 'Material'
  if (order >= 38 && order <= 43) return 'Fabrication'
  if (order >= 44 && order <= 55) return 'Fixing'
  return null
}

export const TASK_MARKERS = {
  GATE_PREFIX: '[gate]',
  AUTO_MARKER: '(auto',
  HEADLINE_PREFIX: 'to follow tasks progress',
  CALL_CLIENT_PREFIX: 'call the client',
  TAKE_APPROVAL_PREFIX: 'take approval from client',
  // Completing this task bypasses the AND-join so "inform client" unlocks immediately,
  // without waiting for paint/carpentry siblings at the same templateOrder to finish.
  FABRICATION_DONE_MARKER: 'fabrication done',
} as const

// Headline banners ("to follow tasks progress …") — purely visual, no notification.
export function isHeadlineTask(taskName: string): boolean {
  return taskName.toLowerCase().startsWith(TASK_MARKERS.HEADLINE_PREFIX)
}

// System/auto tasks: headline banners OR tasks explicitly marked "(auto…)". These are
// driven by the workflow (unlocked → completed automatically) and are never actionable
// by a user. Single source of truth for both server (workflow/generation) and UI.
export function isAutoTask(taskName: string): boolean {
  const lower = taskName.toLowerCase()
  return lower.startsWith(TASK_MARKERS.HEADLINE_PREFIX) || lower.includes(TASK_MARKERS.AUTO_MARKER)
}
