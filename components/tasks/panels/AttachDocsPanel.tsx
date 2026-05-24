'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { Task, TaskUpdateInput } from '@/lib/types'

const DOC_LABELS = [
  'Material List',
  'Final Design',
  'MEP Drawing',
  'Site Photo',
  'Site Size',
  'Logistics',
  'Sample Code & Photo',
] as const

interface AttachDocsPanelProps {
  task: Task
  onUpdate: (id: string, fields: Partial<TaskUpdateInput>) => Promise<void>
}

export default function AttachDocsPanel({ task, onUpdate }: AttachDocsPanelProps) {
  const [docUrls, setDocUrls] = useState<string[]>(() =>
    DOC_LABELS.map((label) => task.taskDocLinks?.find((l) => l.label === label)?.url ?? ''),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleComplete() {
    setError('')
    const links = DOC_LABELS.map((label, i) => ({ label, url: docUrls[i].trim() }))
    if (links.some((l) => !l.url)) {
      setError('All 7 documents must have a URL before clicking Done')
      return
    }
    setSaving(true)
    try {
      await onUpdate(task.id, { taskDocLinks: links, status: 'Completed' } as Partial<TaskUpdateInput>)
      toast.success('Documents saved — Phase 3 is being generated')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
      toast.error('Failed')
    } finally {
      setSaving(false)
    }
  }

  if (task.status === 'Completed') {
    if (!task.taskDocLinks?.length) return null
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-3 space-y-1">
        <p className="text-xs font-semibold text-green-800 mb-1.5">Documents Attached</p>
        {task.taskDocLinks.map((l) => (
          <div key={l.label} className="flex items-center gap-2">
            <span className="text-xs text-green-700 w-36 shrink-0 font-medium">{l.label}</span>
            <a
              href={l.url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-green-600 hover:underline truncate"
            >
              {l.url}
            </a>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="bg-violet-50 border border-violet-200 rounded-lg px-3 py-3 space-y-2">
      <p className="text-xs font-semibold text-violet-800">
        Attach 7 Documents
        <span className="font-normal text-violet-600 ml-1">
          — all links required before clicking Done
        </span>
      </p>
      <div className="space-y-1.5">
        {DOC_LABELS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <span className="text-xs font-medium text-violet-700 w-36 shrink-0">{label}</span>
            <input
              className="flex-1 border border-violet-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white"
              placeholder="https://…"
              value={docUrls[i]}
              onChange={(e) =>
                setDocUrls((prev) => prev.map((u, idx) => (idx === i ? e.target.value : u)))
              }
            />
          </div>
        ))}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex justify-end pt-1">
        <button
          onClick={handleComplete}
          disabled={saving || docUrls.some((u) => !u.trim())}
          className="px-4 py-1.5 text-xs rounded-lg bg-violet-600 text-white font-medium hover:bg-violet-700 disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Click Done — All Documents Attached'}
        </button>
      </div>
    </div>
  )
}
