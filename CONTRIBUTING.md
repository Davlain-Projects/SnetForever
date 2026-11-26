# Contributing to SnetForever

Read the [documentation index](docs/README.md) for the design and release status relevant to your change. Install Node.js 24 and use npm from the repository root.

```sh
npm run bootstrap
npm run check
```

## Where changes belong

| Area | Location |
| --- | --- |
| In-game behavior and UI | [`addons/`](addons/) |
| Windows companion and app tests | [`app/`](app/) |
| Addon simulation | [`tools/banco-wow/`](tools/banco-wow/) |
| Game-data and custom-guide conversion | [`tools/conversor/`](tools/conversor/) |
| Installation and signed updates | [`tools/empaquetar/`](tools/empaquetar/) |

For changes to menus, buttons, or guide views, add an image and the design decision to the [gallery](docs/design/). Refresh the [README preview](README.md#addon-interface) when the selected appearance changes.

Keep fixtures anonymous and credentials, character data, and private guides out of commits, logs, issues, and pull requests. Save local converter reports under `artifacts/reports/`.

## TypeScript in the desktop app

Edit the desktop application under `app/typescript/src/` and the Windows bootstrap under `app/typescript/arranque/`. Run `npm run build:app` and commit the generated ES modules in the matching `app/src/` and `app/arranque/` directories. The Windows installer and signed updater consume these compiled files from the Git snapshot. Runtime assets, PowerShell helpers and JavaScript tests stay in their existing directories.

The compiler checks every production module. The application configuration allows implicit parameter types, nullable legacy values and untyped caught errors. The strict configuration adds stronger checks for its listed modules. Add a migrated module there when its dependencies support all strict checks.

## Verification

Run `npm run verify` in a clean checkout on Linux and on Windows with Node.js 24. Each run installs locked dependencies, compiles the desktop modules, checks the generated files against Git, and runs the smoke tests. Linux then runs the converters and full addon simulator. Windows runs the desktop and packaging suites. Record both results on the pull request. Verification runs locally and requires no GitHub Actions minutes.

For focused development checks, use the individual commands below.

| Command | Scope |
| --- | --- |
| `npm run test:addons` | Addon simulator suite |
| `npm run test:app` | Desktop app suite. Use Windows for full coverage |
| `npm run test:packaging` | Packaging and signature checks. Some cases require Windows and Inno Setup |
| `npm run test:converters` | Game-data and custom-guide converters |

For a single app test, use the isolation preload so the test uses temporary app data. Run this from `app/`.

```sh
node --import ./test/aislar.mjs --test test/ordenRutaIA.test.js
```

`SNF_TEST_CONCURRENCY` sets the number of parallel test files. The default is four.

## Pull requests

Write every pull request title and description in English, including its verification notes. Check the language before merging.

Create a focused branch from `main` and open a pull request against `main`. Describe the affected component, give the commands and results you verified, and identify any remaining checks in the game or on Windows.

For every new pull request, the person merging must confirm that OpenAI Codex finished reviewing the current head commit. Read the review comments and address or explain each finding. If the review is missing, pending, or covers an older commit, post `@codex review` in the PR conversation and wait for completion. If Codex is unavailable, leave the PR open. Record local verification results separately.
