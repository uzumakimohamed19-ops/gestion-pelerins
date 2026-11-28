export const OFFLINE_WRITE_BLOCKED_EVENT = 'agencepro:offline-write-blocked'
export const NETWORK_FAILURE_EVENT = 'agencepro:network-failure'

export class OfflineWriteBlockedError extends Error {
  readonly isOfflineBlocked = true

  constructor(
    message = 'Mode hors ligne : connectez-vous à Internet pour enregistrer.'
  ) {
    super(message)
    this.name = 'OfflineWriteBlockedError'
  }
}

let verifiedOfflineFlag = false

export function setVerifiedOfflineState(offline: boolean): void {
  verifiedOfflineFlag = offline
  if (typeof document !== 'undefined') {
    if (offline) {
      document.documentElement.setAttribute('data-offline', 'true')
    } else {
      document.documentElement.removeAttribute('data-offline')
    }
  }
}

export function isAppOffline(): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return true
  }
  return verifiedOfflineFlag
}

export function notifyOfflineWriteBlocked(customMessage?: string): void {
  if (typeof window === 'undefined') return
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(35)
    }
  } catch {}
  window.dispatchEvent(
    new CustomEvent(OFFLINE_WRITE_BLOCKED_EVENT, {
      detail: { message: customMessage || 'Connectez-vous pour enregistrer' },
    })
  )
}

export function notifyNetworkFailure(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(NETWORK_FAILURE_EVENT))
}

export function assertOnlineOrNotify(customMessage?: string): boolean {
  if (isAppOffline()) {
    notifyOfflineWriteBlocked(customMessage)
    return false
  }
  return true
}
