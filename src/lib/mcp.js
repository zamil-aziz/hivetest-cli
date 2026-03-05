import { writeFile } from 'fs/promises';
import { resolve } from 'path';

/**
 * Write a Playwright MCP config file with browser launch options for window positioning.
 * Returns the path to the config file.
 */
export async function writePlaywrightConfig(instanceDir, windowLayout) {
  const config = {
    browser: {
      launchOptions: {
        args: [
          `--window-position=${windowLayout.x},${windowLayout.y}`,
          `--window-size=${windowLayout.width},${windowLayout.height}`,
          '--force-device-scale-factor=0.45',
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
export function buildMcpConfig(config, instanceIndex, playwrightConfigPath) {
  const mcpServers = { ...config.mcpServers };

  // Add Playwright with unique user-data-dir per instance
  if (config.playwright) {
    const userDataDir = `${config.playwright.userDataDirPrefix}-${instanceIndex}`;
    const playwrightArgs = [...config.playwright.args];

    // Add --user-data-dir if not already present
    if (!playwrightArgs.some((a) => a.includes('user-data-dir'))) {
      playwrightArgs.push(`--user-data-dir=${userDataDir}`);
    }

    // Add --config for window layout if provided
    if (playwrightConfigPath) {
      playwrightArgs.push(`--config=${playwrightConfigPath}`);
    }

    mcpServers.playwright = {
      command: config.playwright.command,
      args: playwrightArgs,
    };
  }

  return { mcpServers };
}

export async function writeMcpConfig(instanceDir, config, instanceIndex, windowLayout) {
  let playwrightConfigPath;
  if (windowLayout) {
    playwrightConfigPath = await writePlaywrightConfig(instanceDir, windowLayout);
  }

  const mcpConfig = buildMcpConfig(config, instanceIndex, playwrightConfigPath);
  const mcpPath = resolve(instanceDir, '.mcp.json');
  await writeFile(mcpPath, JSON.stringify(mcpConfig, null, 2) + '\n');
  return mcpPath;
}
