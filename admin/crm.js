import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { needsFollowUp, repeatCustomer, workshopStats } from '/lead-capture.mjs';

const SUPABASE_URL = 'https://fudaosneozobacdalncv.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ1ZGFvc25lb3pvYmFjZGFsbmN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4OTIwNDUsImV4cCI6MjEwMjQ2ODA0NX0.0PKbkncE8goPg-iJlAUacNUa3MjWJSj1ZLeqTpkqPZ0';
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

const STAGES = ['new', 'replied', 'booked', 'paid', 'attended', 'lost'];
const STAGE_LABEL = { new: 'New', replied: 'Replied', booked: 'Booked', paid: 'Paid', attended: 'Attended', lost: 'Lost' };
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const myr = n => 'RM' + Number(n || 0).toLocaleString('en-MY', { maximumFractionDigits: 0 });
const when = iso => iso ? new Date(iso).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
const day = iso => iso ? new Date(iso).toLocaleDateString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', day: 'numeric', month: 'short', year: 'numeric' }) : 'Date TBC';

let me = null;
let staff = [];

function authMsg(kind, text) {
  $('authMsg').innerHTML = text ? `<div class="msg ${kind}">${esc(text)}</div>` : '';
}
function friendly(msg) {
  const text = String(msg || '');
  if (/relation .* does not exist|schema cache/i.test(text)) return 'The CRM tables are not in the database yet. Run supabase/migrations/20261102011500_crm.sql in the Supabase SQL editor.';
  if (/permission|row-level|42501|not authorized/i.test(text)) return 'This account cannot read the CRM. Run the migration, and make sure the profile is active.';
  if (/invalid login/i.test(text)) return 'That email or password is not right.';
  if (/rate limit/i.test(text)) return 'Too many emails. Wait a few minutes and try again.';
  return text;
}
function waHref(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  const local = digits.startsWith('0') ? '60' + digits.slice(1) : digits;
  return local ? 'https://wa.me/' + local : '';
}
function routeName() {
  const raw = (location.hash || '#inbox').slice(1);
  const [name, id] = raw.split('/');
  return { name: name || 'inbox', id: id || '' };
}

$('tabLink').onclick = () => { $('tabLink').classList.add('on'); $('tabPassword').classList.remove('on'); $('linkForm').hidden = false; $('passwordForm').hidden = true; };
$('tabPassword').onclick = () => { $('tabPassword').classList.add('on'); $('tabLink').classList.remove('on'); $('linkForm').hidden = true; $('passwordForm').hidden = false; $('codeForm').hidden = true; };
$('codeBack').onclick = () => { $('codeForm').hidden = true; $('linkForm').hidden = false; };

$('linkForm').onsubmit = async event => {
  event.preventDefault();
  const email = $('email').value.trim().toLowerCase();
  const btn = event.currentTarget.querySelector('button');
  btn.disabled = true;
  authMsg('ok', 'Sending…');
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: location.origin + '/admin/', shouldCreateUser: true },
  });
  btn.disabled = false;
  if (error) { authMsg('err', friendly(error.message)); return; }
  authMsg('ok', 'Check your email for the sign-in link.');
  $('linkForm').hidden = true;
  $('codeForm').hidden = false;
};
$('codeForm').onsubmit = async event => {
  event.preventDefault();
  const email = $('email').value.trim().toLowerCase();
  const token = $('code').value.trim();
  const { error } = await sb.auth.verifyOtp({ email, token, type: 'email' });
  if (error) authMsg('err', friendly(error.message));
};
$('passwordForm').onsubmit = async event => {
  event.preventDefault();
  const { error } = await sb.auth.signInWithPassword({
    email: $('pwEmail').value.trim().toLowerCase(),
    password: $('password').value,
  });
  if (error) authMsg('err', friendly(error.message));
};
$('signOut').onclick = () => sb.auth.signOut();

sb.auth.onAuthStateChange((event, session) => {
  if (session) boot();
  else showAuth();
});

function showAuth() {
  me = null;
  $('auth').style.display = 'flex';
  $('app').classList.remove('on');
}

async function boot() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return showAuth();
  const { data: profile, error } = await sb.from('profiles').select('id, full_name, email, role, active').eq('id', session.user.id).maybeSingle();
  if (error) { showAuth(); authMsg('err', friendly(error.message)); return; }
  if (!profile || !profile.active) {
    showAuth();
    authMsg('err', 'This account is not active yet. An administrator turns it on in the content admin.');
    return;
  }
  me = profile;
  $('auth').style.display = 'none';
  $('app').classList.add('on');
  const { data: people } = await sb.from('profiles').select('id, full_name, role, active').eq('active', true).order('full_name');
  staff = people || [];
  render();
}

window.addEventListener('hashchange', render);

function setNav(name) {
  document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('on', a.dataset.route === name));
  const titles = { inbox: 'Inbox', board: 'Pipeline', add: 'Add a lead', people: 'People', workshops: 'Workshops', lead: 'Lead', person: 'Customer', workshop: 'Workshop' };
  $('title').textContent = titles[name] || 'Leads';
}

async function render() {
  if (!me) return;
  const { name, id } = routeName();
  setNav(name === 'lead' ? 'inbox' : name === 'person' ? 'people' : name === 'workshop' ? 'workshops' : name);
  const view = $('view');
  view.innerHTML = '<p class="muted">Loading…</p>';
  try {
    if (name === 'board') view.innerHTML = await boardHtml();
    else if (name === 'add') view.innerHTML = addHtml();
    else if (name === 'people') view.innerHTML = await peopleHtml();
    else if (name === 'person' && id) view.innerHTML = await personHtml(id);
    else if (name === 'workshops') view.innerHTML = await workshopsHtml();
    else if (name === 'workshop' && id) view.innerHTML = await workshopHtml(id);
    else if (name === 'lead' && id) view.innerHTML = await leadHtml(id);
    else view.innerHTML = await inboxHtml();
    bind(view);
  } catch (err) {
    view.innerHTML = `<div class="msg err">${esc(friendly(err.message || err))}</div>`;
  }
}

async function loadLeads() {
  const { data, error } = await sb.from('leads').select('*').order('updated_at', { ascending: false }).limit(300);
  if (error) throw error;
  return data || [];
}

function leadCard(lead) {
  const follow = needsFollowUp(lead);
  return `<a class="lead" href="#lead/${lead.id}">
    <div class="rowline"><b>${esc(lead.name)}</b><span class="muted">${esc(when(lead.created_at))}</span></div>
    <div class="muted">${esc(lead.phone || '')}${lead.interest ? ' · ' + esc(lead.interest) : ''}</div>
    <div class="chips">
      <span class="chip">${esc(STAGE_LABEL[lead.stage] || lead.stage)}</span>
      <span class="chip">${esc(lead.source || '')}</span>
      ${follow ? '<span class="chip warn">Needs follow-up</span>' : ''}
    </div>
  </a>`;
}

async function inboxHtml() {
  const leads = await loadLeads();
  const follow = leads.filter(needsFollowUp).length;
  return `<div class="filters">
      <input id="q" placeholder="Search name, phone, interest" aria-label="Search leads">
      <select id="stageFilter" aria-label="Stage"><option value="">All stages</option>${STAGES.map(s => `<option value="${s}">${STAGE_LABEL[s]}</option>`).join('')}</select>
      <label class="muted" style="display:flex;align-items:center;gap:6px"><input id="followOnly" type="checkbox"> Needs follow-up (${follow})</label>
    </div>
    <div class="list" id="leadList">${leads.map(leadCard).join('') || '<div class="empty">No leads yet. Use Add after a WhatsApp chat, or wait for the website form.</div>'}</div>`;
}

async function boardHtml() {
  const leads = await loadLeads();
  return `<div class="board">${STAGES.map(stage => {
    const rows = leads.filter(lead => lead.stage === stage);
    return `<section class="col"><h2>${STAGE_LABEL[stage]} <span class="muted">${rows.length}</span></h2>${rows.map(leadCard).join('') || '<p class="muted">None</p>'}</section>`;
  }).join('')}</div>`;
}

function addHtml() {
  return `<form class="panel" id="quickAdd">
    <h2>Log a WhatsApp chat</h2>
    <p class="sub">For a conversation that did not come through the website form. Big fields, one save.</p>
    <div class="field"><label for="qaPhone">WhatsApp number</label><input id="qaPhone" name="phone" inputmode="tel" autocomplete="tel" required placeholder="012 345 6789"></div>
    <div class="field"><label for="qaName">Name</label><input id="qaName" name="name" autocomplete="name" required></div>
    <div class="field"><label for="qaInterest">Workshop or interest</label><input id="qaInterest" name="interest" placeholder="Textured canvas, trial piano…"></div>
    <div class="field"><label for="qaNote">What they said</label><textarea id="qaNote" name="message"></textarea></div>
    <button class="btn" type="submit">Save lead</button>
    <p id="qaMsg"></p>
  </form>`;
}

async function peopleHtml() {
  const [{ data: contacts, error }, { data: bookings, error: bookErr }] = await Promise.all([
    sb.from('contacts').select('*').order('updated_at', { ascending: false }).limit(300),
    sb.from('bookings').select('id, contact_id, status, price_paid'),
  ]);
  if (error) throw error;
  if (bookErr) throw bookErr;
  const byContact = new Map();
  (bookings || []).forEach(row => {
    if (!byContact.has(row.contact_id)) byContact.set(row.contact_id, []);
    byContact.get(row.contact_id).push(row);
  });
  const cards = (contacts || []).map(person => {
    const rows = byContact.get(person.id) || [];
    const spend = rows.filter(row => row.status === 'paid' || row.status === 'attended').reduce((sum, row) => sum + Number(row.price_paid || 0), 0);
    return `<a class="person" href="#person/${person.id}">
      <div class="rowline"><b>${esc(person.name)}</b>${repeatCustomer(rows) ? '<span class="chip ok">Repeat</span>' : ''}</div>
      <div class="muted">${esc(person.phone || person.email || '')}</div>
      <div class="muted">${myr(spend)} spent · ${rows.filter(row => row.status !== 'cancelled').length} bookings</div>
    </a>`;
  }).join('');
  return `<div class="list">${cards || '<div class="empty">No customers yet. A saved lead creates one.</div>'}</div>`;
}

async function personHtml(id) {
  const [{ data: person, error }, { data: bookings, error: bErr }, { data: notes, error: nErr }, { data: leads, error: lErr }] = await Promise.all([
    sb.from('contacts').select('*').eq('id', id).maybeSingle(),
    sb.from('bookings').select('*, workshops(title, starts_at)').eq('contact_id', id).order('created_at', { ascending: false }),
    sb.from('activities').select('*').eq('contact_id', id).order('created_at', { ascending: false }).limit(40),
    sb.from('leads').select('id, stage, interest, created_at').eq('contact_id', id).order('created_at', { ascending: false }),
  ]);
  if (error || bErr || nErr || lErr) throw error || bErr || nErr || lErr;
  if (!person) return '<div class="empty">That customer was not found.</div>';
  const spend = (bookings || []).filter(row => row.status === 'paid' || row.status === 'attended').reduce((sum, row) => sum + Number(row.price_paid || 0), 0);
  const link = waHref(person.phone);
  return `<article class="panel">
      <div class="rowline"><h2>${esc(person.name)}</h2>${repeatCustomer(bookings) ? '<span class="chip ok">Repeat customer</span>' : ''}</div>
      <p class="muted">${esc(person.phone || '')}${person.email ? ' · ' + esc(person.email) : ''}</p>
      <p><b>${myr(spend)}</b> total spend</p>
      ${link ? `<p><a href="${esc(link)}" target="_blank" rel="noopener">Open WhatsApp</a></p>` : ''}
    </article>
    <section class="panel"><h2>Workshops</h2>
      ${(bookings || []).map(row => `<p>${esc(row.workshops?.title || 'Workshop')} · ${esc(day(row.workshops?.starts_at))} · ${esc(row.status)} · ${myr(row.price_paid)} · ${row.seats} seat${row.seats > 1 ? 's' : ''}</p>`).join('') || '<p class="muted">No bookings yet.</p>'}
    </section>
    <section class="panel"><h2>Enquiries</h2>
      ${(leads || []).map(row => `<p><a href="#lead/${row.id}">${esc(row.interest || 'Enquiry')}</a> · ${esc(STAGE_LABEL[row.stage] || row.stage)} · ${esc(when(row.created_at))}</p>`).join('') || '<p class="muted">None.</p>'}
    </section>
    <form class="panel" id="noteForm" data-contact="${person.id}">
      <h2>Add a note</h2>
      <div class="field"><label for="noteBody">Note</label><textarea id="noteBody" name="body" required></textarea></div>
      <button class="btn" type="submit">Save note</button>
    </form>
    <section class="panel"><h2>History</h2><div class="timeline">${(notes || []).map(row => `<article><b>${esc(row.kind)}</b> · <span class="muted">${esc(when(row.created_at))}</span><div>${esc(row.body)}</div></article>`).join('') || '<p class="muted">No notes yet.</p>'}</div></section>`;
}

async function workshopsHtml() {
  const [{ data: workshops, error }, { data: bookings, error: bErr }] = await Promise.all([
    sb.from('workshops').select('*').order('starts_at', { ascending: false }),
    sb.from('bookings').select('workshop_id, seats, price_paid, status'),
  ]);
  if (error || bErr) throw error || bErr;
  const cards = (workshops || []).map(row => {
    const stats = workshopStats(row, (bookings || []).filter(item => item.workshop_id === row.id));
    return `<a class="workshop" href="#workshop/${row.id}">
      <div class="rowline"><b>${esc(row.title)}</b><span class="muted">${esc(day(row.starts_at))}</span></div>
      <div class="muted">${stats.seats} / ${stats.capacity} seats · ${myr(stats.revenue)} revenue</div>
    </a>`;
  }).join('');
  return `${cards ? `<div class="list">${cards}</div>` : '<div class="empty">No workshops yet.</div>'}
    <form class="panel" id="workshopForm" style="margin-top:14px">
      <h2>Add a workshop</h2>
      <div class="field"><label for="wTitle">Title</label><input id="wTitle" name="title" required></div>
      <div class="field"><label for="wWhen">Date and time</label><input id="wWhen" name="starts_at" type="datetime-local"></div>
      <div class="split">
        <div class="field"><label for="wCap">Capacity</label><input id="wCap" name="capacity" type="number" min="1" value="8" required></div>
        <div class="field"><label for="wPrice">Price (RM)</label><input id="wPrice" name="price" type="number" min="0" step="1" value="0" required></div>
      </div>
      <div class="split">
        <div class="field"><label for="wEarly">Early-bird price</label><input id="wEarly" name="early_bird_price" type="number" min="0" step="1"></div>
        <div class="field"><label for="wSpend">Ad spend (RM)</label><input id="wSpend" name="ad_spend" type="number" min="0" step="1" value="0"></div>
      </div>
      <button class="btn" type="submit">Save workshop</button>
    </form>`;
}

async function workshopHtml(id) {
  const [{ data: workshop, error }, { data: bookings, error: bErr }] = await Promise.all([
    sb.from('workshops').select('*').eq('id', id).maybeSingle(),
    sb.from('bookings').select('*, contacts(name, phone)').eq('workshop_id', id).order('created_at'),
  ]);
  if (error || bErr) throw error || bErr;
  if (!workshop) return '<div class="empty">That workshop was not found.</div>';
  const stats = workshopStats(workshop, bookings || []);
  const pct = stats.capacity ? Math.min(100, Math.round(stats.seats / stats.capacity * 100)) : 0;
  const cost = stats.adCostPerBooking == null ? '—' : myr(stats.adCostPerBooking);
  return `<article class="panel">
      <h2>${esc(workshop.title)}</h2>
      <p class="muted">${esc(day(workshop.starts_at))} · ${myr(workshop.price)}${workshop.early_bird_price != null ? ' · early-bird ' + myr(workshop.early_bird_price) : ''}</p>
      <div class="statgrid">
        <div class="stat"><span class="muted">Seats sold</span><b>${stats.seats} / ${stats.capacity}</b></div>
        <div class="stat"><span class="muted">Revenue</span><b>${myr(stats.revenue)}</b></div>
        <div class="stat"><span class="muted">Ad spend</span><b>${myr(workshop.ad_spend)}</b></div>
        <div class="stat"><span class="muted">Ad cost / booking</span><b>${cost}</b></div>
      </div>
      <div class="bar" aria-hidden="true"><span style="width:${pct}%"></span></div>
    </article>
    <form class="panel" id="spendForm" data-id="${workshop.id}">
      <h2>Update price and ad spend</h2>
      <div class="split">
        <div class="field"><label for="editPrice">Price</label><input id="editPrice" name="price" type="number" min="0" step="1" value="${Number(workshop.price)}"></div>
        <div class="field"><label for="editEarly">Early-bird</label><input id="editEarly" name="early_bird_price" type="number" min="0" step="1" value="${workshop.early_bird_price ?? ''}"></div>
      </div>
      <div class="field"><label for="editSpend">Ad spend</label><input id="editSpend" name="ad_spend" type="number" min="0" step="1" value="${Number(workshop.ad_spend)}"></div>
      <button class="btn" type="submit">Save</button>
    </form>
    <section class="panel"><h2>Bookings</h2>
      ${(bookings || []).map(row => `<p>${esc(row.contacts?.name || 'Guest')} · ${esc(row.status)} · ${row.seats} · ${myr(row.price_paid)}</p>`).join('') || '<p class="muted">No seats sold yet.</p>'}
    </section>`;
}

async function leadHtml(id) {
  const { data: workshops } = await sb.from('workshops').select('id, title, starts_at, price, early_bird_price').order('starts_at', { ascending: false });
  const { data: lead, error } = await sb.from('leads').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!lead) return '<div class="empty">That lead was not found.</div>';
  const { data: notes } = await sb.from('activities').select('*').eq('lead_id', id).order('created_at', { ascending: false });
  const owners = staff.map(person => `<option value="${person.id}" ${person.id === lead.owner ? 'selected' : ''}>${esc(person.full_name)}</option>`).join('');
  const follow = needsFollowUp(lead);
  const localFollow = lead.next_follow_up_at ? toLocalInput(lead.next_follow_up_at) : '';
  return `<form class="panel" id="leadForm" data-id="${lead.id}" data-contact="${lead.contact_id || ''}">
      <div class="rowline"><h2>${esc(lead.name)}</h2>${follow ? '<span class="chip warn">Needs follow-up</span>' : ''}</div>
      <p class="muted">${esc(lead.phone)} ${lead.email ? '· ' + esc(lead.email) : ''}</p>
      <p>${esc(lead.interest || 'No workshop named')} · ${esc(lead.source)} · ${esc(lead.source_page || '')}</p>
      ${lead.message ? `<p>${esc(lead.message)}</p>` : ''}
      <p class="muted">UTM ${esc(lead.utm_source || '—')} / ${esc(lead.utm_campaign || '—')} ${lead.gclid ? '· Google click' : ''} ${lead.fbclid ? '· Meta click' : ''}</p>
      ${lead.contact_id ? `<p><a href="#person/${lead.contact_id}">Customer profile</a> · <a href="${esc(waHref(lead.phone))}" target="_blank" rel="noopener">WhatsApp</a></p>` : ''}
      <div class="split">
        <div class="field"><label for="leadStage">Stage</label><select id="leadStage" name="stage">${STAGES.map(stage => `<option value="${stage}" ${stage === lead.stage ? 'selected' : ''}>${STAGE_LABEL[stage]}</option>`).join('')}</select></div>
        <div class="field"><label for="leadOwner">Owner</label><select id="leadOwner" name="owner"><option value="">Unassigned</option>${owners}</select></div>
      </div>
      <div class="field"><label for="leadFollow">Next follow-up</label><input id="leadFollow" name="next_follow_up_at" type="datetime-local" value="${localFollow}"></div>
      <button class="btn" type="submit">Save lead</button>
    </form>
    <form class="panel" id="bookForm" data-lead="${lead.id}" data-contact="${lead.contact_id || ''}">
      <h2>Add a booking</h2>
      <div class="field"><label for="bookWorkshop">Workshop</label><select id="bookWorkshop" name="workshop_id"><option value="">No workshop yet</option>${(workshops || []).map(row => `<option value="${row.id}" data-price="${Number(row.early_bird_price ?? row.price)}">${esc(row.title)} · ${esc(day(row.starts_at))}</option>`).join('')}</select></div>
      <div class="split">
        <div class="field"><label for="bookSeats">Seats</label><input id="bookSeats" name="seats" type="number" min="1" value="1"></div>
        <div class="field"><label for="bookPrice">Price paid</label><input id="bookPrice" name="price_paid" type="number" min="0" step="1" value="0"></div>
      </div>
      <div class="field"><label for="bookStatus">Status</label><select id="bookStatus" name="status"><option value="reserved">Reserved</option><option value="paid">Paid</option><option value="attended">Attended</option><option value="cancelled">Cancelled</option></select></div>
      <button class="btn" type="submit">Save booking</button>
    </form>
    <form class="panel" id="noteForm" data-contact="${lead.contact_id || ''}" data-lead="${lead.id}">
      <h2>Note</h2>
      <div class="field"><label for="noteBody">What happened</label><textarea id="noteBody" name="body" required></textarea></div>
      <button class="btn" type="submit">Save note</button>
    </form>
    <section class="panel"><h2>History</h2><div class="timeline">${(notes || []).map(row => `<article><b>${esc(row.kind)}</b> · <span class="muted">${esc(when(row.created_at))}</span><div>${esc(row.body)}</div></article>`).join('') || '<p class="muted">No notes yet.</p>'}</div></section>`;
}

function toLocalInput(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function bind(view) {
  const list = view.querySelector('#leadList');
  const search = view.querySelector('#q');
  if (list && search) {
    const apply = () => {
      const q = search.value.trim().toLowerCase();
      const stage = view.querySelector('#stageFilter').value;
      const followOnly = view.querySelector('#followOnly').checked;
      view.querySelectorAll('#leadList .lead').forEach(card => {
        const text = card.textContent.toLowerCase();
        const stageOk = !stage || card.querySelector('.chip')?.textContent.toLowerCase() === STAGE_LABEL[stage].toLowerCase();
        const followOk = !followOnly || card.textContent.includes('Needs follow-up');
        card.hidden = !(text.includes(q) && stageOk && followOk);
      });
    };
    search.oninput = apply;
    view.querySelector('#stageFilter').onchange = apply;
    view.querySelector('#followOnly').onchange = apply;
  }

  const quick = view.querySelector('#quickAdd');
  if (quick) quick.onsubmit = async event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(quick));
    const msg = view.querySelector('#qaMsg');
    const { error } = await sb.from('leads').insert({
      name: data.name.trim(),
      phone: data.phone.trim(),
      interest: data.interest.trim() || null,
      message: data.message.trim() || null,
      source: 'whatsapp',
      source_page: '/admin/',
      stage: 'new',
    });
    if (error) { msg.innerHTML = `<span class="msg err">${esc(friendly(error.message))}</span>`; return; }
    quick.reset();
    msg.innerHTML = '<span class="msg ok">Saved. It is in the inbox.</span>';
  };

  const note = view.querySelector('#noteForm');
  if (note) note.onsubmit = async event => {
    event.preventDefault();
    const body = new FormData(note).get('body');
    const { error } = await sb.from('activities').insert({
      contact_id: note.dataset.contact || null,
      lead_id: note.dataset.lead || null,
      kind: 'note',
      body: String(body || '').trim(),
    });
    if (error) { alert(friendly(error.message)); return; }
    render();
  };

  const workshop = view.querySelector('#workshopForm');
  if (workshop) workshop.onsubmit = async event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(workshop));
    const { error } = await sb.from('workshops').insert({
      title: data.title.trim(),
      starts_at: data.starts_at ? new Date(data.starts_at).toISOString() : null,
      capacity: Number(data.capacity) || 8,
      price: Number(data.price) || 0,
      early_bird_price: data.early_bird_price === '' ? null : Number(data.early_bird_price),
      ad_spend: Number(data.ad_spend) || 0,
    });
    if (error) { alert(friendly(error.message)); return; }
    render();
  };

  const spend = view.querySelector('#spendForm');
  if (spend) spend.onsubmit = async event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(spend));
    const { error } = await sb.from('workshops').update({
      price: Number(data.price) || 0,
      early_bird_price: data.early_bird_price === '' ? null : Number(data.early_bird_price),
      ad_spend: Number(data.ad_spend) || 0,
    }).eq('id', spend.dataset.id);
    if (error) { alert(friendly(error.message)); return; }
    render();
  };

  const lead = view.querySelector('#leadForm');
  if (lead) lead.onsubmit = async event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(lead));
    const { error } = await sb.from('leads').update({
      stage: data.stage,
      owner: data.owner || null,
      next_follow_up_at: data.next_follow_up_at ? new Date(data.next_follow_up_at).toISOString() : null,
    }).eq('id', lead.dataset.id);
    if (error) { alert(friendly(error.message)); return; }
    render();
  };

  const booking = view.querySelector('#bookForm');
  if (booking) {
    const select = booking.querySelector('[name=workshop_id]');
    const price = booking.querySelector('[name=price_paid]');
    select.onchange = () => {
      const chosen = select.selectedOptions[0];
      if (chosen && chosen.dataset.price) price.value = chosen.dataset.price;
    };
    booking.onsubmit = async event => {
      event.preventDefault();
      if (!booking.dataset.contact) { alert('This lead has no customer yet. Reload after the migration trigger has linked one.'); return; }
      const data = Object.fromEntries(new FormData(booking));
      const { error } = await sb.from('bookings').insert({
        contact_id: Number(booking.dataset.contact),
        lead_id: Number(booking.dataset.lead),
        workshop_id: data.workshop_id ? Number(data.workshop_id) : null,
        seats: Number(data.seats) || 1,
        price_paid: Number(data.price_paid) || 0,
        status: data.status,
      });
      if (error) { alert(friendly(error.message)); return; }
      const stage = data.status === 'paid' || data.status === 'attended' ? data.status : 'booked';
      if (data.status !== 'cancelled') await sb.from('leads').update({ stage }).eq('id', booking.dataset.lead);
      render();
    };
  }
}

boot();
