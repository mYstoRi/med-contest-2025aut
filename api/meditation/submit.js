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
            // Member not in meditation data - search other sources for their team
            let detectedTeam = 'Unknown';

            // 1. Check manual members list (admin-added members)
            const manualMembers = await getCache('members:all');
            if (manualMembers && Array.isArray(manualMembers)) {
                const found = manualMembers.find(m => m.name === name);
                if (found && found.team) {
                    detectedTeam = found.team;
                    console.log(`Found team from members:all: ${name} -> ${detectedTeam}`);
                }
            }

            // 2. If still unknown, check practice/class data
            if (detectedTeam === 'Unknown') {
                const practice = await getCache(DATA_KEYS.PRACTICE);
                if (practice?.members) {
                    const found = practice.members.find(m => m.name === name);
                    if (found && found.team) {
                        detectedTeam = found.team;
                        console.log(`Found team from practice: ${name} -> ${detectedTeam}`);
                    }
                }
            }

            if (detectedTeam === 'Unknown') {
                const classData = await getCache(DATA_KEYS.CLASS);
                if (classData?.members) {
                    const found = classData.members.find(m => m.name === name);
                    if (found && found.team) {
                        detectedTeam = found.team;
                        console.log(`Found team from class: ${name} -> ${detectedTeam}`);
                    }
                }
            }

            member = { team: detectedTeam, name, total: 0, daily: {} };
            meditation.members.push(member);
            console.log(`Created new meditation member: ${name} (team: ${detectedTeam})`);
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

        // Store individual submission record (for afterthoughts/history)
        const submissionId = 'sub_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
        const submission = {
            id: submissionId,
            type: 'meditation',
            name,
            team: member.team,
            date: dateKey,
            duration: durationNum,
            timeOfDay,
            thoughts: thoughts || '',
            shareConsent,
            submittedAt: new Date().toISOString()
        };

        // Get existing submissions and add new one
        let submissions = await getCache('submissions:all') || [];
        submissions.unshift(submission); // Add to beginning (newest first)
        // Keep only last 500 submissions to prevent unbounded growth
        if (submissions.length > 500) {
            submissions = submissions.slice(0, 500);
        }
        await setDataPermanent('submissions:all', submissions);

        console.log(`📝 Submission stored: ${submissionId}`);

        return res.status(200).json({
            success: true,
            message: 'Meditation record saved successfully',
            record: {
                id: submissionId,
                name: submission.name,
                date: submission.date,
                duration: submission.duration,
                timeOfDay: submission.timeOfDay,
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

