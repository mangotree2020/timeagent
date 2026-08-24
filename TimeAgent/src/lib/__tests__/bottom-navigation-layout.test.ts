import {
  BOTTOM_NAV_ACTION_OVERLAP,
  BOTTOM_NAV_ACTION_SIZE,
  getBottomNavigationActionReach,
  getBottomNavigationHeight,
} from '@/lib/bottom-navigation-layout';

describe('bottom navigation layout', () => {
  it('keeps the minimum navigation height and docks half of the voice button above it', () => {
    expect(getBottomNavigationHeight(0)).toBe(72);
    expect(BOTTOM_NAV_ACTION_OVERLAP).toBe(BOTTOM_NAV_ACTION_SIZE / 2);
    expect(getBottomNavigationActionReach(0)).toBe(72 + 30);
  });

  it('grows with an Android or iOS bottom safe-area inset', () => {
    expect(getBottomNavigationHeight(34)).toBe(92);
    expect(getBottomNavigationActionReach(34)).toBe(122);
  });

  it('does not let an invalid negative inset shrink the bar', () => {
    expect(getBottomNavigationHeight(-20)).toBe(72);
    expect(getBottomNavigationActionReach(-20)).toBe(102);
  });
});
