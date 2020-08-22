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
const getCommits = require('./lib/git-log-between')
const getChanges = require('./lib/get-changes')
const parser = require('./lib/parser')
const plugin = require('./package.json').name

const REJECT_NAMES = new Set(['history', 'releases', 'changelog'])
const GROUP_TYPES = new Set(['Changed', 'Added', 'Deprecated', 'Removed', 'Fixed', 'Security'])

module.exports = function attacher (opts) {
  opts = opts || {}
  const fix = !!opts.fix

  return async function transform (root, file) {
    if (file.basename && file.basename !== 'CHANGELOG.md') {
      if (REJECT_NAMES.has(file.stem.toLowerCase())) {
        warn('Filename must be CHANGELOG.md', root, 'filename')
      }

      return
    }

    if (!is(root, 'root') || !root.children) {
      throw new Error('Expected a root node')
    }

    const cwd = path.resolve(opts.cwd || file.cwd)
    const pkg = lazyPkg(cwd)
    const repository = repo(opts.repository || pkg().repository)
    const tags = gitTags(cwd)
    const currentVersion = opts.version || pkg().version || lastTagVersion(tags)

    if (!repository) {
      throw new Error('No repository url found in package.json or options')
    } else if (!currentVersion || semver.valid(currentVersion) !== currentVersion) {
      throw new Error('No valid version found in package.json or options')
    }

    const githubUrl = github2(repository)
    const parse = parser(repository)
    const changelog = Changelog(parse, root.children)
    const versions = new Set()

    if (fix) {
      changelog.buildHeading()
    } else if (!changelog.hasValidHeading()) {
      warn('Changelog must start with a top-level "Changelog" heading', changelog.heading || root, 'title')
    }

    if (fix) {
      changelog.children.sort(cmpRelease)
    } else if (!isSorted(changelog.children, { comparator: cmpRelease })) {
      warn('Releases must be sorted latest-first', root, 'latest-release-first')

      // Sort anyway (doesn't affect original tree) so that we
      // can correctly compute diff urls and commit ranges below.
      changelog.children.sort(cmpRelease)
    }

    changelog.children.forEach(relateVersions)
    await Promise.all(changelog.children.map(lintRelease))

    // Lint or rebuild headings, with links and definitions
    for (let i = 0; i < changelog.children.length; i++) {
      const { version, previousVersion, date, linkType, heading } = changelog.children[i]

      if (i !== changelog.children.length - 1) {
        if (!version || !previousVersion) continue

        const identifier = version.toLowerCase()
        const oldUrl = (changelog.definitions.get(identifier) || {}).url
        const url = diffUrl(githubUrl, tags, version, previousVersion)

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

    if (fix) {
      // Reconstruct tree
      root.children = changelog.tree()
      return root
    }

    function relateVersions (release, i, arr) {
      release.previousVersion = arr[i + 1] ? arr[i + 1].version : null
    }

    async function lintRelease (release) {
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

      if (release.isEmpty()) {
        await lintEmptyRelease(release)
      }

      release.children.forEach(lintGroup)
    }

    async function lintEmptyRelease (release) {
      const { heading, version, previousVersion } = release

      if (fix && version && previousVersion) {
        const gt = forgivingTag(previousVersion, tags)
        const opts = { cwd, gt, limit: 100 }

        if (version === 'unreleased' || isNewVersion(version, previousVersion)) {
          opts.lte = 'HEAD'
        } else {
          opts.lt = forgivingTag(version, tags)
        }

        try {
          var commits = await getCommits(opts)
        } catch (err) {
          const msg = `Failed to get commits for release (${version}): ${err.message}`
          warn(msg, heading, 'no-empty-release')
          return
        }

        const grouped = getChanges(commits)

        for (const type in grouped) {
          const changes = grouped[type]

          if (changes.length) {
            release
              .createGroup(type)
              .createList(changes)
          }
        }

        if (!release.isEmpty()) return
      }

      warn(`Release (${version || 'n/a'}) is empty`, heading, 'no-empty-release')
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

    function lazyPkg (cwd) {
      let pkg

      return function () {
        pkg = pkg || closest.sync({ cwd }) || {}
        return pkg
      }
    }

    function isNewVersion (nextVersion, previousVersion) {
      return previousVersion === currentVersion &&
        semver.gt(nextVersion, currentVersion)
    }
  }
}

function cmpRelease (a, b) {
  // Retain original sort order of invalid releases
  if (!a.version || !b.version) return a.index - b.index
  return cmpVersion(a.version, b.version)
}

function cmpVersion (a, b) {
  if (a === b) return 0
  if (a === 'unreleased') return -1
  if (b === 'unreleased') return 1

  const av = semver.valid(a)
  const bv = semver.valid(b)

  return av && bv ? semver.compare(b, a) : av ? -1 : bv ? 1 : a.localeCompare(b)
}

function diffUrl (githubUrl, tags, version, prevVersion) {
  const left = forgivingTag(`v${prevVersion}`, tags)
  const right = version === 'unreleased' ? 'HEAD' : forgivingTag(`v${version}`, tags)

  return `${githubUrl}/compare/${left}...${right}`
}

// If a (historical) tag without "v" prefix exists, use that.
function forgivingTag (tag, tags) {
  if (tag[0] !== 'v') tag = 'v' + tag
  if (tags.indexOf(tag) >= 0) return tag
  const unprefixed = tag.replace(/^v/, '')
  if (tags.indexOf(unprefixed) >= 0) return unprefixed
  return tag
}

function gitTags (cwd) {
  return execFileSync('git', ['tag'], {
    cwd, maxBuffer: 1024 * 1024 * 16, encoding: 'utf8'
  }).split(/\r?\n/).filter(Boolean)
}

function repo (repository) {
  return (repository && repository.url) || repository
}

function lastTagVersion (tags) {
  const sorted = tags
    .filter(t => t.startsWith('v'))
    .sort(cmpVersion)

  return sorted.length ? sorted[0].slice(1) : null
}

// TODO: there's a package that does this, can't find it
function github2 (repository) {
  if (/^[a-z0-9-_]+\/[a-z0-9-_]+$/i.test(repository)) {
    return 'https://github.com/' + repository
  } else {
    return github({ repository })
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
