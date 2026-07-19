'use client'

import { useState, useMemo } from 'react'
import useSWR from 'swr'
import { Project, Client } from '@/lib/types'
import { projectRefLabel } from '@/lib/projectRef'
import { todayUAE } from '@/lib/dateUtils'
import { stageBadgeClass, stageLabel } from '@/lib/stageDisplay'
import { fetcher } from './shared'

export default function ClientsReportView() {
  const { data: clientsData, isLoading: clientsLoading } = useSWR<{ clients: Client[] }>('/api/clients', fetcher)
  const { data: projectsData, isLoading: projectsLoading } = useSWR<{ projects: Project[] }>('/api/projects', fetcher)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [downloading, setDownloading] = useState<string | null>(null)
  const [dlError, setDlError] = useState<string | null>(null)

  const clients = clientsData?.clients ?? []
  const projects = projectsData?.projects ?? []

  const projectsByClient = useMemo(() => {
    const map = new Map<string, Project[]>()
    for (const p of projects) {
      const key = p.clientName.toLowerCase()
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(p)
    }
    return map
  }, [projects])

  const filtered = clients.filter((c) =>
    !search.trim() || c.clientName.toLowerCase().includes(search.toLowerCase()),
  )

  async function downloadClient(clientName: string) {
    setDownloading(clientName)
    setDlError(null)
    try {
      const res = await fetch(`/api/reports/download/client-projects?clientName=${encodeURIComponent(clientName)}`)
      if (!res.ok) throw new Error('Download failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Client_${clientName.replace(/\s+/g, '_')}_${todayUAE()}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      setDlError('Download failed. Please try again.')
    } finally {
      setDownloading(null)
    }
  }

  const isLoading = clientsLoading || projectsLoading

  return (
    <div className="space-y-3 pb-2">
      {dlError && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center justify-between">
          <span>{dlError}</span>
          <button onClick={() => setDlError(null)} className="ml-2 text-red-400 hover:text-red-600">✕</button>
        </div>
      )}
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" />
        </svg>
        <input
          className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
          placeholder="Search clients…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading && (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-6">No clients found</p>
      )}

      {!isLoading && filtered.map((client) => {
        const clientProjects = projectsByClient.get(client.clientName.toLowerCase()) ?? []
        const isOpen = expanded === client.id
        const totalValue = clientProjects.reduce((s, p) => s + (p.projectTotalCost ?? 0), 0)
        const totalPaid = clientProjects.reduce((s, p) => s + (p.totalPaid ?? 0), 0)

        return (
          <div key={client.id} className="border border-gray-200 rounded-xl overflow-hidden">
            {/* Client header row */}
            <div className="flex items-center gap-3 px-4 py-3 bg-sky-50 hover:bg-sky-100 transition-colors">
              <button
                className="flex-1 flex items-center gap-3 text-left min-w-0"
                onClick={() => setExpanded(isOpen ? null : client.id)}
              >
                <div className="w-8 h-8 rounded-full bg-sky-200 flex items-center justify-center shrink-0 text-sky-700 font-bold text-sm">
                  {client.clientName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{client.clientName}</p>
                  <p className="text-xs text-gray-400">
                    {client.phone && <span className="mr-3">{client.phone}</span>}
                    <span>{clientProjects.length} project{clientProjects.length !== 1 ? 's' : ''}</span>
                    {totalValue > 0 && <span className="ml-3 text-sky-600 font-medium">AED {totalValue.toLocaleString()}</span>}
                  </p>
                </div>
                <svg
                  className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ml-auto ${isOpen ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <button
                onClick={() => downloadClient(client.clientName)}
                disabled={downloading === client.clientName}
                title="Download Excel report"
                className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-sky-300 text-sky-700 hover:bg-sky-200 disabled:opacity-50 transition-colors"
              >
                {downloading === client.clientName ? (
                  <div className="w-3 h-3 border border-sky-500 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                )}
                Excel
              </button>
            </div>

            {/* Expanded: project list */}
            {isOpen && (
              <div className="divide-y divide-gray-100">
                {clientProjects.length === 0 ? (
                  <p className="px-4 py-4 text-sm text-gray-400 italic">No projects found for this client</p>
                ) : (
                  <>
                    {clientProjects.map((p) => (
                      <div key={p.id} className="px-4 py-3 flex items-start justify-between gap-3 hover:bg-gray-50">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-mono text-gray-400">{projectRefLabel(p)}</span>
                            <span
                              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${stageBadgeClass(p.projectStage)}`}
                            >
                              {stageLabel(p.projectStage)}
                            </span>
                          </div>
                          <p className="text-sm font-medium text-gray-800 mt-0.5 truncate">{p.projectName}</p>
                          {(p.emirate || p.location) && (
                            <p className="text-xs text-gray-400 truncate">{[p.emirate, p.location].filter(Boolean).join(' — ')}</p>
                          )}
                        </div>
                        <div className="text-right shrink-0 text-xs">
                          {(p.projectTotalCost ?? 0) > 0 && (
                            <>
                              <p className="font-semibold text-gray-700">AED {(p.projectTotalCost ?? 0).toLocaleString()}</p>
                              <p className="text-gray-400">Paid: {(p.totalPaid ?? 0).toLocaleString()}</p>
                              {(p.remainingBalance ?? 0) > 0 && (
                                <p className="text-red-500">Due: {(p.remainingBalance ?? 0).toLocaleString()}</p>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                    {/* Summary row */}
                    <div className="px-4 py-2.5 bg-gray-50 flex justify-between text-xs font-semibold text-gray-600">
                      <span>{clientProjects.length} project{clientProjects.length !== 1 ? 's' : ''} total</span>
                      <span>
                        AED {totalValue.toLocaleString()} &nbsp;·&nbsp; Paid {totalPaid.toLocaleString()} &nbsp;·&nbsp;
                        <span className="text-red-500">Due {(totalValue - totalPaid).toLocaleString()}</span>
                      </span>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
