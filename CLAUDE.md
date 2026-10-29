# Meso Log

Mesocycle workout tracker, built for Bryan and being opened up to other users (accounts via Supabase). Modeled on the flow of the RP Hypertrophy app he trains with: mesocycles, per-set logging, post-session feedback that adjusts sets, weight suggestions that follow logged performance. The adjustment rules are original, simple heuristics written for this app. They are not RP's algorithm, and no RP content (exercise videos, templates, copy) is included. `docs/reference/` holds the user's own screenshots, used only as a layout reference.

Working with the owner: he prefers step-by-step instructions, direct answers about scope before building, and design issues flagged early. He is comfortable running commands himself.

## Status

- Built in a Claude chat as a published artifact (v2), then packaged here. `index.html` is now the source of truth.
- Smoke tested at 390 px in light and dark with Playwright on 2026-10-29 (every tab and sheet, no console errors). Not yet used for real workouts: the owner is testing it over several weeks before inviting anyone.
- Logic is covered by `tests/logic.test.js` (87 checks, all passing). Storage and sign-in have no automated tests. Run `npm test`.
- Run locally: `npm run dev`, then open http://localhost:5173 (or just open `index.html`).

## Layout of the code

Everything is in `index.html`: CSS in `<style>`, then three `<script>` blocks.

1. **Domain logic** (pure, no DOM). Library, `seedState`, RIR ladder, progression, set adjustment, soreness check-ins, history. This is the test target. The tests load this block by regex, so keep it first and keep it free of DOM and browser calls.
2. **Storage.** `mark()`, `flush()`, `initStorage()`.
3. **UI.** Render functions return HTML strings, `render()` sets `#app.innerHTML`. Event delegation: `click` on `[data-act]` runs `ACT[name]`, `change` on `[data-chg]`, `input` on `[data-inp]`. Sheets (modals) render into `#sheet`.

Conventions worth keeping:
- Tokens are CSS custom properties on `:root`, dark first, light via `prefers-color-scheme` and `data-theme`. Never use literal colors in components.
- Muscle badges take a hue from `MUSCLES[].hue` via `--h`.
- Weight and rep inputs write on `change` and do not re-render, so the keyboard stays open. The log button re-renders.
- `curSession()` builds the visible session lazily into `ui.tmp`. It is only stored in `meso.sessions` on the first `commit(s)`.
- Safe-area insets are handled in CSS (`env(safe-area-inset-*)`), the tab bar is fixed to the bottom.

## Data model (`S`)

```js
S = {
  v: 1,
  prefs: { unit: 'lb', bw: 200, bar: 45, barLoad: 'total', needsSetup? },   // needsSetup = show the Welcome sheet (new users only)   // bw = bodyweight, bar = default bar, barLoad = 'side' | 'total' for barbell exercises
  exercises: [{ id, name, muscle, equip, lo, hi, inc, bw, load?, bar? }],   // lo-hi rep range, inc = weight step in ENTERED units
  templates: [{ id, name, days: [{ name, weekday, items: [{ exId, sets }] }] }],
  mesos: [{ id, name, weeks, start, days, sessions, created, template, style }],   // style 'std' (default) | 'test'
  activeMeso: id | null,
  track: { [muscleId]: { workedOn, status: 'open'|'healed', asked: [{d, sore}], lastAsked, healedOn } }
}
// meso.sessions["<week>-<dayIndex>"] =
{ wk, di, key, done, date,
  fb: { [muscleId]: { sor, pump, vol, post, skip, auto, delta } },
  exs: [{ exId, note, side, bar, base, planned, joint, swap,
          sets: [{ w, r, pw, pr, done, ty? }] }] }  // w/r = current, pw/pr = planned (used to dim untouched reps), ty = 'myo' | 'match' (absent = regular)
```

A mesocycle copies its template's days when it starts, so later template edits never change a running block. The last week of a mesocycle is the deload.

## Rules (all in script block 1)

- **Target RIR** (`rirFor`): accumulation weeks = weeks - 1. RIR falls from 3 to 0 across them. Deload week is 5. A 5-week block gives 3, 2, 1, 0, 5. With `style: 'test'` (chosen per mesocycle when it starts), week 1 is a test week at 0-1 RIR (stored as 0.5, shown by `rirLabel`) and the rest ladder from 2 to 0: 0.5, 2, 1, 0, 5. The 0.5 feeds the e1RM estimate like any other RIR.
- **Weight and reps** (`planLoad`, `lastPerf`): take the best set of the most recent non-deload session (by Epley e1RM), estimate e1RM = total * (1 + (reps + RIR) / 30), then pick the reps that reach the target RIR at the same weight. Above the top of the rep range: step the weight up (up to 8 steps). Below the bottom by more than 1.5 reps: step down (up to 3). Deload: 75% of total weight, and for bodyweight exercises the weight stays and reps x0.7.
- **Sets** (`setDelta`, `distribute`, `applyMuscle`): base sets = last session's planned sets for that exercise, else the template. Deload is half, rounded up. Delta for a muscle = soreness `[+2, +1, 0, -2]` plus last session's volume rating `[+1, 0, -1, -2]`, plus 1 if pump was low and soreness was 0 or 1. Clamped to -3..+3. Added sets go to the exercise with the fewest sets (cap 6), removed sets come from the one with the most (floor 1). Logged sets are never removed. It runs when the first set of a muscle is logged, and is skipped in the deload week.
- **Set types** (`withType`, `matchTargets`, `SET_TY`): set menu > Set type. Myorep is planned like a regular set and logs total reps. Myorep match takes set 1's logged reps as its target (updated when set 1 is logged or its reps edited). Types carry to the same set position next session. `lastPerf` uses regular sets only when a session has any, since myorep totals overstate strength.
- **Up/down icon** (`vsPlan`): a logged set whose e1RM (total weight) is above its planned set's gets a green up graph, below gets a red down graph. Never in week 1, never without a planned weight.
- **Joint pain:** moderate or severe takes one set off next time. Severe also shows a "consider replacing" flag.
- **Weight entry:** exercises can record weight as total, or as the weight on ONE end. `loadMode(e)` resolves it (exercise override, else `prefs.barLoad` for barbell exercises). Per-end total = bar + 2 x entered. All comparison, e1RM and progression run on total weight, and steps are `inc` per end (2 x inc total). Each session exercise stores `side` and `bar` so history stays correct if the exercise setting changes later. The exercise menu's "Weight entry" converts the sets already in the workout so the total is preserved.
- **Soreness check-ins:** logging a muscle calls `trackWorked`. From the next day `dueSoreness()` lists open muscles and the app asks "still sore?" (sheet on open once per day, plus a banner). Yes = ask again tomorrow. No = `healed`, no more questions until trained again. `deriveSoreness()` turns the history into the 0 to 3 soreness rating, so the manual prompt only shows when no history exists.

## Storage

- Always mirrors to `localStorage` key `meso-log-v1`. `meso-log-owner` records which account the device copy belongs to, `meso-log-mode` = `local` means the user chose "Use without an account".
- Signed in, it syncs to Supabase (project `zatngvydcqwlilmhafxj`, URL and publishable key at the top of script block 2). Schema and row level security are in `supabase/schema.sql`: `user_core` (one row per user: prefs, exercises, templates, activeMeso, track) and `mesos` (one row per mesocycle), plus `delete_my_account()`. `mark('core' | 'meso:<id>' | 'del:<id>')` queues a debounced flush (700 ms).
- supabase-js loads from jsDelivr (pinned). If it fails to load the app runs on `localStorage` only.
- Sign-in: email magic link only (`sendMagicLink`). Google sign-in was tried and dropped by the owner as too much setup. No session and no local-mode flag shows the sign-in screen (`ui.signin`, `viewSignin()`). More > Account has sign out (clears the device copy) and delete account.
- First sign-in with no `user_core` row uploads the device data, unless the device copy belongs to a different account. If the account cannot be loaded at start, device data is only pushed when `meso-log-owner` matches the user (`READY`), so it never overwrites an account it was not loaded from.
- Sync is last-write-wins per row. Two devices editing at once can overwrite each other.
- Backup: More > Export backup downloads JSON, More > Import backup replaces everything from that JSON. The export includes `track`.

## Known gaps and things I would check first

2. Per-end entry needs a weight above 0, so a set with only the bar cannot be logged in that mode.
3. The sample barbell exercises have a 5 lb step. With one-end entry that is a 10 lb total jump, so 2.5 is probably what he wants. Change it in `LIB` or in the exercise editor.
4. Un-logging the only done set of a muscle does not undo the soreness-check reset made when it was logged.
5. No notifications. A page cannot push. Standalone, the cleanest route is a service worker plus Web Push (Supabase edge function on a cron fits how Riggy works). Until then the check only appears when the app is opened.
6. Not built: rest timer, exercise videos, editing a running mesocycle's days, mid-block template sync, kg/lb conversion (unit is a label only).
7. The unit toggle does not convert numbers, and `prefs.bar` stays 45 when switching to kg.
8. Rules are untested against real training. Expect to tune the set deltas and the e1RM step logic after a week or two of use.
9. No PWA bits yet: web manifest, icons, service worker (remember the service-worker caching gotcha from Riggy).

## Suggested next steps

1. `npm test`, then `npm run dev` and click through every tab at about 400 px wide. Fix anything visual.
2. Add manifest, icons and a service worker so it installs to the home screen.
3. Decide storage: stay on `localStorage` with manual backups, or add a backend (keep the `initStorage` / `flush` seam).
4. Add Web Push for the daily soreness check once a backend exists.
5. After a week of real use, tune the rules in script block 1 and add tests for any change.

## Moving his existing data

If he has already used the artifact: in the artifact open More > Export backup, save the JSON, then in this app open More > Import backup. His data is not in this folder.
