export const SCALAR = 'SCALAR'
export const OBJECT = 'OBJECT'
export const LIST_SCALAR = 'LIST_SCALAR' // pseudo-kind
export const LIST_OBJECT = 'LIST_OBJECT' // pseudo-kind

export async function gqlFetch (url, query, variables) {
  const urlObj = new URL(url)
  const headers = { 'content-type': 'application/json' }

  if (urlObj.username) {
    if (urlObj.username.toLowerCase() === 'bearer') {
      headers.Authorization = `Bearer ${urlObj.password}`
    } else {
      const basic = btoa(`${urlObj.username}:${urlObj.password}`)
      headers.Authorization = `Basic ${basic}`
    }

    // Clear username/password from URL
    urlObj.username = ''
    urlObj.password = ''
  }

  const res = await fetch(urlObj.toString(), {
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

// Unwrap a GraphQL type to its base type
// Returns { namedKind, namedName, wrappers: ["NON_NULL"|"LIST", ...] }
export function unwrap (type) {
  const wrappers = []
  let cur = type
  while (cur && (cur.kind === 'NON_NULL' || cur.kind === 'LIST')) {
    wrappers.push(cur.kind)
    // noinspection JSUnresolvedReference
    cur = cur.ofType
  }

  return {
    namedKind: cur?.kind, //
    namedName: cur?.name, //
    wrappers
  }
}

// Build a simplified shape for a type
//
// {
//   kind: 'OBJECT',
//   fields: {
//     {name}: {
//       kind: 'SCALAR', // or 'OBJECT' or 'LIST_OBJECT'
//       type: 'String', // depends on kind (scalar or object)
//       description: String, // short desc of the field
//       args: {
//         {name}: {
//           type: 'String', // or any other scalar types
//           description: String, // short desc of the argument
//         }
//       }
//     }
//   }
// }
//
export function simplifyObjectType (type) {
  if (!type || type.kind !== 'OBJECT' || !Array.isArray(type.fields)) {
    return null
  }

  const fields = {}
  type.fields.forEach((field) => {
    const unwrapped = unwrap(field.type)

    let kind
    if (unwrapped.namedKind === 'OBJECT') {
      kind = unwrapped.wrappers.includes('LIST') ? LIST_OBJECT : OBJECT
    } else {
      kind = unwrapped.wrappers.includes('LIST') ? LIST_SCALAR : SCALAR
    }

    const args = {};
    (field.args || []).forEach((arg) => {
      args[arg.name] = {
        type: buildTypeString(arg.type), //
        description: arg.description
      }
    })

    fields[field.name] = {
      kind, //
      type: unwrapped.namedName, //
      description: field.description, //
      args,
    }
  })

  return { kind: OBJECT, fields }
}

export function buildTypeString (type) {
  if (!type) return '(unknown)' //
  else if (type.kind === 'NON_NULL') { // noinspection JSUnresolvedReference
    return `${buildTypeString(type.ofType)}!`
  } else if (type.kind === 'LIST') { // noinspection JSUnresolvedReference
    return `[${buildTypeString(type.ofType)}]`
  }

  return type.name || '(unknown)'
}

export function makeNode (typeName, argsDef = {}) {
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
