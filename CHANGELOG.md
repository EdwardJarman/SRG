# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Release packaging: `npm run package` builds a zip of the plugin, and a
  GitHub Actions workflow publishes a zip for every `v*` tag.

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
