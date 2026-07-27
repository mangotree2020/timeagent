import * as Location from 'expo-location';

import { JourneyLocation, LocationProvider } from '@/lib/journey';

export class LocationPermissionDeniedError extends Error {
  readonly name = 'LocationPermissionDeniedError';
}

export class ExpoLocationProvider implements LocationProvider {
  async getCurrentLocation(): Promise<JourneyLocation> {
    let permission = await Location.getForegroundPermissionsAsync();
    if (!permission.granted && permission.canAskAgain) {
      permission = await Location.requestForegroundPermissionsAsync();
    }
    if (!permission.granted) {
      throw new LocationPermissionDeniedError('위치 권한이 허용되지 않았습니다.');
    }

    const lastKnown = await Location.getLastKnownPositionAsync({
      maxAge: 30_000,
      requiredAccuracy: 100,
    });
    const position = lastKnown ?? await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    return {
      coordinate: {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      },
      accuracyMeters: position.coords.accuracy,
      headingDegrees: position.coords.heading,
      capturedAt: position.timestamp,
    };
  }
}
