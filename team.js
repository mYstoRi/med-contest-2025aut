// ========================================
// Team Page Configuration
// ========================================
const CONFIG = {
    // Published CSV URLs
    TOTALS_CSV_URL: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRziNeMKSXQhVUGcaUtS9VmGUhpWMiBDlo1H_U8p2pE5-0vx40TAZCTWjCZ9qy8rJTqjaDwp4od2WS2/pub?gid=288289321&single=true&output=csv',

    // Team configuration
    TEAMS: [
        { name: '晨絜家中隊', id: 1, color: 'team-1', shortName: '晨絜', colIndex: 3, memberColIndex: 2 },
        { name: '明緯家中隊', id: 2, color: 'team-2', shortName: '明緯', colIndex: 6, memberColIndex: 5 },
        { name: '敬涵家中隊', id: 3, color: 'team-3', shortName: '敬涵', colIndex: 9, memberColIndex: 8 },
        { name: '宗翰家中隊', id: 4, color: 'team-4', shortName: '宗翰', colIndex: 12, memberColIndex: 11 },
    ],
};

// ========================================
// Data Fetching
// ========================================
async function fetchTotalsData() {
    try {
        const response = await fetch(CONFIG.TOTALS_CSV_URL);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const csvText = await response.text();
        return parseTotalsCSV(csvText);
    } catch (error) {
        console.error('Error fetching totals data:', error);
        throw error;
    }
}

function parseTotalsCSV(csvText) {
    const lines = csvText.split('\n').map(line => {
        const values = [];
        let current = '';
        let inQuotes = false;
        for (const char of line) {
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                values.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        values.push(current.trim());
        return values;
    });

    const result = {
        teams: {}
    };

    // Parse each team's data
    for (const team of CONFIG.TEAMS) {
        const teamData = {
            name: team.name,
            shortName: team.shortName,
            color: team.color,
            id: team.id,
            level: 1,
            totalScore: 0,
            members: []
        };

        // Get level (row 2)
        if (lines[1]) {
            teamData.level = parseInt(lines[1][team.colIndex]) || 1;
        }

        // Get total score (row 4)
        if (lines[3]) {
            teamData.totalScore = parseFloat(lines[3][team.colIndex]) || 0;
        }

        // Get members (rows 7+)
        for (let i = 6; i < lines.length; i++) {
            const row = lines[i];
            if (!row || row.length < 12) continue;

            const name = row[team.memberColIndex];
            const points = parseFloat(row[team.memberColIndex + 1]) || 0;

            if (name && name.trim()) {
                teamData.members.push({ name: name.trim(), points });
            }
        }

        // Sort members by points (descending)
        teamData.members.sort((a, b) => b.points - a.points);

        result.teams[team.name] = teamData;
    }

    return result;
}

// ========================================
// Rendering
// ========================================
function renderTeamPage(teamData) {
    const container = document.getElementById('teamContent');
    if (!container) return;

    const maxMemberScore = Math.max(...teamData.members.map(m => m.points), 1);

    container.innerHTML = `
        <div class="${teamData.color}">
            <header class="team-header">
                <h1 class="team-title">${teamData.name}</h1>
                <div class="team-level">🎯 等級 Level ${teamData.level}</div>
                <div class="team-score-big">${teamData.totalScore.toLocaleString()}</div>
                <div class="team-score-label">累計總分 Total Score</div>
            </header>
            
            <section class="members-section">
                <h2 class="section-title">
                    <span class="section-icon">👥</span>
                    隊員積分 Member Scores
                </h2>
                
                ${teamData.members.map((member, index) => {
        const rankClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : '';
        const rankEmoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`;
        const barWidth = (member.points / maxMemberScore) * 100;

        return `
                        <div class="member-card">
                            <div class="member-rank ${rankClass}">${rankEmoji}</div>
                            <div class="member-info">
                                <div class="member-name">${member.name}</div>
                                <div class="member-bar-container">
                                    <div class="member-bar" style="width: ${barWidth}%"></div>
                                </div>
                            </div>
                            <div class="member-score">${member.points.toLocaleString()}</div>
                        </div>
                    `;
    }).join('')}
            </section>
        </div>
    `;
}

function showError(message) {
    const container = document.getElementById('teamContent');
    if (container) {
        container.innerHTML = `
            <div class="no-team-msg">
                <p style="font-size: 3rem; margin-bottom: 1rem;">😕</p>
                <p>${message}</p>
                <a href="./index.html" class="back-btn" style="margin-top: 1rem; display: inline-block;">
                    ← 返回主頁 Back to Dashboard
                </a>
            </div>
        `;
    }
}

// ========================================
// Theme Support
// ========================================
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
}

// ========================================
// Initialize
// ========================================
document.addEventListener('DOMContentLoaded', async () => {
    // Apply saved theme
    initTheme();

    // Get team name from URL
    const urlParams = new URLSearchParams(window.location.search);
    const teamName = urlParams.get('team');

    if (!teamName) {
        showError('請選擇一個隊伍 Please select a team');
        return;
    }

    try {
        const data = await fetchTotalsData();
        const teamData = data.teams[teamName];

        if (!teamData) {
            showError(`找不到隊伍: ${teamName}<br>Team not found`);
            return;
        }

        // Update page title
        document.title = `${teamData.name} | 隊伍詳情`;

        // Render team page
        renderTeamPage(teamData);

    } catch (error) {
        console.error('Failed to load team data:', error);
        showError('無法載入資料 Failed to load data');
    }
});
