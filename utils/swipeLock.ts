// utils/swipeLock.ts — pauses the swipe-between-tabs gesture while a widget is being dragged,
// so a drag that drifts sideways never turns into a page change (and never freezes the drag).
// A plain flag, read by the tab gesture on the JS thread: no re-render when it flips.
let locked = false;

export function setSwipeLocked(next: boolean): void {
  locked = next;
}

export function isSwipeLocked(): boolean {
  return locked;
}
