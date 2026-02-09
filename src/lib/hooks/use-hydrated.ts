import { useSyncExternalStore } from 'react'

function subscribeOnce(callback: () => void) {
  if (typeof window === 'undefined')
    return () => {}

  const id = window.setTimeout(callback, 0)
  return () => window.clearTimeout(id)
}

function getClientSnapshot() {
  return true
}

function getServerSnapshot() {
  return false
}

export function useHydrated() {
  return useSyncExternalStore(subscribeOnce, getClientSnapshot, getServerSnapshot)
}
