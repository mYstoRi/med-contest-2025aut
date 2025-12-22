import { Redis } from '@upstash/redis';
import { requireAuth } from '../_lib/auth.js';

// Create Redis client
const kv = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});

const SETTINGS_KEY = 'settings:app';

// Default settings
const DEFAULT_SETTINGS = {
    maintenanceMode: false,
    maintenanceMessage: '網站維護中，請稍後再試。\nSite under maintenance, please try again later.',
    announcement: '',
};

/**
 * Get current settings (public)
 */
async function getSettings() {
    try {
        const settings = await kv.get(SETTINGS_KEY);
        return { ...DEFAULT_SETTINGS, ...settings };
    } catch (error) {
        console.error('Failed to get settings:', error);
        return DEFAULT_SETTINGS;
    }
}

/**
 * Update settings (requires auth)
 */
async function updateSettings(newSettings) {
    try {
        const current = await getSettings();
        const updated = { ...current, ...newSettings };
        await kv.set(SETTINGS_KEY, updated);
        return updated;
    } catch (error) {
        console.error('Failed to update settings:', error);
        throw error;
    }
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // GET - public endpoint to check maintenance status
    if (req.method === 'GET') {
        try {
            const settings = await getSettings();
            return res.status(200).json({
                maintenanceMode: settings.maintenanceMode,
                maintenanceMessage: settings.maintenanceMessage,
            });
        } catch (error) {
            console.error('Get settings error:', error);
            return res.status(500).json({ error: 'Failed to get settings' });
        }
    }

    // POST - requires auth to update settings
    if (req.method === 'POST') {
        const isAuthed = await requireAuth(req, res);
        if (!isAuthed) return;

        try {
            const { maintenanceMode, maintenanceMessage } = req.body || {};
            const updates = {};

            if (typeof maintenanceMode === 'boolean') {
                updates.maintenanceMode = maintenanceMode;
            }
            if (typeof maintenanceMessage === 'string') {
                updates.maintenanceMessage = maintenanceMessage;
            }
            if (typeof req.body.announcement === 'string') {
                updates.announcement = req.body.announcement;
            }

            const updated = await updateSettings(updates);
            console.log(`⚙️ Settings updated: maintenanceMode=${updated.maintenanceMode}`);

            return res.status(200).json({
                success: true,
                settings: updated,
            });
        } catch (error) {
            console.error('Update settings error:', error);
            return res.status(500).json({ error: 'Failed to update settings' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
