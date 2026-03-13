import { mkdir, rm, symlink, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { writeMcpConfig } from './mcp.js';

/**
 * Get the instance directory name for a given index.
 * Instances are siblings of the project directory.
 */
export function getInstanceDirName(config, index, type) {
  return `${config.name}-hivetest-${type}-${index}`;
}

export function getInstanceDir(projectDir, config, index, type) {
  const parent = dirname(projectDir);
  return resolve(parent, getInstanceDirName(config, index, type));
}

/**
 * Find existing instance directories.
 */
export async function findInstanceDirs(projectDir, config) {
  const parent = dirname(projectDir);
  const prefix = `${config.name}-hivetest-`;
  const entries = await readdir(parent, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && e.name.startsWith(prefix))
    .map((e) => resolve(parent, e.name))
    .sort();
}

/**
 * Create an instance directory with symlinks and .mcp.json.
 */
export async function createInstance(projectDir, config, index, windowLayout, type, headless) {
  const instanceDir = getInstanceDir(projectDir, config, index, type);

  // Create the instance directory
  if (existsSync(instanceDir)) {
    await rm(instanceDir, { recursive: true, force: true });
  }
  await mkdir(instanceDir, { recursive: true });

  // Create .playwright-mcp directory for browser data
  await mkdir(resolve(instanceDir, '.playwright-mcp'), { recursive: true });

  // Create symlinks to shared files/directories
  const itemsToLink = [
    ...config.symlinks,
    config.directories.testPlans,
    config.directories.results,
  ];

  for (const item of itemsToLink) {
    const source = resolve(projectDir, item);
    const target = resolve(instanceDir, item);
    if (existsSync(source)) {
      await symlink(source, target);
    }
  }

  // Write .mcp.json
  await writeMcpConfig(instanceDir, config, index, windowLayout, projectDir, headless);

  return instanceDir;
}

/**
 * Remove an instance directory.
 */
export async function destroyInstance(instanceDir) {
  if (existsSync(instanceDir)) {
    await rm(instanceDir, { recursive: true, force: true });
  }
}

/**
 * Remove all instance directories for a project.
 */
export async function destroyAllInstances(projectDir, config) {
  const dirs = await findInstanceDirs(projectDir, config);
  for (const dir of dirs) {
    await destroyInstance(dir);
  }
  return dirs;
}
