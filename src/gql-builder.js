export default function buildQuery (rootField, node, getType) {
  const vars = collectVars(node, [])
  const varDecl = vars.length ? `(${vars.map(v => `$${v.name}: ${v.type}`).join(', ')})` : ''

  const args = [...node.vars]
    .map(arg => `${arg}: $${makeVarName([], arg)}`)
    .join(', ')

  let fields = buildFields(getType, node.typeName, node, [])
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

function buildFields (getType, typeName, node, path) {
  const type = getType(typeName)
  if (!type?.fields) return ''

  const parts = []

  const scalars = node.scalars.size ? [...node.scalars] : ['__typename']
  parts.push(...scalars)

  for (const child of node.children) {
    const def = type.fields[child.field]
    if (!def) continue

    const childPath = [...path, child.field]
    const args = [...child.node.vars]
      .map(arg => `${arg}: $${makeVarName(childPath, arg)}`)
      .join(', ')

    const inner = buildFields(getType, def.type, child.node, childPath)
    parts.push(`${child.field}${args ? `(${args})` : ''}{${inner}}`)
  }

  parts.push()

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
