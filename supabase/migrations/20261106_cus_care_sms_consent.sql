-- Explicit parent consent for operational text reminders.
ALTER TABLE public.cus_care_profiles
  ADD COLUMN IF NOT EXISTS sms_consent boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.cus_care_profiles.sms_consent IS
  'Parent consent for operational care reminders; not permission for marketing';
