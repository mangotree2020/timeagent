export const BOTTOM_NAV_MIN_HEIGHT = 72;
export const BOTTOM_NAV_TOP_PADDING = 10;
export const BOTTOM_NAV_ITEM_MIN_HEIGHT = 48;
export const BOTTOM_NAV_MIN_BOTTOM_PADDING = 10;
/** The voice button docked in the middle of the bar: this much of it rises above the bar's top edge. */
export const BOTTOM_NAV_ACTION_SIZE = 60;
export const BOTTOM_NAV_ACTION_OVERLAP = BOTTOM_NAV_ACTION_SIZE / 2;

export function getBottomNavigationPadding(bottomInset: number) {
  const safeInset = Number.isFinite(bottomInset) ? Math.max(0, bottomInset) : 0;
  return Math.max(safeInset, BOTTOM_NAV_MIN_BOTTOM_PADDING);
}

export function getBottomNavigationHeight(bottomInset: number) {
  return Math.max(
    BOTTOM_NAV_MIN_HEIGHT,
    BOTTOM_NAV_TOP_PADDING + BOTTOM_NAV_ITEM_MIN_HEIGHT + getBottomNavigationPadding(bottomInset),
  );
}

/** How far above the bar's top edge the docked voice button reaches; content needs this much clearance. */
export function getBottomNavigationActionReach(bottomInset: number) {
  return getBottomNavigationHeight(bottomInset) + BOTTOM_NAV_ACTION_OVERLAP;
}
