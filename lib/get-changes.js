'use strict'

module.exports = function getChanges (commits) {
  const grouped = {
    Changed: [],
    Added: [],
    // Deprecated: [], // Not often used
    Removed: [],
    Fixed: [],
    // Security: [], // Not often used
    Uncategorized: []
  }

  for (const commit of commits) {
    if (commit.isMergeCommit) {
      continue
    }

    let title = commit.title
    const type = 'Uncategorized'

    const shortRef = commit.oid.slice(0, 7)
    const author = isBot(commit.author) ? merger(commit) : commit.author

    // Add references to GH PRs and commits, but don't
    // add links here (let remark-github handle that).

    if (commit.submodule) {
      title = prefixTitle(title, commit.submodule)

      if (commit.ghrepo) {
        if (commit.pr) title += ` (${commit.ghrepo}#${commit.pr})`
        else if (shortRef) title += ` (${commit.ghrepo}@${shortRef})`
      }
    } else {
      title = prefixTitle(title)

      if (commit.pr) title += ` (#${commit.pr})`
      else if (shortRef) title += ` (${shortRef})`
    }

    const references = []
    const description = findReferences(commit.description, references)

    for (const ref of references) {
      title += ` (${ref})`
    }

    title += ` (${author.name})`

    grouped[type].push({
      title,
      description
    })
  }

  return grouped
}

function prefixTitle (title, subsystem) {
  if (/^breaking:/i.test(title)) {
    title = title.slice(9).trim()
    subsystem = subsystem ? `${subsystem} (breaking)` : 'Breaking'
  }

  return subsystem ? `**${subsystem}:** ${title}` : title
}

function findReferences (description, references) {
  if (!description) return

  return description.split(/\r?\n/).map(line => {
    return line.replace(/^(?:ref|see) ((?:[a-z]{2,4}-\d+(?: and |, )?)+)(?:\.\s*|$)/i, (match, p1) => {
      references.push(...p1.split(/(?: and |, )/))
      return ''
    })
  }).join('\n').trim()
}

function merger (commit) {
  return commit.mergeCommit ? commit.mergeCommit.author : commit.committer
}

function isBot (author) {
  return author.name === 'Greenkeeper' ||
    author.name === 'greenkeeper[bot]' ||
    author.email.endsWith('@greenkeeper.io')
}
