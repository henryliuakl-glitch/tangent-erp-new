# CuS Teaching Management (2026-11-06)

The /teaching route adds a native CuS operational module to Tangent ERP.
It includes programmes, classes, student enrolments, class sessions and attendance.
Existing /students, /bookings and /finance remain intact; class-session attendance
does **not** automatically deduct prepaid tutoring hours or create transactions.

## Deploy prerequisites

**This repository cannot identify the production ERP Supabase project from
its public source.** The connected Supabase project named CUSACADEMY contains
the question-bank schema, not Tangent ERP's students/bookings/transactions schema.
DO NOT run these SQL migrations against the question-bank project.

1. Back up the **ERP** Supabase database and verify that public.students.id is uuid.
2. Execute `supabase/migrations/20261106_cus_teaching_management.sql` on the ERP DB.
3. In that project's SQL editor, look up an existing ERP operator's user ID in
   Authentication > Users and grant access explicitly:
   ```sql
   insert into public.erp_memberships(user_id,business_unit_id,role)
   values ('EXISTING_AUTH_USER_UUID','cus','owner')
   on conflict (user_id,business_unit_id) do update set role=excluded.role;
   ```
4. Log in with that account, switch to CuS, and open /teaching. Create a
   programme, class, session, enrol an existing CuS student and mark attendance.
5. **Do not** execute the second migration until every existing ERP staff member
   has the correct `cus` and/or `sine` membership. It replaces the old
   permissive policies on students/bookings/transactions and intentionally
   fails if no CuS and Sine owners have been provisioned.
6. Run a read/write test with a CuS-only user, a Sine-only user and an unauthorised
   account to verify separation. Review existing definer RPCs and ICS service-role
   endpoints separately before providing partner access.

## Data model

- `cus_programmes` → `cus_classes` → `cus_class_sessions`
- `cus_classes` → `cus_enrolments` → pre-existing `students`
- `cus_class_sessions` × `students` → `cus_attendance`
- `erp_memberships`: explicit CuS read/write access.

The teaching module uses the existing Pacific/Auckland to UTC conversion helper
for session creation. It does not duplicate bookings for every class member.

## Current limitations / next release

- Teacher is text rather than an authenticated staff assignment.
- Single-session creation only; recurring series and room conflict prevention
  need additional UI/database controls.
- Capacity is validated by application code, but not yet enforced via database
  locking under concurrent registrations.
- Separate guardian/pickup authorization, childcare attendance check-in/out,
  invoicing and parent portal are not included yet.
- Existing Family/vehicle tables, legacy RPCs and service-role calendar feeds are
  **not** covered by the stage-2 scope migration.
- No production database migration or end-to-end test has been run by this change.
