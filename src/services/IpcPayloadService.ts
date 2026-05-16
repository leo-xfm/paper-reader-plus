export function toIpcPlainObject<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
