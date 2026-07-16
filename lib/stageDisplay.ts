// Single source of truth for how a project stage is presented in the UI.
//
// Covers the live PROJECTS.PROJECT_STAGE values (STAGE_ORDER in lib/phases.ts), the
// 'Not-Approved' off-ramp, AND the task-template stage vocabulary (task cards badge from
// their template's stage lookup, which uses 'Closed & Valid Maintenance'). Anything
// unmapped falls back to gray so a badge always renders — no blank/inconsistent stages.

export type StageColor = 'orange' | 'blue' | 'purple' | 'yellow' | 'green' | 'gray' | 'red'

const STAGE_COLOR: Record<string, StageColor> = {
  Preparing: 'orange',
  Open: 'blue',
  Production: 'purple',
  Closing: 'yellow',
  Closed: 'green',
  'Closed and active warranty': 'green',
  'Warranty expired': 'gray',
  'Not-Approved': 'red',
  // Task-template stage vocabulary (from the template-stage lookup on tasks)
  'Closed & Valid Maintenance': 'green',
}

const STAGE_LABEL: Record<string, string> = {
  'Not-Approved': 'Not Approved',
  'Closed and active warranty': 'Active Warranty',
  'Warranty expired': 'Warranty Expired',
  'Closed & Valid Maintenance': 'Warranty',
}

const BADGE_CLASS: Record<StageColor, string> = {
  orange: 'bg-orange-100 text-orange-700 border-orange-200',
  blue: 'bg-blue-100 text-blue-700 border-blue-200',
  purple: 'bg-purple-100 text-purple-700 border-purple-200',
  yellow: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  green: 'bg-green-100 text-green-700 border-green-200',
  gray: 'bg-gray-100 text-gray-700 border-gray-200',
  red: 'bg-red-100 text-red-700 border-red-200',
}

const ACCENT_CLASS: Record<StageColor, string> = {
  orange: 'border-l-orange-400',
  blue: 'border-l-blue-400',
  purple: 'border-l-purple-400',
  yellow: 'border-l-yellow-400',
  green: 'border-l-green-400',
  gray: 'border-l-gray-300',
  red: 'border-l-red-400',
}

export function stageColor(stage: string | undefined | null): StageColor {
  return (stage && STAGE_COLOR[stage]) || 'gray'
}

// Human-readable label (passthrough for the plain stage names).
export function stageLabel(stage: string | undefined | null): string {
  if (!stage) return ''
  return STAGE_LABEL[stage] ?? stage
}

// For the shared <Badge> component's `variant` prop (StageColor ⊆ Badge variants).
export function stageBadgeVariant(stage: string | undefined | null): StageColor {
  return stageColor(stage)
}

// Raw Tailwind classes (bg + text + border) for components that don't use <Badge>.
export function stageBadgeClass(stage: string | undefined | null): string {
  return BADGE_CLASS[stageColor(stage)]
}

// Left-border accent classes.
export function stageAccentClass(stage: string | undefined | null): string {
  return ACCENT_CLASS[stageColor(stage)]
}
