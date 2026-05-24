'use client'

import { useState } from 'react'
import { Project } from '@/lib/types'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'

export interface TeamMember { id: string; name: string; role: string }

interface AssignInstallationModalProps {
  project: Project
  members: TeamMember[]
  onClose: () => void
  onSaved: () => void
}

export default function AssignInstallationModal({
  project,
  members,
  onClose,
  onSaved,
}: AssignInstallationModalProps) {
  const current = project.assignedInstallationTeam ?? []
  const [selected, setSelected] = useState<string[]>(current)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  async function handleSave() {
    setSaving(true); setErr('')
    try {
      const res = await fetch(`/api/projects/${project.id}/assign-installation`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamMemberIds: selected }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error)
      }
      onSaved(); onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Assign Installation Team — ${project.projectName}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} loading={saving}>Save</Button>
        </>
      }
    >
      <div className="space-y-2 text-sm">
        {err && <p className="text-red-600 text-xs">{err}</p>}
        {members.length === 0 && (
          <p className="text-gray-500 text-xs">No active installation team members found.</p>
        )}
        {members.map((m) => (
          <label key={m.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer">
            <input
              type="checkbox"
              checked={selected.includes(m.id)}
              onChange={() => toggle(m.id)}
              className="rounded border-gray-300 text-brand-500 focus:ring-brand-500"
            />
            <span className="text-gray-800">{m.name}</span>
          </label>
        ))}
      </div>
    </Modal>
  )
}
