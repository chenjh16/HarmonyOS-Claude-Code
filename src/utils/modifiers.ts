export type ModifierKey = 'shift' | 'command' | 'control' | 'option'

let prewarmed = false
let keyspyAvailable = false

const modifierState: Record<string, boolean> = {
  shift: false,
  command: false,
  control: false,
  option: false,
}

const KEY_TO_MODIFIER: Record<string, ModifierKey> = {
  'LEFT SHIFT': 'shift',
  'RIGHT SHIFT': 'shift',
  'LEFT META': 'command',
  'RIGHT META': 'command',
  'LEFT CTRL': 'control',
  'RIGHT CTRL': 'control',
  'LEFT ALT': 'option',
  'RIGHT ALT': 'option',
}

/**
 * Pre-warm the keyboard listener by starting keyspy in the background.
 * Call this early to avoid delay on first use.
 */
export function prewarmModifiers(): void {
  if (prewarmed || process.platform !== 'darwin') {
    return
  }
  prewarmed = true
  try {
    const { GlobalKeyboardListener } = require('keyspy') as typeof import('keyspy')
    const listener = new GlobalKeyboardListener()
    listener.addListener((e, down) => {
      const modifier = KEY_TO_MODIFIER[e.name]
      if (modifier) {
        modifierState[modifier] = e.state === 'DOWN'
      }
    })
    keyspyAvailable = true
  } catch {
    // keyspy binary unavailable (e.g. compiled standalone binary) — fall back to no-op
  }
}

/**
 * Check if a specific modifier key is currently pressed (synchronous).
 * Uses keyspy's event tracking to maintain current modifier state.
 */
export function isModifierPressed(modifier: ModifierKey): boolean {
  if (process.platform !== 'darwin' || !keyspyAvailable) {
    return false
  }
  return modifierState[modifier] ?? false
}
