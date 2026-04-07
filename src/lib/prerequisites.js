import { execSync } from 'child_process';
import chalk from 'chalk';
import { getProviderBinary, getProviderDisplayName } from './provider.js';

function commandExists(cmd) {
  try {
    execSync(`which ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function getVersion(cmd, flag = '--version') {
  try {
    return execSync(`${cmd} ${flag}`, { encoding: 'utf-8' }).trim();
  } catch {
    return null;
  }
}

export function checkPrerequisites(config) {
  const issues = [];
  const provider = config?.provider || 'claude';
  const providerBinary = getProviderBinary(provider);
  const providerName = getProviderDisplayName(provider);

  if (!commandExists(providerBinary)) {
    issues.push(
      provider === 'codex'
        ? 'codex CLI not found. Install Codex and ensure it is on your PATH.'
        : 'claude CLI not found. Install Claude Code: https://docs.anthropic.com/en/docs/claude-code'
    );
  }

  if (!commandExists('node')) {
    issues.push('node not found. Install Node.js >= 18.');
  }

  if (issues.length > 0) {
    console.error(chalk.red('\nMissing prerequisites:'));
    for (const issue of issues) {
      console.error(chalk.red(`  - ${issue}`));
    }
    process.exit(1);
  }

  return {
    provider,
    providerName,
    agent: getVersion(providerBinary, '--version'),
    node: getVersion('node'),
  };
}
