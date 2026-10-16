// Web build (used for previews): expo-secure-store has no web support.
export async function getSetting(key: string): Promise<string | null> {
  try {
    return globalThis.localStorage?.getItem(`upande-gis.${key}`) ?? null;
  } catch {
    return null;
  }
}

export async function setSetting(key: string, value: string | null): Promise<void> {
  try {
    if (value == null) globalThis.localStorage?.removeItem(`upande-gis.${key}`);
    else globalThis.localStorage?.setItem(`upande-gis.${key}`, value);
  } catch {
    // private mode etc. - fine
  }
}
