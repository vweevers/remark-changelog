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

    // Normalize messages. Only meant as a nudge.
    if (/^(chore|fix)\(package\): update /i.test(title)) {
      title = 'Upgrade ' + title.replace(/^(chore|fix)\(package\): update /i, '')
      type = 'Changed'
    } else if (/^upgrade /i.test(title)) {
      title = capitalize(title)
      type = 'Changed'
    } else if (/^(add|support) /i.test(title)) {
      title = capitalize(title)
      type = 'Added'
    } else if (/^(remove|drop) /i.test(title)) {
      title = capitalize(title)
      type = 'Removed'
    } else if (/^fix /i.test(title)) {
      title = capitalize(title)
      type = 'Fixed'
    } else if (/^(enable|disable|test|replace|move|use|tweak|update) /i.test(title)) {
      title = capitalize(title)
    }

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
