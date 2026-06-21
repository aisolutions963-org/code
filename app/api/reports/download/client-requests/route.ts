import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { getClientRequests } from '@/lib/airtable'
import { buildMultiSheetXlsx, xlsxResponse } from '@/lib/xlsxHelper'
import { todayUAE } from '@/lib/dateUtils'

export const dynamic = 'force-dynamic'

export const GET = requireRole('manager', 'superadmin')(async () => {
  const requests = await getClientRequests()

  const trade       = requests.filter((r) => r.requestType === 'Trade')
  const maintenance = requests.filter((r) => r.requestType === 'Maintenance')
  const variance    = requests.filter((r) => r.requestType === 'Variance')

  function taskSummary(req: typeof requests[0]) {
    const tasks = req.tasks ?? []
    const done = tasks.filter((t) => t.status === 'Completed').length
    return tasks.length > 0 ? `${done}/${tasks.length}` : '—'
  }

  function taskList(req: typeof requests[0]) {
    return (req.tasks ?? [])
      .map((t) => `${t.taskName} [${t.status}]`)
      .join(', ') || '—'
  }

  const tradeRows = trade.map((r) => ({
    ref:     r.tradeReference ?? '—',
    client:  r.clientName ?? '—',
    phone:   r.clientPhone ?? '—',
    parent:  r.parentProjectName ?? '—',
    desc:    r.description ?? '—',
    stage:   r.projectStage ?? '—',
    tasks:   taskSummary(r),
    detail:  taskList(r),
    created: r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-GB') : '—',
  }))

  const maintenanceRows = maintenance.map((r) => ({
    client:  r.clientName ?? '—',
    phone:   r.clientPhone ?? '—',
    parent:  r.parentProjectName ?? '—',
    desc:    r.description ?? '—',
    stage:   r.projectStage ?? '—',
    tasks:   taskSummary(r),
    detail:  taskList(r),
    created: r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-GB') : '—',
  }))

  const varianceRows = variance.map((r) => ({
    ref:     r.tradeReference ?? '—',
    client:  r.clientName ?? '—',
    phone:   r.clientPhone ?? '—',
    parent:  r.parentProjectName ?? '—',
    desc:    r.description ?? '—',
    stage:   r.projectStage ?? '—',
    tasks:   taskSummary(r),
    detail:  taskList(r),
    created: r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-GB') : '—',
  }))

  const refCol    = { header: 'Reference',      key: 'ref',     width: 20 }
  const clientCol = { header: 'Client',          key: 'client',  width: 24 }
  const phoneCol  = { header: 'Phone',           key: 'phone',   width: 18 }
  const parentCol = { header: 'Parent Project',  key: 'parent',  width: 28 }
  const descCol   = { header: 'Description',     key: 'desc',    width: 36 }
  const stageCol  = { header: 'Stage',           key: 'stage',   width: 20 }
  const tasksCol  = { header: 'Tasks',           key: 'tasks',   width: 10 }
  const detailCol = { header: 'Task Detail',     key: 'detail',  width: 50 }
  const createdCol = { header: 'Created',        key: 'created', width: 14 }

  const buffer = await buildMultiSheetXlsx([
    {
      name: 'Trade',
      columns: [refCol, clientCol, phoneCol, parentCol, descCol, stageCol, tasksCol, detailCol, createdCol],
      rows: tradeRows,
    },
    {
      name: 'Maintenance',
      columns: [clientCol, phoneCol, parentCol, descCol, stageCol, tasksCol, detailCol, createdCol],
      rows: maintenanceRows,
    },
    {
      name: 'Variance',
      columns: [refCol, clientCol, phoneCol, parentCol, descCol, stageCol, tasksCol, detailCol, createdCol],
      rows: varianceRows,
    },
  ])

  return xlsxResponse(buffer, `Client_Requests_${todayUAE()}.xlsx`)
})
