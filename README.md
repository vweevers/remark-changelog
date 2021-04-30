# remark-changelog

**Lint or fix a changelog written in markdown, following [`Keep A Changelog`](https://keepachangelog.com/en/1.0.0/).** Changelogs should be written by humans, for humans. This tool focuses on helping you do that.

[![npm status](http://img.shields.io/npm/v/remark-changelog.svg)](https://www.npmjs.org/package/remark-changelog)
[![node](https://img.shields.io/node/v/remark-changelog.svg)](https://www.npmjs.org/package/remark-changelog)
[![Travis build status](https://img.shields.io/travis/com/vweevers/remark-changelog.svg)](http://travis-ci.com/vweevers/remark-changelog)
[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com)

## Usage

```js
const changelog = require('remark-changelog')
const vfile = require('to-vfile')
const remark = require('remark')

remark()
  .use(changelog)
  .process(vfile.readSync('CHANGELOG.md'), function (err, file) {
    if (err) throw err
    console.log(String(file))
  })
```

Pair with [`remark-github`](https://github.com/remarkjs/remark-github) for ultimate pleasure. If you're looking for a CLI that includes both, checkout [`hallmark`](https://github.com/vweevers/hallmark), a markdown style guide with linter and automatic fixer.

## Rules

### `title`

Changelog must start with a top-level "Changelog" heading. In `fix` mode, it is either added or updated.

### `release-heading-depth`

Release must start with second-level heading.

### `release-heading`

Release heading must be `Unreleased` or have the format `<version> - <date>`.

### `release-version`

Release must have a semver-valid version, without `v` prefix. Releases that have no matching git tag are _not_ rejected, to support adding a git tag after updating the changelog.

### `release-version-link`

Release version must have a link. The destination URL is not linted. In `fix` mode links are automatically inserted (to `https://github.com/OWNER/REPO/compare/A...B` or `https://github.com/OWNER/REPO/releases/tag/$tag` for the oldest release) requiring a nearby `package.json` with a `repository` field. The link is optional for the oldest (last listed) release.

### `release-version-link-reference`

Use a link reference for version link.

Valid:

```md
## [1.0.0] - 2019-08-23

[1.0.0]: https://github.com/vweevers/remark-changelog/compare/v0.0.1...v1.0.0
```

Invalid:

```md
## [1.0.0](https://github.com/vweevers/remark-changelog/compare/v0.0.1...v1.0.0) - 2019-08-23
```

### `release-date`

Release must have a date with format `YYYY-MM-DD`.

### `latest-release-first`

Releases must be sorted latest-first according to semver rules. If there is an Unreleased section, it must be the very first. In `fix` mode, releases are reordered.

### `latest-definition-first`

Definitions must be sorted latest-first, same as releases. Any additional definitions (that don't describe a release) must be last. In `fix` mode, definitions are reordered.

Valid:

```md
[2.0.0]: https://github.com/vweevers/remark-changelog/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/vweevers/remark-changelog/compare/v0.0.1...v1.0.0
```

Invalid:

```md
[1.0.0]: https://github.com/vweevers/remark-changelog/compare/v0.0.1...v1.0.0
[2.0.0]: https://github.com/vweevers/remark-changelog/compare/v1.0.0...v2.0.0
```

### `unique-release`

Each release must have a unique version.

### `no-empty-release`

A release section must have content. This also goes for the Unreleased section.

In fix mode, an empty release is filled with a commit log as a leg up. Merge commits are skipped. GitHub merge commits ("Merge pull request #n") are used to annotate commits with a PR number (best effort). Squashed GitHub commits that have a default commit description (a list of squashed commits) are converted to sublists.

Valid:

```md
## [2.0.0] - 2019-09-02

foo

## [1.0.0] - 2019-09-01

bar
```

Invalid:

```md
## [2.0.0] - 2019-09-02

## [1.0.0] - 2019-09-01
```

### `group-heading`

A "group" (of changes) must start with a third-level, text-only heading.

### `group-heading-type`

A group heading must be one of Changed, Added, Deprecated, Removed, Fixed, Security.

### `no-empty-group`

A group must not be empty. Invalid:

```md
### Added
### Fixed
```

### `no-uncategorized-changes`

There should not be a group with heading Uncategorized. This group is added by `remark-changelog` if the `fix` option is true and it populates an empty release with commits. This rule then hints that changes should be categorized.

### `filename`

Filename must be `CHANGELOG.md`.

To support using `remark-changelog` in a pipeline that runs on other files too, `remark-changelog` ignores files other than `CHANGELOG.md` but it does reject alternative extensions and the alternative names `HISTORY` and `RELEASES`.

## API

### `changelog([opts])`

Options:

- `fix` (boolean): attempt to fix issues
- `cwd` (string): working directory, defaults to `cwd` of file or `process.cwd()`
- `pkg` (object): a parsed `package.json`, defaults to reading a nearby `package.json` (starting in `cwd` and then its parent directories)
- `repository` (string or object): defaults to `repository` field of `pkg`. Used to construct diff URLs.
- `version` (string): defaults to `version` field of `pkg` or the last tag. Used to identify a new release (anything that's greater than `version` and would normally be rejected in fix mode because it has no git tag yet) to support the workflow of updating a changelog before tagging.
- `submodules` (boolean): enable experimental git submodule support. Will collect commits from submodules and list them in the changelog as `<name>: <message>`.
- `add` (string): add a new changelog entry (only if `fix` is true). Value must be one of:
  - A release type: `major`, `minor`, `patch`, `premajor`, `preminor`, `prepatch`, `prerelease` (relative to last entry in changelog)
    - The `major` type bumps the major version (for example `2.4.1 => 3.0.0`); `minor` and `patch` work the same way.
    - The `premajor` type bumps the version up to the next major version and down to a prerelease of that major version; `preminor` and `prepatch` work the same way.
    - The `prerelease` type works the same as `prepatch` if the previous version is a non-prerelease. If the previous is already a prerelease then it's simply incremented (for example `4.0.0-rc.2 => 4.0.0-rc.3`).
  - A specific version like 2.4.0 (must be [semver](https://semver.org/)). This can also be used to insert a missing version (that is not necessarily the latest).

## FAQ

### Why not call it `remark-keep-a-changelog`?

Because we might deviate from `Keep A Changelog`, which is too loose to lint and has a broad target audience and thus technical scope. Conversely, `remark-changelog` only works on npm packages with a GitHub repository, to start.

## Install

With [npm](https://npmjs.org) do:

```
npm install remark-changelog
```

## License

[MIT](LICENSE.md) © 2019-present Vincent Weevers
