'use client'

import { useState } from 'react'

interface ProjectNotesEditorProps {
  projectId: string
  initialNotes?: string
  editable?: boolean
  onSaved?: (notes: string) => void
}

export default function ProjectNotesEditor({
  projectId,
  initialNotes = '',
  editable = false,
  onSaved,
}: ProjectNotesEditorProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(initialNotes)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function handleSave() {
    setSaving(true)
    setErr('')
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: draft }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Failed to save')
      }
      setEditing(false)
      onSaved?.(draft)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    setDraft(initialNotes)
    setEditing(false)
    setErr('')
  }

  if (editing) {
    return (
      <div className="space-y-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          className="w-full text-xs border border-gray-300 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          placeholder="Add project notes…"
          autoFocus
        />
        {err && <p className="text-red-600 text-xs">{err}</p>}
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-xs bg-brand-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-brand-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={handleCancel}
            className="text-xs border border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg font-medium hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-2 group">
      <div className="flex-1 min-w-0">
        {initialNotes ? (
          <p className="text-xs text-gray-600 whitespace-pre-wrap">{initialNotes}</p>
        ) : (
          <p className="text-xs text-gray-400 italic">
            {editable ? 'No notes yet — click to add' : 'No notes'}
          </p>
        )}
      </div>
      {editable && (
        <button
          onClick={() => { setDraft(initialNotes); setEditing(true) }}
          className="shrink-0 text-xs text-gray-400 hover:text-brand-600 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Edit notes"
        >
          Edit
        </button>
      )}
    </div>
  )
}
