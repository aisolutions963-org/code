# WoodWings — User Guide (by Role)

What each role sees and does, following a project from first call to warranty end. System internals live in **ARCHITECTURE.md**; this file is the user-facing view.

**Project identifier everywhere:** once a project has a quotation, it is identified as `{quotationNumber}{quotationReference}` (e.g. `3212r3`). Before that, the fallback `WW-xx-xxx` number shows.

---

## The lifecycle at a glance

```
Preparing ──► Open ──► Production ──► Closing ──► Closed ──► Active Warranty ──► Warranty expired
 (SED actions   (F4 advance,  (materials, fab,   (handover,     (delivered,     (1-year clock)
  + 3 gates +    F5 items,     installation       final payment)  admin pending)
  client call)   per-item      per item)
                 approvals)
```

Tasks drive everything: each stage generates tasks from templates; completing a task unlocks the next one in order. Items advance independently through Production. A green glow on a card means "this needs *you* now"; an amber **"Waiting on {team}"** strip means the current step belongs to another department.

---

## Superadmin

**Dashboard:** `Overview` KPIs (incl. Closing count), My Tasks / View-all, All Projects, Activity, Payments, Warranty, Payables & Receivables, Users/Workers/Timesheets, Announcements, Materials, Deliveries, Calendar.

- **My Tasks** shows your own actionable items individually: pending approvals, "Call the Client" decisions, inactivity Follow-Up decisions, and payment tasks (e.g. the per-item **Payment** step).
- **Call the Client** — after the SED clears the three approval gates (Design / Sample / Quotation), you call the client and record the outcome: approved (project opens), needs review, or refused.
- **Inactivity alerts** — if a project in any active stage has no task activity for 3 days, you get a daily notification naming the project *and the last task it stalled on*, and a Follow-Up decision task unlocks: send back to SED, to Manager, or reject the project.
- **Stage control** — advance a stage manually, reopen a Not-Approved project (its tasks regenerate from Preparing), soft-delete projects (Trash auto-purges after 30 days).
- **Finance** — Payments view (record/void, edit), Payables & Receivables (manual ledgers via "+ Add"), fiscal-year reports and Excel downloads.
- **Users** — create/sync logins, roles, and Airtable team links.

## Manager

**Dashboard:** My Tasks, All Projects, Payments + Pay Calendar, Payables/Receivables, Materials, Deliveries, Install Teams, Timesheets, Follow-Ups, Client Requests.

- **Payments** — record every payment type (Advance, Delivery, Material, Final, Progressive, Trade/Variance/Maintenance). The F4 forms auto-fill the project's quotation number + reference (editable only when not yet set). A Final payment closes the project into Active Warranty; a second Final is blocked.
- **Production chain** — your steps include *Choose Installation Team* (per item, right after the SED's Attach-7), *All Material Estimation Price*, *Submit Final Material List*, *Order Material*, *Schedule the Delivery Date*, *Get installation ready*, and the Delivery/Final F4 forms.
- **Assign installation teams** from the Install Teams view (unassigned projects are flagged on your action center).
- **Review** — approve/reject tasks that require manager review; notes flow back to the submitter.

## SED (Sales / Design)

**Dashboard:** My Tasks, Projects, Site Visits, Approvals, Follow-Ups, Materials, Deliveries, Client Requests; + New Project button and commission card.

- **Preparing** — create the project, then work the **Choose Actions** gateway: Site Visit, Order Sample, Proposal/Design Idea, Make Quotation (sets quotation number + reference), *Ask installation team to Take Measurement* (pick date + member — the measurement task goes to the installation team; it never appears in your actions), Need More Details. Clear the three approval gates; the superadmin then calls the client.
- **Open** — after the Manager records the F4 advance: submit **F5** (quotation line items — creates the project items), then per item run the item gateway (Design / Site Visit / Sample / Measurement), get both per-item gates approved, *Take Approval From Client to Start Fabrication*, and finish with **Click Done: Attach 7 documents**.
- **Production** — your steps: **F3 material order** (Order Directly, or Big Order → fabrication store check first), *Inform Client of Estimated Date of Supply*, site/QC checks, delivery-payment nudges. Between your steps the item shows "Waiting on {Manager/Fabrication}" — that's normal.
- **Client Requests** — raise Trade (`2341Tr1R354327`-style ref), Variance (`2341VR1R3`, full project workflow), or Maintenance (`2341M1R3`, requires the `Mx` reference; parent must be under warranty).
- You see only your own projects (owner or communal SED).

## Fabrication (Arabic UI)

- Notifications and task names/instructions arrive in Arabic.
- **Store check (Big Orders)** — the *Store Revised Material List* task shows the SED's submitted material list read-only; check the store and submit your review notes.
- **F2 Production List** — set the fabrication timeline (start/end); it feeds the calendar.
- **Fabrication Done** per item is your real gate; Carpentry/Paint are optional parallel branches that never block the chain. Completing fabrication signals SED + installation ("2 days to check items & tools").
- Sample requests from Preparing ("Send to Fabrication") also land here.

## Installation / Fixing team (Arabic UI)

- **Measurements** — when a SED assigns you a measurement, you get an Arabic notification and a calendar event titled `Take Measurements — {ref} · {project} › {item}`.
- **Installation days** — log each day (date, workers, notes) on the *Installation Day* task; the fixing-team note records days/labor planning for handover.
- **Handover** — submit the Handing Over Form; QC/site photo tasks close out the item.
- **Gate passes** — printable via the gate pass form.
- Your calendar ("mine" view) shows only events you're assigned to.

---

## Shared surfaces

- **Home** — announcements, live clock, the **Pipeline** (projects by real stage), and the unified calendar (Installation & Delivery / Activity tabs; managers can add factory events with team assignment and conflict warnings).
- **Project page** — item board with per-item task groups, "Next up"/"Waiting on" hints, forms section, payments (manager/superadmin), report tab, linked client requests.
- **Notifications** (bell) — in-app, per role or per user; Arabic for fabrication/installation. Clear-all supported.
- **Search** — project lists match name, client, phone, quotation number/reference, and the WW fallback id.
