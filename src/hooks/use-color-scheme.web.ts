import { useSyncExternalStore } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

const noSubscribe = () => () => {};

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web:
 * the server snapshot is 'light', the client one is the real scheme.
 */
export function useColorScheme() {
  const hydrated = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
  const colorScheme = useRNColorScheme();
  return hydrated ? colorScheme : 'light';
}
