// API endpoint for team management
// GET/POST/PUT/DELETE /api/admin/teams

import { requireAuth } from '../_lib/auth.js';
import { getCache, setDataPermanent, DATA_KEYS } from '../_lib/kv.js';

// Default teams (migrated from config.js on first load)
const DEFAULT_TEAMS = [
    { id: 't1', name: '晨絜家中隊', shortName: '晨絜', color: '#8b5cf6' },
    { id: 't2', name: '明緯家中隊', shortName: '明緯', color: '#10b981' },
    { id: 't3', name: '敬涵家中隊', shortName: '敬涵', color: '#f59e0b' },
    { id: 't4', name: '宗翰家中隊', shortName: '宗翰', color: '#ef4444' },
];

// Preset color options
export const TEAM_COLORS = [
    '#8b5cf6', // Purple
    '#10b981', // Green
    '#f59e0b', // Amber
    '#ef4444', // Red
    '#3b82f6', // Blue
    '#ec4899', // Pink
    '#06b6d4', // Cyan
    '#84cc16', // Lime
];

function generateId() {
    return 't_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
}

/**
 * Get all teams (initializes with defaults if empty)
 */
async function getTeams() {
    let teams = await getCache(DATA_KEYS.TEAMS);

    // Initialize with default teams if empty
    if (!teams || teams.length === 0) {
        teams = DEFAULT_TEAMS;
        await setDataPermanent(DATA_KEYS.TEAMS, teams);
        console.log('📋 Initialized default teams');
    }

    return teams;
}

/**
 * Save teams to database
 */
async function saveTeams(teams) {
    await setDataPermanent(DATA_KEYS.TEAMS, teams);
}

/**
 * Check if team has members
 */
async function teamHasMembers(teamName) {
    const meditation = await getCache(DATA_KEYS.MEDITATION);
    if (meditation?.members) {
        return meditation.members.some(m => m.team === teamName);
    }
    return false;
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

    // GET /api/admin/teams - List all teams
    if (req.method === 'GET') {
        try {
            const teams = await getTeams();
            return res.status(200).json({
                count: teams.length,
                teams,
                colors: TEAM_COLORS,
            });
        } catch (error) {
            console.error('Get teams error:', error);
            return res.status(500).json({ error: 'Failed to get teams' });
        }
    }

    // POST /api/admin/teams - Add new team
    if (req.method === 'POST') {
        try {
            const { name, shortName, color } = req.body || {};

            if (!name || !shortName) {
                return res.status(400).json({ error: 'Name and shortName are required' });
            }

            const teams = await getTeams();

            // Check for duplicate name
            if (teams.some(t => t.name === name || t.shortName === shortName)) {
                return res.status(400).json({ error: 'Team name or shortName already exists' });
            }

            const newTeam = {
                id: generateId(),
                name,
                shortName,
                color: color || TEAM_COLORS[teams.length % TEAM_COLORS.length],
            };

            teams.push(newTeam);
            await saveTeams(teams);

            return res.status(201).json({
                success: true,
                team: newTeam,
                message: 'Team created successfully',
            });
        } catch (error) {
            console.error('Add team error:', error);
            return res.status(500).json({ error: 'Failed to add team' });
        }
    }

    // PUT /api/admin/teams?id=xxx - Update team
    if (req.method === 'PUT') {
        try {
            const { id } = req.query || {};
            const { name, shortName, color } = req.body || {};

            if (!id) {
                return res.status(400).json({ error: 'Team ID required' });
            }

            const teams = await getTeams();
            const index = teams.findIndex(t => t.id === id);

            if (index === -1) {
                return res.status(404).json({ error: 'Team not found' });
            }

            const oldTeam = teams[index];

            // Check for duplicate name (excluding current team)
            if (name && teams.some(t => t.id !== id && (t.name === name || t.shortName === shortName))) {
                return res.status(400).json({ error: 'Team name or shortName already exists' });
            }

            // Update fields
            teams[index] = {
                ...oldTeam,
                name: name || oldTeam.name,
                shortName: shortName || oldTeam.shortName,
                color: color || oldTeam.color,
            };

            await saveTeams(teams);

            // TODO: If team name changed, update all members with old team name

            return res.status(200).json({
                success: true,
                team: teams[index],
                message: 'Team updated successfully',
            });
        } catch (error) {
            console.error('Update team error:', error);
            return res.status(500).json({ error: 'Failed to update team' });
        }
    }

    // DELETE /api/admin/teams?id=xxx - Delete team
    if (req.method === 'DELETE') {
        try {
            const { id } = req.query || {};

            if (!id) {
                return res.status(400).json({ error: 'Team ID required' });
            }

            const teams = await getTeams();
            const index = teams.findIndex(t => t.id === id);

            if (index === -1) {
                return res.status(404).json({ error: 'Team not found' });
            }

            const team = teams[index];

            // Check if team has members
            const hasMembers = await teamHasMembers(team.name);
            if (hasMembers) {
                return res.status(400).json({
                    error: 'Cannot delete team with members',
                    message: 'Please reassign or remove all members from this team first.',
                });
            }

            // Remove team
            const deleted = teams.splice(index, 1)[0];
            await saveTeams(teams);

            return res.status(200).json({
                success: true,
                deleted,
                message: 'Team deleted successfully',
            });
        } catch (error) {
            console.error('Delete team error:', error);
            return res.status(500).json({ error: 'Failed to delete team' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
