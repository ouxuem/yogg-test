'use client'

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import { MOTION_MAX_ACTIVE_GROUPS } from './tokens'

const activeGroupIds = new Set<string>()
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach(listener => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot() {
  return activeGroupIds.size
}

export function acquireMotionGroup(groupId: string) {
  if (activeGroupIds.has(groupId))
    return true
  if (activeGroupIds.size >= MOTION_MAX_ACTIVE_GROUPS)
    return false
  activeGroupIds.add(groupId)
  notify()
  return true
}

export function releaseMotionGroup(groupId: string) {
  if (!activeGroupIds.delete(groupId))
    return
  notify()
}

export function useActiveMotionGroupCount() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function useMotionGroupGate(groupId: string) {
  const acquiredRef = useRef(false)

  const tryAcquire = useCallback(() => {
    if (acquiredRef.current)
      return true
    const allowed = acquireMotionGroup(groupId)
    if (allowed)
      acquiredRef.current = true
    return allowed
  }, [groupId])

  const release = useCallback(() => {
    if (!acquiredRef.current)
      return
    acquiredRef.current = false
    releaseMotionGroup(groupId)
  }, [groupId])

  useEffect(() => {
    return () => {
      if (acquiredRef.current)
        releaseMotionGroup(groupId)
    }
  }, [groupId])

  return { tryAcquire, release }
}
