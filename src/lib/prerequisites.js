import { execSync } from 'child_process';
import chalk from 'chalk';

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

export function checkPrerequisites({ needTmux = false } = {}) {
  const issues = [];

  if (!commandExists('claude')) {
    issues.push('claude CLI not found. Install Claude Code: https://docs.anthropic.com/en/docs/claude-code');
  }

  if (!commandExists('node')) {
    issues.push('node not found. Install Node.js >= 18.');
  }

  if (needTmux && !commandExists('tmux')) {
    issues.push('tmux not found. Install tmux: brew install tmux');
  }

  if (issues.length > 0) {
    console.error(chalk.red('\nMissing prerequisites:'));
    for (const issue of issues) {
      console.error(chalk.red(`  - ${issue}`));
    }
    process.exit(1);
  }

  return {
    claude: getVersion('claude', '--version'),
    node: getVersion('node'),
    tmux: needTmux ? getVersion('tmux', '-V') : null,
  };
}
