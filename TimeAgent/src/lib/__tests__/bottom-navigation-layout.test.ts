import {
  getBottomNavigationHeight,
  getHomeFloatingActionBottom,
} from '@/lib/bottom-navigation-layout';

describe('bottom navigation layout', () => {
  it('keeps the floating action above the minimum navigation height', () => {
    expect(getBottomNavigationHeight(0)).toBe(72);
    expect(getHomeFloatingActionBottom(0)).toBe(84);
  });

  it('moves the floating action up with an Android or iOS bottom safe-area inset', () => {
    expect(getBottomNavigationHeight(34)).toBe(92);
    expect(getHomeFloatingActionBottom(34)).toBe(104);
  });

  it('does not allow invalid negative insets to move the action under navigation', () => {
    expect(getHomeFloatingActionBottom(-20)).toBe(84);
  });
});
