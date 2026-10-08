export const isServiceUnavailableError = (error) => {
  if (!error) return false
  if (error.kind === 'timeout' || error.kind === 'network' || error.kind === 'server') return true
  if (Number(error.status) >= 500) return true
  return error.name === 'AbortError'
}
