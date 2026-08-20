import * as Location from 'expo-location';

import { Coordinate } from '@/lib/journey';

/** A first fix indoors can take many seconds. Worth a short wait, never worth a stall. */
const LOCATION_WAIT_MS = 2_500;
const LAST_KNOWN_MAX_AGE_MS = 10 * 60 * 1000;

/**
 * Where the person is, for the parts of the app that ask a question about their surroundings —
 * whether a found place is the one they meant, how far away it is, how long it takes to get there.
 *
 * Null is a normal answer: the permission may be denied, and a device indoors may simply not know.
 * Every caller has something sensible to do without it, so none of them may treat this as an error.
 */
export async function readCurrentCoordinate(): Promise<Coordinate | null> {
  try {
    const permission = await Location.getForegroundPermissionsAsync();
    if (!permission.granted) return null;
    const last = await Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS });
    if (last) return { latitude: last.coords.latitude, longitude: last.coords.longitude };
    const current = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), LOCATION_WAIT_MS)),
    ]);
    return current ? { latitude: current.coords.latitude, longitude: current.coords.longitude } : null;
  } catch {
    return null;
  }
}
