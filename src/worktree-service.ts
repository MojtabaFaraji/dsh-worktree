/**
 * Core git worktree logic and in-memory state for the dsh worktree plugin.
 *
 * @module dsh-worktree-plugin/worktree-service
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import { realpathSync } from 'node:fs'
import path from 'node:path'
import type { CreateWorktreeOptions, WorktreeBaseRef, WorktreeConfig, WorktreeRecord } from './types.ts'
import { validateBranchName, validateSlug } from './schemas.ts'

const execFileAsync = promisify(execFile)

/** Structured git failure. */
export class GitCommandError extends Error {
  readonly subcommand: string
  readonly stderr: string
  readonly code: number | null
  constructor(subcommand: string, stderr: string, code: number | null = null) {
    super(`git ${subcommand} failed: ${stderr.slice(0, 500)}`)
    this.name = 'GitCommandError'
    this.subcommand = subcommand
    this.stderr = stderr
    this.code = code
  }
}

/** Service identity and in-memory worktree state. */
export class WorktreeService extends Service {
  private readonly config: WorktreeConfig
  private readonly recordsByRepo = new Map<string, Map<string, WorktreeRecord>>()

  constructor(ctx: Context, config: WorktreeConfig = {}) {
    super(ctx, 'worktree')
    this.config = config
  }

  /** Default worktree root, or the configured override. */
  worktreeRoot(repoRoot: string): string {
    const root = path.resolve(repoRoot)
    const configured = this.config.root
    if (configured === undefined || configured === '' || configured === '.dsh/worktrees') {
      return path.join(root, '.dsh', 'worktrees')
    }
    const resolved = path.isAbsolute(configured)
      ? path.resolve(configured)
      : path.resolve(root, configured)
    this.assertSandboxPath(root, resolved)
    return resolved
  }

  /** Resolve and guard a worktree path. */
  resolveWorktreePath(repoRoot: string, name: string): string {
    validateSlug(name)
    if (name === '.git') throw new Error('worktree name must not be .git')
    const root = this.worktreeRoot(repoRoot)
    let realRoot = root
    try {
      realRoot = realpathSync(root)
    } catch {
      realRoot = root
    }
    const resolved = path.resolve(realRoot, name)
    const relative = path.relative(realRoot, resolved)
    if (relative === '' || path.isAbsolute(relative) || relative === '..' || relative.startsWith('..' + path.sep)) {
      throw new Error('worktree path escapes the worktree root')
    }
    if (relative.split(path.sep).includes('.git')) throw new Error('worktree path must not contain a .git segment')
    return path.resolve(root, name)
  }

  /** Safe git execution through execFile with an argv array. */
  private async git(cwd: string, args: string[], timeoutMs = 15000): Promise<string> {
    const env: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0' }
    delete env.GIT_DIR
    delete env.GIT_WORK_TREE
    delete env.GIT_INDEX_FILE
    const subcommand = args.join(' ')
    try {
      const result = await execFileAsync('git', args, {
        cwd,
        timeout: timeoutMs,
        env,
        maxBuffer: 10 * 1024 * 1024,
      })
      return (result.stdout ?? '').toString()
    } catch (error) {
      const failure = error as { code?: number | string; stderr?: string | Buffer; message?: string }
      const stderr = (failure.stderr ?? '').toString()
      const code = typeof failure.code === 'number' ? failure.code : null
      throw new GitCommandError(subcommand, stderr || failure.message || 'git command failed', code)
    }
  }

  private async pathExists(target: string): Promise<boolean> {
    try {
      await fs.access(target)
      return true
    } catch {
      return false
    }
  }

  private records(repoRoot: string): Map<string, WorktreeRecord> {
    const key = path.resolve(repoRoot)
    let map = this.recordsByRepo.get(key)
    if (map === undefined) {
      map = new Map()
      this.recordsByRepo.set(key, map)
    }
    return map
  }

  private commitRecord(repoRoot: string, record: WorktreeRecord): WorktreeRecord {
    const committed: WorktreeRecord = { ...record, createdAt: record.createdAt || Date.now() }
    this.records(repoRoot).set(committed.name, committed)
    return committed
  }

  private assertSandboxPath(repoRoot: string, target: string): void {
    const mode = this.sandboxMode()
    const relative = path.relative(repoRoot, target)
    if (mode !== 'danger-full-access' && (relative === '' ? false : relative.startsWith('..') || path.isAbsolute(relative))) {
      throw new Error('worktree root resolves outside the sandbox writable root; widen the sandbox policy or choose a path inside the repository')
    }
  }

  private sandboxMode(): string {
    const ctx = this.ctx as unknown as { sandboxPolicy?: { resolve?: (request?: unknown) => { mode?: string } }; sandbox?: { mode?: string } }
    try {
      const resolved = ctx.sandboxPolicy?.resolve?.()
      if (resolved?.mode !== undefined) return resolved.mode
    } catch {
      // Fall through to the direct sandbox property, if present.
    }
    return ctx.sandbox?.mode ?? 'workspace-write'
  }

  private async withRepoLock<T>(repoRoot: string, fn: () => Promise<T>): Promise<T> {
    const lockPath = path.join(repoRoot, '.git', 'dsh-worktree-plugin.lock')
    const handle = await fs.open(lockPath, 'wx')
    try {
      return await fn()
    } finally {
      await handle.close().catch(() => {})
      await fs.unlink(lockPath).catch(() => {})
    }
  }

  private async resolveDefaultBase(repoRoot: string): Promise<string> {
    // Level 1: symbolic ref + fetch with a 5 second timeout.
    try {
      const symbolic = (await this.git(repoRoot, ['symbolic-ref', 'refs/remotes/origin/HEAD'])).trim()
      const branch = symbolic.startsWith('refs/remotes/origin/') ? symbolic.slice('refs/remotes/origin/'.length).trim() : symbolic.trim()
      if (branch !== '' && branch !== symbolic) {
        await this.git(repoRoot, ['fetch', 'origin', branch], 5000)
        return `origin/${branch}`
      }
    } catch {
      // Fall through to cached origin/HEAD.
    }
    // Level 2: cached origin/HEAD.
    try {
      const hash = (await this.git(repoRoot, ['rev-parse', '--verify', 'origin/HEAD'])).trim()
      if (hash !== '') return 'origin/HEAD'
    } catch {
      // Fall through to local HEAD.
    }
    // Level 3.
    return 'HEAD'
  }

  private async isRegisteredWorktree(repoRoot: string, target: string): Promise<boolean> {
    try {
      const output = await this.git(repoRoot, ['worktree', 'list', '--porcelain'])
      const paths = output
        .split('\n')
        .filter(line => line.startsWith('worktree '))
        .map(line => path.resolve(line.slice('worktree '.length).trim()))
      return paths.includes(path.resolve(target))
    } catch {
      return false
    }
  }

  private async reuseFreshWorktree(repoRoot: string, target: string, name: string): Promise<WorktreeRecord> {
    return this.withRepoLock(repoRoot, async () => {
      if (!(await this.isRegisteredWorktree(repoRoot, target))) {
        throw new Error('target path exists but is not a registered git worktree')
      }
      const status = (await this.git(target, ['status', '--porcelain'])).trim()
      const existing = this.records(repoRoot).get(name)
      if (status !== '') {
        this.ctx.logger?.warn?.('worktree %s is dirty; leaving it untouched', name)
        if (existing !== undefined) return existing
        const branch = (await this.git(target, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
        return this.commitRecord(repoRoot, { name, path: target, branch, baseRef: 'fresh', createdAt: Date.now() })
      }
      const branch = (await this.git(target, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
      if (branch === name) {
        const base = await this.resolveDefaultBase(repoRoot)
        await this.git(target, ['reset', '--hard', base], 120000)
      }
      return this.commitRecord(repoRoot, { name, path: target, branch, baseRef: 'fresh', createdAt: existing?.createdAt ?? Date.now() })
    })
  }

  private async reuseExistingWorktree(repoRoot: string, target: string, name: string, baseRef: WorktreeBaseRef): Promise<WorktreeRecord> {
    if (!(await this.isRegisteredWorktree(repoRoot, target))) {
      throw new Error('target path exists but is not a registered git worktree')
    }
    const branch = (await this.git(target, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
    return this.commitRecord(repoRoot, { name, path: target, branch, baseRef, createdAt: Date.now() })
  }

  async createFresh(repoRoot: string, name: string): Promise<WorktreeRecord> {
    validateSlug(name)
    const resolvedRepoRoot = path.resolve(repoRoot)
    const target = this.resolveWorktreePath(resolvedRepoRoot, name)
    if (await this.pathExists(target)) {
      // If the directory exists but is not a registered git worktree, clean it up and create fresh.
      if (!(await this.isRegisteredWorktree(resolvedRepoRoot, target))) {
        this.ctx.logger?.warn?.('stale worktree directory at %s; removing and recreating', target)
        await fs.rm(target, { recursive: true, force: true })
      } else {
        return this.reuseFreshWorktree(resolvedRepoRoot, target, name)
      }
    }
    const base = await this.resolveDefaultBase(resolvedRepoRoot)
    try {
      await this.git(resolvedRepoRoot, ['worktree', 'add', '-b', name, '--', target, base], 120000)
    } catch (error) {
      const msg = (error as { message?: string }).message ?? ''
      if (msg.includes('already exists')) {
        this.ctx.logger?.warn?.('branch %s already exists; deleting and retrying', name)
        await this.git(resolvedRepoRoot, ['branch', '-D', name], 120000)
        await this.git(resolvedRepoRoot, ['worktree', 'add', '-b', name, '--', target, base], 120000)
      } else {
        throw error
      }
    }
    return this.commitRecord(resolvedRepoRoot, { name, path: target, branch: name, baseRef: 'fresh', createdAt: Date.now() })
  }

  async createFromHead(repoRoot: string, name: string): Promise<WorktreeRecord> {
    validateSlug(name)
    const resolvedRepoRoot = path.resolve(repoRoot)
    const target = this.resolveWorktreePath(resolvedRepoRoot, name)
    if (await this.pathExists(target)) {
      return this.reuseExistingWorktree(resolvedRepoRoot, target, name, 'head')
    }
    await this.git(resolvedRepoRoot, ['worktree', 'add', '-b', name, '--', target, 'HEAD'], 120000)
    return this.commitRecord(resolvedRepoRoot, { name, path: target, branch: name, baseRef: 'head', createdAt: Date.now() })
  }

  async createFromBranch(repoRoot: string, name: string, branch: string): Promise<WorktreeRecord> {
    validateSlug(name)
    // validateBranchName is in schemas; avoid importing value? import dynamically not needed.
    validateBranchName(branch)
    const resolvedRepoRoot = path.resolve(repoRoot)
    const target = this.resolveWorktreePath(resolvedRepoRoot, name)
    if (await this.pathExists(target)) {
      return this.reuseExistingWorktree(resolvedRepoRoot, target, name, 'branch')
    }
    const refs = [`origin/${branch}`, branch]
    let lastError: unknown
    for (const ref of refs) {
      try {
        await this.git(resolvedRepoRoot, ['worktree', 'add', '--', target, ref], 120000)
        return this.commitRecord(resolvedRepoRoot, { name, path: target, branch: ref, baseRef: 'branch', createdAt: Date.now() })
      } catch (error) {
        lastError = error
      }
    }
    throw lastError instanceof Error ? lastError : new Error('failed to create worktree from branch')
  }

  async createFromPR(repoRoot: string, prNumber: number, name?: string): Promise<WorktreeRecord> {
    const slug = name ?? `pr-${prNumber}`
    validateSlug(slug)
    const resolvedRepoRoot = path.resolve(repoRoot)
    const target = this.resolveWorktreePath(resolvedRepoRoot, slug)
    if (await this.pathExists(target)) {
      return this.reuseExistingWorktree(resolvedRepoRoot, target, slug, 'pr')
    }
    try {
      await this.git(resolvedRepoRoot, ['fetch', 'origin', `pull/${prNumber}/head`], 120000)
    } catch (error) {
      const failure = error as { stderr?: string; message?: string }
      throw new Error(`failed to fetch pull/${prNumber}/head: ${(failure.stderr ?? failure.message ?? '').slice(0, 500)}`)
    }
    await this.git(resolvedRepoRoot, ['worktree', 'add', '-b', slug, '--', target, 'FETCH_HEAD'], 120000)
    return this.commitRecord(resolvedRepoRoot, { name: slug, path: target, branch: slug, baseRef: 'pr', createdAt: Date.now() })
  }

  async create(repoRoot: string, options: CreateWorktreeOptions): Promise<WorktreeRecord> {
    const baseRef = options.baseRef ?? this.config.baseRef ?? 'fresh'
    const name = options.name ?? (baseRef === 'pr' && options.prNumber !== undefined ? `pr-${options.prNumber}` : undefined)
    if (name === undefined) throw new Error('worktree name is required')
    switch (baseRef) {
      case 'fresh':
        return this.createFresh(repoRoot, name)
      case 'head':
        return this.createFromHead(repoRoot, name)
      case 'branch':
        if (options.branch === undefined) throw new Error('branch is required for branch baseRef')
        return this.createFromBranch(repoRoot, name, options.branch)
      case 'pr':
        if (options.prNumber === undefined) throw new Error('prNumber is required for pr baseRef')
        return this.createFromPR(repoRoot, options.prNumber, name)
      default:
        throw new Error(`unknown baseRef: ${String(baseRef)}`)
    }
  }

  /** Emit worktree/changed event for client GUI auto-refresh. */
  private emitWorktreeChanged(repoRoot: string): void {
    try {
      const resolved = path.resolve(repoRoot)
      this.ctx.emit('worktree/changed', {
        repoRoot: resolved,
        worktrees: this.list(resolved),
        timestamp: Date.now(),
      })
    } catch {
      // Event emission failures should not break worktree operations
    }
  }

  list(repoRoot: string): WorktreeRecord[] {
    return [...this.records(path.resolve(repoRoot)).values()]
  }

  async remove(repoRoot: string, name: string, force = false): Promise<void> {
    const resolvedRepoRoot = path.resolve(repoRoot)
    const target = this.resolveWorktreePath(resolvedRepoRoot, name)
    await this.withRepoLock(resolvedRepoRoot, async () => {
      try {
        const ordered = force ? ['worktree', 'remove', '--force', target] : ['worktree', 'remove', target]
        await this.git(resolvedRepoRoot, ordered, 120000)
      } catch (error) {
        this.ctx.logger?.warn?.('git worktree remove failed for %s: %s; cleaning up manually', name, error)
        if (await this.pathExists(target)) {
          await fs.rm(target, { recursive: true, force: true })
        }
      }
      // Delete the branch created for this worktree so the name can be reused.
      try {
        await this.git(resolvedRepoRoot, ['branch', '-D', name], 120000)
      } catch {
        // Branch may not exist or may be in use elsewhere; ignore.
      }
      this.records(resolvedRepoRoot).delete(name)
    })
    this.emitWorktreeChanged(resolvedRepoRoot)
  }

  async prune(repoRoot: string): Promise<void> {
    const resolvedRepoRoot = path.resolve(repoRoot)
    await this.withRepoLock(resolvedRepoRoot, async () => {
      await this.git(resolvedRepoRoot, ['worktree', 'prune'], 120000)
      const map = this.records(resolvedRepoRoot)
      for (const [name, record] of map) {
        if (!(await this.pathExists(record.path))) map.delete(name)
      }
    })
    this.emitWorktreeChanged(resolvedRepoRoot)
  }
}

export default WorktreeService
