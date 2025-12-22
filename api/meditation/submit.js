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

        // Determine Team
        let detectedTeam = 'Unknown';

        // 1. Check manual members list (members:all)
        const manualMembers = await getCache('members:all') || [];
        const manualMember = manualMembers.find(m => m.name === name);
        if (manualMember && manualMember.team) {
            detectedTeam = manualMember.team;
        }

        // 2. Check synced members (members:synced)
        if (detectedTeam === 'Unknown') {
            const syncedMembers = await getCache('members:synced') || [];
            const synced = syncedMembers.find(m => m.name === name);
            if (synced && synced.team) {
                detectedTeam = synced.team;
            }
        }

        console.log(`📝 Processing submission for ${name} (Team: ${detectedTeam})`);

        // Store individual submission record (unified activities)
        const submissionId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const activity = {
            id: submissionId,
            type: 'meditation',
            member: name,
            team: detectedTeam,
            date: dateKey,
            value: durationNum,
            timeOfDay,
            thoughts: thoughts || undefined,
            shareConsent,
            source: 'submission',
            createdAt: new Date().toISOString()
        };

        // Get existing activities and add new one
        // Note: As dataset grows, this full read/write might need optimization (e.g. append command if moved to List/Set)
        let activities = await getCache('activities:all') || [];
        activities.push(activity);
        await setDataPermanent('activities:all', activities);

        console.log(`📝 Activity stored: ${submissionId}`);

        return res.status(200).json({
            success: true,
            message: 'Meditation record saved successfully',
            record: {
                id: submissionId,
                name: name,
                date: date,
                duration: duration,
                timeOfDay: timeOfDay
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
