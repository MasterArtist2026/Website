-- Master Artist — blog posts table, public view and permissions.
-- Run once in the Supabase SQL Editor. Safe to re-run.
begin;

-- 1. Table the AI automation writes to
create table if not exists public.blog_posts (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title           text not null,
  excerpt         text,
  body_html       text not null,
  cover_image     text,
  cover_alt       text,
  author          text not null default 'Master Artist',
  tags            text[] not null default '{}',
  seo_description text,
  published       boolean not null default false,
  published_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz,
  updated_by      uuid
);
alter table public.blog_posts enable row level security;

-- 2. Same staff policies + audit trail as every other content table
--    (read/write requires an active staff role with the 'blog' permission)
select private.reapply_section_rls('blog_posts', 'blog');

-- 3. Stamp published_at automatically when a post is published
create or replace function private.blog_set_published_at()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if new.published and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end; $$;
drop trigger if exists blog_posts_published_at on public.blog_posts;
create trigger blog_posts_published_at before insert or update on public.blog_posts
  for each row execute function private.blog_set_published_at();

-- 4. Let admin and marketing roles manage the blog in future admin tools
insert into public.role_permissions (role, section, can_read, can_write)
select r::user_role, 'blog', true, true
from unnest(array['admin', 'marketing']) as r
where not exists (select 1 from public.role_permissions p where p.role = r::user_role and p.section = 'blog');

-- 5. Public, read-only view the website reads from (published posts only)
create or replace view public.blog_public as
  select slug, title, excerpt, body_html, cover_image, cover_alt, author, tags,
         seo_description, published_at, updated_at
  from public.blog_posts
  where published and published_at is not null and published_at <= now();

-- 6. Permissions — revoke AFTER creating the view (Supabase grants full
--    rights on every new table/view by default)
revoke all on public.blog_posts  from anon;
revoke all on public.blog_public from anon, authenticated;
grant select on public.blog_public to anon, authenticated;

commit;

-- Check: both rows should show only SELECT
select table_name, grantee, string_agg(privilege_type, ', ') as privileges
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'blog_public' and grantee in ('anon', 'authenticated')
group by 1, 2;
