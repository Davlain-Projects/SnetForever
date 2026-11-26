<p align="center">
  <img src="tools/iconos/vista-previa.png" alt="SnetForever icon" width="96">
</p>

# SnetForever

A World of Warcraft Forever addon and Windows companion for leveling, quest guidance, in-game AI chat, and auction management.

[Design gallery](docs/design/) · [Documentation](docs/README.md) · [Contributing](CONTRIBUTING.md)

## What it does

- **Guides.** Follow leveling routes and quest steps in the game.
- **Auction tools.** Browse listings, prepare sales, and track your auctions. The player initiates auction actions.
- **AI chat.** Ask questions in the game. The Windows companion passes along game context and connects to the configured AI backend.

## Addon interface

![Dwarven Forge concept showing the quest tracker, expanded Details and Options](docs/design/images/forge-direction.webp)

*Selected design concept.* The quest title opens the notice, the direction arrow opens the field chart, the copper pull ring opens **Details**, and the cog opens **Options**. The guide and auction windows share the dark iron and copper treatment. Alegreya SC titles and Barlow Semi Condensed labels distinguish quest names, controls and prices.

| Options and Details controls | Panel material |
| --- | --- |
| ![Copper cog for Options and pull ring for Details](docs/design/images/forge-controls.png) | <img src="docs/design/images/forge-plate.png" width="255" alt="Dark iron panel with copper borders and corner rivets"> |

<details>
<summary>Forge typography in English and Spanish</summary>

![Alegreya SC quest title and Barlow Semi Condensed objective and auction text](docs/design/images/forge-typography.png)

</details>

### Window options in the game

![Window options in WoW Forever after a reload, with the Spanish labels and Forge colors](docs/design/images/forge-options-in-game.jpg)

### Guide, settings and auctions

| Guide views and Window options | Auction controls |
| --- | --- |
| [![Simulator preview of Quest Notice, Bearing, Field Chart, Details and Window options](docs/design/images/forge-interface-guide.png)](docs/design/images/forge-interface-guide.png) | [![Simulator preview of the auction tabs, bag items, action queue and posting controls](docs/design/images/forge-interface-auction.png)](docs/design/images/forge-interface-auction.png) |

Click either image for the full-size view. These previews use the addon's frame layout and textures with sample data. The previews use the bundled Forge fonts and approximate the built-in game icons. See the [design gallery](docs/design/) for the earlier concepts and the decisions behind the menus and buttons.

## Repository layout

| Path | Responsibility |
| --- | --- |
| [`addons/`](addons/) | Lua modules loaded by WoW Forever for the addon core, auctions, missions, and routes |
| [`app/`](app/) | Windows companion, bundled resources, and app tests |
| [`tools/`](tools/) | WoW simulator, data converters, art generators, and installer tooling |
| [`templates/`](templates/) | Example package for custom guides |
| [`scripts/`](scripts/) | Repository-wide verification and preview-build entry points |
| [`docs/`](docs/) | Design gallery, guide references and auction workflows |
| [`.github/`](.github/) | Verification, Windows preview automation, and contributor templates |

## Development

Use Node.js 24 and npm. Run these commands from the repository root.

```sh
npm run bootstrap
npm run check
```

`bootstrap` installs the locked dependencies for the simulator and converters. `check` runs smoke tests across the addon, app, and packaging. See the [contribution guide](CONTRIBUTING.md#verification) for the full suites and platform requirements.

SnetForever is maintained by David ([@davrodwconnections](https://github.com/davrodwconnections) and [@davidrod-WaveNorth](https://github.com/davidrod-WaveNorth)) and Alain ([@alvarezalain262-create](https://github.com/alvarezalain262-create)). See the [project license and component notices](LICENSE.md) for collaboration permissions, existing open licenses and third-party credits.
