const GITHUB_GRAPHQL = 'https://api.github.com/graphql'
const KV_CACHE_TTL = 24 * 60 * 60 // 24h in seconds
const KV_NAMESPACE = 'v1' // bump to invalidate cache

async function sha256Hex (str) {
  const uInt8 = new TextEncoder().encode(str)
  const arrBuf = await crypto.subtle.digest('SHA-256', uInt8)
  return [...new Uint8Array(arrBuf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

function cors (headers = {}) {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'POST, OPTIONS', //
    ...headers,
  }
}

export default {
  async fetch (request, env, ctx) {
    if (request.method === 'OPTIONS') { // CORS preflight
      return new Response(null, { headers: cors() })
    }

    if (request.method !== 'POST') {
      return new Response('Use POST /graphql', { status: 405, headers: cors() })
    }

    const { pathname } = new URL(request.url)
    if (pathname !== '/graphql') {
      return new Response(null, { status: 404, headers: cors() })
    }

    let body
    try {
      body = await request.json() //
    } catch {
      return new Response('Invalid JSON', { status: 400, headers: cors() })
    }

    const { query, variables } = body || {}
    if (typeof query !== 'string') {
      return new Response('"query" must be a string', { status: 400, headers: cors() })
    }

    // Hash raw query & JSON variables (unnormalized)
    const digest = await sha256Hex(query + '\n' + JSON.stringify(variables ?? {}))
    const key = `${KV_NAMESPACE}:${digest}`

    const hit = await env.KV.get(key, { type: 'stream' })
    if (hit) {
      return new Response(hit, {
        status: 200, //
        headers: cors({
          'content-type': 'application/json; charset=utf-8', //
          'x-cache': 'hit' //
        })
      })
    }

    const res = await fetch(GITHUB_GRAPHQL, {
      method: 'POST', //
      body: JSON.stringify({ query, variables }), //
      headers: {
        'content-type': 'application/json',
        'user-agent': 'gqlvis/0.1 (+https://github.com/mhadidg/gqlvis)',
        'authorization': `Bearer ${env.GITHUB_TOKEN}`,
      },
    })

    const [toClient, toKV] = res.body.tee()
    ctx.waitUntil(env.KV.put(key, toKV, { expirationTtl: KV_CACHE_TTL }))
    return new Response(toClient, {
      status: res.status, //
      headers: cors({
        'content-type': res.headers.get('content-type'), //
        'x-cache': 'miss'
      }),
    })
  }
}
