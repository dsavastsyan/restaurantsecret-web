// Serialize client-side state used in cache keys and structured data without
// allowing an accidental DOM/React reference to crash the render tree.
export function safeJsonStringify(value) {
  const seen = new WeakSet()

  return JSON.stringify(value, (_key, nextValue) => {
    if (typeof Element !== 'undefined' && nextValue instanceof Element) {
      return `[DOM:${nextValue.tagName.toLowerCase()}]`
    }

    if (nextValue && typeof nextValue === 'object') {
      if (seen.has(nextValue)) return '[Circular]'
      seen.add(nextValue)
    }

    return nextValue
  })
}
