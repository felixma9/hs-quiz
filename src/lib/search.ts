/**
 * Type-ahead matches: items whose key starts with the query first, then ones
 * that contain it, in list order. One pass, at most `limit` results.
 */
export function rank<T>(items: T[], query: string, key: (item: T) => string, limit: number): T[] {
  const starts: T[] = [];
  const inside: T[] = [];
  for (const it of items) {
    const k = key(it);
    if (k.startsWith(query)) {
      starts.push(it);
      if (starts.length >= limit) break;
    } else if (inside.length < limit && k.includes(query)) inside.push(it);
  }
  return [...starts, ...inside].slice(0, limit);
}
