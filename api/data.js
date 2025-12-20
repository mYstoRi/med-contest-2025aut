import { getCache, getCacheMeta, CACHE_KEYS } from './_lib/kv.js';

// API Handler - Database only (no sheet fetching - that's done via sync)
export default async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {

        // Get data from database
        const [meditation, practice, classData, meta, manualActivities, manualMembers] = await Promise.all([
            getCache(CACHE_KEYS.MEDITATION),
            getCache(CACHE_KEYS.PRACTICE),
            getCache(CACHE_KEYS.CLASS),
            getCacheMeta(),
            getCache('activities:all'),
            getCache('members:all'),
        ]);

        // Generate recent activity directly from meditation data
        // This is the source of truth - form submissions update this
        const parseDate = (dateStr) => {
            if (!dateStr) return 0;
            const normalized = (dateStr || '').replace(/\//g, '-');
            return new Date(normalized).getTime() || 0;
        };

        // Extract activities from meditation.daily entries
        const meditationActivities = [];
        const medData = meditation || { dates: [], members: [] };
        for (const member of medData.members || []) {
            if (member.daily) {
                for (const [date, minutes] of Object.entries(member.daily)) {
                    if (minutes > 0) {
                        meditationActivities.push({
                            type: 'meditation',
                            name: member.name,
                            team: member.team,
                            date,
                            minutes,
                            points: minutes,
                        });
                    }
                }
            }
        }

        // Sort by date (newest first) and take top 50
        meditationActivities.sort((a, b) => parseDate(b.date) - parseDate(a.date));
        const recentActivity = meditationActivities.slice(0, 50);

        const result = {
            meditation: meditation || { dates: [], members: [] },
            practice: practice || { dates: [], members: [] },
            class: classData || { dates: [], members: [] },
            recentActivity,
            syncedAt: meta?.syncedAt || null,
        };

        // Merge Manual Members
        // We add them to 'meditation' list as base, as that's used for Register form
        if (manualMembers && Array.isArray(manualMembers)) {
            manualMembers.forEach(m => {
                // Check if already in meditation members
                if (!result.meditation.members.some(ex => ex.name === m.name && ex.team === m.team)) {
                    result.meditation.members.push({
                        team: m.team,
                        name: m.name,
                        total: 0,
                        daily: {}
                    });
                }
                // Ensure team exists in other lists if needed, or wait for activity to add them
            });
        }

        // Merge Manual Activities
        if (manualActivities && Array.isArray(manualActivities)) {
            manualActivities.forEach(activity => {
                const { type, team, member, date, value } = activity;
                let targetCategory = null;

                if (type === 'meditation') targetCategory = result.meditation;
                else if (type === 'practice') targetCategory = result.practice;
                else if (type === 'class') targetCategory = result.class;

                if (targetCategory) {
                    // Find or Create Member
                    let memberObj = targetCategory.members.find(m => m.name === member && m.team === team);
                    if (!memberObj) {
                        memberObj = { team, name: member, total: 0, daily: {} };
                        if (type === 'class') memberObj.tier = ''; // Class specific
                        targetCategory.members.push(memberObj);
                    }

                    // Update Totals and Daily
                    // Note: Manual activity might duplicate sheet data if not careful. 
                    // Assuming manual is additive or override? 
                    // Admin usually adds missing data. We'll add it.
                    // Ideally we should check if date exists? 
                    // For now, we overwrite/set the value for that date to the manual value.
                    // If multiple manual entries for same date? Admin only allows one?
                    // Admin addActivity allows multiple. We'll assume simple case.

                    // Logic: If manual value exists, USE it? Or ADD it?
                    // Code below ADDS if not present, or ADDS to existing?
                    // Let's assume manual records are discrete events.
                    // If daily[date] exists, we accumulate?
                    // Sheet data is usually "total minutes for that day".
                    // Admin manual add is "add activity".
                    // If I add 30 mins.
                    // We should add to daily[date].

                    const currentValue = memberObj.daily[date] || 0;
                    // For class, value is 1 (attendance) usually, but activity.value might be points.
                    // parseClassSheet uses points = total * 50.
                    // If type is class, value is attendance count?

                    // Simple addition
                    memberObj.daily[date] = currentValue + value;
                    memberObj.total += value;
                    // Note: Class total in parseClassSheet is 'total count'. 
                    // But points is total * 50.
                    // Check parseClassSheet: "total = parseFloat(row[3])", "points: total * POINTS.CLASS_PER_ATTENDANCE"
                    // If we update class, we need to update 'points' field if it exists?
                    if (type === 'class' && memberObj.points !== undefined) {
                        memberObj.points += (value * 50); // Assuming value is 1 for attendance
                    }

                    // Add date to dates list if missing and keep sorted?
                    // Dates array usually sorted.
                    if (!targetCategory.dates.includes(date)) {
                        targetCategory.dates.push(date);
                        targetCategory.dates.sort(); // Simple sort YYYY/MM/DD works
                    }
                }
            });
        }

        // Check if database has data (synced or manual)
        const hasData = result.meditation.members.length > 0 ||
            result.practice.members.length > 0 ||
            result.class.members.length > 0;

        return res.status(200).json({
            ...result,
            isEmpty: !hasData,
            message: hasData ? null : 'Database is empty. Use admin panel to sync from Google Sheets.',
        });
    } catch (error) {
        console.error('Data API error:', error);
        return res.status(500).json({ error: 'Failed to fetch data', details: error.message });
    }
}
