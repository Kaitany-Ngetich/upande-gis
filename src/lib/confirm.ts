import { Alert, Platform } from 'react-native';

/** Yes/no question that also works in the web preview (Alert is a no-op there). */
export function confirm(title: string, message: string, ok = 'OK'): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(globalThis.confirm?.(`${title}\n\n${message}`) ?? true);
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: ok, onPress: () => resolve(true) },
    ]),
  );
}
