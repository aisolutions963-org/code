'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { Project } from '@/lib/types'
import { todayUAE } from '@/lib/dateUtils'

const TEAMS = ['Engr. Abdulkarim', 'Mr. Al Mahdi', 'Mr. Yahia'] as const

const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500'
const sel = `${inp} bg-white`
const lbl = 'block text-xs font-medium text-gray-500 mb-1'

export default function InstallationLogModal({
  project,
  onClose,
  onCreated,
}: {
  project: Project
  onClose: () => void
  onCreated: () => void
}) {
  const [date, setDate] = useState(() => todayUAE())
  const [team, setTeam] = useState('')
  const [laborers, setLaborers] = useState('')
  const [workDescription, setWorkDescription] = useState('')
  const [expectedFinishDate, setExpectedFinishDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)

  async function handleSave() {
    if (!date) { setErr('Date is required'); return }
    setSaving(true); setErr('')
    try {
      const body: Record<string, unknown> = { date }
      if (team) body.installationTeam = team
      if (laborers) body.numberOfLaborers = parseInt(laborers)
      if (workDescription.trim()) body.workDescription = workDescription.trim()
      if (expectedFinishDate) body.expectedFinishDate = expectedFinishDate

      const res = await fetch(`/api/projects/${project.id}/installation-logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      setDone(true)
      onCreated()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to create log')
    } finally {
      setSaving(false)
    }
  }

  if (done) {
    return (
      <Modal open onClose={onClose} title="Log Created">
        <div className="py-6 text-center space-y-3">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-gray-900">Installation log recorded</p>
          <p className="text-xs text-gray-500">{project.projectName} — {date}</p>
          <Button onClick={onClose}>Done</Button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Log Site Visit — ${project.projectName}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} loading={saving}>Save Log</Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        {err && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{err}</p>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={lbl}>Visit Date *</label>
            <input type="date" className={inp} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className={lbl}>Expected Finish Date</label>
            <input type="date" className={inp} value={expectedFinishDate} onChange={(e) => setExpectedFinishDate(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={lbl}>Installation Team</label>
            <select className={sel} value={team} onChange={(e) => setTeam(e.target.value)}>
              <option value="">— select —</option>
              {TEAMS.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>No. of Laborers</label>
            <input type="number" min="1" max="50" className={inp} value={laborers} onChange={(e) => setLaborers(e.target.value)} placeholder="0" />
          </div>
        </div>

        <div>
          <label className={lbl}>Work Description</label>
          <textarea rows={3} className={`${inp} resize-none`} value={workDescription} onChange={(e) => setWorkDescription(e.target.value)} placeholder="What was done on site today..." />
        </div>
      </div>
    </Modal>
  )
}
