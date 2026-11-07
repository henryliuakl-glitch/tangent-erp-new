-- Atomic registration: a failed guardian/contact insert cannot leave a half-created care child.
create or replace function public.cus_register_care_child(p jsonb)
returns uuid language plpgsql security invoker set search_path=public as $$
declare
  child_id uuid;
  first_parent jsonb := p->'guardian1';
  second_parent jsonb := p->'guardian2';
  contact jsonb := p->'emergency';
  second_name text := nullif(btrim(coalesce(second_parent->>'name','')),'');
  first_name text := btrim(coalesce(first_parent->>'name',''));
  first_signature text := coalesce(first_parent->>'signature','');
  second_signature text := coalesce(second_parent->>'signature','');
  primary_number integer := coalesce((p->>'primary')::integer,1);
begin
  if not public.erp_can_care_manage() then raise exception 'Not permitted'; end if;
  if nullif(btrim(coalesce(p->>'child_name','')),'') is null then
    raise exception 'Child name required';
  end if;
  if length(first_name)<2 or length(first_signature)<250
     or length(btrim(coalesce(first_parent->>'phone','')))<6 then
     raise exception 'First parent contact and signature required';
  end if;
  if second_name is not null and (length(second_signature)<250
    or length(btrim(coalesce(second_parent->>'phone','')))<6) then
    raise exception 'Second parent contact and signature required';
  end if;
  if primary_number=2 and second_name is null then
    raise exception 'Primary parent must have signed';
  end if;
  if nullif(btrim(coalesce(contact->>'name','')),'') is null
    or length(btrim(coalesce(contact->>'phone','')))<6 then
    raise exception 'Emergency contact name and phone required';
  end if;
  if coalesce((p->>'accepted')::boolean,false) is not true then
    raise exception 'Consent is required';
  end if;
  insert into public.cus_care_children(full_name,created_by)
    values (btrim(p->>'child_name'),auth.uid()) returning id into child_id;
  insert into public.cus_care_profiles (
    student_id,school,year_level,date_of_birth,allergies,medical_notes,
    parental_arrangement_notes,missing_guardian_reason,image_consent,sms_consent,
    terms_acknowledged_at,status
  ) values(
    child_id,nullif(p->>'school',''),nullif(p->>'year_level',''),
    nullif(p->>'dob','')::date,nullif(p->>'allergies',''),
    nullif(p->>'medical',''),nullif(p->>'parent_notes',''),
    nullif(p->>'missing_reason',''),
    coalesce((p->>'image_consent')::boolean,false),
    coalesce((p->>'sms_consent')::boolean,false),now(),
    case when second_name is not null then 'active' else 'pending' end
  );
  insert into public.cus_care_guardians(
    student_id,full_name,relationship,phone,email,primary_contact,pickup_authorized,
    signature_data,signature_name,signature_signed_at,signature_recorded_by
  ) values (
    child_id,first_name,coalesce(nullif(first_parent->>'relation',''),'guardian'),
    first_parent->>'phone',nullif(first_parent->>'email',''),primary_number=1,true,
    first_signature,first_name,now(),auth.uid()
  );
  if second_name is not null then
    insert into public.cus_care_guardians(
      student_id,full_name,relationship,phone,email,primary_contact,pickup_authorized,
      signature_data,signature_name,signature_signed_at,signature_recorded_by
    ) values(
      child_id,second_name,coalesce(nullif(second_parent->>'relation',''),'guardian'),
      second_parent->>'phone',nullif(second_parent->>'email',''),
      primary_number=2,true,second_signature,second_name,now(),auth.uid()
    );
  end if;
  insert into public.cus_care_emergency_contacts(
    student_id,full_name,relationship,phone,pickup_authorized
  ) values (
    child_id,btrim(contact->>'name'),nullif(contact->>'relation',''),
    contact->>'phone',false
  );
  return child_id;
end $$;
revoke all on function public.cus_register_care_child(jsonb) from public,anon;
grant execute on function public.cus_register_care_child(jsonb) to authenticated;
