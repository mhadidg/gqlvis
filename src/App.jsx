import ScopeEditor from './components/ScopeEditor.jsx'
import React from 'react'
import LocalCache from './local-cache.js'
import buildQuery from './query-builder.js'
import makeNode from './make-node.js'

const { useEffect, useMemo, useRef, useState } = React

const SCALAR = 'SCALAR'
const OBJECT = 'OBJECT'
const LIST_SCALAR = 'LIST_SCALAR' // pseudo-kind
const LIST_OBJECT = 'LIST_OBJECT' // pseudo-kind

async function gqlFetch (url, query, variables) {
  const res = await fetch(url, {
    method: 'POST', //
    headers: { 'content-type': 'application/json' }, //
    body: JSON.stringify({ query, variables }),
  })

  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const json = await res.json()
  if (json.errors) {
    throw new Error(json.errors.map((e) => e.message).join('; '))
  }

  return json.data
}

const INTROSPECT_ROOT = /* GraphQL */ `
  query __Root {
    __schema { queryType { name } }
  }
`

const INTROSPECT_TYPE = /* GraphQL */ `
  query __Type($name: String!) {
    __type(name: $name) {
      kind
      name
      fields(includeDeprecated: false) {
        name
        description
        type { kind name ofType { kind name ofType { kind name ofType { kind name } } } }
        args {
          name
          description
          type { kind name ofType { kind name ofType { kind name ofType { kind name } } } }
        }
      }
    }
  }
`

// Unwrap a GraphQL type to its base type
// Returns { namedKind, namedName, wrappers: ["NON_NULL"|"LIST", ...] }
function unwrap (type) {
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
function simplifyObjectType (__type) {
  if (!__type || __type.kind !== 'OBJECT' || !Array.isArray(__type.fields)) {
    return null
  }

  const fields = {}
  __type.fields.forEach((field) => {
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

function buildTypeString (type) {
  if (!type) return '(unknown)' //
  else if (type.kind === 'NON_NULL') { // noinspection JSUnresolvedReference
    return `${buildTypeString(type.ofType)}!`
  } else if (type.kind === 'LIST') { // noinspection JSUnresolvedReference
    return `[${buildTypeString(type.ofType)}]`
  }

  return type.name || '(unknown)'
}

function useIntrospection (endpoint) {
  const [queryRootName, setQueryRootName] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  // Backed by localStorage
  const CACHE_TTL = 24 * 60 * 60 * 1000
  const typeCache = useRef(new LocalCache(`types:${endpoint}`))

  useEffect(() => {
    typeCache.current = new LocalCache(`types:${endpoint}`)
  }, [endpoint])

  const loadRoot = async () => {
    setError(null)
    setLoading(true)

    try {
      let name = typeCache.current.get('rootName')
      if (!name) {
        const data = await gqlFetch(endpoint, INTROSPECT_ROOT)
        // noinspection JSUnresolvedReference
        name = data?.__schema?.queryType?.name // root object, typically "Query"
        if (!name) { // noinspection ExceptionCaughtLocallyJS
          throw new Error('No queryType name in schema')
        }

        typeCache.current.set('rootName', name, CACHE_TTL)
      }

      setQueryRootName(name)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const loadType = async (name) => {
    if (typeCache.current.has(name)) {
      return typeCache.current.get(name)
    }

    const data = await gqlFetch(endpoint, INTROSPECT_TYPE, { name })
    // noinspection JSUnresolvedReference
    const simplified = simplifyObjectType(data?.__type)
    if (simplified) {
      typeCache.current.set(name, simplified, CACHE_TTL)
    }

    return simplified
  }

  const getType = (name) => typeCache.current.get(name)

  return { queryRootName, loadRoot, loadType, getType, loading, error }
}

function App () {
  const [endpoint, setEndpoint] = useState('https://countries.trevorblades.com/')
  const { queryRootName, loadRoot, loadType, getType, loading, error } = useIntrospection(endpoint)

  const [rootField, setRootField] = useState('')
  const [selection, setSelection] = useState(null)

  useEffect(() => {
    (async () => {
      await loadRoot()
    })()
  }, [endpoint]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    (async () => {
      if (!queryRootName) return

      const rootType = await loadType(queryRootName)
      if (!rootType) return

      const rootFields = Object.keys(rootType.fields || {})
      const rootField = rootFields[0]
      setRootField(rootField)
    })()
  }, [queryRootName]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!rootField) return

    const rootType = getType(queryRootName)
    if (!rootType) return

    const rootDef = rootType.fields[rootField]
    if (rootDef) setSelection(makeNode(rootDef.type, rootDef.args || {}))
  }, [rootField]) // eslint-disable-line react-hooks/exhaustive-deps

  const graphQL = useMemo(() => {
    if (!selection) return ''
    return buildQuery(rootField, selection, getType)
  }, [selection]) // eslint-disable-line react-hooks/exhaustive-deps

  return ( //
    <div className="mx-auto max-w-4xl p-4 text-gray-900">
      <h1 className="mb-3 text-2xl font-semibold">GraphQL Visual Builder</h1>

      {/* Endpoint */}
      <div className="mb-4 rounded-xl border bg-white p-3">
        <div className="mb-2 text-sm">GraphQL Endpoint</div>
        <input
          className="w-full rounded border px-2 py-1 text-sm"
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
          placeholder="https://your.graphql.endpoint/"/>

        {loading && <div className="mt-2 text-xs text-gray-400">Loading schema…</div>}
        {error && <div className="mt-2 text-xs text-red-600">{String(error)}</div>}
      </div>

      {/* Root chooser & scope */}
      {queryRootName && getType(queryRootName) && (//
        <div className="mb-4 rounded-xl border bg-white p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-sm">Root field:</span>
            <select
              className="rounded border px-2 py-1 text-sm"
              value={rootField}
              onChange={(e) => setRootField(e.target.value)}>

              {Object.keys(getType(queryRootName).fields).map( //
                (field) => (<option key={field} value={field}>{field}</option>)) //
              }
            </select>

            <span className="text-xs text-gray-500">(Query type: {queryRootName})</span>
          </div>

          {selection ? //
            (<ScopeEditor
                loadType={loadType}
                typeName={selection?.typeName}
                node={selection}
                onChange={setSelection}/> //
            ) : ( //
              <div className="text-xs text-gray-400">Select a root field to begin.</div> //
            )}
        </div>)}

      {/* Output */}
      <div className="mb-4 rounded-xl border bg-white p-3">
        <div className="mb-2 text-sm">Query</div>
        <pre
          className="max-h-96 overflow-auto whitespace-pre-wrap rounded bg-gray-50 p-3 text-xs leading-relaxed">{graphQL}</pre>
      </div>
    </div>)
}

export default App
