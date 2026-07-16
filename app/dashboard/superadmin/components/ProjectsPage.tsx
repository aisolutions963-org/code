'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import useSWR from 'swr'
import { Project } from '@/lib/types'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import ProjectNotesEditor from '@/components/projects/ProjectNotesEditor'
import { fetcher, Spinner, isStale } from './shared'

const CLOSED_STAGES = new Set(['Closed', 'Closed and active warranty', 'Warranty expired'])

function ProjectRow({ project: p, onAdvance, onDelete, onReopen, onDisapprove, onNotesSaved }: { project: Project; onAdvance: (id: string) => Promise<void>; onDelete: (id: string, name: string) => Promise<void>; onReopen: (id: string, reason?: string) => Promise<void>; onDisapprove: (project: Project) => void; onNotesSaved?: () => void }) {
  const [loading, setLoading] = useState(false)
  const [reopenLoading, setReopenLoading] = useState(false)
  const [err, setErr] = useState('')
  const [expanded, setExpanded] = useState(false)
  const stale = isStale(p.lastModifiedTasks)

  async function advance() {
    setLoading(true); setErr('')
    try { await onAdvance(p.id) } catch (e) { setErr(e instanceof Error ? e.message : 'Failed') } finally { setLoading(false) }
  }

  async function reopen() {
    let reason: string | undefined
    if (CLOSED_STAGES.has(p.projectStage)) {
      const input = window.prompt(`Reopen "${p.projectName}" to Production? Enter a reason (required):`)
      if (input == null) return
      if (!input.trim()) { setErr('A reason is required to reopen a closed project'); return }
      reason = input.trim()
    }
    setReopenLoading(true); setErr('')
    try { await onReopen(p.id, reason) } catch (e) { setErr(e instanceof Error ? e.message : 'Failed') } finally { setReopenLoading(false) }
  }

  const address = [p.detailedLocation, p.location, p.emirate].filter(Boolean).join(', ')

  return (
    <>
      <tr className={`hover:bg-gray-50 transition-colors ${stale ? 'bg-yellow-50/30' : ''}`}>
        <td className="px-4 py-3 font-mono text-xs text-gray-500">{p.projectId}</td>
        <td className="px-4 py-3 max-w-xs">
          <button
            onClick={() => setExpanded((e) => !e)}
            className="flex items-center gap-1.5 text-left group"
          >
            <svg
              className={`w-3 h-3 text-gray-400 shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span className="font-medium text-gray-900 truncate group-hover:text-brand-600">{p.projectName}</span>
          </button>
          {p.nickname && <p className="text-xs text-gray-500 truncate mt-0.5 pl-5">{p.nickname}</p>}
          <div className="mt-1 pl-5">
            <ProjectNotesEditor
              projectId={p.id}
              initialNotes={p.managerNotes}
              editable
              onSaved={onNotesSaved}
            />
          </div>
        </td>
        <td className="px-4 py-3 text-gray-500 text-xs">{p.clientName}</td>
        <td className="px-4 py-3">
          <Badge variant={p.projectStage === 'Open' ? 'blue' : p.projectStage === 'Preparing' ? 'orange' : p.projectStage === 'Not-Approved' ? 'red' : p.projectStage === 'Production' ? 'green' : p.projectStage === 'Closing' ? 'blue' : 'gray'}>
            {p.projectStage === 'Not-Approved' ? 'Not Approved' : p.projectStage}
          </Badge>
        </td>
        <td className="px-4 py-3">
          {stale && <span className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-1.5 py-0.5">Stale</span>}
        </td>
        <td className="px-4 py-3 text-right">
          <div className="flex items-center justify-end gap-2">
            {p.projectStage !== 'Not-Approved' && p.projectStage !== 'Closed' && p.projectStage !== 'Closed and active warranty' && p.projectStage !== 'Warranty expired' && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onDisapprove(p)}
                className="text-red-500 hover:text-red-700 border-red-200 hover:border-red-300"
              >
                ✕ Not Approved
              </Button>
            )}
            {(p.projectStage === 'Not-Approved' || CLOSED_STAGES.has(p.projectStage)) && (
              <Button
                size="sm"
                variant="secondary"
                loading={reopenLoading}
                onClick={reopen}
                className="text-green-600 hover:text-green-700 border-green-300 hover:border-green-400"
              >
                ↩ Reopen
              </Button>
            )}
            {p.projectStage !== 'Closed' && p.projectStage !== 'Not-Approved' && p.projectStage !== 'Closed and active warranty' && p.projectStage !== 'Warranty expired' && (
              <Button size="sm" variant="secondary" loading={loading} onClick={advance}>Advance →</Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onDelete(p.id, p.projectName)}
              className="text-red-500 hover:text-red-700 border-red-200 hover:border-red-300"
            >
              Delete
            </Button>
          </div>
        </td>
      </tr>

      {/* Project Brief — F1 intake data */}
      {expanded && (
        <tr>
          <td colSpan={6} className="px-6 pb-5 pt-1 bg-gray-50/60 border-t border-gray-100">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-4 py-3">

              {p.projectDescription && (
                <div className="sm:col-span-2">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Scope</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{p.projectDescription}</p>
                </div>
              )}

              {address && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Address</p>
                  <p className="text-sm text-gray-700">{address}</p>
                </div>
              )}

              {p.clientPhone && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Client Phone</p>
                  <a href={`tel:${p.clientPhone}`} className="text-sm text-brand-600 hover:underline font-mono">{p.clientPhone}</a>
                </div>
              )}

              {p.paymentMode && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Payment Mode</p>
                  <p className="text-sm text-gray-700">{p.paymentMode}</p>
                </div>
              )}

              {p.salesOwner && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Sales Owner (SED)</p>
                  <p className="text-sm text-gray-700">{p.salesOwner.name ?? p.salesOwner.email}</p>
                </div>
              )}

              {p.communSeds && p.communSeds.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Community SEDs</p>
                  <p className="text-sm text-gray-700">{p.communSeds.join(', ')}</p>
                </div>
              )}

              {p.sedNotes && (
                <div className="sm:col-span-2">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">SED Notes</p>
                  <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{p.sedNotes}</p>
                </div>
              )}

              {p.projectCreatedAt && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Created</p>
                  <p className="text-sm text-gray-500">
                    {new Date(p.projectCreatedAt).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
              )}

            </div>
          </td>
        </tr>
      )}

      {err && (
        <tr>
          <td colSpan={6} className="px-4 pb-2">
            <p className="text-xs text-red-600 bg-red-50 rounded px-2 py-1">{err}</p>
          </td>
        </tr>
      )}
    </>
  )
}

const REJECTION_REASONS = [
  'Budget / cost',
  'Client unresponsive',
  'Design not approved',
  'Scope changed',
  'Duplicate / test entry',
  'Other',
] as const

function RejectReasonModal({
  project,
  onClose,
  onConfirm,
}: {
  project: Project
  onClose: () => void
  onConfirm: (reason: string, note: string) => Promise<void>
}) {
  const [reason, setReason] = useState<string>(REJECTION_REASONS[0])
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function submit() {
    if (!note.trim()) { setErr('A note is required'); return }
    setSaving(true); setErr('')
    try {
      await onConfirm(reason, note.trim())
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div>
          <h3 className="text-base font-semibold text-gray-900">Mark project as Not-Approved</h3>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{project.projectName}</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Reason</label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-400"
          >
            {REJECTION_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Note <span className="text-red-500">*</span></label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Add context — this is sent to the SED and manager."
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        </div>

        {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">{err}</p>}

        <div className="flex items-center justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            variant="secondary"
            loading={saving}
            onClick={submit}
            className="text-red-600 hover:text-red-700 border-red-300 hover:border-red-400"
          >
            Mark Not-Approved
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function ProjectsPage() {
  const searchParams = useSearchParams()
  const stageFilter = searchParams.get('stage') ?? null
  const unpaidFilter = searchParams.get('unpaid') === 'true'
  const [search, setSearch] = useState('')
  const [rejectProject, setRejectProject] = useState<Project | null>(null)
  const [showTrash, setShowTrash] = useState(false)

  const { data, isLoading, mutate } = useSWR<{ projects: Project[] }>(
    '/api/projects?all=true', fetcher, { refreshInterval: 300_000 },
  )

  const { data: trashData, isLoading: trashLoading, mutate: mutateTrash } = useSWR<{ projects: Project[] }>(
    showTrash ? '/api/projects?deleted=true' : null, fetcher, { refreshInterval: 300_000 },
  )
  const deletedProjects = trashData?.projects ?? []

  const allProjects = data?.projects ?? []
  let filtered = stageFilter ? allProjects.filter((p) => p.projectStage === stageFilter) : allProjects
  if (unpaidFilter) filtered = filtered.filter((p) => (p.remainingBalance ?? 0) > 0)
  if (search.trim()) {
    const q = search.toLowerCase()
    filtered = filtered.filter((p) =>
      p.projectName.toLowerCase().includes(q) ||
      p.clientName.toLowerCase().includes(q) ||
      (p.quotationNumber ?? '').toLowerCase().includes(q) ||
      (p.quotationReference ?? '').toLowerCase().includes(q) ||
      (p.projectId ?? '').toLowerCase().includes(q) ||
      (p.nickname ?? '').toLowerCase().includes(q),
    )
  }

  async function handleAdvance(id: string) {
    const res = await fetch(`/api/projects/${id}/advance`, { method: 'POST' })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(
        d.blockingTasks
          ? `${d.error}: ${d.blockingTasks.map((t: { taskName: string }) => t.taskName).join(', ')}`
          : d.error ?? 'Failed',
      )
    }
    mutate()
    // Stage advanced but the new phase's tasks failed to generate — surface it (row catches this).
    if (d.warning) throw new Error(d.warning)
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Move "${name}" to Trash? You can restore it later from the Trash view.`)) return
    const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      throw new Error((d as { error?: string }).error ?? 'Failed to delete')
    }
    mutate()
  }

  async function handleRestore(id: string) {
    const res = await fetch(`/api/projects/${id}/restore`, { method: 'POST' })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      throw new Error((d as { error?: string }).error ?? 'Failed to restore')
    }
    mutateTrash()
    mutate()
  }

  async function handlePermanentDelete(id: string, name: string) {
    if (!confirm(`Permanently delete "${name}" and all its tasks, payments and records? This cannot be undone.`)) return
    const res = await fetch(`/api/projects/${id}?permanent=true`, { method: 'DELETE' })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      throw new Error((d as { error?: string }).error ?? 'Failed to delete')
    }
    mutateTrash()
  }

  async function handleReopen(id: string, reason?: string) {
    const res = await fetch(`/api/projects/${id}/reopen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason ?? '' }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      throw new Error((d as { error?: string }).error ?? 'Failed to reopen')
    }
    mutate()
  }

  async function handleDisapprove(id: string, reason: string, note: string) {
    const res = await fetch(`/api/projects/${id}/disapprove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason, note }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      throw new Error((d as { error?: string }).error ?? 'Failed to disapprove')
    }
    mutate()
  }

  const title = stageFilter ? `Projects — ${stageFilter}` : 'All Projects'

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{showTrash ? 'Trash' : title}</h2>
          {showTrash ? (
            <p className="text-sm text-gray-500">
              {deletedProjects.length} deleted project{deletedProjects.length !== 1 ? 's' : ''} — restore or permanently delete
            </p>
          ) : !isLoading && (
            <p className="text-sm text-gray-500">
              {filtered.length} project{filtered.length !== 1 ? 's' : ''}
              {unpaidFilter ? ' — balance outstanding' : ''}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowTrash((v) => !v)}
            className={`text-xs font-medium ${showTrash ? 'text-brand-600 hover:text-brand-700' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {showTrash ? '← Back to projects' : '🗑 Trash'}
          </button>
          <Link href="/dashboard/superadmin" className="text-xs text-brand-600 hover:text-brand-700 font-medium">
            ← Overview
          </Link>
        </div>
      </div>

      {/* Trash view — soft-deleted projects */}
      {showTrash && (
        <>
          {trashLoading && <Spinner />}
          {!trashLoading && deletedProjects.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-10 text-center">
              <p className="text-sm text-gray-400">Trash is empty.</p>
            </div>
          )}
          {!trashLoading && deletedProjects.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Ref</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Project</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Client</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Deleted</th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {deletedProjects.map((p) => (
                      <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-gray-500">{p.projectId}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{p.projectName}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{p.clientName}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">
                          {p.deletedAt ? new Date(p.deletedAt).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button size="sm" variant="secondary" onClick={() => handleRestore(p.id)} className="text-green-600 hover:text-green-700 border-green-300 hover:border-green-400">
                              ↩ Restore
                            </Button>
                            <Button size="sm" variant="secondary" onClick={() => handlePermanentDelete(p.id, p.projectName)} className="text-red-500 hover:text-red-700 border-red-200 hover:border-red-300">
                              Delete permanently
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {!showTrash && (
      <>
      {/* Search */}
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by project name, client, quotation number…"
          className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none"
          >
            ×
          </button>
        )}
      </div>

      {isLoading && <Spinner />}

      {!isLoading && filtered.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-10 text-center">
          <p className="text-sm text-gray-400">{search ? `No projects match "${search}"` : 'No projects found.'}</p>
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Ref</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Project</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Client</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Stage</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((p) => (
                  <ProjectRow
                    key={p.id}
                    project={p}
                    onAdvance={handleAdvance}
                    onDelete={handleDelete}
                    onReopen={handleReopen}
                    onDisapprove={setRejectProject}
                    onNotesSaved={() => mutate()}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </>
      )}

      {rejectProject && (
        <RejectReasonModal
          project={rejectProject}
          onClose={() => setRejectProject(null)}
          onConfirm={(reason, note) => handleDisapprove(rejectProject.id, reason, note)}
        />
      )}
    </div>
  )
}
