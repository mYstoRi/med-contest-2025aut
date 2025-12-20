// API endpoint for submitting meditation records
// POST /api/meditation/submit

import { getCache, setDataPermanent, DATA_KEYS } from '../_lib/kv.js';

export default async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Only allow POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { name, date, duration, timeOfDay, thoughts, shareConsent, timestamp } = req.body;

        // Validate required fields
        if (!name || !date || !duration || !timeOfDay || !shareConsent) {
            return res.status(400).json({
                error: 'Missing required fields',
                required: ['name', 'date', 'duration', 'timeOfDay', 'shareConsent']
            });
        }

        // Validate duration
        const durationNum = parseInt(duration);
        if (isNaN(durationNum) || durationNum < 1 || durationNum > 480) {
            return res.status(400).json({
                error: 'Duration must be between 1 and 480 minutes'
            });
        }

        // Validate date format (YYYY-MM-DD)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({
                error: 'Invalid date format. Expected YYYY-MM-DD'
            });
        }

        // Check date is not in the future
        const submittedDate = new Date(date);
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        if (submittedDate > today) {
            return res.status(400).json({
                error: 'Date cannot be in the future'
            });
        }

        // Convert date to YYYY/MM/DD format for consistency with sheets data
        const dateKey = date.replace(/-/g, '/');

        // Get existing meditation data from database
        let meditation = await getCache(DATA_KEYS.MEDITATION);
        if (!meditation || !meditation.members) {
            meditation = { dates: [], members: [] };
        }

        // Find or create member entry
        let member = meditation.members.find(m => m.name === name);
        if (!member) {
            // New member - we don't know their team, mark as Unknown
            member = { team: 'Unknown', name, total: 0, daily: {} };
            meditation.members.push(member);
        }

        // Ensure daily object exists
        if (!member.daily) {
            member.daily = {};
        }

        // Add/update daily entry (accumulate minutes for same date)
        member.daily[dateKey] = (member.daily[dateKey] || 0) + durationNum;

        // Recalculate total
        member.total = Object.values(member.daily).reduce((a, b) => a + b, 0);

        // Add date to dates array if new
        if (!meditation.dates.includes(dateKey)) {
            meditation.dates.push(dateKey);
            meditation.dates.sort();
        }

        // Save updated meditation data back to database
        await setDataPermanent(DATA_KEYS.MEDITATION, meditation);

        console.log(`📝 Meditation saved: ${name} - ${dateKey} - ${durationNum} min (total: ${member.total})`);

        // Build the record for response
        const record = {
            timestamp: timestamp || new Date().toISOString(),
            name,
            date: dateKey,
            duration: durationNum,
            timeOfDay,
            thoughts: thoughts || '',
            shareConsent,
            submittedAt: new Date().toISOString()
        };

        return res.status(200).json({
            success: true,
            message: 'Meditation record saved successfully',
            record: {
                name: record.name,
                date: record.date,
                duration: record.duration,
                timeOfDay: record.timeOfDay,
                newTotal: member.total
            }
        });

    } catch (error) {
        console.error('Error processing meditation submission:', error);
        return res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
}

