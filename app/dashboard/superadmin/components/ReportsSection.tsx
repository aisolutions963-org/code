'use client'

import { useState } from 'react'
import { getWoodWingsQuarter, getWoodWingsQuarterRange } from '@/lib/dateUtils'
import { ReportCategory, REPORT_TABS } from './types'
import CalendarPage from './CalendarPage'
import ClientsReportView from './ClientsReportView'

export default function ReportsSection() {
  const fmt = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' })
  const current = getWoodWingsQuarter()

  const [activeTab, setActiveTab] = useState<ReportCategory>('Sales')
  const [downloading, setDownloading] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [fiscalYear, setFiscalYear] = useState(current.fiscalYear)
  const [q, setQ] = useState(current.quarter)

  const info = getWoodWingsQuarterRange(q as 1 | 2 | 3 | 4, fiscalYear)
  const from  = fmt(info.start)
  const to    = fmt(info.end)
  const label = info.label

  async function downloadReport(route: string, name: string) {
    setDownloading(route)
    setDownloadError(null)
    try {
      const res = await fetch(`/api/reports/download/${route}?from=${from}&to=${to}`)
      if (!res.ok) throw new Error('Download failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${name.replace(/\s+/g, '_')}_Q${q}_FY${fiscalYear}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      setDownloadError('Download failed. Please try again.')
    } finally {
      setDownloading(null)
    }
  }

  const currentTab = REPORT_TABS.find((t) => t.category === activeTab)!
  const TAB_ACTIVE: Record<ReportCategory, string> = {
    Sales: 'bg-green-600 text-white border-green-600',
    Accountant: 'bg-red-600 text-white border-red-600',
    Material: 'bg-purple-600 text-white border-purple-600',
    Calendar: 'bg-yellow-500 text-white border-yellow-500',
    Clients: 'bg-sky-600 text-white border-sky-600',
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm font-semibold text-gray-700">Reports</p>
        {/* Quarter selector */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Year */}
          <div className="flex items-center gap-1">
            <button onClick={() => setFiscalYear(y => y - 1)} className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 text-xs">‹</button>
            <span className="text-xs font-semibold text-gray-700 w-10 text-center">{fiscalYear}</span>
            <button onClick={() => setFiscalYear(y => y + 1)} disabled={fiscalYear >= current.fiscalYear} className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 text-xs disabled:opacity-30">›</button>
          </div>
          {/* Quarter buttons */}
          <div className="flex gap-1">
            {[1, 2, 3, 4].map((n) => (
              <button
                key={n}
                onClick={() => setQ(n as 1 | 2 | 3 | 4)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md border transition-colors ${
                  q === n ? 'bg-gray-800 text-white border-gray-800' : 'text-gray-500 border-gray-200 hover:border-gray-400 hover:text-gray-700'
                }`}
              >
                Q{n}
              </button>
            ))}
          </div>
          <span className="text-xs text-gray-400">{label}</span>
        </div>
      </div>
      {/* Tabs */}
      <div className="flex gap-2 px-5 pt-4 pb-2">
        {REPORT_TABS.map((tab) => (
          <button
            key={tab.category}
            onClick={() => setActiveTab(tab.category)}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-full border transition-colors ${
              activeTab === tab.category ? TAB_ACTIVE[tab.category] : 'text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            {tab.category}
          </button>
        ))}
      </div>

      {/* Download error */}
      {downloadError && (
        <div className="mx-5 mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center justify-between">
          <span>{downloadError}</span>
          <button onClick={() => setDownloadError(null)} className="ml-2 text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {/* Report list */}
      <div className={activeTab === 'Calendar' ? '' : 'px-5 pb-4'}>
        {activeTab === 'Calendar' ? (
          <CalendarPage />
        ) : activeTab === 'Clients' ? (
          <ClientsReportView />
        ) : currentTab.reports.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">Coming soon</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {currentTab.reports.map((report) => (
              <div key={report.route} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800">{report.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{report.description}</p>
                </div>
                <button
                  onClick={() => downloadReport(report.route, report.name)}
                  disabled={downloading === report.route}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 disabled:opacity-50 transition-colors"
                >
                  {downloading === report.route ? (
                    <div className="w-3 h-3 border border-gray-500 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  )}
                  Excel
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
