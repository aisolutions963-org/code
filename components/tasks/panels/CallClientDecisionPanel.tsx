'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'

type CallOutcome = 'approved' | 'review' | 'refused'

const OUTCOME_CONFIG: Record<CallOutcome, {
  label: string
  description: string
  consequence: string
  color: string
  confirmColor: string
}> = {
  approved: {
    label: 'Approved',
    description: 'Client confirmed — project moves forward',
    consequence: 'Project advances to Phase 2 (Open) and Phase 2 tasks are generated.',
    color: 'border-green-300 bg-green-50 text-green-800 hover:bg-green-100',
    confirmColor: 'bg-green-600 hover:bg-green-700 text-white',
  },
  review: {
    label: 'Needs Review',
    description: 'Client wants changes — repeat action steps',
    consequence: 'Action tasks (paths, gates) are reset to To Do. SED restarts the action flow.',
    color: 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100',
    confirmColor: 'bg-amber-500 hover:bg-amber-600 text-white',
  },
  refused: {
    label: 'Rejected',
    description: 'Client declined — project rejected',
    consequence: 'Project is marked Not Approved. No further tasks will be generated.',
    color: 'border-red-300 bg-red-50 text-red-800 hover:bg-red-100',
    confirmColor: 'bg-red-600 hover:bg-red-700 text-white',
  },
}

interface Props {
  taskId: string
  onDecided: () => void
}

export default function CallClientDecisionPanel({ taskId, onDecided }: Props) {
  const [pending, setPending] = useState<CallOutcome | null>(null)
  const [saving, setSaving] = useState(false)

  async function confirm() {
    if (!pending) return
    setSaving(true)
    try {
      const res = await fetch(`/api/tasks/${taskId}/call-outcome`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome: pending }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Failed')
      }
      toast.success(`Recorded: ${OUTCOME_CONFIG[pending].label}`)
      onDecided()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to record outcome')
      setSaving(false)
      setPending(null)
    }
  }

  if (pending) {
    const cfg = OUTCOME_CONFIG[pending]
    return (
      <div className="mt-4 border border-gray-200 rounded-lg p-3 bg-gray-50 space-y-3">
        <p className="text-xs font-semibold text-gray-700">Confirm outcome: {cfg.label}</p>
        <p className="text-xs text-gray-500">{cfg.consequence}</p>
        <div className="flex gap-2">
          <button
            onClick={confirm}
            disabled={saving}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60 ${cfg.confirmColor}`}
          >
            {saving ? 'Saving…' : `Confirm ${cfg.label}`}
          </button>
          <button
            onClick={() => setPending(null)}
            disabled={saving}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-4 space-y-2">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
        Call Outcome — End of Phase 1
      </p>
      <div className="grid grid-cols-1 gap-2">
        {(Object.entries(OUTCOME_CONFIG) as [CallOutcome, typeof OUTCOME_CONFIG[CallOutcome]][]).map(
          ([key, cfg]) => (
            <button
              key={key}
              onClick={() => setPending(key)}
              className={`text-left border rounded-lg px-3 py-2.5 transition-colors ${cfg.color}`}
            >
              <p className="text-xs font-bold">{cfg.label}</p>
              <p className="text-[11px] opacity-80 mt-0.5">{cfg.description}</p>
            </button>
          ),
        )}
      </div>
    </div>
  )
}
