function buildQuery (rootField, selection, getType) {
  const rootPath = [rootField]
  const decls = collectVarDecls(selection, rootPath)
  const uniq = []
  const seen = new Set()

  decls.forEach((d) => {
    const sig = `${d.name}:${d.type}`
    if (!seen.has(sig)) {
      seen.add(sig)
      uniq.push(d)
    }
  })

  const varDecl = uniq.length ? uniq.map((d) => `$${d.name}: ${d.type}`).join(', ') : ''
  const rootArgsUse = Array.from(selection.vars).map((arg) => `${arg}: $${makeVarName(rootPath, arg)}`).join(', ')
  const fields = toGraphQLFields(getType, selection.typeName, selection, rootPath)

  return `query${varDecl ? `(${varDecl})` : ''} {\n  ${rootField}${rootArgsUse ? `(${rootArgsUse})` : ''} {\n    ${fields}\n  }\n}`
}

function collectVarDecls (node, path) {
  const decls = []
  node.vars.forEach((arg) => {
    const argDef = node.argsDef[arg]
    const queryType = (argDef && argDef.type) || 'String'

    decls.push({
      name: makeVarName(path, arg), //
      type: queryType.endsWith('!') ? queryType : queryType
    })
  })

  node.children.forEach(function (child) {
    return decls.push(...collectVarDecls(child.node, [...path, child.field]))
  })

  return decls
}

function makeVarName (path, arg) { return [...path, arg].join('_') }

function toGraphQLFields (schemaGetType, typeName, node, path) {
  const type = schemaGetType(typeName)
  if (!type || !type.fields) return ''

  const lines = []
  const scalars = Array.from(node.scalars)
  if (scalars.length === 0) scalars.push('__typename')

  scalars.forEach((s) => lines.push(s))

  node.children.forEach((c) => {
    const fieldDef = schemaGetType(typeName)?.fields[c.field]
    if (!fieldDef) return

    const args = Array.from(c.node.vars).map((arg) => `${arg}: $${makeVarName([...path, c.field], arg)}`)
    const argsStr = args.length ? `(${args.join(', ')})` : ''
    const inner = toGraphQLFields(schemaGetType, fieldDef.type, c.node, [...path, c.field])

    lines.push(`${c.field}${argsStr} {\n  ${inner}\n}`)
  })

  return lines.join('\n')
}

export default buildQuery
