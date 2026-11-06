
-- Extra safeguarding rules for direct PostgREST access, not just the browser.
CREATE OR REPLACE FUNCTION public.cus_care_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM public.erp_memberships
    WHERE user_id=(SELECT auth.uid()) AND business_unit_id='cus' AND role IN ('owner','admin'))
$$;
REVOKE ALL ON FUNCTION public.cus_care_admin() FROM public,anon;
GRANT EXECUTE ON FUNCTION public.cus_care_admin() TO authenticated;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'cus_care_profiles','cus_care_guardians','cus_care_emergency_contacts',
    'cus_care_weekdays','cus_care_pickup_approvals'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS cus_care_insert ON public.%I',t);
    EXECUTE format('DROP POLICY IF EXISTS cus_care_update ON public.%I',t);
    EXECUTE format('CREATE POLICY cus_care_insert ON public.%I FOR INSERT TO authenticated WITH CHECK ((SELECT public.cus_care_admin()))',t);
    EXECUTE format('CREATE POLICY cus_care_update ON public.%I FOR UPDATE TO authenticated USING ((SELECT public.cus_care_admin())) WITH CHECK ((SELECT public.cus_care_admin()))',t);
  END LOOP;
END $$;
DROP POLICY IF EXISTS cus_care_evidence_upload ON storage.objects;
CREATE POLICY cus_care_evidence_upload ON storage.objects FOR INSERT TO authenticated
WITH CHECK(bucket_id='cus-care-evidence' AND (SELECT public.cus_care_admin()));

CREATE OR REPLACE FUNCTION public.cus_care_validate_visit()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE g record; c record; a record;
BEGIN
  IF old.status='released' THEN
    RAISE EXCEPTION 'Released care records are immutable; use a supervised correction process';
  END IF;
  IF old.student_id IS DISTINCT FROM new.student_id OR old.care_date IS DISTINCT FROM new.care_date
    OR old.scheduled_start IS DISTINCT FROM new.scheduled_start OR old.scheduled_end IS DISTINCT FROM new.scheduled_end THEN
    RAISE EXCEPTION 'Care booking identity/schedule cannot be rewritten';
  END IF;
  IF old.status='scheduled' AND new.status='in_care' THEN
    IF new.check_in_at IS NULL OR new.check_in_signature IS NULL OR length(new.check_in_signature)<250
      OR new.check_in_guardian_id IS NULL OR new.check_in_name IS NULL OR new.check_in_recorded_by IS NULL THEN
      RAISE EXCEPTION 'Signed and staff-recorded parent arrival is required';
    END IF;
    SELECT * INTO g FROM public.cus_care_guardians
      WHERE id=new.check_in_guardian_id AND student_id=new.student_id
      AND pickup_authorized AND signature_signed_at IS NOT NULL;
    IF NOT FOUND OR lower(btrim(g.full_name))<>lower(btrim(new.check_in_name)) THEN
      RAISE EXCEPTION 'Arrival guardian does not match a signed and authorised guardian';
    END IF;
  ELSIF old.status='in_care' AND new.status='released' THEN
    IF new.check_out_at IS NULL OR new.check_out_signature IS NULL OR length(new.check_out_signature)<250
      OR new.check_out_name IS NULL OR new.check_out_recorded_by IS NULL
      OR new.staff_verified_identity IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Verified signed handover is required';
    END IF;
    IF (new.check_out_guardian_id IS NOT NULL) = (new.check_out_contact_id IS NOT NULL) THEN
      RAISE EXCEPTION 'Specify exactly one pickup person';
    END IF;
    IF new.check_out_guardian_id IS NOT NULL THEN
      SELECT * INTO g FROM public.cus_care_guardians
        WHERE id=new.check_out_guardian_id AND student_id=new.student_id
        AND pickup_authorized AND signature_signed_at IS NOT NULL;
      IF NOT FOUND OR lower(btrim(g.full_name))<>lower(btrim(new.check_out_name)) THEN
        RAISE EXCEPTION 'Handover guardian is not authorised';
      END IF;
    ELSE
      SELECT * INTO c FROM public.cus_care_emergency_contacts
        WHERE id=new.check_out_contact_id AND student_id=new.student_id;
      IF NOT FOUND OR lower(btrim(c.full_name))<>lower(btrim(new.check_out_name)) THEN
        RAISE EXCEPTION 'Third party identity mismatch';
      END IF;
      SELECT * INTO a FROM public.cus_care_pickup_approvals
        WHERE visit_id=new.id AND contact_id=new.check_out_contact_id
          AND revoked_at IS NULL AND child_response_checked
          AND video_path IS NOT NULL AND parent_notified_at IS NOT NULL
        ORDER BY approved_at DESC LIMIT 1;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Third-party pickup needs documented parent approval and video notification';
      END IF;
    END IF;
  ELSIF old.status='scheduled' AND new.status='cancelled' THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Invalid care visit status transition';
  END IF;
  RETURN new;
END $$;
DROP TRIGGER IF EXISTS cus_care_validate_visit_update ON public.cus_care_visits;
CREATE TRIGGER cus_care_validate_visit_update BEFORE UPDATE ON public.cus_care_visits
  FOR EACH ROW EXECUTE FUNCTION public.cus_care_validate_visit();

CREATE OR REPLACE FUNCTION public.cus_care_audit_visit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $$
BEGIN
  INSERT INTO public.cus_care_events(visit_id,student_id,event_type,actor_id,details)
  VALUES(new.id,new.student_id,
    CASE WHEN new.status='in_care' THEN 'clock_in'
         WHEN new.status='released' THEN 'clock_out'
         WHEN new.status='cancelled' THEN 'cancelled'
         ELSE 'changed' END,
    (SELECT auth.uid()),
    jsonb_build_object('from',old.status,'to',new.status,
      'signed_name',CASE WHEN new.status='in_care' THEN new.check_in_name ELSE new.check_out_name END,
      'late_fee_nzd',new.late_fee_nzd));
  RETURN new;
END $$;
REVOKE ALL ON FUNCTION public.cus_care_audit_visit() FROM public,anon,authenticated;
DROP TRIGGER IF EXISTS cus_care_audit_visit_update ON public.cus_care_visits;
CREATE TRIGGER cus_care_audit_visit_update AFTER UPDATE ON public.cus_care_visits
  FOR EACH ROW EXECUTE FUNCTION public.cus_care_audit_visit();
