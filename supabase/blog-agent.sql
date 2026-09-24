-- Lets the scheduled Claude blog agent save DRAFT posts without the master
-- (service_role) key. Run once in the Supabase SQL Editor, AFTER blog.sql.
-- The agent's password lives only on the owner's Mac; only its SHA-256
-- fingerprint is stored here. Drafts are never published by this function.
begin;

create extension if not exists pgcrypto with schema extensions;

-- 1. Where the password fingerprint is kept (not readable by the website)
create table if not exists private.blog_agent (
  id int primary key default 1 check (id = 1),
  secret_sha256 text not null
);
insert into private.blog_agent (id, secret_sha256)
values (1, 'fb755a6e92bebb34d8d4e817f45a1bc4b388d416c57d57209a03bba6f18895a8')
on conflict (id) do update set secret_sha256 = excluded.secret_sha256;

create or replace function private.blog_agent_ok(p_secret text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from private.blog_agent
                 where secret_sha256 = encode(extensions.digest(coalesce(p_secret, ''), 'sha256'), 'hex'));
$$;

-- 2. List every post (drafts included) so the agent never repeats a topic
create or replace function public.blog_agent_list(p_secret text)
returns table (slug text, title text, tags text[], published boolean, created_at timestamptz)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not private.blog_agent_ok(p_secret) then raise exception 'not allowed'; end if;
  return query select b.slug, b.title, b.tags, b.published, b.created_at from blog_posts b order by b.created_at desc;
end; $$;

-- 3. Save a new DRAFT (always unpublished; max 3 per day)
create or replace function public.blog_agent_submit(p_secret text, p_post jsonb)
returns text language plpgsql security definer set search_path to 'public' as $$
declare v_slug text := p_post->>'slug';
begin
  if not private.blog_agent_ok(p_secret) then raise exception 'not allowed'; end if;
  if (select count(*) from blog_posts where created_at > now() - interval '1 day' and author = 'Master Artist') >= 3 then
    raise exception 'daily draft limit reached';
  end if;
  if exists (select 1 from blog_posts where slug = v_slug) then raise exception 'slug already exists: %', v_slug; end if;
  insert into blog_posts (slug, title, excerpt, body_html, cover_image, cover_alt, author, tags, seo_description, published, published_at)
  values (v_slug, p_post->>'title', p_post->>'excerpt', p_post->>'body_html', p_post->>'cover_image', p_post->>'cover_alt',
          'Master Artist',
          coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p_post->'tags', '[]'::jsonb)) x), '{}'),
          p_post->>'seo_description', false, null);
  return v_slug;
end; $$;

-- 4. Only these two functions are callable from outside
revoke all on function public.blog_agent_list(text) from public;
revoke all on function public.blog_agent_submit(text, jsonb) from public;
grant execute on function public.blog_agent_list(text) to anon;
grant execute on function public.blog_agent_submit(text, jsonb) to anon;
revoke all on function private.blog_agent_ok(text) from public, anon, authenticated;
revoke all on table private.blog_agent from public, anon, authenticated;

commit;
