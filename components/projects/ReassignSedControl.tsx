'use client'

import { useState } from 'react'
import useSWR from 'swr'
import toast from 'react-hot-toast'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface SedMember {
  id: string
  name: string
}

export default function ReassignSedControl({ projectId, onReassigned }: { projectId: string; onReassigned: () => void }) {
  const [open, setOpen] = useState(false)
  const [sedId, setSedId] = useState('')
  const [saving, setSaving] = useState(false)
  const { data } = useSWR<{ members: SedMember[] }>(open ? '/api/team/sed' : null, fetcher)
  const seds = data?.members ?? []

  async function save() {
    if (!sedId) return
    setSaving(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/reassign-sed`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ salesOwnerCollaboratorId: sedId }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? 'Failed') }
      toast.success('Reassigned')
      setOpen(false); setSedId('')
      onReassigned()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to reassign')
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(true) }}
        className="text-[11px] font-medium text-gray-500 hover:text-gray-700"
      >
        Reassign SED
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <select
        value={sedId}
        onChange={(e) => setSedId(e.target.value)}
        className="text-[11px] border border-gray-200 rounded px-1.5 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
      >
        <option value="">Select SED…</option>
        {seds.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
      <button onClick={save} disabled={saving || !sedId} className="text-[11px] font-semibold text-blue-600 disabled:opacity-40">
        {saving ? '…' : 'Save'}
      </button>
      <button onClick={() => { setOpen(false); setSedId('') }} className="text-[11px] text-gray-400 hover:text-gray-600">
        Cancel
      </button>
    </div>
  )
}
