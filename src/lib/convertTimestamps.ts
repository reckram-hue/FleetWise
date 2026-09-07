// Normalize Firestore SDK and callable-serialized timestamps without mutating
// inputs or changing collection shapes.
export function convertTimestamps(data: any): any {
  if (data === null || typeof data !== 'object') return data;
  if (data instanceof Date) return data;
  if (Array.isArray(data)) return data.map(convertTimestamps);
  if (typeof data.toDate === 'function') return data.toDate();
  if ('seconds' in data && 'nanoseconds' in data) {
    return new Date(data.seconds * 1000 + data.nanoseconds / 1000000);
  }
  if ('_seconds' in data && '_nanoseconds' in data) {
    return new Date(data._seconds * 1000 + data._nanoseconds / 1000000);
  }
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, convertTimestamps(value)]));
}
