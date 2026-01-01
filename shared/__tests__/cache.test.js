const cache = require('../cache');

describe('Memory Cache', () => {
  beforeEach(() => {
    cache.clear();
  });

  afterAll(() => {
    cache.clear();
  });

  test('should set and get value', () => {
    cache.set('test', 'value');
    expect(cache.get('test')).toBe('value');
  });

  test('should return null for non-existent key', () => {
    expect(cache.get('nonexistent')).toBeNull();
  });

  test('should check if key exists', () => {
    cache.set('test', 'value');
    expect(cache.has('test')).toBe(true);
    expect(cache.has('nonexistent')).toBe(false);
  });

  test('should delete key', () => {
    cache.set('test', 'value');
    cache.delete('test');
    expect(cache.has('test')).toBe(false);
  });

  test('should expire after TTL', done => {
    cache.set('test', 'value', 100); // 100ms TTL
    
    setTimeout(() => {
      expect(cache.has('test')).toBe(false);
      done();
    }, 150);
  });

  test('should get cache size', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    expect(cache.size()).toBe(2);
  });

  test('should clear all cache', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.clear();
    expect(cache.size()).toBe(0);
  });

  test('should getOrSet pattern', async () => {
    let fetchCount = 0;
    const fetchFn = async () => {
      fetchCount++;
      return 'fetched-value';
    };

    // First call should fetch
    const value1 = await cache.getOrSet('test', fetchFn);
    expect(value1).toBe('fetched-value');
    expect(fetchCount).toBe(1);

    // Second call should use cache
    const value2 = await cache.getOrSet('test', fetchFn);
    expect(value2).toBe('fetched-value');
    expect(fetchCount).toBe(1); // Still 1, not fetched again
  });
});
