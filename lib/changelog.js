'use strict'

const is = require('unist-util-is')
const u = require('unist-builder')

const UNRELEASED_RE = /Unreleased/i

class Section {
  constructor (depth, parent, heading) {
    this.depth = depth || 1
    this.heading = heading || null
    this.content = []
    this.children = []
    this.definitions = new Map()

    Object.defineProperty(this, 'parent', { value: parent || null })
  }

  add (node, Child) {
    if (is(node, 'heading')) {
      if (node.depth > this.depth) {
        const child = new Child(this.depth + 1, this, node)
        this.children.push(child)
        return child
      } else if (this.parent) {
        return this.parent.add(node)
      }
    }

    if (is(node, 'definition') && typeof node.identifier === 'string') {
      this.root().definitions.set(node.identifier.toLowerCase(), node)
    } else {
      this.content.push(node)
    }

    return this
  }

  tree () {
    const tree = []

    if (this.heading) tree.push(this.heading)
    if (this.content) tree.push(...this.content)

    for (const child of this.children) tree.push(...child.tree())
    for (const node of this.definitions.values()) tree.push(node)

    return tree
  }

  root () {
    return this.parent ? this.parent.root() : this
  }
}

class Changelog extends Section {
  add (node) {
    if (is(node, 'heading') && !this.heading && !this.content.length && node.depth === 1) {
      this.heading = node
      return this
    }

    return super.add(node, Release)
  }

  hasValidHeading () {
    if (!is(this.heading, { type: 'heading', depth: 1 })) return false
    if (!this.heading.children || this.heading.children.length !== 1) return false
    return is(this.heading.children[0], { type: 'text', value: 'Changelog' })
  }

  buildHeading () {
    if (is(this.heading, { type: 'heading', depth: 1 })) {
      this.heading.children = [u('text', 'Changelog')]
    } else {
      this.heading = u('heading', { depth: 1 }, [u('text', 'Changelog')])
    }
  }
}

class Release extends Section {
  constructor (depth, parent, heading) {
    super(depth, parent, heading)

    this.index = parent.children.length
    this.version = null
    this.title = null
    this.linkType = null
    this.parseable = false

    const h = heading.children || []

    if (is(h[0], 'text') && h.length === 1) {
      this.title = h[0].value

      if (UNRELEASED_RE.test(h[0].value)) {
        this.parseable = true
        this.version = 'unreleased'
      } else {
        const [version, date, ...rest] = (h[0].value || '').split(' - ')

        if (!rest.length) {
          this.parseable = true
          this.version = version
          this.date = date
        }
      }
    } else if (is(h[0], ['link', 'linkReference']) && soleChild(h[0], 'text')) {
      this.linkType = h[0].type
      const version = h[0].children[0].value

      if (h.length === 1) {
        this.parseable = true
        this.version = UNRELEASED_RE.test(version) ? 'unreleased' : version
        this.title = version
      } else if (h.length === 2 && is(h[1], 'text')) {
        const [before, date, ...after] = (h[1].value || '').split(' - ')

        if (!before && !after.length) {
          this.parseable = true
          this.version = version
          this.date = date
        }
      }
    }
  }

  add (node) {
    return super.add(node, Group)
  }
}

class Group extends Section {
  add (node) {
    return super.add(node, Section)
  }

  hasValidHeading () {
    if (!is(this.heading, { type: 'heading', depth: 3 })) return false
    return soleChild(this.heading, { type: 'text' }) != null
  }

  type () {
    return this.heading.children[0].value
  }
}

module.exports = function fromTree (tree) {
  const root = new Changelog()

  for (let i = 0, section = root; i < tree.length; i++) {
    section = section.add(tree[i])
  }

  return root
}

function soleChild (node, test) {
  if (!node || !node.children || node.children.length !== 1) return null
  const child = node.children[0]
  return is(child, test) ? child : null
}
