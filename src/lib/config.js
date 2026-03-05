import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve } from 'path';

const CONFIG_FILE = 'hivetest.config.json';

const REQUIRED_FIELDS = ['name', 'url', 'auth', 'mcpServers'];

export function getConfigPath(dir = process.cwd()) {
  return resolve(dir, CONFIG_FILE);
}

export function configExists(dir = process.cwd()) {
  return existsSync(getConfigPath(dir));
}

export async function loadConfig(dir = process.cwd()) {
  const configPath = getConfigPath(dir);

  if (!existsSync(configPath)) {
    throw new Error(
      `No ${CONFIG_FILE} found in ${dir}. Run "hivetest init" first.`
    );
  }

  const raw = await readFile(configPath, 'utf-8');
  let config;

  try {
    config = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in ${CONFIG_FILE}`);
  }

  for (const field of REQUIRED_FIELDS) {
    if (!config[field]) {
      throw new Error(`Missing required field "${field}" in ${CONFIG_FILE}`);
    }
  }

  if (!config.auth.email) {
    throw new Error('Missing auth.email in config');
  }

  if (!config.auth.passwordEnvVar) {
    throw new Error('Missing auth.passwordEnvVar in config');
  }

  // Apply defaults
  config.models = {
    generate: 'claude-opus-4-6',
    execute: 'claude-sonnet-4-6',
    ...config.models,
  };

  config.directories = {
    testPlans: 'testplans',
    results: 'results',
    ...config.directories,
  };

  config.maxInstances = 4;
  config.symlinks = config.symlinks || [];

  return config;
}

export function getPassword(config) {
  const envVar = config.auth.passwordEnvVar;
  return process.env[envVar] || null;
}

export async function loadDotEnv(dir) {
  const dotenvPath = resolve(dir, '.env');
  if (!existsSync(dotenvPath)) return;
  const lines = (await readFile(dotenvPath, 'utf-8')).split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key && !(key in process.env)) process.env[key] = value;
  }
}
