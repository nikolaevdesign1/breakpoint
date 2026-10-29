import { club, save } from './store.js';
import { LADDER } from './people.js';
import { initSelects } from '../../site/custom-select.js';

// Club panel, "Ladder" and "Report score" (round 10). A made-up club ladder of nine players; the
// visitor reports a match (opponent and set scores) and the ladder reorders with the points: a win
// gives 20 and up to 20 more for beating a player above you, a loss still gives 4. Kept in
// localStorage next to the rest of the club state.

const START = 80; // every new player starts here, between the bottom two
const ordinal = (n) => `${n}${['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10 < 4 ? n % 10 : 0]}`;

/** The ladder with every reported match applied, best first, with `rank`. */
export function standings(reports = club().reports) {
  const rows = [...LADDER.map((p) => ({ ...p })), { name: 'You', pts: START, w: 0, l: 0, you: true }];
  for (const r of reports) {
    const me = rows.find((x) => x.you);
    me.pts += r.gain;
    me[r.win ? 'w' : 'l']++;
    const o = rows.find((x) => x.name === r.opp);
    if (o) { o.pts += r.oppGain; o[r.win ? 'l' : 'w']++; }
  }
  rows.sort((a, b) => b.pts - a.pts || (a.you ? 1 : b.you ? -1 : 0));
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

const validSet = (a, b) => { const hi = Math.max(a, b); const lo = Math.min(a, b); return (hi === 6 && lo <= 4) || (hi === 7 && (lo === 5 || lo === 6)); };

/** Reads the form: { sets, win } or { error }. */
function readScore(form) {
  const sets = [];
  for (const n of [1, 2, 3]) {
    const a = form.elements[`a${n}`].value;
    const b = form.elements[`b${n}`].value;
    if (a === '' && b === '') continue;
    sets.push([Number(a), Number(b)]);
  }
  if (sets.length < 2) return { error: 'Add the score of at least two sets.' };
  const bad = sets.findIndex(([a, b]) => !validSet(a, b));
  if (bad >= 0) return { error: `Set ${bad + 1} does not look right. A set ends 6-0 to 6-4, 7-5 or 7-6.` };
  const mine = sets.filter(([a, b]) => a > b).length;
  const theirs = sets.length - mine;
  if (mine === theirs) return { error: 'Two sets split 1-1 need a third set.' };
  if (mine === 3 || theirs === 3) return { error: 'A match ends when one player has two sets.' };
  return { sets, win: mine > theirs };
}

export function renderLadder(box, ctx) {
  const rows = standings();
  const me = rows.find((r) => r.you);
  const played = club().reports.length;

  const top = document.createElement('div');
  top.className = 'cl-ladder__top';
  top.innerHTML = `<p class="cl-lead">${played ? `You are ${ordinal(me.rank)} of ${rows.length}.` : 'You start on 80 points. Play a match, report the score, and climb.'}</p>
    <button type="button" class="cl-btn${ctx.report ? ' is-on' : ''}" data-report aria-expanded="${!!ctx.report}">Report score</button>`;
  top.querySelector('[data-report]').addEventListener('click', () => { ctx.report = ctx.report ? null : {}; ctx.render(); });
  box.append(top);

  if (ctx.result) {
    const p = document.createElement('p');
    p.className = 'cl-result';
    p.textContent = ctx.result;
    box.append(p);
  }
  if (ctx.report) box.append(scoreForm(ctx, rows, me));

  const ol = document.createElement('ol');
  ol.className = 'cl-rank';
  rows.forEach((r) => {
    const li = document.createElement('li');
    li.className = `cl-rank__row${r.you ? ' is-you' : ''}`;
    li.dataset.name = r.name;
    li.innerHTML = `<span class="cl-rank__n">${r.rank}</span><span class="cl-rank__name">${r.name}</span><span class="cl-rank__wl">${r.w}-${r.l}</span><b class="cl-rank__pts">${r.pts}</b>`;
    ol.append(li);
  });
  box.append(ol);
  flip(ol, ctx);

  const last = club().reports.slice(-3).reverse();
  if (last.length) {
    const h = document.createElement('div');
    h.className = 'cl-recent';
    h.innerHTML = `<p class="cl-recent__k">Your last matches</p>${last.map((r) => `<p>${r.win ? 'Won' : 'Lost'} ${r.sets.map((s) => s.join('-')).join(', ')} vs ${r.opp} <b>+${r.gain}</b></p>`).join('')}`;
    box.append(h);
  }
}

/** Rows slide from where they were to where they are now, after a match is reported. */
function flip(ol, ctx) {
  const before = ctx.flip;
  ctx.flip = null;
  if (!before || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  ol.querySelectorAll('[data-name]').forEach((li) => {
    const dy = (before[li.dataset.name] ?? 0) - li.getBoundingClientRect().top;
    if (Math.abs(dy) < 1) return;
    li.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 1100, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
  });
}

function scoreForm(ctx, rows, me) {
  const f = document.createElement('form');
  f.className = 'cl-score';
  f.noValidate = true;
  const above = rows[Math.max(0, me.rank - 2)];
  const pre = rows.find((r) => !r.you && ctx.report.opp && r.name.startsWith(ctx.report.opp))?.name ?? (above.you ? rows[1].name : above.name);
  const input = (n) => `<input name="${n}" type="number" min="0" max="7" inputmode="numeric" aria-label="${n.startsWith('a') ? 'Your' : 'Their'} games, set ${n[1]}" />`;
  f.innerHTML = `
    <label class="cl-score__opp">Played against<select name="opp">${rows.filter((r) => !r.you).map((r) => `<option${r.name === pre ? ' selected' : ''}>${r.name}</option>`).join('')}</select></label>
    <div class="cl-score__grid">
      <span></span><b>You</b><b>Them</b>
      ${[1, 2, 3].map((n) => `<span${n === 3 ? ' data-third' : ''}>Set ${n}</span>${input(`a${n}`)}${input(`b${n}`)}`).join('')}
    </div>
    <p class="cl-score__err" role="alert"></p>
    <div class="cl-score__acts"><button type="submit" class="cl-btn is-solid">Add to the ladder</button><button type="button" class="cl-btn" data-cancel>Cancel</button></div>`;
  initSelects(f);
  const err = f.querySelector('.cl-score__err');
  f.querySelector('[data-cancel]').addEventListener('click', () => { ctx.report = null; ctx.render(); });
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const out = readScore(f);
    if (out.error) { err.textContent = out.error; return; }
    const opp = rows.find((r) => r.name === f.elements.opp.value);
    const bonus = Math.max(0, Math.min(20, Math.round((opp.pts - me.pts) / 25)));
    const report = { id: Date.now(), opp: opp.name, sets: out.sets, win: out.win, gain: out.win ? 20 + bonus : 4, oppGain: out.win ? 0 : 16 };
    const after = standings([...club().reports, report]).find((r) => r.you);
    const was = club().reports.length ? me.rank : null;
    ctx.flip = Object.fromEntries([...f.parentElement.querySelectorAll('[data-name]')].map((li) => [li.dataset.name, li.getBoundingClientRect().top]));
    ctx.result = `${out.win ? 'Won' : 'Lost'} ${out.sets.map((s) => s.join('-')).join(', ')} against ${opp.name}. +${report.gain} points, you are ${ordinal(after.rank)}${was && was !== after.rank ? ` (${after.rank < was ? 'up' : 'down'} from ${ordinal(was)})` : ''}.`;
    ctx.report = null;
    save({ reports: [...club().reports, report] });
  });
  const third = f.querySelectorAll('[data-third], [name="a3"], [name="b3"]');
  const sync = () => {
    const s = [1, 2].map((n) => [f.elements[`a${n}`].value, f.elements[`b${n}`].value]);
    const split = s.every(([a, b]) => a !== '' && b !== '') && (Number(s[0][0]) > Number(s[0][1])) !== (Number(s[1][0]) > Number(s[1][1]));
    third.forEach((el) => { el.hidden = !split; });
    if (!split) { f.elements.a3.value = ''; f.elements.b3.value = ''; }
  };
  f.addEventListener('input', () => { err.textContent = ''; sync(); });
  sync();
  return f;
}
