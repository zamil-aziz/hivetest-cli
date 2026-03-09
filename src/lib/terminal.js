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
export function windowsExist(type) {
  if (!isTerminalRunning()) return false;
  const prefix = type ? `hivetest-${type}-` : 'hivetest-';
  try {
    const result = runAppleScript(`
      tell application "Terminal"
        set found to false
        repeat with w in windows
          repeat with t in tabs of w
            if custom title of t starts with "${prefix}" then
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
export function closeWindows(userDataDirPrefix, fallbackTtys = [], fallbackWindowIds = [], type) {
  // Kill browser/Playwright processes matching hivetest's user-data-dir
  if (userDataDirPrefix) {
    try {
      execSync(`pkill -f ${shellQuote(userDataDirPrefix)}`, { stdio: 'ignore' });
    } catch {
      // No matching processes
    }
  }

  if (!isTerminalRunning()) return;
  try {
    // Get TTYs of hivetest windows by title
    let ttys = getTtysByTitle(type);
    if (ttys.length === 0) ttys = fallbackTtys;
    if (ttys.length === 0) return;

    // Collect window IDs BEFORE killing processes (TTYs are still valid)
    let windowIds = getWindowIdsByTty(ttys);
    if (windowIds.length === 0) windowIds = fallbackWindowIds;

    // Kill processes on TTYs (SIGTERM)
    for (const tty of ttys) {
      const ttyName = tty.replace('/dev/', '');
      try {
        execSync(`pkill -t ${ttyName}`, { stdio: 'ignore' });
      } catch {
        // Process may already be gone
      }
    }

    // Brief delay to let processes exit, then SIGKILL any survivors by PID
    // (ps -t catches processes like caffeinate that pkill -t misses)
    execSync('sleep 0.5', { stdio: 'ignore' });

    for (const tty of ttys) {
      const ttyName = tty.replace('/dev/', '');
      try {
        const pids = execSync(`ps -t ${ttyName} -o pid=`, { encoding: 'utf-8' }).trim();
        for (const pid of pids.split('\n').map(p => p.trim()).filter(Boolean)) {
          try { execSync(`kill -9 ${pid}`, { stdio: 'ignore' }); } catch {}
        }
      } catch {}
    }

    // Wait for killed processes to be fully reaped
    execSync('sleep 1', { stdio: 'ignore' });

    // Close windows by saved IDs (stable after process death)
    closeWindowsById(windowIds);
  } catch {
    // Best effort cleanup
  }
}

/**
 * Get TTYs of Terminal tabs with hivetest custom titles.
 */
function getTtysByTitle(type) {
  const prefix = type ? `hivetest-${type}-` : 'hivetest-';
  try {
    const result = runAppleScript(`
      tell application "Terminal"
        set ttyList to {}
        repeat with w in windows
          repeat with t in tabs of w
            if custom title of t starts with "${prefix}" then
              set end of ttyList to tty of t
            end if
          end repeat
        end repeat
        set AppleScript's text item delimiters to ","
        return ttyList as text
      end tell
    `);
    return result ? result.split(',').map(t => t.trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

/**
 * Open Terminal.app windows for each instance in a grid layout.
 * Each instance should have { dir, command, env }.
 * layouts is an array of { x, y, width, height }.
 */
export function openWindows(instances, layouts, type) {
  const scriptParts = ['tell application "Terminal"', '  activate', '  set ttyList to {}', '  set widList to {}'];

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
    scriptParts.push(`  set custom title of newTab to "hivetest-${type}-${i + 1}"`);
    scriptParts.push(`  set title displays custom title of newTab to true`);
    scriptParts.push(`  set bounds of window 1 to {${left}, ${top}, ${right}, ${bottom}}`);
    scriptParts.push(`  set end of ttyList to tty of newTab`);
    scriptParts.push(`  set end of widList to id of window 1`);
  }

  scriptParts.push('  set AppleScript\'s text item delimiters to ","');
  scriptParts.push('  return (ttyList as text) & "|" & (widList as text)');
  scriptParts.push('end tell');
  const result = runAppleScript(scriptParts.join('\n'));
  if (!result) return { ttys: [], windowIds: [] };
  const [ttyPart, widPart] = result.split('|');
  const ttys = ttyPart ? ttyPart.split(',').map(t => t.trim()).filter(Boolean) : [];
  const windowIds = widPart ? widPart.split(',').map(id => parseInt(id.trim(), 10)).filter(n => !isNaN(n)) : [];
  return { ttys, windowIds };
}

/**
 * Get Terminal window IDs matching the given TTYs (must be called while processes are alive).
 */
function getWindowIdsByTty(ttys) {
  if (ttys.length === 0) return [];
  const ttyListLiteral = ttys.map(t => `"${t}"`).join(', ');
  try {
    const result = runAppleScript(`
      tell application "Terminal"
        set targetTtys to {${ttyListLiteral}}
        set widList to {}
        repeat with w in windows
          repeat with t in tabs of w
            if tty of t is in targetTtys then
              set end of widList to id of w
              exit repeat
            end if
          end repeat
        end repeat
        set AppleScript's text item delimiters to ","
        return widList as text
      end tell
    `);
    return result ? result.split(',').map(id => parseInt(id.trim(), 10)).filter(n => !isNaN(n)) : [];
  } catch {
    return [];
  }
}

/**
 * Close Terminal windows by their stable integer IDs.
 */
function closeWindowsById(windowIds) {
  if (windowIds.length === 0) return;
  // Deduplicate IDs
  const uniqueIds = [...new Set(windowIds)];
  for (const wid of uniqueIds) {
    try {
      runAppleScript(`
        tell application "Terminal"
          repeat with w in windows
            if id of w is ${wid} then
              close w
              exit repeat
            end if
          end repeat
        end tell
      `);
    } catch {
      // Window may already be closed
    }
  }
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
