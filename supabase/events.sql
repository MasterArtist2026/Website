-- Events calendar: admin-managed events shown on the homepage "What's on"
-- calendar and the Workshops page. Run once in the Supabase SQL Editor.
begin;

create table if not exists public.events (
  id           uuid primary key default gen_random_uuid(),
  event_date   date not null,
  start_time   time not null,
  end_time     time,
  title        text not null,
  category     text not null default 'Workshop' check (category in ('Workshop', 'Performance', 'Event')),
  kind         text,                       -- e.g. Painting, Baking, Cooking (shown as "Painting workshop")
  description  text,
  allow_reserve boolean not null default true,
  visible      boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz,
  updated_by   uuid
);
alter table public.events enable row level security;

-- Same staff permissions + audit trail as the other content sections
select private.reapply_section_rls('events', 'events');
insert into public.role_permissions (role, section, can_read, can_write)
select r::user_role, 'events', true, true
from unnest(array['admin', 'marketing']) as r
where not exists (select 1 from public.role_permissions p where p.role = r::user_role and p.section = 'events');

-- Public, read-only view: visible events from yesterday onwards
create or replace view public.events_public as
  select id, event_date, start_time, end_time, title, category, kind, description, allow_reserve
  from public.events
  where visible and event_date >= current_date - 1
  order by event_date, start_time;

-- Revoke AFTER creating the view (Supabase grants full rights by default)
revoke all on public.events from anon;
revoke all on public.events_public from anon, authenticated;
grant select on public.events_public to anon, authenticated;

-- The October 2026 workshops already on the website
insert into public.events (event_date, start_time, end_time, title, category, kind, description)
select * from (values
  (date '2026-10-04', time '15:00', time '17:00', 'Textured canvas painting', 'Workshop', 'Painting', 'Build up texture on canvas with paint and mixed media — a relaxed, hands-on painting workshop for all ages.'),
  (date '2026-10-11', time '15:00', time '17:00', 'Plant-based cooking class', 'Workshop', 'Cooking', 'Cook simple, delicious plant-based dishes from scratch — a hands-on cooking workshop for all ages.'),
  (date '2026-10-18', time '15:00', time '17:00', 'Painting on canvas — lemon theme (Sip & Paint)', 'Workshop', 'Painting', 'A guided Sip & Paint session painting a lemon-themed canvas — no experience needed.'),
  (date '2026-10-25', time '15:00', time '17:00', 'Sourdough', 'Workshop', 'Baking', 'Learn the basics of sourdough bread and bake your own to take home.')
) v(event_date, start_time, end_time, title, category, kind, description)
where not exists (select 1 from public.events);

commit;

-- Check: should list 4 events, and anon/authenticated should have SELECT only
select event_date, start_time, title from public.events_public;
select grantee, string_agg(privilege_type, ', ') from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'events_public' and grantee in ('anon', 'authenticated') group by 1;
