'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { TimesheetEntry, WorkerOption } from '@/lib/types'
import { todayUAE } from '@/lib/dateUtils'
import { Project } from '@/lib/types'

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

// ─── Log Entry Form ───────────────────────────────────────────────────────────

function LogEntryForm({
  workers,
  projects,
  onCreated,
}: {
  workers: WorkerOption[]
  projects: Project[]
  onCreated: () => void
}) {
  const today = todayUAE()
  const [workDate, setWorkDate] = useState(today)
  const [supervisorId, setSupervisorId] = useState('')
  const [workerIds, setWorkerIds] = useState<string[]>([])
  const [locationType, setLocationType] = useState<'Project' | 'Factory'>('Project')
  const [projectId, setProjectId] = useState('')
  const [regularHours, setRegularHours] = useState(8)
  const [overtimeHours, setOvertimeHours] = useState(0)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const total = regularHours + overtimeHours
  const isOverCap = total > 16
  const isWarning = total > 14 && total <= 16

  // Workers available for selection (exclude supervisor)
  const availableWorkers = workers.filter((w) => w.id !== supervisorId)

  function toggleWorker(id: string) {
    setWorkerIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  // Estimated cost calculation
  const supervisor = workers.find((w) => w.id === supervisorId)
  const selectedWorkers = workers.filter((w) => workerIds.includes(w.id))
  const allPeople = [...(supervisor ? [supervisor] : []), ...selectedWorkers]
  const totalRate = allPeople.reduce((s, w) => s + (w.hourlyRate ?? 0), 0)
  const estimatedCost = totalRate > 0 ? totalRate * total : null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!supervisorId) { setError('Supervisor is required.'); return }
    if (locationType === 'Project' && !projectId) { setError('Please select a project.'); return }
    if (isOverCap) { setError('Total hours cannot exceed 16.'); return }
    setSaving(true)
    setError(null)
    setWarning(null)
    setSuccess(false)
    try {
      const res = await fetch('/api/timesheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workDate,
          supervisorId,
          workerIds,
          projectIds: locationType === 'Project' && projectId ? [projectId] : [],
          locationType,
          regularHours,
          overtimeHours,
          notes: notes || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to log entry')
      if (data.warning) setWarning(data.warning)
      setSuccess(true)
      setSupervisorId('')
      setWorkerIds([])
      setProjectId('')
      setLocationType('Project')
      setRegularHours(8)
      setOvertimeHours(0)
      setNotes('')
      onCreated()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to log entry')
    } finally {
      setSaving(false)
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
          onChange={(e) => setWorkDate(e.target.value)}
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
          onChange={(e) => {
            setSupervisorId(e.target.value)
            setWorkerIds((prev) => prev.filter((id) => id !== e.target.value))
          }}
          className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 outline-none bg-white"
        >
          <option value="">Select supervisor…</option>
          {workers.filter((w) => w.workerType === 'Supervisor').map((w) => (
            <option key={w.id} value={w.id}>
              {workerLabel(w)}{w.hourlyRate ? ` — AED ${w.hourlyRate}/hr` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Workers (multi-select) */}
      {supervisorId && (
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">
            Workers under supervisor
            <span className="ml-1 text-gray-400 font-normal">(optional)</span>
          </label>
          {availableWorkers.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No other workers available.</p>
          ) : (
            <div className="grid grid-cols-2 gap-1.5">
              {availableWorkers.map((w) => (
                <label
                  key={w.id}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border cursor-pointer text-xs transition-colors ${
                    workerIds.includes(w.id)
                      ? 'bg-brand-50 border-brand-300 text-brand-700'
                      : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={workerIds.includes(w.id)}
                    onChange={() => toggleWorker(w.id)}
                    className="w-3.5 h-3.5 accent-brand-500"
                  />
                  <span className="truncate">
                    {workerLabel(w)}
                    {w.hourlyRate ? <span className="ml-1 text-gray-400">{w.hourlyRate}/hr</span> : null}
                  </span>
                </label>
              ))}
            </div>
          )}
          {workerIds.length > 0 && (
            <p className="text-xs text-gray-400 mt-1">{workerIds.length} worker{workerIds.length > 1 ? 's' : ''} selected</p>
          )}
        </div>
      )}

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
                {p.projectId} — {p.projectName}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Hours */}
      <div className="grid grid-cols-3 gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Regular Hrs</label>
          <input
            type="number"
            min={0}
            max={24}
            step={0.5}
            value={regularHours}
            onChange={(e) => setRegularHours(Number(e.target.value))}
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Overtime Hrs</label>
          <input
            type="number"
            min={0}
            max={24}
            step={0.5}
            value={overtimeHours}
            onChange={(e) => setOvertimeHours(Number(e.target.value))}
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
          />
        </div>
        <div className={`text-center pb-1.5 text-sm font-bold ${isOverCap ? 'text-red-600' : isWarning ? 'text-orange-500' : 'text-gray-700'}`}>
          Total: {total.toFixed(1)}h
          {isWarning && <span className="block text-[10px] font-normal text-orange-500">⚠ over 14h</span>}
          {isOverCap && <span className="block text-[10px] font-normal text-red-600">✕ exceeds 16h</span>}
        </div>
      </div>

      {/* Estimated cost */}
      {estimatedCost !== null && (
        <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-amber-700">Estimated Labor Cost</p>
            <p className="text-[11px] text-amber-500 mt-0.5">
              {allPeople.map((p) => `${workerLabel(p)} @ AED ${p.hourlyRate ?? 0}/hr`).join(', ')}
            </p>
          </div>
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
        disabled={saving || isOverCap}
        className="w-full py-2 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors"
      >
        {saving ? 'Logging…' : 'Log Entry'}
      </button>
    </form>
  )
}

// ─── Today's Entries ──────────────────────────────────────────────────────────

function TodayEntries({
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
        <p className="text-sm font-semibold text-gray-800">Today&apos;s Entries</p>
        <span className="text-xs text-gray-400">{date}</span>
      </div>
      {entries.length === 0 ? (
        <p className="px-4 py-4 text-sm text-gray-400">No entries logged today.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50">
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Supervisor</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Workers</th>
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
                <td className="px-4 py-2 text-gray-800 font-medium">{e.supervisorName ?? '—'}</td>
                <td className="px-4 py-2 text-xs text-gray-500">
                  {e.workerNames && e.workerNames.length > 0
                    ? e.workerNames.join(', ')
                    : <span className="text-gray-300">none</span>}
                </td>
                <td className="px-4 py-2 text-xs text-gray-500">
                  {e.locationType === 'Factory'
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
            days: { date: string; regularHours: number; overtimeHours: number; totalHours: number; projectRef?: string; entryId: string }[]
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
                          <td className="px-4 py-2 text-xs text-gray-400">{d.projectRef ?? '—'}</td>
                          <td className="px-4 py-2 text-right text-gray-600">{d.regularHours.toFixed(1)}</td>
                          <td className="px-4 py-2 text-right text-orange-500">{d.overtimeHours > 0 ? d.overtimeHours.toFixed(1) : '—'}</td>
                          <td className={`px-4 py-2 text-right font-semibold ${d.totalHours > 14 ? 'text-orange-600' : 'text-gray-700'}`}>
                            {d.totalHours.toFixed(1)}
                          </td>
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
  const today = todayUAE()

  const { data: workersData } = useSWR<{ workers: WorkerOption[] }>(
    '/api/timesheets/workers',
    fetcher,
    { revalidateOnFocus: false },
  )
  const workers = sortWorkers(workersData?.workers ?? [])

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
            onCreated={() => setRefreshKey((k) => k + 1)}
          />
          <TodayEntries date={today} refreshKey={refreshKey} />
        </>
      )}

      {subView === 'summary' && <WeeklySummaryView />}
    </div>
  )
}
