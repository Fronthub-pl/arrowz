// Mock localStorage for node tests. The browser environment gets the real
// localStorage from vitest-browser-react setup (vitest.setup.ts), and node
// tests use this polyfill.
if (typeof global.localStorage === 'undefined') {
  const store = new Map<string, string>()
  global.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => {
      const keys = [...store.keys()]
      return keys[index] ?? null
    },
    get length() {
      return store.size
    },
  } as Storage
}
