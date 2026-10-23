# Spaced Repetition Garden

An Obsidian plugin that turns notes into flashcards and grows them into a garden. Keep up with a card and it flowers, let it slide and it wilts.

## Installing

1. Download the latest release from the [releases page](https://github.com/EdwardJarman/SRG/releases).
2. Unzip it into `<your vault>/.obsidian/plugins/spaced-repetition-garden/`.
3. Restart Obsidian and turn the plugin on in Settings → Community plugins.

Obsidian 1.5.0 or newer.

## Using it

**Planting a card.** Put the cursor in a note and run `Spaced Repetition Garden: Plant flashcard from note or heading` from the command palette. Select some text first and you get a card for that paragraph only. Put the cursor under a heading and you get a card for the whole section. Without a selection you get a card for the entire note. Right-clicking in the editor offers the same thing as "Plant as flashcard".

**Reviewing.** `Spaced Repetition Garden: Review due cards`, or the Review button in the garden, opens the queue. The button shows the number of cards you will actually see, including today's new-card allowance. Space shows the answer, then 1 to 4 grades it: Again, Hard, Good, Easy. Cards you get wrong come back at the end of the session, and the other plants from the same note wait for the next one. If you mis-grade, `Undo last grade` (or Ctrl+Z) steps back through the session and puts the plant back the way it was, review history included. `Not today` puts a card off until tomorrow, and `Reschedule...` lets you pick the date it comes back. Every card shows its anchor, and `Copy anchor` puts a wikilink to the exact note, heading or block on your clipboard.

**The garden.** Click the sprout in the ribbon, or run `Spaced Repetition Garden: Open garden`. Every card is a plant, and plants are grouped into beds by the folder the note lives in. Drag to pan, scroll or pinch to zoom, hover a plant to see its schedule and anchor, click it to review that one card, right-click it to manage it. Plants that have fallen behind are wilting, ones that are nearly due are starting to bloom, and plants whose note has gone missing are drawn as pale ghosts until the note comes back.

**Managing plants.** Right-click any plant for review, open note, copy its anchor, suspend, reschedule, reset progress or move it to the trash. `Spaced Repetition Garden: Manage plants` opens a list of every card where you can search by title, file or anchor, filter by bed or state (including `Missing notes` and `Trash`), and do the same things. `Remove missing` moves every held-back plant to the trash, `Empty trash` deletes trashed plants permanently, and `Reset garden` clears everything after writing a backup and asking you to type `reset`.

**Your data.** Schedules live in `Spaced Repetition Garden/cards.json` inside your vault, so they travel with the vault when you sync it. Writes merge with what is already on disk, so two Obsidian windows no longer overwrite each other. If Obsidian's sync creates a conflicted copy of the file, its cards are merged in on the next load. Daily history is pruned after about three years, and the file switches to compact JSON once the garden passes 250 cards. Deleting `cards.json` resets the garden; a reset from the plugin writes a timestamped `.bak-reset-*` copy first.

## Settings

- **New seeds per day** — how many unseen cards join the queue each day.
- **Day starts at (hour)** — the hour your day begins, which decides what counts as "due today".
- **Retention window** — how many days of review history the retention figure covers.
- **Bury siblings after a lapse** — hold back the other plants from the same note until the next session.

## Development

```
npm install
npm run dev        # rebuild on change
npm run typecheck
npm test
npm run bench      # 1000-card benchmarks
npm run build      # production build into main.js
npm run package    # zip the plugin into dist/
npm run deploy -- --vault "C:\path\to\vault"
npm run release:dry-run
```

`npm run deploy` builds the plugin and copies it into a vault's plugin folder,
so you only have to reload Obsidian to try a change. `npm run bench` measures
queue building, stats, layout, serialization and a full-file write with 1,000
cards.

The version in `package.json` is the single source of truth: `npm run release`
writes it into `manifest.json` and `versions.json`, tags the commit and
publishes the zip on the releases page. `npm run release:dry-run` runs the same
build and packaging without committing, tagging or uploading anything. Tag a
commit with `v<version>` and the GitHub Actions workflow builds it and
publishes the zip on the releases page.

A release is a zip of `main.js`, `manifest.json` and `styles.css`.

## Licence

MIT, see [LICENSE](LICENSE).
