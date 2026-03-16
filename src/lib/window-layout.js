import { execSync } from 'child_process';

const MENU_BAR_HEIGHT = 25;
const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;

/**
 * Detect all connected displays via macOS JXA (NSScreen).
 * Returns array of { index, x, y, width, height, isMain, name }.
 * Coordinates are in top-left origin (screen coordinates used by AppleScript/Chrome).
 * Falls back to a single default display on failure.
 */
export function getAllDisplays() {
  try {
    const jxa = `
ObjC.import('AppKit');
var screens = $.NSScreen.screens;
var count = screens.count;
var mainFrame = screens.objectAtIndex(0).frame;
var mainHeight = mainFrame.size.height;
var result = [];
for (var i = 0; i < count; i++) {
  var screen = screens.objectAtIndex(i);
  var frame = screen.frame;
  var nsX = frame.origin.x;
  var nsY = frame.origin.y;
  var w = frame.size.width;
  var h = frame.size.height;
  var screenY = mainHeight - nsY - h;
  var name = screen.localizedName.js;
  result.push({ index: i + 1, x: nsX, y: screenY, width: w, height: h, isMain: i === 0, name: name });
}
JSON.stringify(result);
`;
    const output = execSync(`osascript -l JavaScript -e '${jxa.replace(/'/g, "'\\''")}'`, {
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();
    const displays = JSON.parse(output);
    if (displays.length > 0) return displays;
  } catch {
    // fall through to default
  }
  return [{ index: 1, x: 0, y: 0, width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT, isMain: true, name: 'Main' }];
}

/**
 * Calculate window layouts for N instances in a grid.
 * Accepts a display object { x, y, width, height }.
 * Returns [{x, y, width, height}, ...] for each instance.
 */
export function calculateWindowLayouts(numInstances, display) {
  const { x: displayX, y: displayY, width: screenWidth, height: screenHeight } = display;
  let cols;
  if (numInstances <= 3) {
    cols = numInstances;
  } else if (numInstances <= 4) {
    cols = 2;
  } else if (numInstances <= 6) {
    cols = 3;
  } else if (numInstances <= 8) {
    cols = 4;
  } else if (numInstances <= 9) {
    cols = 3;
  } else {
    cols = 4;
  }
  const rows = Math.ceil(numInstances / cols);

  const usableHeight = screenHeight - MENU_BAR_HEIGHT;
  const cellWidth = Math.floor(screenWidth / cols);
  const cellHeight = Math.floor(usableHeight / rows);

  const layouts = [];
  for (let i = 0; i < numInstances; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    layouts.push({
      x: displayX + col * cellWidth,
      y: displayY + MENU_BAR_HEIGHT + row * cellHeight,
      width: cellWidth,
      height: cellHeight,
    });
  }

  return layouts;
}
