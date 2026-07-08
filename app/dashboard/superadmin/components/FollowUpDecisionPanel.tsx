'use client'

import { useState } from 'react'
import { Task } from '@/lib/types'
import { FollowUpChoice } from './types'

export default function FollowUpDecisionPanel({ task, onDone }: { task: Task; onDone: () => void }) {
  const [choice, setChoice] = useState<FollowUpChoice | ''>('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const options: { value: FollowUpChoice; label: string; desc: string; color: string }[] = [
    {
      value: 'Reject Project',
      label: 'Reject project',
      desc: 'Mark project as Not Approved. SED and manager will be notified.',
      color: 'border-red-300 bg-red-50 hover:bg-red-100 text-red-800',
    },
    {
      value: 'SED to Follow Up',
      label: 'Ask SED to take action',
      desc: 'Notify the assigned SED to follow up with the client or take next steps.',
      color: 'border-green-300 bg-green-50 hover:bg-green-100 text-green-800',
    },
    {
      value: 'Manager to Follow Up',
      label: 'Ask manager to follow up',
      desc: 'Notify the manager to contact the client or coordinate with SED.',
      color: 'border-yellow-300 bg-yellow-50 hover:bg-yellow-100 text-yellow-800',
    },
  ]

  async function submit() {
    if (!choice) return
    setSaving(true); setErr('')
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { followUpOutcome: choice, status: 'Completed' } }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? 'Failed') }
      onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed')
      setSaving(false)
    }
  }

  return (
    <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <svg className="w-4 h-4 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
        <p className="text-sm font-semibold text-amber-800">
          Inactivity detected — {task.projectRef ?? ''} {task.projectName ? `— ${task.projectName}` : ''}
        </p>
      </div>
      <p className="text-xs text-amber-700">This project has had no activity for 3+ days. Choose an action:</p>
      <div className="space-y-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => setChoice(o.value)}
            className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${choice === o.value ? 'ring-2 ring-offset-1 ring-amber-400 ' : ''}${o.color}`}
          >
            <p className="font-semibold">{o.label}</p>
            <p className="text-xs opacity-80 mt-0.5">{o.desc}</p>
          </button>
        ))}
      </div>
      {err && <p className="text-xs text-red-600">{err}</p>}
      <button
        type="button"
        disabled={!choice || saving}
        onClick={submit}
        className="w-full py-2 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:opacity-40 transition-colors"
      >
        {saving ? 'Saving…' : 'Confirm decision'}
      </button>
    </div>
  )
}
