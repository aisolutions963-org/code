'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { TimesheetEntry, WorkerOption } from '@/lib/types'
import { todayUAE } from '@/lib/dateUtils'
import { Project } from '@/lib/types'
import { projectRefLabel } from '@/lib/projectRef'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function getWeekStart(offset = 0): string {
  const [y, m, d] = todayUAE().split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const day = date.getDay()
  const diff = (day >= 6 ? day - 6 : day + 1)
  date.setDate(date.getDate() - diff + offset * 7)
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' })
}

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', weekday: 'short',
  })
}

function workerLabel(w: WorkerOption): string {
  const base = w.nickname ? `${w.name} (${w.nickname})` : w.name
  return w.workerType ? `${base} — ${w.workerType}` : base
}

function sortWorkers(workers: WorkerOption[]): WorkerOption[] {
  return [...workers].sort((a, b) => {
    const aIsSup = a.workerType === 'Supervisor' ? 0 : 1
    const bIsSup = b.workerType === 'Supervisor' ? 0 : 1
    if (aIsSup !== bIsSup) return aIsSup - bIsSup
    return a.name.localeCompare(b.name)
  })
}

// Human label for what a worker is already on that day, derived from an
// existing entry — mirrors the server-side getWorkerAssignmentsForDate() logic.
function assignmentLabel(e: TimesheetEntry): string {
  if (e.status === 'Holiday') return 'Holiday'
  if (e.status === 'Absent') return 'Absent'
  if (e.locationType === 'Factory') return 'Factory'
  return e.projectRef ?? e.projectIds[0] ?? 'Assigned'
}

function buildAssignmentMap(entries: TimesheetEntry[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const e of entries) {
    const label = assignmentLabel(e)
    for (const workerId of e.workerIds) map.set(workerId, label)
  }
  return map
}

// ─── Log Entry Form ───────────────────────────────────────────────────────────

function LogEntryForm({
  workers,
  projects,
  workDate,
  onWorkDateChange,
  assignments,
  onCreated,
}: {
  workers: WorkerOption[]
  projects: Project[]
  workDate: string
  onWorkDateChange: (date: string) => void
  assignments: Map<string, string>
  onCreated: () => void
}) {
  const [supervisorId, setSupervisorId] = useState('')
  const [supervisorHours, setSupervisorHours] = useState({ regularHours: 8, overtimeHours: 0 })
  const [workerHours, setWorkerHours] = useState<Record<string, { regularHours: number; overtimeHours: number }>>({})
  const [locationType, setLocationType] = useState<'Project' | 'Factory'>('Project')
  const [projectId, setProjectId] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [statusSavingId, setStatusSavingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const checkedIds = Object.keys(workerHours)
  // The supervisor worked that day too — unless they're already booked elsewhere,
  // their hours are part of the same submit as everyone else in this group.
  const supervisorAlreadyAssigned = supervisorId ? assignments.get(supervisorId) : undefined
  const combinedEntries: { workerId: string; regularHours: number; overtimeHours: number }[] = [
    ...(supervisorId && !supervisorAlreadyAssigned ? [{ workerId: supervisorId, ...supervisorHours }] : []),
    ...checkedIds.map((id) => ({ workerId: id, ...workerHours[id] })),
  ]
  const groupTotal = combinedEntries.reduce((s, e) => s + e.regularHours + e.overtimeHours, 0)
  const anyOverCap = combinedEntries.some((e) => e.regularHours + e.overtimeHours > 16)
  const anyWarning = combinedEntries.some((e) => {
    const t = e.regularHours + e.overtimeHours
    return t > 14 && t <= 16
  })

  function handleSupervisorChange(id: string) {
    setSupervisorId(id)
    setSupervisorHours({ regularHours: 8, overtimeHours: 0 })
  }

  function updateSupervisorHours(field: 'regularHours' | 'overtimeHours', value: number) {
    setSupervisorHours((prev) => ({ ...prev, [field]: value }))
  }

  function toggleWorker(id: string) {
    setWorkerHours((prev) => {
      const next = { ...prev }
      if (next[id]) delete next[id]
      else next[id] = { regularHours: 8, overtimeHours: 0 }
      return next
    })
  }

  function updateHours(id: string, field: 'regularHours' | 'overtimeHours', value: number) {
    setWorkerHours((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  const estimatedCost = combinedEntries.reduce((sum, e) => {
    const w = workers.find((w) => w.id === e.workerId)
    if (!w?.hourlyRate) return sum
    return sum + w.hourlyRate * (e.regularHours + e.overtimeHours)
  }, 0)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!supervisorId) { setError('Supervisor is required.'); return }
    if (locationType === 'Project' && !projectId) { setError('Please select a project.'); return }
    if (combinedEntries.length === 0) { setError('Select at least one worker.'); return }
    if (anyOverCap) { setError('Total hours cannot exceed 16 per worker.'); return }
    setSaving(true)
    setError(null)
    setWarning(null)
    setSuccess(false)
    try {
      const res = await fetch('/api/timesheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'work',
          workDate,
          supervisorId,
          projectIds: locationType === 'Project' && projectId ? [projectId] : [],
          locationType,
          workers: combinedEntries,
          notes: notes || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to log entry')
      if (data.warning) setWarning(data.warning)
      setSuccess(true)
      setSupervisorId('')
      setSupervisorHours({ regularHours: 8, overtimeHours: 0 })
      setWorkerHours({})
      setProjectId('')
      setLocationType('Project')
      setNotes('')
      onCreated()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to log entry')
    } finally {
      setSaving(false)
    }
  }

  async function markStatus(workerId: string, status: 'Holiday' | 'Absent') {
    setStatusSavingId(workerId)
    setError(null)
    try {
      const res = await fetch('/api/timesheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'status', workerId, workDate, status }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Failed to mark ${status}`)
      onCreated()
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to mark ${status}`)
    } finally {
      setStatusSavingId(null)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
      <h3 className="text-sm font-semibold text-gray-800">Log Daily Entry</h3>

      {/* Date */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
        <input
          type="date"
          value={workDate}
          onChange={(e) => onWorkDateChange(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none"
        />
      </div>

      {/* Supervisor */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">
          Supervisor <span className="text-red-500">*</span>
        </label>
        <select
          value={supervisorId}
          onChange={(e) => handleSupervisorChange(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 outline-none bg-white"
        >
          <option value="">Select supervisor…</option>
          {workers.filter((w) => w.workerType === 'Supervisor').map((w) => (
            <option key={w.id} value={w.id}>
              {workerLabel(w)}{w.hourlyRate ? ` — AED ${w.hourlyRate}/hr` : ''}
            </option>
          ))}
        </select>

        {/* Supervisor's own hours — they worked that day too, unless already booked elsewhere */}
        {supervisorId && (
          supervisorAlreadyAssigned ? (
            <p className="mt-1.5 text-xs text-gray-400">
              Already: <span className="font-medium">{supervisorAlreadyAssigned}</span> — their hours won't be logged again for this entry.
            </p>
          ) : (
            <div className="mt-1.5 flex items-center gap-2">
              <span className="text-xs text-gray-400 shrink-0">Their hours:</span>
              <input
                type="number" min={0} max={24} step={0.5}
                value={supervisorHours.regularHours}
                onChange={(e) => updateSupervisorHours('regularHours', Number(e.target.value))}
                title="Regular hours"
                className="w-16 border border-gray-200 rounded px-1.5 py-1 text-xs text-right"
              />
              <span className="text-gray-300 text-xs">+</span>
              <input
                type="number" min={0} max={24} step={0.5}
                value={supervisorHours.overtimeHours}
                onChange={(e) => updateSupervisorHours('overtimeHours', Number(e.target.value))}
                title="Overtime hours"
                className="w-16 border border-gray-200 rounded px-1.5 py-1 text-xs text-right"
              />
              <span className="text-xs text-gray-400">hrs</span>
            </div>
          )
        )}
      </div>

      {/* Location type */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1.5">Location</label>
        <div className="flex gap-2">
          {(['Project', 'Factory'] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => { setLocationType(type); if (type === 'Factory') setProjectId('') }}
              className={`flex-1 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                locationType === type
                  ? type === 'Factory'
                    ? 'bg-green-600 text-white border-green-600'
                    : 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {type === 'Factory' ? '🏭 Factory' : '📋 Project'}
            </button>
          ))}
        </div>
      </div>

      {/* Project (only if Project type) */}
      {locationType === 'Project' && (
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Project <span className="text-red-500">*</span>
          </label>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 outline-none bg-white"
          >
            <option value="">Select project…</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {projectRefLabel(p)} — {p.projectName}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Workers — roster with per-worker hours or Holiday/Absent */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1.5">
          Workers
          <span className="ml-1 text-gray-400 font-normal">— check who worked this job, enter their own hours</span>
        </label>
        <div className="space-y-1.5">
          {workers.filter((w) => w.id !== supervisorId).map((w) => {
            const assignedLabel = assignments.get(w.id)
            const checked = w.id in workerHours
            if (assignedLabel) {
              return (
                <div
                  key={w.id}
                  className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border border-gray-100 bg-gray-50 text-xs text-gray-400"
                >
                  <span className="truncate">{workerLabel(w)}</span>
                  <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-500 text-[10px] font-medium">
                    Already: {assignedLabel}
                  </span>
                </div>
              )
            }
            return (
              <div
                key={w.id}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${
                  checked ? 'bg-brand-50 border-brand-300' : 'bg-white border-gray-200 hover:bg-gray-50'
                }`}
              >
                <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleWorker(w.id)}
                    className="w-3.5 h-3.5 accent-brand-500 shrink-0"
                  />
                  <span className="truncate text-gray-700">
                    {workerLabel(w)}
                    {w.hourlyRate ? <span className="ml-1 text-gray-400">{w.hourlyRate}/hr</span> : null}
                  </span>
                </label>
                {checked ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <input
                      type="number" min={0} max={24} step={0.5}
                      value={workerHours[w.id].regularHours}
                      onChange={(e) => updateHours(w.id, 'regularHours', Number(e.target.value))}
                      title="Regular hours"
                      className="w-14 border border-gray-200 rounded px-1.5 py-1 text-xs text-right"
                    />
                    <span className="text-gray-300">+</span>
                    <input
                      type="number" min={0} max={24} step={0.5}
                      value={workerHours[w.id].overtimeHours}
                      onChange={(e) => updateHours(w.id, 'overtimeHours', Number(e.target.value))}
                      title="Overtime hours"
                      className="w-14 border border-gray-200 rounded px-1.5 py-1 text-xs text-right"
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={statusSavingId === w.id}
                      onClick={() => markStatus(w.id, 'Holiday')}
                      className="px-2 py-1 rounded-md text-[10px] font-medium text-cyan-700 bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 disabled:opacity-50"
                    >
                      Holiday
                    </button>
                    <button
                      type="button"
                      disabled={statusSavingId === w.id}
                      onClick={() => markStatus(w.id, 'Absent')}
                      className="px-2 py-1 rounded-md text-[10px] font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 disabled:opacity-50"
                    >
                      Absent
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {checkedIds.length > 0 && (
          <p className={`text-xs mt-1.5 font-medium ${anyOverCap ? 'text-red-600' : anyWarning ? 'text-orange-500' : 'text-gray-500'}`}>
            {checkedIds.length} worker{checkedIds.length > 1 ? 's' : ''} selected — {groupTotal.toFixed(1)}h combined
            {anyWarning && <span className="ml-1">⚠ one or more over 14h</span>}
            {anyOverCap && <span className="ml-1">✕ one or more exceed 16h</span>}
          </p>
        )}
      </div>

      {/* Estimated cost */}
      {estimatedCost > 0 && (
        <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 flex items-center justify-between">
          <p className="text-xs font-semibold text-amber-700">Estimated Labor Cost</p>
          <p className="text-base font-bold text-amber-800">AED {estimatedCost.toFixed(0)}</p>
        </div>
      )}

      {/* Notes */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Notes (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Work description, site notes, etc."
          className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 outline-none resize-none"
        />
      </div>

      {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      {warning && <p className="text-xs text-orange-600 bg-orange-50 rounded-lg px-3 py-2">{warning}</p>}
      {success && <p className="text-xs text-green-600 bg-green-50 rounded-lg px-3 py-2">Entry logged successfully.</p>}

      <button
        type="submit"
        disabled={saving || anyOverCap}
        className="w-full py-2 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors"
      >
        {saving ? 'Logging…' : 'Log Entry'}
      </button>
    </form>
  )
}

// ─── Today's Entries ──────────────────────────────────────────────────────────

const STATUS_BADGE: Record<TimesheetEntry['status'], string> = {
  Working: '',
  Holiday: 'text-cyan-700 bg-cyan-50',
  Absent: 'text-red-700 bg-red-50',
}

function DateEntries({
  date,
  refreshKey,
}: {
  date: string
  refreshKey: number
}) {
  const { data, isLoading, mutate } = useSWR<{ entries: TimesheetEntry[] }>(
    `/api/timesheets?from=${date}&to=${date}`,
    fetcher,
    { refreshInterval: 0 },
  )

  const [prevKey, setPrevKey] = useState(refreshKey)
  if (prevKey !== refreshKey) { setPrevKey(refreshKey); mutate() }

  const entries = data?.entries ?? []

  if (isLoading) return (
    <div className="flex justify-center py-4">
      <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-800">Entries</p>
        <span className="text-xs text-gray-400">{date}</span>
      </div>
      {entries.length === 0 ? (
        <p className="px-4 py-4 text-sm text-gray-400">No entries logged for this date.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50">
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Worker</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Supervisor</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Status</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Location</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">Reg</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">OT</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">Total</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">Est. Cost</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {entries.map((e) => (
              <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-2 text-gray-800 font-medium">
                  {e.workerNames && e.workerNames.length > 0
                    ? e.workerNames.join(', ')
                    : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-2 text-xs text-gray-500">{e.supervisorName ?? '—'}</td>
                <td className="px-4 py-2 text-xs">
                  {e.status === 'Working'
                    ? <span className="text-gray-400">Working</span>
                    : <span className={`px-1.5 py-0.5 rounded-full text-[11px] font-medium ${STATUS_BADGE[e.status]}`}>{e.status}</span>}
                </td>
                <td className="px-4 py-2 text-xs text-gray-500">
                  {e.status !== 'Working' ? '—' : e.locationType === 'Factory'
                    ? <span className="text-green-700 bg-green-50 px-1.5 py-0.5 rounded text-[11px] font-medium">Factory</span>
                    : <span className="text-blue-700 text-[11px]">{e.projectRef ?? e.projectIds[0] ?? '—'}</span>}
                </td>
                <td className="px-4 py-2 text-right text-gray-600">{e.regularHours.toFixed(1)}</td>
                <td className="px-4 py-2 text-right text-orange-500">{e.overtimeHours > 0 ? e.overtimeHours.toFixed(1) : '—'}</td>
                <td className={`px-4 py-2 text-right font-semibold ${e.totalHours > 14 ? 'text-orange-600' : 'text-gray-800'}`}>
                  {e.totalHours.toFixed(1)}
                </td>
                <td className="px-4 py-2 text-right text-xs font-medium text-amber-700">
                  {e.estimatedCost != null ? `AED ${e.estimatedCost.toFixed(0)}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ─── Weekly Summary ───────────────────────────────────────────────────────────

function WeeklySummaryView() {
  const [weekOffset, setWeekOffset] = useState(0)
  const weekStart = getWeekStart(weekOffset)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const { data, isLoading } = useSWR(
    `/api/timesheets/summary?weekStart=${weekStart}`,
    fetcher,
    { refreshInterval: 300_000 },
  )

  const summary = data?.summary
  const weekEnd = summary?.weekEnd ?? ''

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setWeekOffset((o) => o - 1)}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
        >
          ← Prev
        </button>
        <div className="text-sm font-medium text-gray-700">
          {weekStart} — {weekEnd || '…'}
        </div>
        <button
          onClick={() => setWeekOffset((o) => o + 1)}
          disabled={weekOffset >= 0}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-30"
        >
          Next →
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !summary || summary.workers.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <p className="text-sm text-gray-400">No timesheet entries for this week.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {summary.workers.map((w: {
            workerId: string
            workerName: string
            days: { date: string; status: TimesheetEntry['status']; regularHours: number; overtimeHours: number; totalHours: number; projectRef?: string; entryId: string }[]
            totalRegular: number
            totalOvertime: number
            totalHours: number
          }) => (
            <div key={w.workerId} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <button
                onClick={() => toggle(w.workerId)}
                className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-gray-500">
                      {w.workerName.split(' ').map((p: string) => p[0]).join('').slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-gray-900">{w.workerName}</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right hidden sm:block">
                    <p className="text-sm font-bold text-gray-800">{w.totalHours.toFixed(1)}h</p>
                    <p className="text-[10px] text-gray-400">{w.totalRegular.toFixed(1)}r + {w.totalOvertime.toFixed(1)}ot</p>
                  </div>
                  <svg
                    className={`w-4 h-4 text-gray-400 transition-transform ${expanded.has(w.workerId) ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {expanded.has(w.workerId) && (
                <div className="border-t border-gray-100">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Date</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Project</th>
                        <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">Regular</th>
                        <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">Overtime</th>
                        <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {w.days.map((d) => (
                        <tr key={d.entryId} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-2 text-xs text-gray-500 font-mono">{formatDate(d.date)}</td>
                          {d.status !== 'Working' ? (
                            <td colSpan={4} className="px-4 py-2">
                              <span className={`px-1.5 py-0.5 rounded-full text-[11px] font-medium ${STATUS_BADGE[d.status]}`}>{d.status}</span>
                            </td>
                          ) : (
                            <>
                              <td className="px-4 py-2 text-xs text-gray-400">{d.projectRef ?? '—'}</td>
                              <td className="px-4 py-2 text-right text-gray-600">{d.regularHours.toFixed(1)}</td>
                              <td className="px-4 py-2 text-right text-orange-500">{d.overtimeHours > 0 ? d.overtimeHours.toFixed(1) : '—'}</td>
                              <td className={`px-4 py-2 text-right font-semibold ${d.totalHours > 14 ? 'text-orange-600' : 'text-gray-700'}`}>
                                {d.totalHours.toFixed(1)}
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                      <tr className="bg-gray-50 font-semibold">
                        <td colSpan={2} className="px-4 py-2 text-xs text-gray-600">Week Total</td>
                        <td className="px-4 py-2 text-right text-gray-700">{w.totalRegular.toFixed(1)}</td>
                        <td className="px-4 py-2 text-right text-orange-600">{w.totalOvertime > 0 ? w.totalOvertime.toFixed(1) : '—'}</td>
                        <td className="px-4 py-2 text-right text-gray-900">{w.totalHours.toFixed(1)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TimesheetsView({ projects }: { projects: Project[] }) {
  const [subView, setSubView] = useState<'log' | 'summary'>('log')
  const [refreshKey, setRefreshKey] = useState(0)
  const [workDate, setWorkDate] = useState(todayUAE())

  const { data: workersData } = useSWR<{ workers: WorkerOption[] }>(
    '/api/timesheets/workers',
    fetcher,
    { revalidateOnFocus: false },
  )
  const workers = sortWorkers(workersData?.workers ?? [])

  const { data: dateEntriesData, mutate: mutateDateEntries } = useSWR<{ entries: TimesheetEntry[] }>(
    `/api/timesheets?from=${workDate}&to=${workDate}`,
    fetcher,
  )
  const assignments = buildAssignmentMap(dateEntriesData?.entries ?? [])

  function handleCreated() {
    setRefreshKey((k) => k + 1)
    mutateDateEntries()
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {([['log', 'Log Entry'], ['summary', 'Weekly Summary']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSubView(key)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              subView === key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {subView === 'log' && (
        <>
          <LogEntryForm
            workers={workers}
            projects={projects}
            workDate={workDate}
            onWorkDateChange={setWorkDate}
            assignments={assignments}
            onCreated={handleCreated}
          />
          <DateEntries date={workDate} refreshKey={refreshKey} />
        </>
      )}

      {subView === 'summary' && <WeeklySummaryView />}
    </div>
  )
}
