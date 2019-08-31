'use strict'

const test = require('tape')
const fs = require('fs')
const path = require('path')
const remark = require('remark')
const tempy = require('tempy')
const execFileSync = require('child_process').execFileSync
const plugin = require('..')

test('lints various', function (t) {
  run('00-various-input', '00-various-input', { options: { fix: false } }, (err, { file, actual, expected }) => {
    t.ifError(err)
    t.is(actual, expected)
    t.same(file.messages.map(String), [
      `${file.path}:1:1-1:4: Changelog must start with a top-level "Changelog" heading`,
      `${file.path}:5:1-5:28: Release heading must be "Unreleased"`,
      `${file.path}:18:1-18:22: Release date must have format YYYY-MM-DD`,
      `${file.path}:1:1-28:65: Releases must be sorted latest-first`,
      `${file.path}:3:1-3:42: Use link reference in release heading`,
      `${file.path}:7:1-7:24: Expected link to https://github.com/test/test/compare/v2.0.1...v2.0.0`,
      `${file.path}:18:1-18:22: Release version must have a link`,
      `${file.path}:1:1-28:65: Definitions must be sorted latest-first`
    ])
    t.end()
  })
})

test('fixes various', function (t) {
  run('00-various-input', '00-various-output', { options: { fix: true } }, (err, { file, actual, expected }) => {
    t.ifError(err)
    t.is(actual, expected)
    if (actual !== expected) {
      console.error(expected + '\n')
      console.error(actual + '\n')
    }
    t.same(file.messages.map(String), [
      // Can't be fixed
      `${file.path}:18:1-18:22: Release date must have format YYYY-MM-DD`
    ])
    t.end()
  })
})

test('lints empty', function (t) {
  run('01-empty-input', '01-empty-input', { options: { fix: false } }, (err, { file, actual, expected }) => {
    t.ifError(err)
    t.is(actual, expected)
    t.same(file.messages.map(String), [
      `${file.path}:1:1-1:1: Changelog must start with a top-level "Changelog" heading`
    ])
    t.end()
  })
})

test('fixes empty', function (t) {
  run('01-empty-input', '01-empty-output', { options: { fix: true } }, (err, { file, actual, expected }) => {
    t.ifError(err)
    t.is(actual, expected)
    t.same(file.messages.map(String), [])
    t.end()
  })
})

for (const filename of ['RELEASES.md', 'HISTORY.md', 'changelog.md', 'CHANGELOG.markdown', 'changelog.foo', 'CHANGELOG']) {
  test('lints invalid filename: ' + filename, function (t) {
    run('02-minimum', '02-minimum', { filename, options: { fix: false } }, (err, { file, actual, expected }) => {
      t.ifError(err)
      t.is(actual, expected)
      t.same(file.messages.map(String), [
        `${file.path}:1:1-1:12: Filename must be CHANGELOG.md`
      ])
      t.end()
    })
  })
}

test('lints duplicate version', function (t) {
  run('03-duplicate-version', '03-duplicate-version', { options: { fix: false } }, (err, { file, actual, expected }) => {
    t.ifError(err)
    t.is(actual, expected)
    t.same(file.messages.map(String), [
      `${file.path}:5:1-5:22: Release version must be unique`,
      `${file.path}:3:1-3:22: Release version must have a link`
    ])
    t.end()
  })
})

test('lints group type', function (t) {
  run('04-group-type', '04-group-type', { options: { fix: false } }, (err, { file, actual, expected }) => {
    t.ifError(err)
    t.is(actual, expected)
    t.same(file.messages.map(String), [
      `${file.path}:5:1-5:8: Group heading must be one of Changed, Added, Deprecated, Removed, Fixed, Security`
    ])
    t.end()
  })
})

test('does not break on wrong release header level', function (t) {
  run('05-wrong-level', '05-wrong-level', { options: { fix: false } }, (err, { file, actual, expected }) => {
    t.ifError(err)
    t.is(actual, expected)
    t.same(file.messages.map(String), [])
    t.end()
  })
})

// TODO: should sort first, then lint links
test.skip('sorts releases and definitions', function (t) {
  t.plan(6)

  run('06-unsorted-input', '06-unsorted-input', { options: { fix: false } }, (err, { file, actual, expected }) => {
    t.ifError(err)
    t.is(actual, expected)
    t.same(file.messages.map(String), [
      `${file.path}:1:1-23:62: Releases must be sorted latest-first`,
      `${file.path}:1:1-27:62: Definitions must be sorted latest-first`
    ])
  })

  run('06-unsorted-input', '06-unsorted-output', { options: { fix: true } }, (err, { file, actual, expected }) => {
    t.ifError(err)
    t.is(actual, expected)
    t.same(file.messages.map(String), [])
  })
})

test('sorts extra definitions lexicographically', function (t) {
  t.plan(6)

  run('07-extra-defs-input', '07-extra-defs-input', { options: { fix: false } }, (err, { file, actual, expected }) => {
    t.ifError(err)
    t.is(actual, expected)
    t.same(file.messages.map(String), [
      `${file.path}:1:1-27:62: Definitions must be sorted latest-first`
    ])
  })

  run('07-extra-defs-input', '07-extra-defs-output', { options: { fix: true } }, (err, { file, actual, expected }) => {
    t.ifError(err)
    t.is(actual, expected)
    t.same(file.messages.map(String), [])
  })
})

function run (inputFixture, outputFixture, opts, test) {
  const cwd = tempy.directory()
  const inputFile = path.join(__dirname, 'fixture', inputFixture + '.md')
  const outputFile = path.join(__dirname, 'fixture', outputFixture + '.md')
  const { options } = opts

  execFileSync('git', ['init', '.'], { cwd, stdio: 'ignore' })

  fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({
    name: 'test',
    repository: 'https://github.com/test/test.git',
    private: true
  }))

  const input = fs.readFileSync(inputFile, 'utf8').trim()
  const expected = fs.readFileSync(outputFile, 'utf8').trim()

  remark()
    .use({ settings: { fences: true, listItemIndent: '1' } })
    .use(() => (tree, file) => {
      file.path = path.join(cwd, opts.filename || 'CHANGELOG.md')
      file.cwd = cwd
    })
    .use(plugin, options)
    .process(input, (err, file) => {
      const actual = String(file).trim()
      process.nextTick(test, err, { file, cwd, actual, expected })
    })
}
