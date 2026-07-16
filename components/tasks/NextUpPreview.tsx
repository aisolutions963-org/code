import { NextStepHint } from '@/lib/types'

// Muted, non-interactive hint of the next step in the workflow. When the current step belongs
// to a department the viewer can't act on, it renders as an amber "Waiting on <dept>" instead of
// the misleading gray "Next up" (which would point at a step blocked behind that hidden one).
export default function NextUpPreview({ hint }: { hint: NextStepHint }) {
  if (hint.waiting) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-amber-300 bg-amber-50 text-xs">
        <svg className="w-3.5 h-3.5 shrink-0 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="font-semibold text-amber-700 shrink-0">
          Waiting on {hint.by ?? 'another team'}:
        </span>
        <span className="text-amber-700 truncate">{hint.label}</span>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-gray-200 bg-gray-50 text-xs">
      <svg className="w-3.5 h-3.5 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
      <span className="font-semibold text-gray-500 shrink-0">Next up:</span>
      <span className="text-gray-500 truncate">{hint.label}</span>
    </div>
  )
}
