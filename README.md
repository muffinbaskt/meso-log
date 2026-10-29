# Meso Log

A personal mesocycle workout tracker. One HTML file, no build step.

## Run it

```
npm run dev      # serves http://localhost:5173
npm test         # 58 logic checks
```

Or open `index.html` directly in a browser. Data is saved in the browser (`localStorage`). Use More > Export backup now and then.

## What is in this folder

| Path | What it is |
|---|---|
| `index.html` | The whole app. Source of truth. |
| `CLAUDE.md` | Architecture, data model, the adjustment rules, storage, known gaps. Read this first. |
| `tests/logic.test.js` | Tests for the domain logic (loads the first script block of `index.html`). |
| `docs/reference/` | Six screenshots of the app this one is modeled on, for layout reference. |
| `package.json` | `dev` and `test` scripts only. No dependencies. |

## Kickoff prompt for Claude Code

> Read CLAUDE.md. Run `npm test`, then serve the app and check every screen at phone width in light and dark. List anything that looks wrong before changing code. After that, work through "Suggested next steps" in CLAUDE.md one at a time, and confirm each with me before starting the next.

## Moving existing data

If you already used the version in Claude: open it, go to More > Export backup, save the JSON, then open this copy and use More > Import backup.
