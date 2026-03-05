import { execSync } from 'child_process';

/**
 * Run an AppleScript via osascript stdin to avoid shell quoting issues.
 */
function runAppleScript(script) {
  return execSync('osascript -', {
    input: script,
    encoding: 'utf-8',
    timeout: 10000,
  }).trim();
}

/**
 * Check if Terminal.app is currently running (without launching it).
 */
function isTerminalRunning() {
  try {
    const result = runAppleScript(
      'tell application "System Events" to return (exists (processes where name is "Terminal"))'
    );
    return result === 'true';
  } catch {
    return false;
  }
}

/**
 * Check if any Terminal.app windows with hivetest titles exist.
 */
export function windowsExist() {
  if (!isTerminalRunning()) return false;
  try {
    const result = runAppleScript(`
      tell application "Terminal"
        set found to false
        repeat with w in windows
          repeat with t in tabs of w
            if custom title of t starts with "hivetest-" then
              set found to true
              exit repeat
            end if
          end repeat
          if found then exit repeat
        end repeat
        return found
      end tell
    `);
    return result === 'true';
  } catch {
    return false;
  }
}

/**
 * Close all hivetest Terminal.app windows.
 * First kills processes on those TTYs, then closes the windows.
 */
export function closeWindows() {
  if (!isTerminalRunning()) return;
  try {
    // Get TTYs of hivetest windows and kill process groups
    const ttyList = runAppleScript(`
      tell application "Terminal"
        set ttyList to {}
        repeat with w in windows
          repeat with t in tabs of w
            if custom title of t starts with "hivetest-" then
              set end of ttyList to tty of t
            end if
          end repeat
        end repeat
        set AppleScript's text item delimiters to ","
        return ttyList as text
      end tell
    `);

    if (ttyList) {
      for (const tty of ttyList.split(',')) {
        const trimmed = tty.trim();
        if (trimmed) {
          try {
            // Kill all processes on this TTY
            execSync(`pkill -t ${trimmed.replace('/dev/', '')}`, { stdio: 'ignore' });
          } catch {
            // Process may already be gone
          }
        }
      }
    }

    // Brief delay to let processes exit
    execSync('sleep 0.5', { stdio: 'ignore' });

    // Close the Terminal windows by title
    runAppleScript(`
      tell application "Terminal"
        set windowsToClose to {}
        repeat with w in windows
          repeat with t in tabs of w
            if custom title of t starts with "hivetest-" then
              set end of windowsToClose to w
              exit repeat
            end if
          end repeat
        end repeat
        repeat with w in windowsToClose
          close w
        end repeat
      end tell
    `);
  } catch {
    // Best effort cleanup
  }
}

/**
 * Open Terminal.app windows for each instance in a grid layout.
 * Each instance should have { dir, command, env }.
 * layouts is an array of { x, y, width, height }.
 */
export function openWindows(instances, layouts) {
  const scriptParts = ['tell application "Terminal"', '  activate'];

  for (let i = 0; i < instances.length; i++) {
    const inst = instances[i];
    const layout = layouts[i];

    // Build shell command: export env vars, cd, run command
    const envExports = inst.env
      ? Object.entries(inst.env)
          .map(([k, v]) => `export ${k}=${shellQuote(v)}`)
          .join(' && ')
      : '';
    const shellCmd = [envExports, `cd ${shellQuote(inst.dir)}`, inst.command]
      .filter(Boolean)
      .join(' && ');

    // AppleScript bounds = {left, top, right, bottom}
    const left = layout.x;
    const top = layout.y;
    const right = layout.x + layout.width;
    const bottom = layout.y + layout.height;

    scriptParts.push(`  set newTab to do script ${asString(shellCmd)}`);
    scriptParts.push(`  set custom title of newTab to "hivetest-${i + 1}"`);
    scriptParts.push(`  set title displays custom title of newTab to true`);
    scriptParts.push(`  set bounds of window 1 to {${left}, ${top}, ${right}, ${bottom}}`);
  }

  scriptParts.push('end tell');
  runAppleScript(scriptParts.join('\n'));
}

/**
 * Shell-quote a string for use inside a shell command.
 */
function shellQuote(str) {
  return `'${str.replace(/'/g, "'\\''")}'`;
}

/**
 * Escape a string for use as an AppleScript string literal.
 */
function asString(str) {
  return `"${str.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
