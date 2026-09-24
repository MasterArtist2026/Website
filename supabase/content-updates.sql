-- Brings the admin-panel content in line with the current programmes.
-- Run once in the Supabase SQL Editor. Safe to re-run.

-- Homepage hero text (shown at the top of the homepage)
update hero
set lede = 'Music, art, culinary, videography and photography — taught in small classes by working creatives. One studio, five ways for your child to find their thing.'
where id = 1;

-- Opening hours (shown on Visit, in the footer and the FAQ)
update site_settings
set opening_hours = 'Sun–Thu 10:30am–7pm · Fri 10:30am–4pm · Closed Saturdays'
where id = 1;

-- Graphic Design (10+) and Videography (12+) are running
update programmes set cta_label = 'Explore', age_range = 'Ages 10+' where slug = 'graphic-design';
update programmes set cta_label = 'Explore', age_range = 'Ages 12+' where slug = 'videography';

-- Photography (ages 12+), so photos and classes can be tagged with it
insert into programmes (slug, name, age_range, blurb, cta_label, visible, sort_order)
select 'photography', 'Photography', 'Ages 12+',
       'From how a camera works to light, composition and the edit — taught by photographer Alden.',
       'Explore', true, 6
where not exists (select 1 from programmes where slug = 'photography');
update programmes set age_range = 'Ages 12+' where slug = 'photography';

select slug, name, age_range, cta_label from programmes order by sort_order;
