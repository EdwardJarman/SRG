# Spaced Repetition Garden

An Obsidian plugin that turns notes into flashcards and grows them into a garden. Keep up with a card and it flowers, let it slide and it wilts.

## Installing

1. Create `<your vault>/.obsidian/plugins/spaced-repetition-garden/`.
2. Download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/EdwardJarman/SRG/releases/latest) into that folder.
3. Reload Obsidian and turn the plugin on in Settings → Community plugins.

The release zip contains the same three files at its root, so you can unzip it into the plugin folder instead.

Obsidian 1.5.0 or newer.

## Using it

**Planting a card.** Put the cursor in a note and run `Spaced Repetition Garden: Plant flashcard from note or heading` from the command palette. Select some text first and you get a card for that paragraph only. Put the cursor under a heading and you get a card for the whole section. Without a selection you get a card for the entire note. Right-clicking in the editor offers the same thing as "Plant as flashcard".

**Reviewing.** `Spaced Repetition Garden: Review due cards`, or the Review button in the garden, opens the queue. The button shows the number of cards you will actually see, including today's new-card allowance. Space shows the answer, then 1 to 4 grades it: Again, Hard, Good, Easy. Cards you get wrong come back at the end of the session, and the other plants from the same note wait for the next one. If you mis-grade, `Undo last grade` (or Ctrl+Z) steps back through the session and puts the plant back the way it was, review history included. `Not today` puts a card off until tomorrow, and `Reschedule...` lets you pick the date it comes back. Every card shows its anchor, and `Copy anchor` puts a wikilink to the exact note, heading or block on your clipboard.

**The garden.** Click the sprout in the ribbon, or run `Spaced Repetition Garden: Open garden`. Every card is a plant, and plants are grouped into beds by the folder the note lives in. Drag to pan, scroll or pinch to zoom, hover a plant to see its schedule and anchor, click it to review that one card, right-click it to manage it. Plants that have fallen behind are wilting, ones that are nearly due are starting to bloom, and plants whose note has gone missing are drawn as pale ghosts until the note comes back.

**Managing plants.** Right-click any plant for review, open note, copy its anchor, repair an orphaned anchor, suspend, reschedule, reset progress or move it to the trash. `Spaced Repetition Garden: Manage plants` opens a list of every card where you can search by title, file or anchor, filter by bed or state (including `Missing notes`, `Orphaned anchors` and `Trash`), and do the same things. Missing notes and orphaned anchors are held out of reviews so a broken link cannot pile up overdue cards. `Remove missing` moves every held-back plant to the trash, `Empty trash` deletes trashed plants permanently, and `Reset garden` clears everything after writing a backup and asking you to type `reset`.

**Your data.** Schedules live in `Spaced Repetition Garden/cards.json` inside your vault, so they travel with the vault when you sync it. Writes merge with what is already on disk, so two Obsidian windows do not overwrite each other. Deletions are remembered as tombstones, review totals are merged per writer, and a reset is protected against stale copies coming back. If Obsidian's sync creates a conflicted copy of the file, it is merged, archived with a `.merged-*` suffix, and left out of the way. Daily history is pruned after about three years, the file switches to compact JSON once the garden passes 250 cards, and old backups are pruned after a year or 20 files. Deleting `cards.json` while Obsidian is closed resets the garden; a reset from the plugin writes a timestamped `.bak-reset-*` copy first.

If the data file is read-only, was written by a newer version of the plugin, or cannot be read safely, the garden opens read-only with a banner explaining why. Fix the file permission or update the plugin, then reload Obsidian.

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

The version in `package.json` is the single source of truth. Bump it, commit
the change, then run `npm run release` from a clean tree. The script writes it
into `manifest.json` and `versions.json`, builds and packages the plugin,
commits the generated metadata, and pushes the exact version tag (for example
`0.3.0`, with no `v` prefix). The GitHub Actions workflow is the only
publisher: it reruns checks, builds the release, and attaches `main.js`,
`manifest.json`, `styles.css` and the zip to the GitHub release.
`npm run release:dry-run` runs the same build and packaging without committing,
tagging or uploading anything.

The release zip contains `main.js`, `manifest.json` and `styles.css` at its
root, ready to unzip into the plugin folder.

## Licence

MIT, see [LICENSE](LICENSE).
