# Auction operations

## Buying for a group

1. In **Groups**, assign items to a group and give it a **Shopping** operation, directly or through its parent.
2. Set a maximum unit price. To buy only missing stock, set a restock target and choose which inventory locations to count. A target of zero disables the stock target.
3. At the auction house, open **Browse**, select the groups, and run the buy scan. Results identify the group, operation, cap, price and proposed quantity. If the operation shows offers above its cap, those rows are informational.
4. Select an eligible offer to refresh it. For commodities, choose a quantity before requesting a quote. Review the current amount and confirm in the game. Leaving the scan or closing the auction house stops its requests.

![Simulator example of a three-unit restock recommendation and a listing above the price cap](../design/images/group-shopping-simulator.png)

The example uses synthetic stock and prices. With two units on hand and a target of five, the scan recommends three units at 8 silver each. A separate 30-silver listing exceeds the 25-silver cap. A commodity recommendation takes every listed tier at or under the cap, up to the missing stock. The addon's confirmation requires the game's quoted total to match the total calculated from those tiers. Any other quote cancels the purchase as a price change and requires a new scan. The quote does not identify the underlying listings or their individual prices. If cheaper units and units over the cap replace the listed tiers at the same total, it cannot distinguish that change. A tier that is account-owned, partly yours or of unknown ownership stops the recommendation below it. Exact variant listings, unavailable inventory sources and missing prices can affect eligibility. The scan does not substitute a base item for a qualified item key.

## Sniping with group operations

The Sniper tab has two modes. Select the mode with **Snipe with Sniper operations** in the settings cog. Without that choice, saved settings use the existing mode. That mode applies the group's sniper rule as a percentage of the normal price, together with the minimum sale rate and value.

In operations mode, the Sniper operation of the item's group decides each finding. The operation can be created in SnetForever or imported from TSM. A group without its own Sniper operation inherits one from its parent. Ungrouped items use the operation on the Base Group. A listing is a finding when its lowest unit price does not exceed the operation's **Maximum price**. The sale rate and the sniper percentage are not used. The addon shows no finding for an item in these cases:

- The group and its ancestors have no Sniper operation, or the group names a deleted operation.
- The operation ignores the current character or house.
- The formula is invalid or one of its sources has no value.
- The tree holds a qualified variant of the item in a different group. The browse scan does not identify the variant. TSM 4.15.9 checks the base item's operation at this stage and filters each variant in a later item search. SnetForever has no variant-level check before the purchase, so it skips the item.
- The listing is a battle pet. Pet prices depend on the species, and the cage item's prices do not apply.

The group's own spending limits for units and gold still apply when you buy. Selecting a finding checks the operation and its current maximum price again. The same check runs when the listing is ready, when the commodity quote arrives and before each purchase click. If the operation changed or no longer accepts the listed unit price, the purchase stops with that reason and the finding leaves the list. Purchases still require a click from the player, and two clicks for a single item. No purchase can proceed during combat. Changing the mode clears previous findings and cancels a quote or a purchase that has not yet been submitted. A submitted purchase waits for the game's result.

The scan reads only the lowest price and the total quantity of each item from the browse results. Exact item levels, suffixes and cheaper tiers below that price are not visible until you select a finding.

## Prudent buy cap

Sniper operations and Shopping operations never pay more than the lower of two market references:

- The item's market value in the open auction house (`snfmercado`).
- The regional price (`snfregional()`).

The operation's **Maximum price** still applies when it is lower. If only one reference has a value, that one is the cap. If neither does, the formula alone decides, as before. A reference of zero is ignored, so it never hides every offer. The cap is the full reference value. Any discount belongs in the formula.

The same capped value is used when a finding appears, when a shopping scan reads offers and before each purchase click. A Sniper finding's tooltip says when the cap was lowered and to which reference. A shopping row shows the reference after its cap, for example `cap 10g (your house)`.

The cap is on by default. Turn it off with **Never pay above market value** in the settings cog. When it is off, the formula alone decides.

Sniper's rule mode does not use this cap: it already pays at most its percentage of the house's normal price. Posting minimums are not affected.

The reason is that a formula source can be wrong for some items. For example, on 27 November 2026 a comparison of 11,630 items found these caps more than 10% above TSM's:

- Sniper: 563 caps. The regional price had only two or three snapshots per house.
- Shopping: 859 caps. `snfmercado` is not computed like TSM's `DBMarket`.

Capping at the lower reference trades some missed deals for not overpaying.

## Posting with multiple operations

Applicable Auctioning operations run in the order saved on the group. Each operation evaluates its prices, posting limit and bag reserve. Active listings and inventory already allocated in the scan count toward later limits. For example, with no active listings and sufficient stock, a first limit of 20 followed by a limit of 50 allows up to 20 units under the first rule and 30 more under the second. Each posting and cancellation requires a player action. A cancellation scan proposes at most one row for an owned auction ID. Changing a pricing or cancellation rule can require a fresh scan. If a posting acknowledgement is interrupted, check My Auctions before retrying. When the server cannot identify a unique matching new listing, the queue keeps posting locked. After checking the actual listings, reload the UI and run a new scan.

### Posting and cancellation compared with TSM

The comparison uses the TSM 4.15.9 Auctioning code installed for Forever and simulator cases. It has not been verified against the live Forever client.

| Rule | TSM 4.15.9 | SnetForever |
| --- | --- | --- |
| Invalid prices | Skips the item when minimum, normal, maximum or undercut doesn't evaluate, or when normal or maximum is below minimum. | Same checks. The row shows which field failed. |
| Posting price | Undercuts the lowest eligible competitor. A competitor below minimum uses the reset price or skips. Above maximum uses the above-max setting. Matches your own lowest price. | Same order of rules. Prices are floored to silver only when the client reports no copper support, and a result below minimum is rejected instead of raised. |
| Post cap | Counts your listings at the price being matched, plus queued posts at that price. | Counts every active unit of the item, plus units planned by earlier operations. This deliberate difference never posts more than TSM would. |
| Keep quantity and operation order | Each operation keeps its reserve from the stock left by earlier operations. | Same. Live bags and the reserve are checked again on each click. |
| Units per auction | Commodities post up to 40 stacks per auction. Other items post one unit per auction. | Same. |
| Bid | Bid percent of buyout, raised to at least the minimum price. Commodities have no bid. | Applies the minimum to the starting bid and uses whole silver when the client requires it. Preserves buyout-only listings when the percentage is 0% or 100%, when the starting bid would equal the buyout, and for commodities. |
| Maximum allowed price | Clamps bid and buyout to the client's maximum price. | No clamp. The game rejects the post and the queue blocks the row. |
| Deposit and duration | Calculates the deposit through the client for the selected duration. | Uses the client's duration index. The SnetForever editor preserves the stored duration keys `12`, `24` and `48`, which display as 2, 8 and 24 hours in Forever. The client provides the deposit on click. A changed quantity or deposit needs a new click, and the player needs enough gold. |
| Expirations | Stops posting after the configured number of expirations. | Same, from the mail ledger. Without ledger data the row shows a warning. |
| Cancel undercut listing | Cancels when a competitor is cheaper and at or above minimum. A competitor below minimum doesn't trigger a cancellation unless the cancel-below-minimum option is set. | Cancels only when the repost price is lower than your listing. A competitor below minimum can still trigger a cancellation when the reset price is lower than your listing. The cancel-below-minimum option isn't supported. |
| Cancel to repost higher | Cancels when the repost price exceeds the listing by the threshold. | Same threshold. |
| Before cancelling | Skips listings with a bid or a cancellation cost you can't pay. | Asks the client whether the listing can be cancelled. Checks the cost and your gold, and checks that the quantity, price, bid, operations and rules haven't changed. |

**Undercut cancellations that repost at the same price.** With a reset price, a competitor below minimum used to cancel any listing above that competitor. Suppose your listing is at the 4-silver minimum, the reset price is the minimum and a competitor lists at 3.5 silver. The listing was cancelled, which forfeited its deposit, and the repost price was again 4 silver. The queue now marks the row as not improving the price. If the reset price is above your listing, only **Cancel to repost higher** and its threshold can cancel it.

## Price expressions and imports

Price expressions support exponentiation and explicit numeric item references. For example, `vendorsell(item:1234)` reads the vendor sale value of that item when it is available. Missing values propagate through the expression or can be handled with `first`. `min`, `max` and `avg` skip missing values, as in TSM: `avg(crafting, dbmarket)` without a recipe is the market value, so imported TSM formulas still calculate. SnetForever's local market estimates and TSM's realm or regional series can yield different prices.

`vendorsell` uses the game's vendor price when the item is in the client cache, and otherwise the price SnetForever saved earlier. The game only knows items it has seen in the session: measured right after logging in, it knew 1,689 of the 11,630 items in a TSM-sized tree, while TSM knew 8,164. SnetForever saves every vendor price the game gives it in `SnetForeverCuenta.comercio.precioVendedor`. About 5 seconds after you first open the auction house in a session it also requests the tree items that have no saved price, 10 every half second and never in combat, so the cache fills once and stays.

After you open a merchant, `vendorbuy` can use that merchant's observed gold-only unit price, including the price per unit in a bundle. The in-memory snapshot lasts up to 15 minutes and is invalidated on world entry or a faction update. Unavailable, out-of-stock, and currency-exchange offers do not supply a price.

**Groups › Import text** also accepts a TSM group export string, the one TSM's Export button or a website gives you. TSM doesn't need to be installed: the client decompresses it (`C_EncodingUtil.DecompressString`) and SnetForever reads the packed data itself. Only the groups and their items are imported, including empty groups. The export's operations are ignored, because SnetForever uses its own. A real export of a 193-group tree with 8,701 items reads in under a second.

Plain-text group lists preserve supported numeric item IDs, item variants such as `i:8836::1:3` and `i:8838::r42`, and pet keys such as `p:1124:10:3`. A qualified key is stored separately from its base ID. Inspect the import summary for unrecognized entries before applying changes.

## Importing a TSM profile: price diagnosis

**Groups › Import › Import from TSM** reads the profile in steps and shows a price diagnosis before anything is written. Each price source named by an imported formula falls into one of three classes:

| Class | TSM sources | Effect after import |
| --- | --- | --- |
| Equivalent | `VendorSell`, `VendorBuy` | Same merchant price when available. `VendorBuy` is known only for 15 minutes after opening the merchant. |
| Local estimate | `DBMinBuyout` becomes `snfminimo`; `DBMarket` becomes `snfmercado`; `DBRegionMarketAvg` becomes `snfregional()`; `DBHistorical` and `DBRegionHistorical` become `snfhistorico`; `Crafting` | A different snapshot or source can change the suggested purchase or listing price. |
| No source | `DBRegionSaleAvg`, `SmartAvgBuy`, other personal accounting values, regional sale rates, item properties such as `ItemQuality`, `Destroy` and unknown names | The formula is saved as written and shown in red. The operation produces no proposal with it. |

Three of these differ in ways that matter for pricing:

- `DBRegionMarketAvg` is a market average across the region. It becomes `snfregional()`, the companion's own regional average (see [Regional market price](#regional-market-price)). It is calculated from the same Blizzard data, so it is close to TSM's value but not identical.
- `DBRegionSaleAvg` is the average price of completed sales in the region, not a market average. SnetForever has no regional sales, so a field that needs it does not calculate.
- `SmartAvgBuy` is the average cost of the units you currently hold, from personal accounting. It is not translated. SnetForever's own calculation is a separate source, `snfcostemedio()`, that you choose explicitly. See [Average purchase cost](#average-purchase-cost).

Profiles imported before `snfregional()` existed translated `DBRegionMarketAvg` to `snfmercado`. When you enter the world with TSM loaded, SnetForever updates those fields once: a field changes only if its saved text is exactly the old translation of the TSM field with the same operation name. Fields you edited are kept. The chat says how many formulas changed. These translations are unchanged for compatibility with earlier imports and saved formulas. The companion's own history is a separate source, `snfhistoricodiario()`, that you choose explicitly. See [Local market history](#local-market-history).

The diagnosis follows indirect references. A TSM custom source takes the worst class of what it uses, and a custom source that refers to itself is reported as a loop that does not calculate. A linked field is judged by the operation it reads from, using only the links that will be copied. A link that would form a loop is not copied, and the count is shown. Fields that TSM does not supply keep SnetForever's defaults. Fields behind a switch that is off are not judged. Each affected operation lists its fields and the number of groups and items that use it, including inheritance from the Base Group.

The diagnosis you see belongs to the selected mode, and it switches when you change **Merge** or **Replace**. **Import** stays disabled while the visible diagnosis does not match the selected mode, and the final report repeats the diagnosis of the mode that ran.

- **Merge** keeps your custom sources, which take precedence over TSM sources with the same name. Formulas that use them are judged with your formula, including an invalid one, a loop, or a name that collides with a TSM source. Existing groups keep their own operation lists. The diagnosis therefore shows two kinds of use: use in the TSM profile, and actual use after merging. Your list counts as using an imported operation when it names the operation that the import will reuse.
- **Replace** moves your custom sources, groups and operations to the previous copy. A formula that names one of your custom sources is reported as having no source, because that source will no longer exist.

The preview carries a fingerprint of the TSM data, including every item with its group, and of your custom sources, operations and group operation lists. If any of them changes before you press **Import**, the import stops before writing and asks you to review again. Moving items between groups is detected even when the item count of every group stays the same. When merging, an existing operation with the same name and different fields is kept, and the imported one is added as "Name 2". Importing the same profile again reuses what the first import created.

Actual use only covers the groups in the TSM profile. Groups that exist only in SnetForever can inherit an imported list from a parent, and they are not counted. Item counts are TSM's counts, so when merging without moving items, items that stay in another group are still counted.

## Regional market price

`snfregional()` is the equivalent of TSM's `DBRegionMarketAvg`. TSM's desktop app downloads it from TSM's servers. SnetForever's companion calculates it from Blizzard's API instead, so TSM isn't needed.

The Forever region has 15 auction houses, five per faction. The companion already downloads the houses you use every hour. It downloads one of the other houses once an hour, after publishing your prices, so it visits each house about every 12 to 15 hours. That adds one download (about 12 MB) per hour.

| Value | How it is calculated |
| --- | --- |
| Snapshot value | The hourly value of each item, with the same rule as `snfmercado`: the cheap 30 % of the units without outliers. |
| House value | Median of the item's snapshot values in that house's last 6 snapshots that are no older than 7 days. Your own houses add a snapshot at most every 12 hours, so every house covers a few days. |
| `snfregional()` | Median of the house values of the houses that have the item. A plain average let small houses with about 1,000 auctions push the price 25 % above TSM's; the median matched it (measured in game on 6,499 items). |

The value has no data until the companion publishes prices with it. Right after installing, it covers only your own houses. The other houses join one per hour. `snfregional()` has no value for variants (`i:1234:…`) or pets, because the companion measures base items only. Sniper's default maximum price uses `snfregional()`, like TSM's default.

The companion stores the snapshots in `comercio/regional.json.gz`. A damaged file is moved aside with `.roto-<time>` and the calculation starts again.

## Local market history

`snfhistoricodiario()` is a separate local series. It does not replace `snfmercado` or the `snfhistorico` alias. The companion records it from the hourly snapshots it already downloads for each auction house, so it makes no new requests.

| Value | How it is calculated |
| --- | --- |
| `snfmercado` | Median of the hourly values in the item's last 72 snapshots, covering at most 7 days. |
| Daily value | Median of the item's hourly values in one UTC day. The day counts when it has at least 3 snapshots. |
| `snfhistoricodiario()` | Median of the daily values that count within the 30 days ending on the house's latest snapshot. |

The source has no value in the following cases, and the **Historical price** tooltip line shows the reason:

- Fewer than 5 days count.
- The item has no recorded days.
- The last counted day is more than 3 days older than the house's latest snapshot, or than the server time in a session without a reload.
- The price slot belongs to an older companion app, or the history was dropped so that prices for every house would fit.
- The item key is a variant or a pet. Blizzard's auction data combines variants under the base item ID, so only the base ID has a history. `snfhistoricodiario(item:1234)` reads the base item.

With the line turned on, the tooltip shows the value, the number of days and readings, and the age of the companion snapshot. The line is off by default. Each house keeps its own history, and the companion never mixes in another house or regional values.

Existing formulas keep their price sources. Use `snfhistoricodiario()` to opt in to daily history. The parentheses distinguish the new source from a custom source saved with that name. `DBHistorical` and `DBRegionHistorical` still translate to `snfhistorico`.

Storage is bounded to 30 days per item, about 17 bytes per day. An item that leaves the auction house keeps its days until they fall outside the window. After an update, a history file without days rebuilds them from the hourly snapshots it holds, which cover at most 7 days. In the price slot, the history is an extra named field in each row, so older addons ignore it. It is the first data dropped when the slot is too large.

## Average purchase cost

`snfcostemedio()` is the average price you paid for the units you hold now. It reads your auction purchase receipts and the account inventory. `SmartAvgBuy` still has no source, and no imported or saved formula changes price.

1. The inventory counts the units of the item ID held by the characters of the current realm: bags, banks, mailboxes and the account bank.
2. The source takes that item ID's purchases from the same characters, newest first, until they cover those units. A lot that is only partly needed counts only for the units it covers.
3. The value is the cost of the covered units divided by the units held.

For example, with 12 units held and purchases of 5 units at 2s (newest), 5 at 1s 50c and 10 at 1s (oldest), the source takes 5, 5 and 2 units: 19s 50c / 12 = 1s 62c per unit.

Receipts are recorded when you open the mailbox. Each "auction won" mail is one purchase with its item ID, total price in copper and units. Reopening the mailbox does not record it again, and two identical mails are two purchases. A receipt is never matched by item name: one without an item ID is listed apart and never enters the cost.

New receipts also keep the mail's evidence: the number of attachments in the mail header, the invoice unit count when the invoice gives one, and the item ID, unit count and link of every attachment. Only a receipt whose evidence proves the lot enters the cost:

- the header gives the number of attachments, and the client shows exactly that many, with no empty slot between them;
- every attachment has the receipt's item ID in both its data and its link, a link without a random suffix or bonus IDs, and a whole unit count;
- the paid copper and the original unit count on the invoice are known, and the attachments add up to that count.

The lot is then all the attachments together, never the first one, and never one unit by default. Other receipts of that item ID stay in the ledger, are counted with the reason, and never enter the cost. This includes every receipt recorded before this evidence existed. A proven variant is a different item and is excluded. An older receipt gains the evidence the next time its mail is read, but only when that mail matches that one receipt and no other mail in the inbox matches it. The invoice count is required even on the first read, because the player may have already collected some attachments. The units and prices that the ledger already showed do not change.

The walk from the newest purchase stops at the first receipt of the item ID that cannot be proven, so an older proven purchase never stands in for a newer one with missing data. Purchases whose times are within a few seconds of each other count as simultaneous. Nothing tells which one came first, and the character name never decides. If the units you hold only use part of such a group and its unit prices differ, there is no value.

The source has no value in the following cases. The **Average purchase cost** tooltip line (Settings › Tooltip › Accounting › Purchases, off by default) shows the reason for the cases that need an action:

| Reason | Meaning |
| --- | --- |
| Purchases cover too few units | Your receipts cover fewer units than you hold, for example because you crafted or looted some. The line shows how many are covered. |
| Open banks or mailboxes first | A bank, mailbox or the account bank of a character on this realm has never been counted. |
| No recorded purchases | No receipt for this item ID, or only receipts of another variant. |
| Recent purchases lack data | A receipt of this item ID that is newer than the cut cannot be proven (see above). The line shows how many. Opening the mail again can supply the evidence while the mail is still there. |
| Simultaneous purchases at different prices | The units you hold only use part of a group of simultaneous purchases with different unit prices. |
| Variant | The key is an item variant or a pet. Receipts and stock only know the base ID. `snfcostemedio(item:1234)` reads the base item. |
| Not stackable | The item does not stack, so the inventory can join variants under one ID. The tooltip omits this line for such items. |

With the line on, the tooltip shows the value, the units held and the number of purchases used. The result is kept until a receipt is added or the counted stock changes, so tooltips do not reread the ledger.

Limits: units listed at the auction house are not part of the stock, unlike TSM. Purchases recorded in other realms are ignored. The ledger's own unit figure for a purchase is unchanged: the invoice count, or the first attachment's count when the invoice gives none. Only the average cost reads the evidence.

The positions read are those of Blizzard's mail code: the attachment count is the eighth return of `GetInboxHeaderInfo`, the paid copper the fourth return of `GetInboxInvoiceInfo` and its optional unit count the eleventh. The TradeSkillMaster build installed for WoW Forever reads the same positions. No real Forever purchase mail has been checked: whether Forever fills the invoice count and the header count, and what its links carry, is unknown until one is read in game. Any missing value leaves the receipt unproven rather than guessed.

## Price series coverage

**Trade status** (the status dot in the trade and auction windows) reports the coverage of the current house below the history line:

- `Daily history: N of M items have a value (5 days needed)`. M is the number of items in the price slot for that house, and N is the number that `snfhistoricodiario()` can price now. Items that have too few days, are stale against the server time, or have no days do not count. When the slot has no history, the line gives the reason: the companion app is older than this feature, or the history was dropped to fit the slot.
- `Data from this auction house only: no regional prices or confirmed sales`.

The lines are informational and do not change the dot's colour, because few days is normal for a new app. `Precios.cobertura` checks the loaded slot through `Precios.historico`, processing up to 128 rows per frame for each house. The result is cached per slot, house and server day. It does not compute new prices. `snfmercado`, the `snfhistorico` alias and every TSM translation are unchanged.

### Data path

1. Each hour the companion requests `/data/wow/ruleset/2/auctions/{house}` and `/data/wow/ruleset/2/auctions/{house}/commodities` for each followed house. In Forever, commodities are listed per house, so each snapshot belongs to a single house. The app sends no regional requests.
2. The app keeps `historial-{house}.bin` per house. It holds the last 72 hourly values per item, 6-hour departure counters and, from phase 2, up to 30 daily values.
3. The price slot (`SnetForever_P01`…`P08`) carries every item row of up to three houses, the house summary `info = {hora, desde, pares}` and, from phase 2, the named field `h` per row.
4. The addon reads `Precios.de` and `Precios.historico` for one house: the open auction house, or your own house when it is closed. It never mixes houses.

## Recipe costs and materials

Open a profession with a learned, fixed-output recipe to observe its required reagents through the client schematic API. The `crafting` formula uses the least expensive observed recipe with a known market price for every required reagent. Recipes with alternative required reagents or variable outputs do not supply a cost. Use `/snet trade materials ITEM_ID UNITS` to see the number of crafts, ingredients and bag shortfalls. Observations last for the session. No crafting action is submitted.

## Specialized browse searches

Enter an item name and select **Vendor search** to see offers below the known NPC sell price. Missing item data produces no recommendation. For an advanced search, enter e.g. `advanced:15:2:cloth` and press Enter. The two numbers are minimum item level and quality (0 disables that filter). Only the name is sent to the auction house. Recent and favorite searches preserve the filters.

For disenchant search, record the outputs from a measured batch with `/snet trade yield ITEM_ID ATTEMPTS MATERIAL_ID:TOTAL [MATERIAL_ID:TOTAL ...]`. Recording again replaces that item’s batch. **Disenchant search** filters named results by the observed mean output value using current local material prices. It excludes items without samples or prices. Sampling is manual and the estimate does not guarantee a return.

Daily departures estimate how many units disappeared early in snapshots of the local auction house. They include cancellations, with additional filtering for commodities. They are not confirmed sales or a regional TSM series. To investigate a quantity discrepancy, compare the same item variant, house and observation time with a completed listing query.

## Remaining work

| Area | Next acceptance check |
| --- | --- |
| Specialized searches | Verify advanced, vendor and disenchant searches with real Forever listings and measured disenchant batches. |
| Sniper operations | Compare operations mode with imported TSM Sniper operations in a controlled Forever session. Include an item with level or suffix variants. Confirm that the client's browse item key does not identify the TSM variant. |
| Price coverage | Extend observed merchant pricing and obtain verified recipe costs and disenchant yields before exposing new inputs. |
| Price series | Local history, average purchase cost and per-house coverage are measured and shown in Trade status. Forever's Blizzard API path gives no regional or confirmed-sale series (measured 2026-11-26). Verify a real Forever purchase receipt (unit count and item link). A regional source needs a verified Forever origin first. |
| Packed group strings | Validate a real exported group and its operations against its source. Plain-text lists and saved profiles have separate readers. |
| Live auction behavior | Verify posting, cancellation, repricing and quantity selection in a controlled session, including closing the window mid-scan. In Forever, check whether the client supports copper prices, whether a listing with a bid can be cancelled, the maximum allowed price, and a bid percentage below 100% on a non-commodity. |
| Broader economy tools | Plan the crafting queue, mailing, warehousing and vendoring workflows independently of the auction window. |

### Economy workflow acceptance criteria

| Workflow | Inputs to verify in Forever | First usable result |
| --- | --- | --- |
| Crafting | Known recipe, output count, reagent counts and available inventory | Show a restock queue, material shortfall and cost. Mark unknown prices explicitly. |
| Mail | Recipient, mailable item, bag slot and reserved quantity | Preview recipient, attachments and postage. Recheck the recipient and stack before each player-confirmed send. |
| Warehousing | Open bank, storage type, free slots and counts on both sides | Preview deposits and withdrawals. Reconcile each movement against the next inventory update. |
| Vendoring | Open merchant, bundle size, stock, price, reserves and sell restrictions | Preview eligible purchases and sales. Stop on merchant close and require a click before each transaction. |
