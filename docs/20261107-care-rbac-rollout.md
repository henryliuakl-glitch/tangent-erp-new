# Tangent ERP · Care and staff rollout (2026-11-07)

## What changed

- Owner accounts keep all existing ERP modules. Care-only accounts see **Teaching (care logs only)** and **After-school**, with no business switcher or links to private Students, Bookings, Finance or Family.
- Care children have a standalone `cus_care_children` identity. The care signup no longer creates or selects a CuS student.
- Create the guardian-signed care profile first; dates and days purchased can be added later.
- Class scheduling is **by exact date** with a from/to range and Sun–Sat selection. The recorded visit date is always YYYY-MM-DD.
- Staff and parent/collector each physically sign check-in AND check-out. An authorised staff user must be logged in, and a database trigger rejects incomplete handovers.
- Care teaching logs record what the teacher did and what each child did. The staff directory distinguishes general teaching from care staff. Day credits and days used are kept as separate operational balances (not cash ledger entries).
- Care reminders now send only against explicitly scheduled dated visits; weekends supported. Reminder service remains opt-in and inactive until configured.
- Calendar ICS exports now require an authenticated global Owner session or an independent calendar-feed secret.

## Database — **REQUIRED before testing the new pages**

Back up the **Tangent ERP Supabase** database. This is NOT the CuS public question bank project.

Prerequisites: all four `20261106_cus_care_*.sql` files, `20261106_cus_teaching_management.sql`, and (for owners to use the main Teaching Records tab) `20261107_cus_teaching_records.sql`.

In this order run the three NEW migrations from this branch/main:

1. `supabase/migrations/20261107_care_access_and_daily_roster.sql`
2. `supabase/migrations/20261107_care_atomic_registration.sql`
3. `supabase/migrations/20261107_care_balance_summary.sql`

The first migration changes the RLS model so **only accounts with `erp_memberships` ('cus','owner') may access private non-care ERP tables**. All existing care records are migrated by creating independent child IDs with the same UUID. Existing private student rows are left untouched and unlinked to care profiles. Non-owner legacy ERP accounts will lose private access. Perform this migration with an outage window and test both owners after applying.

**Partner accounts must be given only `care` membership**, not `cus`, `sine` or `family`. Create the partner account in Authentication > Users first; do not create a new Owner merely for a partner.

```sql
-- Replace with the actual email of the existing partner user.
insert into public.erp_memberships(user_id,business_unit_id,role)
select id,'care','admin' from auth.users where email='REPLACE_WITH_PARTNER_EMAIL'
on conflict(user_id,business_unit_id) do update set role='admin';

-- Remove the partner's former core memberships.
delete from public.erp_memberships
where user_id=(select id from auth.users where email='REPLACE_WITH_PARTNER_EMAIL')
  and business_unit_id <> 'care';

-- Confirm the role assignment. Never guess email/UUID.
select u.email,m.business_unit_id,m.role
from public.erp_memberships m join auth.users u on u.id=m.user_id
where u.email='REPLACE_WITH_PARTNER_EMAIL';
```

Care roles: `admin` can register guardians, schedule days, record day credits, approve pickups and register care staff; `teacher` may write classroom logs and participate in signed handovers; `viewer` is read-only. Both existing `cus/owner` accounts have all modules and care authority.

## Operational tests (test profiles only)

1. Sign in with each Owner. Check every ERP business still works.
2. Create a **new care child** with parent signatures and a plausible phone (NZ 021…, +64…, +86… are accepted if they contain 6–16 digits). Do not select an existing CuS student.
3. Leave the care date unassigned. Confirm profile exists and its day balance is zero.
4. Assign exact dates, including Saturday/Sunday, and add day credits. View one selected date and verify the scheduled roster.
5. Use two different signature canvases for parent and onsite staff at Clock In / Out; verify incomplete signature is rejected.
6. Register a care teacher, add a lesson record with teacher work and child work.
7. Sign in using a synthetic Care-only account. Verify that only Care and care-related Teaching appear; try directly browsing `/students`, `/finance`, `/bookings`, `/family`; check that the URLs redirect. Confirm that direct Supabase Data API queries against students/bookings/transactions return no rows.
8. Try a restricted account against `/api/dashboard`, and the old ICS feed URL. Verify access is denied.

## Calendar feed update

If existing calendar subscriptions rely on public unauthenticated ICS URLs, they will stop until a dedicated secret is added to the ERP Vercel environment:

- `CALENDAR_FEED_SECRET`: a randomly generated secret of at least 24 characters.
- Update the calendar URL to `/api/calendar/cus?token=<secret>` or `/api/calendar/sine?token=<secret>`; treat this URL as sensitive.
- An Owner in a browser session may still open the feed without the token.

Do **not** publish the token, attach it to social posts, or put it in source control.

## Important limitations

- This commit includes source + SQL migrations, **not a change to the live production ERP database**. Execute the new migrations before opening Care.
- No actual child/guardian signature identity service or legal-compliance certification is provided. Staff must still check physical identity and relevant custody restrictions.
- No automatic SMS has been activated; the provider account and schedule must be configured separately.
- Existing historical care visits remain linked to the copied standalone child record, but historic ordinary CuS students are not deleted.
- Day credits measure purchased/adjusted days independently of cash payments. Integration with Finance is not yet implemented.
- Actual production read/write, RLS role simulation, and pickup workflow must be tested in the real ERP database before enrolling children.
