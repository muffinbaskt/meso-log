# Meso Log

Mesocycle workout tracker, built for Bryan and being opened up to other users (accounts via Supabase). Modeled on the flow of the RP Hypertrophy app he trains with: mesocycles, per-set logging, post-session feedback that adjusts sets, weight suggestions that follow logged performance. The adjustment rules are original, simple heuristics written for this app. They are not RP's algorithm, and no RP content (exercise videos, templates, copy) is included. `docs/reference/` holds the user's own screenshots, used only as a layout reference.

Working with the owner: he prefers step-by-step instructions, direct answers about scope before building, and design issues flagged early. He is comfortable running commands himself.

## Status

- Built in a Claude chat as a published artifact (v2), then packaged here. `index.html` is now the source of truth.
- Smoke tested at 390 px in light and dark with Playwright on 2026-10-29 (every tab and sheet, no console errors). Not yet used for real workouts: the owner is testing it over several weeks before inviting anyone.
- Logic is covered by `tests/logic.test.js` (205 checks, all passing). Storage and sign-in have no automated tests. Run `npm test`.
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
  templates: [{ id, name, days: [{ name, weekday, items: [{ exId, sets, ss? }] }] }],   // new users start with the owner's 6-day plan (seedState)
  mesos: [{ id, name, weeks, start, days, sessions, created, template, style, blank? }],   // style 'std' (default) | 'test'; blank = started with no template
  activeMeso: id | null,
  track: { [muscleId]: { workedOn, status: 'open'|'healed', asked: [{d, sore}], lastAsked, healedOn } }
}
// meso.sessions["<week>-<dayIndex>"] =
{ wk, di, key, done, date,
  fb: { [muscleId]: { sor, pump, vol, post, skip, auto, delta } },
  exs: [{ exId, note, side, bar, base, planned, joint, swap,
          sets: [{ w, r, pw, pr, done, ty? }] }] }  // w/r = current, pw/pr = planned (used to dim untouched reps), ty = 'myo' | 'match' (absent = regular)
```

A mesocycle copies its template's days when it starts, so later template edits never change a running block. A blank mesocycle (`blank: true`, days from `blankDays(n)`) starts with empty days; `syncDay` copies each workout's exercise list (add, replace, remove, reorder) back into `m.days[di].items`, so it carries to later weeks. Template mesocycles never sync. The last week of a mesocycle is the deload.

## Rules (all in script block 1)

- **Target RIR** (`rirFor`): accumulation weeks = weeks - 1. RIR falls from 3 to 0 across them. Deload week is 5. A 5-week block gives 3, 2, 1, 0, 5. With `style: 'test'` (chosen per mesocycle when it starts), week 1 is a test week at 0-1 RIR (stored as 0.5, shown by `rirLabel`) and the rest ladder from 2 to 0: 0.5, 2, 1, 0, 5. The 0.5 feeds the e1RM estimate like any other RIR.
- **Weight and reps** (`planLoad`, `lastPerf`): take the best set of the most recent non-deload session (by Epley e1RM), estimate e1RM = total * (1 + (reps + RIR) / 30), then pick the reps that reach the target RIR at the same weight. Above the top of the rep range: step the weight up (up to 8 steps). Below the bottom by more than 1.5 reps: step down (up to 3). Deload: 75% of total weight, and for bodyweight exercises the weight stays and reps x0.7.
- **Sets** (`setDelta`, `distribute`, `applyMuscle`): base sets = last session's planned sets for that exercise, else the template. Deload is half, rounded up. Delta for a muscle = soreness `[+2, +1, 0, -2]` plus last session's volume rating `[+1, 0, -1, -2]`, plus 1 if pump was low and soreness was 0 or 1. Clamped to -3..+3. Added sets go to the exercise with the fewest sets (cap 6), removed sets come from the one with the most (floor 1). Logged sets are never removed. It runs when the first set of a muscle is logged, and is skipped in the deload week.
- **Set types** (`withType`, `matchTargets`, `SET_TY`): set menu > Set type. Myorep is planned like a regular set and logs total reps. Myorep match takes set 1's logged reps as its target (updated when set 1 is logged or its reps edited). Types carry to the same set position next session. `lastPerf` uses regular sets only when a session has any, since myorep totals overstate strength.
- **Units** (`convertUnits`): switching lb/kg (after a confirm) converts logged and planned weights, bodyweight and session bars exactly, so a round trip restores them. Weight steps halve/double and standard bars swap (45 lb = 20 kg). Planned weights snap to a 0.25 grid so converted history gives loadable suggestions. The Welcome sheet runs the same conversion.
- **Exercise library** (`LIB`, `libEx`, `upgradeLib`, `LIB_ALIAS`, `LIB_V`): 312 exercises, built from the owner's exercise list in the other app (their own custom ones left out). Rows are `[name, muscle, equip, lo, hi, inc, kind, id?]`, kind 1 = bodyweight, 2 = assisted machine. Older built-ins were renamed to their list names but keep their ids, so history stays attached. `upgradeLib` runs in `normalize` once per `LIB_V`: renames untouched old built-ins, adds missing exercises (halving steps for kg users), never removes or overwrites. `libv` is saved with core data so deleted exercises don't come back. To add an exercise later: add its row to `LIB`, bump `LIB_V`, and list the name under the new version in `LIB_ADDED` so existing accounts get it once.
- **Bodyweight exercises**: bodyweight-only (`bwo`) sets use today's bodyweight as the weight and progress by reps only; bodyweight + weight (`plus`, library kind 3) sets take the added weight, total = bodyweight + added. Session exercises keep today's bodyweight in `abw`. The first time a day with any of these is opened, `maybeAskBw` asks for today's bodyweight (once per session, `s.bwAsked`); the chip above each such exercise reopens it. `setBodyweight` keeps planned loads: added weight drops and assistance rises when you are heavier, rounded to the step, never below 0; logged sets are untouched.
- **Assisted machines** (`assist: true`): the entered weight is the assistance. `loadMode` returns `{assist, abw}` (bodyweight), `totOf` = bodyweight − assistance, so progression lowers assistance. Session exercises store `assist`/`abw` like `side`/`bar`.
- **Interval exercises** (`e.ivl = {rounds, reps, secs}`, `ivlNext`, `lastIvl`, `ivlEx`): each round is a set (target in `pr`), shown as a tap-to-log grid. Time stays fixed: after a week with every round hit, the last 2 more rounds get +1 rep; when all have it the base goes up by 1; a missed round repeats the week. Deload is 60% of the rounds at the base. Progress carries across mesocycles. `applyMuscle` never resizes interval rounds. No e1RM, so they are not in strength charts; history shows rounds and totals.
- **Supersets** (`ssGroups`, `x.ss` / day and template item `.ss`): a link joins an exercise to the next; runs of links make one group (circuits work). Linked from the exercise menu (also saved to the mesocycle's day, so later weeks keep it) or the template editor's link button. A group renders as one card with sets interleaved by round (A1, A2 tags); "Log round" queues `toggleSet` for each set through `ui.pq`/`pqNext`, which waits for each feedback sheet to close. Interval exercises never link.
- **Equipment** (`EQUIP`): the editor's dropdown values match library equipment names. Bodyweight only / + added weight / Machine assistance set `bw`/`plus`/`assist`; Custom takes a typed name and is loaded weight.
- **Muscle priorities** (`m.prio[muscle]`, `prioDelta`, `prioOf`): per mesocycle, default Grow = the standard set rules. Emphasize adds 1 more set when soreness is 0-1 and the last volume rating was not near the limit. Maintain never adds sets (removals still apply). Applied in `applyMuscle` after `setDelta`. Set from the workout menu or a mesocycle card; a new mesocycle copies the previous one's priorities.
- **Reorder and replace scope**: the exercise menu's Reorder opens a drag list (pointer events on `[data-drag]` handles, listeners on `document`); Replace asks after the pick. "Just today" changes the session only; "Rest of mesocycle" also updates `m.days[di].items` (`reorderItems`, `replaceItem`, or `syncDay` for blank mesocycles) and `dropUntouched` removes later unstarted saved sessions of that day so they rebuild. Templates are never changed by this.
- **Notes** (`hasNote`, `noteDue`): `x.note` is today only, `e.pin` is pinned to the exercise (synced with core data). The exercise header shows a Note button; it becomes a pulsing "Read note" once every exercise in the group before it is finished (the first group from the start), with a toast at that moment. Opening it sets `x.noteSeen`. Edited from the exercise menu's Notes. A workout note (`s.note`, today only, never pinned) is set from the workout menu and shows at the top of the workout.
- **Quick workouts** (`quickMeso`, `isDl`, `plans`, `QUICK_RIR`): a one-off workout with no plan, started from the Mesos tab or the empty Workout tab. Stored as a mesocycle with `quick: true` (1 week, 1 blank day, `ret` = the plan it was opened from), so sync, history and charts need nothing new. No RIR target, no deload, no feedback sheets, no set changes. `rirFor` gives 2 so its sets feed later e1RM estimates; `makeEx` plans at the last set's own RIR, which repeats the last best set. `lastPerf`'s created-date rule keeps a quick workout done during a running mesocycle out of that mesocycle's plan. Listed apart on the Mesos tab; `plans()` excludes them wherever "the latest mesocycle" is meant. Finishing or closing goes back to `ret` (`leaveQuick`, `fallbackMeso`); one with nothing logged is deleted (`pruneQuick`).
- **Up/down icon** (`vsPlan`): a logged set whose e1RM (total weight) is above its planned set's gets a green up graph, below gets a red down graph. Never in week 1, never without a planned weight.
- **Joint pain:** moderate or severe takes one set off next time. Severe also shows a "consider replacing" flag.
- **Weight entry:** exercises can record weight as total, or as the weight on ONE end. `loadMode(e)` resolves it (exercise override, else `prefs.barLoad` for barbell exercises). Per-end total = bar + 2 x entered. All comparison, e1RM and progression run on total weight, and steps are `inc` per end (2 x inc total). Each session exercise stores `side` and `bar` so history stays correct if the exercise setting changes later. The exercise menu's "Weight entry" converts the sets already in the workout so the total is preserved.
- **Soreness check-ins:** logging a muscle calls `trackWorked`. From the next day `dueSoreness()` lists open muscles and the app asks "still sore?" (sheet on open once per day, plus a banner). Yes = ask again tomorrow. No = `healed`, no more questions until trained again. `deriveSoreness()` turns the history into the 0 to 3 soreness rating, so the manual prompt only shows when no history exists.

## Hosting and email

- Live at https://bbqsauce.fit, served by GitHub Pages from `main` (repo `muffinbaskt/meso-log`, public). Pushing to `main` deploys. `CNAME` holds the domain. `www` and `http` redirect.
- Domain registered at Porkbun. DNS there: GitHub Pages A/AAAA records, `www` CNAME, GitHub verification TXT, and Resend's records (`resend._domainkey`, `rsend`, `send`, `_dmarc`).
- Sign-in emails go through Resend (custom SMTP in Supabase, sender `login@bbqsauce.fit`). Supabase redirect URLs list `https://bbqsauce.fit/**` and localhost.
- Installable via `manifest.webmanifest` and `icons/`. When an icon changes, give the files a new version suffix (`-v3`) and bump `manifest.webmanifest?v=` in `index.html`: Chrome and Android cache icons by URL, so same-name replacements don't show up. `icons/mascot.png` is the transparent cutout the icons are made from. No service worker yet.
- **Security** (reviewed 2026-10-30):
  - A `Content-Security-Policy` meta tag limits scripts to this site and jsDelivr, network calls to the Supabase project, and styles and fonts to Google Fonts. A new external host (CDN, API, image) must be added there or it will be blocked.
  - supabase-js loads with an `integrity` (SRI) hash. When bumping its version, recompute it: `curl -s <url> | openssl dgst -sha384 -binary | base64`.
  - The UI block refuses to run inside a frame (GitHub Pages can't send `X-Frame-Options`).
  - Import runs `unsafeBackup` first: markup characters are only allowed in the always-escaped text fields (`TEXT_KEYS`). Every user string shown in HTML must go through `esc()`.
  - Row level security was checked from outside: without signing in, reads, writes and `delete_my_account` are all refused.
  - Size limits on rows are in `supabase/schema.sql`.
  - Sign-in CAPTCHA: Cloudflare Turnstile, off while `TS_KEY` (script block 2) is empty. With a key, `mountCaptcha` renders an invisible-unless-needed widget on the sign-in screen and `sendMagicLink` passes `captchaToken`. Order matters: deploy the site key first, then turn on CAPTCHA in Supabase (Authentication > Attack Protection, Turnstile secret key), or sign-ins fail. Tested with Cloudflare's always-pass test key `1x00000000000000000000AA`.
- `docs/reference/*.png` are gitignored on purpose: RP screenshots must never be published.

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
6. Not built: rest timer, exercise videos, editing a running mesocycle's days, mid-block template sync.
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
