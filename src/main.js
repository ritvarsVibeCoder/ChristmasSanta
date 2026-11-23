import './style.css';
import { api } from './api.js';
import { icons, snowflake, garland } from './icons.js';
import { createScratchCard } from './scratch.js';
import { adventParticipantPage, adventOrganizerPage } from './advent.js';

const app = document.getElementById('app');
const STORAGE_KEY = 'secret-santa.events';

// ---------- helpers ----------

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const budget = (min, max) => (min === max ? `€${min}` : `€${min}–€${max}`);

const baseUrl = () => `${location.origin}${location.pathname}`;
const participantUrl = (token) => `${baseUrl()}#/s/${token}`;
const organizerUrl = (token) => `${baseUrl()}#/o/${token}`;

function loadSaved() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}
function saveEvent(ev) {
  try {
    const list = loadSaved().filter((e) => e.admin_token !== ev.admin_token);
    list.unshift({ name: ev.name, admin_token: ev.admin_token, created_at: ev.created_at });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 20)));
  } catch {
    /* storage unavailable: fine, the organizer link still works */
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

let toastTimer;
function toast(msg) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

const header = (role, backHref) => `
  <header class="topbar">
    ${backHref ? `<a class="icon-btn back" href="${backHref}" aria-label="Back">${icons.back()}</a>` : ''}
    <a class="brand" href="#/">${icons.star(28)}<span>Secret Santa</span></a>
    ${role ? `<span class="role">${role}</span>` : ''}
  </header>`;

const flakes = () => `
  <div class="flakes" aria-hidden="true">
    ${snowflake(22, 0.55, 'f1')}${snowflake(12, 0.4, 'f2')}${snowflake(16, 0.35, 'f3')}
    ${snowflake(20, 0.4, 'f4')}${snowflake(14, 0.35, 'f5')}${snowflake(18, 0.3, 'f6')}
  </div>`;

function loading(text = 'Loading…') {
  app.innerHTML = `<div class="page center">${flakes()}<div class="loading"><span class="spinner" aria-hidden="true"></span>${esc(text)}</div></div>`;
}

function errorPage(title, message) {
  app.innerHTML = `
    <div class="page">
      ${flakes()}
      <div class="wrap narrow">
        ${header('')}
        <section class="hero">
          <h1>${esc(title)}</h1>
          <p class="lede">${esc(message)}</p>
        </section>
        <a class="btn btn-gold" href="#/">Start a new draw</a>
      </div>
    </div>`;
}

// ---------- router ----------

let cleanup = null;

function route() {
  if (cleanup) {
    cleanup();
    cleanup = null;
  }
  window.scrollTo(0, 0);
  const hash = location.hash.replace(/^#/, '');
  const m = hash.match(/^\/(o|s)\/([A-Za-z0-9_-]{8,64})(\/advent)?$/);
  if (m && m[3] && m[1] === 'o') return adventOrganizerPage(m[2], adventUi());
  if (m && m[3] && m[1] === 's') return adventParticipantPage(m[2], adventUi());
  if (m && m[1] === 'o') return organizerPage(m[2]);
  if (m && m[1] === 's') return participantPage(m[2]);
  return homePage();
}

// Shared helpers handed to the Advent calendar pages (src/advent.js).
function adventUi() {
  return {
    app,
    esc,
    toast,
    flakes,
    loading,
    errorPage,
    burstConfetti,
    setCleanup: (fn) => {
      cleanup = fn;
    },
  };
}

const CAL_ICON = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>`;

const adventEntry = (token) => `
  <a class="advent-entry" href="#/s/${esc(token)}/advent">
    <span class="ae-ico">${CAL_ICON}</span>
    <span class="ae-text"><strong>Adventes kalendārs</strong><span class="ae-sub">Ģimenes atmiņu spēle — atver durvis katru dienu</span></span>
    <span class="ae-go" aria-hidden="true">›</span>
  </a>`;

window.addEventListener('hashchange', route);

// ---------- home: create the draw ----------

function homePage() {
  const state = {
    name: `Family Secret Santa ${new Date().getFullYear()}`,
    min: 20,
    max: 30,
    people: [],
    busy: false,
    error: '',
  };

  const saved = loadSaved();

  app.innerHTML = `
    <div class="page page-home">
      ${flakes()}
      <div class="wrap home-grid">
        <div class="home-intro">
          ${header('Organizer')}
          <section class="hero">
            <h1>Set up your <em>family draw</em></h1>
            <p class="lede">Add everyone taking part. Each person gets a private magic link to scratch and find out who they’re gifting.</p>
          </section>
          <div class="note desktop-only">
            ${icons.shield()}
            <p>Nobody draws themselves, and the names stay hidden — even from you.</p>
          </div>
          ${
            saved.length
              ? `<div class="saved desktop-only-block">
                  <h2>Your draws on this device</h2>
                  ${saved.map((e) => `<a class="saved-item" href="#/o/${esc(e.admin_token)}">${icons.gift(18)}<span>${esc(e.name)}</span></a>`).join('')}
                </div>`
              : ''
          }
        </div>

        <form class="card form" novalidate>
          <div class="field">
            <label for="evname">Event name</label>
            <input id="evname" name="evname" maxlength="80" autocomplete="off" value="${esc(state.name)}">
          </div>

          <div class="field">
            <span class="label" id="budget-label">Gift budget</span>
            <div class="budget-row" role="group" aria-labelledby="budget-label">
              <label class="money">€ <input id="bmin" inputmode="numeric" aria-label="Minimum budget in euros" value="${state.min}"></label>
              <span class="to">to</span>
              <label class="money">€ <input id="bmax" inputmode="numeric" aria-label="Maximum budget in euros" value="${state.max}"></label>
            </div>
          </div>

          <div class="divider"></div>

          <div class="field">
            <div class="field-head">
              <span class="label">Participants</span>
              <span class="count" id="count"></span>
            </div>
            <div class="chips" id="chips"></div>
            <div class="add-row">
              <label for="addname" class="sr-only">Add a name</label>
              <input id="addname" maxlength="40" placeholder="Add a name…" autocomplete="off" enterkeyhint="done">
              <button type="button" class="btn-add" id="addbtn">${icons.plus()}Add</button>
            </div>
          </div>

          <div class="form-error" id="formerr" role="alert" hidden></div>

          <button type="submit" class="btn btn-red btn-big" id="submit">
            ${icons.gift(20)}<span>Draw names &amp; create links</span>
          </button>
        </form>

        <div class="note mobile-only">
          ${icons.shield()}
          <p>Nobody draws themselves, and the names stay hidden — even from you.</p>
        </div>

        ${
          saved.length
            ? `<div class="saved mobile-only-block">
                <h2>Your draws on this device</h2>
                ${saved.map((e) => `<a class="saved-item" href="#/o/${esc(e.admin_token)}">${icons.gift(18)}<span>${esc(e.name)}</span></a>`).join('')}
              </div>`
            : ''
        }
      </div>
    </div>`;

  const form = app.querySelector('form');
  const chips = app.querySelector('#chips');
  const count = app.querySelector('#count');
  const addInput = app.querySelector('#addname');
  const errBox = app.querySelector('#formerr');
  const submit = app.querySelector('#submit');

  function showError(msg) {
    state.error = msg;
    errBox.textContent = msg;
    errBox.hidden = !msg;
  }

  function renderChips() {
    chips.innerHTML = state.people.length
      ? state.people
          .map(
            (p, i) =>
              `<span class="chip">${esc(p)}<button type="button" class="chip-x" data-remove="${i}" aria-label="Remove ${esc(p)}">${icons.close()}</button></span>`,
          )
          .join('')
      : `<span class="chips-empty">No one yet — add at least 3 people.</span>`;
    const n = state.people.length;
    count.textContent = n === 1 ? '1 person' : `${n} people`;
  }

  function addPerson() {
    // Allow pasting several names at once, separated by commas or new lines.
    const parts = addInput.value
      .split(/[,\n]/)
      .map((s) => s.trim().replace(/\s+/g, ' '))
      .filter(Boolean);
    if (!parts.length) {
      addInput.focus();
      return;
    }
    for (const name of parts) {
      if (name.length > 40) {
        showError('Names can be at most 40 characters.');
        return;
      }
      if (state.people.some((p) => p.toLowerCase() === name.toLowerCase())) {
        showError(`${name} is already on the list.`);
        return;
      }
      if (state.people.length >= 50) {
        showError('A draw can have at most 50 people.');
        return;
      }
      state.people.push(name);
    }
    showError('');
    addInput.value = '';
    renderChips();
    addInput.focus();
  }

  app.querySelector('#addbtn').addEventListener('click', addPerson);
  addInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addPerson();
    }
  });
  chips.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove]');
    if (!btn) return;
    state.people.splice(Number(btn.dataset.remove), 1);
    renderChips();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (state.busy) return;
    if (addInput.value.trim()) addPerson();

    const name = app.querySelector('#evname').value.trim();
    const min = parseInt(app.querySelector('#bmin').value, 10);
    const max = parseInt(app.querySelector('#bmax').value, 10);

    if (!name) return showError('Give the event a name.');
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < 0)
      return showError('Enter the budget as whole euros, for example 20 and 30.');
    if (min > max) return showError('The minimum budget can’t be higher than the maximum.');
    if (state.people.length < 3) return showError('Add at least 3 people to the draw.');

    showError('');
    state.busy = true;
    submit.disabled = true;
    submit.querySelector('span').textContent = 'Drawing names…';
    try {
      const ev = await api.createEvent(name, min, max, state.people);
      saveEvent(ev);
      location.hash = `#/o/${ev.admin_token}`;
    } catch (err) {
      showError(err.message);
      state.busy = false;
      submit.disabled = false;
      submit.querySelector('span').textContent = 'Draw names & create links';
    }
  });

  renderChips();
}

// ---------- organizer dashboard ----------

const AVATAR_COLORS = ['#C8283A', '#0E3A2C', '#B07A12', '#2F5E8A', '#7E1422', '#3E6B4F', '#8A4B9C', '#A0650B'];

function statusOf(p) {
  if (p.revealed_at) return { key: 'revealed', label: 'Revealed' };
  if (p.opened_at) return { key: 'opened', label: 'Opened, not scratched' };
  return { key: 'waiting', label: 'Not opened yet' };
}

async function organizerPage(adminToken) {
  loading();
  let ev;
  try {
    ev = await api.getEventAdmin(adminToken);
  } catch (err) {
    return errorPage('Link not found', 'This organizer link doesn’t work. Check that you copied the whole link.');
  }
  saveEvent(ev);

  const canShare = typeof navigator.share === 'function';
  const copied = new Set();

  function shareText(p) {
    return `Hi ${p.name}! Here’s your Secret Santa link for “${ev.name}” (gift budget ${budget(ev.budget_min, ev.budget_max)}). Open it yourself — it’s just for you:`;
  }

  function render() {
    const total = ev.participants.length;
    const opened = ev.participants.filter((p) => p.opened_at).length;
    const revealed = ev.participants.filter((p) => p.revealed_at).length;

    app.innerHTML = `
      <div class="page page-org">
        ${flakes()}
        <div class="wrap">
          ${header('Organizer', '#/')}
          <section class="hero">
            <span class="badge">${icons.check(14)}Names drawn</span>
            <h1>${esc(ev.name)}</h1>
            <p class="lede">Send each person their link by WhatsApp, email or text. Each one opens a private scratch card.</p>
          </section>

          <div class="org-grid">
            <aside class="org-side">
              <div class="panel stats">
                <div class="stat-budget">
                  <span class="muted-label">Gift budget</span>
                  <span class="big-num">${budget(ev.budget_min, ev.budget_max)}</span>
                </div>
                <div class="panel-divider"></div>
                <div class="stat-row">
                  <div><span class="num">${total}</span><span class="muted-label">People</span></div>
                  <div><span class="num gold">${opened}</span><span class="muted-label">Opened</span></div>
                  <div><span class="num gold">${revealed}</span><span class="muted-label">Revealed</span></div>
                </div>
                <div class="progress" aria-hidden="true">
                  <span style="width:${total ? (revealed / total) * 100 : 0}%" class="p-rev"></span>
                  <span style="width:${total ? ((opened - revealed) / total) * 100 : 0}%" class="p-open"></span>
                </div>
              </div>

              <div class="panel org-link">
                <div class="org-link-head">${icons.key()}<strong>Your organizer link</strong></div>
                <p>Bookmark or save this link — it’s how you get back to this page. Don’t share it.</p>
                <button type="button" class="btn btn-outline" data-copy-org>${icons.copy()}Copy organizer link</button>
              </div>

              <div class="panel org-link org-advent">
                <div class="org-link-head">${CAL_ICON}<strong>Adventes kalendārs</strong></div>
                <p>Ģimenes atmiņu spēle decembrī: apstipriniet atmiņas un ielieciet tās kalendāra dienās.</p>
                <a class="btn btn-gold" href="#/o/${esc(adminToken)}/advent">Atvērt kalendāra pārvaldību</a>
              </div>

              <div class="panel note-panel">
                ${icons.shield()}
                <p>You only see who has opened their link — never who drew whom. Nobody draws themselves.</p>
              </div>

              <button type="button" class="btn btn-ghost" data-redraw>${icons.redo()}Redraw names</button>
            </aside>

            <section class="card links-card" aria-labelledby="links-h">
              <div class="links-head">
                <h2 id="links-h">Magic links</h2>
                <div class="links-actions">
                  <button type="button" class="icon-btn light" data-refresh aria-label="Refresh status">${icons.refresh()}</button>
                  <button type="button" class="btn btn-gold btn-sm" data-copy-all>${icons.copy()}Copy all</button>
                </div>
              </div>
              <ul class="people">
                ${ev.participants
                  .map((p, i) => {
                    const s = statusOf(p);
                    const isCopied = copied.has(p.token);
                    return `
                    <li class="person">
                      <span class="avatar" style="background:${AVATAR_COLORS[i % AVATAR_COLORS.length]}">${esc(p.name.charAt(0).toUpperCase())}</span>
                      <div class="person-main">
                        <span class="person-name">${esc(p.name)}</span>
                        <span class="status ${s.key}"><span class="dot"></span>${s.label}</span>
                      </div>
                      <span class="link-text" title="${esc(participantUrl(p.token))}">${esc(participantUrl(p.token).replace(/^https?:\/\//, ''))}</span>
                      <div class="person-actions">
                        ${
                          canShare
                            ? `<button type="button" class="icon-btn outline" data-share="${i}" aria-label="Share ${esc(p.name)}’s link">${icons.share()}</button>`
                            : ''
                        }
                        <button type="button" class="btn btn-sm ${isCopied ? 'btn-copied' : 'btn-outline-dark'}" data-copy="${i}">
                          ${isCopied ? `${icons.check()}Copied` : `${icons.link()}Copy link`}
                        </button>
                      </div>
                    </li>`;
                  })
                  .join('')}
              </ul>
              <div class="warn">
                ${icons.warn()}
                <p>Don’t open other people’s links — that would reveal their match. The status updates automatically.</p>
              </div>
            </section>
          </div>
        </div>
      </div>`;
  }

  async function refresh(showToast) {
    try {
      ev = await api.getEventAdmin(adminToken);
      render();
      if (showToast) toast('Status updated');
    } catch {
      if (showToast) toast('Couldn’t refresh — check your connection');
    }
  }

  app.addEventListener('click', onClick);
  async function onClick(e) {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.hasAttribute('data-copy')) {
      const p = ev.participants[Number(t.dataset.copy)];
      if (await copyText(participantUrl(p.token))) {
        copied.add(p.token);
        render();
        toast(`${p.name}’s link copied`);
      } else toast('Couldn’t copy — press and hold the link instead');
    } else if (t.hasAttribute('data-share')) {
      const p = ev.participants[Number(t.dataset.share)];
      try {
        await navigator.share({ title: 'Your Secret Santa link', text: shareText(p), url: participantUrl(p.token) });
        copied.add(p.token);
        render();
      } catch {
        /* cancelled */
      }
    } else if (t.hasAttribute('data-copy-all')) {
      const text = `${ev.name} — Secret Santa links (budget ${budget(ev.budget_min, ev.budget_max)})\n\n${ev.participants
        .map((p) => `${p.name}: ${participantUrl(p.token)}`)
        .join('\n')}`;
      if (await copyText(text)) {
        ev.participants.forEach((p) => copied.add(p.token));
        render();
        toast('All links copied');
      } else toast('Couldn’t copy');
    } else if (t.hasAttribute('data-copy-org')) {
      (await copyText(organizerUrl(adminToken))) ? toast('Organizer link copied') : toast('Couldn’t copy');
    } else if (t.hasAttribute('data-refresh')) {
      refresh(true);
    } else if (t.hasAttribute('data-redraw')) {
      const ok = window.confirm(
        'Redraw all names?\n\nEveryone keeps the same link, but they will get a new person. Anyone who already scratched their card will need to scratch again.',
      );
      if (!ok) return;
      try {
        ev = await api.redrawEvent(adminToken);
        render();
        toast('Names redrawn');
      } catch (err) {
        toast(err.message);
      }
    }
  }

  const timer = setInterval(() => {
    if (document.visibilityState === 'visible') refresh(false);
  }, 20000);

  cleanup = () => {
    clearInterval(timer);
    app.removeEventListener('click', onClick);
  };

  render();
}

// ---------- participant: scratch & reveal ----------

async function participantPage(token) {
  loading('Opening your card…');
  let card;
  try {
    card = await api.openCard(token);
  } catch {
    return errorPage('Link not found', 'This Secret Santa link doesn’t work. Ask the organizer to send it again.');
  }

  if (card.revealed && card.receiver_name) return renderRevealed(card, false, token);
  renderScratch(token, card);
}

function infoTiles(card) {
  return `
    <div class="tiles">
      <div class="tile"><span class="muted-label">Budget</span><span class="tile-num">${budget(card.budget_min, card.budget_max)}</span></div>
      <div class="tile"><span class="muted-label">Participants</span><span class="tile-num">${card.participant_count} people</span></div>
    </div>`;
}

function renderScratch(token, card) {
  app.innerHTML = `
    <div class="page page-card">
      ${garland()}
      ${flakes()}
      <div class="wrap card-grid">
        <section class="hero hero-card">
          <span class="eyebrow">${esc(card.event_name)}</span>
          <h1>Ho ho ho, <em>${esc(card.my_name)}!</em></h1>
          <p class="lede">
            <span class="touch-only">Scratch the golden card with your finger to find out who you’re buying a gift for.</span>
            <span class="mouse-only">Drag your mouse over the golden card to scratch it off and see who you’re buying a gift for.</span>
          </p>
          <div class="desktop-only">${infoTiles(card)}</div>
        </section>

        <div class="scratch-col">
          <div class="ticket">
            <div class="ticket-inner">
              <div class="under">
                <span class="under-label">You’re gifting</span>
                <span class="under-name" id="match" aria-live="polite">…</span>
              </div>
              <canvas class="foil" aria-label="Scratch card. Scratch or use the reveal button." role="img"></canvas>
            </div>
          </div>
          <p class="scratch-hint">
            ${icons.hand()}
            <span><span class="touch-only">Rub with your finger — or</span><span class="mouse-only">Scratch with your mouse — or</span></span>
            <button type="button" class="link-btn" id="revealbtn">tap to reveal</button>
          </p>
          <div class="form-error" id="carderr" role="alert" hidden></div>
          ${adventEntry(token)}
        </div>

        <div class="mobile-only">${infoTiles(card)}</div>
      </div>
    </div>`;

  const canvas = app.querySelector('canvas.foil');
  const matchEl = app.querySelector('#match');
  const errEl = app.querySelector('#carderr');
  let revealPromise = null;
  let gone = false;

  function fetchMatch() {
    if (!revealPromise) {
      revealPromise = api
        .revealCard(token)
        .then((r) => {
          matchEl.textContent = r.receiver_name;
          return r.receiver_name;
        })
        .catch((err) => {
          revealPromise = null;
          errEl.textContent = 'Couldn’t load your match. Check your connection and try again.';
          errEl.hidden = false;
          throw err;
        });
    }
    return revealPromise;
  }

  const sc = createScratchCard(canvas, {
    onFirstScratch: () => fetchMatch().catch(() => {}),
    onDone: async () => {
      try {
        const name = await fetchMatch();
        setTimeout(() => {
          if (!gone) renderRevealed({ ...card, receiver_name: name }, true, token);
        }, 900);
      } catch {
        /* error already shown */
      }
    },
  });

  app.querySelector('#revealbtn').addEventListener('click', () => sc.reveal());
  cleanup = () => {
    gone = true;
  };
}

function renderRevealed(card, celebrate, token) {
  window.getSelection?.().removeAllRanges();
  app.innerHTML = `
    <div class="page page-card page-revealed">
      ${celebrate ? '<div class="confetti" aria-hidden="true"></div>' : ''}
      ${flakes()}
      <div class="wrap card-grid">
        <section class="hero hero-card">
          ${icons.star(40)}
          <span class="eyebrow mobile-only">${esc(card.my_name)}, you’re the Secret Santa for</span>
          <h1 class="sr-only mobile-only">Your Secret Santa match: ${esc(card.receiver_name)}</h1>
          <div class="desktop-only hero-stack">
            <span class="eyebrow">${esc(card.event_name)}</span>
            <h1>Merry Christmas, <em>${esc(card.my_name)}!</em></h1>
            <p class="lede">You’re the Secret Santa for ${esc(card.receiver_name)}. Pick something lovely for ${budget(card.budget_min, card.budget_max)} and keep it a secret until the gifts are opened.</p>
          </div>
        </section>

        <div class="scratch-col">
          <div class="ticket">
            <div class="ticket-inner revealed">
              <span class="under-name big">${esc(card.receiver_name)}</span>
              <span class="pill">${icons.gift(16)}Gift budget ${budget(card.budget_min, card.budget_max)}</span>
            </div>
          </div>
          ${adventEntry(token)}
        </div>

        <div class="tips">
          <div class="tip">
            ${icons.lock()}
            <div><strong>Keep it a secret</strong><span>Only you can see this. Don’t tell ${esc(card.receiver_name)} — or anyone else.</span></div>
          </div>
          <div class="tip">
            ${icons.link(22)}
            <div><strong>Come back anytime</strong><span>Open your link again whenever you forget. Your result stays the same.</span></div>
          </div>
        </div>

        <p class="merry">Merry Christmas!</p>
      </div>
    </div>`;

  if (celebrate) burstConfetti(app.querySelector('.confetti'));
}

function burstConfetti(el) {
  if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const colors = ['#E9B949', '#C8283A', '#FFF6E5', '#F6D47E'];
  const frag = document.createDocumentFragment();
  for (let i = 0; i < 70; i++) {
    const s = document.createElement('span');
    s.style.left = `${Math.random() * 100}%`;
    s.style.background = colors[i % colors.length];
    s.style.animationDelay = `${Math.random() * 0.6}s`;
    s.style.animationDuration = `${2.4 + Math.random() * 1.8}s`;
    s.style.setProperty('--drift', `${(Math.random() - 0.5) * 160}px`);
    s.style.setProperty('--rot', `${Math.random() * 720 - 360}deg`);
    if (i % 5 === 0) s.className = 'round';
    frag.appendChild(s);
  }
  el.appendChild(frag);
  setTimeout(() => el.remove(), 5000);
}

route();
