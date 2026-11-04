/**
 * Client-side half of the dsh worktree plugin.
 *
 * Registers a worktree picker/switcher into the `conversation.input.left`
 * slot of the chat message box, alongside the command menu button.
 *
 * @module @deepseek-ai/dsh-worktree/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { WorktreePicker } from './WorktreePicker.tsx'

/** Stable Cordis plugin name. */
export const name = 'dsh-worktree-client'

/** Services required by the client worktree plugin. */
export const inject = ['slots']

/**
 * Mount the worktree picker into the composer toolbar.
 * @param ctx - Client root context carrying the slot registry.
 */
export function apply(ctx: ClientContext): void {
  const slots = ctx.reflect.get('slots', false)
  if (!slots) return
  slots.inject('conversation.input.left', () => slots.register({
    name: 'conversation.input.left',
    id: 'worktree-picker',
    order: 50,
    label: 'Worktree picker',
  }, (props: { inputActions: { captureInsertion: () => { start: number; end: number; draftRev: number }; insertText: (text: string, span: { start: number; end: number; draftRev: number }) => boolean }; sessionId: string }) => {
    return WorktreePicker({
      inputActions: props.inputActions as unknown as { captureInsertion: () => { start: number; end: number; draftRev: number }; insertText: (text: string, span: { start: number; end: number; draftRev: number }) => boolean },
      sessionId: props.sessionId,
    })
  }), 'dsh-worktree-client: worktree picker')
}

export default { name, inject, apply }
