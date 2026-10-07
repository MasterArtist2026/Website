-- One-tap review for blog agent drafts: a private publish link for the
-- review email, and the functions the Telegram bot uses.
-- Run once in the Supabase SQL Editor, AFTER blog.sql and blog-agent.sql.
-- Safe to re-run.
begin;

create extension if not exists pgcrypto with schema extensions;

-- 1. One secret publish token per draft (not readable by the website)
create table if not exists private.blog_review_tokens (
  post_id    uuid primary key references public.blog_posts(id) on delete cascade,
  token      text not null,
  expires_at timestamptz not null
);
revoke all on table private.blog_review_tokens from public, anon, authenticated;

-- Every new draft gets a token, valid for 14 days
create or replace function private.blog_make_review_token()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if not new.published then
    insert into private.blog_review_tokens (post_id, token, expires_at)
    values (new.id, encode(extensions.gen_random_bytes(24), 'hex'), now() + interval '14 days')
    on conflict (post_id) do nothing;
  end if;
  return new;
end; $$;
drop trigger if exists blog_posts_review_token on public.blog_posts;
create trigger blog_posts_review_token after insert on public.blog_posts
  for each row execute function private.blog_make_review_token();

-- 2. The blog agent fetches its draft's token to put the link in the email
create or replace function public.blog_agent_review_token(p_secret text, p_slug text)
returns text language plpgsql stable security definer set search_path to 'public' as $$
declare v_token text;
begin
  if not private.blog_agent_ok(p_secret) then raise exception 'not allowed'; end if;
  select t.token into v_token
  from blog_posts b join private.blog_review_tokens t on t.post_id = b.id
  where b.slug = p_slug and not b.published and t.expires_at > now();
  if v_token is null then raise exception 'no review link for %', p_slug; end if;
  return v_token;
end; $$;

-- 3. The publish page (/publish.html) shows the title, then publishes.
--    Both need the draft's token; the token is used up on publishing.
create or replace function public.blog_review_info(p_slug text, p_token text)
returns table (title text, excerpt text, published boolean)
language sql stable security definer set search_path to 'public' as $$
  select b.title, b.excerpt, b.published
  from blog_posts b join private.blog_review_tokens t on t.post_id = b.id
  where b.slug = p_slug and t.token = p_token and t.expires_at > now();
$$;

create or replace function public.blog_publish_with_token(p_slug text, p_token text)
returns text language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid;
begin
  select b.id into v_id
  from blog_posts b join private.blog_review_tokens t on t.post_id = b.id
  where b.slug = p_slug and t.token = p_token and t.expires_at > now() and not b.published;
  if v_id is null then raise exception 'link expired or already used'; end if;
  update blog_posts set published = true where id = v_id;
  delete from private.blog_review_tokens where post_id = v_id;
  return p_slug;
end; $$;

-- 4. The Telegram bot (Edge Function, service role only) publishes by id
create or replace function public.blog_publish_by_id(p_id uuid)
returns text language plpgsql security definer set search_path to 'public' as $$
declare v_slug text;
begin
  update blog_posts set published = true where id = p_id and not published returning slug into v_slug;
  delete from private.blog_review_tokens where post_id = p_id;
  if v_slug is null then raise exception 'already published or not found'; end if;
  return v_slug;
end; $$;

-- 5. Who may call what
revoke all on function public.blog_agent_review_token(text, text) from public;
revoke all on function public.blog_review_info(text, text) from public;
revoke all on function public.blog_publish_with_token(text, text) from public;
revoke all on function public.blog_publish_by_id(uuid) from public, anon, authenticated;
grant execute on function public.blog_agent_review_token(text, text) to anon;
grant execute on function public.blog_review_info(text, text) to anon;
grant execute on function public.blog_publish_with_token(text, text) to anon;
grant execute on function public.blog_publish_by_id(uuid) to service_role;
revoke all on function private.blog_make_review_token() from public, anon, authenticated;

-- 6. Drafts saved before this file was run get a token too
insert into private.blog_review_tokens (post_id, token, expires_at)
select id, encode(extensions.gen_random_bytes(24), 'hex'), now() + interval '14 days'
from public.blog_posts where not published
on conflict (post_id) do nothing;

commit;
