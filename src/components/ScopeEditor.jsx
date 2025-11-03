import { useEffect, useState } from 'react'
import SearchAdd from './SearchAdd.jsx'
import makeNode from '../make-node.js'

function clone (node) {
  return {
    typeName: node.typeName,
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
  const added = new Set(node.children.map((c) => c.field))

  useEffect(() => {
    (async () => {
      setType(await loadType(typeName))
    })()
  }, [typeName]) // eslint-disable-line react-hooks/exhaustive-deps

  // noinspection JSUnresolvedReference
  if (!type || !type.fields) {
    return <div className="mt-3 text-xs text-gray-400">Loading {typeName}…</div>
  }

  const scalarFields = //
    Object.entries(type.fields)
      .filter(([, field]) => field.kind.includes('SCALAR'))
      .map(([name, field]) => ({ name, description: field.description }))

  const objectFields = //
    Object.entries(type.fields)
      .filter(([, field]) => field.kind.includes('OBJECT'))
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

  const addVar = (vari) => {
    const next = clone(node)
    next.vars.add(vari)
    onChange(next)
  }

  const remVar = (vari) => {
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
    if (added.has(fieldName)) return

    const fieldDef = type.fields[fieldName]
    if (!fieldDef) return

    await loadType(fieldDef.type) // load child type
    const next = clone(node)
    const childArgsDef = fieldDef.args || {}

    next.children = [...next.children, {
      field: fieldName, kind: fieldDef.kind, node: makeNode(fieldDef.type, childArgsDef)
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

      {/* Variables */}
      <div className="mt-2">
        <div className="text-sm mb-1">Variables</div>
        <SearchAdd placeholder="Type to search" options={argOptions} selected={node.vars} onSelect={addVar}/>

        <div className="mt-2 flex flex-wrap gap-2">
          {Array.from(node.vars).map((vari) => ( //
            <Chip key={vari} onRemove={() => remVar(vari)}>{vari}</Chip> //
          ))}
        </div>
      </div>

      {/* Include fields */}
      <div className="mt-3">
        <div className="text-sm mb-1">Include Fields</div>
        <SearchAdd placeholder="Type to search" options={scalarFields} selected={node.scalars} onSelect={addField}/>

        <div className="mt-2 flex flex-wrap gap-2">
          {Array.from(node.scalars).map((field) => ( //
            <Chip key={field} onRemove={() => remField(field)}>{field}</Chip> //
          ))}
        </div>
      </div>

      {/* Traverse */}
      <div className="mt-3">
        <div className="text-sm">Traverse</div>
        <div className="mt-1 flex flex-wrap gap-2">
          {objectFields.map((of) => { //
            const isDisabled = added.has(of.name)
            return ( //
              <button
                key={of.name}
                disabled={isDisabled}
                className={`rounded-full border px-2 py-1 text-sm ` + (isDisabled ? 'bg-gray-50' : 'hover:bg-gray-50')}
                onClick={() => addChild(of.name)}
              >+ {of.name}</button>)
          })}

          {!objectFields.length && <span className="text-xs text-gray-400">(no object/list fields)</span>}
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
