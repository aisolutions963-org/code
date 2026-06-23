'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { ClientRequest, Project, Role } from '@/lib/types'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type RequestType = 'Trade' | 'Maintenance' | 'Variance'

interface SedMember {
  id: string
  name: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function taskProgress(req: ClientRequest): { done: number; total: number } {
  const tasks = req.tasks ?? []
  return {
    done: tasks.filter((t) => t.status === 'Completed').length,
    total: tasks.length,
  }
}

function isCompleted(req: ClientRequest): boolean {
  const { done, total } = taskProgress(req)
  return total > 0 && done === total
}

const TYPE_BADGE: Record<RequestType, string> = {
  Trade:       'bg-blue-100 text-blue-700',
  Maintenance: 'bg-orange-100 text-orange-700',
  Variance:    'bg-purple-100 text-purple-700',
}

const TASK_STATUS_STYLE: Record<string, string> = {
  'Completed':         'bg-green-100 text-green-700',
  'In Progress':       'bg-blue-100 text-blue-700',
  'To Do':             'bg-amber-100 text-amber-700',
  'Pending Approval':  'bg-purple-100 text-purple-700',
  'Locked':            'bg-gray-100 text-gray-400',
}

// ─── Request Card ─────────────────────────────────────────────────────────────

function RequestCard({ req }: { req: ClientRequest }) {
  const { done, total } = taskProgress(req)
  const completed = isCompleted(req)
  const [expanded, setExpanded] = useState(false)
  const tasks = req.tasks ?? []

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow transition-shadow">
      <div
        className="p-4 cursor-pointer"
        onClick={() => tasks.length > 0 && setExpanded((e) => !e)}
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full ${
              TYPE_BADGE[req.requestType as RequestType] ?? 'bg-gray-100 text-gray-600'
            }`}>
              {req.requestType}
            </span>
            <span className="text-sm font-semibold text-gray-800">{req.clientName}</span>
            {req.clientPhone && (
              <span className="text-xs text-gray-400">{req.clientPhone}</span>
            )}
          </div>
          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 ${
            completed ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
          }`}>
            {completed ? 'Completed' : 'Active'}
          </span>
        </div>

        {(req.parentProjectName || req.tradeReference) && (
          <div className="text-xs text-gray-500 mb-2 flex flex-wrap gap-x-3">
            {req.parentProjectName && (
              <span>Project: <span className="font-medium text-gray-700">{req.parentProjectName}</span></span>
            )}
            {req.tradeReference && (
              <span>
                Ref:{' '}
                <span className={`font-mono font-semibold ${
                  req.requestType === 'Variance' ? 'text-purple-700' : 'text-blue-700'
                }`}>
                  {req.tradeReference}
                </span>
              </span>
            )}
          </div>
        )}

        {req.description && (
          <p className="text-xs text-gray-500 mb-2 line-clamp-2">{req.description}</p>
        )}

        <div className="flex items-center justify-between mt-1">
          <div className="flex items-center gap-2 flex-1">
            <div className="flex-1 bg-gray-100 rounded-full h-1.5 max-w-[120px]">
              <div
                className={`h-1.5 rounded-full transition-all ${completed ? 'bg-green-500' : 'bg-blue-500'}`}
                style={{ width: total > 0 ? `${(done / total) * 100}%` : '0%' }}
              />
            </div>
            <span className="text-xs text-gray-400">{done} / {total} tasks</span>
            {tasks.length > 0 && (
              <svg
                className={`w-3.5 h-3.5 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            )}
          </div>
          {req.createdAt && (
            <span className="text-xs text-gray-400">
              {new Date(req.createdAt).toLocaleDateString('en-AE')}
            </span>
          )}
        </div>

        <Link
          href={`/dashboard/project/${req.id}`}
          className="inline-block mt-2 text-[11px] font-medium text-blue-600 hover:text-blue-800 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          Open project →
        </Link>
      </div>

      {expanded && tasks.length > 0 && (
        <div className="border-t border-gray-100 divide-y divide-gray-50">
          {tasks.map((t) => (
            <div key={t.id} className="flex items-center justify-between px-4 py-2.5 gap-3">
              <span className="text-xs text-gray-700 flex-1 truncate">{t.taskName}</span>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${
                TASK_STATUS_STYLE[t.status] ?? 'bg-gray-100 text-gray-500'
              }`}>
                {t.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Create Modal ─────────────────────────────────────────────────────────────

function CreateModal({
  onClose,
  onCreated,
  showSedPicker,
}: {
  onClose: () => void
  onCreated: () => void
  showSedPicker: boolean
}) {
  const [requestType, setRequestType] = useState<RequestType>('Trade')
  const [parentProjectId, setParentProjectId] = useState('')
  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [description, setDescription] = useState('')
  const [refInput, setRefInput] = useState('')       // trade reference (trx) OR variance reference (vrx)
  const [selectedSedId, setSelectedSedId] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  // Maintenance needs warranty-stage projects; Trade + Variance need all active projects
  const projectsUrl = requestType === 'Maintenance'
    ? '/api/projects?stage=Closed+and+active+warranty'
    : '/api/projects'

  const { data: projectsData } = useSWR<{ projects: Project[] }>(projectsUrl, fetcher)
  const filteredProjects = projectsData?.projects ?? []

  const { data: sedData } = useSWR<{ members: SedMember[] }>(
    showSedPicker ? '/api/team/sed' : null,
    fetcher,
  )
  const sedMembers = sedData?.members ?? []

  const selectedProject = filteredProjects.find((p) => p.id === parentProjectId)

  // Auto-populate SED, client name, and phone when a project is selected
  useEffect(() => {
    if (!parentProjectId) return
    const proj = filteredProjects.find((p) => p.id === parentProjectId)
    if (!proj) return
    if (showSedPicker && proj.salesOwner?.id) setSelectedSedId(proj.salesOwner.id)
    if (proj.clientName) setClientName(proj.clientName)
    if (proj.clientPhone) setClientPhone(proj.clientPhone)
  }, [parentProjectId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Build full reference
  const quotNum = selectedProject?.quotationNumber ?? ''
  const quotRef = selectedProject?.quotationReference ?? ''
  const refInputClean = refInput.trim()

  let fullRef = ''
  if (requestType === 'Trade') {
    // {projQuotNum}{tradeRef}{projQuotRef}  e.g. 2341Tr1R3
    fullRef = [quotNum, refInputClean, quotRef].filter(Boolean).join('')
  } else if (requestType === 'Variance') {
    // {projQuotNum}{varianceRef}{projQuotRef}  e.g. 2341VR1R3
    fullRef = [quotNum, refInputClean, quotRef].filter(Boolean).join('')
  }

  // Reset fields when type changes
  function handleTypeChange(t: RequestType) {
    setRequestType(t)
    setParentProjectId('')
    setSelectedSedId('')
    setClientName('')
    setClientPhone('')
    setRefInput('')
  }

  const inp =
    'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400'

  async function handleSubmit() {
    setErr('')
    if (!parentProjectId) {
      setErr(
        requestType === 'Trade'
          ? 'Select the parent project for this trade'
          : requestType === 'Variance'
          ? 'Select the parent project this variance belongs to'
          : 'Select the project under warranty for this maintenance request',
      )
      return
    }
    if (!clientName.trim()) { setErr('Client name is required'); return }
    if (requestType === 'Variance' && !refInputClean) {
      setErr('Variance reference is required (e.g. VR1)')
      return
    }
    if (requestType === 'Trade' && !refInputClean) {
      setErr('Trade reference is required (e.g. Tr1)')
      return
    }

    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        requestType,
        clientName: clientName.trim(),
        parentProjectId,
      }
      if (clientPhone.trim()) body.clientPhone = clientPhone.trim()
      if (description.trim()) body.description = description.trim()
      if ((requestType === 'Trade' || requestType === 'Variance') && fullRef) {
        body.tradeReference = fullRef
      }
      if (showSedPicker && selectedSedId) body.salesOwnerCollaboratorId = selectedSedId

      const res = await fetch('/api/client-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create')

      if (data.warning) {
        toast(`${requestType} request created — ${data.warning}`, { icon: '⚠️', duration: 8000 })
      } else {
        toast.success(`${requestType} request created — ${data.tasksCreated} tasks ready`)
      }
      onCreated()
      onClose()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed'
      setErr(msg)
      toast.error('Failed to create request')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">New Client Request</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">
            ×
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Request Type */}
          <div>
            <p className="text-xs text-gray-500 mb-1.5 font-medium">Request Type</p>
            <div className="flex rounded-lg overflow-hidden border border-gray-200">
              {(['Trade', 'Maintenance', 'Variance'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => handleTypeChange(t)}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${
                    requestType === t
                      ? t === 'Trade'
                        ? 'bg-blue-600 text-white'
                        : t === 'Variance'
                        ? 'bg-purple-600 text-white'
                        : 'bg-orange-500 text-white'
                      : 'bg-white text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            {requestType === 'Variance' && (
              <p className="text-[11px] text-purple-600 mt-1.5 font-medium">
                Adds a scoped item to an existing project — inherits the project&apos;s client and SED.
              </p>
            )}
          </div>

          {/* Project selection */}
          <div>
            <label className="block text-xs text-gray-500 mb-1 font-medium">
              {requestType === 'Trade'
                ? 'Parent Project *'
                : requestType === 'Variance'
                ? 'Parent Project *'
                : 'Project Under Warranty *'}
            </label>
            <select
              className={inp}
              value={parentProjectId}
              onChange={(e) => setParentProjectId(e.target.value)}
            >
              <option value="">Select project…</option>
              {filteredProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.projectName}
                  {p.projectId ? ` (${p.projectId})` : ''}
                </option>
              ))}
            </select>
            {requestType === 'Maintenance' && filteredProjects.length === 0 && (
              <p className="text-[11px] text-orange-500 mt-1">No projects in active warranty found</p>
            )}
            {(requestType === 'Trade' || requestType === 'Variance') && parentProjectId && !selectedProject?.quotationNumber && (
              <p className="text-[11px] text-orange-500 mt-1">
                This project has no quotation number — the reference will be missing its project prefix
              </p>
            )}
          </div>

          {/* Variance Reference — Variance only */}
          {requestType === 'Variance' && (
            <div>
              <label className="block text-xs text-gray-500 mb-1 font-medium">
                Variance Reference <span className="text-red-500">*</span>
              </label>
              <input
                className={inp}
                value={refInput}
                onChange={(e) => setRefInput(e.target.value)}
                placeholder="e.g. VR1"
              />
              {refInputClean && !quotNum && (
                <p className="text-[11px] text-orange-500 mt-1">Select a project to generate the full reference</p>
              )}
              {fullRef && (
                <p className="text-[11px] text-gray-400 mt-1">
                  Reference: <span className="font-mono font-semibold text-purple-700">{fullRef}</span>
                </p>
              )}
            </div>
          )}

          {/* Trade Reference — Trade only */}
          {requestType === 'Trade' && (
            <div className="space-y-3">
              {/* Auto-filled from project */}
              {parentProjectId && (
                <div className="grid grid-cols-2 gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5">
                  <div>
                    <p className="text-[10px] text-blue-400 font-medium uppercase tracking-wide mb-0.5">Quotation No. (auto)</p>
                    <p className="text-sm font-mono font-semibold text-blue-800">
                      {quotNum || <span className="text-orange-500 font-normal text-xs">Not set on project</span>}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-blue-400 font-medium uppercase tracking-wide mb-0.5">Quotation Ref. (auto)</p>
                    <p className="text-sm font-mono font-semibold text-blue-800">
                      {quotRef || <span className="text-orange-500 font-normal text-xs">Not set on project</span>}
                    </p>
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs text-gray-500 mb-1 font-medium">
                  Trade Reference <span className="text-red-500">*</span>
                </label>
                <input
                  className={inp}
                  value={refInput}
                  onChange={(e) => setRefInput(e.target.value)}
                  placeholder="e.g. Tr1"
                />
              </div>
              {refInputClean && !quotNum && (
                <p className="text-[11px] text-orange-500">Select a project first to include the quotation number in the reference</p>
              )}
              {fullRef && (
                <p className="text-[11px] text-gray-400">
                  Full reference: <span className="font-mono font-semibold text-blue-700">{fullRef}</span>
                </p>
              )}
            </div>
          )}

          {/* Client Name */}
          <div>
            <label className="block text-xs text-gray-500 mb-1 font-medium">Client Name *</label>
            <input
              className={inp}
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="e.g. Ahmed Al Mansoori"
            />
          </div>

          {/* Client Phone */}
          <div>
            <label className="block text-xs text-gray-500 mb-1 font-medium">Client Phone</label>
            <input
              className={inp}
              value={clientPhone}
              onChange={(e) => setClientPhone(e.target.value)}
              placeholder="+971 50 000 0000"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs text-gray-500 mb-1 font-medium">
              {requestType === 'Variance'
                ? 'What was added / changed?'
                : requestType === 'Trade'
                ? 'Trade Description'
                : 'Description'}
            </label>
            <textarea
              className={`${inp} resize-none`}
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                requestType === 'Variance'
                  ? 'Describe the additional scope or item noticed…'
                  : requestType === 'Trade'
                  ? 'Describe the trade work needed…'
                  : 'What maintenance does the client need?'
              }
            />
          </div>

          {/* SED picker — manager/superadmin only */}
          {showSedPicker && (
            <div>
              <label className="block text-xs text-gray-500 mb-1 font-medium">SED Responsible</label>
              <select
                className={inp}
                value={selectedSedId}
                onChange={(e) => setSelectedSedId(e.target.value)}
              >
                <option value="">Unassigned</option>
                {sedMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {err && <p className="text-xs text-red-600">{err}</p>}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50 transition-colors ${
              requestType === 'Variance'
                ? 'bg-purple-600 hover:bg-purple-700'
                : requestType === 'Trade'
                ? 'bg-blue-600 hover:bg-blue-700'
                : 'bg-orange-500 hover:bg-orange-600'
            }`}
          >
            {saving ? 'Creating…' : 'Create Request'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Client Component ────────────────────────────────────────────────────

export default function ClientRequestsClient({ role }: { role: Role }) {
  const [showCreate, setShowCreate] = useState(false)
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all')
  const [typeFilter, setTypeFilter] = useState<'all' | RequestType>('all')

  const { data, isLoading, mutate } = useSWR<{ requests: ClientRequest[] }>(
    '/api/client-requests',
    fetcher,
    { refreshInterval: 300_000 },
  )

  const showSedPicker = role === 'manager' || role === 'superadmin'
  const requests = data?.requests ?? []

  const filtered = requests.filter((r) => {
    if (typeFilter !== 'all' && r.requestType !== typeFilter) return false
    const done = isCompleted(r)
    if (filter === 'active' && done) return false
    if (filter === 'completed' && !done) return false
    return true
  })

  const chipCls = (active: boolean) =>
    `px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer select-none ${
      active ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
    }`

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-800">Client Requests</h1>
          <p className="text-xs text-gray-400 mt-0.5">Trade, Maintenance &amp; Variance requests</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
        >
          + New Request
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button className={chipCls(typeFilter === 'all')} onClick={() => setTypeFilter('all')}>All types</button>
        <button className={chipCls(typeFilter === 'Trade')} onClick={() => setTypeFilter('Trade')}>Trade</button>
        <button className={chipCls(typeFilter === 'Maintenance')} onClick={() => setTypeFilter('Maintenance')}>Maintenance</button>
        <button className={chipCls(typeFilter === 'Variance')} onClick={() => setTypeFilter('Variance')}>Variance</button>
        <span className="w-px bg-gray-200 mx-1 self-stretch" />
        <button className={chipCls(filter === 'all')} onClick={() => setFilter('all')}>All</button>
        <button className={chipCls(filter === 'active')} onClick={() => setFilter('active')}>Active</button>
        <button className={chipCls(filter === 'completed')} onClick={() => setFilter('completed')}>Completed</button>
      </div>

      {isLoading ? (
        <div className="text-sm text-gray-400 py-8 text-center">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-gray-400 py-8 text-center">
          {requests.length === 0
            ? 'No client requests yet. Create one to get started.'
            : 'No requests match the current filters.'}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((req) => (
            <RequestCard key={req.id} req={req} />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={() => mutate()}
          showSedPicker={showSedPicker}
        />
      )}
    </div>
  )
}
