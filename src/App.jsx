/* eslint-disable react-hooks/exhaustive-deps */

import ScopeEditor from './components/ScopeEditor.jsx'
import React from 'react'
import LocalCache from './local-cache.js'
import { gqlFetch, makeNode, OBJECT, simplifyObjectType } from './utils.js'
import buildQuery from './gql-builder.js'

const { useEffect, useMemo, useRef, useState } = React

const DEFAULT_URL = 'https://countries.trevorblades.com/'

const INTROSPECT_ROOT = `
  query {
    __schema { queryType { name } }
  }
`

const INTROSPECT_TYPE = `
  query ($name: String!) {
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
      possibleTypes {
        kind
        name
      }
    }
  }
`

function useIntrospection (endpoint) {
  const [queryRootName, setQueryRootName] = useState({})
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  // Backed by localStorage
  const CACHE_TTL = 24 * 60 * 60 * 1000
  const typeCache = useRef(null)

  const loadRoot = async () => {
    setError(null)
    setLoading(true)

    try {
      const cacheUrl = new URL(endpoint)
      cacheUrl.username = ''
      cacheUrl.password = ''
      typeCache.current = new LocalCache(`types:${cacheUrl.toString()}`)

      let name = typeCache.current.get('rootName')
      if (!name) {
        /** @type {{ __schema: { queryType: { name: string }}}} */
        const data = await gqlFetch(endpoint, INTROSPECT_ROOT)

        // root query type, typically "Query"
        name = data.__schema.queryType.name
        if (!name) throw new Error('No queryType name in schema')

        typeCache.current.set('rootName', name, CACHE_TTL)
      }

      setQueryRootName({ name, endpoint })
    } catch (e) {
      setQueryRootName({})
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const loadType = async (name) => {
    if (typeCache.current.has(name)) {
      return typeCache.current.get(name)
    }

    /** @type {{ __type: Object }} */
    const data = await gqlFetch(endpoint, INTROSPECT_TYPE, { name })
    const simplified = simplifyObjectType(data?.__type)
    if (simplified) typeCache.current.set(name, simplified, CACHE_TTL)

    return simplified
  }

  const getType = (name) => typeCache.current?.get(name)

  return { queryRootName, loadRoot, loadType, getType, loading, error }
}

function App () {
  const [endpoint, setEndpoint] = useState(DEFAULT_URL)
  const { queryRootName, loadRoot, loadType, getType, loading, error } = useIntrospection(endpoint)

  const [rootField, setRootField] = useState('')
  const [selection, setSelection] = useState(null)

  const selectableRootFields = (type) => {
    const TypeDef = getType(type)
    return Object.keys(TypeDef.fields)
      .filter((field) => TypeDef.fields[field].kind.includes(OBJECT))
  }

  useEffect(() => {
    (async () => {
      if (!queryRootName.name) return

      const rootType = await loadType(queryRootName.name)
      if (!rootType) return

      const rootFields = selectableRootFields(queryRootName.name)
      if (!rootFields.length) return

      const rootField = rootFields[0]
      setRootField(rootField)
    })()
  }, [queryRootName])

  useEffect(() => {
    if (!rootField) return

    const rootType = getType(queryRootName.name)
    if (!rootType) return

    const field = rootType.fields[rootField]
    if (field) setSelection(makeNode(field.type, field.kind, field.args))
  }, [rootField])

  const graphQL = useMemo(() => {
    if (!selection || error) return ''
    return buildQuery(rootField, selection)
  }, [selection, error])

  return ( //
    <div className="mx-auto max-w-4xl p-4 text-gray-900">
      <h1 className="mb-3 text-2xl font-semibold">GraphQL Visual Builder</h1>

      {/* Endpoint */}
      <div className="mb-4 rounded-xl border bg-white p-3">
        <div className="mb-2 text-sm">GraphQL Endpoint</div>
        <div className="flex gap-2">
          <input
            className="w-full rounded border px-2 py-1 text-sm"
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            placeholder="https://your.graphql.endpoint/"/>

          <button
            type="button"
            className="rounded border px-3 py-1 text-sm w-32 bg-gray-400 text-white font-medium disabled:opacity-50"
            onClick={() => loadRoot()}
            disabled={loading}
          >
            {loading ? 'Introspecting…' : 'Introspect'}
          </button>
        </div>

        <div className="mt-2 text-xs text-gray-500">
          You can pass auth info in the URL:<br/>
          - Basic auth: <span className="font-mono">https://user:pass@example.com/graphql</span><br/>
          - Bearer token: <span className="font-mono">https://bearer:TOKEN@example.com/graphql</span>
        </div>

        <div className="mt-1 text-xs text-gray-500">
          ⚠️ Your URL (including auth info) never leaves your browser.
          The app runs client-side only and doesn’t transmit data anywhere external.
        </div>

        {loading && <div className="mt-2 text-xs text-gray-400">Loading schema…</div>}
        {error && <div className="mt-2 text-xs text-red-600">{String(error)}</div>}
      </div>

      {/* Root chooser & scope */}
      {queryRootName.name && getType(queryRootName.name) && (//
        <div className="mb-4 rounded-xl border bg-white p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-sm">Root field:</span>
            <select
              className="rounded border px-2 py-1 text-sm"
              value={rootField}
              onChange={(e) => setRootField(e.target.value)}>

              {selectableRootFields(queryRootName.name) //
                .map((field) => (<option key={field} value={field}>{field}</option>)) //
              }
            </select>

            <span className="text-xs text-gray-500">(Operation type: {queryRootName.name})</span>
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
      {graphQL && ( //
        <div className="mb-4 rounded-xl border bg-white p-3">
          <div className="mb-2 text-sm">Query</div>
          <pre
            className="max-h-96 overflow-auto whitespace-pre-wrap rounded bg-gray-50 p-3 text-xs leading-relaxed">{graphQL}</pre>
        </div>)}
    </div>)
}

export default App
