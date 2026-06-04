'use client'

import { useState } from 'react'
import { Task, DocLink, Attachment } from '@/lib/types'

interface LinkRow {
  label: string
  url: string
  notes?: string
}

interface TaskGroup {
  taskName: string
  itemName?: string
  links: LinkRow[]
}

function collectGroups(tasks: Task[]): TaskGroup[] {
  const groups: TaskGroup[] = []

  for (const task of tasks) {
    const links: LinkRow[] = []

    for (const d of task.taskDocLinks ?? []) {
      if (d.url) links.push({ label: d.label || 'Link', url: d.url, notes: d.notes })
    }
    for (const d of task.fillersDocLinks ?? []) {
      if (d.url) links.push({ label: d.label || 'Fillers', url: d.url, notes: d.notes })
    }
    for (const a of task.taskDocuments ?? []) {
      if (a.url) links.push({ label: a.filename || 'File', url: a.url })
    }
    for (const a of task.fillersAndMissingList ?? []) {
      if (a.url) links.push({ label: a.filename || 'Fillers file', url: a.url })
    }

    if (links.length > 0) {
      groups.push({ taskName: task.taskName, links })
    }
  }

  return groups
}

function ExternalIcon() {
  return (
    <svg className="w-3 h-3 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  )
}

interface Props {
  tasks: Task[]
}

export default function ProjectAttachmentsSection({ tasks }: Props) {
  const [open, setOpen] = useState(false)
  const groups = collectGroups(tasks)

  if (groups.length === 0) return null

  const totalLinks = groups.reduce((s, g) => s + g.links.length, 0)

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 transition-colors group"
      >
        <svg className="w-3.5 h-3.5 text-gray-400 group-hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
        </svg>
        Attachments & Links
        <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-semibold">
          {totalLinks}
        </span>
        <svg
          className={`w-3 h-3 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {groups.map((group, gi) => (
            <div key={gi} className="border border-gray-100 rounded-xl overflow-hidden">
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
                <p className="text-xs font-medium text-gray-600 truncate">{group.taskName}</p>
              </div>
              <div className="divide-y divide-gray-50">
                {group.links.map((link, li) => (
                  <a
                    key={li}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 transition-colors"
                  >
                    <span className="flex-1 text-xs text-blue-600 hover:underline truncate">
                      {link.label}
                    </span>
                    {link.notes && (
                      <span className="text-xs text-gray-400 truncate max-w-[120px]">{link.notes}</span>
                    )}
                    <ExternalIcon />
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
