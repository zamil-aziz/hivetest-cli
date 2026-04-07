import { mkdir, writeFile } from 'fs/promises';
import { resolve } from 'path';

/**
 * Write a Playwright MCP config file with browser launch options for window positioning.
 * Returns the path to the config file.
 */
export async function writePlaywrightConfig(instanceDir, windowLayout, userDataDir, contextOptions, headless) {
  const launchOptions = headless
    ? { headless: true }
    : {
        headless: false,
        args: [
          `--window-position=${windowLayout.x},${windowLayout.y}`,
          `--window-size=${windowLayout.width},${windowLayout.height}`,
        ],
      };

  const config = {
    browser: {
      ...(userDataDir && { userDataDir }),
      ...(contextOptions && { contextOptions }),
      launchOptions,
    },
  };
  const configPath = resolve(instanceDir, 'playwright-mcp-config.json');
  await writeFile(configPath, JSON.stringify(config, null, 2) + '\n');
  return configPath;
}

/**
 * Build the effective MCP server map for the active provider runtime.
 */
export function buildRuntimeMcpServers(config, instanceIndex, playwrightConfigPath, projectDir) {
  const mcpServers = { ...config.mcpServers };

  // Add database MCP server if configured
  if (config.database && projectDir) {
    const tomlPath = resolve(projectDir, config.database.tomlFile);
    mcpServers[config.database.sourceId] = {
      command: 'npx',
      args: ['-y', '@bytebase/dbhub', '--config', tomlPath],
    };
  }

  // Add Atlassian MCP server if Jira is configured (skip if manually imported)
  if (config.jira?.url && !mcpServers.atlassian) {
    mcpServers.atlassian = {
      command: 'uvx',
      args: [
        'mcp-atlassian',
        '--jira-url', config.jira.url,
        '--jira-username', process.env.JIRA_USERNAME || '',
        '--jira-token', process.env.JIRA_API_TOKEN || '',
      ],
    };
  }

  // Add Playwright with unique user-data-dir per instance
  if (config.playwright) {
    const playwrightArgs = [...config.playwright.args];

    // If config file is used, it contains userDataDir — only add --config flag.
    // Otherwise fall back to CLI --user-data-dir flag.
    if (playwrightConfigPath) {
      playwrightArgs.push(`--config=${playwrightConfigPath}`);
    } else {
      const userDataDir = `${config.playwright.userDataDirPrefix}-${instanceIndex}`;
      if (!playwrightArgs.some((a) => a.includes('user-data-dir'))) {
        playwrightArgs.push(`--user-data-dir=${userDataDir}`);
      }
    }

    mcpServers.playwright = {
      command: config.playwright.command,
      args: playwrightArgs,
    };
  }

  return mcpServers;
}

function formatTomlKey(key) {
  return /^[A-Za-z0-9_-]+$/.test(key) ? key : JSON.stringify(key);
}

function formatTomlValue(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => formatTomlValue(item)).join(', ')}]`;
  }

  if (typeof value === 'string') {
    return JSON.stringify(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  throw new Error(`Unsupported TOML value: ${value}`);
}

function isTomlTable(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function renderTomlTable(table, path = []) {
  const lines = [];
  const scalarEntries = [];
  const tableEntries = [];

  for (const [key, value] of Object.entries(table)) {
    if (value === undefined) continue;

    if (isTomlTable(value)) {
      tableEntries.push([key, value]);
    } else {
      scalarEntries.push([key, value]);
    }
  }

  if (path.length > 0) {
    lines.push(`[${path.map((segment) => formatTomlKey(segment)).join('.')}]`);
  }

  for (const [key, value] of scalarEntries) {
    lines.push(`${formatTomlKey(key)} = ${formatTomlValue(value)}`);
  }

  for (const [key, value] of tableEntries) {
    if (lines.length > 0) {
      lines.push('');
    }
    lines.push(...renderTomlTable(value, [...path, key]));
  }

  return lines;
}

function buildCodexRuntimeConfig({ model, mcpServers, includeInstructionsFile }) {
  return {
    ...(model && { model }),
    ...(includeInstructionsFile && { model_instructions_file: '../CLAUDE.md' }),
    mcp_servers: mcpServers,
  };
}

export function getRuntimeConfigPath(provider, dir) {
  return provider === 'codex'
    ? resolve(dir, '.codex', 'config.toml')
    : resolve(dir, '.mcp.json');
}

async function writeClaudeRuntimeConfig(instanceDir, config, instanceIndex, windowLayout, projectDir, headless) {
  let playwrightConfigPath;
  if (windowLayout || headless) {
    const userDataDir = config.playwright
      ? `${config.playwright.userDataDirPrefix}-${instanceIndex}`
      : undefined;
    playwrightConfigPath = await writePlaywrightConfig(instanceDir, windowLayout, userDataDir, config.playwright?.contextOptions, headless);
  }

  const mcpConfig = {
    mcpServers: buildRuntimeMcpServers(config, instanceIndex, playwrightConfigPath, projectDir || instanceDir),
  };
  const mcpPath = getRuntimeConfigPath('claude', instanceDir);
  await writeFile(mcpPath, JSON.stringify(mcpConfig, null, 2) + '\n');
  return mcpPath;
}

async function writeCodexRuntimeConfig(instanceDir, config, instanceIndex, windowLayout, projectDir, headless, model, includeInstructionsFile) {
  let playwrightConfigPath;
  if (windowLayout || headless) {
    const userDataDir = config.playwright
      ? `${config.playwright.userDataDirPrefix}-${instanceIndex}`
      : undefined;
    playwrightConfigPath = await writePlaywrightConfig(instanceDir, windowLayout, userDataDir, config.playwright?.contextOptions, headless);
  }

  const mcpServers = buildRuntimeMcpServers(config, instanceIndex, playwrightConfigPath, projectDir || instanceDir);
  const codexConfig = buildCodexRuntimeConfig({
    model,
    mcpServers,
    includeInstructionsFile,
  });
  const codexDir = resolve(instanceDir, '.codex');
  const codexPath = getRuntimeConfigPath('codex', instanceDir);
  const lines = renderTomlTable(codexConfig);

  await mkdir(codexDir, { recursive: true });
  await writeFile(codexPath, lines.join('\n') + '\n');
  return codexPath;
}

export async function writeRuntimeConfig(instanceDir, config, instanceIndex, windowLayout, projectDir, headless, model, options = {}) {
  if (config.provider === 'codex') {
    return writeCodexRuntimeConfig(
      instanceDir,
      config,
      instanceIndex,
      windowLayout,
      projectDir,
      headless,
      model,
      options.includeInstructionsFile !== false
    );
  }

  return writeClaudeRuntimeConfig(instanceDir, config, instanceIndex, windowLayout, projectDir, headless);
}
