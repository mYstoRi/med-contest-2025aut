import { requireAuth } from '../_lib/auth.js';
import { getCache, setCache } from '../_lib/kv.js';

/**
 * Get all members from cache
 */
async function getMembers() {
    try {
        const members = await getCache('members:all');
        return members || [];
    } catch (error) {
        console.error('Failed to get members:', error);
        return [];
    }
}

/**
 * Save members to cache
 */
async function saveMembers(members) {
    try {
        await setCache('members:all', members, 60 * 60 * 24 * 30); // 30 days TTL
    } catch (error) {
        console.error('Failed to save members:', error);
    }
}

/**
 * Generate unique ID
 */
function generateId() {
    return 'm_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
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

    // GET is public, other methods require auth
    if (req.method !== 'GET') {
        const isAuthed = await requireAuth(req, res);
        if (!isAuthed) return;
    }

    // GET /api/admin/members - Get all members
    if (req.method === 'GET') {
        try {
            const members = await getMembers();
            const { team } = req.query || {};

            let filtered = members;
            if (team) {
                filtered = filtered.filter(m => m.team === team);
            }

            return res.status(200).json({
                count: filtered.length,
                members: filtered
            });
        } catch (error) {
            console.error('Get members error:', error);
            return res.status(500).json({ error: 'Failed to get members' });
        }
    }

    // POST /api/admin/members - Add new member
    if (req.method === 'POST') {
        try {
            const { name, team } = req.body || {};

            if (!name) {
                return res.status(400).json({ error: 'Member name is required' });
            }
            if (!team) {
                return res.status(400).json({ error: 'Team is required' });
            }

            const members = await getMembers();

            // Check for duplicate
            const existing = members.find(m => m.name === name && m.team === team);
            if (existing) {
                return res.status(409).json({ error: 'Member already exists in this team' });
            }

            const member = {
                id: generateId(),
                name,
                team,
                createdAt: new Date().toISOString()
            };

            members.push(member);
            await saveMembers(members);

            return res.status(201).json({
                success: true,
                member,
                message: 'Member added successfully'
            });
        } catch (error) {
            console.error('Add member error:', error);
            return res.status(500).json({ error: 'Failed to add member' });
        }
    }

    // PUT /api/admin/members - Update member
    if (req.method === 'PUT') {
        try {
            const { id, name, team } = req.body || {};

            if (!id) {
                return res.status(400).json({ error: 'Member ID required' });
            }

            const members = await getMembers();
            const index = members.findIndex(m => m.id === id);

            if (index === -1) {
                return res.status(404).json({ error: 'Member not found' });
            }

            if (name) members[index].name = name;
            if (team) members[index].team = team;
            members[index].updatedAt = new Date().toISOString();

            await saveMembers(members);

            return res.status(200).json({
                success: true,
                member: members[index],
                message: 'Member updated successfully'
            });
        } catch (error) {
            console.error('Update member error:', error);
            return res.status(500).json({ error: 'Failed to update member' });
        }
    }

    // DELETE /api/admin/members?id=xxx - Delete member
    if (req.method === 'DELETE') {
        try {
            const { id } = req.query || {};

            if (!id) {
                return res.status(400).json({ error: 'Member ID required' });
            }

            const members = await getMembers();
            const index = members.findIndex(m => m.id === id);

            if (index === -1) {
                return res.status(404).json({ error: 'Member not found' });
            }

            const deleted = members.splice(index, 1)[0];
            await saveMembers(members);

            return res.status(200).json({
                success: true,
                deleted,
                message: 'Member deleted successfully'
            });
        } catch (error) {
            console.error('Delete member error:', error);
            return res.status(500).json({ error: 'Failed to delete member' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
