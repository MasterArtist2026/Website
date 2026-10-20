-- Add-ons, gift vouchers, and enquiries for Studio Sessions.
-- Apply after 20261019170000 and the seed. Do not run this from the site deploy.
--
-- If the previous seed (first session 10 Nov 2026) was already applied, this
-- file removes those unbooked drafts. Re-run 20261019170100_studio_sessions_seed.sql
-- afterwards so the timetable starts on 1 Nov 2026.

begin;

create table public.workshop_addons (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null,
  price_myr numeric(10,2) not null,
  format_id uuid references public.workshop_formats (id),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  updated_by uuid references public.profiles (id),
  constraint workshop_addons_price_check check (price_myr >= 0),
  constraint workshop_addons_slug_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

comment on table public.workshop_addons is
  'Optional paid extras at checkout, such as a bigger canvas. The session price already includes materials.';

create table public.gift_vouchers (
  id uuid primary key default gen_random_uuid(),
  public_code text not null unique,
  public_token uuid not null default gen_random_uuid() unique,
  amount_myr numeric(10,2) not null,
  balance_myr numeric(10,2) not null,
  purchaser_name text not null,
  phone text not null,
  email text not null,
  recipient_name text,
  status text not null default 'pending',
  payment_mode text not null,
  payment_ref text,
  hold_expires_at timestamptz,
  redeemed_booking_id uuid,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  gclid text,
  fbclid text,
  ref_code text not null default 'WEB',
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  updated_by uuid references public.profiles (id),
  constraint gift_vouchers_amount_check check (amount_myr > 0 and balance_myr >= 0 and balance_myr <= amount_myr),
  constraint gift_vouchers_status_check check (status in ('pending', 'paid', 'redeemed', 'cancelled')),
  constraint gift_vouchers_mode_check check (payment_mode in ('stripe', 'whatsapp')),
  constraint gift_vouchers_ref_check check (ref_code in ('FB', 'GG', 'WEB'))
);

comment on table public.gift_vouchers is
  'Purchased Studio Session gift vouchers. A paid code can be redeemed against a booking.';

create table public.booking_addons (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  addon_id uuid not null references public.workshop_addons (id),
  name text not null,
  qty integer not null,
  amount_myr numeric(10,2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  updated_by uuid references public.profiles (id),
  constraint booking_addons_qty_check check (qty between 1 and 20),
  constraint booking_addons_amount_check check (amount_myr >= 0)
);

alter table public.bookings
  add column gift_voucher_id uuid references public.gift_vouchers (id),
  add column gift_credit_myr numeric(10,2) not null default 0;

alter table public.gift_vouchers
  add constraint gift_vouchers_redeemed_booking_fk
  foreign key (redeemed_booking_id) references public.bookings (id);

create table public.studio_enquiries (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  name text not null,
  company text,
  phone text not null,
  email text not null,
  package text,
  event_date date,
  headcount integer,
  message text,
  status text not null default 'new',
  utm_source text,
  utm_medium text,
  utm_campaign text,
  gclid text,
  fbclid text,
  ref_code text not null default 'WEB',
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  updated_by uuid references public.profiles (id),
  constraint studio_enquiries_kind_check check (kind in ('corporate', 'private')),
  constraint studio_enquiries_status_check check (status in ('new', 'contacted', 'closed')),
  constraint studio_enquiries_ref_check check (ref_code in ('FB', 'GG', 'WEB'))
);

comment on table public.studio_enquiries is
  'Corporate and private-event enquiries. Not trial leads.';

-- If the 10 Nov seed is already loaded, drop unbooked drafts so the corrected seed can be re-run.
do $$
begin
  if exists (
    select 1 from public.workshop_sessions
    where starts_at = (timestamp '2026-11-10 10:00' at time zone 'Asia/Kuala_Lumpur')
      and status = 'draft'
      and promo_label = 'Soft launch RM20 off'
  ) then
    delete from public.workshop_sessions s
    where s.status = 'draft'
      and not exists (select 1 from public.bookings b where b.session_id = s.id);
  end if;
end $$;

insert into public.workshop_addons (slug, name, description, price_myr, format_id, sort_order)
select 'bigger-canvas', 'Bigger canvas',
       'A 40×50cm canvas instead of the included 30×40cm. Optional, and shown before you pay.',
       40.00, f.id, 1
from public.workshop_formats f
where f.slug = 'canvas-night'
  and not exists (select 1 from public.workshop_addons a where a.slug = 'bigger-canvas');

create or replace function private.mint_paid_voucher()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  code text;
  tries integer := 0;
begin
  if tg_op = 'INSERT' and new.status = 'paid' and new.voucher_code is null then
    loop
      tries := tries + 1;
      code := private.mint_code('MA50-', 8);
      exit when not exists (select 1 from public.bookings where voucher_code = code);
      if tries > 8 then
        raise exception 'could not mint voucher';
      end if;
    end loop;
    new.voucher_code := code;
    new.hold_expires_at := null;
  end if;
  return new;
end;
$$;

create or replace function private.restore_gift_credit()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if tg_op = 'UPDATE'
     and new.status = 'cancelled'
     and old.status = 'pending'
     and old.gift_voucher_id is not null
     and coalesce(old.gift_credit_myr, 0) > 0
  then
    update public.gift_vouchers
       set balance_myr = balance_myr + old.gift_credit_myr,
           status = 'paid',
           redeemed_booking_id = case when redeemed_booking_id = old.id then null else redeemed_booking_id end
     where id = old.gift_voucher_id;
    new.gift_credit_myr := 0;
    new.gift_voucher_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_a0_paid_voucher on public.bookings;
create trigger bookings_a0_paid_voucher
  before insert on public.bookings
  for each row execute function private.mint_paid_voucher();

drop trigger if exists bookings_c_gift on public.bookings;
create trigger bookings_c_gift
  before update on public.bookings
  for each row execute function private.restore_gift_credit();

create or replace function private.apply_booking_extras(p_booking uuid, p_session uuid, payload jsonb, p_qty integer)
returns numeric
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  item jsonb;
  ad public.workshop_addons%rowtype;
  aq integer;
  line numeric(10,2);
  total numeric(10,2) := 0;
  fmt uuid;
begin
  select format_id into fmt from public.workshop_sessions where id = p_session;
  if jsonb_typeof(payload->'addons') = 'array' then
    for item in select value from jsonb_array_elements(payload->'addons')
    loop
      aq := coalesce((item->>'qty')::integer, p_qty);
      if aq < 1 or aq > p_qty then
        raise exception 'invalid_addon';
      end if;
      select * into ad from public.workshop_addons
      where slug = item->>'slug' and active
        and (format_id is null or format_id = fmt);
      if not found then
        raise exception 'invalid_addon';
      end if;
      line := round(ad.price_myr * aq, 2);
      insert into public.booking_addons (booking_id, addon_id, name, qty, amount_myr)
      values (p_booking, ad.id, ad.name, aq, line);
      total := total + line;
    end loop;
  end if;
  return total;
end;
$$;

-- Extend the hold so add-ons and a paid gift code change the amount charged.
create or replace function private.create_booking_hold(payload jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
set row_security = off
as $$
declare
  sess public.workshop_sessions%rowtype;
  fmt public.workshop_formats%rowtype;
  gv public.gift_vouchers%rowtype;
  v_gift uuid;
  v_qty integer;
  v_mode text;
  v_name text;
  v_phone text;
  v_email text;
  v_child text;
  v_age text;
  v_ref text;
  v_unit numeric(10,2);
  v_amount numeric(10,2);
  v_addons numeric(10,2) := 0;
  v_credit numeric(10,2) := 0;
  v_due numeric(10,2);
  v_hold timestamptz;
  v_status text;
  created public.bookings%rowtype;
begin
  v_qty := (payload->>'qty')::integer;
  v_mode := payload->>'payment_mode';
  v_name := btrim(coalesce(payload->>'name', ''));
  v_phone := btrim(coalesce(payload->>'phone', ''));
  v_email := lower(btrim(coalesce(payload->>'email', '')));
  v_child := nullif(btrim(coalesce(payload->>'child_name', '')), '');
  v_age := nullif(left(btrim(coalesce(payload->>'child_age', '')), 40), '');
  v_ref := coalesce(nullif(payload->>'ref_code', ''), 'WEB');

  if v_mode not in ('stripe', 'whatsapp') then
    raise exception 'invalid_contact';
  end if;
  if v_qty is null or v_qty < 1 or v_qty > 20 then
    raise exception 'invalid_qty';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 120
     or v_phone !~ '^[0-9+(). -]{8,40}$'
     or v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     or char_length(v_email) > 320
     or v_ref not in ('FB', 'GG', 'WEB')
  then
    raise exception 'invalid_contact';
  end if;

  select * into sess
  from public.workshop_sessions
  where id = (payload->>'session_id')::uuid
  for update;

  if not found then
    raise exception 'not_published';
  end if;

  select * into fmt from public.workshop_formats where id = sess.format_id;

  if sess.status <> 'published' or sess.starts_at <= now() then
    raise exception 'not_published';
  end if;
  if not fmt.bookable then
    raise exception 'not_bookable';
  end if;
  if fmt.requires_child and v_child is null then
    raise exception 'child_required';
  end if;

  update public.bookings
     set status = 'cancelled'
   where session_id = sess.id
     and status = 'pending'
     and hold_expires_at is not null
     and hold_expires_at <= now();

  v_unit := private.studio_unit_price(sess.price_myr, sess.public_holiday);
  v_amount := round(v_unit * v_qty, 2);

  if nullif(btrim(coalesce(payload->>'gift_code', '')), '') is not null then
    select * into gv from public.gift_vouchers
    where public_code = upper(btrim(payload->>'gift_code'))
    for update;
    if not found or gv.status <> 'paid' or gv.balance_myr <= 0 then
      raise exception 'invalid_gift';
    end if;
    v_gift := gv.id;
  end if;

  if v_mode = 'stripe' then
    v_hold := now() + interval '15 minutes';
  else
    v_hold := now() + interval '24 hours';
  end if;

  -- Add-on total is known only after the booking id exists, so price the lines first.
  if jsonb_typeof(payload->'addons') = 'array' then
    v_addons := coalesce((
      select sum(round(a.price_myr * least(greatest(coalesce((item->>'qty')::integer, v_qty), 1), v_qty), 2))
      from jsonb_array_elements(payload->'addons') item
      join public.workshop_addons a on a.slug = item->>'slug' and a.active
       and (a.format_id is null or a.format_id = sess.format_id)
    ), 0);
    if v_addons = 0 and jsonb_array_length(payload->'addons') > 0 then
      raise exception 'invalid_addon';
    end if;
  end if;

  if v_gift is not null then
    v_credit := least(gv.balance_myr, v_amount + v_addons);
  end if;
  v_due := round(v_amount + v_addons - v_credit, 2);
  v_status := case when v_due = 0 then 'paid' else 'pending' end;
  if v_status = 'paid' then
    v_hold := null;
  end if;

  insert into public.bookings (
    session_id, booker_name, phone, email, qty, child_name, child_age,
    amount_myr, currency, status, payment_mode, hold_expires_at,
    gift_voucher_id, gift_credit_myr,
    utm_source, utm_medium, utm_campaign, utm_term, utm_content,
    gclid, fbclid, ref_code, landing_page, referrer
  ) values (
    sess.id, v_name, v_phone, v_email, v_qty, v_child, v_age,
    v_due, 'MYR', v_status, v_mode, v_hold,
    v_gift, v_credit,
    nullif(left(coalesce(payload->>'utm_source', ''), 200), ''),
    nullif(left(coalesce(payload->>'utm_medium', ''), 200), ''),
    nullif(left(coalesce(payload->>'utm_campaign', ''), 200), ''),
    nullif(left(coalesce(payload->>'utm_term', ''), 200), ''),
    nullif(left(coalesce(payload->>'utm_content', ''), 200), ''),
    nullif(left(coalesce(payload->>'gclid', ''), 200), ''),
    nullif(left(coalesce(payload->>'fbclid', ''), 200), ''),
    v_ref,
    nullif(left(coalesce(payload->>'landing_page', ''), 500), ''),
    nullif(left(coalesce(payload->>'referrer', ''), 500), '')
  )
  returning * into created;

  if v_addons > 0 then
    perform private.apply_booking_extras(created.id, sess.id, payload, v_qty);
  end if;

  if v_gift is not null and v_credit > 0 then
    update public.gift_vouchers
       set balance_myr = balance_myr - v_credit,
           status = case when balance_myr - v_credit = 0 then 'redeemed' else 'paid' end,
           redeemed_booking_id = case when balance_myr - v_credit = 0 then created.id else redeemed_booking_id end
     where id = gv.id;
  end if;

  return jsonb_build_object(
    'booking_id', created.id,
    'public_code', created.public_code,
    'public_token', created.public_token,
    'amount_myr', created.amount_myr,
    'amount_sen', round(created.amount_myr * 100)::integer,
    'addon_myr', v_addons,
    'gift_credit_myr', v_credit,
    'currency', 'MYR',
    'qty', created.qty,
    'people', created.people,
    'unit', fmt.unit,
    'hold_expires_at', created.hold_expires_at,
    'voucher_code', created.voucher_code,
    'voucher_credits', created.voucher_credits,
    'payment_mode', created.payment_mode,
    'status', created.status,
    'session', jsonb_build_object(
      'id', sess.id,
      'name', fmt.name,
      'slug', fmt.slug,
      'starts_at', sess.starts_at,
      'ends_at', sess.ends_at,
      'room', sess.room,
      'unit_price_myr', v_unit
    )
  );
end;
$$;

create or replace function private.create_gift_voucher(payload jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
set row_security = off
as $$
declare
  v_amount numeric(10,2);
  v_mode text;
  v_name text;
  v_phone text;
  v_email text;
  v_recipient text;
  v_ref text;
  v_hold timestamptz;
  code text;
  tries integer := 0;
  created public.gift_vouchers%rowtype;
begin
  v_amount := (payload->>'amount_myr')::numeric;
  v_mode := payload->>'payment_mode';
  v_name := btrim(coalesce(payload->>'name', ''));
  v_phone := btrim(coalesce(payload->>'phone', ''));
  v_email := lower(btrim(coalesce(payload->>'email', '')));
  v_recipient := nullif(btrim(coalesce(payload->>'recipient_name', '')), '');
  v_ref := coalesce(nullif(payload->>'ref_code', ''), 'WEB');

  if v_amount not in (88, 98, 108, 118, 128, 160) then
    raise exception 'invalid_amount';
  end if;
  if v_mode not in ('stripe', 'whatsapp') then
    raise exception 'invalid_contact';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 120
     or v_phone !~ '^[0-9+(). -]{8,40}$'
     or v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     or v_ref not in ('FB', 'GG', 'WEB')
  then
    raise exception 'invalid_contact';
  end if;

  loop
    tries := tries + 1;
    code := private.mint_code('GV-', 8);
    exit when not exists (select 1 from public.gift_vouchers where public_code = code);
    if tries > 8 then
      raise exception 'could not mint voucher';
    end if;
  end loop;

  if v_mode = 'stripe' then
    v_hold := now() + interval '15 minutes';
  else
    v_hold := now() + interval '24 hours';
  end if;

  insert into public.gift_vouchers (
    public_code, amount_myr, balance_myr, purchaser_name, phone, email, recipient_name,
    status, payment_mode, hold_expires_at, ref_code, utm_source, utm_medium, utm_campaign, gclid, fbclid
  ) values (
    code, v_amount, v_amount, v_name, v_phone, v_email, v_recipient,
    'pending', v_mode, v_hold, v_ref,
    nullif(left(coalesce(payload->>'utm_source', ''), 200), ''),
    nullif(left(coalesce(payload->>'utm_medium', ''), 200), ''),
    nullif(left(coalesce(payload->>'utm_campaign', ''), 200), ''),
    nullif(left(coalesce(payload->>'gclid', ''), 200), ''),
    nullif(left(coalesce(payload->>'fbclid', ''), 200), '')
  )
  returning * into created;

  return jsonb_build_object(
    'gift_id', created.id,
    'public_code', created.public_code,
    'public_token', created.public_token,
    'amount_myr', created.amount_myr,
    'amount_sen', round(created.amount_myr * 100)::integer,
    'status', created.status,
    'payment_mode', created.payment_mode,
    'recipient_name', created.recipient_name
  );
end;
$$;

create or replace function private.settle_gift_voucher(p_gift uuid, p_payment_ref text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
set row_security = off
as $$
declare
  g public.gift_vouchers%rowtype;
begin
  select * into g from public.gift_vouchers where id = p_gift for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'missing');
  end if;
  if g.status in ('paid', 'redeemed') then
    return jsonb_build_object('ok', true, 'already', true, 'public_code', g.public_code);
  end if;
  if g.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'not_pending');
  end if;
  update public.gift_vouchers
     set status = 'paid',
         payment_ref = coalesce(p_payment_ref, payment_ref),
         hold_expires_at = null
   where id = p_gift
   returning * into g;
  return jsonb_build_object('ok', true, 'public_code', g.public_code, 'status', g.status);
end;
$$;

create or replace function private.create_studio_enquiry(payload jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
set row_security = off
as $$
declare
  created uuid;
  v_kind text;
  v_name text;
  v_phone text;
  v_email text;
  v_ref text;
begin
  v_kind := payload->>'kind';
  v_name := btrim(coalesce(payload->>'name', ''));
  v_phone := btrim(coalesce(payload->>'phone', ''));
  v_email := lower(btrim(coalesce(payload->>'email', '')));
  v_ref := coalesce(nullif(payload->>'ref_code', ''), 'WEB');
  if v_kind not in ('corporate', 'private')
     or char_length(v_name) < 1 or char_length(v_name) > 120
     or v_phone !~ '^[0-9+(). -]{8,40}$'
     or v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     or v_ref not in ('FB', 'GG', 'WEB')
  then
    raise exception 'invalid_contact';
  end if;
  insert into public.studio_enquiries (
    kind, name, company, phone, email, package, event_date, headcount, message,
    ref_code, utm_source, utm_medium, utm_campaign, gclid, fbclid
  ) values (
    v_kind, v_name,
    nullif(left(btrim(coalesce(payload->>'company', '')), 120), ''),
    v_phone, v_email,
    nullif(left(btrim(coalesce(payload->>'package', '')), 80), ''),
    nullif(payload->>'event_date', '')::date,
    nullif(payload->>'headcount', '')::integer,
    nullif(left(btrim(coalesce(payload->>'message', '')), 2000), ''),
    v_ref,
    nullif(left(coalesce(payload->>'utm_source', ''), 200), ''),
    nullif(left(coalesce(payload->>'utm_medium', ''), 200), ''),
    nullif(left(coalesce(payload->>'utm_campaign', ''), 200), ''),
    nullif(left(coalesce(payload->>'gclid', ''), 200), ''),
    nullif(left(coalesce(payload->>'fbclid', ''), 200), '')
  )
  returning id into created;
  return created;
end;
$$;

create or replace function public.hold_gift_voucher(payload jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
begin
  if current_user is distinct from 'service_role' then
    raise exception 'not allowed';
  end if;
  return private.create_gift_voucher(payload);
end;
$$;

create or replace function public.settle_gift_voucher(p_gift uuid, p_payment_ref text)
returns jsonb language plpgsql security invoker set search_path = public as $$
begin
  if current_user is distinct from 'service_role' then
    raise exception 'not allowed';
  end if;
  return private.settle_gift_voucher(p_gift, p_payment_ref);
end;
$$;

create or replace function public.create_studio_enquiry(payload jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
begin
  if current_user is distinct from 'service_role' then
    raise exception 'not allowed';
  end if;
  return private.create_studio_enquiry(payload);
end;
$$;

revoke all on function public.hold_gift_voucher(jsonb) from public, anon, authenticated;
revoke all on function public.settle_gift_voucher(uuid, text) from public, anon, authenticated;
revoke all on function public.create_studio_enquiry(jsonb) from public, anon, authenticated;
revoke all on function private.apply_booking_extras(uuid, uuid, jsonb, integer) from public;
revoke all on function private.mint_paid_voucher() from public;
revoke all on function private.restore_gift_credit() from public;
revoke all on function private.create_gift_voucher(jsonb) from public;
revoke all on function private.settle_gift_voucher(uuid, text) from public;
revoke all on function private.create_studio_enquiry(jsonb) from public;

grant execute on function public.hold_gift_voucher(jsonb) to service_role;
grant execute on function public.settle_gift_voucher(uuid, text) to service_role;
grant execute on function public.create_studio_enquiry(jsonb) to service_role;
grant execute on function private.create_gift_voucher(jsonb) to service_role;
grant execute on function private.settle_gift_voucher(uuid, text) to service_role;
grant execute on function private.create_studio_enquiry(jsonb) to service_role;
grant execute on function private.apply_booking_extras(uuid, uuid, jsonb, integer) to service_role;

alter table public.workshop_addons enable row level security;
alter table public.workshop_addons force row level security;
alter table public.gift_vouchers enable row level security;
alter table public.gift_vouchers force row level security;
alter table public.booking_addons enable row level security;
alter table public.booking_addons force row level security;
alter table public.studio_enquiries enable row level security;
alter table public.studio_enquiries force row level security;

select private.reapply_section_rls('workshop_addons', 'studio_sessions');
select private.reapply_section_rls('gift_vouchers', 'studio_sessions');
select private.reapply_section_rls('booking_addons', 'studio_sessions');
select private.reapply_section_rls('studio_enquiries', 'studio_sessions');

revoke all on public.workshop_addons from public, anon, authenticated;
revoke all on public.gift_vouchers from public, anon, authenticated;
revoke all on public.booking_addons from public, anon, authenticated;
revoke all on public.studio_enquiries from public, anon, authenticated;

grant select, insert, update, delete on public.workshop_addons to authenticated;
grant select, insert, update, delete on public.gift_vouchers to authenticated;
grant select, insert, update, delete on public.booking_addons to authenticated;
grant select, insert, update, delete on public.studio_enquiries to authenticated;
grant all on public.workshop_addons to service_role;
grant all on public.gift_vouchers to service_role;
grant all on public.booking_addons to service_role;
grant all on public.studio_enquiries to service_role;

drop policy if exists workshop_addons_anon_read on public.workshop_addons;
create policy workshop_addons_anon_read
  on public.workshop_addons for select to anon
  using (active);

grant select (id, slug, name, description, price_myr, format_id, active, sort_order)
  on public.workshop_addons to anon;

commit;
