'use strict'

const unified = require('unified')
const parse = require('remark-parse')
const github = require('remark-github')

module.exports = function (repository) {
  const processor = unified()
    .use(parse)
    .use(github, { repository })
    .freeze()

  return function parse (str) {
    return processor.parse(str).children
  }
}
