'use strict'

const is = require('unist-util-is')
const u = require('unist-builder')
const semver = require('semver')
const isSorted = require('is-array-sorted')
const github = require('github-from-package')
const closest = require('read-closest-package')
const path = require('path')
const execFileSync = require('child_process').execFileSync
const Changelog = require('./lib/changelog')
const plugin = require('./package.json').name

const REJECT_NAMES = new Set(['history', 'releases', 'changelog'])
const GROUP_TYPES = new Set(['Changed', 'Added', 'Deprecated', 'Removed', 'Fixed', 'Security'])

module.exports = function attacher (opts) {
  opts = opts || {}
  const fix = !!opts.fix

  return function transform (root, file, callback) {
    if (file.basename && file.basename !== 'CHANGELOG.md') {
      if (REJECT_NAMES.has(file.stem.toLowerCase())) {
        warn('Filename must be CHANGELOG.md', root, 'filename')
      }

      return process.nextTick(callback)
    }

    if (!is(root, 'root') || !root.children) {
      return process.nextTick(callback, new Error('Expected a root node'))
    }

    const changelog = Changelog(root.children)
    const cwd = path.resolve(opts.cwd || file.cwd)
    const githubUrl = github2(opts.repository || closest.sync({ cwd }))
    const tags = gitTags(cwd)
    const versions = new Set()

    if (fix) {
      changelog.buildHeading()
    } else if (!changelog.hasValidHeading()) {
      warn('Changelog must start with a top-level "Changelog" heading', changelog.heading || root, 'title')
    }

    changelog.children.forEach(lintRelease)

    if (fix) {
      changelog.children.sort(cmpRelease)
    } else if (!isSorted(changelog.children, { comparator: cmpRelease })) {
      warn('Releases must be sorted latest-first', root, 'latest-release-first')
    }

    // Lint or rebuild headings, with links and definitions
    for (let i = 0; i < changelog.children.length; i++) {
      const { version, date, linkType, heading } = changelog.children[i]

      if (i !== changelog.children.length - 1) {
        if (!version || !changelog.children[i + 1].version) continue

        const identifier = version.toLowerCase()
        const oldUrl = (changelog.definitions.get(identifier) || {}).url
        const url = diffUrl(githubUrl, tags, version, changelog.children[i + 1].version)

        if (fix) {
          const label = identifier
          const referenceType = version === 'unreleased' ? 'full' : 'shortcut'

          heading.children = [u('linkReference', { identifier, label, referenceType }, [
            u('text', version === 'unreleased' ? 'Unreleased' : version)
          ])]

          if (version !== 'unreleased') {
            heading.children.push(u('text', ` - ${date || 'YYYY-MM-DD'}`))
          }

          changelog.definitions.set(identifier, u('definition', { identifier, label, url, title: null }))
        } else if (!linkType) {
          warn('Release version must have a link', heading, 'release-version-link')
        } else if (linkType !== 'linkReference') {
          warn('Use link reference in release heading', heading, 'release-version-link-reference')
        } else if (oldUrl !== url) {
          warn(`Expected link to ${url}`, heading, 'release-version-link')
        }
      }
    }

    if (fix) {
      changelog.definitions = sortMap(changelog.definitions, cmpVersion)
    } else if (!isMapSorted(changelog.definitions, cmpVersion)) {
      warn('Definitions must be sorted latest-first', root, 'latest-definition-first')
    }

    // Reconstruct tree
    if (fix) root.children = changelog.tree()

    return process.nextTick(callback)

    function lintRelease (release) {
      const { heading } = release

      if (!is(heading, { depth: 2 })) {
        warn('Release must start with second-level heading', heading, 'release-heading-depth')
        return
      } else if (!release.parseable) {
        warn('Release heading must be "Unreleased" or have the format "<version> - <date>"', heading, 'release-heading')
        return
      }

      if (release.version) {
        if (versions.has(release.version)) {
          warn('Release version must be unique', heading, 'unique-release')
        }

        if (!fix && release.version === 'unreleased' && release.title !== 'Unreleased') {
          warn('Release heading must be "Unreleased"', heading, 'release-heading')
        }

        versions.add(release.version)
      }

      if (release.version !== 'unreleased') {
        if (!release.version) {
          warn('Release must have a version', heading, 'release-version')
        } else if (semver.valid(release.version) !== release.version) {
          warn('Release version must be semver-valid', heading, 'release-version')
        }

        if (!release.date) {
          warn('Release must have date', heading, 'release-date')
        } else if (!/^\d{4}-\d{2}-\d{2}$/.test(release.date)) {
          warn('Release date must have format YYYY-MM-DD', heading, 'release-date')
        }
      }

      release.children.forEach(lintGroup)
    }

    function lintGroup (group) {
      if (!group.hasValidHeading()) {
        warn('Group must start with a third-level, text-only heading', group.heading, 'group-heading')
        return
      }

      if (!GROUP_TYPES.has(group.type())) {
        const types = Array.from(GROUP_TYPES).join(', ')
        warn(`Group heading must be one of ${types}`, group.heading, 'group-heading-type')
      }
    }

    function warn (msg, node, rule) {
      file.message(msg, node, `${plugin}:${rule}`)
    }
  }
}

function cmpRelease (a, b) {
  // Retain original sort order of invalid releases
  if (!a.version || !b.version) return a.index - b.index
  return cmpVersion(a.version, b.version)
}

function cmpVersion (a, b) {
  if (a === 'unreleased') return b === 'unreleased' ? 0 : -1
  if (b === 'unreleased') return 1

  try {
    return semver.compare(b, a)
  } catch (err) {
    return b - a
  }
}

function diffUrl (githubUrl, tags, version, prevVersion) {
  const left = forgivingTag(`v${prevVersion}`, tags)
  const right = version === 'unreleased' ? 'HEAD' : forgivingTag(`v${version}`, tags)

  return `${githubUrl}/compare/${left}...${right}`
}

// If a (historical) tag without "v" prefix exists, use that.
function forgivingTag (tag, tags) {
  if (tags.indexOf(tag) >= 0) return tag
  const unprefixed = tag.replace(/^v/, '')
  if (tags.indexOf(unprefixed) >= 0) return unprefixed
  return tag
}

function gitTags (cwd) {
  return execFileSync('git', ['tag'], {
    cwd, maxBuffer: 1024 * 1024 * 16, encoding: 'utf8'
  }).split('\n')
}

// TODO: there's a package that does this, can't find it
function github2 (repo) {
  if (!repo) return

  repo = repo.url || repo

  if (/^[a-z0-9-_]+\/[a-z0-9-_]+$/i.test(repo)) {
    return 'https://github.com/' + repo
  } else {
    return github(repo)
  }
}

function isMapSorted (map, comparator) {
  return isSorted(Array.from(map.keys()), { comparator })
}

function sortMap (map, comparator) {
  const entries = Array.from(map.entries())
  entries.sort((a, b) => comparator(a[0], b[0]))
  return new Map(entries)
}
