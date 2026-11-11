/**
 * Ask before leaving a page that would be lost by leaving (a Quickfire room).
 * A page sets a message while it's active; every way out (the leave button,
 * the title bar links, the browser's back button, closing the tab) asks first.
 */
let message: string | null = null;

export function setLeaveGuard(msg: string | null) {
  message = msg;
}

export function isGuarded(): boolean {
  return message !== null;
}

/** True if there's nothing to lose, or the player confirmed. */
export function confirmLeave(): boolean {
  return message === null || window.confirm(message);
}

addEventListener('beforeunload', (e) => {
  if (message === null) return;
  e.preventDefault();
  // Older browsers need returnValue set to show the prompt.
  e.returnValue = '';
});
