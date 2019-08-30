# remark-changelog

> **Lint or fix a changelog written in markdown, following [`Keep A Changelog`](https://keepachangelog.com/en/1.0.0/).**  
> Changelogs should be written by humans, for humans. This tool focuses on helping you do that, rather than automatically generating a full changelog.

[![npm status](http://img.shields.io/npm/v/remark-changelog.svg)](https://www.npmjs.org/package/remark-changelog)
[![node](https://img.shields.io/node/v/remark-changelog.svg)](https://www.npmjs.org/package/remark-changelog)
[![Travis build status](https://img.shields.io/travis/vweevers/remark-changelog.svg?label=travis)](http://travis-ci.org/vweevers/remark-changelog)
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

If you're looking for a CLI, checkout [`hallmark`](https://github.com/vweevers/hallmark), a markdown style guide with linter and automatic fixer.

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

Release version must link to `https://github.com/OWNER/REPO/compare/A...B`. In `fix` mode links are automatically inserted, requiring a nearby `package.json` with a `repository` field. The link is optional for the oldest (last listed) release.

:warning: Currently, the changelog is the source of truth for the list of versions (rather than git tags) which has some side effects if a release is missing in the changelog.

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

Definitions must be sorted latest-first same as releases. In `fix` mode, definitions are reordered.

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

### `group-heading`

A "group" (of changes) must start with a third-level, text-only heading.

### `group-heading-type`

A group heading must be one of Changed, Added, Deprecated, Removed, Fixed, Security.

### `filename`

Filename must be `CHANGELOG.md`.

To support using `remark-changelog` in a pipeline that runs on other files too, `remark-changelog` ignores files other than `CHANGELOG.md` but it does reject alternative extensions and the alternative names `HISTORY` and `RELEASES`.

## API

### `changelog([opts])`

Options:

- `fix` (boolean): attempt to fix issues
- `cwd` (string): working directory, defaults to `cwd` of file or `process.cwd()`
- `repository` (string or object): defaults to `repository` field of `package.json`

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
