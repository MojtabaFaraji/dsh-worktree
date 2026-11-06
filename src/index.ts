/**
 * Cordis entrypoint for the dsh worktree plugin.
 *
 * @module dsh-worktree-plugin
 */

import { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { WorktreeService } from './worktree-service.ts'
import type { CreateWorktreeOptions, WorktreeBaseRef, WorktreeConfig } from './types.ts'
import {
  createWorktreeSchema,
  selectBranchWorktreeInputSchema,
  validateBranchName,
  validateSlug,
} from './schemas.ts'

export const name = 'dsh-worktree-plugin'

// No `inject` declared: the tools service is optional. The plugin activates
// without it and registers `select_branch_worktree` only when `ctx.tools`
// exists in the host build. Declaring `inject: ['tools']` would leave the
// fiber PENDING forever on any Cordis build that does not register a tools
// service, which surfaces as "1 entry did not activate".

export type Config = WorktreeConfig

export function apply(ctx: Context, config: Config = {}): void {
  // Register the worktree service synchronously so `ctx.worktree` is
  // available immediately for the tool handler and session hook. Using
  // `ctx.plugin(WorktreeService, config)` here would defer construction to
  // a microtask, leaving `ctx.worktree` unresolved when `apply` continues.
  new WorktreeService(ctx, config)

  // Optionally register the select_branch_worktree tool if the tools service
  // exists in this Cordis build. `ctx.tools` itself would throw through the
  // context proxy when the service is absent, so check via reflect instead.
  const tools = ctx.reflect.get('tools', false)
  if (tools) {
    tools.register(defineTool({
      name: 'select_branch_worktree',
      description: 'Create, list, switch, or remove an isolated git worktree for the current repository.',
      parameters: {
        action: { type: 'string', required: true, enum: ['create', 'list', 'switch', 'remove'], description: 'Operation to perform.' },
        name: { type: 'string', description: 'Worktree slug.' },
        baseRef: { type: 'string', enum: ['fresh', 'head', 'branch', 'pr'], description: 'Creation mode.' },
        branch: { type: 'string', description: 'Existing branch for branch mode.' },
        prNumber: { type: 'number', description: 'Pull request number for pr mode.' },
        force: { type: 'boolean', description: 'Force removal of a dirty worktree.' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: true,
        },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
      },
      async execute(args, exec) {
        const toolCtx: { ctx: Context & { session?: { cwd?: string } } } = { ctx }
        const session = exec.agent?.session as { cwd?: string } | undefined
        if (session !== undefined) toolCtx.ctx.session = session
        const repoRoot = toolCtx.ctx.session?.cwd ?? process.cwd()

        const input = selectBranchWorktreeInputSchema.parse(args) as {
          action: 'create' | 'list' | 'switch' | 'remove'
          name?: string
          baseRef?: WorktreeBaseRef
          branch?: string
          prNumber?: number
          force?: boolean
        }

        const service = ctx.worktree
        switch (input.action) {
          case 'create': {
            if (input.name !== undefined) validateSlug(input.name)
            if (input.branch !== undefined) validateBranchName(input.branch)
            const baseRef = input.baseRef ?? 'fresh'
            const name = input.name ?? `worktree-${Date.now()}`
            const createInput = createWorktreeSchema.parse({
              baseRef,
              name,
              ...(input.branch !== undefined ? { branch: input.branch } : {}),
              ...(input.prNumber !== undefined ? { prNumber: input.prNumber } : {}),
            })
            const options: CreateWorktreeOptions = {
              name: createInput.name,
              baseRef: createInput.baseRef,
              branch: 'branch' in createInput ? createInput.branch : undefined,
              prNumber: 'prNumber' in createInput ? createInput.prNumber : undefined,
              repoRoot,
            }
            return service.create(repoRoot, options) as any
          }
          case 'list': {
            const worktrees = ctx.worktree.list(repoRoot)
            ctx.emit('worktree/changed', {
              repoRoot,
              worktrees,
              timestamp: Date.now(),
            })
            return worktrees as any
          }
          case 'switch': {
            if (input.name === undefined) throw new Error('name is required for switch')
            validateSlug(input.name)
            const record = service.list(repoRoot).find(entry => entry.name === input.name)
            if (record === undefined) throw new Error(`unknown worktree: ${input.name}`)
            if (toolCtx.ctx.session !== undefined) toolCtx.ctx.session.cwd = record.path
            const agentSession = exec.agent?.session as { cwd?: string } | undefined
            if (agentSession !== undefined) agentSession.cwd = record.path
            return { ok: true, cwd: record.path, branch: record.branch } as any
          }
          case 'remove': {
            if (input.name === undefined) throw new Error('name is required for remove')
            validateSlug(input.name)
            await service.remove(repoRoot, input.name, input.force === true)
            return { ok: true } as any
          }
          default:
            throw new Error(`unknown action: ${String(input.action)}`)
        }
      },
    }))
  }

  // Register HTTP routes for client→host worktree execution.
  // Host and client run in separate Cordis Contexts, so ctx.emit() events
  // cannot cross the boundary. Instead, the client fetches HTTP endpoints
  // registered on the host's WebServer.
  function registerHttpRoutes(webServer: { register: (route: { kind: 'exact' | 'prefix'; path: string; handler: (req: any, res: any) => void | Promise<void> }) => () => void }): void {
    const repoRoot = process.cwd()
    const basePath = '/api/dsh-worktree-plugin'

    async function handleAction(req: any, res: any, action: 'create' | 'list' | 'switch' | 'remove'): Promise<void> {
      try {
        switch (action) {
          case 'create': {
            const body = await readBody(req)
            if (body.name === undefined) throw new Error('name is required for create')
            validateSlug(body.name)
            if (body.branch !== undefined) validateBranchName(body.branch)
            const baseRef = body.baseRef ?? 'fresh'
            const createInput = createWorktreeSchema.parse({
              baseRef,
              name: body.name,
              ...(body.branch !== undefined ? { branch: body.branch } : {}),
              ...(body.prNumber !== undefined ? { prNumber: body.prNumber } : {}),
            })
            const options: CreateWorktreeOptions = {
              name: createInput.name,
              baseRef: createInput.baseRef,
              branch: 'branch' in createInput ? createInput.branch : undefined,
              prNumber: 'prNumber' in createInput ? createInput.prNumber : undefined,
              repoRoot,
            }
            const record = await ctx.worktree.create(repoRoot, options)
            ctx.emit('worktree/changed', { repoRoot, worktrees: ctx.worktree.list(repoRoot), timestamp: Date.now() })
            sendJson(res, 200, { success: true, record, timestamp: Date.now() })
            break
          }
          case 'list': {
            const worktrees = ctx.worktree.list(repoRoot)
            ctx.emit('worktree/changed', { repoRoot, worktrees, timestamp: Date.now() })
            sendJson(res, 200, { success: true, worktrees, timestamp: Date.now() })
            break
          }
          case 'switch': {
            const body = await readBody(req)
            if (body.name === undefined) throw new Error('name is required for switch')
            validateSlug(body.name)
            if (body.name === 'main') {
              // "main" is the base repository, not a git worktree — switching is a no-op on host.
              ctx.emit('worktree/changed', { repoRoot, worktrees: ctx.worktree.list(repoRoot), timestamp: Date.now() })
              sendJson(res, 200, { success: true, record: { name: 'main', path: repoRoot, branch: 'main', baseRef: 'head' }, timestamp: Date.now() })
              break
            }
            const record = ctx.worktree.list(repoRoot).find((entry: { name: string }) => entry.name === body.name)
            if (record === undefined) throw new Error('unknown worktree: ' + body.name)
            sendJson(res, 200, { success: true, record, timestamp: Date.now() })
            break
          }
          case 'remove': {
            const body = await readBody(req)
            if (body.name === undefined) throw new Error('name is required for remove')
            validateSlug(body.name)
            await ctx.worktree.remove(repoRoot, body.name, body.force === true)
            ctx.emit('worktree/changed', { repoRoot, worktrees: ctx.worktree.list(repoRoot), timestamp: Date.now() })
            sendJson(res, 200, { success: true, name: body.name, timestamp: Date.now() })
            break
          }
        }
      } catch (error) {
        sendJson(res, 400, { success: false, error: error instanceof Error ? error.message : String(error), timestamp: Date.now() })
      }
    }

    async function readBody(req: any): Promise<any> {
      return new Promise((resolve, reject) => {
        let data = ''
        req.on('data', (chunk: string) => { data += chunk })
        req.on('end', () => {
          try { resolve(data ? JSON.parse(data) : {}) } catch (e) { reject(e) }
        })
        req.on('error', reject)
      })
    }

    function sendJson(res: any, status: number, obj: any): void {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
      res.end(JSON.stringify(obj))
    }

    // Register routes
    webServer.register({ kind: 'exact', path: basePath + '/create', handler: (req, res) => handleAction(req, res, 'create') })
    webServer.register({ kind: 'exact', path: basePath + '/list', handler: (req, res) => handleAction(req, res, 'list') })
    webServer.register({ kind: 'exact', path: basePath + '/switch', handler: (req, res) => handleAction(req, res, 'switch') })
    webServer.register({ kind: 'exact', path: basePath + '/remove', handler: (req, res) => handleAction(req, res, 'remove') })
  }

  // Try to register HTTP routes immediately, or wait for WebServer to become available
  const webServer = ctx.reflect.get('webServer', false)
  if (webServer) {
    registerHttpRoutes(webServer)
  } else {
    ctx.on('internal/service', (_name: string, _value: any) => {
      // Check if webServer became available
      const ws = ctx.reflect.get('webServer', false)
      if (ws) {
        registerHttpRoutes(ws)
      }
    }, { global: true })
  }

  // Optional session hook. Guarded because not every build exposes the event.
  try {
    ctx.on('session/created', (session: { id?: string; cwd?: string; worktree?: unknown }) => {
      const cfg = config
      if (cfg?.autoCreate !== true) return
      const name = cfg.name ?? `session-${String(session.id ?? '').slice(0, 8)}`
      void (async () => {
        try {
          const record = await ctx.worktree.create(session.cwd ?? process.cwd(), {
            name,
            baseRef: cfg.baseRef ?? 'fresh',
          })
          session.cwd = record.path
          session.worktree = record
        } catch (error) {
          ctx.logger?.warn?.('failed to auto-create worktree: %o', error)
        }
      })()
    }, { global: true })
  } catch {
    // Event unavailable in this build; rely on the tool-level switch action.
  }
}
