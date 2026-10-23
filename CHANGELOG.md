# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.2.0] - 2026-10-23

### Added

- Card management: right-click a plant in the garden to review it, open its
  note, copy its anchor, suspend it, reschedule it, reset its progress or move
  it to the trash.
- A "Manage plants" view listing every card with search by title, file or
  anchor, a bed filter, state filters for due, new, suspended, missing and
  trashed plants, and per-card actions.
- Trash: removed plants keep their scheduling history and can be restored from
  the manage view or from the undo button on the notice. Emptying the trash
  deletes them permanently after a confirmation.
- "Remove missing" moves every plant whose note is gone to the trash.
- "Reset garden" clears the whole garden after writing a timestamped backup and
  asking you to type `reset`.
- Missing plants are now drawn as pale ghost plants with a dashed halo.
- Anchor labels are shown on hover in the garden, in the manage list and in the
  review modal, and `Copy anchor` copies a wikilink to the exact note, heading
  or block.
- Pinch-to-zoom and a larger touch hit radius on mobile.
- `npm run bench`: 1,000-card benchmarks for the queue, stats, layout,
  serialization and a whole-file write.
- `npm run release:dry-run`: build and package a release without committing,
  tagging or uploading.
- Review queue: undo the last grade, put a card off until tomorrow, or
  reschedule it to a date you pick.
- A "Bury siblings after a lapse" setting: when a plant lapses, the other
  plants from the same note wait for the next session.
- Plants whose note was deleted are held back and shown as missing, instead of
  piling up as overdue.
- `npm run deploy` builds the plugin and copies it straight into a vault.
- The README now covers managing plants and the new review controls.
- Release packaging: `npm run package` builds a zip of the plugin, `npm run
  release` publishes it to GitHub with the matching changelog entry, and a
  GitHub Actions workflow does the same for every `v*` tag.

### Changed

- The garden's Review button now shows the real queue length, including the
  daily new-card allowance, instead of every due card.
- Writes merge with the file on disk before saving, so two Obsidian windows no
  longer overwrite each other's changes. `cards.json` is monitored for external
  edits, and Obsidian conflicted copies are merged in.
- The data file switches to compact JSON at 250 cards, and daily history is
  pruned to roughly three years.
- Undo now steps back through the whole session, not just the last grade.
- A selection that runs over several paragraphs plants the section it sits in
  rather than only its last paragraph.
- The release flow takes the version from `package.json`, writes it into
  `manifest.json` and `versions.json`, tags the commit and publishes the zip.
- The manifest names its author.

### Fixed

- Undo now actually restores the card's pre-grade schedule instead of writing
  the graded card back unchanged.
- Daily stats with malformed day keys are dropped instead of being kept forever.
- Resetting the garden moves conflicted copies aside first, so they cannot merge
  the old plants back in on the next load.
- The review summary now counts the same daily queue as the Review button, and a
  failed reset no longer reports success.
- A missing-note notice for one plant now uses singular wording.
- Release notes no longer drop the last line of the matching changelog section.
- The release workflow updates an existing release instead of failing when a
  tag is pushed again.
- `npm run release` updates the existing release instead of failing when the
  tag has already been published.
- Undoing a grade keeps the card's relinked heading and its review history
  intact.
- A crash that left a temp file beside a good one no longer loses the cards
  that were only in the older file.
- A lapsed plant no longer takes a slot meant for a new one in the daily quota.
- Review history is written to disk when the window loses focus, not only when
  Obsidian quits.
- A published release now always carries the version it was tagged with.

## [0.1.0] - 2026-10-19

### Added

- Plant a card from a note, a heading, or a selected paragraph.
- SM-2 scheduling with Again, Hard, Good and Easy grading, and a daily limit on
  new cards.
- Review modal with keyboard grading, interval previews and a session summary.
- Garden view where plants grow with each review, wilt when they fall behind
  and bloom when they are nearly due.
- Panning, zooming, plant details on hover, and click to review a single plant.
- Card storage in the vault at `Spaced Repetition Garden/cards.json`, written
  atomically and recovered after a crash.
- Status bar summary and a settings tab.
