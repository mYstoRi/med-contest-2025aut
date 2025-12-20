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
    // Team configuration (DEPRECATED - loaded from API)
    TEAMS: [],

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
