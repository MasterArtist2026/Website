-- Brings the admin-panel content in line with the September 2026 programmes.
-- Run once in the Supabase SQL Editor. Safe to re-run.

-- Homepage hero text (shown at the top of the homepage)
update hero
set lede = 'Music, art, design, photography, film and baking — taught in small classes by working creatives. One studio, many ways for your child to find their thing.'
where id = 1;

-- Graphic Design and Videography are now running; Graphic Design is 10+
update programmes set cta_label = 'Explore', age_range = 'Ages 10+'
where slug in ('graphic-design', 'videography');

-- Photography, so photos and classes can be tagged with it in the admin panel
insert into programmes (slug, name, age_range, blurb, cta_label, visible, sort_order)
select 'photography', 'Photography', 'Children & adults',
       'From how a camera works to light, composition and the edit — taught by photographer Alden.',
       'Explore', true, 6
where not exists (select 1 from programmes where slug = 'photography');

select slug, name, age_range, cta_label from programmes order by sort_order;
