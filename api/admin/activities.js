import { requireAuth } from '../_lib/auth.js';
import { getCache, setCache, deleteCache, CACHE_KEYS } from '../_lib/kv.js';

// Activity types
const ACTIVITY_TYPES = ['meditation', 'practice', 'class'];

/**
 * Get all activities from cache
 */
async function getActivities() {
    try {
        const activities = await getCache('activities:all');
        return activities || [];
    } catch (error) {
        console.error('Failed to get activities:', error);
        return [];
    }
}

/**
 * Save activities to cache
 */
async function saveActivities(activities) {
    try {
        await setCache('activities:all', activities, 60 * 60 * 24 * 7); // 7 days TTL
    } catch (error) {
        console.error('Failed to save activities:', error);
    }
}

/**
 * Generate unique ID
 */
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

/**
 * Parse activity date to milliseconds for comparison
 * Handles formats: YYYY/MM/DD, YYYY-MM-DD, MM/DD
 */
function parseActivityDate(dateStr) {
    if (!dateStr) return 0;
    // Normalize separators
    const normalized = dateStr.replace(/-/g, '/');
    const parts = normalized.split('/');
    let year, month, day;

    if (parts.length === 3) {
        year = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10);
        day = parseInt(parts[2], 10);
    } else if (parts.length === 2) {
        // MM/DD format - infer year
        month = parseInt(parts[0], 10) || 1;
        day = parseInt(parts[1], 10) || 1;
        year = month < 6 ? 2026 : 2025;
    } else {
        return 0;
    }
    return new Date(year, month - 1, day).getTime();
}

/**
 * Insert activity into sorted array (descending by date)
 * Uses binary search for O(log n) insertion position
 */
function sortedInsert(activities, newActivity) {
    const newDate = parseActivityDate(newActivity.date);

    // Binary search for insertion point
    let left = 0;
    let right = activities.length;

    while (left < right) {
        const mid = Math.floor((left + right) / 2);
        const midDate = parseActivityDate(activities[mid].date);

        if (midDate > newDate) {
            left = mid + 1;
        } else {
            right = mid;
        }
    }

    // Insert at the found position
    activities.splice(left, 0, newActivity);
    return activities;
}

/**
 * Sort an array of activities by date descending (for initial load / sync)
 */
function sortActivitiesByDate(activities) {
    return activities.sort((a, b) => parseActivityDate(b.date) - parseActivityDate(a.date));
}

/**
 * Get activities from database (synced data)
 * Uses the same data that was synced via /api/admin/sync
 */
async function getActivitiesFromDatabase() {
    const activities = [];

    try {
        // Get synced data from database (same keys as sync.js uses)
        const [meditation, practice, classData, meta] = await Promise.all([
            getCache('data:meditation'),
            getCache('data:practice'),
            getCache('data:class'),
            getCache('data:meta'),
        ]);

        // Convert meditation data to activities
        if (meditation?.members) {
            for (const member of meditation.members) {
                if (member.daily) {
                    for (const [date, value] of Object.entries(member.daily)) {
                        if (value > 0) {
                            activities.push({
                                id: `db_med_${member.team}_${member.name}_${date}`,
                                type: 'meditation',
                                team: member.team,
                                member: member.name,
                                date,
                                value,
                                source: 'database'
                            });
                        }
                    }
                }
            }
        }

        // Convert practice data to activities
        if (practice?.members) {
            for (const member of practice.members) {
                if (member.daily) {
                    for (const [date, value] of Object.entries(member.daily)) {
                        if (value > 0) {
                            activities.push({
                                id: `db_prac_${member.team}_${member.name}_${date}`,
                                type: 'practice',
                                team: member.team,
                                member: member.name,
                                date,
                                value,
                                source: 'database'
                            });
                        }
                    }
                }
            }
        }

        // Convert class data to activities
        if (classData?.members) {
            for (const member of classData.members) {
                if (member.daily) {
                    for (const [date, value] of Object.entries(member.daily)) {
                        if (value > 0) {
                            activities.push({
                                id: `db_class_${member.team}_${member.name}_${date}`,
                                type: 'class',
                                team: member.team,
                                member: member.name,
                                date,
                                value,
                                source: 'database'
                            });
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.error('Failed to get activities from database:', error);
    }

    // Sort activities by date (newest first)
    const parseDateToMs = (dateStr) => {
        if (!dateStr) return 0;
        const parts = dateStr.split('/');
        let year, month, day;
        if (parts.length === 3) {
            year = parseInt(parts[0], 10);
            month = parseInt(parts[1], 10);
            day = parseInt(parts[2], 10);
        } else if (parts.length === 2) {
            month = parseInt(parts[0], 10) || 1;
            day = parseInt(parts[1], 10) || 1;
            year = month < 6 ? 2026 : 2025;
        } else {
            return 0;
        }
        return new Date(year, month - 1, day).getTime();
    };

    activities.sort((a, b) => {
        const dateA = parseDateToMs(a.date);
        const dateB = parseDateToMs(b.date);
        return dateB - dateA;
    });

    return activities;
}


export default async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // GET is public (for now), other methods require auth
    if (req.method !== 'GET') {
        const isAuthed = await requireAuth(req, res);
        if (!isAuthed) return;
    }

    // GET /api/admin/activities - Get all activities (from database + manually added)
    if (req.method === 'GET') {
        try {
            // Get manually added activities
            const manualActivities = await getActivities();

            // Get activities from database (synced data)
            const dbActivities = await getActivitiesFromDatabase();

            // Get submissions with thoughts and manual members
            const [submissions, manualMembers] = await Promise.all([
                getCache('submissions:all'),
                getCache('members:all'),
            ]);
            const submissionsList = submissions || [];

            // Create a map of submissions by name+date for quick lookup
            const submissionMap = new Map();
            // Helper to normalize date format for matching (handles both YYYY/MM/DD and MM/DD)
            const normalizeDate = (dateStr) => {
                if (!dateStr) return '';
                const parts = dateStr.split('/');
                if (parts.length === 3) {
                    // YYYY/MM/DD -> MM/DD
                    return `${parseInt(parts[1], 10)}/${parseInt(parts[2], 10)}`;
                } else if (parts.length === 2) {
                    // MM/DD -> normalize  
                    return `${parseInt(parts[0], 10)}/${parseInt(parts[1], 10)}`;
                }
                return dateStr;
            };

            for (const sub of submissionsList) {
                const normalizedDate = normalizeDate(sub.date);
                const key = `${sub.name}:${normalizedDate}`;
                // Store all submissions for same name+date (multiple per day possible)
                if (!submissionMap.has(key)) {
                    submissionMap.set(key, []);
                }
                submissionMap.get(key).push(sub);
            }

            // Debug: show sample keys
            if (submissionMap.size > 0) {
                const sampleKeys = Array.from(submissionMap.keys()).slice(0, 3);
                console.log(`📋 Submission keys (sample): ${sampleKeys.join(', ')}`);
            }

            // Convert submissions to activities (these are the most up-to-date)
            const submissionActivities = submissionsList
                .filter(sub => sub.type === 'meditation' && sub.duration > 0)
                .map(sub => ({
                    id: sub.id || `sub_${sub.name}_${sub.date}`,
                    type: 'meditation',
                    team: sub.team || '',
                    member: sub.name,
                    date: normalizeDate(sub.date),
                    value: sub.duration || sub.minutes,
                    thoughts: sub.thoughts || undefined,
                    timeOfDay: sub.timeOfDay || undefined,
                    shareConsent: sub.shareConsent || undefined,
                    source: sub.source || 'submission'
                }));

            console.log(`📝 Submissions converted to activities: ${submissionActivities.length}`);

            // Create a set of submission keys to avoid duplicates
            const submissionKeys = new Set();
            for (const sub of submissionActivities) {
                const key = `${sub.member}:${sub.date}`;
                submissionKeys.add(key);
            }

            // Merge: filter out database activities that are already in submissions
            // Database activities may have team info that submissions don't have
            const mergedDbActivities = dbActivities
                .map(activity => {
                    const normalizedDate = normalizeDate(activity.date);
                    const key = `${activity.member || activity.name}:${normalizedDate}`;

                    // Check if this activity has a corresponding submission
                    const subs = submissionMap.get(key);
                    if (subs && subs.length > 0) {
                        // Enrich with submission data
                        const sub = subs[0];
                        return {
                            ...activity,
                            date: normalizedDate,
                            thoughts: subs.filter(s => s.thoughts).map(s => s.thoughts).join(' | ') || undefined,
                            timeOfDay: sub.timeOfDay || undefined,
                        };
                    }
                    return { ...activity, date: normalizedDate };
                })
                .filter(activity => {
                    // Remove db activities that are duplicates of submission activities
                    const key = `${activity.member || activity.name}:${activity.date}`;
                    return !submissionKeys.has(key);
                });

            // Look up team info for submission activities (from database + manual members)
            const teamLookup = {};
            // First from database activities
            for (const act of dbActivities) {
                if (act.member && act.team) {
                    teamLookup[act.member] = act.team;
                }
            }
            // Then from manual members (these take precedence as they're explicitly managed)
            const manualMembersList = manualMembers || [];
            for (const member of manualMembersList) {
                if (member.name && member.team) {
                    teamLookup[member.name] = member.team;
                }
            }
            // Apply team lookup to submission activities
            for (const sub of submissionActivities) {
                if (!sub.team && teamLookup[sub.member]) {
                    sub.team = teamLookup[sub.member];
                }
            }

            // Combine all activities
            const allActivities = [...submissionActivities, ...mergedDbActivities, ...manualActivities];
            console.log(`📊 Total activities: ${allActivities.length} (${submissionActivities.length} submissions + ${mergedDbActivities.length} db + ${manualActivities.length} manual)`);

            const { type, team, member, date, source } = req.query || {};

            let filtered = allActivities;

            if (type && ACTIVITY_TYPES.includes(type)) {
                filtered = filtered.filter(a => a.type === type);
            }
            if (team) {
                filtered = filtered.filter(a => a.team === team);
            }
            if (member) {
                filtered = filtered.filter(a => a.member === member);
            }
            if (date) {
                filtered = filtered.filter(a => a.date === date);
            }
            if (source) {
                filtered = filtered.filter(a => a.source === source);
            }

            // Sort by date descending (use proper date parsing, not string compare)
            const parseDateToMs = (dateStr) => {
                if (!dateStr) return 0;
                const parts = dateStr.split('/');
                let year, month, day;
                if (parts.length === 3) {
                    year = parseInt(parts[0], 10);
                    month = parseInt(parts[1], 10);
                    day = parseInt(parts[2], 10);
                } else if (parts.length === 2) {
                    month = parseInt(parts[0], 10) || 1;
                    day = parseInt(parts[1], 10) || 1;
                    year = month < 6 ? 2026 : 2025;
                } else {
                    return 0;
                }
                return new Date(year, month - 1, day).getTime();
            };

            filtered.sort((a, b) => {
                const dateA = parseDateToMs(a.date);
                const dateB = parseDateToMs(b.date);
                if (dateB !== dateA) {
                    return dateB - dateA;
                }
                return a.type.localeCompare(b.type);
            });

            // Debug: count activities with thoughts
            const withThoughts = filtered.filter(a => a.thoughts).length;
            console.log(`📊 Activities: ${filtered.length} total, ${withThoughts} with thoughts, ${submissions.length} submissions in DB`);

            // Limit to most recent 500 for performance
            filtered = filtered.slice(0, 500);

            return res.status(200).json({
                count: filtered.length,
                totalDatabase: dbActivities.length,
                totalManual: manualActivities.length,
                activities: filtered
            });
        } catch (error) {
            console.error('Get activities error:', error);
            return res.status(500).json({ error: 'Failed to get activities' });
        }
    }

    // POST /api/admin/activities - Add new activity or bulk activities
    if (req.method === 'POST') {
        try {
            const body = req.body || {};

            // Check if bulk submission (activities array)
            if (body.activities && Array.isArray(body.activities)) {
                const newActivities = [];

                for (const item of body.activities) {
                    const { type, team, member, date, value } = item;

                    // Validate each activity
                    if (!type || !ACTIVITY_TYPES.includes(type)) continue;
                    if (!team || !member || !date) continue;

                    newActivities.push({
                        id: generateId(),
                        type,
                        team,
                        member,
                        date,
                        value: parseFloat(value) || 1,
                        createdAt: new Date().toISOString(),
                        source: 'admin'
                    });
                }

                if (newActivities.length === 0) {
                    return res.status(400).json({ error: 'No valid activities provided' });
                }

                const activities = await getActivities();
                // Insert each new activity in sorted order (newest first)
                for (const newAct of sortActivitiesByDate(newActivities)) {
                    sortedInsert(activities, newAct);
                }
                await saveActivities(activities);

                // Invalidate cache
                await deleteCache(CACHE_KEYS.META);

                return res.status(201).json({
                    success: true,
                    count: newActivities.length,
                    message: `${newActivities.length} activities added successfully`
                });
            }

            // Single activity submission (legacy support)
            const { type, team, member, date, value, notes } = body;

            // Validate required fields
            if (!type || !ACTIVITY_TYPES.includes(type)) {
                return res.status(400).json({ error: `Type must be one of: ${ACTIVITY_TYPES.join(', ')}` });
            }
            if (!team) {
                return res.status(400).json({ error: 'Team is required' });
            }
            if (!member) {
                return res.status(400).json({ error: 'Member name is required' });
            }
            if (!date) {
                return res.status(400).json({ error: 'Date is required' });
            }

            const activity = {
                id: generateId(),
                type,
                team,
                member,
                date,
                value: parseFloat(value) || 1, // Default to 1 for attendance
                notes: notes || null,
                createdAt: new Date().toISOString(),
                source: 'admin' // Mark as manually added
            };

            const activities = await getActivities();
            sortedInsert(activities, activity);
            await saveActivities(activities);

            // Invalidate main data cache so next fetch will include this
            await deleteCache(CACHE_KEYS.META);

            return res.status(201).json({
                success: true,
                activity,
                message: 'Activity added successfully'
            });
        } catch (error) {
            console.error('Add activity error:', error);
            return res.status(500).json({ error: 'Failed to add activity' });
        }
    }

    // DELETE /api/admin/activities?id=xxx or ?ids=xxx,yyy,zzz or ?deleteBefore=MM/DD - Delete activity/activities
    if (req.method === 'DELETE') {
        try {
            const { id, ids, deleteBefore } = req.query || {};

            // Date-based bulk delete for submissions
            if (deleteBefore) {
                // Parse the deleteBefore date (MM/DD or YYYY/MM/DD)
                const parts = deleteBefore.split('/');
                let targetMonth, targetDay;
                if (parts.length === 3) {
                    targetMonth = parseInt(parts[1], 10);
                    targetDay = parseInt(parts[2], 10);
                } else if (parts.length === 2) {
                    targetMonth = parseInt(parts[0], 10);
                    targetDay = parseInt(parts[1], 10);
                } else {
                    return res.status(400).json({ error: 'Invalid date format. Use MM/DD or YYYY/MM/DD' });
                }

                // Load submissions
                const submissions = await getCache('submissions:all') || [];
                const originalCount = submissions.length;

                // Filter to keep only submissions ON or AFTER the cutoff date
                const filtered = submissions.filter(sub => {
                    const subParts = (sub.date || '').split('/');
                    let subMonth, subDay;
                    if (subParts.length === 3) {
                        subMonth = parseInt(subParts[1], 10);
                        subDay = parseInt(subParts[2], 10);
                    } else if (subParts.length === 2) {
                        subMonth = parseInt(subParts[0], 10);
                        subDay = parseInt(subParts[1], 10);
                    } else {
                        return true; // Keep invalid dates
                    }
                    // Keep if date >= cutoff
                    if (subMonth > targetMonth) return true;
                    if (subMonth < targetMonth) return false;
                    return subDay >= targetDay;
                });

                const deletedCount = originalCount - filtered.length;

                // Save filtered submissions
                const { setDataPermanent } = await import('../_lib/kv.js');
                await setDataPermanent('submissions:all', filtered);

                console.log(`🗑️ Bulk delete: removed ${deletedCount} submissions before ${deleteBefore}`);
                return res.status(200).json({
                    success: true,
                    deletedCount,
                    remainingCount: filtered.length,
                    message: `Deleted ${deletedCount} submissions before ${deleteBefore}`
                });
            }

            // Support bulk delete with comma-separated IDs
            let idsToDelete = [];
            if (ids) {
                idsToDelete = ids.split(',').map(s => s.trim()).filter(Boolean);
            } else if (id) {
                idsToDelete = [id];
            }

            if (idsToDelete.length === 0) {
                return res.status(400).json({ error: 'Activity ID(s) required. Use ?id=xxx or ?ids=xxx,yyy,zzz or ?deleteBefore=MM/DD' });
            }

            const results = { deleted: [], failed: [] };

            // Load all activities once for manual deletes
            let activities = await getActivities();
            let activitiesModified = false;

            // Track submissions for sub_ deletes
            let submissionsData = [];
            let submissionsLoaded = false;
            let submissionsModified = false;

            // Process each ID
            for (const deleteId of idsToDelete) {
                try {
                    if (deleteId.startsWith('db_')) {
                        // Parse the ID format: db_{type}_{team}_{name}_{date}
                        const parts = deleteId.split('_');
                        if (parts.length < 5) {
                            results.failed.push({ id: deleteId, error: 'Invalid database activity ID format' });
                            continue;
                        }

                        const type = parts[1]; // med, prac, or class
                        const idRemainder = parts.slice(2).join('_');
                        const dateMatch = idRemainder.match(/(\d{4}\/\d{1,2}\/\d{1,2})$/);
                        if (!dateMatch) {
                            results.failed.push({ id: deleteId, error: 'Could not parse date' });
                            continue;
                        }
                        const date = dateMatch[1];
                        const teamAndName = idRemainder.slice(0, -date.length - 1);
                        const firstUnderscore = teamAndName.indexOf('_');
                        if (firstUnderscore === -1) {
                            results.failed.push({ id: deleteId, error: 'Could not parse team/name' });
                            continue;
                        }
                        const team = teamAndName.slice(0, firstUnderscore);
                        const name = teamAndName.slice(firstUnderscore + 1);

                        // Get the appropriate data key
                        let dataKey;
                        if (type === 'med') dataKey = 'data:meditation';
                        else if (type === 'prac') dataKey = 'data:practice';
                        else if (type === 'class') dataKey = 'data:class';
                        else {
                            results.failed.push({ id: deleteId, error: `Unknown type: ${type}` });
                            continue;
                        }

                        // Load and modify data
                        const data = await getCache(dataKey);
                        if (!data || !data.members) {
                            results.failed.push({ id: deleteId, error: 'Data not found' });
                            continue;
                        }

                        const member = data.members.find(m => m.team === team && m.name === name);
                        if (!member || !member.daily || !member.daily[date]) {
                            results.failed.push({ id: deleteId, error: 'Activity not found' });
                            continue;
                        }

                        const deletedValue = member.daily[date];
                        delete member.daily[date];
                        member.total = Object.values(member.daily).reduce((a, b) => a + b, 0);

                        const { setDataPermanent } = await import('../_lib/kv.js');
                        await setDataPermanent(dataKey, data);

                        results.deleted.push({ id: deleteId, type, team, name, date, value: deletedValue });
                    } else if (deleteId.startsWith('sub_')) {
                        // Submission-based activity - delete from submissions:all
                        if (!submissionsLoaded) {
                            submissionsData = await getCache('submissions:all') || [];
                            submissionsLoaded = true;
                        }

                        const originalLength = submissionsData.length;
                        // Find and remove by matching ID
                        submissionsData = submissionsData.filter(sub => {
                            const subId = sub.id || `sub_${sub.name}_${sub.date}`;
                            return subId !== deleteId;
                        });

                        if (submissionsData.length < originalLength) {
                            submissionsModified = true;
                            results.deleted.push({ id: deleteId, source: 'submission' });
                        } else {
                            results.failed.push({ id: deleteId, error: 'Submission not found' });
                        }
                    } else {
                        // Manual activity
                        const index = activities.findIndex(a => a.id === deleteId);
                        if (index === -1) {
                            results.failed.push({ id: deleteId, error: 'Activity not found' });
                            continue;
                        }

                        const deleted = activities.splice(index, 1)[0];
                        activitiesModified = true;
                        results.deleted.push(deleted);
                    }
                } catch (innerError) {
                    results.failed.push({ id: deleteId, error: innerError.message });
                }
            }

            // Save manual activities if modified
            if (activitiesModified) {
                await saveActivities(activities);
                await deleteCache(CACHE_KEYS.META);
            }

            // Save submissions if modified
            if (submissionsModified) {
                const { setDataPermanent } = await import('../_lib/kv.js');
                await setDataPermanent('submissions:all', submissionsData);
            }

            return res.status(200).json({
                success: true,
                deletedCount: results.deleted.length,
                failedCount: results.failed.length,
                deleted: results.deleted,
                failed: results.failed,
                message: `Deleted ${results.deleted.length} activities${results.failed.length > 0 ? `, ${results.failed.length} failed` : ''}`
            });
        } catch (error) {
            console.error('Delete activity error:', error);
            return res.status(500).json({ error: 'Failed to delete activity' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
