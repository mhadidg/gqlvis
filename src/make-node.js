/**
 * @param typeName {string}
 * @param argsDef {Object}
 * @returns {{typeName: *, argsDef: {}, vars: Set<any>, scalars: Set<any>, children: *[]}}
 */
function makeNode (typeName, argsDef = {}) {
  return {
    typeName, //
    argsDef, //
    vars: new Set(), //
    scalars: new Set(), //
    children: []
  }
}

export default makeNode
