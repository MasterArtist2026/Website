-- Trial enquiries from the public website.
-- Not applied by the site deploy. Run this in the Supabase SQL editor
-- (project fudaosneozobacdalncv) when you are ready to store leads.
-- Until then the form reports a save error and does not count a conversion.
--
-- anon may INSERT a new row and nothing else. There is no SELECT, UPDATE or
-- DELETE policy, so the publishable key cannot read or change leads.
-- Staff read the table in the Supabase dashboard (a role that bypasses RLS).

begin;

create table if not exists public.trial_leads (
  id              bigint generated always as identity primary key,
  created_at      timestamptz not null default now(),
  parent_name     text not null,
  phone           text not null,
  email           text,
  child_age       text,
  programme_slug  text,
  message         text,
  ref_code        text not null,
  utm_source      text,
  utm_medium      text,
  utm_campaign    text,
  utm_term        text,
  utm_content     text,
  gclid           text,
  fbclid          text,
  landing_page    text,
  referrer        text,
  status          text not null default 'new',
  constraint trial_leads_parent_name_len check (char_length(btrim(parent_name)) between 1 and 120),
  constraint trial_leads_phone_format check (phone ~ '^[0-9+(). -]{8,40}$'),
  constraint trial_leads_email_format check (
    email is null or (char_length(email) <= 320 and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
  ),
  constraint trial_leads_child_age_len check (child_age is null or char_length(child_age) between 1 and 40),
  constraint trial_leads_programme_slug_format check (
    programme_slug is null or programme_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  constraint trial_leads_message_len check (message is null or char_length(message) between 1 and 4000),
  constraint trial_leads_ref_code_check check (ref_code in ('FB', 'GG', 'WEB')),
  constraint trial_leads_status_check check (status in ('new', 'contacted', 'enrolled', 'closed')),
  constraint trial_leads_utm_source_len check (utm_source is null or char_length(utm_source) <= 200),
  constraint trial_leads_utm_medium_len check (utm_medium is null or char_length(utm_medium) <= 200),
  constraint trial_leads_utm_campaign_len check (utm_campaign is null or char_length(utm_campaign) <= 200),
  constraint trial_leads_utm_term_len check (utm_term is null or char_length(utm_term) <= 200),
  constraint trial_leads_utm_content_len check (utm_content is null or char_length(utm_content) <= 200),
  constraint trial_leads_gclid_len check (gclid is null or char_length(gclid) <= 200),
  constraint trial_leads_fbclid_len check (fbclid is null or char_length(fbclid) <= 200),
  constraint trial_leads_landing_page_len check (landing_page is null or char_length(landing_page) <= 500),
  constraint trial_leads_referrer_len check (referrer is null or char_length(referrer) <= 500)
);

comment on table public.trial_leads is
  'Public trial-form enquiries. anon can insert only; status defaults to new.';

create index if not exists trial_leads_status_created_at_idx
  on public.trial_leads (status, created_at desc);

alter table public.trial_leads enable row level security;
alter table public.trial_leads force row level security;

revoke all on public.trial_leads from public, anon, authenticated;

-- Column list omits id, created_at and status so a visitor cannot set them.
grant insert (
  parent_name,
  phone,
  email,
  child_age,
  programme_slug,
  message,
  ref_code,
  utm_source,
  utm_medium,
  utm_campaign,
  utm_term,
  utm_content,
  gclid,
  fbclid,
  landing_page,
  referrer
) on public.trial_leads to anon;

drop policy if exists trial_leads_anon_insert on public.trial_leads;
create policy trial_leads_anon_insert
  on public.trial_leads
  for insert
  to anon
  with check (
    status = 'new'
    and ref_code in ('FB', 'GG', 'WEB')
  );

commit;
