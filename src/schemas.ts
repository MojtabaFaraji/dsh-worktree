/**
 * Input validation for the dsh worktree plugin.
 *
 * @module dsh-worktree-plugin/schemas
 */

import { z } from 'zod'

/** Worktree base reference. */
const baseRefSchema = z.enum(['fresh', 'head', 'branch', 'pr'])

/** Git branch name validation. */
export function validateBranchName(value: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 255) {
    throw new Error('branch name must be a non-empty string of at most 255 characters')
  }
  if (value.startsWith('-')) throw new Error('branch name must not start with a dash')
  if (value.startsWith('/') || value.endsWith('/') || value.includes('//')) {
    throw new Error('branch name must not have leading, trailing, or consecutive slashes')
  }
  if (value.includes('@{') || value.includes('..')) {
    throw new Error('branch name must not contain reflog or range syntax')
  }
  for (const char of [';', '&', '|', '$', '`', '(', ')']) {
    if (value.includes(char)) throw new Error('branch name must not contain shell metacharacters')
  }
  for (const char of ['~', '^', ':', '?', '*', '[', ']', '\\']) {
    if (value.includes(char)) throw new Error('branch name must not contain git special characters')
  }
  if (value.startsWith('.') || value.endsWith('.')) {
    throw new Error('branch name must not start or end with a dot')
  }
  if (value.endsWith('.lock')) throw new Error('branch name must not end with .lock')
  return value
}

/** Zod schema for a git branch name. */
export const branchNameSchema = z.string().superRefine((value: string, ctx: z.RefinementCtx) => {
  try {
    validateBranchName(value)
  } catch (error) {
    ctx.addIssue({ code: 'custom', message: (error as Error).message })
  }
})

/** Alias used by some consumers. */
export const branchSchema = branchNameSchema

/** Slug validation. */
export function validateSlug(value: string): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 64) {
    throw new Error('slug must be 1 to 64 characters long')
  }
  if (value === '.git') throw new Error('slug must not be .git')
  if (!/^[a-z0-9][a-z0-9-]*$/.test(value)) {
    throw new Error('slug must start with an alphanumeric and contain only lowercase alphanumerics and dashes')
  }
  return value
}

/** Zod schema for a worktree slug. */
export const slugSchema = z.string().superRefine((value: string, ctx: z.RefinementCtx) => {
  try {
    validateSlug(value)
  } catch (error) {
    ctx.addIssue({ code: 'custom', message: (error as Error).message })
  }
})

/** Alias used by some consumers. */
export const worktreeSlugSchema = slugSchema

/** Create input as a discriminated union on baseRef. */
export const createWorktreeInputSchema = z.discriminatedUnion('baseRef', [
  z.object({ baseRef: z.literal('fresh'), name: slugSchema }),
  z.object({ baseRef: z.literal('head'), name: slugSchema }),
  z.object({ baseRef: z.literal('branch'), name: slugSchema, branch: branchNameSchema }),
  z.object({ baseRef: z.literal('pr'), prNumber: z.number().int().positive(), name: slugSchema.optional() }),
])

/** Alias accepting an omitted baseRef by preprocessing it to fresh. */
export const createWorktreeSchema = z.preprocess((value) => {
  if (typeof value === 'object' && value !== null && !('baseRef' in value)) {
    return { baseRef: 'fresh', ...value }
  }
  return value
}, createWorktreeInputSchema)

/** Alias used by some consumers. */
export const createWorktreeOptionsSchema = createWorktreeSchema

/** Tool-level input schema. */
export const selectBranchWorktreeInputSchema = z.object({
  action: z.enum(['create', 'list', 'switch', 'remove']),
  name: z.string().optional(),
  baseRef: baseRefSchema.optional(),
  branch: z.string().optional(),
  prNumber: z.number().optional(),
  force: z.boolean().optional(),
})

/** Alias used by some consumers. */
export const toolInputSchema = selectBranchWorktreeInputSchema
