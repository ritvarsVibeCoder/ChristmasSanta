// Adventes kalendārs — ģimenes atmiņu minēšanas spēle.
// Participant view:  #/s/<token>/advent   (same magic link token)
// Organizer view:    #/o/<admin_token>/advent
// All rules and scoring live in the database; this file only renders.

import './advent.css';
import { api } from './api.js';
import { icons } from './icons.js';

// ---------- small helpers ----------

const lvPlural = (n, one, many) => (n % 10 === 1 && n % 100 !== 11 ? one : many);
const dienas = (n) => `${n} ${lvPlural(n, 'diena', 'dienas')}`;
const punkti = (n) => `${n} ${lvPlural(n, 'punkts', 'punkti')}`;
const decDate = (d) => `${d}. decembris`;
// Accusative: "saņemsi 7 punktus", "saņemsi 1 punktu".
const punktusAcc = (n) => `${n} ${lvPlural(n, 'punktu', 'punktus')}`;

const TIMEZONES = [
  ['Europe/Riga', 'Latvija (Rīga)'],
  ['Europe/Vilnius', 'Lietuva (Viļņa)'],
  ['Europe/Tallinn', 'Igaunija (Tallina)'],
  ['Europe/Helsinki', 'Somija (Helsinki)'],
  ['Europe/Stockholm', 'Zviedrija (Stokholma)'],
  ['Europe/Berlin', 'Vācija (Berlīne)'],
  ['Europe/Amsterdam', 'Nīderlande (Amsterdama)'],
  ['Europe/Dublin', 'Īrija (Dublina)'],
  ['Europe/London', 'Lielbritānija (Londona)'],
  ['America/New_York', 'ASV austrumkrasts (Ņujorka)'],
  ['America/Chicago', 'ASV centrs (Čikāga)'],
  ['America/Los_Angeles', 'ASV rietumkrasts (Losandželosa)'],
  ['Australia/Sydney', 'Austrālija (Sidneja)'],
];
const tzLabel = (tz) => {
  if (tz === 'Europe/Riga') return 'pēc Latvijas laika';
  const t = TIMEZONES.find(([id]) => id === tz);
  return `pēc laika joslas: ${t ? t[1] : tz}`;
};
const DEFAULT_SETTINGS = {
  tz: 'Europe/Riga',
  correct_points: 7,
  streak_bonuses: [
    { days: 3, points: 1 },
    { days: 5, points: 1 },
    { days: 7, points: 2 },
    { days: 14, points: 2 },
  ],
  complete_bonus: 3,
  second_try_points: 4,
};

const advIcons = {
  lock: (s = 18) =>
    `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`,
  check: (s = 28) =>
    `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>`,
  cross: (s = 24) =>
    `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg>`,
  flake: (s = 24) =>
    `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7M9 4l3 2 3-2M9 20l3-2 3 2"/></svg>`,
  quote: () =>
    `<svg width="34" height="34" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 7H6a2 2 0 0 0-2 2v4h4v4l3-4V9a2 2 0 0 0-1-2zm10 0h-4a2 2 0 0 0-2 2v4h4v4l3-4V9a2 2 0 0 0-1-2z" fill="currentColor"/></svg>`,
  pen: () =>
    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>`,
  trash: () =>
    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>`,
  calendar: (s = 22) =>
    `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>`,
  fire: () =>
    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22c4 0 7-3 7-7 0-4-3-6-4-10-2 2-3 4-3 6-1-1-2-2-2-4-3 3-5 5-5 8 0 4 3 7 7 7z"/></svg>`,
  trophy: () =>
    `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/></svg>`,
  badge: () => `
    <svg class="badge-svg" viewBox="0 0 120 140" aria-hidden="true">
      <path d="M38 78 L26 136 L46 124 L56 140 L62 84 Z" fill="#C8283A"/>
      <path d="M82 78 L94 136 L74 124 L64 140 L58 84 Z" fill="#A61E2E"/>
      <circle cx="60" cy="58" r="50" fill="#E9B949"/>
      <circle cx="60" cy="58" r="42" fill="#F6D47E"/>
      <circle cx="60" cy="58" r="42" fill="none" stroke="#C98F2A" stroke-width="2" stroke-dasharray="3 5"/>
      <path d="M60 26l8.5 20.2 21.9 1.8-16.6 14.3 5 21.4L60 72.2 41.2 83.7l5-21.4L29.6 48l21.9-1.8z" fill="#C8283A"/>
    </svg>`,
};

const lights = () => {
  const colors = ['#C8283A', '#E9B949', '#3E9B6B', '#FFF6E5', '#2F7FC1'];
  let bulbs = '';
  for (let i = 0; i < 14; i++) {
    const x = 14 + i * 28;
    const y = 10 + Math.sin((i / 13) * Math.PI) * 18;
    bulbs += `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + 6}" stroke="#2c4a3d" stroke-width="2"/>
      <rect x="${x - 3}" y="${y + 5}" width="6" height="4" rx="1" fill="#556b5f"/>
      <ellipse class="bulb b${i % 4}" cx="${x}" cy="${y + 15}" rx="5" ry="7" fill="${colors[i % colors.length]}"/>`;
  }
  return `<svg class="adv-lights" viewBox="0 0 392 52" preserveAspectRatio="xMidYMin meet" aria-hidden="true">
    <path d="M0 8 Q 196 50 392 8" fill="none" stroke="#2c4a3d" stroke-width="2"/>${bulbs}</svg>`;
};

// ======================================================================
// Participant
// ======================================================================

export async function adventParticipantPage(token, ui, initialTab = 'calendar', qid = null) {
  const { app, esc, toast, flakes, loading, errorPage, setCleanup, burstConfetti } = ui;
  loading('Atveram adventes kalendāru…');

  let st;
  try {
    st = await api.adventState(token);
  } catch {
    return errorPage('Saite nav atrasta', 'Šī saite nedarbojas. Palūdz organizatoram to atsūtīt vēlreiz.');
  }

  const view = { tab: initialTab, qid, memories: null, editingId: null, finale: null, sheetDay: null };
  let alive = true;
  let pendingRender = false;

  async function reloadState() {
    try {
      st = await api.adventState(token);
      if (!alive) return;
      if (view.sheetDay) pendingRender = true; // refresh the doors once the sheet closes
      else render();
    } catch {
      /* keep the old state */
    }
  }

  // ----- pages (one thing per page) -----
  // Each page has its own address, so the back arrow can follow the order you came in.

  const T = `#/s/${esc(token)}`;
  const pageHref = {
    card: T,
    calendar: `${T}/advent`,
    rules: `${T}/advent/noteikumi`,
    memories: `${T}/advent/atminas`,
    saved: `${T}/advent/saglabatas`,
    finale: `${T}/advent/finals`,
  };
  // Where the back arrow goes if the page was opened straight from a link (no history yet).
  const parentOf = { calendar: 'card', rules: 'calendar', memories: 'card', write: 'memories', saved: 'memories', finale: 'calendar' };

  function shell(title, body) {
    const back = pageHref[parentOf[view.tab]] || T;
    return `
      <div class="page page-advent">
        ${lights()}
        ${flakes()}
        <div class="wrap adv-wrap">
          <header class="topbar adv-top">
            <a class="icon-btn back" href="${back}" data-back aria-label="Atpakaļ">${icons.back()}</a>
            <h1 class="adv-title">${title}</h1>
          </header>
          <div class="adv-body">${body}</div>
        </div>
        <div class="sheet-backdrop" hidden></div>
        <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-h" hidden></div>
      </div>`;
  }

  // Small red box: who you're buying a gift for (only after the card is scratched).
  function santaStrip() {
    const sb = st.santa;
    if (!sb) return '';
    if (sb.revealed && sb.receiver_name) {
      return `<div class="santa-strip"><span class="ss-k">Tu gādā dāvanu</span><strong>${esc(sb.receiver_name)}</strong></div>`;
    }
    return `<a class="santa-strip pending" href="${T}"><span class="ss-k">Slepenais rūķītis</span><strong>Nokasi biļeti ›</strong></a>`;
  }

  function doorHtml(d) {
    const isToday = d.day === st.today;
    const labels = {
      locked: `${d.day}. durvis, aizvērtas`,
      empty: `${d.day}. durvis, bez atmiņas`,
      own: `${d.day}. durvis, tava atmiņa`,
      open: `${d.day}. durvis, vēl jāmin`,
      correct: `${d.day}. durvis, uzminēts pareizi`,
      wrong: `${d.day}. durvis, neuzminēts`,
      retry: `${d.day}. durvis, vēl viens mēģinājums`,
    };
    const inner = {
      locked: '',
      empty: `<span class="door-ico muted">${advIcons.flake(22)}</span>`,
      own: `<span class="door-ico gold">${icons.star(26)}</span><span class="door-cap">Tava</span>`,
      open: `<span class="door-q">?</span>`,
      correct: `<span class="door-ico green">${advIcons.check()}</span>`,
      wrong: `<span class="door-ico red">${advIcons.cross()}</span>`,
      retry: `<span class="door-q retry">?</span><span class="door-cap">2. mēģinājums</span>`,
    }[d.state];
    const closed = d.state === 'locked' || d.state === 'open';
    return `
      <button type="button" class="door s-${d.state} ${isToday ? 'today' : ''} ${closed ? 'closed' : 'opened'} v${d.day % 4}"
              data-day="${d.day}" aria-label="${labels[d.state]}${isToday ? ', šodien' : ''}">
        <span class="door-inside">${inner}<span class="door-num-small">${d.day}</span></span>
        ${
          closed
            ? `<span class="door-front"><span class="door-num">${d.day}</span>${
                d.state === 'locked' ? `<span class="door-lock">${advIcons.lock(14)}</span>` : '<span class="door-knob"></span>'
              }</span>`
            : ''
        }
        ${isToday ? '<span class="door-today">Šodien</span>' : ''}
      </button>`;
  }

  function calendarView() {
    const total = st.score ? st.score.total : 0;
    let notice = '';
    if (st.today < 1) {
      notice = `
        <div class="adv-cta">
          <p>Kalendārs atvērsies <b>1. decembrī</b>. Līdz tam uzraksti dažas atmiņas!</p>
          <a class="adv-cta-btn" href="${pageHref.memories}">${advIcons.pen()}<span>Rakstīt atmiņas</span><span aria-hidden="true">›</span></a>
        </div>`;
    } else if (st.finale) {
      notice = `<a class="adv-notice gold" href="${pageHref.finale}"><span><b>Fināls!</b> Apskati, kurš uzvarēja</span><span aria-hidden="true">›</span></a>`;
    }
    return `
      <div class="adv-minirow">
        ${santaStrip()}
        <div class="points-box"><span class="ss-k">Punkti</span><strong>${total}</strong></div>
      </div>
      ${notice}
      <a class="how-box" href="${pageHref.rules}">
        <span class="how-ico" aria-hidden="true">?</span>
        <span class="how-txt"><strong>Kā spēlēt?</strong><small>Noteikumi un kā krāt punktus</small></span>
        <span class="how-go" aria-hidden="true">›</span>
      </a>
      <section class="adv-cal" aria-label="Adventes kalendārs">
        <div class="adv-cal-grid">${st.days.map(doorHtml).join('')}</div>
      </section>`;
  }

  function rulesView() {
    const c = st.config;
    const extras = [...c.streak_bonuses.map((b) => b.points), ...(c.complete_bonus ? [c.complete_bonus] : [])];
    const lo = extras.length ? Math.min(...extras) : 0;
    const hi = extras.length ? Math.max(...extras) : 0;
    return `
      <ol class="rules-steps">
        <li><span class="rs-n">1</span><span>Līdz <b>1. decembrim</b> izvēlies <mark class="hl">5 jautājumus</mark> no saraksta un uzraksti atmiņas.</span></li>
        <li><span class="rs-n">2</span><span>Katru dienu atver durvis un <b>uzmini, kurš rakstīja</b>. Tev ir 2 mēģinājumi.</span></li>
        <li><span class="rs-n">3</span><span>Krāj punktus — uzvarētājam <b>balviņa</b>!</span></li>
      </ol>
      <div class="rules-points">
        <span class="rp-h">Punkti</span>
        <div><span>Pareizi ar 1. reizi</span><b>+${c.correct_points}</b></div>
        <div><span>Pareizi ar 2. reizi</span><b>+${c.second_try_points}</b></div>
        ${extras.length ? `<div><span>Min vairākas dienas pēc kārtas</span><b>+${lo === hi ? lo : `${lo}…${hi}`}</b></div>` : ''}
      </div>
      <p class="rules-foot">Durvis atveras katru dienu plkst. 00:00 ${tzLabel(c.tz)}. Kopvērtējumu atklāsim 24. decembrī.</p>
      <a class="btn btn-gold btn-big" href="${pageHref.calendar}" data-back>Sapratu</a>`;
  }

  function memoriesView() {
    const count = view.memories ? view.memories.length : 0;
    return `
      ${santaStrip()}
      <nav class="q-list" aria-label="Jautājumi">
        ${st.questions
          .map((q) => `<a class="q-item" href="${T}/advent/rakstit/${q.id}"><span>${esc(q.title)}</span><span aria-hidden="true">›</span></a>`)
          .join('')}
      </nav>
      <a class="adv-saved-link" href="${pageHref.saved}">
        <span>${advIcons.pen()}<b>Tavas atmiņas</b> (${count})</span>
        <span aria-hidden="true">›</span>
      </a>`;
  }

  function writeView() {
    const q = st.questions.find((x) => x.id === view.qid);
    if (!q) return `<p class="muted">Šāds jautājums nav atrasts.</p><a class="btn btn-gold" href="${pageHref.memories}">Uz jautājumiem</a>`;
    return `
      <form class="write-form" data-qform="${q.id}">
        <label for="mem-new" class="write-q">${esc(q.prompt)}</label>
        <textarea id="mem-new" rows="9" maxlength="2000" lang="lv" spellcheck="true" autocapitalize="sentences" placeholder="Reiz, kad biju mazs…"></textarea>
        <p class="write-hint">Neatklāj savu vārdu — citi minēs!</p>
        <button type="submit" class="btn btn-red btn-big">Saglabāt</button>
      </form>`;
  }

  const statusLabel = { pending: 'Saglabāta', approved: 'Saglabāta', rejected: 'Netiks izmantota' };

  function savedView() {
    if (!view.memories) return `<div class="loading adv-loading"><span class="spinner" aria-hidden="true"></span>Ielādējam…</div>`;
    const mine = view.memories;
    const list = mine.length
      ? `<ul class="adv-mylist">${mine
          .map((m) =>
            view.editingId === m.id
              ? `<li class="adv-mem editing">
                   <form data-editform="${m.id}" data-qid="${m.question_id}">
                     <label class="adv-mem-title" for="mem-edit-${m.id}">${esc(m.title)}</label>
                     <textarea id="mem-edit-${m.id}" rows="5" maxlength="2000" lang="lv" spellcheck="true" autocapitalize="sentences">${esc(m.body)}</textarea>
                     <div class="adv-row">
                       <button type="submit" class="btn btn-red btn-sm">Saglabāt</button>
                       <button type="button" class="btn btn-sm btn-plain" data-cancel>Atcelt</button>
                     </div>
                   </form>
                 </li>`
              : `<li class="adv-mem">
                   <div class="adv-mem-head">
                     <span class="adv-mem-title">${esc(m.title)}</span>
                     <span class="adv-status st-${m.status}">${statusLabel[m.status]}</span>
                   </div>
                   <p class="adv-mem-body">${esc(m.body)}</p>
                   ${
                     m.editable
                       ? `<div class="adv-row">
                            <button type="button" class="btn btn-sm btn-outline-dark" data-edit="${m.id}">${advIcons.pen()}Labot</button>
                            <button type="button" class="btn btn-sm btn-plain" data-del="${m.id}">${advIcons.trash()}Dzēst</button>
                          </div>`
                       : ''
                   }
                 </li>`,
          )
          .join('')}</ul>`
      : '<p class="muted">Tev vēl nav nevienas atmiņas.</p>';
    return `
      <p class="adv-fill-hint">Kamēr atmiņas diena kalendārā nav atvērusies, vari to labot vai izdzēst.</p>
      <section class="adv-panel">${list}</section>
      <div class="adv-saved-actions">
        <a class="btn btn-gold btn-big" href="${pageHref.memories}">${icons.plus()}Uzrakstīt vēl vienu atmiņu</a>
        <a class="btn btn-outline" href="${pageHref.calendar}">${advIcons.calendar(18)}Uz adventes kalendāru</a>
      </div>`;
  }

  function finaleView() {
    if (!view.finale) return `<div class="loading adv-loading"><span class="spinner" aria-hidden="true"></span>Ielādējam…</div>`;
    return finaleHtml(view.finale, esc);
  }

  function render() {
    const titles = {
      calendar: 'Adventes kalendārs',
      rules: 'Kā spēlēt?',
      memories: 'Izvēlies jautājumu',
      write: 'Rakstīt atmiņu',
      saved: 'Tavas atmiņas',
      finale: 'Fināls',
    };
    const views = { calendar: calendarView, rules: rulesView, memories: memoriesView, write: writeView, saved: savedView, finale: finaleView };
    app.innerHTML = shell(titles[view.tab] || titles.calendar, (views[view.tab] || calendarView)());
  }

  // ----- door sheet -----

  async function openSheet(day, animate = true) {
    const sheet = app.querySelector('.sheet');
    const backdrop = app.querySelector('.sheet-backdrop');
    view.sheetDay = day;
    sheet.innerHTML = `<div class="sheet-inner"><div class="loading adv-loading"><span class="spinner" aria-hidden="true"></span>Atveram durvis…</div></div>`;
    sheet.hidden = false;
    backdrop.hidden = false;
    requestAnimationFrame(() => {
      sheet.classList.add('show');
      backdrop.classList.add('show');
    });
    if (animate) document.body.classList.add('no-scroll');
    try {
      const data = await api.adventDay(token, day);
      if (view.sheetDay === day) renderSheet(data, false);
    } catch (err) {
      sheet.innerHTML = sheetShell(day, `<p class="form-error">${esc(err.message)}</p>`);
    }
  }

  function closeSheet() {
    view.sheetDay = null;
    const sheet = app.querySelector('.sheet');
    const backdrop = app.querySelector('.sheet-backdrop');
    if (!sheet) return;
    sheet.classList.remove('show');
    backdrop.classList.remove('show');
    document.body.classList.remove('no-scroll');
    setTimeout(() => {
      if (!view.sheetDay) {
        sheet.hidden = true;
        backdrop.hidden = true;
      }
    }, 250);
    const door = app.querySelector(`.door.opening`);
    door?.classList.remove('opening');
    if (pendingRender) {
      pendingRender = false;
      setTimeout(() => alive && !view.sheetDay && render(), 260);
    }
  }

  function sheetShell(day, body, title = '') {
    return `
      <div class="sheet-inner">
        <div class="sheet-head">
          <div>
            <span class="eyebrow">${decDate(day)}</span>
            <h2 id="sheet-h">${title ? esc(title) : 'Adventes durvis'}</h2>
          </div>
          <button type="button" class="icon-btn sheet-close" data-close aria-label="Aizvērt">${icons.close()}</button>
        </div>
        ${body}
      </div>`;
  }

  function renderSheet(d, justGuessed) {
    const sheet = app.querySelector('.sheet');
    if (!sheet) return;
    if (d.empty) {
      sheet.innerHTML = sheetShell(
        d.day,
        `<div class="adv-empty">${advIcons.flake(40)}<p>Aiz šīm durvīm šoreiz atmiņas nav.<br>Atpūties un iedzer krūzi karsta kakao!</p></div>`,
      );
      sheet.querySelector('[data-close]').focus();
      return;
    }

    let body = `
      <figure class="adv-memory">
        <span class="adv-quote-ico">${advIcons.quote()}</span>
        <figcaption>${esc(d.prompt)}</figcaption>
        <blockquote>${esc(d.body)}</blockquote>
      </figure>`;

    if (d.own) {
      body += `<div class="adv-result own">${icons.star(28)}<div><strong>Šī ir tava atmiņa!</strong><span>Tev nav jāmin, un tava sērija nepārtrūkst. Pasmaidi un vēro, vai citi uzminēs!</span></div></div>`;
    } else if (d.guess) {
      const g = d.guess;
      body += g.correct
        ? `<div class="adv-result ok ${justGuessed ? 'pop' : ''}">
             <span class="adv-result-ico">${advIcons.check(30)}</span>
             <div><strong>Pareizi${g.attempt === 2 ? ' ar otro mēģinājumu' : ''}! +${punkti(g.points)}</strong><span>Šo atmiņu uzrakstīja <b>${esc(g.author_name)}</b>.</span></div>
           </div>`
        : `<div class="adv-result no ${justGuessed ? 'pop' : ''}">
             <span class="adv-result-ico">${advIcons.cross(28)}</span>
             <div><strong>Šoreiz neuzminēji</strong><span>Tu minēji: ${esc(g.first_name && g.first_name !== g.guessed_name ? `${g.first_name}, ${g.guessed_name}` : g.guessed_name)}. Patiesībā to uzrakstīja <b>${esc(g.author_name)}</b>.</span></div>
           </div>`;
      if (!g.on_time) body += `<p class="adv-note">Nokavēta diena: punkti par pareizu atbildi skaitās, bet sērijai šī diena netiek ieskaitīta.</p>`;
    } else if (d.can_guess) {
      if (d.retry) {
        body += `<div class="adv-result retry ${justGuessed ? 'pop' : ''}">
             <span class="adv-result-ico">?</span>
             <div><strong>Šoreiz ne — tev ir vēl viens mēģinājums!</strong><span>Tu minēji: ${esc(d.retry.guessed_name)}. Par pareizu atbildi tagad saņemsi ${punktusAcc(d.second_try_points)}.</span></div>
           </div>`;
      }
      body += `
        <form class="adv-guess" data-guess="${d.day}">
          <fieldset>
            <legend>${d.retry ? 'Mēģini vēlreiz: kurš to uzrakstīja?' : 'Kurš no ģimenes to uzrakstīja?'}</legend>
            <div class="adv-options">
              ${d.options
                .map(
                  (o) => `
                <label class="adv-option">
                  <input type="radio" name="who" value="${esc(o.id)}">
                  <span>${esc(o.name)}</span>
                </label>`,
                )
                .join('')}
            </div>
          </fieldset>
          ${
            d.late
              ? `<p class="adv-note">Šī ir nokavēta diena: punkti par pareizu atbildi skaitās, bet sērija netiks atjaunota.</p>`
              : ''
          }
          <p class="adv-note strong">${
            d.retry
              ? 'Šis ir pēdējais mēģinājums — pieskaries vārdam un iesniedz.'
              : `Pieskaries vārdam un iesniedz. Tev ir 2 mēģinājumi: pareizi ar pirmo — +${d.correct_points}, ar otro — +${d.second_try_points}.`
          }</p>
          <button type="submit" class="btn btn-red btn-big" disabled>Izvēlies vārdu</button>
        </form>`;
    } else if (d.game_over) {
      body += `<p class="adv-note">Spēle ir noslēgusies — šo atmiņu vairs nevar minēt.</p>`;
    }

    sheet.innerHTML = sheetShell(d.day, body, d.title);
    if (justGuessed && d.guess?.correct) burstConfetti(ensureConfettiHost());
    const first = sheet.querySelector('input[name="who"]') || sheet.querySelector('[data-close]');
    first?.focus({ preventScroll: true });
  }

  function ensureConfettiHost() {
    const el = document.createElement('div');
    el.className = 'confetti';
    el.setAttribute('aria-hidden', 'true');
    app.querySelector('.page-advent').appendChild(el);
    return el;
  }

  // ----- events -----

  async function onClick(e) {
    const t = e.target.closest('button, [data-close]');
    if (!t) {
      if (e.target.classList?.contains('sheet-backdrop')) closeSheet();
      return;
    }
    if (t.classList.contains('door')) {
      const day = Number(t.dataset.day);
      const d = st.days[day - 1];
      if (d.state === 'locked') {
        t.classList.remove('shake');
        void t.offsetWidth;
        t.classList.add('shake');
        toast(st.today < 1 ? `Durvis atvērsies ${day}. decembrī` : `Šīs durvis atvērsies ${day}. decembrī`);
        return;
      }
      if (t.classList.contains('closed') && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        t.classList.add('opening');
        setTimeout(() => openSheet(day), 380);
      } else openSheet(day);
      return;
    }
    if (t.hasAttribute('data-close')) return closeSheet();
    if (t.hasAttribute('data-cancel')) {
      view.editingId = null;
      render();
      return;
    }
    if (t.dataset.edit) {
      view.editingId = t.dataset.edit;
      render();
      app.querySelector(`#mem-edit-${view.editingId}`)?.focus();
      return;
    }
    if (t.dataset.del) {
      if (!window.confirm('Dzēst šo atmiņu?')) return;
      try {
        view.memories = await api.adventDeleteMemory(token, t.dataset.del);
        toast('Atmiņa izdzēsta');
        render();
      } catch (err) {
        toast(err.message);
      }
    }
  }

  async function onSubmit(e) {
    const form = e.target;
    e.preventDefault();
    if (form.dataset.qform || form.dataset.editform) {
      const ta = form.querySelector('textarea');
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        const id = form.dataset.editform || null;
        const qid = Number(form.dataset.qform || form.dataset.qid);
        view.memories = await api.adventSaveMemory(token, id, qid, ta.value);
        view.editingId = null;
        toast(id ? 'Atmiņa saglabāta' : 'Paldies! Atmiņa saglabāta un ielikta kalendārā');
        if (!id) {
          // Replace the writing page in history, so "back" from the list goes to the questions, not to an empty form.
          ui.navReplace(`#/s/${token}/advent/saglabatas`);
          return;
        }
        render();
      } catch (err) {
        toast(err.message);
        btn.disabled = false;
      }
      return;
    }
    if (form.dataset.guess) {
      const picked = form.querySelector('input[name="who"]:checked');
      if (!picked) return;
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.textContent = 'Iesniedzam…';
      try {
        const data = await api.adventGuess(token, Number(form.dataset.guess), picked.value);
        renderSheet(data, true);
        reloadState();
      } catch (err) {
        toast(err.message);
        // e.g. already guessed in another tab: show the stored result
        const data = await api.adventDay(token, Number(form.dataset.guess)).catch(() => null);
        if (data) renderSheet(data, false);
      }
    }
  }

  function onChange(e) {
    if (e.target.name === 'who') {
      const form = e.target.closest('form');
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = false;
      btn.textContent = `Iesniegt: ${e.target.closest('label').textContent.trim()}`;
    }
  }

  function onKey(e) {
    if (e.key === 'Escape' && view.sheetDay) closeSheet();
  }

  function onVisible() {
    if (document.visibilityState === 'visible' && !view.sheetDay) reloadState();
  }

  app.addEventListener('click', onClick);
  app.addEventListener('submit', onSubmit);
  app.addEventListener('change', onChange);
  app.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onVisible);
  setCleanup(() => {
    alive = false;
    document.body.classList.remove('no-scroll');
    app.removeEventListener('click', onClick);
    app.removeEventListener('submit', onSubmit);
    app.removeEventListener('change', onChange);
    app.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onVisible);
  });

  render();
  if (view.tab === 'memories' || view.tab === 'saved') {
    view.memories = await api.adventMyMemories(token).catch(() => []);
    if (alive) render();
  }
  if (view.tab === 'finale') {
    try {
      view.finale = await api.adventFinale(token);
      if (alive) {
        render();
        burstConfetti(ensureConfettiHost());
      }
    } catch (err) {
      toast(err.message);
    }
  }
}

// ======================================================================
// Finale (shared by participant & organizer)
// ======================================================================

function finaleHtml(f, esc) {
  const names = f.winners;
  let winner;
  if (!names.length) {
    winner = `<div class="adv-winner none"><h2>Šogad uzvarētāja nav</h2><p>Bet paldies visiem par skaistajām atmiņām!</p></div>`;
  } else {
    const joined = names.length > 1 ? `${names.slice(0, -1).map(esc).join(', ')} un ${esc(names[names.length - 1])}` : esc(names[0]);
    winner = `
      <div class="adv-winner">
        ${advIcons.badge()}
        <span class="eyebrow">${f.tie ? 'Neizšķirts!' : 'Uzvar'}</span>
        <h2>${joined}</h2>
        <p class="adv-award">Ģimenes atmiņu zelta zvaigzne ${f.year}</p>
        <p class="adv-award-sub">${punkti(f.top_score)}${f.tie ? ' — vienāds rezultāts, tāpēc uzvara tiek dalīta!' : ''}</p>
      </div>`;
  }
  return `
    <section class="adv-finale">
      <div class="adv-finale-head">
        <span class="eyebrow">${esc(f.event_name)}</span>
        <h2>Ziemassvētku vakara fināls</h2>
        ${f.final ? '' : '<p class="adv-note">Rezultāti vēl var mainīties līdz dienas beigām — 24. durvis vēl var minēt.</p>'}
      </div>
      ${winner}
      <ol class="adv-standings">
        ${f.standings
          .map(
            (r) => `
          <li class="${f.my_name === r.name ? 'me' : ''} ${names.includes(r.name) ? 'win' : ''}">
            <span class="rank">${r.rank}.</span>
            <div class="st-main">
              <span class="st-name">${esc(r.name)}${f.my_name === r.name ? ' <small>(tu)</small>' : ''}</span>
              <span class="st-sub">Uzminētas: ${r.correct_count} → +${r.correct_points} · Sērijas bonusi: +${r.bonus_points}</span>
            </div>
            <span class="st-total">${r.total}</span>
          </li>`,
          )
          .join('')}
      </ol>
      <p class="adv-thanks">Paldies, ka dalījāties ar atmiņām un spēlējāt kopā! <br><em>Priecīgus Ziemassvētkus!</em></p>
    </section>`;
}

// ======================================================================
// Organizer
// ======================================================================

export async function adventOrganizerPage(adminToken, ui) {
  const { app, esc, toast, flakes, loading, errorPage, setCleanup, burstConfetti } = ui;
  loading('Ielādējam adventes kalendāru…');

  let st;
  try {
    st = await api.adventAdminState(adminToken);
  } catch {
    return errorPage('Saite nav atrasta', 'Šī organizatora saite nedarbojas.');
  }

  let showAuthors = false;
  try {
    showAuthors = localStorage.getItem('advent.showAuthors') === '1';
  } catch {
    /* ignore */
  }
  const view = { filter: 'approved', editingId: null, finale: null, tab: 'manage', draft: null };

  const counts = () => ({
    pending: st.memories.filter((m) => m.status === 'pending').length,
    approved: st.memories.filter((m) => m.status === 'approved').length,
    rejected: st.memories.filter((m) => m.status === 'rejected').length,
    filled: st.days.filter((d) => d.memory_id).length,
    unscheduled: st.memories.filter((m) => m.status === 'approved' && !m.day).length,
  });

  const firstOpenDay = () => Math.max(st.today, 1);

  function daySelect(m) {
    const taken = new Set(st.memories.filter((x) => x.day && x.id !== m.id).map((x) => x.day));
    let opts = `<option value="">— nav dienas —</option>`;
    for (let d = firstOpenDay(); d <= 24; d++) {
      if (taken.has(d)) continue;
      opts += `<option value="${d}" ${m.day === d ? 'selected' : ''}>${decDate(d)}${d === st.today ? ' (šodien)' : ''}</option>`;
    }
    return `<label class="adv-dayselect"><span>Kalendāra diena</span><select data-assign="${m.id}">${opts}</select></label>`;
  }

  function memoryCard(m) {
    const editing = view.editingId === m.id;
    return `
      <li class="adv-mem admin st-${m.status}">
        <div class="adv-mem-head">
          <span class="adv-mem-title">${esc(m.title)}</span>
          ${m.day ? `<span class="adv-daytag">${advIcons.calendar(14)} ${m.day}. dec.</span>` : ''}
        </div>
        ${
          editing
            ? `<form data-adminedit="${m.id}">
                 <label class="sr-only" for="ae-${m.id}">Atmiņas teksts</label>
                 <textarea id="ae-${m.id}" rows="5" maxlength="2000" lang="lv" spellcheck="true" autocapitalize="sentences">${esc(m.body)}</textarea>
                 <div class="adv-row">
                   <button type="submit" class="btn btn-sm btn-red">Saglabāt</button>
                   <button type="button" class="btn btn-sm btn-plain" data-cancel>Atcelt</button>
                 </div>
               </form>`
            : `<p class="adv-mem-body">${esc(m.body)}</p>`
        }
        <div class="adv-mem-meta">
          ${showAuthors ? `<span>Autors: <b>${esc(m.author_name)}</b></span>` : '<span class="muted">Autors paslēpts</span>'}
          ${m.edited ? '<span class="adv-edited">Labota</span>' : ''}
          ${m.published ? `<span>Publicēta · minējumi: ${m.guess_count}</span>` : ''}
        </div>
        ${
          m.published || editing
            ? ''
            : `<div class="adv-row wrap">
                ${
                  m.status === 'pending'
                    ? `<button type="button" class="btn btn-sm btn-green" data-review="approved" data-id="${m.id}">${advIcons.check(16)}Apstiprināt</button>
                       <button type="button" class="btn btn-sm btn-plain" data-review="rejected" data-id="${m.id}">Noņemt</button>`
                    : ''
                }
                ${m.status === 'approved' ? daySelect(m) : ''}
                ${
                  m.status === 'approved'
                    ? `<button type="button" class="btn btn-sm btn-plain" data-review="rejected" data-id="${m.id}">Noņemt</button>`
                    : ''
                }
                ${
                  m.status === 'rejected'
                    ? `<button type="button" class="btn btn-sm btn-outline-dark" data-review="approved" data-id="${m.id}">Atjaunot</button>`
                    : ''
                }
                <button type="button" class="btn btn-sm btn-plain" data-aedit="${m.id}">${advIcons.pen()}Labot tekstu</button>
              </div>`
        }
      </li>`;
  }

  function manageTab() {
    const c = counts();
    const list = st.memories.filter((m) => m.status === view.filter);
    const canAutofill = c.unscheduled > 0 && st.days.some((d) => !d.memory_id && d.day >= firstOpenDay());
    return `
      <section class="adv-stats">
        <div><span class="adv-v">${c.filled}/24</span><span class="adv-k">dienām ir atmiņa</span></div>
        <div><span class="adv-v">${c.approved}</span><span class="adv-k">atmiņas kopā</span></div>
        <div><span class="adv-v">${c.unscheduled}</span><span class="adv-k">rezervē (dienas pilnas)</span></div>
      </section>

      <section class="adv-panel">
        <h2>Kalendāra dienas</h2>
        <div class="adv-daymap">
          ${st.days
            .map(
              (d) => `<span class="dm ${d.memory_id ? 'full' : 'empty'} ${d.unlocked ? 'past' : ''} ${d.day === st.today ? 'today' : ''}"
                   title="${d.memory_id ? esc(d.title) : 'Tukša diena'}">
                   <b>${d.day}</b>${d.memory_id ? advIcons.check(14) : d.unlocked ? advIcons.lock(12) : ''}</span>`,
            )
            .join('')}
        </div>
        <p class="muted small">Zaļās dienas ir aizpildītas. Pagājušās un šodienas publicētās dienas vairs nevar mainīt.</p>
        ${
          canAutofill
            ? `<button type="button" class="btn btn-gold btn-sm" data-autofill>${advIcons.calendar(18)}Aizpildīt tukšās dienas automātiski</button>`
            : ''
        }
      </section>

      <section class="adv-panel">
        <div class="adv-list-head">
          <h2>Atmiņas</h2>
          <label class="adv-switch">
            <input type="checkbox" data-authors ${showAuthors ? 'checked' : ''}>
            <span>Rādīt autorus</span>
          </label>
        </div>
        <p class="muted small">Ja arī tu spēlē, atstāj autorus paslēptus, lai nesabojātu minēšanu.</p>
        <div class="adv-filter" role="group" aria-label="Filtrs">
          <button type="button" class="${view.filter === 'approved' ? 'active' : ''}" data-filter="approved">Kalendārā (${c.approved})</button>
          <button type="button" class="${view.filter === 'rejected' ? 'active' : ''}" data-filter="rejected">Noņemtas (${c.rejected})</button>
        </div>
        ${
          list.length
            ? `<ul class="adv-mylist">${list.map(memoryCard).join('')}</ul>`
            : `<p class="muted">${
                view.filter === 'approved'
                  ? 'Vēl nav nevienas atmiņas. Pastāsti ģimenei, ka sadaļā „Manas atmiņas” var dalīties ar atmiņām!'
                  : 'Šeit vēl nekā nav.'
              }</p>`
        }
      </section>

      <section class="adv-panel">
        <h2>Iesniegtās atmiņas pa cilvēkiem</h2>
        <ul class="adv-people">
          ${st.participants.map((p) => `<li><span>${esc(p.name)}</span><b>${p.memory_count}</b></li>`).join('')}
        </ul>
        <p class="muted small">Dalībnieki kalendāru atver no savas slepenā rūķīša saites — jaunas saites nav vajadzīgas.</p>
      </section>`;
  }

  // ----- settings -----

  function currentDraft() {
    if (!view.draft) {
      const c = st.config;
      view.draft = {
        tz: c.tz,
        correct_points: c.correct_points,
        second_try_points: c.second_try_points,
        streak_bonuses: c.streak_bonuses.map((b) => ({ ...b })),
        complete_bonus: c.complete_bonus,
      };
    }
    return view.draft;
  }

  // Keep what the organizer typed when the form re-renders (adding/removing rows).
  function readDraftFromForm() {
    const f = app.querySelector('form[data-settings]');
    if (!f) return;
    const num = (el) => (el.value === '' ? '' : Number(el.value));
    view.draft = {
      tz: f.querySelector('#set-tz').value,
      correct_points: num(f.querySelector('#set-correct')),
      second_try_points: num(f.querySelector('#set-second')),
      complete_bonus: num(f.querySelector('#set-complete')),
      streak_bonuses: [...f.querySelectorAll('.bonus-row')].map((r) => ({
        days: num(r.querySelector('[data-bdays]')),
        points: num(r.querySelector('[data-bpoints]')),
      })),
    };
  }

  function summaryHtml(d) {
    const maxBonus = d.streak_bonuses.reduce((a, b) => a + (Number(b.points) || 0), 0) + (Number(d.complete_bonus) || 0);
    const correct = Number(d.correct_points) || 0;
    return `<p class="set-summary">Pareizi ar 1. mēģinājumu: <b>${punkti(correct)}</b> · ar 2. mēģinājumu: <b>${punkti(Number(d.second_try_points) || 0)}</b> · Visi bonusi kopā: <b>${punkti(maxBonus)}</b></p>${
      maxBonus > correct * 2
        ? '<p class="adv-warn">Bonusi kopā ir vairāk nekā divas pareizas atbildes — tad sērija var ietekmēt uzvarētāju vairāk nekā minēšana.</p>'
        : ''
    }`;
  }

  function settingsTab() {
    const locked = st.today >= 1;
    const d = currentDraft();
    const tzOpts = (TIMEZONES.some(([id]) => id === d.tz) ? TIMEZONES : [[d.tz, d.tz], ...TIMEZONES])
      .map(([id, label]) => `<option value="${esc(id)}" ${id === d.tz ? 'selected' : ''}>${esc(label)}</option>`)
      .join('');
    const rows = d.streak_bonuses
      .map(
        (b, i) => `
        <div class="bonus-row">
          <label><span>Dienas pēc kārtas</span><input type="number" inputmode="numeric" min="2" max="24" data-bdays value="${esc(b.days)}"></label>
          <label><span>Bonusa punkti</span><input type="number" inputmode="numeric" min="1" max="20" data-bpoints value="${esc(b.points)}"></label>
          <button type="button" class="icon-btn bonus-del" data-bdel="${i}" aria-label="Noņemt bonusu">${advIcons.trash()}</button>
        </div>`,
      )
      .join('');
    return `
      <form class="adv-panel adv-settings" data-settings novalidate>
        <h2>Spēles iestatījumi</h2>
        ${
          locked
            ? `<p class="adv-lock-note">${advIcons.lock(16)} Kalendārs jau ir sācies, tāpēc iestatījumus vairs nevar mainīt — lai nevienam jau nopelnītie punkti nemainītos.</p>`
            : '<p class="muted">Iestatījumus var mainīt līdz 1. decembrim. Pēc tam tie tiek nofiksēti, lai spēle būtu godīga.</p>'
        }
        <fieldset ${locked ? 'disabled' : ''}>
          <div class="set-field">
            <label for="set-tz">Laika josla, kad atveras durvis</label>
            <select id="set-tz">${tzOpts}</select>
            <span class="muted small">Jaunās durvis atveras plkst. 00:00 šajā laika joslā — vienādi visiem.</span>
          </div>

          <div class="set-field">
            <label for="set-correct">Punkti par pareizu atbildi ar 1. mēģinājumu</label>
            <input id="set-correct" type="number" inputmode="numeric" min="1" max="100" value="${esc(d.correct_points)}">
          </div>

          <div class="set-field">
            <label for="set-second">Punkti par pareizu atbildi ar 2. mēģinājumu</label>
            <input id="set-second" type="number" inputmode="numeric" min="0" max="100" value="${esc(d.second_try_points)}">
            <span class="muted small">Ja pirmais minējums ir nepareizs, var minēt vēlreiz — par to mazāk punktu.</span>
          </div>

          <div class="set-field">
            <span class="set-label">Sērijas bonusi</span>
            <span class="muted small">Par minēšanu tieši tajā pašā dienā vairākas dienas pēc kārtas. Katru bonusu var nopelnīt tikai vienreiz.</span>
            <div class="bonus-rows">${rows || '<p class="muted small">Sērijas bonusu nav.</p>'}</div>
            ${d.streak_bonuses.length < 8 ? `<button type="button" class="btn btn-sm btn-outline-dark" data-badd>${icons.plus()}Pievienot bonusu</button>` : ''}
          </div>

          <div class="set-field">
            <label for="set-complete">Bonuss par visām 24 dienām</label>
            <input id="set-complete" type="number" inputmode="numeric" min="0" max="50" value="${esc(d.complete_bonus)}">
          </div>

          <div id="set-summary" aria-live="polite">${summaryHtml(d)}</div>

          <div class="adv-row wrap">
            <button type="submit" class="btn btn-red">Saglabāt iestatījumus</button>
            <button type="button" class="btn btn-plain" data-sdefault>Atjaunot noklusējumu</button>
          </div>
        </fieldset>
      </form>`;
  }

  function render() {
    const finaleOpen = st.today >= 24;
    app.innerHTML = `
      <div class="page page-advent">
        ${lights()}
        ${flakes()}
        <div class="wrap adv-wrap">
          <header class="topbar">
            <a class="icon-btn back" href="#/o/${esc(adminToken)}" data-back aria-label="Atpakaļ uz organizatora lapu">${icons.back()}</a>
            <span class="brand">${icons.star(28)}<span>Adventes kalendārs</span></span>
            <span class="role">Organizators</span>
          </header>
          <section class="hero adv-hero">
            <span class="eyebrow">${esc(st.event_name)}</span>
            <h1>Atmiņu <em>pārvaldība</em></h1>
            <p class="lede">Atmiņas kalendārā tiek ieliktas automātiski — tev nekas nav jādara. Ja gribi, šeit vari tās apskatīt, pārvietot uz citu dienu vai kādu noņemt.</p>
          </section>
          <nav class="adv-tabs" aria-label="Sadaļas">
            ${[['manage', 'Atmiņas'], ['settings', 'Iestatījumi'], ...(finaleOpen ? [['finale', 'Fināls']] : [])]
              .map(
                ([k, l]) =>
                  `<button type="button" class="adv-tab ${view.tab === k ? 'active' : ''}" data-otab="${k}" ${view.tab === k ? 'aria-current="page"' : ''}>${l}</button>`,
              )
              .join('')}
          </nav>
          <div class="adv-body">
            ${
              view.tab === 'finale'
                ? view.finale
                  ? finaleHtml(view.finale, esc)
                  : '<div class="loading adv-loading"><span class="spinner"></span>Ielādējam…</div>'
                : view.tab === 'settings'
                  ? settingsTab()
                  : manageTab()
            }
          </div>
        </div>
      </div>`;
  }

  async function run(p, okMsg) {
    try {
      st = await p;
      render();
      if (okMsg) toast(okMsg);
    } catch (err) {
      toast(err.message);
      render();
    }
  }

  async function onClick(e) {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.filter) {
      view.filter = t.dataset.filter;
      render();
    } else if (t.dataset.review) {
      const msg = t.dataset.review === 'approved' ? 'Atmiņa atjaunota kalendārā' : 'Atmiņa noņemta';
      run(api.adventAdminReview(adminToken, t.dataset.id, t.dataset.review), msg);
    } else if (t.dataset.aedit) {
      view.editingId = t.dataset.aedit;
      render();
      app.querySelector(`#ae-${view.editingId}`)?.focus();
    } else if (t.hasAttribute('data-cancel')) {
      view.editingId = null;
      render();
    } else if (t.hasAttribute('data-autofill')) {
      run(api.adventAdminAutofill(adminToken), 'Tukšās dienas aizpildītas');
    } else if (t.hasAttribute('data-badd')) {
      readDraftFromForm();
      const used = new Set(view.draft.streak_bonuses.map((b) => b.days));
      let days = 10;
      while (used.has(days) && days < 24) days++;
      view.draft.streak_bonuses.push({ days, points: 1 });
      render();
    } else if (t.dataset.bdel !== undefined) {
      readDraftFromForm();
      view.draft.streak_bonuses.splice(Number(t.dataset.bdel), 1);
      render();
    } else if (t.hasAttribute('data-sdefault')) {
      view.draft = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
      render();
    } else if (t.dataset.otab) {
      if (view.tab === 'settings') readDraftFromForm();
      view.tab = t.dataset.otab;
      render();
      if (view.tab === 'finale' && !view.finale) {
        try {
          view.finale = await api.adventAdminFinale(adminToken);
          render();
          const el = document.createElement('div');
          el.className = 'confetti';
          app.querySelector('.page-advent').appendChild(el);
          burstConfetti(el);
        } catch (err) {
          toast(err.message);
        }
      }
    }
  }

  function onChange(e) {
    if (e.target.closest('form[data-settings]')) {
      readDraftFromForm();
      const box = app.querySelector('#set-summary');
      if (box) box.innerHTML = summaryHtml(view.draft);
      return;
    }
    if (e.target.dataset.assign) {
      const v = e.target.value;
      run(api.adventAdminAssign(adminToken, e.target.dataset.assign, v ? Number(v) : null), v ? `Ielikta ${v}. decembrī` : 'Diena noņemta');
    } else if (e.target.hasAttribute('data-authors')) {
      showAuthors = e.target.checked;
      try {
        localStorage.setItem('advent.showAuthors', showAuthors ? '1' : '0');
      } catch {
        /* ignore */
      }
      render();
    }
  }

  async function onSubmit(e) {
    if (e.target.hasAttribute('data-settings')) {
      e.preventDefault();
      readDraftFromForm();
      const d = view.draft;
      const btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        st = await api.adventAdminSettings(
          adminToken,
          d.tz,
          Number(d.correct_points),
          Number(d.second_try_points),
          d.streak_bonuses.map((b) => ({ days: Number(b.days), points: Number(b.points) })),
          Number(d.complete_bonus),
        );
        view.draft = null;
        render();
        toast('Iestatījumi saglabāti');
      } catch (err) {
        toast(err.message);
        btn.disabled = false;
      }
      return;
    }
    if (!e.target.dataset.adminedit) return;
    e.preventDefault();
    const id = e.target.dataset.adminedit;
    view.editingId = null;
    run(api.adventAdminEdit(adminToken, id, e.target.querySelector('textarea').value), 'Teksts saglabāts');
  }

  app.addEventListener('click', onClick);
  app.addEventListener('change', onChange);
  app.addEventListener('submit', onSubmit);
  setCleanup(() => {
    app.removeEventListener('click', onClick);
    app.removeEventListener('change', onChange);
    app.removeEventListener('submit', onSubmit);
  });

  render();
}
