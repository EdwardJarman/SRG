# Community plugin submission

The repository-side work can be prepared here. The final submission is made by
the maintainer at https://community.obsidian.md/ with a GitHub account that can
access `EdwardJarman/SRG`.

## Before submitting

- [ ] `package.json`, `manifest.json`, `versions.json` and the release tag all
      use the exact same version, without a `v` prefix.
- [ ] `npm run typecheck`, `npm test`, `npm run build` and
      `npm run release:dry-run` pass.
- [ ] The GitHub release has `main.js`, `manifest.json`, `styles.css` and the
      zip attached.
- [ ] A fresh test vault installs by copying the three individual files into
      `.obsidian/plugins/spaced-repetition-garden/`, reloading Obsidian and
      enabling the plugin.
- [ ] The zip unzips into that same folder without creating a second nested
      plugin folder.
- [ ] `README.md` install steps work from the public release page.
- [ ] `manifest.json` has `id`, `name`, `author`, `authorUrl`, `version`,
      `minAppVersion`, `description` and `isDesktopOnly`.
- [ ] `versions.json` has the current version and its minimum app version.
- [ ] The repository is public, has a licence and has no generated secrets.
- [ ] Release notes in `CHANGELOG.md` describe the user-facing changes.

## Submission copy

Name: `Spaced Repetition Garden`

Short description: `Turn notes into flashcards that grow into a garden as you review them.`

Long description:

> Spaced Repetition Garden turns any note, heading or block into a flashcard.
> Cards that are reviewed on time bloom; neglected cards wilt. The plugin keeps
> scheduling data inside the vault, supports multiple Obsidian windows, and
> protects deletions, resets and conflicted copies from resurrecting stale
> cards.

Repository: `https://github.com/EdwardJarman/SRG`

## After submission

- Watch the community review for automated checks or manifest requests.
- Do not move or delete published release assets; the community catalogue and
  existing installs rely on them.
- For later versions, repeat the release checklist and submit an update from
  the community dashboard.
