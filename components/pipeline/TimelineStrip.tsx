'use client'

import { useEffect, useRef, useMemo } from 'react'
import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface CalendarEvent {
  id: string
  title: string
  date: string
  endDate?: string
  type: 'payment-due' | 'payment-received' | 'delivery' | 'installation' | 'fabrication'
  amount?: number
  notes?: string
  projectName?: string
  itemName?: string
  createdBy?: string
}

const TYPE_CFG: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  'fabrication':        { bg: 'bg-amber-500/20',  border: 'border-amber-500/30',  text: 'text-amber-300',  dot: 'bg-amber-500'  },
  'delivery':           { bg: 'bg-blue-500/20',   border: 'border-blue-500/30',   text: 'text-blue-300',   dot: 'bg-blue-500'   },
  'installation':       { bg: 'bg-cyan-500/20',   border: 'border-cyan-500/30',   text: 'text-cyan-300',   dot: 'bg-cyan-500'   },
  'payment-due':        { bg: 'bg-red-500/20',    border: 'border-red-500/30',    text: 'text-red-300',    dot: 'bg-red-500'    },
  'payment-received':   { bg: 'bg-green-500/20',  border: 'border-green-500/30',  text: 'text-green-300',  dot: 'bg-green-500'  },
}

const DAY_W = 36

function isoToLocal(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function dayIndex(base: Date, d: Date): number {
  return Math.round((d.getTime() - base.getTime()) / 86400000)
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function TimelineStrip() {
  const containerRef = useRef<HTMLDivElement>(null)

  const today = useMemo(() => {
    const d = new Date(); d.setHours(0,0,0,0); return d
  }, [])

  const START_DAYS = 14
  const TOTAL_DAYS = 90
  const baseDate = useMemo(() => {
    const d = new Date(today); d.setDate(d.getDate() - START_DAYS); return d
  }, [today])

  const days = useMemo(() => {
    return Array.from({ length: TOTAL_DAYS }, (_, i) => {
      const d = new Date(baseDate); d.setDate(d.getDate() + i); return d
    })
  }, [baseDate])

  const todayIdx = START_DAYS

  const { data } = useSWR<{ events: CalendarEvent[] }>('/api/calendar', fetcher, { refreshInterval: 120000 })
  const events = data?.events ?? []

  const eventsByDay = useMemo(() => {
    const map = new Map<number, CalendarEvent[]>()
    for (const ev of events) {
      const d = isoToLocal(ev.date)
      const idx = dayIndex(baseDate, d)
      if (idx >= 0 && idx < TOTAL_DAYS) {
        const list = map.get(idx) ?? []
        list.push(ev)
        map.set(idx, list)
      }
    }
    return map
  }, [events, baseDate])

  const fabSpans = useMemo(() => {
    const spans: Array<{ startIdx: number; endIdx: number; title: string; tooltip: string; id: string }> = []
    for (const ev of events) {
      if (ev.type === 'fabrication' && ev.endDate) {
        const startIdx = dayIndex(baseDate, isoToLocal(ev.date))
        const endIdx = dayIndex(baseDate, isoToLocal(ev.endDate))
        if (endIdx >= 0 && startIdx < TOTAL_DAYS) {
          const tooltip = [
            ev.title,
            ev.projectName && `Project: ${ev.projectName}`,
            ev.itemName && `Item: ${ev.itemName}`,
            ev.createdBy && `By: ${ev.createdBy}`,
            ev.notes && `Notes: ${ev.notes}`,
          ].filter(Boolean).join('\n')
          spans.push({ startIdx: Math.max(0, startIdx), endIdx: Math.min(TOTAL_DAYS - 1, endIdx), title: ev.title, tooltip, id: ev.id })
        }
      }
    }
    return spans
  }, [events, baseDate])

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollLeft = (todayIdx - 4) * DAY_W
    }
  }, [todayIdx])

  return (
    <div className="shrink-0 border-t border-white/[0.06]"
      style={{ height: 160, background: 'rgba(12,12,22,0.95)' }}>

      {/* Header label */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-white/[0.04]">
        <svg className="w-3.5 h-3.5 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span className="text-[11px] text-white/30 uppercase tracking-widest font-medium">90-Day Timeline</span>
        <div className="flex items-center gap-3 ml-4">
          {Object.entries(TYPE_CFG).map(([type, cfg]) => (
            <div key={type} className="flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
              <span className="text-[10px] text-white/30 capitalize">{type.replace('-', ' ')}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Scroll area */}
      <div ref={containerRef} className="overflow-x-auto overflow-y-hidden scrollbar-thin h-[124px]">
        <div className="relative" style={{ width: TOTAL_DAYS * DAY_W, height: '100%' }}>

          {/* Month dividers + date headers */}
          <div className="flex absolute top-0 left-0 h-7">
            {days.map((d, i) => {
              const isFirst = i === 0 || d.getMonth() !== days[i - 1].getMonth()
              const isTodayDay = i === todayIdx
              return (
                <div
                  key={i}
                  className={`relative shrink-0 flex flex-col items-center justify-end pb-0.5 border-r border-white/[0.04]
                    ${isTodayDay ? 'bg-brand-500/10' : ''}`}
                  style={{ width: DAY_W }}
                >
                  {isFirst && (
                    <span className="absolute top-1 left-1 text-[9px] text-white/30 font-bold uppercase tracking-wide">
                      {MONTH_NAMES[d.getMonth()]}
                    </span>
                  )}
                  <span className={`text-[10px] ${isTodayDay ? 'text-brand-400 font-bold' : 'text-white/25'}`}>
                    {d.getDate()}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Today vertical line */}
          <div
            className="absolute top-0 bottom-0 w-px bg-brand-500/60 z-10"
            style={{ left: todayIdx * DAY_W + DAY_W / 2 }}
          >
            <span className="absolute -top-0 left-1 text-[9px] text-brand-400 font-bold whitespace-nowrap">Today</span>
          </div>

          {/* Fabrication spans */}
          {fabSpans.map((span) => (
            <div
              key={span.id}
              title={span.tooltip}
              className="absolute top-9 h-5 rounded-full bg-amber-500/25 border border-amber-500/30 flex items-center px-2"
              style={{ left: span.startIdx * DAY_W + 2, width: (span.endIdx - span.startIdx + 1) * DAY_W - 4 }}
            >
              <span className="text-[9px] text-amber-300 truncate">{span.title}</span>
            </div>
          ))}

          {/* Day event dots (non-fabrication) */}
          <div className="absolute top-[62px] left-0 flex" style={{ height: 60 }}>
            {days.map((_, i) => {
              const dayEvs = (eventsByDay.get(i) ?? []).filter((e) => e.type !== 'fabrication')
              return (
                <div key={i} className="shrink-0 flex flex-col items-center gap-0.5 pt-1"
                  style={{ width: DAY_W }}>
                  {dayEvs.slice(0, 3).map((ev) => {
                    const cfg = TYPE_CFG[ev.type] ?? TYPE_CFG['delivery']
                    return (
                      <div
                        key={ev.id}
                        title={[
                          `${ev.type.replace('-', ' ')}: ${ev.title}`,
                          ev.projectName && `Project: ${ev.projectName}`,
                          ev.itemName && `Item: ${ev.itemName}`,
                          ev.amount != null && `AED ${ev.amount.toLocaleString()}`,
                          ev.createdBy && `By: ${ev.createdBy}`,
                          ev.notes && `Notes: ${ev.notes}`,
                        ].filter(Boolean).join('\n')}
                        className={`w-2.5 h-2.5 rounded-full ${cfg.dot} opacity-80 hover:opacity-100 cursor-default transition-opacity`}
                      />
                    )
                  })}
                  {dayEvs.length > 3 && (
                    <span className="text-[8px] text-white/25">+{dayEvs.length - 3}</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
