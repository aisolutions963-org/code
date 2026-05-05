import NodeCache from 'node-cache'

const cache = new NodeCache({ stdTTL: 30, checkperiod: 60 })

export function getCached<T>(key: string): T | undefined {
  return cache.get<T>(key)
}

export function setCached<T>(key: string, value: T, ttl?: number): void {
  cache.set(key, value, ttl ?? 30)
}

export function invalidateCache(pattern: string): void {
  const keys = cache.keys().filter((k) => k.includes(pattern))
  keys.forEach((k) => cache.del(k))
}

export function flushCache(): void {
  cache.flushAll()
}
