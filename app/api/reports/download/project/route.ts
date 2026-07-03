import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { getProjectById, getPaymentsByProject, getClientRequestsByParentProject } from '@/lib/airtable'
import { buildMultiSheetXlsx, xlsxResponse } from '@/lib/xlsxHelper'

export const dynamic = 'force-dynamic'

export const GET = requireRole('superadmin', 'manager')(async (req: NextRequest) => {
  const projectId = new URL(req.url).searchParams.get('id')
  if (!projectId) {
    return NextResponse.json({ error: 'id query param required' }, { status: 400 })
  }

  const [project, payments, linkedRequests] = await Promise.all([
    getProjectById(projectId),
    getPaymentsByProject(projectId),
    getClientRequestsByParentProject(projectId),
  ])

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  const clientRequests = linkedRequests
    .map((r) => (r.tradeReference ? `${r.requestType} (${r.tradeReference})` : r.requestType))
    .join(', ')

  const overviewRows = [{
    ref:         project.projectId ?? '',
    name:        project.projectName ?? '',
    client:      project.clientName ?? '',
    stage:       project.projectStage ?? '',
    emirate:     project.emirate ?? '',
    location:    project.location ?? '',
    description: project.projectDescription ?? '',
    totalCost:   project.projectTotalCost ?? 0,
    totalPaid:   project.totalPaid ?? 0,
    remaining:   project.remainingBalance ?? 0,
    paymentMode: project.paymentMode ?? '',
    clientRequests,
  }]

  const paymentRows = payments.map((p) => ({
    date:      p.receivedDate ?? p.dueDate ?? '',
    type:      p.paymentType ?? '',
    amount:    p.amount ?? 0,
    status:    p.paymentStatus ?? '',
    payerType: p.payerType ?? '',
    payerName: p.payerName ?? '',
    method:    p.paymentMethod ?? '',
    ref:       p.referenceNo ?? '',
    stage:     p.stageAtPayment ?? '',
  }))

  const buffer = await buildMultiSheetXlsx([
    {
      name: 'Project Overview',
      columns: [
        { header: 'Ref',          key: 'ref',         width: 14 },
        { header: 'Project Name', key: 'name',        width: 28 },
        { header: 'Client',       key: 'client',      width: 22 },
        { header: 'Stage',        key: 'stage',       width: 18 },
        { header: 'Emirate',      key: 'emirate',     width: 14 },
        { header: 'Location',     key: 'location',    width: 16 },
        { header: 'Description',  key: 'description', width: 30 },
        { header: 'Total Cost',   key: 'totalCost',   width: 14, isCurrency: true },
        { header: 'Total Paid',   key: 'totalPaid',   width: 14, isCurrency: true },
        { header: 'Remaining',    key: 'remaining',   width: 14, isCurrency: true },
        { header: 'Payment Mode', key: 'paymentMode', width: 16 },
        { header: 'Client Requests', key: 'clientRequests', width: 28 },
      ],
      rows: overviewRows,
    },
    {
      name: 'Payments',
      columns: [
        { header: 'Date',       key: 'date',      width: 14, isDate: true },
        { header: 'Type',       key: 'type',      width: 14 },
        { header: 'Amount',     key: 'amount',    width: 14, isCurrency: true },
        { header: 'Status',     key: 'status',    width: 14 },
        { header: 'Payer Type', key: 'payerType', width: 14 },
        { header: 'Payer Name', key: 'payerName', width: 20 },
        { header: 'Method',     key: 'method',    width: 16 },
        { header: 'Reference',  key: 'ref',       width: 18 },
        { header: 'Stage',      key: 'stage',     width: 16 },
      ],
      rows: paymentRows,
    },
  ])

  const safeName = (project.projectId ?? projectId).replace(/[^a-zA-Z0-9_-]/g, '_')
  return xlsxResponse(buffer, `Project_${safeName}`)
}) as (req: NextRequest) => Promise<NextResponse>
