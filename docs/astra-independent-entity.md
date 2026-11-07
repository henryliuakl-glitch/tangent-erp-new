# Astra as an independent ERP entity (2026-11-08)

## Rollout order — important
1. Export a backup of the **Tangent ERP production Supabase project**. Do not execute on the separate CuS question-bank project.
2. Read `supabase/migrations/20261108_astra_independent_entity.sql`. Confirm that all previously classified Astra students in the CuS ledger have a **nonblank student code not beginning with 1**. This is the exact earlier teaching-record convention.
3. Run that SQL file once as a single transaction in the ERP Supabase SQL Editor. The migration is designed to be repeatable and moves only identified student-linked records.
4. Verify counts below and test with one Astra member (not Henry/Yutong) before accepting real payments, students or custody signatures.
5. Refresh/re-login to make the entity cookie and role changes take effect.

## Expected company boundaries
- **CuS**: students, bookings and transactions with `business_unit_id='cus'`; CuS programme/teacher records.
- **Sine**: unchanged driving-school business.
- **Tangent**: unchanged CuS + Sine consolidated view; **excludes Astra**.
- **Astra**: its own students, bookings, transactions, academic/teacher records and classes (`business_unit_id='astra'` where present). **Late care** uses previously separate `cus_care_*` tables, now authorized via Astra memberships.
- **Henry and Yutong**: CuS owner role still grants full owner-wide access and allows switching entities. Astra staff roles can only query Astra core rows and Astra care content via database RLS.

## Query after running SQL
```sql
select business_unit_id,count(*) from public.students group by 1 order by 1;
select business_unit_id,count(*) from public.bookings group by 1 order by 1;
select business_unit_id,count(*) from public.transactions group by 1 order by 1;
select u.email,m.business_unit_id,m.role from public.erp_memberships m
join auth.users u on u.id=m.user_id order by u.email,m.business_unit_id;
select count(*) as astra_students from public.students where business_unit_id='astra';
select count(*) as astra_bookings from public.bookings where business_unit_id='astra';
select count(*) as astra_payments from public.transactions where business_unit_id='astra';
```
For an Astra teacher, verify **CuS/Sine/Family data is inaccessible even via direct Supabase API calls**, not just hidden in menus.

## Existing records and caveats
- Student codes starting with `1` stay in CuS. **Blank-code** students stay in CuS for manual review.
- Only transactions with a student ID matching a migrated Astra student move automatically. Unlinked company expenses/deposits remain unchanged, to avoid guessing their legal owner. **Manually classify old unmatched Astra entries** later.
- Legacy `cus_care_*` table names are retained for audit/foreign-key continuity. They are Astra-only in business terms.
- Existing `cus_teaching_records` rows remain connected to their original booking UUIDs and become visible under the new tenant scope.
- Existing class programmes are not automatically assigned to Astra because their legal owner is ambiguous. Reclassify selected programmes separately if needed.
- Astra payments use Astra-specific account labels and **do not synchronize to Tangent's Family treasury**.
- Astra's cash flow is not added to Tangent's consolidated CuS+Sine accounts.
- If the ERP SQL is not run, the new Astra app is intentionally **not fully operational**: old RLS remains owner-only and company students will not have moved.
- Keep a read-only audit/back-up snapshot before any record reclassification.
## Adding new Astra teacher
Create the Supabase Auth account first (do not create accounts by inserting into auth tables manually). Then, in the ERP SQL editor with its UUID:
```sql
insert into public.erp_memberships(user_id,business_unit_id,role)
values ('ACTUAL_AUTH_USER_UUID','astra','teacher')
on conflict(user_id,business_unit_id) do update set role=excluded.role;
```
Use `admin` for safeguarding/enrolment administration, `teacher` for lesson, bookings, finance and class records; `viewer` only for read-only access.

## Test plan
- Log in as Astra teacher: sidebar contains **工作台 / 学员 / 排课 / 财务 / 教务 / 晚托**. No CuS/Sine/Tangent/Family switcher.
- New Astra student → add lesson → mark complete → verify balance and tuition without touching CuS.
- Astra cash receipt → compare finance cash KPI to Astra workbench. Confirm Family ledger unchanged.
- Astra teacher: add a class, schedule a dated class session, save attendance and teacher notes; CuS content must be invisible.
- Astra late-care registration and both-signature clock-in/out, followed by emergency pickup approval workflow.
- Owners: switch CuS ↔ Astra; consolidated Tangent reports should not include Astra.
