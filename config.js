// ========================================
// Shared Configuration
// ========================================
export const CONFIG = {
    // Google Sheets ID
    SHEET_ID: '1b2kQ_9Ry0Eu-BoZ-EcSxZxkbjIzBAAjjPGQZU9v9f_s',

    // Sheet names - SINGLE SOURCE OF TRUTH
    SHEETS: {
        MEDITATION: '禪定登記',
        PRACTICE: '共修登記',
        CLASS: '會館課登記',
        FORM_RESPONSES: '表單回應 1',
    },

    // Published CSV URLs
    TOTALS_CSV_URL: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRziNeMKSXQhVUGcaUtS9VmGUhpWMiBDlo1H_U8p2pE5-0vx40TAZCTWjCZ9qy8rJTqjaDwp4od2WS2/pub?gid=288289321&single=true&output=csv',

    // Points configuration
    POINTS: {
        CLASS_PER_ATTENDANCE: 50,
    },

    // Refresh interval in milliseconds (5 minutes)
    REFRESH_INTERVAL: 5 * 60 * 1000,

    // Team configuration
    TEAMS: [
        { name: '晨絜家中隊', id: 1, color: 'team-1', shortName: '晨絜', colIndex: 3, memberColIndex: 2 },
        { name: '明緯家中隊', id: 2, color: 'team-2', shortName: '明緯', colIndex: 6, memberColIndex: 5 },
        { name: '敬涵家中隊', id: 3, color: 'team-3', shortName: '敬涵', colIndex: 9, memberColIndex: 8 },
        { name: '宗翰家中隊', id: 4, color: 'team-4', shortName: '宗翰', colIndex: 12, memberColIndex: 11 },
    ],

    // Column indices in form responses (0-indexed)
    COLUMNS: {
        TIMESTAMP: 0,
        NAME: 1,
        DATE: 2,
        MINUTES: 3,
        TEAM: 4,
    },

    // Score source colors
    SOURCE_COLORS: {
        meditation: '#8b5cf6',
        practice: '#10b981',
        class: '#f59e0b',
    }
};

// Helper to get team config by name
export function getTeamConfig(teamName) {
    return CONFIG.TEAMS.find(t =>
        t.name === teamName ||
        t.shortName === teamName ||
        teamName?.includes(t.shortName)
    ) || { name: teamName, id: 0, color: 'team-1', shortName: teamName };
}
