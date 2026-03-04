import { writeFile } from 'fs/promises';
import { resolve } from 'path';

/**
 * Generate a .mcp.json for an instance directory.
 * Copies all base mcpServers and adds Playwright with a unique user-data-dir.
 */
export function buildMcpConfig(config, instanceIndex) {
  const mcpServers = { ...config.mcpServers };

  // Add Playwright with unique user-data-dir per instance
  if (config.playwright) {
    const userDataDir = `${config.playwright.userDataDirPrefix}-${instanceIndex}`;
    const playwrightArgs = [...config.playwright.args];

    // Add --user-data-dir if not already present
    if (!playwrightArgs.some((a) => a.includes('user-data-dir'))) {
      playwrightArgs.push(`--user-data-dir=${userDataDir}`);
    }

    mcpServers.playwright = {
      command: config.playwright.command,
      args: playwrightArgs,
    };
  }

  return { mcpServers };
}

export async function writeMcpConfig(instanceDir, config, instanceIndex) {
  const mcpConfig = buildMcpConfig(config, instanceIndex);
  const mcpPath = resolve(instanceDir, '.mcp.json');
  await writeFile(mcpPath, JSON.stringify(mcpConfig, null, 2) + '\n');
  return mcpPath;
}
