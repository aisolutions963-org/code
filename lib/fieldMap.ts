export const CLIENTS = {
  TABLE_ID: 'tblRDICf8jQOOvQPf',
  CLIENT_ID: 'fldukexc33DyUohtd',
  CLIENT_NAME: 'fldPOYo9wPYMz8y5J',
  PHONE: 'fld2wGFrsIkZ2WJKX',
  EMAIL: 'fldAhLNSsczIN9W20',
  PROJECTS: 'fldg6O6PUTESQDTNn',
} as const

export const END_USERS = {
  TABLE_ID:    'tblb0ZAwU0gvP2Qht',
  NAME:        'fldLoq8lMYo5jbLb3',  // singleLineText — End User Name
  PHONE_EMAIL: 'fldrx3Xjc9zpG0tNr',  // singleLineText — Phone / Email
  PROJECT:     'fld6YVYG1Phu0pP6I',  // multipleRecordLinks → PROJECTS
  CLIENT:      'fldIY8VZCxzN6DfGB',  // multipleRecordLinks → CLIENTS
} as const

export const TASK_TEMPLATES = {
  TABLE_ID: 'tblfJFDNd2dcY1rUk',
  TASK_NAME: 'fldhUOs66e7p0IRhR',
  DEPARTMENT: 'fldpMqqDluxlVU7Qz',
  TEMPLATE_ORDER: 'fldQVmI7bzlIIllZQ',
  PROJECT_STAGE: 'fld7qqK3fUM8gjt6Z',
  PATH_CONDITION: 'fldBEIquy9HDAprY7',
  PHASE: 'flddIfmNdbQ45fVUd',
  REQUIRES_MANAGER_REVIEW: 'fldypvKqW3vyNsrY4',
  INSTRUCTIONS: 'fldsfoFM1RtZyT5wX',
  ARABIC_INSTRUCTIONS: 'fldT16R9UBY0UybHk',
} as const

export const TASKS = {
  TABLE_ID: 'tblOGEvAGcieHMPeX',
  TASK_NAME: 'fld6CUY7CqGjKS4v6',
  STATUS: 'fldZxo3damMz00LZI',
  DEPARTMENT: 'fldtXZWhiFvsQZdvd',
  ASSIGNED_TO: 'fld1vhOD1EY4n5cMb',
  TASK_ORDER: 'flddrIO6W7xqw6h8d',
  PROJECT: 'fldcHdzmQopPk4iEf',
  PROJECT_ITEM: 'fldzE0IPmOCVnKVmC',
  PROJECT_ID: 'fldBRW5E8ufAGPyJS',
  TASK_DOCUMENTS: 'fldWN2jRTtvVk10g7',
  HANDOVER_DOCUMENT: 'fldcLem7Z7fofiDoy',
  FILLERS_MISSING_ITEMS_LIST: 'fldSTM132XO86l19p',
  INSTRUCTIONS: 'fldQUxsUzEi1XQojd',
  ARABIC_INSTRUCTIONS: 'fldHVVySDTIqcJnob',
  MANAGER_REVIEW_STATUS: 'fldii3Ebi2lhAamuq',
  MANAGER_COMMENT: 'fldgHFTWfCZtJ1xOW',
  REQUIRES_MANAGER_REVIEW: 'fldEt5qAV8SiJoLvl',
  REQUIRES_MANAGER_REVIEW_MANUALLY: 'fldWCJd2f532pr2q6',
  POST_VISIT_OUTCOME: 'fld8tGPaBKroWulye',
  TASK_START_DATE: 'fldt8MlMioYdrNxik',
  COMPLETION_DATE: 'fldh1O00T2wn9ZNa7',
  STARTED_AT: 'fldegpR3li3Vmmk65',
  COMPLETED_AT: 'fldYARi0NN35mkTn6',
  ESTIMATED_DURATION: 'fldjXHjHDrSop0CAS',
  TEAM_DAYS_REQUIRED: 'fldYEkTSrzjrv3JfF',
  NO_OF_LABORS_PER_DAY: 'fldjxiY3vT2DwEUGc',
  INSTALLATION_DAYS: 'fldWfY6xisE0uhVHB',
  PLANNED_PROD_START_DATE: 'fldckX33LZhtyyJa6',
  EXPECTED_FAB_END_DATE: 'fldnPsZJ8hJCEx0qM',
  FABRICATION_PATH: 'fldAP4I4vbBGKjhyS',
  POST_CARPENTRY_PATH: 'fldZjKDnrPSJKLv09',
  PRODUCTION_START_PATH: 'fldGcM8dsJGvsWQF5',
  CONCEPT_DESIGN_APPROVAL: 'fldUcR8eVpooRHRWU',
  SAMPLE_APPROVAL: 'fldC6Pl923IfHdrk2',
  QUOTATION_OUTCOME: 'fldhYsEHetrQxTZ8k',
  QC_CHECK_AT_SITE_DONE: 'fldHrNVNe3abI0FBx',
  FILLERS_DONE: 'fldeITdFvnLVegVIy',
  PROJECT_STAGE: 'fldcS4LsNaEbpYEze',
  CLIENT: 'fldyYUTgOc7TNxl14',
  TASK_CREATED: 'fldHsDqsdVz90uAWc',
  TEMPLATE_ORDER: 'fldXxw74bcJFueDDX',
  PRIORITY_FLAG: 'fld5rZ88NiEmAeB4f',
  PROJECT_RECORD_ID: 'fldKSFnS37UeQmzNQ',
  TASK_TEMPLATES_LINK: 'fld5FPm767CTRLC1R',
  CALL_COUNT: 'fldEw1v5H3SyekCoZ',
  PATH_CONDITION: 'fldG5Mvt5DzharM3i',
  SED_NOTE: 'fldu64rcx9vPIZXKD',
  FOLLOW_UP_OUTCOME: 'fldqb9Fun4cWf4RYv',
  TASK_DOC_LINKS: 'fldz8YzTtdsVwiJ3I',
  HANDOVER_DOC_LINKS: 'fldZeGpG5VlY1Oiip',
  FILLERS_DOC_LINKS: 'fldxgHjnRVSlYlHbM',
  LAST_MODIFIED: 'fld8PyDkPBIZ0BNO1',
  SUPERADMIN_NOTE: 'fldjVNPzFB76Ik0fh',
  INSTALLATION_SCHEDULE: 'fld6czB3O8VLmirhY',
} as const

export const PROJECTS = {
  TABLE_ID: 'tblNYJQt2YWSWxzHP',
  PROJECT_NAME: 'fldB2vFh3LHlF30uq',
  PROJECT_ID: 'fldBjQceUJ8bZm4Qc',
  QUOTATION_NUMBER: 'fldRrZXIY4G8B9tkW',
  QUOTATION_REFERENCE: 'fld9kdlnvEExao7wv',
  PROJECT_STAGE: 'fldnINS8WLH5nkNGK',
  CLIENT_NAME: 'fldq8KO7c05etvfo2',
  SALES_OWNER: 'fld2JiufpGFcKCC6U',
  PAYMENT_MODE: 'fldmdHxh00sNkHqsj',
  PROJECT_TOTAL_COST: 'fldGFCLmYsTam1SIJ',
  TOTAL_PAID: 'fld6BdgaLcTcAMIEH',
  REMAINING_BALANCE: 'fldntJTn8N55eazM2',
  PAYMENT_PROGRESS: 'fld4TAQfEBVufRDez',
  LAST_MODIFIED_TASKS: 'fldl1WQ27xdZREjtv',
  APPROVAL_STATUS: 'fldH2FdeW2yZyNHdz',
  TASKS: 'fldCezGrdho4OveCs',
  PROJECT_ITEMS: 'fldYcgC7XmHzZk9A1',
  PAYMENTS: 'fldtHlJddB54ZHeNZ',
  PROJECT_CREATED_AT: 'fldj9TQDO0WZEZBCR',
  MANAGER_NOTES: 'fldr3TvHVibp8QBtg',
  SED_NOTES: 'fldxFwBQKWytFdrBp',
  COMMUN_SEDS: 'fldEs8LgBmhAC4XyQ',
  CLIENT_PHONE: 'flduN1gfUdUaTN3Af',
  CLIENT: 'fldwLVEUsKeVLvXSb',
  ASSIGNED_INSTALLATION_TEAM: 'fldXdHwEqZLdgBgy4',
  INSTALLATION_TEAM_MEMBERS: 'fldi1aJVJ94RBk6lP',
  NICKNAME: 'fldChERvQwVlxO1nR',
  EMIRATE: 'fldIrxYRfumFm6JjU',
  LOCATION: 'fld5iIjUh9z7jaJFW',
  DETAILED_LOCATION: 'fldoRWDUaeNKEtrbi',
  PROJECT_DESCRIPTION: 'fldhpCCy7ZIrh7pax',
  REQUIRED_INTAKE_PATHS: 'fld5jHSFxBU9euELy',
  REQUEST_TYPE:    'fldDlEFv0as7eOxuS',  // single select: Trade | Maintenance | Variance
  PARENT_PROJECT:  'flds3nCf54kT4Ss3s',  // linked record → PROJECTS
  TRADE_REFERENCE: 'fldt1VT7rmjxcbo2q',  // text, e.g. "2341Tr1R3"
  CLIENT_STATUS:   'fldwHeIOIoC4yXoua',  // single select: Broker | End-to-End Client | Designer | Contractor | Developer | Other
} as const

export const PROJECT_ITEMS = {
  TABLE_ID: 'tblWg3ijuhV1JsijY',
  ITEM_NAME: 'fldAl0NLXKd89KHXp',
  ITEM_ID: 'fldb21WK8jBSt8fFq',
  PROJECT: 'fldATmKZ7yOVY2MYZ',
  STATUS: 'fldsgg5maMG5Phhvx',
  ITEM_SEQUENCE: 'fldoMCVk5m2mOmfTb',
  TASKS: 'fldDXnVjg1yq7Ed90',
  SED_OWNER: 'fldrM4XWKMwkWaDgD',
  ITEM_CREATED_AT: 'fldPVnEc8tCvwEZIB',
  ITEM_TYPE: 'fldYEzJXbvQEU9i4Z',
  QUANTITY: 'fldkzvi3cCcKzwjFc',
  QUOTATIONS_LINK: 'fldxjXZbDvK39rqJU',
} as const

export const QUOTATIONS = {
  TABLE_ID:            'tbllITZymuWCZ9tde',
  NAME:                'fldgHsELpxTIo2vnC',
  NOTES:               'fldTAsLNGg6OBSXYw',
  PROJECT:             'fldOQ2Ly0sPsqBcje',
  PROJECT_ITEM:        'fld1PRUM7wpcrJXVS',
  DESCRIPTION:         'fldjyDMxYA33ML3K0',
  QUANTITY:            'fldZj6k5Gc23tpVaI',
  UNIT_PRICE:          'fldz9RIVU1xQZgUwT',
  QUOTATION_STATUS:    'fldJjktB8XgZkoYzr',
  SENT_DATE:           'fldxIMge4UKFxJeHV',
  APPROVED_DATE:       'fldURdaSenYkzkWpn',
  RECORDED_BY:         'fldTGURGzlBpkKS2G',
  // Extended fields
  QUOTE_NUMBER:        'fldUeK2IKnnNsuRs6',
  REVISION:            'fldAWtlLpZyAbuH3n',
  QUOTE_DATE:          'fldq0flcPPVXKykfW',
  CLIENT_NAME:         'fld1rdn0kTrsj3qsf',
  QUOTE_AMOUNT:        'fldxoR8THEDrkb0WM',
  VAT_AMOUNT:          'fld9qVK2XBeR0jekW',
  TOTAL_WITH_VAT:      'fldoXH8Gn6pK4CtN2',
  VARIATION_1:         'fldMU6ccYDJdIRzns',
  VARIATION_2:         'fldY09WeaUDjiRWVy',
  TOTAL_WITH_VARS:     'fldH6ljH74dudgx5M',
  LAST_FOLLOWUP:       'fld6hY1TX4MOE9mTl',
  NEXT_FOLLOWUP:       'fldigTMhuSfIK93ye',
  SALES:               'fldlcf0QiW2hmWB0m',
  Q_STATUS:            'fldCDFXedfarMSj5F',
  LINKED_PROJECT:      'fldXDKJcNU4dbfPjy',
} as const

export const PAYMENTS = {
  TABLE_ID: 'tblTrLUuGRGt5iSwD',
  NAME: 'fldMKBSDwUUYEwzFu',
  NOTES: 'fldUyVVQukyAjcRGX',
  ASSIGNEE: 'fldx9Ex2woF6NnIzp',
  PROJECT: 'fldzczMvwNb1In9qn',
  AMOUNT: 'fldqduawq8VeBZUY0',
  PAYMENT_TYPE: 'fldoOSKdkyP08LB85',
  PAYMENT_STATUS: 'fld2HEapbHyD8VQ8i',
  PAYMENT_METHOD: 'fldn6iPqvugM5ASC0',
  REFERENCE_NO: 'fldIxzp2gn8ZAnfAD',
  RECEIVED_DATE: 'fld3CNFfxgku2uKvr',
  DUE_DATE: 'fldsD73VfEFT4jwVF',
  ACCOUNTANT_APPROVED: 'fldbpfxYepO2cWMCl',
  STAGE_AT_PAYMENT: 'fldWi6SfcwXI1c1Jb',
  PAYER_TYPE: 'fldPYIgJR10wHyRdK',
  PAYER_NAME: 'fld7lK5GIkQibmLwe',
  COMMISSION_AMOUNT: 'fldqLG1zZiGwBu5XQ',
  RECORDED_BY: 'fldP53RxatemRSJ28',
} as const

export const TEAM_MEMBERS = {
  TABLE_ID: 'tbleyX0MkYf1OucMS',
  NAME: 'fldpVNN148goSwWNX',
  SYSTEM_ROLE: 'fldv7Nx8RtYK7IJeq',
  ACTIVE: 'fldtcuYm3JoaSAaRc',
  AIRTABLE_EMAIL: 'fldblbST8aaAd93ZQ',
} as const

export const MAINTENANCE = {
  TABLE_ID: 'tblX5VNBzyFDsuZXD',
  MAINTENANCE_ID: 'fldftAjExMsYzlemR',
  PROJECTS: 'fldQ4TQCNnELwxnPq',
  STATUS: 'fldIWK6um8WZ89Iex',
  START_DATE: 'fld1PsSeVD3a4XXwV',
  END_DATE: 'flduesbwUe6rdBUmV',
  WARRANTY_TYPE: 'fldKz3G4FJA9pxtWK',
} as const

export const ANNOUNCEMENTS = {
  TABLE_ID: 'tbluhehjxkkNcmTMl',
  TITLE: 'fldoL6vSvUjNKQorq',
  MESSAGE: 'fld8nkfkkLi3LEwEo',
  PINNED: 'fldpVhI5NsTQ2tavI',
  VISIBLE_TO: 'fldcOYHIdWkLgo9qk',
  EXPIRES_AT: 'fldSXuvTu3QnJuCEy',
} as const

export const SYSTEM_LOGS = {
  TABLE_ID: 'tblfiHmuJYwiOXRVX',
  EVENT: 'fldQ8tiEOTnknhYPt',
  LEVEL: 'fldfvQUFbTbXPKZzX',
  REQUEST_ID: 'fldn0FfxJy289AhMg',
  USER_ID: 'fldRhs59mgD1jjXeY',
  DURATION_MS: 'fldPBlzfGq5wVRZPn',
  METADATA: 'fldlFHdf8PGgeHLqG',
  TIMESTAMP: 'fld5iJRY4gbiuiez6',
} as const

export const FAILED_REQUESTS = {
  TABLE_ID: 'tblFXMso3NbWMCp29',
  REQUEST_ID: 'fldAmldUiSX295vrW',
  ENDPOINT: 'fldcuuhmJUqRvIVrh',
  METHOD: 'fldZc5KrLBh1187m0',
  EVENT: 'fld31iusnGLuXsSTD',
  ERROR_MESSAGE: 'fldkbUYqSEuY0FlR7',
  STATUS_CODE: 'fldVZVaiMPGIpEEjV',
  INPUT_PAYLOAD: 'fldnUst7Aa9cM49NW',
  REPLAYED: 'fldkVNtk2a9Y2PBDI',
  REPLAY_RESULT: 'fldGxHBVfVCD46HgJ',
  TIMESTAMP: 'fldoLKN6KfeGfbhXN',
} as const


export const PURCHASE_ORDERS = {
  TABLE_ID: 'tblXyum6bJJltk2vE',
  NAME: 'fldULSfblBR9sjGIY',
  PROJECT: 'fldU2ouPvvfzAfiMB',
  SUPPLIER: 'fldCEdbaCZrnMTGCC',
  TOTAL_AMOUNT: 'fldIsLK1Z3a1mcxTB',
  PO_STATUS: 'fldKbowPmATj4SdTl',
  ORDER_DATE: 'fldyMrgYYkcbKmOtt',
  EXPECTED_DELIVERY: 'fldQLOCcLCBJDX2EL',
  ACTUAL_DELIVERY: 'fld9kXKTi8ysfa0Ta',
  MANAGER_APPROVED: 'fld2M9FkIXzuXa8Pa',
  NOTES: 'fldHpUK9omtuhCtIs',
  RECORDED_BY: 'fldcpLfIpEt60iuQg',
} as const

export const INSTALLATION_LOGS = {
  TABLE_ID: 'tbljrel5tmlHMmJxt',
  NAME: 'fldRGWvQykJcVFCbk',
  PROJECT: 'fldrLAT0he9UmGfjQ',
  DATE: 'fldp4EbfOqn6ez6x0',
  INSTALLATION_TEAM: 'fldWMb8bIisxlARm4',
  NUMBER_OF_LABORERS: 'fldqcpTULWzwcGhq9',
  WORK_DESCRIPTION: 'fldfGXe6BFzxg5akb',
  EXPECTED_FINISH_DATE: 'fldlQLfHsSb74wz6g',
  PHOTOS: 'fld7NCGfaED0ICHXw',
  RECORDED_BY: 'fldmND2IVxD2c0eIr',
} as const

export const HANDOVER_SHEETS = {
  TABLE_ID: 'tblm5eS4DqQvxELPw',
  HANDOVER_ID: 'fldCyPnEeeoujVNEF',
  PROJECT: 'fldTaOFi4mH8kz1g1',
  STATUS: 'fldXERlcFEgan6q6x',
  NOTES: 'fld3j6U1nWqK3Cy4A',
  PDF: 'fldKBmNaNpvRcWBmt',
  INSTALLATION_LOGS: 'fldYGozo80I5Wyof0',
  MAINTENANCE: 'fldQRDYG8E2YqWWSu',
  FINAL_INSTALLATION_DATE: 'fld26o3FkYIJrEuqW',
  CUSTOMER_SATISFACTION: 'fldghZv3yUbsAdjDI',
  INSTALLATION_DIFFICULTY: 'fldEmFFjXia931YOe',
  NEWSLETTER_OPT_IN: 'fld38IGwc92IrrYAt',
  RECORDED_BY: 'fldJnCNmhWS3yMsrH',
} as const

export const CALENDAR_EVENTS = {
  TABLE_ID: 'tblnG8M3db73zeiNS',
  TITLE: 'fldp3dfc2382m6c1C',
  DATE: 'fld8saVnwII9nstoP',
  NOTES: 'fldRWcbihUAdmyBIg',
  PROJECT: 'fldvK1majrFSNWVxy',
  CREATED_BY: 'flduWnzsPZeIAmprs',
  CUSTOM_TASK: 'flde3FqwogaB4RDf3',
} as const

export const PRODUCTION_TIMESHEETS = {
  TABLE:               'tblEAgsiTCNCQmTZl',
  ENTRY_LABEL:         'fldvw5Yal2gzlHWeV',
  WORK_DATE:           'fldgYpSXiYQiUdJHR',
  WORKER:              'fldEQa6tiu1vTq9Sb',
  SUPERVISOR:          'fldIz0C1nWJ4nAoxH',
  LOCATION_TYPE:       'flddkAJk2apbR4yml',
  PROJECT:             'fldptqShoVtL3hjbs',
  REGULAR_HOURS:       'fldPEBPtEqibQF9gG',
  OVERTIME_HOURS:      'fldMeKDus6J01rkcA',
  TOTAL_HOURS:         'fldwqP8tDqTXKyF0Q',
  SUBMITTED_BY:        'fldpCClOzeq2Mfiqp',
  NOTES:               'fld7nmDRcOiBt9DCM',
  // Weekly entry fields
  WEEK_STARTING:       'fldJ6wyxEmtWxN7pi',
  SAT_HOURS:           'fldyfggzpBZUSz77u',
  SUN_HOURS:           'fldm9UR2G8vtIR6mn',
  MON_HOURS:           'fldFS2N6as0OTCcMI',
  TUE_HOURS:           'fldur43LdQgj5H8vB',
  WED_HOURS:           'fldfIDMBCNkCGgjfA',
  THU_HOURS:           'fldUX6yXbFhzVUsR6',
  FRI_HOURS:           'fldb7oRgkDuHceTQd',
  TOTAL_REGULAR_HOURS: 'fldKazwmbN5vRfucv',
  TOTAL_HOURS_WEEKLY:  'fldurkfDRjzRysLCX',
  PRODUCTION_NOTES:    'fldAtHxBLem4Pq5sa',
  MANAGER_APPROVED:    'fld7sgT5g03l70en9',
} as const

export const WORKERS = {
  TABLE:        'tblaelluGouAlw7Xo',
  NAME:         'fldpgSQBVcF0nA2Kx',
  FULL_NAME:    'fldykYIjjHcVUU07b',
  NICKNAME:     'fld0C8rZpHkXI01z8',
  ROLE:         'fldfoj2jJ0om9sFrr',
  WORKER_TYPE:  'fldE39xPMrNCWiePS',  // single select: Supervisor | Worker
  ACTIVE:       'fldtVRH12qbl8xFQo',
  HOURLY_RATE:  'fldWdzVfmq7DUM29W',
} as const

export const MATERIALS_NEEDED = {
  TABLE_ID: 'tblDTNeiICTwzdi6N',
  NAME: 'fld90lAndpbxEdRM7',
  PROJECTS: 'fld376EMuWX3MFSNJ',
  PROJECT_RECORD_ID: 'fldNQ9PaOwMUps0qw',
  SUPPLIER: 'fldzXilF4AR3po08n',
  QUANTITY: 'fldPRou9XW1VXpuqC',
  UNIT: 'fldRXpe4lMMAqnGPa',
  UNIT_COST: 'fldrTBQvgsY0srmN0',
  ORDER_STATUS: 'fldV4JDGucrWPvdS0',
  EXPECTED_ARRIVAL_DATE: 'fld939YZMSPblUP1E',
  ACTUAL_ARRIVAL_DATE: 'fldrMTJ0AcUSXrflW',
  PROJECT_ITEMS: 'fld6PhoGUXiwKEoFQ',
  NOTES: 'fldWnu7dJIcKk8GUd',
  PURPOSE: 'fld27k5HcXCdfE39G',
  REQUESTED_BY: 'fld2ghZwrYAe8xk9k',
  REQUEST_DATE: 'fldjzLbseV1m8EDeo',
  // Extended fields added to the table
  MATERIAL_NAME:    'fldylcT4yBX1k7KkP',
  MATERIAL_NAME_AR: 'fldPIx2LnmEpsxjRw',
  TOTAL_AMOUNT:     'fldBbJssbVbCWayIH',
  AMOUNT_PAID:      'fldCj6uEBPkxvVZMV',
  AMOUNT_PAYABLE:   'fld3GKc6X34mcJIzf',
  INVOICE_NUMBER:   'fldpZ3eT0Q24zWNq9',
  MATERIAL_NOTES:   'fldxIa7g7XPqdcIeD',
} as const


export const QUOTATION_LINE_ITEMS = {
  TABLE_ID:       'tblWyMblevTrABWb4',
  NAME:           'fldop7rxu6OvJ5RaK',
  LINE_ITEM_NAME: 'fldtMcBr9T02AqmSE',
  QUOTATION:      'fldx42D9sWwcq6vAi',
  LINE_NO:        'fldLhR2cNTnUW497F',
  DESCRIPTION:    'fld9adfysKCOsS0Y6',
  QTY:            'fldsObkyrScAz6kFt',
  UNIT:           'fldrWXuHQtCu4zdmg',
  RATE:           'fldG3aCKJpeZP7rLP',
  VAT_PERCENT:    'fldGdbMrS9cztrDSU',
  LINE_SUBTOTAL:  'fldG9X510XyneMUUm',
  VAT_AMOUNT:     'fldEPbLJyIjIKcDWu',
  LINE_TOTAL:     'fldV5045Gu12tVJxv',
  PROJECT_ITEM:   'fldBUN8IVwDJ7AWsQ',
} as const

export const FOLLOW_UP_LOG = {
  TABLE:          'tblHzJiOoOTqWPUwq',
  FOLLOW_UP_NAME: 'fldGXvvFmKw0zHAFA',
  QUOTATION:      'fldYqfBIQ6eLx7O4o',
  DATE:           'fldnqDwE5a0nktqO1',
  METHOD:         'fld6s5gxI6qjmHii9',
  OUTCOME:        'fld2ZoOMCvXeQpAml',
  NEXT_DATE:      'fldRtzDcV3MoXPYV0',
  DONE_BY:        'flduFKcUnL4A7pRue',
  NOTES:          'fldRa9L9ZY87JVihm',
} as const

export const PAYABLES = {
  TABLE:          'tblPjIqCwFFVPCsce',
  PAYABLE_NAME:   'fldYI2whSD6OSymOu',
  PAYABLE_TO:     'fldUEj2L2nJvrJfjQ',
  LINKED_PROJECT: 'fldFDS2TD82vuNkEt',
  CATEGORY:       'fldb6NqSyVw7bwmW7',
  INVOICE_NUMBER: 'fldRZ4MGVIYGuo3jk',
  INVOICE_DATE:   'fldM3OC8RQsY5T2PQ',
  DUE_DATE:       'fldGr8HRruHV9kCCp',
  TOTAL_AMOUNT:   'fldzb9ckWSmjUV5H3',
  AMOUNT_PAID:    'fldc4e4tQSYvZPyjy',
  AMOUNT_PAYABLE: 'fldwMf1ZNMbpJG7to',
  PAYMENT_STATUS: 'fld07tFBvdCQtk1FR',
  APPROVED_BY:    'fldguIEJbDG1HkIhc',
  NOTES:          'fldi33hseD4iKvVFX',
} as const

export const RECEIVABLES = {
  TABLE:           'tblpPWR7Xl6Tic8AT',
  CLIENT_COMPANY:  'fldoJv11zMBfp7FZD',
  LINKED_PROJECT:  'fldq3VO9mRIxQIEWf',
  INVOICE_REF:     'fldjbnLZeY7ap0Y9A',
  ORIGINAL_AMOUNT: 'fldKuI0qeUhNOBTXI',
  COLLECTED:       'fldbcZImdyDd150py',
  BALANCE_DUE:     'fldv2CuId6P226OYi',
  INVOICE_DATE:    'flda547dHl6Anp7te',
  LAST_CONTACT:    'fldjAwuCpkznkqdf4',
  AGREED_DATE:     'fldkCH47PwDWWTBBQ',
  DEBT_AGE:        'fldbS9y117PMRS95o',
  DEBT_STATUS:     'fldn8oNtrwRMyAV6i',
  NOTES:           'fldcQS2LXAhho82gF',
} as const
