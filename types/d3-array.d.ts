declare module 'd3-array' {
  export function group<T, K>(data: T[], key: (item: T) => K): Map<K, T[]>;

  export function group<T, K1, K2>(data: T[], key1: (item: T) => K1, key2: (item: T) => K2): Map<K1, Map<K2, T[]>>;

  export function group<T, K1, K2, K3>(
    data: T[],
    key1: (item: T) => K1,
    key2: (item: T) => K2,
    key3: (item: T) => K3
  ): Map<K1, Map<K2, Map<K3, T[]>>>;
}
