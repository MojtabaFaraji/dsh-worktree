# @deepseek-ai/dsh-worktree

Git worktree management with GUI picker for DeepSeek Harness — create, switch, and remove isolated git worktrees from the chat message box.

[![npm version](https://img.shields.io/npm/v/@deepseek-ai/dsh-worktree)](https://www.npmjs.com/package/@deepseek-ai/dsh-worktree)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Cordis Plugin](https://img.shields.io/badge/Cordis-Plugin-blue)](https://github.com/deepseek-ai/deepseek-harness)

## Overview

@deepseek-ai/dsh-worktree is a Cordis plugin for DeepSeek Harness that provides isolated git worktree management. It adds a select_branch_worktree tool to the model and a worktree picker/switcher GUI component to the chat message box.

## Features

| Feature | Description |
|---------|-------------|
| 🌳 Create Worktrees | Create isolated git worktrees from fresh, head, branch, or PR base |
| 🔄 Switch Worktrees | Switch between existing worktrees from the GUI |
| 🗑️ Remove Worktrees | Remove worktrees you no longer need |
| 📋 List Worktrees | View all worktrees in the current repository |
| 🖱️ GUI Picker | Branch icon button in the chat composer bar |
| 💬 Command Interface | /worktree commands inserted into your draft |
| 🔒 Sandbox Safe | Path guards and locking for safe git execution |

## Installation

### Install from npm

```bash
npm install @deepseek-ai/dsh-worktree
```

### Install from source

```bash
git clone https://github.com/MojtabaFaraji/dsh-worktree.git
cd dsh-worktree
npm install
npm run build
```

## Activation

Add the plugin to your DeepSeek Harness profile's cordis.patch.yml:

```yaml
- insert:
    - id: worktree
      name: '@deepseek-ai/dsh-worktree'
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

After activation, a branch icon button appears in the chat composer bar alongside the command menu button:

```
[Type your message...] [branch icon | my-worktree] [command menu]
```

Click the branch icon to open the worktree menu:

| Menu Item | Action |
|-----------|--------|
| Switch to <branch> | Switches to an existing worktree |
| Create worktree... | Opens input to create a new worktree |
| Remove worktree... | Prompts for worktree name to remove |

The active worktree name is displayed next to the icon so you always know which worktree you're in.

### Command Interface

Each GUI action inserts a /worktree command into your draft. The model then executes it through the select_branch_worktree tool:

| Command | Description |
|---------|-------------|
| /worktree create <name> | Create a new isolated worktree |
| /worktree switch <name> | Switch to an existing worktree |
| /worktree list | List all worktrees in the repo |
| /worktree remove <name> | Remove a worktree |

### Creation Modes

| Mode | Description |
|------|-------------|
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

- Name: dsh-worktree-client
- Slot: conversation.input.left (chat message box)
- Order: 50

## Project Structure

```
dsh-worktree/
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

https://github.com/MojtabaFaraji/dsh-worktree

## Support

For issues and feature requests, please open an issue on GitHub.
