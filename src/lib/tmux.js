import { execSync } from 'child_process';

const SESSION_NAME = 'hivetest';

/**
 * Check if a tmux session exists.
 */
export function sessionExists() {
  try {
    execSync(`tmux has-session -t ${SESSION_NAME} 2>/dev/null`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Kill the hivetest tmux session if it exists.
 */
export function killSession() {
  if (sessionExists()) {
    execSync(`tmux kill-session -t ${SESSION_NAME}`);
    return true;
  }
  return false;
}

/**
 * Create a tmux session and launch Claude Code in panes.
 * Each entry in `instances` should have { dir, command, env }.
 * `env` is an object of environment variables to export in the pane.
 */
export function createSession(instances) {
  if (sessionExists()) {
    killSession();
  }

  // Create session with first instance
  const first = instances[0];
  execSync(
    `tmux new-session -d -s ${SESSION_NAME} -c ${escapeForTmux(first.dir)}`,
    { stdio: 'ignore' }
  );

  // Send the command to the first pane
  sendCommand(`${SESSION_NAME}:0.0`, first.dir, first.command, first.env);

  // Create additional panes for remaining instances
  for (let i = 1; i < instances.length; i++) {
    const inst = instances[i];
    // Split the window to create a new pane
    execSync(
      `tmux split-window -t ${SESSION_NAME} -c ${escapeForTmux(inst.dir)}`,
      { stdio: 'ignore' }
    );
    sendCommand(`${SESSION_NAME}:0.${i}`, inst.dir, inst.command, inst.env);

    // Re-layout after each split to keep panes even
    execSync(`tmux select-layout -t ${SESSION_NAME} tiled`, { stdio: 'ignore' });
  }

  return SESSION_NAME;
}

/**
 * Send a command to a tmux pane, optionally exporting env vars first.
 */
function sendCommand(target, dir, command, env) {
  // Build the full command: export env vars, cd, then run
  const parts = [];

  if (env) {
    for (const [key, value] of Object.entries(env)) {
      parts.push(`export ${key}=${escapeForTmux(value)}`);
    }
  }

  parts.push(`cd ${escapeForTmux(dir)} && ${command}`);

  const fullCommand = parts.join(' && ');
  execSync(
    `tmux send-keys -t "${target}" ${escapeForTmux(fullCommand)} Enter`,
    { stdio: 'ignore' }
  );
}

/**
 * Attach to the hivetest tmux session.
 */
export function attachSession() {
  execSync(`tmux attach-session -t ${SESSION_NAME}`, { stdio: 'inherit' });
}

/**
 * Escape a string for tmux send-keys.
 */
function escapeForTmux(str) {
  // Use single-quote wrapping with escaped inner single-quotes
  return `'${str.replace(/'/g, "'\\''")}'`;
}
