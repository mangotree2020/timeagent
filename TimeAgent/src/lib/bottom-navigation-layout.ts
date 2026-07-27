export const BOTTOM_NAV_MIN_HEIGHT = 72;
export const BOTTOM_NAV_TOP_PADDING = 10;
export const BOTTOM_NAV_ITEM_MIN_HEIGHT = 48;
export const BOTTOM_NAV_MIN_BOTTOM_PADDING = 10;
export const HOME_FLOATING_ACTION_GAP = 12;

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

export function getHomeFloatingActionBottom(bottomInset: number) {
  return getBottomNavigationHeight(bottomInset) + HOME_FLOATING_ACTION_GAP;
}
