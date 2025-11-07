export const SCALAR = 'SCALAR'
export const OBJECT = 'OBJECT'
export const INTERFACE = 'INTERFACE'
export const INLINE_FRAGMENT = 'INLINE_FRAGMENT'
export const LIST_SCALAR = 'LIST_SCALAR'
export const LIST_OBJECT = 'LIST_OBJECT'
export const LIST_INTERFACE = 'LIST_INTERFACE'

export async function gqlFetch (urlStr, query, variables) {
  const url = new URL(urlStr)
  const headers = { 'content-type': 'application/json' }

  if (url.username) {
    if (url.username.toLowerCase() === 'bearer') {
      headers.Authorization = `Bearer ${url.password}`
    } else {
      const basic = btoa(`${url.username}:${url.password}`)
      headers.Authorization = `Basic ${basic}`
    }

    // Clear username/password from URL
    url.username = ''
    url.password = ''
  }

  const res = await fetch(url.toString(), {
    method: 'POST', //
    headers, //
    body: JSON.stringify({ query, variables }),
  })

  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const json = await res.json()
  if (json.errors) {
    throw new Error(json.errors.map((e) => e.message).join('; '))
  }

  return json.data
}

/**
 * Unwrap a GraphQL type to its base type
 * @param type {{ kind: *, name: *, ofType: { kind: *, name: *, ofType: Object} }}
 * @returns {{namedKind: string, namedName: string, wrappers: string[]}}
 */
export function unwrap (type) {
  const wrappers = []

  let cur = type
  while (cur && (cur.kind === 'NON_NULL' || cur.kind === 'LIST')) {
    wrappers.push(cur.kind)
    cur = cur.ofType
  }

  return {
    namedKind: cur?.kind, //
    namedName: cur?.name, //
    wrappers
  }
}

/**
 * Simplify an object type
 * @param type {{ kind: string, name: string, fields: Object[], possibleTypes: Object[] }}
 * @returns {{ kind: string, fields: {[name]: Object }} | {}}
 */
export function simplifyObjectType (type) {
  if (!type || !Array.isArray(type.fields)) {
    return {}
  }

  const fields = {}
  type.fields.forEach((field) => {
    const unwrapped = unwrap(field.type)

    let kind
    if (unwrapped.namedKind === 'OBJECT') {
      kind = unwrapped.wrappers.includes('LIST') ? LIST_OBJECT : OBJECT
    } else if (unwrapped.namedKind === 'INTERFACE') {
      kind = unwrapped.wrappers.includes('LIST') ? LIST_INTERFACE : INTERFACE
    } else {
      kind = unwrapped.wrappers.includes('LIST') ? LIST_SCALAR : SCALAR
    }

    const args = {};
    (field.args || []).forEach((arg) => {
      args[arg.name] = {
        type: buildTypeString(arg.type), //
        description: arg.description,
      }
    })

    fields[field.name] = {
      kind, //
      type: unwrapped.namedName, //
      description: field.description, //
      args,
    }
  })

  return {
    kind: type.kind, //
    fields, //
    possibleTypes: type.possibleTypes
  }
}

/**
 * Build a string representation of a GraphQL type
 * @param type {{ kind: *, name: *, ofType: { kind: *, name: *, ofType: Object} }}
 * @returns {string}
 */
export function buildTypeString (type) {
  if (!type) return '(unknown)' //
  else if (type.kind === 'NON_NULL') {
    return `${buildTypeString(type.ofType)}!`
  } else if (type.kind === 'LIST') {
    return `[${buildTypeString(type.ofType)}]`
  }

  return type.name || '(unknown)'
}

export function makeNode (typeName, typeKind, argsDef) {
  // Preselect required args (types ending with "!")
  const required = Object.entries(argsDef)
    .filter(([, arg]) => arg.type.endsWith('!'))
    .map(([name]) => name)

  return {
    typeName, //
    typeKind, //
    argsDef, //
    vars: new Set(required), //
    scalars: new Set(), //
    children: []
  }
}
