
-- CuS after-school care: student-linked profiles, guardians and audited handovers.
-- Requires 20261106_cus_teaching_management.sql and explicit CuS memberships.
-- Does not modify existing booking and tutoring history.
CREATE TABLE IF NOT EXISTS public.cus_care_profiles (
  student_id uuid PRIMARY KEY REFERENCES public.students(id) ON DELETE RESTRICT,
  school text,
  year_level text,
  date_of_birth date,
  allergies text,
  medical_notes text,
  parental_arrangement_notes text,
  missing_guardian_reason text,
  image_consent boolean NOT NULL DEFAULT false,
  terms_acknowledged_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','paused')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.cus_care_guardians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.cus_care_profiles(student_id) ON DELETE CASCADE,
  full_name text NOT NULL,
  relationship text NOT NULL CHECK (relationship IN ('mother','father','guardian','other')),
  phone text NOT NULL,
  email text,
  primary_contact boolean NOT NULL DEFAULT false,
  pickup_authorized boolean NOT NULL DEFAULT true,
  signature_data text, -- PNG data URI captured from an actual signature canvas
  signature_signed_at timestamptz,
  signature_name text,
  signature_recorded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS cus_care_one_primary_guardian
  ON public.cus_care_guardians(student_id) WHERE primary_contact=true;
CREATE INDEX IF NOT EXISTS cus_care_guardians_student ON public.cus_care_guardians(student_id);

CREATE TABLE IF NOT EXISTS public.cus_care_emergency_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.cus_care_profiles(student_id) ON DELETE CASCADE,
  full_name text NOT NULL,
  relationship text,
  phone text NOT NULL,
  pickup_authorized boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cus_care_emergency_student ON public.cus_care_emergency_contacts(student_id);

CREATE TABLE IF NOT EXISTS public.cus_care_weekdays (
  student_id uuid NOT NULL REFERENCES public.cus_care_profiles(student_id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK(weekday BETWEEN 1 AND 5),
  starts_at time NOT NULL DEFAULT time '15:30',
  ends_at time NOT NULL DEFAULT time '17:30',
  class_id uuid REFERENCES public.cus_classes(id) ON DELETE SET NULL,
  PRIMARY KEY(student_id,weekday),
  CHECK(ends_at>starts_at)
);
CREATE TABLE IF NOT EXISTS public.cus_care_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.cus_care_profiles(student_id) ON DELETE RESTRICT,
  care_date date NOT NULL,
  scheduled_start timestamptz NOT NULL,
  scheduled_end timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled'
    CHECK(status IN ('scheduled','in_care','released','cancelled')),
  check_in_at timestamptz,
  check_in_guardian_id uuid REFERENCES public.cus_care_guardians(id),
  check_in_name text,
  check_in_signature text,
  check_in_recorded_by uuid REFERENCES auth.users(id),
  check_out_at timestamptz,
  check_out_guardian_id uuid REFERENCES public.cus_care_guardians(id),
  check_out_contact_id uuid REFERENCES public.cus_care_emergency_contacts(id),
  check_out_name text,
  check_out_signature text,
  check_out_recorded_by uuid REFERENCES auth.users(id),
  staff_verified_identity boolean NOT NULL DEFAULT false,
  late_fee_nzd numeric(10,2) NOT NULL DEFAULT 0,
  late_fee_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(student_id,care_date),
  CHECK (scheduled_end>scheduled_start)
);
CREATE INDEX IF NOT EXISTS cus_care_visits_day ON public.cus_care_visits(care_date,status);
CREATE TABLE IF NOT EXISTS public.cus_care_pickup_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id uuid NOT NULL REFERENCES public.cus_care_visits(id) ON DELETE RESTRICT,
  contact_id uuid NOT NULL REFERENCES public.cus_care_emergency_contacts(id),
  parent_guardian_id uuid NOT NULL REFERENCES public.cus_care_guardians(id),
  approval_channel text NOT NULL CHECK(approval_channel IN ('verified_call','verified_message','in_person')),
  approved_by uuid NOT NULL REFERENCES auth.users(id),
  approved_at timestamptz NOT NULL DEFAULT now(),
  notes text NOT NULL,
  child_response_checked boolean NOT NULL DEFAULT false,
  video_path text,
  parent_notified_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS cus_care_pickup_approvals_visit ON public.cus_care_pickup_approvals(visit_id);

CREATE TABLE IF NOT EXISTS public.cus_care_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  visit_id uuid NOT NULL REFERENCES public.cus_care_visits(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES public.cus_care_profiles(student_id),
  event_type text NOT NULL,
  actor_id uuid REFERENCES auth.users(id),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS cus_care_events_visit ON public.cus_care_events(visit_id,occurred_at);
CREATE TABLE IF NOT EXISTS public.cus_care_sms_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id uuid NOT NULL REFERENCES public.cus_care_visits(id) ON DELETE CASCADE,
  reminder_type text NOT NULL CHECK(reminder_type IN ('before_start','after_start','before_end','late')),
  recipient_phone text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','failed')),
  provider_message_id text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  UNIQUE(visit_id,reminder_type)
);
-- Private videos only. Never create public URLs for child videos.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('cus-care-evidence','cus-care-evidence',false,52428800,ARRAY['video/mp4','video/quicktime','video/webm'])
ON CONFLICT (id) DO NOTHING;
-- RLS for the new tables, using existing CuS membership checks.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'cus_care_profiles','cus_care_guardians','cus_care_emergency_contacts',
    'cus_care_weekdays','cus_care_visits','cus_care_pickup_approvals',
    'cus_care_events','cus_care_sms_log'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon',t);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
    EXECUTE format('DROP POLICY IF EXISTS cus_care_read ON public.%I',t);
    EXECUTE format('DROP POLICY IF EXISTS cus_care_insert ON public.%I',t);
    EXECUTE format('DROP POLICY IF EXISTS cus_care_update ON public.%I',t);
    EXECUTE format('DROP POLICY IF EXISTS cus_care_delete ON public.%I',t);
    EXECUTE format('CREATE POLICY cus_care_read ON public.%I FOR SELECT TO authenticated USING ((SELECT public.cus_can_read()))',t);
    -- Events and SMS logs must not be rewritten from clients; SMS endpoint uses a trusted server key.
    IF t NOT IN ('cus_care_events','cus_care_sms_log') THEN
      EXECUTE format('CREATE POLICY cus_care_insert ON public.%I FOR INSERT TO authenticated WITH CHECK ((SELECT public.cus_can_write()))',t);
      EXECUTE format('CREATE POLICY cus_care_update ON public.%I FOR UPDATE TO authenticated USING ((SELECT public.cus_can_write())) WITH CHECK ((SELECT public.cus_can_write()))',t);
    END IF;
  END LOOP;
END $$;
REVOKE INSERT,UPDATE,DELETE ON public.cus_care_events,public.cus_care_sms_log FROM authenticated;
-- Enforce append-only audit record: neither application users nor normal migrations should delete.
CREATE OR REPLACE FUNCTION public.cus_care_no_audit_changes()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Care audit events are immutable'; END $$;
DROP TRIGGER IF EXISTS cus_care_events_immutable ON public.cus_care_events;
CREATE TRIGGER cus_care_events_immutable BEFORE UPDATE OR DELETE ON public.cus_care_events
FOR EACH ROW EXECUTE FUNCTION public.cus_care_no_audit_changes();
-- Existing role-authenticated operators may read private bucket evidence;
-- only explicit CuS staff with write access may upload, no client delete.
CREATE POLICY "cus_care_evidence_read" ON storage.objects FOR SELECT TO authenticated
USING(bucket_id='cus-care-evidence' AND (SELECT public.cus_can_read()));
CREATE POLICY "cus_care_evidence_upload" ON storage.objects FOR INSERT TO authenticated
WITH CHECK(bucket_id='cus-care-evidence' AND (SELECT public.cus_can_write()));
