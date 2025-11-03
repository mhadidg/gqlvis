class LocalCache {
  constructor (prefix) {
    this.prefix = prefix
    this.storage = window.localStorage
  }

  _key (key) {
    return `${this.prefix}:${key}`
  }

  has (key) {
    return this.get(key) !== undefined
  }

  get (key) {
    try {
      const raw = this.storage.getItem(this._key(key))
      if (!raw) return undefined

      const payload = JSON.parse(raw)
      const expires = payload.expires
      if (expires && Date.now() > expires) {
        this.storage.removeItem(this._key(key))
        return undefined
      }

      return payload.value
    } catch {
      return undefined
    }
  }

  set (key, value, ttlMs) {
    if (typeof ttlMs !== 'number') {
      throw new Error('ttlMs must be a number')
    }

    const payload = {
      value: value, //
      expires: (Date.now() + ttlMs)
    }

    this.storage.setItem(this._key(key), JSON.stringify(payload))
  }
}

export default LocalCache

