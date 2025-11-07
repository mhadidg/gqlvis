import { INLINE_FRAGMENT } from './utils.js'

export default function buildQuery (rootField, node) {
  const vars = collectVars(node, [])
  const varDecl = vars.length ? `(${vars.map(v => `$${v.name}: ${v.type}`).join(', ')})` : ''

  const args = [...node.vars]
    .map(arg => `${arg}: $${makeVarName([], arg)}`)
    .join(', ')

  const fields = buildFields(node, [])
  return prettyPrint(`query${varDecl}{${rootField}${(args ? `(${args})` : '')}{${fields}}}`)
}

function collectVars (node, path) {
  const out = [...node.vars].map(arg => {
    const type = node.argsDef?.[arg]?.type ?? 'String'
    return { name: makeVarName(path, arg), type }
  })

  for (const child of node.children) {
    out.push(...collectVars(child.node, [...path, child.field]))
  }

  return out
}

const makeVarName = (path, arg) => [...path, arg].join('_')

function buildFields (node, path) {
  const parts = []
  const defaultScalars = node.children.length ? [] : ['__typename']
  const scalars = node.scalars.size ? [...node.scalars] : defaultScalars
  if (scalars.length) parts.push(...scalars)

  for (const child of node.children) {
    const inner = buildFields(child.node, path)
    if (child.kind === INLINE_FRAGMENT) {
      parts.push(`... on ${child.node.typeName}{${inner}}`)
    } else {
      const childPath = [...path, child.field]
      const childArgs = [...child.node.vars]
        .map(arg => `${arg}: $${makeVarName(childPath, arg)}`)
        .join(', ')

      parts.push(`${child.field}${childArgs ? `(${childArgs})` : ''}{${inner}}`)
    }
  }

  return parts.join('|')
}

function prettyPrint (src) {
  let out = ''
  let indent = 0

  const pad = () => '  '.repeat(indent)

  for (let i = 0; i < src.length; i++) {
    const char = src[i]
    if (char === '{') {
      out += ' {\n'
      indent++
      out += pad()
    } else if (char === '}') {
      out += '\n'
      indent = Math.max(0, indent - 1)
      out += pad() + '}'
    } else if (char === '|') {
      out += '\n' + pad()
    } else {
      out += char
    }
  }

  return out
}
