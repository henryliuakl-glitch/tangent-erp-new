# CuS Teaching / Care — 2026-11-07

## Module boundaries

- Dashboard: existing global tasks, schedule, finance summaries; unchanged.
- Students: existing student identity, tuition, prepaid hours and payments; unchanged.
- Bookings: existing 1:1 bookings and edits; a read-only strip now shows class sessions in the same date range.
- Finance: existing ledger and hour settlement; unchanged.
- Teaching: `/teaching` defaults to teaching records, with `?view=classes` for programme/class/enrolment/session/attendance management.
- After-school care: `/afterschool` continues to own guardian registration, fixed weekdays, signed custody transitions, emergency contacts and late pick-up.

The new teaching record links to **either** an existing CuS booking (1:1) or an existing CuS class session (group lesson); it never creates duplicate bookings or financial transactions.

## One additional ERP database migration

After the previously applied 2026-11-06 teaching and care migrations, run:
`supabase/migrations/20261107_cus_teaching_records.sql`

Only on the **Tangent ERP Supabase**, not the separate CuS question-bank Supabase.

This creates a single `cus_teaching_records` table, links it to booked lessons, protects rows with CuS-only RLS and keeps record origin immutable. No prior student, booking, attendance, custody or ledger data is modified.

Until this SQL runs, the Teaching > Records view shows an unavailable notice; Classes and all four existing ERP modules continue to work.

## Performance

- Teaching records: most recent 100 CuS bookings, 80 class sessions and 50 saved records; matching student/class names loaded only for visible IDs.
- Class management: scoped recent sessions and attendance rather than fetching all historic attendance.
- After-school: today's custody approvals and only parents/contacts associated with existing care profiles or today's visits, no signature blobs loaded.
- Bookings: three-month default window rather than seven months, custom date range still available; invalid date regex corrected.
- Class bookings are displayed on the Booking screen asynchronously, without duplicating the existing booking ledger.

## Verification

`npm run build` should pass in GitHub Actions before merging to main. After installing the SQL, test with synthetic bookings and class sessions:
- save and update a 1:1 record, confirm the original Booking and balance do not change;
- save and update a class record, confirm no extra bookings or finance transactions;
- open both Teaching views, Care and Booking on desktop/mobile;
- verify unauthorized/Sine-only users cannot see the new teaching table.

No custody rules, fees, SMS configurations or original financial calculations are changed by this refinement.
