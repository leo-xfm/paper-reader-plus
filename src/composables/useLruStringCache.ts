export function createLruStringCache(maxEntries = 50) {
  const entries = new Map<string, string>();

  function get(key: string) {
    const value = entries.get(key);
    if (value === undefined) return undefined;
    entries.delete(key);
    entries.set(key, value);
    return value;
  }

  function set(key: string, value: string) {
    if (entries.has(key)) entries.delete(key);
    entries.set(key, value);
    while (entries.size > maxEntries) {
      const oldest = entries.keys().next().value;
      if (oldest === undefined) break;
      entries.delete(oldest);
    }
  }

  function clear() {
    entries.clear();
  }

  function snapshot() {
    return new Map(entries);
  }

  return {
    get,
    set,
    clear,
    snapshot,
  };
}
