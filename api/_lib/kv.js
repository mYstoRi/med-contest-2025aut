import { kv } from '@vercel/kv';

// Cache TTL in seconds (5 minutes) - for temporary data like sessions
const CACHE_TTL = 5 * 60;

/**
 * Get cached data by key
 * @param {string} key - Cache key
 * @returns {Promise<any>} Cached value or null
 */
export async function getCache(key) {
    try {
        const data = await kv.get(key);
        return data;
    } catch (error) {
        console.error(`KV get error for key ${key}:`, error);
        return null;
    }
}

/**
 * Set cached data with TTL (for temporary data)
 * @param {string} key - Cache key
 * @param {any} value - Value to cache
 * @param {number} ttl - TTL in seconds (default: 5 minutes)
 */
export async function setCache(key, value, ttl = CACHE_TTL) {
    try {
        await kv.set(key, value, { ex: ttl });
    } catch (error) {
        console.error(`KV set error for key ${key}:`, error);
    }
}

/**
 * Set data permanently (no TTL) - for main data that persists until sync
 * @param {string} key - Data key
 * @param {any} value - Value to store
 */
export async function setDataPermanent(key, value) {
    try {
        await kv.set(key, value);
    } catch (error) {
        console.error(`KV permanent set error for key ${key}:`, error);
    }
}

/**
 * Delete cached data
 * @param {string} key - Cache key
 */
export async function deleteCache(key) {
    try {
        await kv.del(key);
    } catch (error) {
        console.error(`KV delete error for key ${key}:`, error);
    }
}

/**
 * Get cache metadata (last sync time, etc.)
 */
export async function getCacheMeta() {
    return getCache('data:meta');
}

/**
 * Update cache metadata (permanent - no TTL)
 */
export async function setCacheMeta(meta) {
    return setDataPermanent('data:meta', meta);
}

// Data keys (permanent storage)
export const DATA_KEYS = {
    MEDITATION: 'data:meditation',
    PRACTICE: 'data:practice',
    CLASS: 'data:class',
    META: 'data:meta',
};

// Legacy cache keys (for backwards compatibility during transition)
export const CACHE_KEYS = DATA_KEYS;
