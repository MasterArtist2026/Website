-- Studio Sessions booking schema for masterartist.co.
-- Project fudaosneozobacdalncv. Apply in the Supabase SQL editor AFTER review.
-- The site deploy does not run this file. Apply the seed migration next.
--
-- Public bookings are created only by the create-checkout Edge Function,
-- which calls public.hold_studio_booking as the service_role.
-- anon has no insert on bookings. Staff use the profiles / role_permissions
-- pattern (section studio_sessions), same as events.

begin;

create table public.workshop_formats (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  discipline text not null,
  summary text not null,
  you_make text not null,
  who_for text not null,
  audiences text[] not null default '{}',
  duration_minutes integer not null,
  price_myr numeric(10,2) not null,
  price_label text,
  unit text not null default 'pax',
  seats_per_unit integer not null default 1,
  capacity integer not null,
  room text not null,
  materials_note text,
  academy_upsell text,
  min_pax integer not null default 3,
  below_min_instructor_myr numeric(8,2) not null default 50,
  reschedule_fee_per_person_myr numeric(8,2) not null default 10,
  live_from date,
  page_path text not null,
  image_path text,
  bookable boolean not null default true,
  requires_child boolean not null default false,
  listed boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  updated_by uuid references public.profiles (id),
  constraint workshop_formats_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint workshop_formats_duration_check check (duration_minutes between 30 and 360),
  constraint workshop_formats_price_check check (price_myr >= 0),
  constraint workshop_formats_unit_check check (unit in ('pax', 'pair')),
  constraint workshop_formats_seats_check check (seats_per_unit in (1, 2)),
  constraint workshop_formats_capacity_check check (capacity between 1 and 30),
  constraint workshop_formats_min_pax_check check (min_pax between 1 and 30),
  constraint workshop_formats_audiences_check check (
    audiences <@ array['couples','friends','women','families','kids','adults','teams','creators','everyone']::text[]
  )
);

comment on table public.workshop_formats is
  'Catalogue of Studio Session formats. Prices and caps come from the launch catalogue.';

create table public.workshop_sessions (
  id uuid primary key default gen_random_uuid(),
  format_id uuid not null references public.workshop_formats (id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  room text not null,
  capacity integer not null,
  price_myr numeric(10,2) not null,
  public_holiday boolean not null default false,
  status text not null default 'draft',
  promo_label text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  updated_by uuid references public.profiles (id),
  constraint workshop_sessions_time_check check (ends_at > starts_at),
  constraint workshop_sessions_capacity_check check (capacity between 1 and 30),
  constraint workshop_sessions_price_check check (price_myr >= 0),
  constraint workshop_sessions_status_check check (status in ('draft', 'published', 'cancelled', 'completed')),
  constraint workshop_sessions_room_check check (char_length(btrim(room)) between 1 and 80)
);

comment on table public.workshop_sessions is
  'One dated run of a format. starts_at/ends_at are timestamptz; the studio clock is Asia/Kuala_Lumpur. Seeded rows stay draft until staff publish them.';

create index workshop_sessions_starts_idx
  on public.workshop_sessions (starts_at)
  where status = 'published';

create index workshop_sessions_format_starts_idx
  on public.workshop_sessions (format_id, starts_at);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  public_code text not null unique,
  public_token uuid not null default gen_random_uuid() unique,
  session_id uuid not null references public.workshop_sessions (id),
  booker_name text not null,
  phone text not null,
  email text not null,
  qty integer not null,
  people integer not null,
  child_name text,
  child_age text,
  amount_myr numeric(10,2) not null,
  currency text not null default 'MYR',
  status text not null default 'pending',
  payment_ref text,
  payment_mode text not null,
  hold_expires_at timestamptz,
  voucher_code text unique,
  voucher_credits integer not null default 0,
  attended boolean not null default false,
  attended_at timestamptz,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  gclid text,
  fbclid text,
  ref_code text not null,
  landing_page text,
  referrer text,
  rescheduled_from uuid references public.bookings (id) on delete set null,
  reschedule_fee_myr numeric(10,2) not null default 0,
  needs_refund boolean not null default false,
  booked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  updated_by uuid references public.profiles (id),
  constraint bookings_name_len check (char_length(btrim(booker_name)) between 1 and 120),
  constraint bookings_phone_format check (phone ~ '^[0-9+(). -]{8,40}$'),
  constraint bookings_email_format check (
    char_length(email) <= 320 and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  constraint bookings_qty_check check (qty between 1 and 20),
  constraint bookings_people_check check (people between 1 and 40),
  constraint bookings_amount_check check (amount_myr >= 0),
  constraint bookings_currency_check check (currency = 'MYR'),
  constraint bookings_status_check check (status in ('pending', 'paid', 'cancelled', 'rescheduled')),
  constraint bookings_payment_mode_check check (payment_mode in ('stripe', 'whatsapp')),
  constraint bookings_ref_code_check check (ref_code in ('FB', 'GG', 'WEB')),
  constraint bookings_child_name_len check (child_name is null or char_length(btrim(child_name)) between 1 and 120),
  constraint bookings_child_age_len check (child_age is null or char_length(child_age) between 1 and 40),
  constraint bookings_utm_source_len check (utm_source is null or char_length(utm_source) <= 200),
  constraint bookings_utm_medium_len check (utm_medium is null or char_length(utm_medium) <= 200),
  constraint bookings_utm_campaign_len check (utm_campaign is null or char_length(utm_campaign) <= 200),
  constraint bookings_utm_term_len check (utm_term is null or char_length(utm_term) <= 200),
  constraint bookings_utm_content_len check (utm_content is null or char_length(utm_content) <= 200),
  constraint bookings_gclid_len check (gclid is null or char_length(gclid) <= 200),
  constraint bookings_fbclid_len check (fbclid is null or char_length(fbclid) <= 200),
  constraint bookings_landing_page_len check (landing_page is null or char_length(landing_page) <= 500),
  constraint bookings_referrer_len check (referrer is null or char_length(referrer) <= 500)
);

comment on table public.bookings is
  'Studio Session bookings. anon cannot insert. Pending Stripe holds last 15 minutes. A pending WhatsApp reservation holds a seat for 24 hours. Paid and unexpired pending rows count toward capacity.';

create index bookings_session_holding_idx
  on public.bookings (session_id)
  where status in ('pending', 'paid');

create index bookings_hold_expiry_idx
  on public.bookings (hold_expires_at)
  where status = 'pending' and hold_expires_at is not null;

create index bookings_payment_ref_idx
  on public.bookings (payment_ref)
  where payment_ref is not null;

-- ---------------------------------------------------------------------------
-- Helpers live in private so they are not part of the public Data API.
-- ---------------------------------------------------------------------------

create or replace function private.studio_unit_price(p_price numeric, p_holiday boolean)
returns numeric
language sql
immutable
set search_path = public
as $$
  select case
    when coalesce(p_holiday, false) then round(p_price * 1.10, 2)
    else p_price
  end;
$$;

comment on function private.studio_unit_price(numeric, boolean) is
  'Catalogue price, plus the 10% public-holiday surcharge when the session is flagged.';

create or replace function private.mint_code(p_prefix text, p_len integer)
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  raw text;
  out text := '';
  i integer;
begin
  raw := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  for i in 1..p_len loop
    out := out || substr(alphabet, (get_byte(decode(substr(raw, i * 2 - 1, 2), 'hex'), 0) % length(alphabet)) + 1, 1);
  end loop;
  return p_prefix || out;
end;
$$;

create or replace function private.session_units_held(p_session uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  published boolean;
begin
  select status = 'published' into published
  from public.workshop_sessions
  where id = p_session;

  if coalesce(published, false) is false and coalesce(private.may_read('studio_sessions'), false) is false then
    return 0;
  end if;

  return coalesce((
    select sum(qty)::integer
    from public.bookings
    where session_id = p_session
      and (
        status = 'paid'
        or (
          status = 'pending'
          and (hold_expires_at is null or hold_expires_at > now())
        )
      )
  ), 0);
end;
$$;

comment on function private.session_units_held(uuid) is
  'Units held by paid bookings and pending holds that have not expired. Draft sessions return 0 to anon.';

create or replace function private.release_expired_holds()
returns integer
language plpgsql
volatile
security definer
set search_path = public
set row_security = off
as $$
declare
  n integer;
begin
  update public.bookings
     set status = 'cancelled'
   where status = 'pending'
     and hold_expires_at is not null
     and hold_expires_at <= now();
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function private.prepare_booking()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  seats integer;
  code text;
  tries integer := 0;
begin
  select f.seats_per_unit into seats
  from public.workshop_sessions s
  join public.workshop_formats f on f.id = s.format_id
  where s.id = new.session_id;

  if seats is null then
    raise exception 'missing_session';
  end if;

  new.people := new.qty * seats;
  new.voucher_credits := new.people;

  if new.public_code is null then
    loop
      tries := tries + 1;
      code := private.mint_code('SS-', 6);
      exit when not exists (select 1 from public.bookings where public_code = code);
      if tries > 8 then
        raise exception 'could not mint booking code';
      end if;
    end loop;
    new.public_code := code;
  end if;

  if tg_op = 'INSERT' and new.payment_mode = 'whatsapp' and new.voucher_code is null then
    tries := 0;
    loop
      tries := tries + 1;
      code := private.mint_code('MA50-', 8);
      exit when not exists (select 1 from public.bookings where voucher_code = code);
      if tries > 8 then
        raise exception 'could not mint voucher';
      end if;
    end loop;
    new.voucher_code := code;
  end if;

  if tg_op = 'UPDATE' and new.status = 'paid' and old.status is distinct from 'paid' then
    new.hold_expires_at := null;
    if new.voucher_code is null then
      tries := 0;
      loop
        tries := tries + 1;
        code := private.mint_code('MA50-', 8);
        exit when not exists (select 1 from public.bookings where voucher_code = code);
        if tries > 8 then
          raise exception 'could not mint voucher';
        end if;
      end loop;
      new.voucher_code := code;
    end if;
  end if;

  if tg_op = 'UPDATE' and new.attended and not old.attended then
    new.attended_at := now();
  elsif tg_op = 'UPDATE' and not new.attended and old.attended then
    new.attended_at := null;
  end if;

  return new;
end;
$$;

create or replace function private.guard_booking_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  sess public.workshop_sessions%rowtype;
  held integer;
begin
  if tg_op = 'UPDATE'
     and new.session_id is not distinct from old.session_id
     and new.qty is not distinct from old.qty
     and new.status is not distinct from old.status
     and new.hold_expires_at is not distinct from old.hold_expires_at
  then
    return new;
  end if;

  if new.status not in ('pending', 'paid') then
    return new;
  end if;

  select * into sess
  from public.workshop_sessions
  where id = new.session_id
  for update;

  if not found then
    raise exception 'missing_session';
  end if;

  if sess.status in ('cancelled', 'completed') then
    raise exception 'session_closed';
  end if;

  select coalesce(sum(qty), 0) into held
  from public.bookings
  where session_id = new.session_id
    and id is distinct from new.id
    and (
      status = 'paid'
      or (
        status = 'pending'
        and (hold_expires_at is null or hold_expires_at > now())
      )
    );

  if held + new.qty > sess.capacity then
    raise exception 'sold_out';
  end if;

  return new;
end;
$$;

comment on function private.guard_booking_capacity() is
  'Serialises bookings on the session row and rejects a hold that would pass capacity.';

create trigger bookings_a_prepare
  before insert or update on public.bookings
  for each row execute function private.prepare_booking();

create trigger bookings_b_capacity
  before insert or update on public.bookings
  for each row execute function private.guard_booking_capacity();

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
  v_hold timestamptz;
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
  if v_mode = 'stripe' then
    v_hold := now() + interval '15 minutes';
  else
    v_hold := now() + interval '24 hours';
  end if;

  insert into public.bookings (
    session_id, booker_name, phone, email, qty, child_name, child_age,
    amount_myr, currency, status, payment_mode, hold_expires_at,
    utm_source, utm_medium, utm_campaign, utm_term, utm_content,
    gclid, fbclid, ref_code, landing_page, referrer
  ) values (
    sess.id, v_name, v_phone, v_email, v_qty, v_child, v_age,
    v_amount, 'MYR', 'pending', v_mode, v_hold,
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

  return jsonb_build_object(
    'booking_id', created.id,
    'public_code', created.public_code,
    'public_token', created.public_token,
    'amount_myr', created.amount_myr,
    'amount_sen', (created.amount_myr * 100)::integer,
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

create or replace function private.settle_studio_payment(p_booking uuid, p_payment_ref text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
set row_security = off
as $$
declare
  b public.bookings%rowtype;
begin
  select * into b from public.bookings where id = p_booking for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'missing');
  end if;
  if b.status = 'paid' then
    return jsonb_build_object('ok', true, 'already', true, 'voucher_code', b.voucher_code);
  end if;
  if b.payment_ref is not null and p_payment_ref is not null and b.payment_ref <> p_payment_ref then
    return jsonb_build_object('ok', false, 'error', 'ref_mismatch');
  end if;

  begin
    update public.bookings
       set status = 'paid',
           payment_ref = coalesce(p_payment_ref, payment_ref)
     where id = p_booking
     returning * into b;
    return jsonb_build_object('ok', true, 'voucher_code', b.voucher_code, 'status', b.status);
  exception
    when others then
      if sqlerrm in ('sold_out', 'session_closed') then
        update public.bookings
           set status = 'cancelled',
               needs_refund = true,
               payment_ref = coalesce(p_payment_ref, payment_ref)
         where id = p_booking;
        return jsonb_build_object('ok', false, 'needs_refund', true);
      end if;
      raise;
  end;
end;
$$;

create or replace function private.reschedule_booking(p_booking uuid, p_session uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
set row_security = off
as $$
declare
  b public.bookings%rowtype;
  src public.workshop_sessions%rowtype;
  dest public.workshop_sessions%rowtype;
  fmt public.workshop_formats%rowtype;
  fee numeric(10,2);
  created public.bookings%rowtype;
  kept_code text;
  kept_voucher text;
begin
  if coalesce(private.may_write('studio_sessions'), false) is false then
    raise exception 'not allowed';
  end if;

  select * into b from public.bookings where id = p_booking for update;
  if not found then
    raise exception 'missing_booking';
  end if;
  if b.status not in ('pending', 'paid') then
    raise exception 'not_active';
  end if;
  if b.session_id = p_session then
    raise exception 'same_session';
  end if;

  perform 1
  from public.workshop_sessions
  where id in (b.session_id, p_session)
  order by id
  for update;

  select * into src from public.workshop_sessions where id = b.session_id;
  select * into dest from public.workshop_sessions where id = p_session;
  if not found then
    raise exception 'missing_session';
  end if;
  if dest.format_id is distinct from src.format_id then
    raise exception 'different_format';
  end if;
  if dest.status <> 'published' or dest.starts_at <= now() then
    raise exception 'session_closed';
  end if;

  select * into fmt from public.workshop_formats where id = dest.format_id;
  if b.booked_at + interval '24 hours' >= now() then
    fee := 0;
  else
    fee := round(fmt.reschedule_fee_per_person_myr * b.people, 2);
  end if;

  kept_code := b.public_code;
  kept_voucher := b.voucher_code;

  update public.bookings
     set status = 'rescheduled',
         voucher_code = null,
         public_code = public_code || '-R-' || replace(id::text, '-', '')
   where id = b.id;

  insert into public.bookings (
    public_code, session_id, booker_name, phone, email, qty, child_name, child_age,
    amount_myr, currency, status, payment_ref, payment_mode, hold_expires_at,
    voucher_code, utm_source, utm_medium, utm_campaign, utm_term, utm_content,
    gclid, fbclid, ref_code, landing_page, referrer,
    rescheduled_from, reschedule_fee_myr, booked_at
  ) values (
    kept_code, dest.id, b.booker_name, b.phone, b.email, b.qty, b.child_name, b.child_age,
    b.amount_myr, b.currency, b.status, b.payment_ref, b.payment_mode,
    case when b.status = 'pending' then b.hold_expires_at else null end,
    kept_voucher,
    b.utm_source, b.utm_medium, b.utm_campaign, b.utm_term, b.utm_content,
    b.gclid, b.fbclid, b.ref_code, b.landing_page, b.referrer,
    b.id, fee, b.booked_at
  )
  returning * into created;

  return jsonb_build_object(
    'booking_id', created.id,
    'public_code', created.public_code,
    'public_token', created.public_token,
    'status', created.status,
    'reschedule_fee_myr', fee,
    'session_id', created.session_id
  );
end;
$$;

-- Public wrappers. These are security invoker: the private function does the work
-- and is not exposed by the Data API. Hold and settle accept only service_role.
create or replace function public.hold_studio_booking(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user is distinct from 'service_role' then
    raise exception 'not allowed';
  end if;
  return private.create_booking_hold(payload);
end;
$$;

create or replace function public.settle_studio_payment(p_booking uuid, p_payment_ref text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user is distinct from 'service_role' then
    raise exception 'not allowed';
  end if;
  return private.settle_studio_payment(p_booking, p_payment_ref);
end;
$$;

create or replace function public.release_expired_studio_holds()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user is distinct from 'service_role' then
    raise exception 'not allowed';
  end if;
  return private.release_expired_holds();
end;
$$;

create or replace function public.reschedule_studio_booking(p_booking uuid, p_session uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
begin
  if coalesce(private.may_write('studio_sessions'), false) is false then
    raise exception 'not allowed';
  end if;
  return private.reschedule_booking(p_booking, p_session);
end;
$$;

revoke all on function public.hold_studio_booking(jsonb) from public, anon, authenticated;
revoke all on function public.settle_studio_payment(uuid, text) from public, anon, authenticated;
revoke all on function public.release_expired_studio_holds() from public, anon, authenticated;
revoke all on function public.reschedule_studio_booking(uuid, uuid) from public, anon;
revoke all on function private.studio_unit_price(numeric, boolean) from public;
revoke all on function private.mint_code(text, integer) from public;
revoke all on function private.session_units_held(uuid) from public;
revoke all on function private.release_expired_holds() from public;
revoke all on function private.prepare_booking() from public;
revoke all on function private.guard_booking_capacity() from public;
revoke all on function private.create_booking_hold(jsonb) from public;
revoke all on function private.settle_studio_payment(uuid, text) from public;
revoke all on function private.reschedule_booking(uuid, uuid) from public;

grant execute on function public.hold_studio_booking(jsonb) to service_role;
grant execute on function public.settle_studio_payment(uuid, text) to service_role;
grant execute on function public.release_expired_studio_holds() to service_role;
grant execute on function public.reschedule_studio_booking(uuid, uuid) to authenticated;
grant execute on function private.create_booking_hold(jsonb) to service_role;
grant execute on function private.settle_studio_payment(uuid, text) to service_role;
grant execute on function private.release_expired_holds() to service_role;
grant execute on function private.reschedule_booking(uuid, uuid) to authenticated;
grant execute on function private.session_units_held(uuid) to anon, authenticated, service_role;
grant execute on function private.studio_unit_price(numeric, boolean) to anon, authenticated, service_role;
grant usage on schema private to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS. Staff policies come from the shared section helper. anon reads the
-- seats view, not the bookings table.
-- ---------------------------------------------------------------------------

alter table public.workshop_formats enable row level security;
alter table public.workshop_formats force row level security;
alter table public.workshop_sessions enable row level security;
alter table public.workshop_sessions force row level security;
alter table public.bookings enable row level security;
alter table public.bookings force row level security;

select private.reapply_section_rls('workshop_formats', 'studio_sessions');
select private.reapply_section_rls('workshop_sessions', 'studio_sessions');
select private.reapply_section_rls('bookings', 'studio_sessions');

drop policy if exists workshop_formats_anon_read on public.workshop_formats;
create policy workshop_formats_anon_read
  on public.workshop_formats
  for select
  to anon
  using (listed);

drop policy if exists workshop_sessions_anon_read on public.workshop_sessions;
create policy workshop_sessions_anon_read
  on public.workshop_sessions
  for select
  to anon
  using (status = 'published');

revoke all on public.workshop_formats from public, anon, authenticated;
revoke all on public.workshop_sessions from public, anon, authenticated;
revoke all on public.bookings from public, anon, authenticated;

grant select, insert, update, delete on public.workshop_formats to authenticated;
grant select, insert, update, delete on public.workshop_sessions to authenticated;
grant select, insert, update, delete on public.bookings to authenticated;
grant all on public.workshop_formats to service_role;
grant all on public.workshop_sessions to service_role;
grant all on public.bookings to service_role;

grant select (
  id, slug, name, discipline, summary, you_make, who_for, audiences,
  duration_minutes, price_myr, price_label, unit, seats_per_unit, capacity,
  room, min_pax, page_path, image_path, bookable, requires_child, listed
) on public.workshop_formats to anon;

grant select (
  id, format_id, starts_at, ends_at, room, capacity, price_myr,
  public_holiday, promo_label, status
) on public.workshop_sessions to anon;

create or replace view public.workshop_seats_left
with (security_invoker = true, security_barrier = true) as
select
  s.id,
  s.format_id,
  f.slug,
  f.name,
  f.discipline,
  f.summary,
  f.audiences,
  f.duration_minutes,
  f.unit,
  f.seats_per_unit,
  f.requires_child,
  f.bookable,
  f.page_path,
  f.image_path,
  f.min_pax,
  f.price_label,
  s.starts_at,
  s.ends_at,
  (s.starts_at at time zone 'Asia/Kuala_Lumpur')::date as session_date,
  case
    when (s.starts_at at time zone 'Asia/Kuala_Lumpur')::time < time '12:30' then 'morning'
    when (s.starts_at at time zone 'Asia/Kuala_Lumpur')::time < time '18:00' then 'afternoon'
    else 'evening'
  end as time_band,
  s.room,
  s.capacity,
  s.price_myr,
  private.studio_unit_price(s.price_myr, s.public_holiday) as unit_price_myr,
  s.public_holiday,
  s.promo_label,
  greatest(s.capacity - private.session_units_held(s.id), 0) as seats_left
from public.workshop_sessions s
join public.workshop_formats f on f.id = s.format_id
where s.status = 'published'
  and f.listed
  and s.ends_at > now();

comment on view public.workshop_seats_left is
  'Published sessions with seats left. Pending holds that have expired do not count. security_invoker so RLS still applies; seat totals come from a private definer function because anon cannot read bookings.';

revoke all on public.workshop_seats_left from public, anon, authenticated, service_role;
grant select on public.workshop_seats_left to anon, authenticated, service_role;

insert into public.role_permissions (role, section, can_read, can_write)
select r::user_role, 'studio_sessions', true, true
from unnest(array['admin', 'marketing']) as r
where not exists (
  select 1 from public.role_permissions p
  where p.role = r::user_role and p.section = 'studio_sessions'
);

commit;
