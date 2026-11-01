#!/usr/bin/env python3
"""Write a 'Price List' sheet into the schedule workbook from the site's data.

One reference for every price: workshops (Launch Season and the 1 May 2027 step), add-ons,
groups, birthdays, vouchers and Academy classes. Reads data/workshops-seed.json,
data/classes-seed.json and, if present, the git-ignored data/private/workshops-private.json
(unannounced prices), so the sheet is internal: never publish it.

Usage: python3 scripts/price_list_sheet.py <workbook vN.xlsx>   (needs openpyxl)
Rerun after any price change; the sheet is replaced each time. Workbooks are versioned: save each
rebuild as the next vN (never overwrite an earlier version); the version shows in the sheet title.
"""
import datetime as dt
import json
import pathlib
import re
import sys

import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / 'data'
ws_seed = json.loads((DATA / 'workshops-seed.json').read_text())
cl = json.loads((DATA / 'classes-seed.json').read_text())
private = DATA / 'private' / 'workshops-private.json'
post = {}
pass_after = None
if private.exists():
    pw = json.loads(private.read_text()).get('policies', {}).get('pricing_window', {})
    post = pw.get('post_launch_prices', {})
    pass_after = pw.get('studio_pass', {}).get('post_launch')

# 1 May 2027 prices not in the plan yet: suggestions, marked as such
SUGGESTED_POST = {'glow-canvas': 99, 'candle-making': 109, 'crochet-bag': 119}
WHY = {
    'watercolour-botanicals': 'Entry painting price, as posted on Facebook 1 Nov; drink and materials included.',
    'acrylic-canvas': 'Same entry price as Watercolour (Facebook 1 Nov).',
    'textured-canvas': 'RM80 in the first week (5 Nov), RM89 after (Facebook 1 Nov); paste and impasto medium cost more.',
    'glow-canvas': 'Glow paints cost more; the strongest ad hook of the month (Facebook 1 Nov).',
    'candle-making': 'Wax, jars and scents; Christmas gifting (Facebook 1 Nov).',
    'crochet-bag': 'Chunky yarn and a hook to take home (Facebook 1 Nov).',
    'bake-lab': 'Christmas Gingerbread at RM95 (Facebook 1 Nov). Focaccia at RM75 drew 25 people; ciabatta at RM120 drew 12.',
    'kids-art-studio': 'Sold only as Family Sunday: adult Textured Canvas plus a child, same hour.',
    'adult-art-class': 'A class, not a party: drop in, or four for the price of about three.',
}

pol = ws_seed['policies']
until = dt.date.fromisoformat(pol['pricing_window']['until'])
scheduled = {s['format'] for s in ws_seed.get('schedule', {}).get('sessions', [])}
rooms = {r['id']: r['name'] for r in ws_seed.get('rooms', [])}

HEAD = PatternFill('solid', fgColor='FF3B1C5A')
SECTION = PatternFill('solid', fgColor='FFF0E7DA')
SUGG = PatternFill('solid', fgColor='FFFFE066')
PAUSED = Font(color='FF6E6180')
rows = []   # (cells, kind) kind: title|note|section|head|row|sugg|paused|blank


def rm(n):
    return f'RM{n:,.0f}' if isinstance(n, (int, float)) else (n or '')


def length(m):
    h, mm = divmod(m or 0, 60)
    return f'{h}h{mm:02d}' if mm else f'{h}h'


version = re.search(r'\bv(\d+)\b', pathlib.Path(sys.argv[1]).stem)
rows.append(([f"Price List · Master Artist{f' · workbook v{version.group(1)}' if version else ''}"], 'title'))
rows.append(([f'Internal: includes prices not yet announced (1 May 2027). Do not post or forward outside the team. '
              f'Built {dt.date.today():%d %b %Y} from the website data; yellow = suggested, not yet confirmed.'], 'note'))
rows.append(([], 'blank'))

# Workshops
rows.append((['Studio Sessions · workshops'], 'section'))
rows.append((['Workshop', 'Status (Nov 2026)', 'Length', 'Room', 'Max seats', f'Price now (to {until:%d %b %Y})',
              '2 people (10% off)', 'Meal add-on', 'From 1 May 2027', 'Why this price'], 'head'))
dine = ws_seed['addons']['dine']
for f in ws_seed['formats']:
    if f.get('type') == 'course':
        continue
    fid = f['id']
    if f.get('status') == 'paused':
        status = 'Paused'
    elif fid in scheduled:
        status = 'On sale'
    else:
        status = 'Not in November'
    if f.get('bundle'):
        now, pair = f"{rm(f['bundle']['price'])} adult + child", f"extra child {rm(f['bundle']['extra_child'])}"
        later = rm(post.get('family-sunday')) or 'to set'
    else:
        now = rm(f['price']) + (f" {f['price_unit']}" if f.get('price_unit') else '')
        if f.get('pack_price'):
            now += f" · {f['pack_size']} for {rm(f['pack_price'])}"
        pair = rm(f.get('pair_price')) or '—'
        later = rm(post.get(fid)) or (f"{rm(SUGGESTED_POST[fid])} (suggested)" if fid in SUGGESTED_POST else 'to set')
    if f.get('price_specialty'):
        now += f" · specialty {rm(f['price_specialty'])}"
        if post.get(f'{fid}-specialty'):
            later += f" · specialty {rm(post[f'{fid}-specialty'])}"
    cap = f"{f['cap']}{' ' + f['cap_unit'] if f.get('cap_unit') else ''}"
    dine_txt = f"from {rm(dine['price_from'])}" if f.get('dine_addon') else '—'
    suggested = bool(f.get('_price_status'))
    kind = 'sugg' if suggested else 'paused' if status == 'Paused' else 'row'
    rows.append(([f['name'], status + (' · price suggested' if suggested else ''), length(f.get('duration_min')),
                  f.get('room', ''), cap, now, pair, dine_txt, later, WHY.get(fid, '')], kind))
rows.append(([f"Every workshop: minimum {pol['minimum_to_run']} to run; adult floor {rm(pol['pricing_window']['floor_adult'])}; "
              f"public holidays +{int(pol['public_holiday_surcharge'] * 100)}% (waived on Deepavali, 8 Nov); "
              f"prepaid, {pol['refunds'].split(',')[-1].strip()}; reschedule {pol['reschedule']}."], 'note'))
rows.append(([], 'blank'))

# Add-ons, passes, vouchers
rows.append((['Add-ons, passes and vouchers'], 'section'))
rows.append((['Item', 'What', 'Price now', 'From 1 May 2027'], 'head'))
rows.append(([dine['name'], 'A meal at Savor with any workshop (before an evening session, after a daytime one)',
              f"from {rm(dine['price_from'])} a person (Savor menu; paid at Savor)",
              rm(post.get('dine_addon')) or 'to set'], 'row'))
sp = pol['pricing_window'].get('studio_pass', {})
if sp:
    rows.append((['Studio Pass', f"{sp['sessions']} workshop seats; sold until {until:%d %b}; keeps launch prices to "
                  f"{dt.date.fromisoformat(sp['locks_launch_price_until']):%d %b %Y}", rm(sp['launch']),
                  rm(pass_after) or 'to set'], 'row'))
gv = ws_seed.get('gift_vouchers', {})
rows.append((['Gift vouchers', 'Amount vouchers, or one workshop seat at that workshop\'s price (validity: to confirm)',
              ' / '.join(rm(a) for a in gv.get('amounts', [])), 'unchanged'], 'row'))
rows.append((['RM50 trial voucher', 'Given to every workshop attendee; credited against a first month of classes',
              rm(pol['trial_voucher']['value']), 'unchanged'], 'row'))
rows.append(([], 'blank'))

# Groups and birthdays
g = ws_seed['groups']
rows.append((['Groups and birthdays'], 'section'))
rows.append((['Package', 'Includes', 'Price', 'Extra person', 'Notes'], 'head'))
for pk in g['packages']:
    if pk.get('price'):
        rows.append(([pk['name'], f"up to {pk['pax']} people", rm(pk['price']), rm(g['extra_pax']), ''], 'row'))
    else:
        rows.append(([pk['name'], f"from {pk['min_pax']} people", f"{rm(pk['per_person'])} a person", '—', 'dinner at Savor + an evening workshop'], 'row'))
b = g.get('birthdays')
if b:
    for pk in b['packages']:
        if pk.get('price_format'):
            fp = next(f for f in ws_seed['formats'] if f['id'] == pk['price_format'])
            price, extra, inc = f"{rm(fp['price'])} a person", '—', f"{pk['min']}–{pk['max']} people, ages {pk['ages']}"
        else:
            price, extra, inc = rm(pk['price']), rm(pk['extra_child']), f"{pk['kids_included']} children (max {pk['max']}), ages {pk['ages']}"
        rows.append(([pk['name'], inc, price, extra, f"{length(pk['duration_min'])} · {pk['room']} · {pk['when']}"], 'sugg'))
    rows.append(([f"Birthdays: {rm(b['deposit'])} deposit holds the date. Includes {b['includes']}. Prices suggested, not yet confirmed. "
                  f"Team days: Fridays finish by {g['friday_hard_stop']}."], 'note'))
rows.append(([], 'blank'))

# Academy
rows.append((['Master Artist Academy · weekly classes (no change on 1 May 2027)'], 'section'))
rows.append((['Programme', 'Per month', 'Per session', 'Other prices', 'Class size', 'Days'], 'head'))
for p in cl['programmes']:
    if p.get('status') == 'paused':
        rows.append(([p['name'], 'Paused', '', p.get('note', ''), '', ''], 'paused'))
        continue
    other = []
    if p.get('group_price_month'):
        other.append(f"group {rm(p['group_price_month'])}/month")
    if p.get('adult_price_month'):
        other.append(f"adults {rm(p['adult_price_month'])}/month")
    if p.get('sibling_or_student_price'):
        other.append(f"sibling or student {rm(p['sibling_or_student_price'])}/month")
    if p.get('price_course'):
        month, sess = f"{rm(p['price_course'])} for 6 weeks", '—'
        other.append(f"{rm(p['price_at_bake_lab'])} if booked at a Bake Lab; runs with {p.get('min')}+")
    else:
        month, sess = rm(p['price_month']), rm(p['per_session'])
    days = ' · '.join(f"{s['day']} {s['time']}".strip() for s in p.get('slots', []))
    rows.append(([p['name'], month, sess, '; '.join(other), p.get('cap', ''), days], 'row'))
for c in cl.get('holiday_camps', []):
    rows.append(([c['name'], rm(c['price']), '—', f"ages {c['ages']} · {c['time']}", '', c['dates']], 'row'))
d = cl['discounts']
rows.append(([f"Trial {rm(cl['trial']['price'])}, {cl['trial']['note']}. Siblings {int(d['sibling'] * 100)}% off. "
              f"Referral: {rm(d['referral']['referrer_credit'])} credit to the referrer, "
              f"{rm(d['referral']['new_student_first_month_off'])} off the new student's first month."], 'note'))

# write
path = sys.argv[1]
wb = openpyxl.load_workbook(path)
if 'Price List' in wb.sheetnames:
    del wb['Price List']
sh = wb.create_sheet('Price List', 0)
for r, (cells, kind) in enumerate(rows, start=1):
    for c, v in enumerate(cells, start=1):
        cell = sh.cell(r, c, v)
        cell.alignment = Alignment(wrap_text=kind in ('row', 'sugg', 'paused', 'head'), vertical='top')
        if kind == 'title':
            cell.font = Font(bold=True, size=16, color='FF3B1C5A')
        elif kind == 'note':
            cell.font = Font(italic=True, color='FF6E6180')
        elif kind == 'section':
            cell.font = Font(bold=True, size=12, color='FF3B1C5A')
        elif kind == 'head':
            cell.font = Font(bold=True, color='FFFFFFFF')
            cell.fill = HEAD
        elif kind == 'sugg':
            cell.fill = SUGG
        elif kind == 'paused':
            cell.font = PAUSED
    if kind == 'section':
        for c in range(1, 11):
            sh.cell(r, c).fill = SECTION
for col, w in zip('ABCDEFGHIJ', [30, 26, 22, 28, 12, 26, 14, 16, 18, 48]):
    sh.column_dimensions[col].width = w
sh.freeze_panes = 'A4'
wb.save(path)
print(f'Price List written to {path} ({len(rows)} rows)')
