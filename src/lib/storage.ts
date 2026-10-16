// Small settings kept between launches (ERP address, email, whether the
// last session was the demo). Secure storage on phones; never the password.
import * as SecureStore from 'expo-secure-store';

export async function getSetting(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function setSetting(key: string, value: string | null): Promise<void> {
  try {
    if (value == null) await SecureStore.deleteItemAsync(key);
    else await SecureStore.setItemAsync(key, value);
  } catch {
    // not fatal - the user just types it again next time
  }
}
