-- Customers (B2C CRM) and online payment. Run in the Supabase SQL Editor after bookings.sql.
-- Safe to run more than once.
--
-- One row per customer in public.contacts, matched by email (then phone). Every workshop
-- booking and every trial request creates or updates its customer through the triggers
-- below, so the CRM fills itself from the website: name, WhatsApp, email, children,
-- bookings, total paid, first source, marketing consent. Staff read and edit customers in
-- admin.html → Customers (role permission section 'customers').
--
-- Online payment: the create-checkout Edge Function inserts a 'pending' booking and opens
-- Stripe Checkout; the stripe-webhook function sets it to 'paid' (or 'expired' if the
-- customer leaves). Both use the service role, so anon still only inserts 'requested'.

begin;

-- ---------- customers ----------
create table if not exists public.contacts (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  first_name         text not null,
  last_name          text,
  email              text,
  phone              text,
  children           jsonb not null default '[]',      -- [{name, age}] as last given on a booking or trial
  tags               text[] not null default '{}',
  notes              text,
  marketing_consent  boolean not null default false,
  consent_at         timestamptz,
  first_source       text,                             -- e.g. meta/launch, from the first booking or trial
  first_seen         timestamptz not null default now(),
  last_activity      timestamptz not null default now(),
  bookings_count     int not null default 0,
  trials_count       int not null default 0,
  total_paid         int not null default 0,           -- RM, paid workshop bookings
  updated_at         timestamptz,
  updated_by         uuid,
  constraint contacts_email_lower check (email is null or email = lower(email)),
  constraint contacts_lens check (char_length(first_name) <= 60 and coalesce(char_length(last_name), 0) <= 60
    and coalesce(char_length(notes), 0) <= 5000 and char_length(children::text) <= 4000)
);
create unique index if not exists contacts_email_key on public.contacts (email) where email is not null;
create index if not exists contacts_phone_idx on public.contacts (phone);
create index if not exists contacts_last_activity_idx on public.contacts (last_activity desc);

alter table public.workshop_bookings add column if not exists contact_id uuid references public.contacts(id) on delete set null;
alter table public.workshop_bookings add column if not exists marketing_consent boolean not null default false;
alter table public.trial_leads add column if not exists contact_id uuid references public.contacts(id) on delete set null;
alter table public.trial_leads add column if not exists marketing_consent boolean not null default false;
create index if not exists workshop_bookings_contact_idx on public.workshop_bookings (contact_id);
create index if not exists trial_leads_contact_idx on public.trial_leads (contact_id);

-- Booking statuses: pending = sent to Stripe, waiting for payment; expired = left Stripe without paying
alter table public.workshop_bookings drop constraint if exists wb_status;
alter table public.workshop_bookings add constraint wb_status
  check (status in ('pending', 'requested', 'confirmed', 'paid', 'expired', 'cancelled', 'refunded'));

-- ---------- match or create the customer, then keep their totals current ----------
create or replace function private.upsert_contact(p_first text, p_last text, p_email text, p_phone text,
  p_source text, p_consent boolean, p_children jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare cid uuid; em text := nullif(lower(btrim(p_email)), '');
begin
  if em is not null then select id into cid from public.contacts where email = em; end if;
  if cid is null and nullif(btrim(p_phone), '') is not null then
    select id into cid from public.contacts where phone = btrim(p_phone) and (email is null or em is null) order by created_at limit 1;
  end if;
  if cid is null then
    insert into public.contacts (first_name, last_name, email, phone, first_source, marketing_consent, consent_at, children)
    values (coalesce(nullif(btrim(p_first), ''), '?'), nullif(btrim(p_last), ''), em, nullif(btrim(p_phone), ''), p_source,
            coalesce(p_consent, false), case when p_consent then now() end, coalesce(p_children, '[]'))
    returning id into cid;
  else
    update public.contacts set
      first_name = coalesce(nullif(btrim(p_first), ''), first_name),
      last_name = coalesce(nullif(btrim(p_last), ''), last_name),
      email = coalesce(email, em),
      phone = coalesce(nullif(btrim(p_phone), ''), phone),
      children = case when jsonb_array_length(coalesce(p_children, '[]')) > 0 then p_children else children end,
      marketing_consent = marketing_consent or coalesce(p_consent, false),
      consent_at = case when not marketing_consent and p_consent then now() else consent_at end,
      last_activity = now()
    where id = cid;
  end if;
  return cid;
end;
$$;

create or replace function private.refresh_contact(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.contacts c set
    bookings_count = (select count(*) from public.workshop_bookings b where b.contact_id = p_id and b.status in ('requested', 'confirmed', 'paid')),
    total_paid     = coalesce((select sum(amount) from public.workshop_bookings b where b.contact_id = p_id and b.status = 'paid'), 0),
    trials_count   = (select count(*) from public.trial_leads t where t.contact_id = p_id)
  where c.id = p_id;
$$;

create or replace function private.booking_to_contact()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.contact_id is null then
    new.contact_id := private.upsert_contact(new.first_name, new.last_name, new.email, new.phone, new.source,
      new.marketing_consent, (select coalesce(jsonb_agg(jsonb_build_object('name', k->>'name', 'age', k->>'age')), '[]')
                              from jsonb_array_elements(new.children) k));
  end if;
  return new;
end;
$$;
drop trigger if exists workshop_bookings_contact on public.workshop_bookings;
create trigger workshop_bookings_contact before insert on public.workshop_bookings
  for each row execute function private.booking_to_contact();

-- trial_leads keeps one name field: the first word is the first name; "For: Mia, age 7 (child of …)" adds a child
create or replace function private.trial_to_contact()
returns trigger language plpgsql security definer set search_path = public as $$
declare kid jsonb := '[]';
begin
  if new.message ~ 'For: [^,\n]+, age [^ \n]+ \(child of' then
    kid := jsonb_build_array(jsonb_build_object(
      'name', substring(new.message from 'For: ([^,\n]+), age'), 'age', substring(new.message from ', age ([^ \n]+) \(child of')));
  end if;
  if new.contact_id is null then
    new.contact_id := private.upsert_contact(split_part(btrim(new.parent_name), ' ', 1),
      nullif(btrim(substr(btrim(new.parent_name), char_length(split_part(btrim(new.parent_name), ' ', 1)) + 1)), ''),
      new.email, new.phone, coalesce(new.utm_source, new.ref_code), new.marketing_consent, '[]');
  end if;
  if jsonb_array_length(kid) > 0 then   -- several children arrive as several rows: add each one once
    update public.contacts set children = children || kid
    where id = new.contact_id and not children @> jsonb_build_array(jsonb_build_object('name', kid->0->>'name'));
  end if;
  return new;
end;
$$;
drop trigger if exists trial_leads_contact on public.trial_leads;
create trigger trial_leads_contact before insert on public.trial_leads
  for each row execute function private.trial_to_contact();

create or replace function private.contact_totals()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.contact_id is not null then perform private.refresh_contact(new.contact_id); end if;
  if tg_op = 'UPDATE' and old.contact_id is distinct from new.contact_id and old.contact_id is not null then
    perform private.refresh_contact(old.contact_id);
  end if;
  return null;
end;
$$;
drop trigger if exists workshop_bookings_totals on public.workshop_bookings;
create trigger workshop_bookings_totals after insert or update of status, amount, contact_id on public.workshop_bookings
  for each row execute function private.contact_totals();
drop trigger if exists trial_leads_totals on public.trial_leads;
create trigger trial_leads_totals after insert on public.trial_leads
  for each row execute function private.contact_totals();

-- Sabrina's report goes out for bookings she can act on: a WhatsApp request, or a payment
-- (not when someone is sent to Stripe and hasn't paid yet)
create or replace function private.notify_booking()
returns trigger language plpgsql security definer set search_path = public as $$
declare secret text;
begin
  if new.status not in ('requested', 'paid') then return new; end if;
  if tg_op = 'UPDATE' and old.status = new.status then return new; end if;
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
create trigger workshop_bookings_notify after insert or update of status on public.workshop_bookings
  for each row execute function private.notify_booking();

-- ---------- staff access: section 'customers' ----------
create or replace function private.can_section(p_section text, p_write boolean)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    join public.role_permissions rp on rp.role = p.role and rp.section = p_section
    where p.id = auth.uid() and p.active and (case when p_write then rp.can_write else rp.can_read end)
  );
$$;
revoke all on function private.can_section(text, boolean) from public;
grant execute on function private.can_section(text, boolean) to authenticated;

alter table public.contacts enable row level security;
drop policy if exists contacts_staff_read on public.contacts;
create policy contacts_staff_read on public.contacts for select to authenticated using (private.can_section('customers', false));
drop policy if exists contacts_staff_write on public.contacts;
create policy contacts_staff_write on public.contacts for update to authenticated
  using (private.can_section('customers', true)) with check (private.can_section('customers', true));
drop policy if exists contacts_staff_insert on public.contacts;
create policy contacts_staff_insert on public.contacts for insert to authenticated with check (private.can_section('customers', true));

-- Customers staff also see each customer's bookings and trials
drop policy if exists wb_customers_read on public.workshop_bookings;
create policy wb_customers_read on public.workshop_bookings for select to authenticated using (private.can_section('customers', false));
drop policy if exists tl_customers_read on public.trial_leads;
create policy tl_customers_read on public.trial_leads for select to authenticated using (private.can_section('customers', false));

revoke all on public.contacts from anon, authenticated;
grant select, insert on public.contacts to authenticated;
grant update (first_name, last_name, email, phone, children, tags, notes, marketing_consent, consent_at, updated_at, updated_by)
  on public.contacts to authenticated;
-- the website's insert-only grants: the new consent column (trial_leads grants insert column by column)
grant insert on public.workshop_bookings to anon, authenticated;
grant insert (marketing_consent) on public.trial_leads to anon;

insert into public.role_permissions (role, section, can_read, can_write)
select 'admin'::user_role, 'customers', true, true
where not exists (select 1 from public.role_permissions p where p.role = 'admin'::user_role and p.section = 'customers');

-- Customers from bookings and trials made before this ran
do $$
declare r record;
begin
  for r in select * from public.trial_leads where contact_id is null order by created_at loop
    update public.trial_leads set contact_id = private.upsert_contact(split_part(btrim(r.parent_name), ' ', 1),
      nullif(btrim(substr(btrim(r.parent_name), char_length(split_part(btrim(r.parent_name), ' ', 1)) + 1)), ''),
      r.email, r.phone, coalesce(r.utm_source, r.ref_code), false, '[]') where id = r.id;
  end loop;
  for r in select * from public.workshop_bookings where contact_id is null order by created_at loop
    update public.workshop_bookings set contact_id = private.upsert_contact(r.first_name, r.last_name, r.email, r.phone, r.source, false, '[]')
    where id = r.id;
  end loop;
end $$;
select private.refresh_contact(id) from public.contacts;

commit;

-- Check: anon must have no access to contacts; admin should have a customers permission
select grantee, string_agg(privilege_type, ', ') from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'contacts' and grantee in ('anon', 'authenticated') group by 1;
select role, section, can_read, can_write from public.role_permissions where section = 'customers';
