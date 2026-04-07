import { mkdir, rm, symlink, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { writeRuntimeConfig } from './mcp.js';

/**
 * Get the instance directory name for a given index.
 * Instances live inside the project so Codex inherits trusted-project config.
 */
export function getInstanceDirName(config, index, type) {
  return `${config.name}-hivetest-${type}-${index}`;
}

function getInstancesRoot(projectDir) {
  return resolve(projectDir, '.hivetest', 'instances');
}

export function getInstanceDir(projectDir, config, index, type) {
  return resolve(getInstancesRoot(projectDir), getInstanceDirName(config, index, type));
}

/**
 * Find existing instance directories.
 */
export async function findInstanceDirs(projectDir, config) {
  const prefix = `${config.name}-hivetest-`;
  const roots = [
    getInstancesRoot(projectDir),
    dirname(projectDir),
  ];
  const dirs = [];

  for (const root of roots) {
    if (!existsSync(root)) {
      continue;
    }

    const entries = await readdir(root, { withFileTypes: true });
    dirs.push(
      ...entries
        .filter((e) => e.isDirectory() && e.name.startsWith(prefix))
        .map((e) => resolve(root, e.name))
    );
  }

  return [...new Set(dirs)].sort();
}

/**
 * Create an instance directory with symlinks and provider runtime config.
 */
export async function createInstance(projectDir, config, index, windowLayout, type, headless, model) {
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

  // Write provider runtime config
  await writeRuntimeConfig(instanceDir, config, index, windowLayout, projectDir, headless, model, {
    includeInstructionsFile: existsSync(resolve(instanceDir, 'CLAUDE.md')),
  });

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
