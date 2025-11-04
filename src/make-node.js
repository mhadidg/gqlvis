function makeNode (typeName, argsDef = {}) {
  // Preselect required args (types ending with "!")
  const required = Object.entries(argsDef)
    .filter(([, arg]) => arg.type?.endsWith('!'))
    .map(([name]) => name)

  return {
    typeName, //
    argsDef, //
    vars: new Set(required), //
    scalars: new Set(), //
    children: []
  }
}

export default makeNode
