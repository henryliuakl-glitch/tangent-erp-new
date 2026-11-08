# Tangent ERP — Education CRM Phase 3–5

CuS and Astra share the existing ERP code and keep **independent entity data**. The driving school, existing students, bookings, finance, and care systems are unchanged.

## SQL deployment order (manual and required)

Run this ONLY on the Tangent ERP Supabase project, not the CuS question-bank database.

1. Back up the ERP database.
2. Confirm migration 20261108_astra_independent_entity_v2.sql has already run.
3. Confirm the **latest corrected** 20261108_education_crm_phase1_phase2.sql has successfully run (not the older SQL still saved in the SQL Editor).
4. Run the new 20261108_education_crm_phases3_4_5.sql as one complete transaction.
5. Test with real CuS owner and Astra admin accounts. Vercel build success does not test database migrations or RLS.

New tables: edu_staff_credentials, edu_staff_training, edu_campaigns, edu_campaign_registrations. Each has entity-level RLS and cross-tenant constraints.

## Phase 3 — education business analytics

Page: /crm/analytics (from 招生 CRM → 经营分析). Date windows: past 30/90/180 days.

- Leads created, their current linked-student conversion, completed trials, students with completed bookings, and completed teaching hours.
- Teacher and subject **1:1 lesson hours**, lead sources and attended events.
- Completed renewal follow-up tasks are NOT completed paid renewals.
- Cash receipts from existing transactions, separately from completed-lesson value from existing bookings; NZD and RMB separately without exchange-rate conversion.
- No invented retention rate, teacher utilization, class profit or course revenue when underlying data is insufficient.
- Warn about query caps rather than silently showing inaccurate figures.

## Phase 4 — teacher qualifications and training

Page: 教务 → 资质与培训. Original cus_staff is reused (CuS general, Astra astra/care).

- First Aid, Police Vetting, P Endorsement, teacher registration, other credentials.
- Review due-date alerts, verified/pending/review-needed statuses.
- Onboarding, training, demo lessons, observation, teaching quality reviews.
- **Only administrators may access compliance data.** Never store raw police reports, criminal history, personal identity scans or medical records.

## Phase 5 — campaigns / events

Page: /crm/events (from 招生 CRM → 活动招生).

- Event name, type, venue, capacity, time, advertised fee, lifecycle.
- Atomic register: create a new CRM lead or link an existing lead; no ghost student records.
- Database-enforced capacity, event attendance, cancelled/no-show statuses.
- Follow linked lead through regular Phase 2 student conversion; count attributable formal students.
- Event fee is an advertised price, NOT money received. Record actual payments through original Finance.

## Acceptance checklist

- CuS owner sees CuS; Astra admin sees Astra only, including direct API/RLS.
- A teacher from Astra cannot be assigned to a CuS compliance record.
- Add a credential with review date; add a training / demo evaluation.
- Create event with one seat; register once; second active signup must fail.
- Mark attended, follow lead, convert to real student in original students table.
- Verify no spurious bookings, receipts, balances or tuition hours from event attendance.
- Compare cash receipts and completed-lesson value with existing Finance, noting that analytics only values 1:1 Bookings.
- Verify the driving school is unaffected and both mobile and desktop navigation work.

## Explicit scope limitations

- Activity signup is an internal staff workflow, not a public web registration page.
- Historical conversion rates are current cohort status snapshots, not conversion-at-date.
- Formal student churn and paid renewal rate need new reliable sources before publication.
