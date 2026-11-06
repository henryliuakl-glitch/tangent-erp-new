-- Fix administrative schedule changes; keep sensitive guardian history insert-only.
DROP POLICY IF EXISTS cus_care_admin_weekdays_delete ON public.cus_care_weekdays;
CREATE POLICY cus_care_admin_weekdays_delete ON public.cus_care_weekdays
  FOR DELETE TO authenticated USING ((SELECT public.cus_care_admin()));
-- Capture which terms were presented at sign-up, pending legal review.
ALTER TABLE public.cus_care_profiles
  ADD COLUMN IF NOT EXISTS terms_version text NOT NULL DEFAULT 'draft-2026-11';
-- The audit trigger below records approval grants and changes in the append-only custody audit.
CREATE OR REPLACE FUNCTION public.cus_care_audit_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE child uuid;
BEGIN
  SELECT student_id INTO child FROM public.cus_care_visits WHERE id=new.visit_id;
  INSERT INTO public.cus_care_events(visit_id,student_id,event_type,actor_id,details)
  VALUES(new.visit_id,child,
    CASE WHEN tg_op='INSERT' THEN 'third_party_approval' ELSE 'third_party_approval_update' END,
    (SELECT auth.uid()),
    jsonb_build_object('contact_id',new.contact_id,'guardian_id',new.parent_guardian_id,
      'video_uploaded',new.video_path IS NOT NULL,'parent_notified',new.parent_notified_at IS NOT NULL,
      'approval_channel',new.approval_channel));
  RETURN new;
END $$;
REVOKE ALL ON FUNCTION public.cus_care_audit_approval() FROM public,anon,authenticated;
DROP TRIGGER IF EXISTS cus_care_audit_approval_change ON public.cus_care_pickup_approvals;
CREATE TRIGGER cus_care_audit_approval_change
  AFTER INSERT OR UPDATE ON public.cus_care_pickup_approvals
  FOR EACH ROW EXECUTE FUNCTION public.cus_care_audit_approval();
