import { execSync } from 'child_process';

const MENU_BAR_HEIGHT = 25;
const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;

/**
 * Detect the main display resolution on macOS.
 * Halves pixel dimensions for Retina displays.
 * Falls back to 1920x1080.
 */
export function getScreenResolution() {
  try {
    const json = execSync('system_profiler SPDisplaysDataType -json', {
      encoding: 'utf-8',
      timeout: 5000,
    });
    const data = JSON.parse(json);
    const displays = data.SPDisplaysDataType?.[0]?.spdisplays_ndrvs;
    if (!displays?.length) return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };

    // Find the main display (or use the first one)
    const main = displays.find((d) => d.spdisplays_main === 'spdisplays_yes') || displays[0];
    const res = main._spdisplays_resolution;
    if (!res) return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };

    // Parse "3456 x 2234" or "3456 x 2234 @ 60Hz" style strings
    const match = res.match(/(\d+)\s*x\s*(\d+)/);
    if (!match) return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };

    let width = parseInt(match[1], 10);
    let height = parseInt(match[2], 10);

    // Halve for Retina
    const isRetina =
      main.spdisplays_retina === 'spdisplays_yes' ||
      res.toLowerCase().includes('retina') ||
      main._spdisplays_pixels?.includes('Retina');
    if (isRetina) {
      width = Math.floor(width / 2);
      height = Math.floor(height / 2);
    }

    return { width, height };
  } catch {
    return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
  }
}

/**
 * Calculate window layouts for N instances in a grid.
 * Returns [{x, y, width, height}, ...] for each instance.
 */
export function calculateWindowLayouts(numInstances, screenWidth, screenHeight, minRows = 1) {
  const cols = numInstances <= 3 ? numInstances : 2;
  const rows = Math.max(Math.ceil(numInstances / cols), minRows);

  const usableHeight = screenHeight - MENU_BAR_HEIGHT;
  const cellWidth = Math.floor(screenWidth / cols);
  const cellHeight = Math.floor(usableHeight / rows);

  const layouts = [];
  for (let i = 0; i < numInstances; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    layouts.push({
      x: col * cellWidth,
      y: MENU_BAR_HEIGHT + row * cellHeight,
      width: cellWidth,
      height: cellHeight,
    });
  }

  return layouts;
}
