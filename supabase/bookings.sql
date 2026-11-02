-- Workshop bookings from the website, and staff access to them and to trial requests.
-- Run once in the Supabase SQL Editor (project fudaosneozobacdalncv), after trial_leads.
--
-- The booking form on each dated workshop page inserts one row per booking (status
-- 'requested' until payment is switched on; Stripe will set 'paid'). anon may INSERT a
-- 'requested' row and nothing else. Staff whose role has the 'bookings' permission read
-- and update rows in admin.html → Bookings. Every new row calls the booking-notify Edge
-- Function, which emails and WhatsApps Sabrina the session's attendee list.
--
-- Before running: Supabase → Project Settings → Vault → add a secret named
-- booking_hook_secret (any long random string) and put the same value in the Edge
-- Function secret BOOKING_HOOK_SECRET.

begin;

create table if not exists public.workshop_bookings (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  session_id      text not null,
  format          text not null,
  session_name    text not null,
  session_when    text not null,
  session_date    date not null,
  cap             int,
  first_name      text not null,
  last_name       text not null,
  name            text not null,          -- first_name + ' ' + last_name, used in lists and reports
  phone           text not null,
  email           text not null,
  qty             int not null default 1,
  ticket          text not null default 'single',
  people          int not null default 1,
  amount          int not null default 0,
  dine            boolean not null default false,
  allergies       text,
  child_name      text,                    -- children's first names, comma-separated (all of them are in children)
  child_age       text,
  children        jsonb not null default '[]',   -- [{name, age, allergies}] for kids' workshops
  collector       text,
  photo_consent   text,
  consents        text[] not null default '{}',
  status          text not null default 'requested',
  source          text,
  utm_source      text,
  utm_medium      text,
  utm_campaign    text,
  utm_content     text,
  gclid           text,
  fbclid          text,
  landing_page    text,
  stripe_session  text,
  paid_at         timestamptz,
  notes           text,
  updated_at      timestamptz,
  updated_by      uuid,
  constraint wb_session_id_format check (session_id ~ '^[a-z0-9-]{3,80}$'),
  constraint wb_format_format check (format ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint wb_text_lens check (
    char_length(session_name) <= 200 and char_length(session_when) <= 80
    and char_length(btrim(first_name)) between 1 and 60 and char_length(btrim(last_name)) between 1 and 60
    and char_length(btrim(name)) between 3 and 121
    and char_length(email) <= 320 and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    and (allergies is null or char_length(allergies) <= 1000)
    and (child_name is null or char_length(child_name) <= 400)
    and (child_age is null or char_length(child_age) <= 40)
    and (collector is null or char_length(collector) <= 120)
    and (source is null or char_length(source) <= 200)
    and (landing_page is null or char_length(landing_page) <= 500)
    and (notes is null or char_length(notes) <= 2000)
  ),
  constraint wb_utm_lens check (
    coalesce(char_length(utm_source), 0) <= 200 and coalesce(char_length(utm_medium), 0) <= 200
    and coalesce(char_length(utm_campaign), 0) <= 200 and coalesce(char_length(utm_content), 0) <= 200
    and coalesce(char_length(gclid), 0) <= 200 and coalesce(char_length(fbclid), 0) <= 200
  ),
  constraint wb_phone_format check (phone ~ '^[0-9+(). -]{8,40}$'),
  constraint wb_qty check (qty between 1 and 20 and people between 1 and 40 and amount between 0 and 100000),
  constraint wb_ticket check (ticket in ('single', 'pair')),
  constraint wb_photo check (photo_consent is null or photo_consent in ('yes', 'no', 'yes without name', 'yes with first name')),
  constraint wb_children check (jsonb_typeof(children) = 'array' and jsonb_array_length(children) <= 12 and char_length(children::text) <= 4000),
  constraint wb_status check (status in ('requested', 'confirmed', 'paid', 'cancelled', 'refunded'))
);

comment on table public.workshop_bookings is
  'Workshop bookings from the website. anon can insert requested rows only; staff with the bookings permission read and update.';

create index if not exists workshop_bookings_session_idx on public.workshop_bookings (session_id, created_at);
create index if not exists workshop_bookings_date_idx on public.workshop_bookings (session_date);

alter table public.workshop_bookings enable row level security;
alter table public.trial_leads enable row level security;

-- Staff access follows role_permissions, section 'bookings' (same model as the content sections)
create or replace function private.can_bookings(p_write boolean)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    join public.role_permissions rp on rp.role = p.role and rp.section = 'bookings'
    where p.id = auth.uid() and p.active and (case when p_write then rp.can_write else rp.can_read end)
  );
$$;
revoke all on function private.can_bookings(boolean) from public;
grant execute on function private.can_bookings(boolean) to authenticated;

drop policy if exists wb_public_insert on public.workshop_bookings;
create policy wb_public_insert on public.workshop_bookings for insert to anon, authenticated
  with check (status = 'requested' and stripe_session is null and paid_at is null and notes is null and updated_by is null);

drop policy if exists wb_staff_read on public.workshop_bookings;
create policy wb_staff_read on public.workshop_bookings for select to authenticated using (private.can_bookings(false));

drop policy if exists wb_staff_update on public.workshop_bookings;
create policy wb_staff_update on public.workshop_bookings for update to authenticated
  using (private.can_bookings(true)) with check (private.can_bookings(true));

drop policy if exists tl_staff_read on public.trial_leads;
create policy tl_staff_read on public.trial_leads for select to authenticated using (private.can_bookings(false));

drop policy if exists tl_staff_update on public.trial_leads;
create policy tl_staff_update on public.trial_leads for update to authenticated
  using (private.can_bookings(true)) with check (private.can_bookings(true));

revoke all on public.workshop_bookings from anon, authenticated;
grant insert on public.workshop_bookings to anon, authenticated;
grant select, update (status, notes, updated_at, updated_by) on public.workshop_bookings to authenticated;
grant select, update (status) on public.trial_leads to authenticated;

insert into public.role_permissions (role, section, can_read, can_write)
select 'admin'::user_role, 'bookings', true, true
where not exists (select 1 from public.role_permissions p where p.role = 'admin'::user_role and p.section = 'bookings');

-- Each new booking pings the booking-notify Edge Function (pg_net, asynchronous: the
-- insert never waits for or fails on the email/WhatsApp send)
create extension if not exists pg_net;

create or replace function private.notify_booking()
returns trigger language plpgsql security definer set search_path = public as $$
declare secret text;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'booking_hook_secret';
  if secret is null then return new; end if;
  perform net.http_post(
    url := 'https://fudaosneozobacdalncv.supabase.co/functions/v1/booking-notify',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-hook-secret', secret),
    body := jsonb_build_object('booking_id', new.id, 'event', tg_op, 'status', new.status)
  );
  return new;
end;
$$;

drop trigger if exists workshop_bookings_notify on public.workshop_bookings;
create trigger workshop_bookings_notify after insert on public.workshop_bookings
  for each row execute function private.notify_booking();

commit;

-- Check: anon should have INSERT only on workshop_bookings; admin should have a bookings permission
select grantee, string_agg(privilege_type, ', ') from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'workshop_bookings' and grantee in ('anon', 'authenticated') group by 1;
select role, section, can_read, can_write from public.role_permissions where section = 'bookings';
