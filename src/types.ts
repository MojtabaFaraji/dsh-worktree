/**
 * Shared types for the dsh worktree plugin. The Cordis `Context` augmentation
 * lives here so `ctx.worktree` is typed at every call site.
 *
 * @module @deepseek-ai/dsh-worktree/types
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
}
