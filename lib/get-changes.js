'use strict'

module.exports = function getChanges (commits) {
  const grouped = {
    Changed: [],
    Added: [],
    Deprecated: [],
    Removed: [],
    Fixed: [],
    Security: [],
    Uncategorized: []
  }

  for (const commit of commits) {
    if (commit.isMergeCommit) {
      continue
    }

    let title = commit.title
    let type = 'Uncategorized'

    const shortRef = commit.oid.slice(0, 7)
    const author = isBot(commit.author) ? merger(commit) : commit.author

    // Don't add links here (let remark-github handle that)
    title += commit.pr ? ` (#${commit.pr})` : ''
    title += ` (${shortRef})`
    title += ` (${author.name})`

    grouped[type].push({
      title,
      description: commit.description
    })
  }

  return grouped
}

function merger (commit) {
  return commit.mergeCommit ? commit.mergeCommit.author : commit.committer
}

function capitalize (str) {
  return str[0].toUpperCase() + str.slice(1)
}

function isBot (author) {
  return author.name === 'Greenkeeper' ||
    author.name === 'greenkeeper[bot]' ||
    author.email.endsWith('@greenkeeper.io')
}
