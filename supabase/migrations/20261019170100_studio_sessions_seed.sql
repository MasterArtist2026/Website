-- Seed Studio Session formats and the first draft timetable.
-- Apply after 20261019170000_studio_sessions.sql, in the SQL editor.
-- Every session is status = draft. Nothing appears on the website until staff publish it.
--
-- Soft launch (10–16 Nov 2026), from the go-to-market plan:
--   Canvas Night, Watercolour, Bake Lab and Sing Your Song once each,
--   plus both mothers' morning slots. Prices are RM20 below the catalogue.
-- Weekly grid from 17 Nov 2026 through 31 Jan 2027, phased with the plan:
--   17 Nov: Canvas Night, Watercolour (including both Tuesday tests), Bake Lab, Sing Your Song.
--   13 Dec: first Sunday for Parent & Child and Kids Art Studio (plan: running from 8 Dec).
--   5 Jan: Piano in 90. 10 Jan: first Photo Walk Sunday.
--   Christmas and Chinese New Year overlays are a handful of extra drafts, not a weekly SKU.
-- The catalogue lists Kids Art Studio as live in November; the plan starts it in December.
-- These drafts follow the plan. Saturday is closed. No workshop is seeded on Friday.

begin;

insert into public.workshop_formats (
  slug, name, discipline, summary, you_make, who_for, audiences,
  duration_minutes, price_myr, price_label, unit, seats_per_unit, capacity, room,
  materials_note, academy_upsell, min_pax, live_from, page_path, image_path,
  bookable, requires_child, sort_order
) values
  (
    'canvas-night', 'Canvas Night', 'Art',
    'One acrylic canvas, begun and finished in the same evening. Taught by working artists, in the room with the view.',
    'One acrylic canvas from the month''s theme, on a 30×40cm canvas. Beginner-friendly. Take it home the same night.',
    'Couples and friends, about 25–45.',
    array['couples','friends','adults'],
    150, 108.00, null, 'pax', 1, 8, 'L2 front room',
    'Materials about RM20 a person: canvas, acrylics, brushes, apron.',
    'Adult art programme, RM480 a month.',
    3, date '2026-11-01', '/canvas-night.html', '/golden-shores-workshop-1.jpg',
    true, false, 1
  ),
  (
    'watercolour-botanicals', 'Watercolour Botanicals', 'Art',
    'Two botanical studies on cotton paper, taught by a working artist. Calm, giftable, and a real step on from a first class.',
    'Two A5 botanical studies. One is mounted in a card frame to give or keep.',
    'Women 25–50, and the expat community.',
    array['women','adults'],
    120, 98.00, null, 'pax', 1, 8, 'L2 front room',
    'Materials about RM15 a person: cotton paper and a card mount.',
    'Adult art programme, and a four-session Studio Pass at RM360.',
    3, date '2026-11-01', '/watercolour-botanicals.html', '/painting-1.jpg',
    true, false, 2
  ),
  (
    'bake-lab', 'Plant-based Bake Lab', 'Baking',
    'One plant-based bake, boxed to take home. Taught in the L1 kitchen by the studio''s baking teacher. No evening baking.',
    'One 6-inch plant-based bake. The recipe rotates: banana loaf, chocolate cake, cookies.',
    'Adults who want a real bake, including health-leaning cooks and mothers.',
    array['adults'],
    150, 128.00, null, 'pax', 1, 6, 'L1 kitchen',
    'Materials about RM25 a person. Cap 6, set by the kitchen. Windows are 10:00–12:30 and 15:00–17:30 only.',
    'Plant-based baking programme. A 6-week course is offered at the end of every Bake Lab.',
    3, date '2026-11-01', '/bake-lab.html', '/baking-1.jpg',
    true, false, 3
  ),
  (
    'sing-your-song', 'Sing Your Song', 'Voice',
    'One song, one evening, taught by a working voice teacher. You leave with a recording of the group.',
    'A recorded group performance of one song, plus a 10-minute solo technique round. The phone recording is sent to each attendee.',
    'Adults who never sang, and teams.',
    array['adults','teams'],
    120, 98.00, null, 'pax', 1, 8, 'Music room',
    'No materials. Best format on the list for a team.',
    'Voice lessons, RM400–480 a month.',
    3, date '2026-11-01', '/sing-your-song.html', '/vocal-singing.jpg',
    true, false, 4
  ),
  (
    'parent-and-child', 'Parent & Child Studio', 'Art',
    'A shared piece for one parent and one child, taught by a working artist. Sunday morning, made to be finished.',
    'A shared canvas or clay piece, one per parent-and-child pair.',
    'Families with children about 5–10.',
    array['families'],
    90, 160.00, 'RM160 per pair', 'pair', 2, 4, 'L2 back room',
    'Materials about RM20 a pair.',
    'Kids'' art, RM400–440 a month.',
    3, date '2026-12-08', '/parent-and-child.html', '/painting-4.jpg',
    true, true, 5
  ),
  (
    'festive-overlay', 'Festive overlay', 'Art',
    'A seasonal piece, four times a year. Taught by a working artist. Christmas, then Chinese New Year.',
    'Ornament painting, a decorated gift box, or a festive canvas. Christmas in December, Chinese New Year in January.',
    'Anyone booking a gift or a seasonal afternoon.',
    array['everyone'],
    120, 98.00, 'RM88–98', 'pax', 1, 8, 'L1 front room',
    'Materials about RM20 a person. Staff can set the session price anywhere from RM88 to RM98.',
    'Any academy programme. Mostly a way back into the studio.',
    3, date '2026-12-01', '/festive-overlay.html', '/craft-jars.jpg',
    true, false, 6
  ),
  (
    'piano-in-90', 'Piano in 90 Minutes', 'Piano',
    'One short piece, two hands, in ninety minutes. Taught by a working pianist. Four keyboards, four people.',
    'One playable short piece, two hands, from a lead sheet, by the end of the session.',
    'Adult beginners who want proof they can play.',
    array['adults'],
    90, 128.00, null, 'pax', 1, 4, 'Music room',
    'No materials. Cap 4, one person to a keyboard.',
    'Adult piano, RM480 a month.',
    3, date '2027-01-05', '/piano-in-90.html', '/piano-photo.jpg',
    true, false, 7
  ),
  (
    'photo-walk', 'Phone Photography Walk + Edit', 'Photography',
    'Six edited photographs from a short walk around Sri Hartamas, then an edit back in the studio. Taught by a working photographer.',
    'A six-image edited set, shot on your phone and edited in the L2 recording studio.',
    'Small-business owners and creators who need product and food photographs.',
    array['creators','adults'],
    150, 118.00, null, 'pax', 1, 8, 'L2 recording studio',
    'No materials. The edit uses the recording studio, so the walk never takes an art room.',
    'Photography programme, RM560 a month.',
    3, date '2027-01-05', '/photo-walk.html', '/art-photo-1.jpg',
    true, false, 8
  ),
  (
    'kids-art-studio', 'Kids Art Studio', 'Art',
    'Two hours of art for children 6–12, taught by a working artist, while parents take Canvas Night.',
    'A guided art piece to take home.',
    'Children 6–12.',
    array['kids'],
    120, 88.00, null, 'pax', 1, 8, 'L2 back room',
    'Materials are included in the session.',
    'Kids'' art, RM400–440 a month.',
    3, date '2026-12-08', '/kids-art-studio.html', '/painting-3.jpg',
    true, true, 9
  ),
  (
    'private-group', 'Private Group', 'Private',
    'A private or corporate booking on a weekday between 10am and 3pm. Three fixed packages. Enquire on WhatsApp — this format is not sold seat by seat.',
    'Any catalogue format, scaled for a team, a birthday or a farewell. Lunch boxes and framed take-home pieces can be added.',
    'Teams, birthdays and farewell groups, 10 to 20 people.',
    array['teams'],
    150, 1200.00, 'From RM1,200 for 10', 'pax', 1, 20, 'L1 front room',
    'RM1,200 for 10 (art, one instructor). RM1,700 for 15 (Bake Lab, two instructors above 12). RM2,400 for 20 (two formats in parallel). Extra people RM100. Lunch box RM25. Framed take-home RM30.',
    'A revenue line of its own. Not an academy trial path.',
    10, date '2026-11-01', '/private-group.html', '/hero-1.jpg',
    false, false, 10
  )
on conflict (slug) do nothing;

-- p_start and p_end are Asia/Kuala_Lumpur wall times, without a zone suffix.
create or replace function pg_temp.seed_studio_session(
  p_slug text,
  p_start timestamp,
  p_end timestamp,
  p_room text,
  p_price numeric,
  p_notes text,
  p_promo text
) returns void
language plpgsql
as $$
begin
  insert into public.workshop_sessions (
    format_id, starts_at, ends_at, room, capacity, price_myr, status, promo_label, notes
  )
  select f.id,
         p_start at time zone 'Asia/Kuala_Lumpur',
         p_end at time zone 'Asia/Kuala_Lumpur',
         p_room,
         f.capacity,
         p_price,
         'draft',
         p_promo,
         p_notes
  from public.workshop_formats f
  where f.slug = p_slug
    and not exists (
      select 1
      from public.workshop_sessions s
      where s.format_id = f.id
        and s.starts_at = (p_start at time zone 'Asia/Kuala_Lumpur')
    );
end;
$$;

-- Soft launch, 10–16 Nov 2026. RM20 off the catalogue price.
select pg_temp.seed_studio_session(
  'watercolour-botanicals', timestamp '2026-11-10 10:00', timestamp '2026-11-10 12:00',
  'L2 front room', 78, 'Mothers'' morning test. Soft launch for existing students, parents and WhatsApp contacts. Review the price before publishing.', 'Soft launch RM20 off');
select pg_temp.seed_studio_session(
  'bake-lab', timestamp '2026-11-12 10:00', timestamp '2026-11-12 12:30',
  'L1 kitchen', 108, 'Mothers'' morning test. Soft launch for existing students, parents and WhatsApp contacts. Review the price before publishing.', 'Soft launch RM20 off');
select pg_temp.seed_studio_session(
  'sing-your-song', timestamp '2026-11-12 20:00', timestamp '2026-11-12 22:00',
  'Music room', 78, 'Soft launch for existing students, parents and WhatsApp contacts. Review the price before publishing.', 'Soft launch RM20 off');
select pg_temp.seed_studio_session(
  'bake-lab', timestamp '2026-11-15 10:00', timestamp '2026-11-15 12:30',
  'L1 kitchen', 108, 'Soft launch for existing students, parents and WhatsApp contacts. Review the price before publishing.', 'Soft launch RM20 off');
select pg_temp.seed_studio_session(
  'watercolour-botanicals', timestamp '2026-11-15 10:30', timestamp '2026-11-15 12:30',
  'L2 front room', 78, 'Soft launch for existing students, parents and WhatsApp contacts. Review the price before publishing.', 'Soft launch RM20 off');
select pg_temp.seed_studio_session(
  'canvas-night', timestamp '2026-11-15 15:00', timestamp '2026-11-15 17:30',
  'L2 front room', 88, 'Soft launch for existing students, parents and WhatsApp contacts. Review the price before publishing.', 'Soft launch RM20 off');

do $$
declare
  d date;
begin
  for d in
    select gs::date
    from generate_series(date '2026-11-17', date '2027-01-31', interval '1 day') as gs
  loop
    if extract(dow from d) = 0 then
      perform pg_temp.seed_studio_session('bake-lab', d + time '10:00', d + time '12:30', 'L1 kitchen', 128, null, null);
      perform pg_temp.seed_studio_session('watercolour-botanicals', d + time '10:30', d + time '12:30', 'L2 front room', 98, null, null);
      perform pg_temp.seed_studio_session('canvas-night', d + time '15:00', d + time '17:30', 'L2 front room', 108, null, null);
      perform pg_temp.seed_studio_session('bake-lab', d + time '15:00', d + time '17:30', 'L1 kitchen', 128, null, null);
      if d >= date '2026-12-13' then
        perform pg_temp.seed_studio_session('parent-and-child', d + time '10:30', d + time '12:00', 'L2 back room', 160, null, null);
        perform pg_temp.seed_studio_session(
          'kids-art-studio', d + time '15:00', d + time '17:00', 'L2 back room', 88,
          'Runs while parents are in Canvas Night.', null);
      end if;
      if d >= date '2027-01-10' then
        perform pg_temp.seed_studio_session(
          'photo-walk', d + time '15:00', d + time '17:30', 'L2 recording studio', 118,
          'Walk around Sri Hartamas, then edit in the L2 recording studio.', null);
      end if;
    elsif extract(dow from d) = 2 then
      perform pg_temp.seed_studio_session(
        'watercolour-botanicals', d + time '10:00', d + time '12:00', 'L2 front room', 98,
        'Mothers'' morning test.', null);
      perform pg_temp.seed_studio_session(
        'watercolour-botanicals', d + time '15:30', d + time '17:30', 'L1 front room', 98,
        'Afternoon test for parents waiting at pickup. Same view as the front room.', null);
      perform pg_temp.seed_studio_session('canvas-night', d + time '19:30', d + time '22:00', 'L2 front room', 108, null, null);
      if d >= date '2027-01-05' then
        perform pg_temp.seed_studio_session('piano-in-90', d + time '20:00', d + time '21:30', 'Music room', 128, null, null);
      end if;
    elsif extract(dow from d) = 4 then
      perform pg_temp.seed_studio_session(
        'bake-lab', d + time '10:00', d + time '12:30', 'L1 kitchen', 128,
        'Mothers'' morning test.', null);
      perform pg_temp.seed_studio_session('bake-lab', d + time '15:00', d + time '17:30', 'L1 kitchen', 128, null, null);
      perform pg_temp.seed_studio_session('sing-your-song', d + time '20:00', d + time '22:00', 'Music room', 98, null, null);
    end if;
  end loop;
end;
$$;

-- Christmas overlay, then a January Chinese New Year preview. Prices sit inside RM88–98.
select pg_temp.seed_studio_session('festive-overlay', timestamp '2026-12-13 15:00', timestamp '2026-12-13 17:00', 'L1 front room', 98, 'Christmas overlay.', null);
select pg_temp.seed_studio_session('festive-overlay', timestamp '2026-12-15 19:30', timestamp '2026-12-15 21:30', 'L2 back room', 98, 'Christmas overlay.', null);
select pg_temp.seed_studio_session('festive-overlay', timestamp '2026-12-17 19:30', timestamp '2026-12-17 21:30', 'L2 back room', 88, 'Christmas overlay.', null);
select pg_temp.seed_studio_session('festive-overlay', timestamp '2026-12-20 15:00', timestamp '2026-12-20 17:00', 'L1 front room', 98, 'Christmas overlay.', null);
select pg_temp.seed_studio_session('festive-overlay', timestamp '2026-12-22 19:30', timestamp '2026-12-22 21:30', 'L2 back room', 88, 'Christmas overlay.', null);
select pg_temp.seed_studio_session('festive-overlay', timestamp '2026-12-27 15:00', timestamp '2026-12-27 17:00', 'L1 front room', 98, 'Christmas overlay.', null);
select pg_temp.seed_studio_session('festive-overlay', timestamp '2027-01-17 15:00', timestamp '2027-01-17 17:00', 'L1 front room', 98, 'Chinese New Year overlay.', null);
select pg_temp.seed_studio_session('festive-overlay', timestamp '2027-01-19 19:30', timestamp '2027-01-19 21:30', 'L2 back room', 98, 'Chinese New Year overlay.', null);
select pg_temp.seed_studio_session('festive-overlay', timestamp '2027-01-21 19:30', timestamp '2027-01-21 21:30', 'L2 back room', 88, 'Chinese New Year overlay.', null);
select pg_temp.seed_studio_session('festive-overlay', timestamp '2027-01-24 15:00', timestamp '2027-01-24 17:00', 'L1 front room', 98, 'Chinese New Year overlay.', null);

-- Every row above is inserted with status draft. Publish from Admin → Studio Sessions.

commit;
