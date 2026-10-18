# Tutorial validation — bridge 1.2.0

Completed the eight introductory lessons in Handleemerald on DF 0.53.16 and
DFHack 53.16-r2. The game's Help menu displayed Completed for camera controls,
mining, stockpiles, woodcutting, building, information sheets, alerts, and caravan
preparation. Completion flags were never written or skipped.

## Changes verified during play

- `df_screen map_click` selects a world tile using the game's current pixel-to-map
  mapping, including graphics zoom. The target must be visible on the viewed
  elevation and clear of panels. Used for stairs, mining, stockpiles, felling,
  workshop/bed placement, and citizen/building inspection.
- Multiple screen keys are dispatched in separate game calls. This let camera
  and building-menu tutorial checks register reliably.
- `df_screen layer=base` reads underlying UI text while the tutorial top layer is
  active. Base-layer text may be covered; minimize the help panel before clicking
  covered controls. Native workshop task selection was verified through this path.
- `df_tutorial` reads lesson checkmarks and can minimize/restore the help panel.
  It does not complete objectives.
- Carpenter jobs now initialize unspecified materials and set the native wood
  material category. Compared against a Make bed task created through the UI;
  the bridge-created task now displays Make bed correctly.
- Map output warns about exposed frozen water and liquid on building/stockpile
  tiles. Stockpile symbols no longer conceal liquid depth. Regression checks cover
  visible versus hidden ice and a flooded stockpile.

## Gameplay outcome and limits

The first room breached frozen pond ice and flooded at thaw. This was an overseer
mistake: exposed ice was visible but not handled. All seven citizens survived.
The flooded stockpile was removed; a dry replacement room, carpenter, craft shop,
bed, supply piles, and trade depot were built north of the pond. Wooden crafts
were produced. Remaining submerged goods were forbidden before leaving that save.
Do not reuse its abandoned southern excavation without a water-control plan.

The introductory caravan lesson is explanatory; it does not require an actual
trade. This run did not independently validate gem cutting/encrusting or every
optional Help guide. Tutorial completion is not a claim of full game coverage.

Offline registration and live read-only smoke checks passed, including the new
tutorial/base-screen reads and 11 synthetic map assertions. No game items or tiles
were spawned, teleported, or revealed.

The player subsequently switched to Monkmirror to test less capable models.
Its layout and the separate issues.md report are outside this validation run.
