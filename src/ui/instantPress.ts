import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from 'react';

/**
 * Fire HUD actions on pointerdown so mobile taps feel instant.
 * Marks the element so the synthesized click is ignored (no double-toggle).
 * Keyboard activation still arrives via the native click path.
 */
export function instantPressProps(action: () => void) {
  return {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.dataset.instantPressed = '1';
      action();
    },
    onClick: (event: ReactMouseEvent<HTMLElement>) => {
      const el = event.currentTarget;
      if (el.dataset.instantPressed === '1') {
        delete el.dataset.instantPressed;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      event.stopPropagation();
      action();
    },
  };
}
