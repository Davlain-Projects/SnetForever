# Interface design gallery

[Dwarven Forge](#dwarven-forge) is the selected visual direction for the guide, its settings and the auction interface. The concept illustrations below use fictional game scenes and sample objectives. The PNG material previews come directly from the addon's texture files.

## Dwarven Forge

![Selected concept showing the compact iron quest tracker, the expanded Details plate and the copper controls in Options](images/forge-direction.webp)

*Selected concept, option 2.* The compact tracker carries the objective. A copper pull ring opens the detailed step list. A cog opens the settings panel. Dark iron gives the control edges a recognizable silhouette while ivory labels remain readable against the center of the plate.

| Area | Design decision | Reason |
| --- | --- | --- |
| Quest notice | Show the current objective and its live progress. Press the quest title to open the notice from Bearing. | A player can read the assignment without navigating a list of screens. |
| Bearing and field chart | Fold the notice while traveling. Open the chart from the direction arrow. Draw a trail only for known route geometry. | The player can switch views without advancing the quest or mistaking a straight line for a walkable route. |
| Details | Use the pull ring for advanced guide controls, including the step list and manual checkboxes. | The controls remain available during play while leaving the compact tracker clear. |
| Options | Open settings from the cog. Put the preferred-view selector in the window settings. | Pinning a preferred view is an occasional choice and does not need a permanent text button. |
| Auction interface | Use the iron and copper treatment around the auction tools. Keep price and status colors meaningful and leave auction actions under player control. | The guide and the auction window belong to the same addon, while the player still needs to recognize a warning or confirm a transaction. |

### Window options in WoW Forever

![Live WoW Forever screenshot of the Spanish Window options with the Forge theme, all twelve navigation labels and both selectors visible](images/forge-options-in-game.jpg)

*In-game capture after a UI reload.* The client originally displayed eight blank navigation labels, two blank selectors and the previous blue borders. This capture verifies the corrected labels and the iron and copper palette at the settings shown.

### Implemented interface

![Simulator rendering of all three guide views, Window options and the detailed guide window](images/forge-interface-guide.png)

*Guide and settings, simulator rendering.* Open the gear to change the scale, lock the position or choose a favorite view. The copper handle opens the detailed step list. Dragging a guide frame moves the other views to the saved position.

![Simulator rendering of the auction window and player-operated queue controls](images/forge-interface-auction.png)

*Auction controls, simulator rendering.* The auction window brings the Forge header and navigation into the trading workflow. Availability events refresh the action button. Posting or cancelling still requires player input.

Both images use test fixtures and the simulator’s frame geometry, labels and addon textures. The previews use the bundled Forge fonts. Built-in game icons are approximated. The packaged client determines the final text metrics and placement.

### RestedXP guide imports

![Rendering of the guide importer after checking a fictional package](images/rxp-import-dialog.png)

*Interface rendering with sample data.* The guide selector opens a separate dialog for pasting the parts of a guide package. It keeps the paste area, package status and confirmation visible together so the player can check the guide and step counts before saving. [Importing local RestedXP guides](../guides/importar-rxp.md)

### Window sizing

![Simulator view of the Window settings panel with the global large-text option checked](images/window-sizing.png)

Open **/snet → Window → Large text in all addon windows** to enlarge labels and their controls together. The Sniper settings cog changes the same preference. Drag the lower-right grip on a floating guide view, Details, Chat, settings panel or editor to scale that window proportionally. Each window remembers its own size after a reload. The Blizzard settings category fits its available area.

The main Trade window and Auction House keep independent width and height controls. Their header tabs have individual two-axis grips and remember their sizes separately.

### Auction tab sizing

![Simulator rendering of the auction window with a resized Sniper tab and Large text selected in the settings cog](images/auction-tab-layout.png)

*Simulator rendering with Large text enabled.* Drag the grip at the lower right of an auction tab to change its width and height. The window remembers each tab separately. Drag the corner of the window to resize the trading area. Larger windows enlarge the page and its labels together. For additional magnification, select **Large text** from the Sniper settings cog.

### Group shopping

![Group shopping results with an eligible offer and an above-limit listing](images/group-shopping-simulator.png)

*Simulator rendering with sample data.* The result displays the applicable operation and price limit next to the recommended quantity. A player can see why an offer is above the limit before opening the quantity and confirmation controls. [Auction workflows](../comercio/auction-workflows.md)

### Typography

Alegreya SC Bold gives quest and section titles a carved small-cap shape. Barlow Semi Condensed Medium keeps objectives and settings readable in narrow panels. Barlow Semi Condensed SemiBold distinguishes buttons, prices and counts. The core addon bundles the static fonts so the guide can load them independently of the commerce module.

![Forge type specimen showing a heading, a Spanish objective and auction figures](images/forge-typography.png)

Both families ship with their SIL Open Font License. See [Alegreya SC](../../addons/SnetForever/recursos/fonts/alegreyasc-OFL.txt) and [Barlow Semi Condensed](../../addons/SnetForever/recursos/fonts/barlowsemicondensed-OFL.txt). The font files come from the [Google Fonts distribution](https://github.com/google/fonts/tree/06bfe0d62a98375cb09c942fa18e68bd32cff057/ofl).

### Materials and controls

| Iron plate | Copper hardware |
| --- | --- |
| ![Runtime panel texture with dark hammered iron and narrow copper edging](images/forge-plate.png) | ![Runtime icon atlas containing a copper cog on the left and a hinged triangular pull ring on the right](images/forge-controls.png) |
| Background for framed surfaces. The center accommodates text and changing data. | The cog identifies Options. The hanging ring identifies Details. |

The previews preserve the pixels of the [plate texture](../../addons/SnetForever/recursos/forge-plate.tga) and [two-icon atlas](../../addons/SnetForever/recursos/forge-controls.tga). The illustrations and textures were generated for SnetForever. Client fonts, player scale, and live quest text determine the final appearance in WoW Forever.

## How the design evolved

### Three views for one quest

![Early concepts showing a parchment quest notice, a compact direction display and a field chart in the same illustrative canyon](images/guide-concepts.webp)

The team chose all three interaction models. **Quest Notice** introduces the assignment, **Bearing** guides travel, and **Field Chart** puts the player and destination in context. The views share one guide step and its counters. The first implementation exposed Details, navigation and pinning in a row of text buttons. Playtest feedback called for hardware that felt at home in the game. [Guide interactions](../guides/field-views.md)

<details>
<summary>Early parchment and indigo chart materials</summary>

![Earlier parchment and linen material study used for the quest notice and field chart](images/early-materials.webp)

These textures document the first iteration of the views.
</details>

### Three treatments for controls and menus

![Three art directions with tracker, Details, and Options in each row: leather journal, iron forge, and linen atlas](images/style-directions.webp)

| Direction | Distinguishing control | Decision |
| --- | --- | --- |
| Adventurer's Journal | Red bookmark on a leather cover, with parchment settings | Alternative considered |
| Dwarven Forge | Hinged copper pull ring, toothed cog and dark iron plates | Selected |
| Explorer's Atlas | Rolled chart and compass rose on indigo linen | Alternative considered |

## Updating the gallery

For a visible change to a menu, control or guide view, update the image and its caption in the same PR. Label each image as concept art, a runtime asset preview, or an in-game capture. Record the selected behavior and the reason for it. Use a sanitized test profile for in-game captures.
