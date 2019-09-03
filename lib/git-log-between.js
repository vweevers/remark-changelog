'use strict'

const git = require('isomorphic-git')
const fs = require('fs')
const path = require('path')

git.plugins.set('fs', fs)

// Get a range of git commits and annotate commits from merges
// TODO: publish as git-log-between
module.exports = function (opts, callback) {
  if (typeof opts === 'function') {
    callback = opts
    opts = null
  }

  const promise = getCommits(opts)
  if (callback == null) return promise

  promise.then(function (res) {
    process.nextTick(callback, null, res)
  }).catch(function (err) {
    process.nextTick(callback, err)
  })
}

async function getCommits (opts) {
  if (!opts) opts = {}

  const dir = path.resolve(opts.cwd || '.')
  const lowerInclusive = !('gt' in opts)
  const upperInclusive = !('lt' in opts)
  const lowerish = looseHead(lowerInclusive ? opts.gte : opts.gt) || null
  const upperish = looseHead(upperInclusive ? opts.lte : opts.lt) || 'head'
  const limit = opts.limit || 1e3

  const lowerCommitOid = lowerish ? await resolveCommitish(dir, lowerish) : null
  const upperCommitOid = await resolveCommitish(dir, upperish)
  const commits = []
  const mergeCommits = []
  const children = new Map()

  let complete = false
  let position = upperCommitOid

  while (!complete && commits.length < limit) {
    // Walk backwards through history, starting at *position*
    const depth = Math.min(limit - commits.length + 1, 10)
    const chunk = await git.log({ dir, depth, ref: position })

    // Ignore upper bound or our previous position
    if (!upperInclusive || commits.length) chunk.splice(0, 1)
    if (!chunk.length) break

    for (const commit of chunk) {
      if (lowerCommitOid !== null && commit.oid === lowerCommitOid) {
        complete = true
        if (!lowerInclusive) break
      }

      const lines = commit.message.trim().split('\n')
      const title = lines.shift().trim()
      const description = lines.join('\n').trim()

      commit.title = title
      commit.description = description
      commit.message = title + (description ? '\n\n' + description : '')
      commit.isMergeCommit = false
      commit.pr = null

      commits.push(commit)

      if (commit.parent.length === 1) {
        children.set(commit.parent[0], commit)
      } else if (commit.parent.length > 1) {
        commit.isMergeCommit = true
        commit.pr = prNumber(commit.message)
        commit.commits = []

        // Only support simple merges, not "octopus merges" with > 2 parents
        if (commit.parent.length === 2) mergeCommits.push(commit)
      }

      if (commits.length === limit) complete = true
      if (complete) break
    }

    position = chunk[chunk.length - 1].oid
  }

  for (const mc of mergeCommits) {
    // Skip non-github merges for now
    if (mc.pr == null) continue

    let [src, dst] = mc.parent
    let child

    // Find the commit that has *src* as its parent, walk up until *dst*.
    // 60% of the time, it works every time.
    while (src !== dst && (child = children.get(src)) && mc.commits.length < limit) {
      child.mergeCommit = mc
      child.pr = mc.pr

      mc.commits.push(child)
      src = child.oid
    }

    // Sort latest-first
    mc.commits.reverse()
  }

  return commits
}

async function resolveCommitish (dir, ref) {
  const oid = await git.resolveRef({ dir, ref })
  const obj = await git.readObject({ dir, oid, encoding: 'utf8' })

  // Head or lightweight tag
  if (obj.type === 'commit') {
    return oid
  }

  // Annotated tag (has its own git object)
  if (obj.type === 'tag' && obj.object.type === 'commit' && obj.object.object) {
    return obj.object.object
  }

  throw new Error('Could not resolve ' + ref + ' to commit')
}

function prNumber (message) {
  if (/^Merge pull request #\d/i.test(message)) {
    return parseInt(message.slice(20), 10)
  } else {
    return null
  }
}

function looseHead (commitish) {
  return /^head$/i.test(commitish) ? 'head' : commitish
}
