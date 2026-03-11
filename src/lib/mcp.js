import { writeFile } from 'fs/promises';
import { resolve } from 'path';

/**
 * Write a Playwright MCP config file with browser launch options for window positioning.
 * Returns the path to the config file.
 */
export async function writePlaywrightConfig(instanceDir, windowLayout, userDataDir, contextOptions) {
  const config = {
    browser: {
      ...(userDataDir && { userDataDir }),
      ...(contextOptions && { contextOptions }),
      launchOptions: {
        headless: false,
        args: [
          `--window-position=${windowLayout.x},${windowLayout.y}`,
          `--window-size=${windowLayout.width},${windowLayout.height}`,
        ],
      },
    },
  };
  const configPath = resolve(instanceDir, 'playwright-mcp-config.json');
  await writeFile(configPath, JSON.stringify(config, null, 2) + '\n');
  return configPath;
}

/**
 * Generate a .mcp.json for an instance directory.
 * Copies all base mcpServers and adds Playwright with a unique user-data-dir.
 */
export function buildMcpConfig(config, instanceIndex, playwrightConfigPath, projectDir) {
  const mcpServers = { ...config.mcpServers };

  // Add database MCP server if configured
  if (config.database && projectDir) {
    const tomlPath = resolve(projectDir, config.database.tomlFile);
    mcpServers[config.database.sourceId] = {
      command: 'npx',
      args: ['-y', '@bytebase/dbhub', '--config', tomlPath],
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

  return { mcpServers };
}

export async function writeMcpConfig(instanceDir, config, instanceIndex, windowLayout, projectDir) {
  let playwrightConfigPath;
  if (windowLayout) {
    const userDataDir = config.playwright
      ? `${config.playwright.userDataDirPrefix}-${instanceIndex}`
      : undefined;
    playwrightConfigPath = await writePlaywrightConfig(instanceDir, windowLayout, userDataDir, config.playwright?.contextOptions);
  }

  const mcpConfig = buildMcpConfig(config, instanceIndex, playwrightConfigPath, projectDir || instanceDir);
  const mcpPath = resolve(instanceDir, '.mcp.json');
  await writeFile(mcpPath, JSON.stringify(mcpConfig, null, 2) + '\n');
  return mcpPath;
}
