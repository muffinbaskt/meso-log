// Logic tests for Meso Log. Run: node tests/logic.test.js
// Loads the first <script> block of ../index.html (the pure domain logic) and exercises it.
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.match(/<script>([\s\S]*?)<\/script>/)[1];
eval(src + `
;globalThis.T = {
  get S() { return S }, set S(v) { S = v },
  seedState, buildSession, applyMuscle, setDelta, distribute, planLoad, rirFor, ex, nextPending,
  exHistory, lastPerf, loadMode, totOf, dayDiff, deriveSoreness, dueSoreness, trackWorked, normalize, today, e1rm, vsPlan, matchTargets, withType, makeEx, convertUnits, blankDays, syncDay, upgradeLib, libEx, LIB, setBodyweight, usesBw, ivlNext, applyMuscle, ssGroups, prioDelta
};`);

let ok = 0, bad = 0;
const eq = (a, b, m) => {
  if (JSON.stringify(a) === JSON.stringify(b)) ok++;
  else { bad++; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); }
};
const dstr = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

T.S = T.seedState(); T.normalize();

// ---- target RIR ladder ----
eq([1, 2, 3, 4, 5].map(w => T.rirFor({ weeks: 5 }, w)), [3, 2, 1, 0, 5], 'rir 5 weeks (last is deload)');
eq([1, 2, 3, 4, 5, 6].map(w => T.rirFor({ weeks: 6 }, w)), [3, 2, 2, 1, 0, 5], 'rir 6 weeks');
eq([1, 2, 3, 4, 5].map(w => T.rirFor({ weeks: 5, style: 'test' }, w)), [0.5, 2, 1, 0, 5], 'test week, 5 weeks');
eq([1, 2, 3, 4].map(w => T.rirFor({ weeks: 4, style: 'test' }, w)), [0.5, 2, 0, 5], 'test week, 4 weeks');
eq([1, 2, 3, 4, 5, 6].map(w => T.rirFor({ weeks: 6, style: 'test' }, w)), [0.5, 2, 1, 1, 0, 5], 'test week, 6 weeks');
eq([1, 2, 3, 4, 5, 6, 7, 8].map(w => T.rirFor({ weeks: 8, style: 'test' }, w)), [0.5, 2, 2, 1, 1, 0, 0, 5], 'test week, 8 weeks: two weeks at each level');
{ const e = { lo: 8, hi: 12, inc: 5 };
  // 140 x 10 at 0-1 RIR in the test week, planned for week 2 at 2 RIR: same weight, fewer reps than the test.
  eq(T.planLoad(e, { tot: 140, r: 10, rir: 0.5 }, 2, false), { w: 140, r: 9 }, 'week 2 after a test week backs off to 2 RIR');
  eq(T.planLoad(e, { tot: 140, r: 10, rir: 3 }, 0.5, false).r > 10, true, 'test week after a standard block asks for more reps'); }

// ---- set changes ----
eq(T.setDelta(0, 1, 1), 2, 'never sore');
eq(T.setDelta(1, 1, 1), 1, 'recovered early');
eq(T.setDelta(2, 1, 1), 0, 'just in time');
eq(T.setDelta(3, 1, 1), -2, 'still sore');
eq(T.setDelta(2, 1, 2), -1, 'last volume pushed limits');
eq(T.setDelta(3, 1, 3), -3, 'clamp low');
eq(T.setDelta(0, 0, 0), 3, 'clamp high');
eq(T.setDelta(2, null, null), 0, 'no previous ratings');
eq(T.distribute([3, 3], 2), [4, 4], 'add spreads');
eq(T.distribute([4, 2], 1), [4, 3], 'add goes to smallest');
eq(T.distribute([3, 2], -2), [2, 1], 'remove comes from largest (5 sets -> 3)');
eq(T.distribute([1, 1], -3), [1, 1], 'floor of 1 set');
eq(T.distribute([6, 6], 2), [6, 6], 'cap of 6 sets');

// ---- weight and rep progression, total-weight mode ----
const e = { lo: 8, hi: 12, inc: 5, bw: false };
const mT = { side: false, bar: 0 };
eq(T.planLoad(e, null, 3, false, mT), { w: null, r: 10 }, 'no history');
eq(T.planLoad(e, { tot: 100, r: 10, rir: 3 }, 2, false, mT), { w: 100, r: 11 }, 'hold weight, +1 rep');
eq(T.planLoad(e, { tot: 100, r: 12, rir: 1 }, 0, false, mT), { w: 105, r: 11 }, 'step up past top of range');
eq(T.planLoad(e, { tot: 100, r: 12, rir: 0 }, 3, false, mT), { w: 100, r: 9 }, 'fresh block restarts at 3 RIR');
eq(T.planLoad(e, { tot: 100, r: 10, rir: 1 }, 5, true, mT), { w: 75, r: 10 }, 'deload is 75% weight');
eq(T.planLoad({ ...e, bw: true }, { tot: 214, r: 10, rir: 1 }, 5, true, mT), { w: 214, r: 7 }, 'bodyweight deload cuts reps');

// ---- weight entry: one end vs total ----
const bench = T.ex('bench-press-wide-grip'), curl = T.ex('dumbbell-curl-alternating'), pullup = T.ex('pullup-parallel-grip');
eq(T.loadMode(bench), { side: false, bar: 0 }, 'new users enter barbell weight as total');
eq(T.S.prefs.needsSetup, true, 'new users get the setup sheet');
T.S.prefs.barLoad = 'side';
eq(T.loadMode(bench), { side: true, bar: 45 }, 'one end pref uses the 45 bar');
eq(T.loadMode(curl), { side: false, bar: 0 }, 'dumbbell is total');
eq(T.loadMode(pullup), { side: false, bar: 0, bwo: true, abw: T.S.prefs.bw }, 'bodyweight-only uses bodyweight');
T.S.prefs.barLoad = 'total'; eq(T.loadMode(bench), { side: false, bar: 0 }, 'global pref total'); T.S.prefs.barLoad = 'side';
eq(T.loadMode({ ...bench, load: 'total' }), { side: false, bar: 0 }, 'per-exercise override total');
eq(T.loadMode({ ...curl, load: 'side', bar: 20 }), { side: true, bar: 20 }, 'per-exercise override one end + custom bar');
eq(T.totOf({ side: true, bar: 45 }, 25), 95, '25 per end + 45 bar = 95');
eq(T.totOf({ side: false }, 95), 95, 'total passes through');
const mS = { side: true, bar: 45 };
const pT = T.planLoad(e, { tot: 95, r: 10, rir: 3 }, 2, false, mT);
const pS = T.planLoad({ ...e, inc: 2.5 }, { tot: 95, r: 10, rir: 3 }, 2, false, mS);
eq(pT.r, pS.r, 'same reps in either mode');
eq(pS.w, (pT.w - 45) / 2, 'same total in either mode');
const bS = T.planLoad({ ...e, inc: 2.5 }, { tot: 95, r: 12, rir: 1 }, 0, false, mS);
eq(45 + 2 * bS.w, 100, 'a 2.5 per-end step adds 5 total');
const dS = T.planLoad({ ...e, inc: 2.5 }, { tot: 145, r: 10, rir: 1 }, 5, true, mS);
eq(dS.w >= 0, true, 'per-end deload never negative');
eq(T.e1rm(T.totOf({ side: true, bar: 45 }, 25), 10) > T.e1rm(25, 10) * 3, true, 'one end read as total would understate strength');

// ---- end to end: sessions, history, next week ----
T.S = T.seedState(); T.normalize();
T.S.prefs.barLoad = 'side';   // these checks cover one-end entry
const m = { id: 'm1', name: 't', weeks: 5, start: '2026-10-26', days: JSON.parse(JSON.stringify(T.S.templates[0].days)), sessions: {}, created: 1, template: 'x' };
T.S.mesos.push(m); T.S.activeMeso = 'm1';
const s1 = T.buildSession(m, 1, 0); m.sessions['1-0'] = s1;
const bx = s1.exs.find(x => x.exId === 'bench-press-wide-grip');
eq([bx.side, bx.bar], [true, 45], 'session exercise stores its entry mode');
eq(bx.sets.length, 4, 'template sets');
eq(s1.exs.find(x => x.exId === 'pullup-parallel-grip').sets[0].w, 200, 'bodyweight prefill');
bx.sets.forEach(t => { t.w = 25; t.r = 10; t.done = true; });
eq(T.lastPerf('bench-press-wide-grip', m, 999).tot, 95, 'last performance is total weight');
const h = T.exHistory('bench-press-wide-grip');
eq([h[0].top.w, h[0].top.tot, h[0].top.side], [25, 95, true], 'history keeps entered weight and total');
const s2 = T.buildSession(m, 2, 0);
const b2 = s2.exs.find(x => x.exId === 'bench-press-wide-grip');
eq([b2.sets[0].w, b2.sets[0].r], [25, 11], 'week 2 holds 25 per end, +1 rep');

// soreness changes sets, logged sets are protected
s1.fb.chest = { pump: 1, vol: 1, post: true }; s1.fb.biceps = { pump: 0, vol: 0, post: true };
s1.exs.forEach(x => x.sets.forEach(t => { t.done = true; t.w = t.w || 40; t.r = t.r || 10; }));
s1.done = true;
const s2b = T.buildSession(m, 2, 0);
s2b.fb.biceps = { sor: 0 }; T.applyMuscle(m, s2b, 'biceps');
eq(s2b.exs.find(x => x.exId === 'dumbbell-curl-alternating').sets.length, 6, 'never sore + low pump + not enough volume: +3 sets');
s2b.fb.chest = { sor: 3 }; T.applyMuscle(m, s2b, 'chest');
eq(s2b.exs[0].sets.length, 2, 'still sore: -2 sets');
s2b.exs[0].sets[0].done = true; s2b.exs[0].sets[1].done = true; s2b.fb.chest = { sor: 3 }; T.applyMuscle(m, s2b, 'chest');
eq(s2b.exs[0].sets.length >= 2, true, 'logged sets are never removed');

// ---- soreness check-ins ----
const D = T.today();
T.S.track = {};
eq(T.dueSoreness().length, 0, 'nothing tracked');
T.trackWorked('chest'); eq(T.dueSoreness().length, 0, 'not due the day you train');
T.S.track.chest.workedOn = dstr(1); eq(T.dueSoreness().map(x => x.id), ['chest'], 'asked the day after');
T.S.track.chest.lastAsked = D; eq(T.dueSoreness().length, 0, 'only once per day');
T.S.track.chest.lastAsked = dstr(1); eq(T.dueSoreness().length, 1, 'yes yesterday: asked again today');
T.S.track.chest.status = 'healed'; eq(T.dueSoreness().length, 0, 'no: not asked again');
T.trackWorked('chest'); T.S.track.chest.workedOn = dstr(1); eq(T.dueSoreness().length, 1, 'trained again: asked again');

const tr = o => { T.S.track.back = { workedOn: dstr(7), status: 'open', asked: [], lastAsked: null, healedOn: null, ...o }; return T.deriveSoreness('back'); };
eq(tr({}), null, 'never asked: unknown, so the manual prompt shows');
eq(tr({ asked: [{ sore: true }] }), 3, 'still sore at next session');
eq(tr({ status: 'healed', healedOn: dstr(6), asked: [{ sore: false }] }), 0, 'said no on day one: never got sore');
eq(tr({ status: 'healed', healedOn: dstr(4), asked: [{ sore: true }, { sore: false }] }), 1, 'healed 3 days after, 7 day gap: early');
eq(tr({ workedOn: dstr(3), status: 'healed', healedOn: dstr(1), asked: [{ sore: true }, { sore: false }] }), 2, 'healed 2 days after, 3 day gap: just in time');
eq(tr({ workedOn: D, asked: [{ sore: true }] }), null, 'same-day session: unknown');
eq(T.dayDiff('2026-10-27', '2026-10-28'), 1, 'dayDiff');
eq(T.dayDiff('2026-02-28', '2026-03-01'), 1, 'dayDiff across a month');

// ---- saved data keeps its settings ----
T.S = { v: 1, prefs: { unit: 'lb', bw: 180, bar: 45, barLoad: 'side' }, exercises: [], templates: [], mesos: [], activeMeso: null };
T.normalize();
eq([T.S.prefs.barLoad, T.S.prefs.needsSetup], ['side', undefined], 'saved one-end pref is kept and no setup sheet');
T.S = { v: 1, prefs: { unit: 'lb', bw: 180 }, exercises: [], templates: [], mesos: [], activeMeso: null };
T.normalize();
eq(T.S.prefs.barLoad, 'total', 'missing pref falls back to total');

// ---- up / down icon against the plan ----
const tot = { side: false }, per = { side: true, bar: 45 };
eq(T.vsPlan(tot, { w: 100, r: 11, pw: 100, pr: 10, done: true }, 2), 'up', 'more reps at planned weight is up');
eq(T.vsPlan(tot, { w: 100, r: 10, pw: 100, pr: 10, done: true }, 2), null, 'hitting the plan exactly shows nothing');
eq(T.vsPlan(tot, { w: 100, r: 9, pw: 100, pr: 10, done: true }, 2), 'down', 'fewer reps at planned weight is down');
eq(T.vsPlan(tot, { w: 90, r: 10, pw: 100, pr: 10, done: true }, 2), 'down', 'less weight at planned reps is down');
eq(T.vsPlan(tot, { w: 100, r: 12, pw: 100, pr: 10, done: true }, 1), null, 'never in week 1');
eq(T.vsPlan(tot, { w: 100, r: 5, pw: 100, pr: 10, done: true }, 1), null, 'no down in week 1 either');
eq(T.vsPlan(tot, { w: 135, r: 10, pw: null, pr: 10, done: true }, 2), null, 'no planned weight, nothing to compare');
eq(T.vsPlan(tot, { w: 100, r: 5, pw: 100, pr: 10, done: false }, 2), null, 'unlogged sets show nothing');
eq(T.vsPlan(per, { w: 50, r: 10, pw: 45, pr: 10, done: true }, 3), 'up', 'one-end entry compares totals');

// ---- set types ----
{ const x = { sets: [{ w: 50, r: 14, pw: 50, pr: 12, done: true }, withTy({ w: 50, r: 12, pw: 50, pr: 12, done: false }, 'match'),
    withTy({ w: 50, r: 12, pw: 50, pr: 12, done: false }, 'myo'), withTy({ w: 50, r: 9, pw: 50, pr: 12, done: true }, 'match')] };
  eq(T.matchTargets(x), [1], 'only unlogged match sets change');
  eq([x.sets[1].r, x.sets[1].pr], [14, 14], 'match target becomes set 1 reps');
  eq(x.sets[2].r, 12, 'myorep keeps the normal target');
  eq(x.sets[3].r, 9, 'logged match set is left alone');
  x.sets[0].done = false; eq(T.matchTargets(x), [], 'nothing to match until set 1 is logged'); }
function withTy(t, ty) { return T.withType(t, ty); }
eq(T.withType({}, 'reg').ty, undefined, 'regular stores no type');
eq(T.withType({}, 'bogus').ty, undefined, 'unknown types are ignored');
{ // strength estimate prefers regular sets over myoreps
  T.S = T.seedState(); T.normalize();
  const mm = { id: 'm2', name: 't', weeks: 5, start: '2026-10-26', days: JSON.parse(JSON.stringify(T.S.templates[0].days)), sessions: {}, created: 2, template: 'x' };
  T.S.mesos.push(mm); T.S.activeMeso = 'm2';
  const exId = mm.days[0].items[0].exId;
  mm.sessions['1-0'] = { wk: 1, di: 0, key: '1-0', done: true, fb: {}, exs: [{ exId, side: false, bar: 0, planned: 2, base: 2,
    sets: [{ w: 100, r: 10, done: true }, { w: 100, r: 25, done: true, ty: 'myo' }] }] };
  eq(T.lastPerf(exId, mm, 100).r, 10, 'myorep total reps do not set the strength estimate');
  mm.sessions['1-0'].exs[0].sets[0].ty = 'myo';
  eq(T.lastPerf(exId, mm, 100).r, 25, 'all-myorep session still counts');
  mm.sessions['1-0'].exs[0].sets[1].ty = 'match';
  const nx = T.makeEx(mm, 2, 0, exId, 3);
  eq(nx.sets.map(t => t.ty), ['myo', 'match'], 'types carry to the same sets next week'); }

// ---- lb / kg conversion ----
{ const mk = () => ({ v: 1, prefs: { unit: 'lb', bw: 180, bar: 45, barLoad: 'side' },
    exercises: [{ id: 'a', inc: 5, bar: 35 }, { id: 'b', inc: 2.5 }, { id: 'c', inc: 5, bar: 50 }], templates: [], track: {}, activeMeso: 'm',
    mesos: [{ id: 'm', sessions: { '1-0': { exs: [{ exId: 'a', side: true, bar: 45, sets: [{ w: 135, r: 8, pw: 135, pr: 8, done: true }, { w: null, r: 8, pw: null, pr: 8 }] }] } } }] });
  const st = T.convertUnits(mk(), 'kg'), x = st.mesos[0].sessions['1-0'].exs[0];
  eq(st.prefs.unit, 'kg', 'unit switches');
  eq(Math.round(x.sets[0].w * 100) / 100, 61.23, '135 lb logged becomes 61.23 kg');
  eq(Math.round(st.prefs.bw * 10) / 10, 81.6, 'bodyweight converts');
  eq([st.prefs.bar, st.exercises[0].bar], [20, 15], 'standard bars swap 45 to 20, 35 to 15');
  eq(Math.round(st.exercises[2].bar * 100) / 100, 22.68, 'non-standard bar converts exactly');
  eq([st.exercises[0].inc, st.exercises[1].inc], [2.5, 1.25], 'weight steps halve');
  eq(x.sets[1].w, null, 'empty weights stay empty');
  eq(Math.round(x.bar * 100) / 100, 20.41, 'logged bar converts exactly so totals stay true');
  const back = T.convertUnits(st, 'lb'), xb = back.mesos[0].sessions['1-0'].exs[0];
  eq(Math.abs(xb.sets[0].w - 135) < 1e-9 && Math.abs(xb.bar - 45) < 1e-9 && Math.abs(back.prefs.bw - 180) < 1e-9, true, 'switching back restores exact numbers');
  eq([back.prefs.bar, back.exercises[0].inc, back.exercises[1].inc, back.exercises[0].bar], [45, 5, 2.5, 35], 'settings round-trip');
  eq(T.planLoad({ lo: 8, hi: 12, inc: 2.5 }, { tot: 61.2349, r: 8, rir: 3 }, 2, false).w, 61.25, 'suggestions after a switch snap to 0.25');
  const same = mk(); T.convertUnits(same, 'lb'); eq(same.mesos[0].sessions['1-0'].exs[0].sets[0].w, 135, 'same unit is a no-op'); }

// ---- blank mesocycles ----
eq(T.blankDays(3).map(d => [d.name, d.weekday, d.items.length]), [['Day 1', 0, 0], ['Day 2', 2, 0], ['Day 3', 4, 0]], 'blank days spread over the week');
eq([1, 2, 3, 4, 5, 6, 7].map(n => T.blankDays(n).length), [1, 2, 3, 4, 5, 6, 7], 'any number of days');
{ T.S = T.seedState(); T.normalize();
  const bm = { id: 'b', name: 'b', weeks: 4, start: '2026-11-02', days: T.blankDays(2), sessions: {}, created: 3, template: 'Blank', blank: true };
  T.S.mesos.push(bm);
  const s1 = T.buildSession(bm, 1, 0); eq(s1.exs.length, 0, 'blank day starts empty');
  s1.exs.push(T.makeEx(bm, 1, 0, 'bench-press-barbell', 3), T.makeEx(bm, 1, 0, 'barbell-row', 4)); T.syncDay(bm, s1);
  eq(T.buildSession(bm, 2, 0).exs.map(x => [x.exId, x.sets.length]), [['bench-press-barbell', 3], ['barbell-row', 4]], 'added exercises carry to next week');
  eq(T.buildSession(bm, 2, 1).exs.length, 0, 'other days are unaffected');
  s1.exs.reverse(); T.syncDay(bm, s1); eq(bm.days[0].items.map(i => i.exId), ['barbell-row', 'bench-press-barbell'], 'order carries too');
  const tm = { days: [{ items: [{ exId: 'x', sets: 3 }] }] }; T.syncDay(tm, { di: 0, exs: [] }); eq(tm.days[0].items.length, 1, 'template blocks never change their days'); }

// ---- exercise library ----
{ T.S = T.seedState(); T.normalize();
  eq(T.S.exercises.length, T.LIB.length, 'new users get the whole library');
  eq(new Set(T.S.exercises.map(e => e.id)).size, T.S.exercises.length, 'library ids are unique');
  eq(['ab-wheel', 'burpee', 'curl-machine', 'bodyweight-squat-2-3'].some(id => T.ex(id)), false, 'custom exercises from the other app are left out');
  eq(T.ex('bench-press-barbell').name, 'Bench Press (Medium Grip)', 'old ids keep working under the new name');
  eq(T.S.templates[0].days.every(d => d.items.every(i => T.ex(i.exId))), true, 'sample template points at real exercises');
  // An older account: old default names, a renamed built-in, a custom exercise, and logged history.
  const old = { v: 1, prefs: { unit: 'kg', bw: 80 }, exercises: [
      { id: 'barbell-row', name: 'Barbell Row', muscle: 'back', equip: 'Barbell', lo: 6, hi: 10, inc: 2.5 },
      { id: 'face-pull', name: 'My Face Pulls', muscle: 'shoulders', equip: 'Cable', lo: 12, hi: 20, inc: 2.5 },
      { id: 'hack-squat', name: 'Hack Squat', muscle: 'quads', equip: 'Machine', lo: 6, hi: 8, inc: 5 },
      { id: 'my-thing', name: 'Pec Dec Flye', muscle: 'chest', equip: 'Machine', lo: 10, hi: 15, inc: 5 }],
    templates: [], mesos: [], activeMeso: null, track: {} };
  eq(T.upgradeLib(old), true, 'old library upgrades');
  const by = id => old.exercises.find(e => e.id === id);
  eq(by('barbell-row').name, 'Barbell Bent Over Row', 'untouched built-in gets its new name');
  eq(by('face-pull').name, 'My Face Pulls', 'a name the user changed is kept');
  eq([by('hack-squat').lo, by('hack-squat').hi], [6, 8], 'user settings are never overwritten');
  eq(old.exercises.filter(e => e.name.toLowerCase() === 'pec dec flye').length, 1, 'no duplicate of an exercise the user already made');
  eq(by('arnold-press').inc, 2.5, 'added exercises use kg steps for kg users');
  eq(T.upgradeLib(old), false, 'upgrade runs once');
  const n = old.exercises.length; old.exercises = old.exercises.filter(e => e.id !== 'arnold-press'); T.upgradeLib(old);
  eq(old.exercises.length, n - 1, 'a deleted exercise does not come back'); }
{ // assisted machines: entered weight is assistance, so less assistance is progress
  T.S = T.seedState(); T.normalize(); T.S.prefs.bw = 200;
  const a = T.ex('assisted-pullup-normal-grip');
  eq([a.assist, a.bw], [true, false], 'assisted exercises are flagged');
  const mode = T.loadMode(a); eq(mode, { side: false, bar: 0, assist: true, abw: 200 }, 'assisted load mode uses bodyweight');
  eq(T.totOf(mode, 60), 140, 'load moved = bodyweight - assistance');
  const p = T.planLoad(a, { tot: 140, r: 14, rir: 0 }, 0, false, mode);
  eq(p.w < 60, true, 'beating the top of the range means less assistance');
  eq(T.planLoad(a, { tot: 140, r: 10, rir: 2 }, 2, false, mode).w, 60, 'holds assistance while reps climb');
  eq(T.planLoad(a, { tot: 195, r: 14, rir: 0 }, 0, false, mode).w >= 0, true, 'assistance never goes below zero');
  eq(T.vsPlan(mode, { w: 50, r: 10, pw: 60, pr: 10, done: true }, 2), 'up', 'less assistance than planned is up'); }

// ---- bodyweight exercises ----
{ T.S = T.seedState(); T.normalize(); T.S.prefs.bw = 200;
  const wp = T.ex('pullup-weighted-normal-grip'), pu = T.ex('pullup-parallel-grip');
  eq([wp.plus, wp.bw, !!pu.plus], [true, true, false], 'weighted bodyweight exercises take added weight');
  const mp = T.loadMode(wp); eq(T.totOf(mp, 25), 225, 'total = bodyweight + added');
  eq(T.planLoad(wp, null, 3, false, mp).w, 0, 'first time starts with nothing added');
  eq(T.planLoad(wp, { tot: 225, r: 10, rir: 2 }, 2, false, mp).w, 25, 'holds the same total');
  const mb = T.loadMode(pu);
  eq(T.planLoad(pu, { tot: 200, r: 8, rir: 3 }, 2, false, mb), { w: 200, r: 9 }, 'bodyweight-only progresses by reps, never adds weight');
  eq(T.planLoad(pu, { tot: 200, r: 14, rir: 0 }, 0, false, mb).w, 200, 'even past the top of the range');
  // A session with all three kinds, then bodyweight goes up 5.
  const s = { exs: [
    { exId: wp.id, plus: true, abw: 200, sets: [{ w: 25, pw: 25, r: 8, done: true }, { w: 25, pw: 25, r: 8 }] },
    { exId: pu.id, bwo: true, abw: 200, sets: [{ w: 200, pw: 200, r: 9 }] },
    { exId: 'assisted-dip', assist: true, abw: 200, sets: [{ w: 60, pw: 60, r: 10 }] },
    { exId: 'barbell-bent-over-row', sets: [{ w: 135, pw: 135, r: 8 }] }] };
  eq(T.usesBw(s), true, 'session uses bodyweight');
  T.setBodyweight(s, 205);
  eq([s.exs[0].sets[1].w, s.exs[0].sets[1].pw, s.exs[0].sets[0].w], [20, 20, 25], 'heavier: added weight drops, logged sets untouched');
  eq(s.exs[1].sets[0].w, 205, 'bodyweight-only takes the new bodyweight');
  eq(s.exs[2].sets[0].w, 65, 'heavier: more assistance keeps the load');
  eq(s.exs[3].sets[0].w, 135, 'other exercises unchanged');
  T.setBodyweight(s, 240); eq(s.exs[0].sets[1].w, 0, 'added weight never goes below zero');
  eq(T.usesBw({ exs: [{ sets: [] }] }), false, 'no bodyweight exercises, no prompt');
  const s2 = { exs: [{ exId: wp.id, plus: true, abw: 200, sets: [{ w: 22.5, pw: 22.5, r: 8 }] }] }; T.setBodyweight(s2, 200);
  eq(s2.exs[0].sets[0].w, 22.5, 'same bodyweight leaves weights exactly as they are');
  const old = { v: 1, libv: 2, prefs: {}, exercises: [{ ...wp, plus: undefined }, { ...T.ex('pushup-weighted-narrow-grip'), plus: undefined, equip: 'Weighted vest' }], templates: [], mesos: [] };
  T.upgradeLib(old); eq([old.exercises[0].plus, old.exercises[1].plus], [true, undefined], 'upgrade flags untouched weighted exercises only'); }

// ---- interval (EMOM) exercises ----
{ const done = tg => tg.map(r => ({ pr: r, r, done: true }));
  eq(T.ivlNext(null, 10, 10), [10, 10, 10, 10, 10, 10, 10, 10, 10, 10], 'first time: every round at the starting reps');
  let tg = [10, 10, 10, 10, 10, 10, 10, 10, 10, 10]; const totals = [];
  for (let w = 0; w < 6; w++) { tg = T.ivlNext(done(tg), 10, 10); totals.push(tg.reduce((a, b) => a + b, 0)); }
  eq(totals, [102, 104, 106, 108, 110, 112], 'adds 2 reps a week, base goes up when every round has the extra rep');
  eq(T.ivlNext(done([10, 10, 10, 10, 10, 10, 10, 10, 11, 11]), 10, 10), [10, 10, 10, 10, 10, 10, 11, 11, 11, 11], 'the extra reps grow from the end');
  const missed = [10, 10, 10, 10, 10, 10, 10, 10, 11, 11].map((r, i) => ({ pr: r, r: i === 9 ? 10 : r, done: true }));
  eq(T.ivlNext(missed, 10, 10), [10, 10, 10, 10, 10, 10, 10, 10, 11, 11], 'a missed round repeats the week');
  eq(T.ivlNext(done([10, 10, 10, 10, 10, 10, 10, 10, 11, 11]), 12, 10), [10, 10, 10, 10, 10, 10, 10, 10, 11, 11, 11, 11], 'more rounds keeps base and extras');
  T.S = T.seedState(); T.normalize();
  T.S.exercises.push({ id: 'burpee', name: 'Burpee', muscle: 'quads', equip: 'Bodyweight', lo: 8, hi: 12, inc: 5, bw: true, ivl: { rounds: 10, reps: 10, secs: 60 } });
  const m = { id: 'iv', name: 'iv', weeks: 5, start: '2026-11-02', days: [{ name: 'D', weekday: 0, items: [{ exId: 'burpee', sets: 3 }, { exId: 'leg-press', sets: 3 }] }], sessions: {}, created: 9, template: 'x' };
  T.S.mesos.push(m);
  const tot = x => x.sets.reduce((a, t) => a + t.pr, 0);
  for (let wk = 1; wk <= 5; wk++) { const s = T.buildSession(m, wk, 0); s.exs[0].sets.forEach(t => { t.done = true; }); m.sessions[s.key] = s; }
  eq([1, 2, 3, 4, 5].map(wk => tot(m.sessions[wk + '-0'].exs[0])), [100, 102, 104, 106, 60], 'a 5-week block: 100, 102, 104, 106, deload 60');
  eq(m.sessions['1-0'].exs[0].sets.length, 10, 'rounds come from the exercise, not the template set count');
  const s = T.buildSession(m, 2, 0); s.fb = { quads: { sor: 0 } };
  T.applyMuscle(m, s, 'quads'); eq(s.exs[0].sets.length, 10, 'set adjustments never change interval rounds');
  const m2 = { ...m, id: 'iv2', created: 10, sessions: {} }; T.S.mesos.push(m2);
  eq(tot(T.buildSession(m2, 1, 0).exs[0]), 108, 'the next mesocycle picks up where the last one finished'); }

// ---- supersets ----
eq(T.ssGroups([{}, { ss: true }, {}, {}]), [[0], [1, 2], [3]], 'a link joins an exercise to the next');
eq(T.ssGroups([{ ss: true }, { ss: true }, {}]), [[0, 1, 2]], 'links chain into a circuit');
eq(T.ssGroups([{}, { ss: true }]), [[0], [1]], 'a link on the last exercise does nothing');
eq(T.ssGroups([{ ss: true }, { ivl: true }]), [[0], [1]], 'interval exercises never link');
{ T.S = T.seedState(); T.normalize();
  const m = { id: 'ss', name: 'ss', weeks: 4, start: '2026-11-02', days: [{ name: 'D', weekday: 0, items: [{ exId: 'push-up', sets: 3, ss: true }, { exId: 'goblet-squat', sets: 3 }] }], sessions: {}, created: 11, template: 'x' };
  T.S.mesos.push(m);
  const s1 = T.buildSession(m, 1, 0); eq(T.ssGroups(s1.exs), [[0, 1]], 'a linked day item builds a linked session');
  eq(T.ssGroups(T.buildSession(m, 3, 0).exs), [[0, 1]], 'and stays linked in later weeks');
  const b = { id: 'sb', blank: true, days: [{ items: [] }] }; T.syncDay(b, { di: 0, exs: [{ exId: 'a', base: 3, sets: [], ss: true }, { exId: 'b', base: 3, sets: [] }] });
  eq(b.days[0].items, [{ exId: 'a', sets: 3, ss: true }, { exId: 'b', sets: 3 }], 'blank days remember links'); }

// ---- muscle priorities ----
eq(T.prioDelta(1, 'grow', 1, 1), 1, 'grow is the standard rule');
eq(T.prioDelta(1, 'emph', 1, 1), 2, 'emphasize adds one more set when recovered');
eq(T.prioDelta(0, 'emph', 0, null), 1, 'emphasize adds when nothing else would');
eq(T.prioDelta(1, 'emph', 2, 1), 1, 'emphasize does not push a muscle that recovered just in time');
eq(T.prioDelta(1, 'emph', 1, 2), 1, 'or one that is near its volume limit');
eq(T.prioDelta(-2, 'emph', 3, 3), -2, 'emphasize still removes sets when it is too much');
eq(T.prioDelta(3, 'emph', 0, 0), 3, 'never more than 3');
eq(T.prioDelta(2, 'maint', 0, 0), 0, 'maintain never adds');
eq(T.prioDelta(-2, 'maint', 3, 3), -2, 'maintain still removes');
{ T.S = T.seedState(); T.normalize();
  const m = { id: 'pr', name: 'pr', weeks: 5, start: '2026-11-02', days: [{ name: 'D', weekday: 0, items: [{ exId: 'goblet-squat', sets: 3 }, { exId: 'leg-press', sets: 3 }] }], sessions: {}, created: 12, template: 'x', prio: { quads: 'maint' } };
  T.S.mesos.push(m);
  const s1 = T.buildSession(m, 1, 0); s1.exs.forEach(x => x.sets.forEach(t => { t.done = true; })); s1.fb = { quads: { sor: 0, pump: 2, vol: 0 } }; m.sessions[s1.key] = s1;
  const s2 = T.buildSession(m, 2, 0); s2.fb = { quads: { sor: 0 } }; T.applyMuscle(m, s2, 'quads');
  eq([s2.fb.quads.delta, s2.exs.map(x => x.sets.length)], [0, [3, 3]], 'maintain keeps sets even when feedback says add');
  m.prio = { quads: 'emph' }; const s3 = T.buildSession(m, 2, 0); s3.fb = { quads: { sor: 0 } }; T.applyMuscle(m, s3, 'quads');
  eq(s3.fb.quads.delta, 3, 'emphasize on the same feedback adds the most'); }

console.log(ok + ' passed, ' + bad + ' failed');
process.exit(bad ? 1 : 0);
