# hivetest-cli

QA test orchestrator for Claude Code and Codex — generate test plans, execute in parallel, aggregate results.

hivetest automates end-to-end QA testing using a two-phase model:

1. **Generate** — a high-capability model explores your application via browser, maps every section, and writes detailed test plans to disk
2. **Run** — efficient agent instances execute those plans in parallel via Terminal.app, each with its own browser and isolated working directory

Results are written incrementally per test case, then aggregated into a summary report.

## Prerequisites

- **Node.js** >= 18
- One supported agent CLI:
  - **Claude Code CLI** — [installation guide](https://docs.anthropic.com/en/docs/claude-code)
  - **Codex CLI**

## Installation

```bash
npm install -g hivetest-cli
```

## Quick Start

```bash
# 1. Initialize config, directories, and save password to .env
hivetest init

# 2. Generate test plans
hivetest generate

# 3. Execute plans in parallel
hivetest run

# 4. View aggregated results
hivetest report
```

## Commands

### `hivetest init`

Interactive setup that creates `hivetest.config.json` and the `testplans/` and `results/` directories.

Prompts for:
- Agent provider (`claude` or `codex`)
- Application name, URL, and description
- Test account email
- Test account password
- Jira project key (optional)
- MCP servers to import from an existing `.mcp.json`

Saves the password to a `.env` file in the project root (automatically gitignored).

Playwright MCP is added automatically if not already present.

### `hivetest generate`

Launches an interactive agent session for the configured provider and generate model. By default:
- Claude: `claude-opus-4-6`
- Codex: `gpt-5.4`

The session:
1. Navigates to your app and logs in
2. Maps all sections from the navigation
3. Queries the database schema via MCP
4. Writes a `CLAUDE.md` knowledge base with navigation map, schema docs, and a progress checklist
5. Explores each section in depth, writing a test plan file (`testplans/01-*.md`, `02-*.md`, ...) immediately after each section
6. Updates `CLAUDE.md` progress after each section

The session is interactive — you can observe and intervene at any time.

```
Usage: hivetest generate
```

### `hivetest run [plans...] [--max <n>]`

Executes test plans in parallel using Terminal.app. Each instance gets its own working directory with symlinked config, provider-specific runtime config, a dedicated Playwright browser profile, and a tiled browser window.

```
Usage: hivetest run [plans...] [options]

Arguments:
  plans          Plan numbers to execute (e.g., 05 06 07). Omit to select interactively.

Options:
  --max <n>      Max parallel instances (overrides config, capped at 4)
```

Plans are distributed across instances as evenly as possible. For example, `hivetest run 01 02 03 04 --max 2` assigns plans 01+03 to instance 1 and 02+04 to instance 2.

Each instance runs in its own Terminal.app window. Use `Cmd+Tab` to switch between them.

### `hivetest report [--output <file>] [--json]`

Aggregates results from all `results/*.md` files into a summary table showing pass/fail/blocked counts per test plan and overall pass rate.

```
Usage: hivetest report [options]

Options:
  --output <file>   Write summary to a file (plain-text markdown)
  --json            Output as JSON
```

### `hivetest clean [--force]`

Removes instance directories, Playwright temp directories, the `.hivetest/` temp directory, and closes any hivetest Terminal windows.

```
Usage: hivetest clean [options]

Options:
  --force   Skip confirmation prompt
```

## Configuration

`hivetest init` creates `hivetest.config.json` in the project root:

```json
{
  "provider": "claude",
  "name": "my-app",
  "url": "https://app.example.com",
  "description": "Brief description of the application",
  "auth": {
    "email": "test@example.com",
    "passwordEnvVar": "HIVETEST_PASSWORD"
  },
  "models": {
    "generate": "claude-opus-4-6",
    "execute": "claude-sonnet-4-6"
  },
  "directories": {
    "testPlans": "testplans",
    "results": "results"
  },
  "symlinks": ["CLAUDE.md"],
  "mcpServers": {},
  "playwright": {
    "command": "npx",
    "args": ["-y", "@playwright/mcp"],
    "userDataDirPrefix": "/tmp/hivetest-playwright"
  },
}
```

| Field | Description |
|-------|-------------|
| `provider` | Agent provider: `claude` or `codex` |
| `name` | Application name |
| `url` | Application URL (must start with `http://` or `https://`) |
| `description` | Brief description of the application under test |
| `auth.email` | Test account email address |
| `auth.passwordEnvVar` | Environment variable name for the password (always `HIVETEST_PASSWORD`) |
| `models.generate` | Model for the generate phase |
| `models.execute` | Model for the execute/run/test phases |
| `directories.testPlans` | Directory for generated test plan files |
| `directories.results` | Directory for test execution results |
| `symlinks` | Files symlinked into each instance directory |
| `mcpServers` | Additional MCP server configurations (imported from `.mcp.json`) |
| `playwright` | Playwright MCP configuration with per-instance user data dirs |

The `maxInstances` value is hardcoded to **4** (2x2 grid layout) and cannot be changed via config.

Recommended model pairings:

- Claude: `claude-opus-4-6` for `generate`, `claude-sonnet-4-6` for `execute`
- Codex: `gpt-5.4` for `generate`, `gpt-5.4-mini` for `execute`

## Authentication

`hivetest init` saves the test account password to a `.env` file in the project root. This file is automatically added to `.gitignore` so the password is never committed.

`hivetest run` (and `hivetest generate`) load `.env` automatically — no manual `export` needed.

If `.env` is absent or `HIVETEST_PASSWORD` is not set, both `generate` and `run` will prompt for the password interactively.

## Project Structure

After running `generate` and `run`, your project will look like:

```
your-project/
  hivetest.config.json    # Config created by init
  .env                    # Password (gitignored, created by init)
  CLAUDE.md               # Knowledge base created by generate
  testplans/
    01-auth-onboarding.md # Test plans created by generate
    02-dashboard.md
    ...
  results/
    01-auth-onboarding.md # Results created by run
    02-dashboard.md
    ...
  instance-1/             # Temporary instance dirs (removed by clean)
  instance-2/
```

Each instance directory is a shallow working copy with symlinks to `CLAUDE.md`, `testplans/`, `results/`, and its own `.mcp.json` configured with a unique Playwright browser profile.

- Claude instances receive a generated `.mcp.json`
- Codex instances receive a generated `.codex/config.toml`

## How It Works

**Generate phase**: A single agent session uses the Playwright MCP to control a browser, exploring every section of your application. It writes test plans incrementally to disk — one file per section — so progress survives context compaction or crashes. It also creates `CLAUDE.md` as a persistent knowledge base for the execute phase.

**Run phase**: Multiple agent instances launch in parallel in separate Terminal.app windows. Each instance gets assigned a subset of test plans, its own working directory, and a dedicated Playwright browser session. Browser windows are automatically tiled in a 2x2 grid on screen. Each instance reads its assigned test plans, executes test cases via the browser, and writes results to the shared `results/` directory after every test case.

**Report phase**: Parses all result files, counts PASS/FAIL/BLOCKED/PENDING per plan, calculates the overall pass rate, and optionally outputs JSON or writes a markdown summary file.

## License

MIT
