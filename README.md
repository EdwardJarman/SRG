# Spaced Repetition Garden

An Obsidian plugin that turns notes into flashcards and grows them into a garden. Keep up with a card and it flowers, let it slide and it wilts.

## Installing

1. Download the latest release from the [releases page](https://github.com/EdwardJarman/SRG/releases).
2. Unzip it into `<your vault>/.obsidian/plugins/spaced-repetition-garden/`.
3. Restart Obsidian and turn the plugin on in Settings → Community plugins.

Obsidian 1.5.0 or newer.

## Using it

**Planting a card.** Put the cursor in a note and run `Spaced Repetition Garden: Plant flashcard from note or heading` from the command palette. Select some text first and you get a card for that paragraph only. Put the cursor under a heading and you get a card for the whole section. Without a selection you get a card for the entire note. Right-clicking in the editor offers the same thing as "Plant as flashcard".

**Reviewing.** `Spaced Repetition Garden: Review due cards` opens the queue. Space shows the answer, then 1 to 4 grades it: Again, Hard, Good, Easy. Cards you get wrong come back at the end of the session. If you mis-grade, `Undo last grade` (or Ctrl+Z) puts the card back the way it was, review history included. `Not today` puts a card off until tomorrow, and `Reschedule...` lets you pick the date it comes back.

**The garden.** Click the sprout in the ribbon, or run `Spaced Repetition Garden: Open garden`. Every card is a plant, and plants are grouped into beds by the folder the note lives in. Drag to pan, scroll to zoom, hover a plant to see its schedule, click it to review that one card, right-click it to manage it. Plants that have fallen behind are wilting, ones that are nearly due are starting to bloom.

**Managing plants.** Right-click any plant for review, open note, suspend, reschedule, reset progress or remove. `Spaced Repetition Garden: Manage plants` opens a list of every card where you can search, filter by bed or state, and do the same things.

**Your data.** Schedules live in `Spaced Repetition Garden/cards.json` inside your vault, so they travel with the vault when you sync it. Deleting that file resets the garden.

## Settings

- **New cards per day** — how many unseen cards join the queue each day.
- **Day start hour** — the hour your day begins, which decides what counts as "due today".
- **Retention window** — how many days of review history the retention figure covers.

## Development

```
npm install
npm run dev        # rebuild on change
npm run typecheck
npm test
npm run build      # production build into main.js
npm run package    # zip the plugin into dist/
npm run deploy -- --vault "C:\path\to\vault"
```

`npm run deploy` builds the plugin and copies it into a vault's plugin folder,
so you only have to reload Obsidian to try a change.

A release is a zip of `main.js`, `manifest.json` and `styles.css`. Tag a commit
with `v<version>` and the GitHub Actions workflow builds it and publishes the
zip on the releases page.

## Licence

MIT, see [LICENSE](LICENSE).
