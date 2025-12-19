import { kv } from '@vercel/kv';

// Cache TTL in seconds (5 minutes)
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
 * Set cached data with TTL
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
    return getCache('cache:meta');
}

/**
 * Update cache metadata
 */
export async function setCacheMeta(meta) {
    return setCache('cache:meta', meta, CACHE_TTL);
}

// Cache keys
export const CACHE_KEYS = {
    MEDITATION: 'cache:meditation',
    PRACTICE: 'cache:practice',
    CLASS: 'cache:class',
    META: 'cache:meta',
};
