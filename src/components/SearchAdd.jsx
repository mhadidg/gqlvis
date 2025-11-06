import { useEffect, useState } from 'react'

function SearchAdd ({ placeholder, options, selected, onSelect }) {
  const [query, setQuery] = useState('')
  const [focused, setFocus] = useState(false)

  const matches = options.filter(function (opt) {
    const nameMatches = opt.name.toLowerCase().includes(query.toLowerCase())
    const descMatches = (opt.description || '').toLowerCase().includes(query.toLowerCase())
    return !selected.has(opt.name) && (nameMatches || descMatches)
  })

  const shouldBeDisabled = (query === '' && matches.length === 0)

  // Reset focus when input is disabled`
  // Specifically for "None left to select"
  useEffect(() => {
    if (shouldBeDisabled) setFocus(false)
  }, [shouldBeDisabled])

  return ( //
    <div>
      <input
        className={'w-full rounded border px-2 py-1 text-sm' + (shouldBeDisabled ? ' bg-gray-50' : '')}
        value={query}
        placeholder={shouldBeDisabled ? (selected.size > 0 ? 'None left to select' : 'None to select') : placeholder}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        disabled={shouldBeDisabled}
      />

      {(query || focused) && matches.length > 0 && ( //
        <div className="mt-1 rounded border bg-white">
          {matches.slice(0, query === '' ? 5 : 10).map((match) => ( //
            <div
              className="cursor-pointer px-2 py-1 text-sm hover:bg-gray-50"
              key={match.name}
              // NOTE: onClick doesn't work as the input's onBlur
              // event takes precedence canceling the selection
              onMouseDown={() => {
                onSelect(match.name)
                setQuery('') // reset input
              }}
            >{match.name}</div> //
          ))}
        </div>)}
    </div>)
}

export default SearchAdd
