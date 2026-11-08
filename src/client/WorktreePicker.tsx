/**
 * Worktree picker/switcher for the chat message box.
 *
 * Registers into the 'conversation.input.left' slot of the chat message box,
 * alongside the command menu button. Users can list, switch to, create, or
 * remove git worktrees without leaving the chat.
 *
 * Each action inserts a '/worktree' command into the draft via
 * 'inputActions.insertText', which the model then executes through the
 * 'select_branch_worktree' tool.
 *
 * @module dsh-worktree-plugin/client
 */

import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Button, IconBranchOutlineRegular, IconPlusOutlineRegular, IconCloseOutlineRegular,
  IconRefreshOutlineRegular,
  Menu, type MenuEntry,
} from '@deepseek-ai/dsh-client-ui-primitives'

const WORKTREE_CSS = `
.dsh-worktree-plugin-picker-wrapper {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  position: relative;
  font-family: var(--dsw-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
}
.dsh-worktree-plugin-picker-button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 8px;
  border-radius: 999px;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
  transition: all 0.2s;
}
.dsh-worktree-plugin-picker-button:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh-worktree-plugin-icon {
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.dsh-worktree-plugin-active-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 140px;
}
.dsh-worktree-plugin-hint {
  font-size: 10px;
  color: var(--dsw-text-muted, #9ca3af);
  margin-top: 2px;
}
.dsh-worktree-plugin-busy {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
}
.dsh-worktree-plugin-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--dsw-border-muted, #e5e7eb);
  border-top-color: var(--dsw-button-text, #111827);
  border-radius: 50%;
  animation: dsh-worktree-plugin-spin 0.8s linear infinite;
}
@keyframes dsh-worktree-plugin-spin {
  to { transform: rotate(360deg); }
}
.dsh-worktree-plugin-picker-button:disabled,
.dsh-worktree-plugin-picker-button[aria-busy="true"] {
  opacity: 0.6;
  cursor: not-allowed;
  pointer-events: none;
}
.dsh-worktree-plugin-status-ok {
  color: var(--dsw-success, #10b981);
}
.dsh-worktree-plugin-status-warn {
  color: var(--dsw-warning, #f59e0b);
}

/* Beautiful toast notifications */
.dsh-worktree-plugin-toast {
  position: fixed;
  top: 24px;
  right: 24px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}
.dsh-worktree-plugin-toast-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  font-size: 13px;
  font-weight: 500;
  color: #ffffff;
  min-width: 280px;
  max-width: 400px;
  animation: dsh-worktree-plugin-toast-slide 0.3s ease-out;
  pointer-events: auto;
  opacity: 1;
}
.dsh-worktree-plugin-toast-item-success {
  background: #10b981;
}
.dsh-worktree-plugin-toast-item-error {
  background: #ef4444;
}
.dsh-worktree-plugin-toast-item-info {
  background: #3b82f6;
}
.dsh-worktree-plugin-toast-icon {
  flex-shrink: 0;
}
@keyframes dsh-worktree-plugin-toast-slide {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}

/* Beautiful remove confirmation modal */
.dsh-worktree-plugin-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,0.45);
  backdrop-filter: blur(4px);
  animation: dsh-worktree-plugin-modal-fade 0.2s ease-out;
}
.dsh-worktree-plugin-modal {
  background: var(--dsw-bg, #ffffff);
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.3);
  width: 90vw;
  max-width: 420px;
  padding: 24px;
  border: 1px solid var(--dsw-border, #d1d5db);
  animation: dsh-worktree-plugin-modal-slide 0.3s ease-out;
}
.dsh-worktree-plugin-modal-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--dsw-text, #111827);
  margin-bottom: 12px;
}
.dsh-worktree-plugin-modal-body {
  font-size: 14px;
  color: var(--dsw-text-secondary, #6b7280);
  margin-bottom: 20px;
  line-height: 1.5;
}
.dsh-worktree-plugin-modal-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}
.dsh-worktree-plugin-modal-btn-cancel {
  padding: 8px 16px;
  border-radius: 6px;
  border: 1px solid var(--dsw-border, #d1d5db);
  background: var(--dsw-bg, #ffffff);
  color: var(--dsw-text, #111827);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.dsh-worktree-plugin-modal-btn-cancel:hover {
  background: var(--dsw-bg-muted, #f9fafb);
}
.dsh-worktree-plugin-modal-btn-confirm {
  padding: 8px 16px;
  border-radius: 6px;
  border: none;
  background: #ef4444;
  color: #ffffff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.dsh-worktree-plugin-modal-btn-confirm:hover {
  background: #dc2626;
}
.dsh-worktree-plugin-modal-input {
  width: 100%;
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid var(--dsw-input-border, #d1d5db);
  background: var(--dsw-input-bg, #ffffff);
  color: var(--dsw-input-text, #111827);
  font-size: 13px;
  margin-bottom: 16px;
  box-sizing: border-box;
}
.dsh-worktree-plugin-modal-input:focus {
  outline: none;
  border-color: var(--dsw-input-focus-border, #2563eb);
}

/* Create worktree modal */
.dsh-worktree-plugin-create-modal {
  background: var(--dsw-bg, #ffffff);
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.3);
  width: 90vw;
  max-width: 420px;
  padding: 24px;
  border: 1px solid var(--dsw-border, #d1d5db);
  animation: dsh-worktree-plugin-modal-slide 0.3s ease-out;
}
.dsh-worktree-plugin-create-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--dsw-text, #111827);
  margin-bottom: 12px;
}
.dsh-worktree-plugin-create-body {
  font-size: 14px;
  color: var(--dsw-text-secondary, #6b7280);
  margin-bottom: 20px;
  line-height: 1.5;
}
.dsh-worktree-plugin-create-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}
.dsh-worktree-plugin-create-btn-cancel {
  padding: 8px 16px;
  border-radius: 6px;
  border: 1px solid var(--dsw-border, #d1d5db);
  background: var(--dsw-bg, #ffffff);
  color: var(--dsw-text, #111827);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.dsh-worktree-plugin-create-btn-cancel:hover {
  background: var(--dsw-bg-muted, #f9fafb);
}
.dsh-worktree-plugin-create-btn-confirm {
  padding: 8px 16px;
  border-radius: 6px;
  border: none;
  background: #10b981;
  color: #ffffff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.dsh-worktree-plugin-create-btn-confirm:hover {
  background: #059669;
}
.dsh-worktree-plugin-create-btn-confirm:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
@keyframes dsh-worktree-plugin-modal-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes dsh-worktree-plugin-modal-slide {
  from { transform: translateY(20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}


/* Beautiful worktree picker button */
.dsh-worktree-plugin-picker-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 8px;
  border: 1px solid var(--dsw-border, #d1d5db);
  background: linear-gradient(135deg, var(--dsw-bg, #ffffff) 0%, var(--dsw-bg-muted, #f3f4f6) 100%);
  color: var(--dsw-text, #111827);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}
.dsh-worktree-plugin-picker-button:hover:not(:disabled) {
  border-color: var(--dsw-primary, #2563eb);
  background: var(--dsw-bg, #ffffff);
  box-shadow: 0 4px 6px rgba(0,0,0,0.1);
  transform: translateY(-1px);
}
.dsh-worktree-plugin-picker-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}

/* Icon area */
.dsh-worktree-plugin-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
}

/* Active worktree label */
.dsh-worktree-plugin-active-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--dsw-primary, #2563eb);
  white-space: nowrap;
  font-weight: 600;
}

/* Loading spinner */
.dsh-worktree-plugin-loading {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
}
.dsh-worktree-plugin-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--dsw-border-muted, #e5e7eb);
  border-top-color: var(--dsw-primary, #2563eb);
  border-radius: 50%;
  animation: dsh-worktree-plugin-spin 0.8s linear infinite;
}
@keyframes dsh-worktree-plugin-spin {
  to { transform: rotate(360deg); }
}

/* Beautiful toast notifications */
.dsh-worktree-plugin-toast {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  gap: 10px;
  pointer-events: none;
}
.dsh-worktree-plugin-toast-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 18px;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.15);
  font-size: 13px;
  font-weight: 600;
  color: #ffffff;
  min-width: 260px;
  max-width: 420px;
  animation: dsh-worktree-plugin-toast-slide 0.35s cubic-bezier(0.16, 1, 0.3, 1);
  pointer-events: auto;
  opacity: 1;
  border: 1px solid rgba(255,255,255,0.2);
  backdrop-filter: blur(8px);
}
.dsh-worktree-plugin-toast-item-success {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
}
.dsh-worktree-plugin-toast-item-error {
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
}
.dsh-worktree-plugin-toast-item-info {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
}
.dsh-worktree-plugin-toast-icon {
  flex-shrink: 0;
  font-size: 16px;
}
@keyframes dsh-worktree-plugin-toast-slide {
  from { transform: translateX(120px); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}

/* Beautiful modal overlay */
.dsh-worktree-plugin-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 10001;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,0.4);
  backdrop-filter: blur(6px);
  animation: dsh-worktree-plugin-modal-fade 0.25s ease-out;
}
.dsh-worktree-plugin-modal {
  background: var(--dsw-bg, #ffffff);
  border-radius: 14px;
  box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
  width: 90vw;
  max-width: 440px;
  padding: 28px;
  border: 1px solid var(--dsw-border, #e5e7eb);
  animation: dsh-worktree-plugin-modal-slide 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.dsh-worktree-plugin-modal-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--dsw-text, #111827);
  margin: 0 0 8px 0;
  letter-spacing: -0.02em;
}
.dsh-worktree-plugin-modal-body {
  font-size: 14px;
  color: var(--dsw-text-secondary, #6b7280);
  margin-bottom: 20px;
  line-height: 1.6;
}
.dsh-worktree-plugin-modal-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}
.dsh-worktree-plugin-modal-btn-cancel {
  padding: 10px 20px;
  border-radius: 8px;
  border: 1px solid var(--dsw-border, #d1d5db);
  background: var(--dsw-bg, #ffffff);
  color: var(--dsw-text, #111827);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.dsh-worktree-plugin-modal-btn-cancel:hover {
  background: var(--dsw-bg-muted, #f9fafb);
  border-color: var(--dsw-border-muted, #e5e7eb);
}
.dsh-worktree-plugin-modal-btn-confirm {
  padding: 10px 20px;
  border-radius: 8px;
  border: none;
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
  color: #ffffff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 6px rgba(239, 68, 68, 0.3);
}
.dsh-worktree-plugin-modal-btn-confirm:hover:not(:disabled) {
  background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
  transform: translateY(-1px);
  box-shadow: 0 6px 8px rgba(239, 68, 68, 0.4);
}
.dsh-worktree-plugin-modal-btn-confirm:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Remove worktree select box */
.dsh-worktree-plugin-remove-select {
  width: 100%;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid var(--dsw-input-border, #d1d5db);
  background: var(--dsw-input-bg, #ffffff);
  color: var(--dsw-input-text, #111827);
  font-size: 14px;
  box-sizing: border-box;
  margin-bottom: 16px;
  cursor: pointer;
}
.dsh-worktree-plugin-remove-select:focus {
  outline: none;
  border-color: var(--dsw-primary, #2563eb);
}

/* Modal input */
.dsh-worktree-plugin-modal-input {
  width: 100%;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid var(--dsw-input-border, #d1d5db);
  background: var(--dsw-input-bg, #ffffff);
  color: var(--dsw-input-text, #111827);
  font-size: 14px;
  box-sizing: border-box;
  margin-bottom: 16px;
}
.dsh-worktree-plugin-modal-input:focus {
  outline: none;
  border-color: var(--dsw-primary, #2563eb);
  ring-color: var(--dsw-primary, #2563eb);
}


/* Modal create body */
.dsh-worktree-plugin-create-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.dsh-worktree-plugin-create-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}
.dsh-worktree-plugin-create-btn-cancel {
  padding: 10px 20px;
  border-radius: 8px;
  border: 1px solid var(--dsw-border, #d1d5db);
  background: var(--dsw-bg, #ffffff);
  color: var(--dsw-text, #111827);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.dsh-worktree-plugin-create-btn-cancel:hover {
  background: var(--dsw-bg-muted, #f9fafb);
}
.dsh-worktree-plugin-create-btn-confirm {
  padding: 10px 20px;
  border-radius: 8px;
  border: none;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: #ffffff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 6px rgba(16, 185, 129, 0.3);
}
.dsh-worktree-plugin-create-btn-confirm:hover:not(:disabled) {
  background: linear-gradient(135deg, #059669 0%, #047857 100%);
  transform: translateY(-1px);
  box-shadow: 0 6px 8px rgba(16, 185, 129, 0.4);
}
.dsh-worktree-plugin-create-btn-confirm:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@keyframes dsh-worktree-plugin-modal-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes dsh-worktree-plugin-modal-slide {
  from { transform: translateY(20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

@keyframes dsh-worktree-plugin-spin {
  to { transform: rotate(360deg); }
}

/* Menu position - show above the icon */
.dsh-worktree-plugin-menu {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
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

/** Props handed to each 'conversation.input.left' entry. */
export interface WorktreePickerProps {
  /** Stable public input actions for this Session. */
  inputActions: {
    captureInsertion: () => { start: number; end: number; draftRev: number }
    insertText: (text: string, span: { start: number; end: number; draftRev: number }) => boolean
  }
  /** Current Session identity. */
  sessionId: string
  /** Currently active worktree name, if any. */
  activeWorktree?: string | undefined
  /** List of worktrees known to the client (populated externally). */
  worktrees?: WorktreeEntry[]
  /** Callback invoked when the user selects a worktree action (emits Cordis event for host execution). */
  onAction?: (action: 'create' | 'list' | 'switch' | 'remove', name?: string, baseRef?: 'fresh' | 'head' | 'branch' | 'pr', branch?: string, prNumber?: number, force?: boolean) => void
}

/** Known worktrees for the current repository (client-side cache). */
let knownWorktrees: WorktreeEntry[] = []

/** Register worktrees from external source (e.g., server events). */
export function registerWorktrees(worktrees: WorktreeEntry[]): void {
  knownWorktrees = worktrees
}

/** Clear all known worktrees. */
export function clearWorktrees(): void {
  knownWorktrees = []
}

/** Render the worktree picker control. */
export function WorktreePicker({ inputActions: _inputActions, sessionId: _sessionId, activeWorktree: activeWorktreeProp, worktrees: worktreesProp, onAction }: WorktreePickerProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toasts, setToasts] = useState<{ id: number; kind: 'success' | 'error' | 'info'; message: string }[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState('')
  const [removeOpen, setRemoveOpen] = useState(false)
  const [removeName, setRemoveName] = useState('')

  const nextId = useRef(0)

  const worktrees = worktreesProp ?? knownWorktrees

  // Fetch worktree list on mount so it persists across page refresh
  useEffect(() => {
    async function loadWorktrees(): Promise<void> {
      try {
        const res = await fetch('/api/dsh-worktree-plugin/list')
        const result = await res.json()
        if (result.success && result.worktrees) {
          registerWorktrees(result.worktrees.map((w: { name: string; path: string; branch: string; active?: boolean }) => ({ ...w, active: w.name === activeWorktreeProp })))
        }
      } catch {
        // Silently ignore — host may not be ready
      }
    }
    void loadWorktrees()
  }, [activeWorktreeProp])

  const showToast = useCallback((kind: 'success' | 'error' | 'info', message: string): void => {
    const id = ++nextId.current
    setToasts(prev => [...prev, { id, kind, message }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000)
  }, [])

  const dismissToast = useCallback((id: number): void => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  // Build menu entries with "main" at top
  const entries: MenuEntry[] = useMemo(() => {
    const items: MenuEntry[] = []
    // Main branch option at top
    items.push({
      id: 'switch:main',
      label: 'Switch to main',
      disabled: activeWorktreeProp === 'main' || !activeWorktreeProp,
      icon: createElement(IconBranchOutlineRegular, { size: 12 }),
    })
    if (worktrees && worktrees.length > 0) {
      items.push(...worktrees.map(w => ({
        id: 'switch:' + w.name,
        label: w.active ? 'Switch to ' + w.branch + ' (active)' : 'Switch to ' + w.branch,
        disabled: w.active === true,
        icon: createElement(IconBranchOutlineRegular, { size: 12 }),
      })))
    }
    items.push(
      { id: 'list', label: 'Refresh list', icon: createElement(IconRefreshOutlineRegular, { size: 14 }) },
      { id: 'create', label: 'Create worktree…', icon: createElement(IconPlusOutlineRegular, { size: 14 }) },
      { id: 'remove', label: 'Remove worktree…', icon: createElement(IconCloseOutlineRegular, { size: 14 }) }
    )
    return items
  }, [worktrees, activeWorktreeProp])

  const handleSelect = useCallback(async (id: string): Promise<void> => {
    setOpen(false)
    if (id.startsWith('switch:')) {
      const name = id.slice('switch:'.length)
      if (onAction) {
        setBusy(true)
        try {
          await onAction('switch', name)
          await onAction('list')
          showToast('success', 'Switched to ' + name)
        } catch (error) {
          showToast('error', error instanceof Error ? error.message : 'Switch failed')
        } finally {
          setBusy(false)
        }
      }
    } else if (id === 'list') {
      if (onAction) {
        setBusy(true)
        try {
          await onAction('list')
          showToast('success', 'Worktree list refreshed')
        } catch (error) {
          showToast('error', error instanceof Error ? error.message : 'Refresh failed')
        } finally {
          setBusy(false)
        }
      }
    } else if (id === 'create') {
      setCreateOpen(true)
      setCreateName('')
    } else if (id === 'remove') {
      setRemoveOpen(true)
      setRemoveName('')
    }
  }, [onAction, showToast, activeWorktreeProp])

  const handleCreateSubmit = useCallback(async (): Promise<void> => {
    if (!createName.trim()) return
    setCreateOpen(false)
    setBusy(true)
    try {
      if (onAction) {
        await onAction('create', createName.trim())
        showToast('success', 'Worktree "' + createName.trim() + '" created')
        // Refresh list after create
        await onAction('list')
      }
      setCreateName('')
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Create failed')
    } finally {
      setBusy(false)
    }
  }, [createName, onAction, showToast])

  const handleCreateCancel = useCallback((): void => {
    setCreateOpen(false)
    setCreateName('')
  }, [])

  const handleRemoveNameChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>): void => {
    setRemoveName(e.target.value)
  }, [])

  const handleRemoveSubmit = useCallback(async (): Promise<void> => {
    if (!removeName.trim()) return
    const name = removeName.trim()
    setRemoveOpen(false)
    setBusy(true)
    try {
      if (onAction) {
        const wasActive = activeWorktreeProp === name
        await onAction('remove', name)
        showToast('success', 'Worktree "' + name + '" removed')
        // Refresh list after remove
        await onAction('list')
        // If we removed the active worktree, reset to main
        if (wasActive) {
          showToast('info', 'Active worktree removed — switched to main')
        }
      }
      setRemoveName('')
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Remove failed')
    } finally {
      setBusy(false)
    }
  }, [removeName, onAction, showToast, activeWorktreeProp])

  const handleRemoveCancel = useCallback((): void => {
    setRemoveOpen(false)
    setRemoveName('')
  }, [])

  return createElement('div', { className: 'dsh-worktree-plugin-picker-wrapper' },
    // Toast notifications
    createElement('div', { className: 'dsh-worktree-plugin-toast' },
      toasts.map(t => createElement('div', {
        key: t.id,
        className: 'dsh-worktree-plugin-toast-item dsh-worktree-plugin-toast-item-' + t.kind,
        onClick: () => dismissToast(t.id),
      },
        createElement('span', { className: 'dsh-worktree-plugin-toast-icon' },
          t.kind === 'success' ? '✓' : t.kind === 'error' ? '✕' : 'ℹ'
        ),
        createElement('span', { style: { whiteSpace: 'nowrap' } }, t.message)
      ))
    ),
    createElement(Button, {
      type: 'button',
      className: 'dsh-worktree-plugin-picker-button',
      'aria-label': 'Worktree picker',
      'aria-busy': busy || undefined,
      disabled: busy,
      onMouseDown: (e: React.MouseEvent<HTMLButtonElement>) => { e.stopPropagation() },
      onClick: () => { setOpen(!open) },
    },
      createElement('span', { className: 'dsh-worktree-plugin-icon' },
        busy
          ? createElement('span', { className: 'dsh-worktree-plugin-loading' },
            createElement('span', { className: 'dsh-worktree-plugin-spinner' })
          )
          : createElement(IconBranchOutlineRegular, { size: 14 })
      ),
      activeWorktreeProp && !busy && createElement('span', { className: 'dsh-worktree-plugin-active-label' },
        activeWorktreeProp
      ),
    ),
    // Create worktree modal
    createOpen && createElement('div', { className: 'dsh-worktree-plugin-modal-overlay', onClick: handleCreateCancel },
      createElement('div', { className: 'dsh-worktree-plugin-modal', onClick: (e: React.MouseEvent) => e.stopPropagation() },
        createElement('div', { className: 'dsh-worktree-plugin-modal-title' },
          'Create Worktree'
        ),
        createElement('div', { className: 'dsh-worktree-plugin-create-body' },
          createElement('label', null, 'Worktree name (lowercase, digits, dashes):'),
          createElement('input', {
            type: 'text',
            className: 'dsh-worktree-plugin-modal-input',
            value: createName,
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => setCreateName(e.target.value),
            placeholder: 'e.g. my-feature',
            autoFocus: true,
            onKeyPress: (e: React.KeyboardEvent) => {
              if (e.key === 'Enter') void handleCreateSubmit()
            },
          }),
          createElement('div', { className: 'dsh-worktree-plugin-create-actions' },
            createElement('button', {
              type: 'button',
              className: 'dsh-worktree-plugin-create-btn-cancel',
              onClick: handleCreateCancel,
            }, 'Cancel'),
            createElement('button', {
              type: 'button',
              className: 'dsh-worktree-plugin-create-btn-confirm',
              onClick: handleCreateSubmit,
              disabled: busy || !createName.trim(),
            }, busy ? 'Creating…' : 'Create')
          )
        )
      )
    ),
    // Remove worktree modal with selectable list
    removeOpen && createElement('div', { className: 'dsh-worktree-plugin-modal-overlay', onClick: handleRemoveCancel },
      createElement('div', { className: 'dsh-worktree-plugin-modal', onClick: (e: React.MouseEvent) => e.stopPropagation() },
        createElement('div', { className: 'dsh-worktree-plugin-modal-title' },
          'Remove Worktree'
        ),
        createElement('div', { className: 'dsh-worktree-plugin-modal-body' },
          createElement('label', null, 'Select worktree to remove:'),
          createElement('select', {
            className: 'dsh-worktree-plugin-remove-select',
            value: removeName,
            onChange: handleRemoveNameChange,
          },
            createElement('option', { value: '', disabled: true, hidden: true },
                'Select worktree…'
              ),
              worktrees && worktrees.length > 0
                ? worktrees.map(w => createElement('option', {
                    key: w.name,
                    value: w.name,
                    disabled: w.active,
                  },
                    w.name + (w.active ? ' (active — cannot remove)' : '')
                  ))
                : createElement('option', { disabled: true, value: '' },
                  'No worktrees available'
                )
          ),
          createElement('div', { className: 'dsh-worktree-plugin-modal-actions' },
            createElement('button', {
              type: 'button',
              className: 'dsh-worktree-plugin-modal-btn-cancel',
              onClick: handleRemoveCancel,
            }, 'Cancel'),
            createElement('button', {
              type: 'button',
              className: 'dsh-worktree-plugin-modal-btn-confirm',
              onClick: handleRemoveSubmit,
              disabled: busy || !removeName.trim(),
            }, busy ? 'Removing…' : 'Remove')
          )
        )
      )
    ),
    createElement(Menu, { anchor: createElement('span', null),
      open: open && !busy,
      items: entries.map(entry => busy ? { ...entry, disabled: true } : entry),
      side: 'top',
      onSelect: handleSelect,
      onClose: () => setOpen(false),
    })
  )
}
