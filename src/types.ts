/**
 * Shared types for the dsh worktree plugin. The Cordis `Context` augmentation
 * lives here so `ctx.worktree` is typed at every call site.
 *
 * @module dsh-worktree-plugin/types
 */

import type { WorktreeService } from './worktree-service.ts'

/** Supported base references for worktree creation. */
export type WorktreeBaseRef = 'fresh' | 'head' | 'branch' | 'pr'

/** A persisted in-memory description of one worktree. */
export interface WorktreeRecord {
  /** Worktree slug. */
  name: string
  /** Absolute filesystem path of the worktree. */
  path: string
  /** Branch checked out in the worktree. */
  branch: string
  /** Creation mode used to create it. */
  baseRef: WorktreeBaseRef
  /** Creation timestamp. */
  createdAt: number
}

/** Input fields for worktree creation. */
export interface CreateWorktreeOptions {
  name?: string | undefined
  baseRef?: WorktreeBaseRef
  branch?: string | undefined
  prNumber?: number | undefined
  repoRoot?: string
}

/** Plugin configuration. */
export interface WorktreeConfig {
  root?: string
  baseRef?: WorktreeBaseRef
  autoCreate?: boolean
  name?: string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    worktree: WorktreeService
  }
  interface Events {
    /** Worktree collection changed (create, remove, prune, list). Payload carries the updated worktree list. */
    'worktree/changed'(payload: {
      repoRoot: string
      worktrees: WorktreeRecord[]
      timestamp: number
    }): void
    /** Client requests a worktree operation (create, list, switch, remove). Host executes it. */
    'worktree/execute'(payload: {
      action: 'create' | 'list' | 'switch' | 'remove'
      name: string | undefined
      baseRef: 'fresh' | 'head' | 'branch' | 'pr' | undefined
      branch: string | undefined
      prNumber: number | undefined
      force: boolean | undefined
    }): void
    /** Host returns the result of a worktree operation to the client GUI. */
    'worktree/result'(payload: {
      action: 'create' | 'list' | 'switch' | 'remove'
      success: boolean
      record?: WorktreeRecord
      worktrees?: WorktreeRecord[]
      name?: string
      error?: string
      timestamp: number
    }): void
  }
}
