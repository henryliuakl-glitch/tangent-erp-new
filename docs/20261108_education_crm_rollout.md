# Tangent ERP — Education CRM (Phase 1 + Phase 2)

**Scope:** CuS Academy and Astra Education share the same implementation; the Sine driving business and Tangent consolidated reporting are unchanged.

## Database deployment (manual, mandatory)

1. Back up the **Tangent ERP production Supabase**, not the separate CuS question bank.
2. Confirm that \`supabase/migrations/20261108_astra_independent_entity_v2.sql\` has already run successfully. Its business-unit separation and RLS are prerequisites. Do not repeat old v1 migration.
3. Run \`supabase/migrations/20261108_education_crm_phase1_phase2.sql\` in **one transaction** in the ERP SQL Editor. The Next.js deployment does not execute migrations automatically.
4. Refresh the app after database propagation. If /crm shows "招生 CRM 尚未就绪", verify migration and role membership rather than assuming empty data.
5. Exercise the RLS tests below before entering sensitive children/family information.

## Features delivered

- **Recruitment funnel**: new enquiry, contacts, source, school/year/subject, status, due follow-up dates, editable profiles.
- **Lead communications**: time-stamped WeChat/call/message/meeting summaries.
- **Trial appointments**: teacher, subject, NZ date/time, duration, fee expectation, outcome and learning assessment. Pre-enrolment trials are **appointments**, not completed lessons or cash receipts; they do not alter existing lesson balances or finance.
- **Student conversion**: link an existing student or create a zero-balance student in the original \`students\` table via an atomic Postgres function. No duplicate ERP student ledger; no fabricated receipt. The converted student then uses the existing booking/tuition/teaching workflows.
- **Existing student parent service**: communications recorded against existing ERP student IDs, plus historical lead interactions for linked students.
- **Follow-up/retention**: per-lead and per-student tasks with due dates and completion, auto-derived renewal suggestions using existing balances and recent bookings.
- **Pricing compatibility**: prepaid (\`monthly\`) warns at <=2h; \`postpaid\` warns when balance is negative; \`single\` is never judged by zero balance, but may be flagged after 21 days since last completed lesson with no next confirmed booking.
- **Navigation**: Admissions available for CuS and Astra only on desktop/mobile; Astra appears last in the entity switcher. Tangent aggregate does not include Astra.

## Access boundaries

- CuS CRM: CuS owner.
- Astra CRM: Astra owner/admin, plus the existing CuS owner who oversees the ERP.
- Astra teacher/viewer: **no CRM permission**, even by direct API. Teaching and care permissions are unchanged.
- New tables use database RLS, explicit tenant IDs and foreign-key/trigger checks. No service-role access from browser or CRM actions.
- No DELETE actions for leads, activity histories, trials or follow-up logs.

## Acceptance tests

- Login as CuS owner, switch to CuS; create a lead, record one WeChat note, schedule a trial, mark it complete, attach an existing student, verify the student ID and balance/transactions are unchanged.
- In CuS, create another lead, convert it to a **new** student with zero hours, confirm only one student row is created; select its existing profile and book a lesson using the old ERP.
- In Astra, repeat lead -> trial -> conversion; verify its student appears only under Astra and is **not** included in Tangent/Family totals.
- Login as Astra admin, check that CuS leads and student communications are not visible through server pages **or direct PostgREST reads and updates**; Astra teacher must also be denied the CRM.
- Intentionally submit cross-tenant lead/student IDs to conversion, follow-up and trial actions: all must fail without modifying any data.
- With a prepaid balance <=2 hours, confirm renewal suggestion; with \`single\` and zero hours but a future booking, confirm **no** low-balance renewal alert.
- Create a student parent communication note, refresh, and confirm it appears in the timeline. Confirm a follow-up task can be completed/reopened.
- Check narrow/mobile layout, search/filter/scroll, Astra last in the switcher.
- Confirm existing /students, /bookings, /finance, /teaching and /afterschool flows remain intact.

## Non-goals / later improvements

- No automatic SMS/WeChat or parent-facing portal.
- Trial fee is a quote/expectation, **not** an invoice, receipt or cash transaction. If actually paid, record through existing Finance.
- Pre-enrolment trial appointments are stored in \`edu_trials\` and do not appear in \`bookings\` calendar (which requires an existing student). Integrating them as a secondary calendar layer can be addressed later without producing ghost students.
- This implementation uses the existing teaching/classroom modules; it does not recreate teachers, class enrolments or billing.
- Renewal suggestions are advisory, based on a bounded recent booking window; they are not an accounts receivable ledger.
