-- Adds the 19 class photos already used on the Music, Art and Workshops pages
-- to the Gallery, tagged by programme, and tags the 4 untagged gallery photos.
-- ONLY RUN THIS IF written parental consent is on file for every child who can
-- be identified in these photos (see Privacy Policy → Photographs of children).
-- Safe to re-run: photos already in the gallery are skipped.
begin;

with p as (
  select
    (select id from programmes where slug = 'music') as music,
    (select id from programmes where slug = 'art')   as art,
    (select id from programmes where slug = 'baking') as workshops
),
photos(image_path, caption, prog, sort_order) as (values
  ('vocal-singing.jpg',      'Sabrina Hew performing on stage',              'music',     10),
  ('vocal-teaching-1.jpg',   'A one-on-one vocal lesson',                    'music',     11),
  ('vocal-teaching-2.jpg',   'Vocal students rehearsing together',           'music',     12),
  ('piano-photo.jpg',        'The studio piano',                             'music',     13),
  ('art-photo-1.jpg',        'Students showing their finished paintings',    'art',       20),
  ('art-photo-2.jpg',        'Painting in art class',                        'art',       21),
  ('art-photo-3.jpg',        'Working on a painting together',               'art',       22),
  ('art-photo-4.jpg',        'Trying a vegetable stamp technique',           'art',       23),
  ('baking-1.jpg',           'Baking together at a workshop',                'workshops', 30),
  ('baking-2.jpg',           'Freshly baked banana bread',                   'workshops', 31),
  ('baking-3.jpg',           'Mixing the batter',                            'workshops', 32),
  ('painting-1.jpg',         'Watercolour circles at a painting workshop',   'workshops', 33),
  ('painting-2.jpg',         'A teacher guiding a watercolour painting',     'workshops', 34),
  ('painting-3.jpg',         'Close-up of a watercolour design',             'workshops', 35),
  ('painting-4.jpg',         'Painting together at a workshop',              'workshops', 36),
  ('craft-mirror.jpg',       'A hand-decorated mirror',                      'workshops', 37),
  ('craft-jars.jpg',         'Painted jars from a craft session',            'workshops', 38),
  ('craft-1.jpg',            'Making miniature figures',                     'workshops', 39),
  ('craft-2.jpg',            'A hands-on craft session',                     'workshops', 40)
)
insert into gallery_items (image_path, caption, programme_id, consent_on_file, consent_note, sort_order)
select ph.image_path, ph.caption,
       case ph.prog when 'music' then p.music when 'art' then p.art else p.workshops end,
       true, 'Existing website photo — consent confirmed by owner', ph.sort_order
from photos ph cross join p
where not exists (select 1 from gallery_items g where g.image_path = ph.image_path);

-- Tag the existing untagged photos so gallery filters work
update gallery_items set programme_id = (select id from programmes where slug = 'music')
  where programme_id is null and caption in ('Solo recital performance', 'Choir rehearsal', 'One-on-one vocal coaching');
update gallery_items set programme_id = (select id from programmes where slug = 'art')
  where programme_id is null and caption = 'Watercolour painting in progress';

commit;

select count(*) as gallery_photos_published from gallery_publishable;
