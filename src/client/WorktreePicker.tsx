/**
 * Worktree picker/switcher for the chat message box.
 *
 * Registers into the `conversation.input.left` slot, rendering compact
 * controls alongside the command menu button in the composer toolbar.
 * Users can list, switch to, create, or remove git worktrees without
 * leaving the chat. Each action inserts a `/worktree` command into the
 * draft via `inputActions.insertText`, which the model then executes
 * through the `select_branch_worktree` tool.
 *
 * @module dsh-worktree-plugin/client
 */

import { createElement, useCallback, useMemo, useState } from 'react'
import {
  Button, IconBranchOutlineRegular, IconPlusOutlineRegular, IconCloseOutlineRegular,
  Menu, type MenuEntry,
} from '@deepseek-ai/dsh-client-ui-primitives'


const WORKTREE_CSS = `
.dsh-worktree-plugin-picker-wrapper {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  position: relative;
}
.dsh-worktree-plugin-picker-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 6px;
  background: var(--dsw-button-bg, #f3f4f6);
  border: 1px solid var(--dsw-button-border, #d1d5db);
  color: var(--dsw-button-text, #111827);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}
.dsh-worktree-plugin-picker-button:hover {
  background: var(--dsw-button-hover-bg, #e5e7eb);
  border-color: var(--dsw-button-hover-border, #9ca3af);
}
.dsh-worktree-plugin-icon {
  display: inline-flex;
  align-items: center;
}
.dsh-worktree-plugin-active-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--dsw-text-secondary, #6b7280);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100px;
}
.dsh-worktree-plugin-create-form {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background: var(--dsw-bg, #ffffff);
  border: 1px solid var(--dsw-border, #d1d5db);
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}
.dsh-worktree-plugin-create-input {
  flex: 1;
  padding: 4px 8px;
  font-size: 12px;
  border: 1px solid var(--dsw-input-border, #d1d5db);
  border-radius: 4px;
  background: var(--dsw-input-bg, #ffffff);
  color: var(--dsw-input-text, #111827);
  outline: none;
}
.dsh-worktree-plugin-create-input:focus {
  border-color: var(--dsw-input-focus-border, #2563eb);
}
.dsh-worktree-plugin-create-cancel {
  padding: 4px 10px;
  font-size: 12px;
  border: none;
  border-radius: 4px;
  background: var(--dsw-button-secondary-bg, #f3f4f6);
  color: var(--dsw-button-secondary-text, #111827);
  cursor: pointer;
}
.dsh-worktree-plugin-create-cancel:hover {
  background: var(--dsw-button-secondary-hover-bg, #e5e7eb);
}
`;

function injectWorktreeCss() {
  if (document.getElementById('dsh-worktree-plugin-picker-css')) return;
  const style = document.createElement('style');
  style.id = 'dsh-worktree-plugin-picker-css';
  style.textContent = WORKTREE_CSS;
  document.head.appendChild(style);
}

// Call it at module load
injectWorktreeCss();

/** One worktree entry known to the client. */
export interface WorktreeEntry {
  /** Worktree slug. */
  readonly name: string
  /** Absolute filesystem path of the worktree. */
  readonly path: string
  /** Branch checked out in the worktree. */
  readonly branch: string
  /** Whether this worktree is currently active. */
  readonly active?: boolean
}

/** Props handed to each `conversation.input.left` entry. */
export interface WorktreePickerProps {
  /** Stable public input actions for this Session. */
  inputActions: {
    captureInsertion: () => { start: number; end: number; draftRev: number }
    insertText: (text: string, span: { start: number; end: number; draftRev: number }) => boolean
  }
  /** Current Session identity. */
  sessionId: string
  /** Currently active worktree name, if any. */
  activeWorktree?: string
}

/** Known worktrees for the current repository (client-side cache). */
const knownWorktrees: WorktreeEntry[] = []

/** Render the worktree picker control. */
export function WorktreePicker({ inputActions, sessionId: _sessionId, activeWorktree }: WorktreePickerProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  const entries: MenuEntry[] = useMemo(() => [
    ...knownWorktrees.map(w => ({
      id: `switch:${w.name}`,
      label: w.active ? `Switch to ${w.branch} (active)` : `Switch to ${w.branch}`,
      icon: createElement(IconBranchOutlineRegular, { size: 14 }),
    })),
    { id: 'create', label: 'Create worktree…', icon: createElement(IconPlusOutlineRegular, { size: 14 }) },
    { id: 'remove', label: 'Remove worktree…', icon: createElement(IconCloseOutlineRegular, { size: 14 }) },
  ], [knownWorktrees])

  const insertCommand = useCallback((command: string): void => {
    const span = inputActions.captureInsertion()
    inputActions.insertText(command, span)
  }, [inputActions])

  const handleSelect = useCallback((id: string): void => {
    setOpen(false)
    if (id.startsWith('switch:')) {
      const name = id.slice('switch:'.length)
      insertCommand(`/worktree switch ${name}\n`)
    } else if (id === 'create') {
      setCreating(true)
    } else if (id === 'remove') {
      const name = window.prompt('Worktree name to remove:')
      if (name) insertCommand(`/worktree remove ${name}\n`)
    }
  }, [insertCommand])

  return createElement('div', { className: 'dsh-worktree-plugin-picker-wrapper' },
    createElement(Button, {
      type: 'button',
      className: 'dsh-worktree-plugin-picker-button',
      'aria-label': 'Worktree picker',
      onMouseDown: (e: React.MouseEvent<HTMLButtonElement>) => { e.stopPropagation() },
      onClick: () => { setOpen(!open) },
    },
      createElement('span', { className: 'dsh-worktree-plugin-icon' },
        createElement(IconBranchOutlineRegular, { size: 14 })
      ),
      activeWorktree && createElement('span', { className: 'dsh-worktree-plugin-active-label' },
        activeWorktree
      )
    ),
    creating && createElement('div', { className: 'dsh-worktree-plugin-create-form' },
      createElement('input', {
        autoFocus: true,
        className: 'dsh-worktree-plugin-create-input',
        value: newName,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => setNewName(e.target.value),
        onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Enter' && newName.trim()) {
            insertCommand(`/worktree create ${newName.trim()}\n`)
            setCreating(false)
            setNewName('')
          } else if (e.key === 'Escape') {
            setCreating(false)
            setNewName('')
          }
        },
        placeholder: 'worktree name',
      }),
      createElement('button', {
        type: 'button',
        className: 'dsh-worktree-plugin-create-cancel',
        onClick: () => { setCreating(false); setNewName('') },
      }, 'Cancel')
    ),
    createElement(Menu, { anchor: createElement('span', null),
      open,
      items: entries,
      onSelect: handleSelect,
      onClose: () => setOpen(false),
    })
  )
}
