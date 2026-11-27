# Contributing to SnetForever

## Before you start

- Search [existing issues](https://github.com/Davlain-Projects/SnetForever/issues) before opening a public bug report or feature proposal. Use the [security policy](SECURITY.md) to report a vulnerability privately.
- Discuss a larger feature or design change in an issue before implementing it. A reproducible bug fix or documentation correction can go directly to a pull request.
- Read the [documentation index](docs/README.md), [license and component notices](LICENSE.md), and [code of conduct](CODE_OF_CONDUCT.md). Only submit content you have permission to contribute, and preserve its notices and credits.

## Set up a development checkout

Fork SnetForever on GitHub, clone your fork, and start a focused branch from `main`. Replace `YOUR-USERNAME` with the owner of your fork. Install Node.js 24 and run the npm commands from the repository root.

```sh
git clone https://github.com/YOUR-USERNAME/SnetForever.git
cd SnetForever
git switch -c fix/short-description
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

For changes to menus, buttons, or guide views, add an image and the design decision to the [gallery](docs/design/). Refresh the [README preview](README.md#addon-interface) when the selected appearance changes. Keep auction actions under the player's control and avoid flashing UI.

Keep fixtures anonymous and credentials, character data, and private guides out of commits, logs, issues, and pull requests. Save local converter reports under `artifacts/reports/`.

## TypeScript in the desktop app

Edit the desktop application under `app/typescript/src/` and the Windows bootstrap under `app/typescript/arranque/`. Run `npm run build:app` and commit the generated ES modules in the matching `app/src/` and `app/arranque/` directories. The Windows installer and signed updater consume these compiled files from the Git snapshot. Runtime assets, PowerShell helpers and JavaScript tests stay in their existing directories.

The compiler checks every production module. The application configuration allows implicit parameter types, nullable legacy values and untyped caught errors. The strict configuration adds stronger checks for its listed modules. Add a migrated module there when its dependencies support all strict checks.

## Verification

Run `npm run verify` in a clean checkout with Node.js 24. Each run installs locked dependencies, compiles the desktop modules, checks the generated files against Git, and runs the smoke tests. Linux then runs the converters and full addon simulator. Windows runs the desktop and packaging suites, with Inno Setup needed for full packaging coverage.

Record the Linux and Windows results on the pull request using the matching GitHub Actions results or your local runs. If you only have one platform available locally, list what you ran and let the pull request checks cover both platforms. Record any in-game validation separately.

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

Push your branch to your fork and open a pull request against `Davlain-Projects/SnetForever:main`. Write the title, description, and verification notes in English. Describe the affected component and why the change is needed, link the issue if there is one, and list any remaining checks.

Pull requests require passing verification, resolved review conversations, and approval from David or Alain. Either maintainer can approve and squash merge a pull request they opened. Contributions from outside the maintainer team need approval from either maintainer.

To record approval, open the pull request's verification run, choose **Review deployments**, select **maintainer-approval**, and choose **Approve and deploy**. This job records approval only. Use squash merge to record the pull request as one commit on `main` while preserving the discussion on GitHub.

For every new pull request, the person merging must confirm that OpenAI Codex finished reviewing the current head commit. Read the review comments and address or explain each finding. If the review is missing, pending, or covers an older commit, post `@codex review` in the PR conversation and wait for completion. If Codex is unavailable, leave the PR open. Record local verification results separately.

Publishing a release or changing the public release repository requires Alain's approval.
