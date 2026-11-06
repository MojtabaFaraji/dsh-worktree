/**
 * Client-side half of the dsh worktree plugin.
 *
 * Registers a worktree picker/switcher into the `conversation.input.left`
 * slot of the chat message box, alongside the command menu button.
 *
 * @module dsh-worktree-plugin/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { WorktreePicker, registerWorktrees } from './WorktreePicker.tsx'

declare module '@deepseek-ai/cordis' {
  interface Events {
    'worktree/changed'(payload: {
      repoRoot: string
      worktrees: any[]
      timestamp: number
    }): void
    /** Client requests a worktree operation. Host executes it. */
    'worktree/execute'(payload: {
      action: 'create' | 'list' | 'switch' | 'remove'
      name: string | undefined
      baseRef: 'fresh' | 'head' | 'branch' | 'pr' | undefined
      branch: string | undefined
      prNumber: number | undefined
      force: boolean | undefined
    }): void
    /** Host returns the result of a worktree operation. */
    'worktree/result'(payload: {
      action: 'create' | 'list' | 'switch' | 'remove'
      success: boolean
      record?: any
      worktrees?: any[]
      name?: string
      error?: string
      timestamp: number
    }): void
  }
}

/** Stable Cordis plugin name. */
export const name = 'dsh-worktree-plugin-client'

/** Services required by the client worktree plugin. */
export const inject = ['slots']

/**
 * Mount the worktree picker into the composer toolbar.
 * @param ctx - Client root context carrying the slot registry.
 */
export function apply(ctx: ClientContext): void {
  const slots = ctx.reflect.get('slots', false)
  if (!slots) return

  // Listen for worktree events from the host to auto-refresh the GUI
  // Wrapped in try-catch because client Cordis context may not support all host APIs
  try {
    ctx.on('worktree/changed', (payload: { repoRoot?: string; worktrees?: any[]; timestamp?: number }) => {
      if (payload?.worktrees) {
        registerWorktrees(payload.worktrees)
      }
    })
  } catch {
    // Event listener unavailable on this client build
  }
  try {
    ctx.on('worktree/result', (payload: { action?: string; success?: boolean; worktrees?: any[]; record?: any; name?: string; error?: string; timestamp?: number }) => {
      if (payload?.worktrees) {
        registerWorktrees(payload.worktrees)
      }
    })
  } catch {
    // Event listener unavailable on this client build
  }

  let activeWorktree: string | undefined = 'main'

  /** Fetch initial worktree list from host on client load. */
  async function refreshWorktreesOnLoad(): Promise<void> {
    try {
      const basePath = '/api/dsh-worktree-plugin'
      const res = await fetch(basePath + '/list')
      const result = await res.json()
      if (result.success && result.worktrees) {
        registerWorktrees(result.worktrees.map((w: { name: string; path: string; branch: string; active?: boolean }) => ({ ...w, active: w.name === activeWorktree })))
      }
    } catch {
      // Host may not be ready yet; list will be fetched on first picker open
    }
  }
  void refreshWorktreesOnLoad()

  slots.inject('conversation.input.left', () => slots.register({
    name: 'conversation.input.left',
    id: 'worktree-picker',
    order: 50,
    label: 'Worktree picker',
  }, (props: { inputActions: { captureInsertion: () => { start: number; end: number; draftRev: number }; insertText: (text: string, span: { start: number; end: number; draftRev: number }) => boolean }; sessionId: string }) => {
    return WorktreePicker({
      inputActions: props.inputActions as unknown as { captureInsertion: () => { start: number; end: number; draftRev: number }; insertText: (text: string, span: { start: number; end: number; draftRev: number }) => boolean },
      sessionId: props.sessionId,
      activeWorktree,
      onAction: async (action, name, baseRef, branch, prNumber, force) => {

        // Client-side slug validation: throw so the picker shows a toast.
        if ((action === 'create' || action === 'switch' || action === 'remove') && name !== undefined) {
          if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
            throw new Error('Invalid worktree name: "' + name + '". Must start with a lowercase letter or digit and contain only lowercase letters, digits, and dashes.')
          }
        }

        const hostUrl = (globalThis as { __DSH_TRANSPORT__?: { streamBaseUrl?: string } }).__DSH_TRANSPORT__?.streamBaseUrl ?? window.location.origin
        const basePath = hostUrl + '/api/dsh-worktree-plugin'
        try {
          switch (action) {
            case 'create': {
              const res = await fetch(basePath + '/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, baseRef, branch, prNumber }),
              })
              const result = await res.json()
              if (!result.success) throw new Error(result.error || 'create failed')
              if (result.record) {
                activeWorktree = result.record.name
                registerWorktrees([{ ...result.record, active: true }])
              }
              break
            }
            case 'list': {
              const res = await fetch(basePath + '/list')
              const result = await res.json()
              if (!result.success) throw new Error(result.error || 'list failed')
              if (result.worktrees) {
                registerWorktrees(result.worktrees.map((w: { name: string; path: string; branch: string; active?: boolean }) => ({ ...w, active: w.name === activeWorktree })))
              }
              break
            }
            case 'switch': {
              const res = await fetch(basePath + '/switch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name }),
              })
              const result = await res.json()
              if (!result.success) throw new Error(result.error || 'switch failed')
              if (result.record) {
                activeWorktree = result.record.name
                registerWorktrees([{ ...result.record, active: true }])
              }
              break
            }
            case 'remove': {
              const res = await fetch(basePath + '/remove', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, force }),
              })
              const result = await res.json()
              if (!result.success) throw new Error(result.error || 'remove failed')
              // If we removed the active worktree, reset to main
              if (activeWorktree === name) {
                activeWorktree = 'main'
              }
              // Remove from local cache
              break
            }
          }
        } catch (error) {
          console.error('dsh-worktree-plugin: action failed:', error)
          throw error
        }
      },
    })
  }), 'dsh-worktree-plugin-client: worktree picker')
}

export default { name, inject, apply }
