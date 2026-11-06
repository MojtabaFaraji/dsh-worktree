# dsh-worktree-plugin

Git worktree management with GUI picker for DeepSeek Harness — create, switch, and remove isolated git worktrees from the chat message box.

[![npm version](https://img.shields.io/npm/v/dsh-worktree-plugin)](https://www.npmjs.com/package/dsh-worktree-plugin)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Cordis Plugin](https://img.shields.io/badge/Cordis-Plugin-blue)](https://github.com/deepseek-ai/deepseek-harness)

## Overview

dsh-worktree-plugin is a Cordis plugin for DeepSeek Harness that provides isolated git worktree management. It adds a `select_branch_worktree` tool to the model and a worktree picker/switcher GUI component to the chat message box.

## Features

| Feature | Description |
|---------|-------------|
| 🌳 Create Worktrees | Create isolated git worktrees from fresh, head, branch, or PR base |
| 🔄 Switch Worktrees | Switch between existing worktrees from the GUI |
| 🗑️ Remove Worktrees | Remove worktrees you no longer need |
| 📋 List Worktrees | View all worktrees in the current repository |
| 🖱️ GUI Picker | Beautiful branch icon button with active worktree badge in the chat composer bar |
| 💬 Command Interface | /worktree commands inserted into your draft |
| 🔒 Sandbox Safe | Path guards and locking for safe git execution |
| 📱 Toasts | Beautiful success/error/info toast notifications instead of alerts |
| 🎨 Modal Dialogs | Beautiful modal dialogs with select box for create and remove operations |
| 🔄 Auto-Refresh | Worktree list auto-refreshes after create, switch, and remove operations |
| 💾 Persistence | Worktree records persisted to disk (`<repoRoot>/.dsh/worktree-records.json`) — survive server restarts |
| ⏳ Loading States | Spinner and disabled state during all async operations |

## Installation

### Install from npm (recommended)

```bash
dsh plugin install dsh-worktree-plugin
pnpm dsh web
```

**No `--patch` flag needed.** The plugin manager auto-registers the bundle via `dsh.bundle.patch` in package.json.

### Install from source

```bash
git clone https://github.com/MojtabaFaraji/dsh-worktree-plugin.git
cd dsh-worktree-plugin
npm install
npm run build
dsh plugin install file:///path/to/dsh-worktree-plugin
pnpm dsh web
```

## Activation

The plugin activates automatically on `pnpm dsh web` after `dsh plugin install dsh-worktree-plugin` — no manual `cordis.patch.yml` edits needed.

If you want to customize configuration, add to your profile's `cordis.patch.yml`:

```yaml
- insert:
    - id: worktree
      name: 'dsh-worktree-plugin'
      config:
        baseRef: fresh
        root: .dsh/worktrees
        autoCreate: false
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| baseRef | 'fresh' | 'head' | 'branch' | 'pr' | 'fresh' | Default creation mode for new worktrees |
| root | string | '.dsh/worktrees' | Directory under repo root where worktrees are stored |
| autoCreate | boolean | false | Auto-create a worktree on session creation |

## Usage

### GUI (Chat Message Box)

After activation, a branch icon button appears in the chat composer bar:

```
[Type your message...] [branch icon | my-worktree] [command menu]
```

Click the branch icon to open the worktree menu. The active worktree name appears next to the icon so you always know which worktree you're in.

| Menu Item | Action |
|-----------|--------|
| Switch to main | Switch to base repository (disabled when already active) |
| Switch to <branch> | Switch to an existing worktree (disabled when already active) |
| Refresh list | Refreshes worktree list from host |
| Create worktree… | Opens beautiful modal to create a new worktree |
| Remove worktree… | Opens select box modal to remove a worktree |

No user knowledge of tools required. The user never needs to know about `select_branch_worktree` or tell the agent to call it. The plugin handles everything transparently via HTTP calls from the client GUI to the host.

The active worktree name is displayed next to the icon so you always know which worktree you're in.

### Empty State & Main Worktree

When no worktrees exist, the GUI shows "main" next to the icon and "Switch to main" at the top of the menu. Create your first worktree:

> "Use select_branch_worktree to create a worktree named 'Test' with baseRef 'head'"

Then click Refresh list to see it appear below "Switch to main".

### Auto-Refresh

When the agent creates, removes, or lists worktrees through the `select_branch_worktree` tool, the host emits a `worktree/changed` event. The client GUI listens for this event and automatically updates the worktree dropdown — no manual refresh needed.

### Persistence Across Restarts

Worktree records are persisted to `<repoRoot>/.dsh/worktree-records.json`. When you restart the web server:

1. `ensureLoaded()` reads the JSON file from disk
2. Each record is validated against `git worktree list --porcelain`
3. Stale entries (worktrees that no longer exist on disk) are dropped
4. Your worktrees reappear in the GUI — no re-creation needed

### Automatic Tool Invocation

The plugin uses zero-agent-knowledge operation — GUI menu clicks auto-call the `select_branch_worktree` tool via HTTP to the host without the user typing commands or the agent knowing about tools:

| Step | Action | Who |
|------|--------|-----|
| 1 | User clicks a menu item in the worktree picker | User |
| 2 | GUI shows beautiful modal (create input or remove select box) | GUI |
| 3 | Client fetches host HTTP route (/api/dsh-worktree-plugin/{create,remove,switch,list}) | Client |
| 4 | Host executes git worktree operation | Host |
| 5 | Host returns success/error result | Host |
| 6 | GUI shows toast notification with result | GUI |
| 7 | Worktree list auto-refreshes | GUI |

No user knowledge of tools required. The user never needs to know about `select_branch_worktree` or tell the agent to call it. The plugin handles everything transparently.

### Fallback

If Cordis events cannot cross the client-host boundary in your deployment, the plugin falls back to inserting /worktree commands into the draft. In that case, the agent needs to call `select_branch_worktree` manually. The plugin uses HTTP routes on the host WebServer as the IPC mechanism between client and host contexts.

### Command Interface

Each GUI action inserts a /worktree command into your draft. The model then executes it through the `select_branch_worktree` tool:

| Command | Description |
|---------|-------------|
| /worktree create <name> | Create a new isolated worktree |
| /worktree switch <name> | Switch to an existing worktree |
| /worktree list | List all worktrees in the repo |
| /worktree remove <name> | Remove a worktree |

### Creation Modes

| Mode | Description |
|---------|-------------|
| fresh | Creates a worktree with a fresh checkout |
| head | Creates a worktree from current HEAD |
| branch | Creates a worktree from an existing branch |
| pr | Creates a worktree from a pull request |

## API

### select_branch_worktree Tool

Parameters:

```json
{
  "action": "create|list|switch|remove",
  "name": "worktree-slug",
  "baseRef": "fresh|head|branch|pr",
  "branch": "existing-branch-name",
  "prNumber": 123,
  "force": false
}
```

### Client Plugin

- Name: dsh-worktree-plugin-client
- Slot: conversation.input.left (chat message box)
- Order: 50

## Project Structure

```
dsh-worktree-plugin/
├── src/
│   ├── index.ts              # Host-side Cordis plugin entry
│   ├── types.ts              # Shared types and Context augmentation
│   ├── worktree-service.ts   # Git worktree service implementation
│   ├── schemas.ts            # Input validation schemas (Zod)
│   └── client/
│       ├── index.ts          # Client-side Cordis plugin
│       └── WorktreePicker.tsx # React GUI component
├── lib/                      # Built output (published to npm)
├── tsconfig.json             # Host-side TypeScript config
├── tsconfig.client.json      # Client-side TypeScript config
├── tsdown.config.ts          # Client bundle config
├── cordis.patch.yml          # Cordis plugin insertion manifest
├── package.json              # npm package manifest
├── README.md                 # This file
├── LICENSE                   # MIT License
└── .gitignore                # Git ignore rules
```

## Development

```bash
# Install dependencies
npm install

# Build host-side (TypeScript)
npx tsc -p tsconfig.json

# Build client-side (TypeScript + tsdown bundle)
npx tsc -p tsconfig.client.json
npx tsdown --env.DSH_BUILD_FACE client
```

## Publishing to npm

```bash
npm publish --access public
```

## Requirements

- DeepSeek Harness with Cordis runtime
- React 18+ (peer dependency)
- @deepseek-ai/dsh-client-ui-conversation (peer dependency)
- @deepseek-ai/dsh-client-ui-primitives (peer dependency)
- Git (for worktree operations)

## License

MIT License — see LICENSE for details.

## Repository

https://github.com/MojtabaFaraji/dsh-worktree-plugin

## Support

For issues and feature requests, please open an issue on GitHub.
