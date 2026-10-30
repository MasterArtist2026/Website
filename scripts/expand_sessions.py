#!/usr/bin/env python3
"""Expand the weekly workshop template into dated sessions.

Reads  data/workshops-seed.json  (formats, weekly_schedule_template, closures,
policies, launch), data/themes.json and data/bookings.json, and writes:
  data/workshops.json        everything the site renders from
  data/sessions-preview.md   a human-readable list to check by eye

Rules (handoff 02-SITE-SPEC §2):
- a rolling window of DAYS days from today (or from launch.first_public_sessions
  if that is later); nothing before a format's live_from or an entry's from;
- `alternate_weeks_with`: the entry's own format runs on its first week, the
  alternate format the next week, and so on;
- weekly closures (Saturday; Friday from 12:30) and no evening (18:00+)
  workshops on Mon/Wed/Fri/Sun;
- session id = {format}-{yyyy-mm-dd}-{HHMM}; theme and booked seats are looked
  up by that id; seats_left = cap - booked;
- prices: Launch Season prices until policies.pricing_window.until, then the
  post_launch_prices set, so the site switches on the date without page edits;
- public holidays (data/public-holidays.json) carry the surcharge unless the
  date is in policies.public_holiday_surcharge_waived_dates.

Usage: python3 scripts/expand_sessions.py [--today YYYY-MM-DD] [--days 42]
"""
import argparse
import datetime as dt
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / 'data'
DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']


def load(name, default=None):
    p = DATA / name
    if not p.exists():
        return default
    d = json.loads(p.read_text())
    return {k: v for k, v in d.items() if not k.startswith('_')} if isinstance(d, dict) else d


def deep_merge(base, extra):
    """Merge a private overlay (git-ignored: internal notes, unannounced prices) into the seed."""
    for k, v in extra.items():
        if k.startswith('_'):
            continue
        if isinstance(v, dict) and isinstance(base.get(k), dict):
            deep_merge(base[k], v)
        else:
            base[k] = v
    return base


def hm_to_min(t):
    h, m = map(int, t.split(':'))
    return h * 60 + m


def fmt_time(t):
    h, m = map(int, t.split(':'))
    suffix = 'am' if h < 12 else 'pm'
    h12 = h % 12 or 12
    return f'{h12}:{m:02d}{suffix}' if m else f'{h12}{suffix}'


def closed(day, start, closures):
    """True when a session at `start` on `day` breaks a closure rule."""
    for c in closures.get('weekly', []):
        if c['day'] != day:
            continue
        if c.get('all_day'):
            return True
        if 'from' in c and hm_to_min(start) >= hm_to_min(c['from']):
            return True
    if day in closures.get('no_evening_workshops', []) and hm_to_min(start) >= 18 * 60:
        return True
    return False


def price_for(fmt, date, policies, variant=None):
    """(price, pair_price, price_set) for a format on a date."""
    window = policies.get('pricing_window', {})
    launch = date <= dt.date.fromisoformat(window.get('until', '9999-12-31'))
    post = window.get('post_launch_prices', {})
    price, pair = fmt.get('price'), fmt.get('pair_price')
    if fmt.get('bundle'):                       # Kids Art Studio sells as Family Sunday
        price = fmt['bundle']['price']
        if not launch and 'family-sunday' in post:
            price = post['family-sunday']
    elif variant:                               # e.g. the Thursday specialty / cakes Bake Lab
        price = fmt.get(f'price_{variant}', price)
        pair = fmt.get(f'pair_price_{variant}')   # no specialty pair price in the plan yet
        key = f"{fmt['id']}-{variant}"
        if not launch and key in post:
            price, pair = post[key], None
    elif not launch and fmt['id'] in post:
        price = post[fmt['id']]
        pair = None                             # TODO: post-launch pair prices not in the plan yet
    return price, pair, ('launch' if launch else 'post_launch')


def expand(seed, themes, bookings, holidays, today, days):
    formats = {f['id']: f for f in seed['formats']}
    closures = seed.get('closures', {})
    policies = seed.get('policies', {})
    waived = set(policies.get('public_holiday_surcharge_waived_dates', []))
    surcharge = policies.get('public_holiday_surcharge', 0)
    first_public = dt.date.fromisoformat(seed.get('launch', {}).get('first_public_sessions', today.isoformat()))
    start = max(today, first_public)
    end = today + dt.timedelta(days=days)
    hol = {h['date']: h['name'] for h in holidays}

    sessions, skipped = [], []
    for idx, entry in enumerate(seed['weekly_schedule_template']):
        weekday = DAY_NAMES.index(entry['day'])
        d = start + dt.timedelta(days=(weekday - start.weekday()) % 7)
        week_no = 0
        while d <= end:
            fid = entry['format']
            if entry.get('alternate_weeks_with') and week_no % 2 == 1:
                fid = entry['alternate_weeks_with']
            fmt = formats[fid]
            week_no += 1
            iso = d.isoformat()
            live_from = dt.date.fromisoformat(max(fmt.get('live_from', iso), entry.get('from', iso)))
            if d < live_from:
                d += dt.timedelta(days=7)
                continue
            if closed(entry['day'], entry['time'], closures):
                skipped.append(f"{iso} {entry['time']} {fid}: closure rule")
                d += dt.timedelta(days=7)
                continue
            sid = f"{fid}-{iso}-{entry['time'].replace(':', '')}"
            variant = entry.get('variant') if fid == entry['format'] else None
            price, pair, price_set = price_for(fmt, d, policies, variant)
            is_hol = iso in hol
            if is_hol and iso not in waived and price:
                price = round(price * (1 + surcharge))
            cap = fmt.get(f'cap_{variant}', fmt.get('cap')) if variant else fmt.get('cap')
            booked = int(bookings.get(sid, 0))
            dine = bool(entry.get('dine')) or (fmt.get('dine_addon') and entry['day'] in ('Tue', 'Thu')
                                                and hm_to_min(entry['time']) >= 18 * 60)
            end_min = hm_to_min(entry['time']) + fmt.get('duration_min', 0)
            room_id = entry.get('room')
            room = next((r['name'] for r in seed.get('rooms', []) if r['id'] == room_id), fmt.get('room'))
            s = {
                'id': sid, 'format': fid, 'name': fmt['name'], 'variant': variant, 'discipline': fmt.get('discipline'),
                'date': iso, 'day': entry['day'], 'time': entry['time'],
                'end': f'{end_min // 60:02d}:{end_min % 60:02d}',
                'label': f"{entry['day']} {d.day} {d.strftime('%b')} · {fmt_time(entry['time'])}",
                'room': room, 'price': price, 'pair_price': pair, 'price_set': price_set,
                'price_unit': fmt.get('price_unit'), 'cap': cap, 'cap_unit': fmt.get('cap_unit'),
                'booked': booked, 'seats_left': max(0, cap - booked) if cap else None,
                'dine': bool(dine), 'dine_timing': entry.get('dine_timing', fmt.get('dine_timing', 'before')),
                'theme': themes.get(sid), 'public_holiday': hol.get(iso),
                'surcharge_waived': is_hol and iso in waived,
                'type': fmt.get('type', 'workshop'),
            }
            if fmt.get('bundle'):
                s['bundle'] = fmt['bundle']
            if fmt.get('type') == 'course':
                # Shown only as a cohort start; other weeks are a private/corporate hold
                starts = {c['start'] for c in fmt.get('cohorts', [])}
                s['public'] = iso in starts
                s['note'] = 'Cohort start (runs when 6 are enrolled)' if s['public'] else 'Private / corporate hold'
            else:
                s['public'] = True
            sessions.append(s)
            d += dt.timedelta(days=7)
    sessions.sort(key=lambda s: (s['date'], s['time'], s['format']))

    # "Sold out — next date": link each session to the next public one of the same format
    for i, s in enumerate(sessions):
        nxt = next((t for t in sessions[i + 1:] if t['format'] == s['format'] and t['public']), None)
        s['next_session'] = nxt['id'] if nxt else None
    return sessions, skipped


def preview(sessions, until):
    lines = ['# Sessions preview', '', f'Generated {dt.date.today().isoformat()} — public sessions to {until}.', '']
    day = None
    for s in sessions:
        if s['date'] > until or not s['public']:
            continue
        if s['date'] != day:
            day = s['date']
            d = dt.date.fromisoformat(day)
            extra = f" — {s['public_holiday']}" + (' (no surcharge)' if s['surcharge_waived'] else '') if s['public_holiday'] else ''
            lines += ['', f"## {d.strftime('%A %-d %B %Y')}{extra}"]
        price = f"RM{s['price']}" + (f" ({s['price_unit']})" if s['price_unit'] else '') if s['price'] else 'TODO price'
        if s.get('bundle'):
            price = f"Family Sunday RM{s['price']} (+RM{s['bundle']['extra_child']} per extra child)"
        pair = f" · pair RM{s['pair_price']}" if s['pair_price'] else ''
        dine = f" · Dine add-on ({s['dine_timing']})" if s['dine'] else ''
        cap = f"{s['seats_left']} of {s['cap']}{' ' + s['cap_unit'] if s['cap_unit'] else ''} seats left"
        theme = f" · {s['theme']}" if s['theme'] else ''
        variant = f" ({s['variant']})" if s.get('variant') else ''
        lines.append(f"- **{s['time']}–{s['end']}** {s['name']}{variant}{theme} · {s['room']} · {price}{pair}{dine} · {cap}")
    return '\n'.join(lines) + '\n'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--today', default=dt.date.today().isoformat())
    ap.add_argument('--days', type=int, default=42)
    args = ap.parse_args()
    today = dt.date.fromisoformat(args.today)

    public_seed = json.loads((DATA / 'workshops-seed.json').read_text())
    seed = json.loads(json.dumps(public_seed))   # private overlay is used for calculation only,
    private = DATA / 'private' / 'workshops-private.json'   # never copied into workshops.json
    if private.exists():
        deep_merge(seed, json.loads(private.read_text()))
    themes = load('themes.json', {})
    bookings = load('bookings.json', {})
    holidays = load('public-holidays.json', {}).get('holidays', [])
    sessions, skipped = expand(seed, themes, bookings, holidays, today, args.days)

    out = {k: v for k, v in public_seed.items() if k != 'weekly_schedule_template'}
    out['generated'] = dt.datetime.now().isoformat(timespec='seconds')
    out['window'] = {'from': today.isoformat(), 'days': args.days}
    out['sessions'] = sessions
    (DATA / 'workshops.json').write_text(json.dumps(out, indent=1, ensure_ascii=False) + '\n')

    two_weeks = (max(today, dt.date.fromisoformat(seed.get('launch', {}).get('first_public_sessions', today.isoformat())))
                 + dt.timedelta(days=13)).isoformat()
    (DATA / 'sessions-preview.md').write_text(preview(sessions, (today + dt.timedelta(days=args.days)).isoformat()))
    pub = [s for s in sessions if s['public']]
    print(f'{len(pub)} public sessions ({len(sessions) - len(pub)} private holds), '
          f'{len(skipped)} skipped by closure rules; preview to {two_weeks} in data/sessions-preview.md')
    for line in skipped:
        print('  skipped:', line)


if __name__ == '__main__':
    main()
