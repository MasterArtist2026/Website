-- Stage 1 CRM for Master Artist.
-- Not applied by the site deploy. Run this once in the Supabase SQL editor
-- for project fudaosneozobacdalncv. Until it has been run, the public forms
-- show a save error and do not count a generate_lead.
--
-- anon may INSERT a lead and nothing else. Contacts, workshops, bookings and
-- notes are written by staff (authenticated, active profile with the crm
-- section) or by the security-definer capture trigger below.
--
-- Name clash: draft PR #4 (branch cursor/studio-sessions-booking-80db,
-- file supabase/migrations/20261019170000_studio_sessions.sql) also creates
-- public.bookings, for Studio Sessions checkout. Do not apply that file
-- after this one until its bookings table is renamed (for example to
-- studio_bookings). This migration does not alter trial_leads.

begin;

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.contacts (
  id           bigint generated always as identity primary key,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz,
  updated_by   uuid,
  name         text not null,
  phone        text,
  email        text,
  phone_key    text,
  constraint contacts_name_len check (char_length(btrim(name)) between 1 and 120),
  constraint contacts_phone_format check (
    phone is null or phone ~ '^[0-9+(). -]{8,40}$'
  ),
  constraint contacts_email_format check (
    email is null or (char_length(email) <= 320 and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
  )
);

comment on table public.contacts is
  'People who have enquired or booked. Matched by normalised phone.';

create unique index contacts_phone_key_idx
  on public.contacts (phone_key)
  where phone_key is not null;

create index contacts_email_idx
  on public.contacts (lower(email))
  where email is not null;

create table public.workshops (
  id               bigint generated always as identity primary key,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz,
  updated_by       uuid,
  title            text not null,
  starts_at        timestamptz,
  capacity         integer not null default 8,
  price            numeric(10,2) not null default 0,
  early_bird_price numeric(10,2),
  early_bird_until date,
  ad_spend         numeric(10,2) not null default 0,
  constraint workshops_title_len check (char_length(btrim(title)) between 1 and 160),
  constraint workshops_capacity_pos check (capacity > 0 and capacity <= 500),
  constraint workshops_price_nonneg check (price >= 0 and ad_spend >= 0),
  constraint workshops_early_bird_nonneg check (early_bird_price is null or early_bird_price >= 0)
);

comment on table public.workshops is
  'A dated workshop the studio sells. ad_spend is what was spent to fill it.';

create index workshops_starts_at_idx on public.workshops (starts_at desc);

create table public.leads (
  id                bigint generated always as identity primary key,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz,
  updated_by        uuid,
  contact_id        bigint references public.contacts (id) on delete set null,
  name              text not null,
  phone             text not null,
  email             text,
  interest          text,
  child_age         text,
  message           text,
  source            text not null,
  source_page       text,
  landing_page      text,
  referrer          text,
  utm_source        text,
  utm_medium        text,
  utm_campaign      text,
  utm_term          text,
  utm_content       text,
  gclid             text,
  fbclid            text,
  stage             text not null default 'new',
  owner             uuid references public.profiles (id) on delete set null,
  next_follow_up_at timestamptz,
  constraint leads_name_len check (char_length(btrim(name)) between 1 and 120),
  constraint leads_phone_format check (phone ~ '^[0-9+(). -]{8,40}$'),
  constraint leads_email_format check (
    email is null or (char_length(email) <= 320 and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
  ),
  constraint leads_interest_len check (interest is null or char_length(interest) between 1 and 200),
  constraint leads_child_age_len check (child_age is null or char_length(child_age) between 1 and 40),
  constraint leads_message_len check (message is null or char_length(message) between 1 and 4000),
  constraint leads_source_check check (
    source in ('trial_form', 'workshop_form', 'booking_form', 'enquiry_form', 'whatsapp', 'admin')
  ),
  constraint leads_stage_check check (
    stage in ('new', 'replied', 'booked', 'paid', 'attended', 'lost')
  ),
  constraint leads_source_page_len check (source_page is null or char_length(source_page) <= 500),
  constraint leads_landing_page_len check (landing_page is null or char_length(landing_page) <= 500),
  constraint leads_referrer_len check (referrer is null or char_length(referrer) <= 500),
  constraint leads_utm_source_len check (utm_source is null or char_length(utm_source) <= 200),
  constraint leads_utm_medium_len check (utm_medium is null or char_length(utm_medium) <= 200),
  constraint leads_utm_campaign_len check (utm_campaign is null or char_length(utm_campaign) <= 200),
  constraint leads_utm_term_len check (utm_term is null or char_length(utm_term) <= 200),
  constraint leads_utm_content_len check (utm_content is null or char_length(utm_content) <= 200),
  constraint leads_gclid_len check (gclid is null or char_length(gclid) <= 200),
  constraint leads_fbclid_len check (fbclid is null or char_length(fbclid) <= 200)
);

comment on table public.leads is
  'Enquiries. anon can insert a new public-form lead only. Stage is the pipeline.';

create index leads_stage_updated_idx on public.leads (stage, updated_at desc);
create index leads_contact_idx on public.leads (contact_id);
create index leads_created_idx on public.leads (created_at desc);

create table public.bookings (
  id           bigint generated always as identity primary key,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz,
  updated_by   uuid,
  contact_id   bigint not null references public.contacts (id) on delete restrict,
  workshop_id  bigint references public.workshops (id) on delete set null,
  lead_id      bigint references public.leads (id) on delete set null,
  seats        integer not null default 1,
  price_paid   numeric(10,2) not null default 0,
  status       text not null default 'reserved',
  constraint bookings_seats_pos check (seats > 0 and seats <= 100),
  constraint bookings_price_nonneg check (price_paid >= 0),
  constraint bookings_status_check check (status in ('reserved', 'paid', 'attended', 'cancelled'))
);

comment on table public.bookings is
  'A contact attending a workshop. price_paid is what they actually paid.';

create index bookings_workshop_idx on public.bookings (workshop_id);
create index bookings_contact_idx on public.bookings (contact_id);

create table public.activities (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz,
  updated_by  uuid,
  contact_id  bigint references public.contacts (id) on delete cascade,
  lead_id     bigint references public.leads (id) on delete cascade,
  booking_id  bigint references public.bookings (id) on delete cascade,
  kind        text not null default 'note',
  body        text not null,
  constraint activities_kind_check check (kind in ('note', 'stage_change', 'whatsapp', 'booking', 'enquiry')),
  constraint activities_body_len check (char_length(btrim(body)) between 1 and 4000)
);

comment on table public.activities is
  'Notes and timeline events on a contact or lead.';

create index activities_contact_idx on public.activities (contact_id, created_at desc);
create index activities_lead_idx on public.activities (lead_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Staff section, same permission model as the content admin
-- ---------------------------------------------------------------------------

insert into public.role_permissions (role, section, can_read, can_write)
select r::user_role, 'crm', true, true
from unnest(array['admin', 'marketing', 'teacher']) as r
where not exists (
  select 1 from public.role_permissions p
  where p.role = r::user_role and p.section = 'crm'
);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create or replace function private.sync_contact_keys()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  digits text;
begin
  digits := regexp_replace(coalesce(new.phone, ''), '[^0-9]', '', 'g');
  if digits ~ '^0[0-9]{8,}$' then
    digits := '60' || substr(digits, 2);
  end if;
  new.phone_key := nullif(digits, '');
  if new.email is not null then
    new.email := nullif(lower(btrim(new.email)), '');
  end if;
  return new;
end;
$$;

create trigger contacts_keys
  before insert or update on public.contacts
  for each row execute function private.sync_contact_keys();

-- Links a new lead to a contact after the row exists, so the note can point
-- at the lead id. Runs as the function owner: anon never gets select/insert
-- on contacts.
create or replace function private.capture_public_lead_after()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  digits text;
  cid bigint;
begin
  digits := regexp_replace(coalesce(new.phone, ''), '[^0-9]', '', 'g');
  if digits ~ '^0[0-9]{8,}$' then
    digits := '60' || substr(digits, 2);
  end if;

  if digits <> '' then
    select id into cid from public.contacts where phone_key = digits limit 1;
  end if;
  if cid is null and new.email is not null and btrim(new.email) <> '' then
    select id into cid from public.contacts where lower(email) = lower(btrim(new.email)) limit 1;
  end if;

  if cid is null then
    begin
      insert into public.contacts (name, phone, email)
      values (new.name, new.phone, nullif(btrim(new.email), ''))
      returning id into cid;
    exception when unique_violation then
      select id into cid from public.contacts where phone_key = digits limit 1;
    end;
  end if;

  if new.contact_id is not null then
    cid := new.contact_id;
  else
    update public.leads set contact_id = cid where id = new.id and contact_id is null;
  end if;

  insert into public.activities (contact_id, lead_id, kind, body)
  values (
    cid,
    new.id,
    'enquiry',
    left('Enquiry via ' || new.source || coalesce(' · ' || new.interest, ''), 4000)
  );

  return new;
end;
$$;

create trigger leads_capture
  after insert on public.leads
  for each row execute function private.capture_public_lead_after();

create or replace function private.log_lead_stage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.stage is distinct from old.stage then
    insert into public.activities (contact_id, lead_id, kind, body)
    values (
      new.contact_id,
      new.id,
      'stage_change',
      'Stage changed from ' || old.stage || ' to ' || new.stage
    );
  end if;
  return new;
end;
$$;

create trigger leads_stage
  after update of stage on public.leads
  for each row execute function private.log_lead_stage();

-- Same audit stamp the content tables use. updated_at / updated_by required.
create trigger contacts_audit
  before insert or update or delete on public.contacts
  for each row execute function private.stamp_and_audit();

create trigger workshops_audit
  before insert or update or delete on public.workshops
  for each row execute function private.stamp_and_audit();

create trigger leads_audit
  before insert or update or delete on public.leads
  for each row execute function private.stamp_and_audit();

create trigger bookings_audit
  before insert or update or delete on public.bookings
  for each row execute function private.stamp_and_audit();

create trigger activities_audit
  before insert or update or delete on public.activities
  for each row execute function private.stamp_and_audit();

-- ---------------------------------------------------------------------------
-- Privileges and row level security
-- ---------------------------------------------------------------------------

alter table public.contacts enable row level security;
alter table public.contacts force row level security;
alter table public.workshops enable row level security;
alter table public.workshops force row level security;
alter table public.leads enable row level security;
alter table public.leads force row level security;
alter table public.bookings enable row level security;
alter table public.bookings force row level security;
alter table public.activities enable row level security;
alter table public.activities force row level security;

revoke all on public.contacts, public.workshops, public.leads, public.bookings, public.activities
  from public, anon, authenticated;

grant select, insert, update, delete on public.contacts to authenticated;
grant select, insert, update, delete on public.workshops to authenticated;
grant select, insert, update, delete on public.leads to authenticated;
grant select, insert, update, delete on public.bookings to authenticated;
grant select, insert, update, delete on public.activities to authenticated;

-- Column list omits id, timestamps, stage, owner and contact_id so a visitor
-- cannot set them. stage defaults to 'new'.
grant insert (
  name,
  phone,
  email,
  interest,
  child_age,
  message,
  source,
  source_page,
  landing_page,
  referrer,
  utm_source,
  utm_medium,
  utm_campaign,
  utm_term,
  utm_content,
  gclid,
  fbclid
) on public.leads to anon;

revoke all on function private.sync_contact_keys() from public;
revoke all on function private.capture_public_lead_after() from public;
revoke all on function private.log_lead_stage() from public;

-- The session user needs EXECUTE on a trigger function.
grant execute on function private.sync_contact_keys() to anon, authenticated;
grant execute on function private.capture_public_lead_after() to anon, authenticated;
grant execute on function private.log_lead_stage() to anon, authenticated;
grant execute on function private.stamp_and_audit() to anon, authenticated;

drop policy if exists contacts_staff_select on public.contacts;
drop policy if exists contacts_staff_insert on public.contacts;
drop policy if exists contacts_staff_update on public.contacts;
drop policy if exists contacts_staff_delete on public.contacts;

create policy contacts_staff_select on public.contacts
  for select to authenticated
  using ((select private.may_read('crm')));
create policy contacts_staff_insert on public.contacts
  for insert to authenticated
  with check ((select private.may_write('crm')));
create policy contacts_staff_update on public.contacts
  for update to authenticated
  using ((select private.may_write('crm')))
  with check ((select private.may_write('crm')));
create policy contacts_staff_delete on public.contacts
  for delete to authenticated
  using ((select private.may_write('crm')));

drop policy if exists workshops_staff_select on public.workshops;
drop policy if exists workshops_staff_insert on public.workshops;
drop policy if exists workshops_staff_update on public.workshops;
drop policy if exists workshops_staff_delete on public.workshops;

create policy workshops_staff_select on public.workshops
  for select to authenticated
  using ((select private.may_read('crm')));
create policy workshops_staff_insert on public.workshops
  for insert to authenticated
  with check ((select private.may_write('crm')));
create policy workshops_staff_update on public.workshops
  for update to authenticated
  using ((select private.may_write('crm')))
  with check ((select private.may_write('crm')));
create policy workshops_staff_delete on public.workshops
  for delete to authenticated
  using ((select private.may_write('crm')));

drop policy if exists leads_anon_insert on public.leads;
drop policy if exists leads_staff_select on public.leads;
drop policy if exists leads_staff_insert on public.leads;
drop policy if exists leads_staff_update on public.leads;
drop policy if exists leads_staff_delete on public.leads;

create policy leads_anon_insert on public.leads
  for insert to anon
  with check (
    stage = 'new'
    and source in ('trial_form', 'workshop_form', 'booking_form', 'enquiry_form')
    and owner is null
    and contact_id is null
  );

create policy leads_staff_select on public.leads
  for select to authenticated
  using ((select private.may_read('crm')));
create policy leads_staff_insert on public.leads
  for insert to authenticated
  with check ((select private.may_write('crm')));
create policy leads_staff_update on public.leads
  for update to authenticated
  using ((select private.may_write('crm')))
  with check ((select private.may_write('crm')));
create policy leads_staff_delete on public.leads
  for delete to authenticated
  using ((select private.may_write('crm')));

drop policy if exists bookings_staff_select on public.bookings;
drop policy if exists bookings_staff_insert on public.bookings;
drop policy if exists bookings_staff_update on public.bookings;
drop policy if exists bookings_staff_delete on public.bookings;

create policy bookings_staff_select on public.bookings
  for select to authenticated
  using ((select private.may_read('crm')));
create policy bookings_staff_insert on public.bookings
  for insert to authenticated
  with check ((select private.may_write('crm')));
create policy bookings_staff_update on public.bookings
  for update to authenticated
  using ((select private.may_write('crm')))
  with check ((select private.may_write('crm')));
create policy bookings_staff_delete on public.bookings
  for delete to authenticated
  using ((select private.may_write('crm')));

drop policy if exists activities_staff_select on public.activities;
drop policy if exists activities_staff_insert on public.activities;
drop policy if exists activities_staff_update on public.activities;
drop policy if exists activities_staff_delete on public.activities;

create policy activities_staff_select on public.activities
  for select to authenticated
  using ((select private.may_read('crm')));
create policy activities_staff_insert on public.activities
  for insert to authenticated
  with check ((select private.may_write('crm')));
create policy activities_staff_update on public.activities
  for update to authenticated
  using ((select private.may_write('crm')))
  with check ((select private.may_write('crm')));
create policy activities_staff_delete on public.activities
  for delete to authenticated
  using ((select private.may_write('crm')));

notify pgrst, 'reload schema';

commit;
