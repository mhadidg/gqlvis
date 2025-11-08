/* eslint-disable react-hooks/exhaustive-deps */

import { useEffect, useState } from 'react'
import SearchAdd from './SearchAdd.jsx'
import { INLINE_FRAGMENT, INTERFACE, makeNode, OBJECT, SCALAR } from '../utils.js'

function clone (node) {
  return {
    typeName: node.typeName,
    typeKind: node.typeKind,
    argsDef: { ...node.argsDef },
    vars: new Set(node.vars),
    scalars: new Set(node.scalars),
    children: node.children.map((child) => ({
      field: child.field, //
      kind: child.kind, //
      node: clone(child.node)
    })),
  }
}

function Chip ({ children, onRemove }) {
  return ( //
    <span className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-sm bg-gray-50">
      {children}
      {onRemove && ( //
        <button onClick={onRemove} className="ml-1 rounded-full px-1 hover:bg-gray-100">×</button> //
      )}
    </span>)
}

function ScopeEditor ({ loadType, typeName, node, onChange, onRemove }) {
  const [type, setType] = useState()
  const addedChildren = new Set(node.children.filter((c) => c.kind !== INLINE_FRAGMENT).map((c) => c.field))
  const addedFragments = new Set(node.children.filter((c) => c.kind === INLINE_FRAGMENT).map((c) => c.field))
  const [showAllObjects, setShowAllObjects] = useState(false)

  useEffect(() => { setShowAllObjects(false) }, [typeName])

  useEffect(() => {
    (async () => {
      setType(await loadType(typeName))
    })()
  }, [typeName])

  if (!type || !type?.fields) {
    return <div className="mt-3 text-xs text-gray-400">Loading {typeName}…</div>
  }

  const scalarFields = //
    Object.entries(type.fields)
      .filter(([, field]) => field.kind.includes(SCALAR))
      .map(([name, field]) => ({ name, description: field.description }))

  const objectFields = //
    Object.entries(type.fields)
      .filter(([, field]) => field.kind.includes(OBJECT) || field.kind.includes(INTERFACE))
      .map(([name, field]) => ({
        name, //
        kind: field.kind, //
        type: field.type, //
        args: field.args || {}, //
        description: field.description
      }))

  const argOptions = //
    Object.entries(node.argsDef || {})
      .map(([name, arg]) => ({ name, description: arg.description }))

  const visibleObjectFields = showAllObjects ? objectFields : objectFields.slice(0, 4)
  const hiddenCount = Math.max(0, objectFields.length - 4)

  const addVar = (vari) => {
    const next = clone(node)
    next.vars.add(vari)
    onChange(next)
  }

  const isRequiredArg = (node, name) => {
    return node.argsDef[name]?.type?.endsWith('!') === true
  }

  const remVar = (vari) => {
    if (isRequiredArg(node, vari)) return
    const next = clone(node)
    next.vars.delete(vari)
    onChange(next)
  }

  const addField = (field) => {
    const next = clone(node)
    next.scalars.add(field)
    onChange(next)
  }

  const remField = (field) => {
    const next = clone(node)
    next.scalars.delete(field)
    onChange(next)
  }

  const addChild = async (fieldName) => {
    const fieldDef = type.fields[fieldName]
    if (!fieldDef) throw new Error(`Field ${fieldName} not found in ${typeName}`)

    const argsDef = fieldDef.args || {}
    const next = clone(node)

    next.children = [...next.children, {
      field: fieldName, //
      kind: fieldDef.kind, //
      node: makeNode(fieldDef.type, fieldDef.kind, argsDef) //
    }]

    onChange(next)
  }

  const updateChild = (idx, newNode) => {
    const next = clone(node)
    next.children = //
      next.children.map( //
        (child, i) => (i === idx ? { ...child, node: newNode } : child))

    onChange(next)
  }

  const removeChild = (idx) => {
    const next = clone(node)
    next.children = next.children.filter((_, i) => i !== idx)
    onChange(next)
  }

  const addFragment = async (fragment) => {
    const next = clone(node)

    next.children = [...next.children, {
      field: fragment.name, //
      kind: INLINE_FRAGMENT, //
      node: makeNode(fragment.name, fragment.kind, {}),
    }]

    onChange(next)
  }

  return ( //
    <div className="mt-3 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">
          In <span className="font-mono font-semibold">{typeName}</span>
        </div>

        {typeof onRemove === 'function' && ( //
          <button
            onClick={onRemove}
            className="rounded-full px-2 py-1 text-xs hover:bg-gray-50"
            aria-label="Remove scope"
            title="Remove">
            remove
          </button>)}
      </div>

      {/* Arguments */}
      <div className="mt-3">
        <div className="text-sm mb-1">Arguments</div>
        <SearchAdd placeholder="Type to search" options={argOptions} selected={node.vars} onSelect={addVar}/>

        {node.vars.size > 0 && ( //
          <div className="mt-2 flex flex-wrap gap-2">
            {Array.from(node.vars).map((vari) => {
              const required = isRequiredArg(node, vari)
              return ( //
                <Chip key={vari} onRemove={required ? undefined : () => remVar(vari)}>
                  {vari}
                  {required && <span className="ml-1 text-[10px] text-gray-500" title="Required">req</span>}
                </Chip>)
            })}
          </div>)}
      </div>

      {/* Scalar fields */}
      <div className="mt-3">
        <div className="text-sm mb-1">Scalar fields</div>
        <SearchAdd placeholder="Type to search" options={scalarFields} selected={node.scalars} onSelect={addField}/>

        {node.scalars.size > 0 && ( //
          <div className="mt-2 flex flex-wrap gap-2">
            {Array.from(node.scalars).map((field) => ( //
              <Chip key={field} onRemove={() => remField(field)}>{field}</Chip> //
            ))}
          </div>)}
      </div>

      {/* Inline fragments */}
      {type.possibleTypes?.length && (<div className="mt-3">
        <div className="text-sm">Inline fragments</div>
        <div className="mt-1 flex flex-wrap gap-2">
          {type.possibleTypes?.map((fragment) => {
            const isDisabled = addedFragments.has(fragment.name)
            return ( //
              <button
                key={fragment.name}
                disabled={isDisabled}
                className={`rounded-full border px-2 py-1 text-sm ` + (isDisabled ? 'bg-gray-50' : 'hover:bg-gray-50')}
                onClick={() => addFragment(fragment)}
              >+ {fragment.name}</button>)
          })}
        </div>
      </div>)}

      {/* Object fields */}
      <div className="mt-3">
        <div className="text-sm">Object fields</div>
        <div className="mt-1 flex flex-wrap gap-2">
          {visibleObjectFields.map((of) => { //
            const isDisabled = addedChildren.has(of.name)
            return ( //
              <button
                key={of.name}
                disabled={isDisabled}
                className={`rounded-full border px-2 py-1 text-sm ` + (isDisabled ? 'bg-gray-50' : 'hover:bg-gray-50')}
                onClick={() => addChild(of.name)}
              >+ {of.name}</button>)
          })}

          {hiddenCount > 0 && (
            <button
              className="text-sm text-gray-600 underline underline-offset-3"
              onClick={() => setShowAllObjects(v => !v)}
              aria-expanded={showAllObjects}
              title={showAllObjects ? 'Collapse list' : 'Expand list'}
            >
              {showAllObjects ? 'show fewer' : `show more (${hiddenCount})`}
            </button>
          )}

          {!objectFields.length && <span className="text-sm text-gray-400">(no object fields)</span>}
        </div>


      </div>

      {!!node.children.length && ( //
        <div className="mt-3 space-y-3">
          {node.children.map((child, i) => ( //
            <ScopeEditor
              loadType={loadType}
              typeName={child.node.typeName}
              node={child.node}
              onChange={(nn) => updateChild(i, nn)}
              onRemove={() => removeChild(i)}/>))}
        </div>)}
    </div>)
}

export default ScopeEditor
