# 禪定積分賽 | Meditation Competition Dashboard

A real-time visualization dashboard for tracking meditation competition progress across teams. Built for Buddhist club meditation competitions.

## Features

- 🏆 **Team Leaderboard** - Animated score visualization with rankings
- 📊 **Member Stats** - Individual progress tracking per team member
- ✨ **Recent Activity Feed** - Live updates of meditation sessions
- 📝 **Meditation Registration** - Form for members to log their sessions
- 🔄 **Admin Panel** - Sync data, manage members and activities
- 🌓 **Dark/Light Mode** - User-configurable theme

## Quick Start

### 1. Fork & Clone

```bash
git clone https://github.com/YOUR-USERNAME/med-contest.git
cd med-contest
npm install
```

### 2. Create Google Sheet

Create a Google Sheet with these tabs (exact names required):
- `禪定登記` - Meditation records (columns: Team, Name, Total, Date1, Date2...)
- `共修登記` - Practice records (row 0: points per session, row 1: dates)
- `會館課登記` - Class attendance records
- `表單回應 1` - Form responses (optional)

**Make the sheet publicly viewable** (anyone with link can view).

### 3. Configure Sheet ID

Edit `config.js` and `api/admin/sync.js` to use your Sheet ID:

```javascript
// config.js
SHEET_ID: 'YOUR_GOOGLE_SHEET_ID',

// Also update in api/admin/sync.js
const SHEET_ID = 'YOUR_GOOGLE_SHEET_ID';
```

You can find the Sheet ID in the URL:
```
https://docs.google.com/spreadsheets/d/[SHEET_ID]/edit
```

### 4. Deploy to Vercel

1. Push to GitHub
2. Import to [Vercel](https://vercel.com)
3. Add environment variables (see below)
4. Deploy!

### 5. Set Up Upstash Redis

The app uses Upstash Redis for data persistence:

1. Go to [Upstash Console](https://console.upstash.com/)
2. Create a new Redis database
3. Copy the REST API credentials

### 6. Configure Environment Variables

In Vercel dashboard → Settings → Environment Variables, add:

| Variable | Description |
|----------|-------------|
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST Token |
| `ADMIN_PASSWORD` | Password for admin panel |

### 7. Initial Data Sync

1. Go to `your-domain.vercel.app/admin.html`
2. Login with your `ADMIN_PASSWORD`
3. Go to "🔄 資料同步" tab
4. Click "合併同步 Merge Sync" to import data from Google Sheets

## Local Development

```bash
# Create .env.local with your environment variables
echo "UPSTASH_REDIS_REST_URL=your_url" >> .env.local
echo "UPSTASH_REDIS_REST_TOKEN=your_token" >> .env.local
echo "ADMIN_PASSWORD=your_password" >> .env.local

# Start development server
npm run dev
```

## Customization

### Team Configuration

Edit `config.js` to customize teams:

```javascript
TEAMS: [
    { name: '晨絜家中隊', shortName: '晨絜', color: 'team-1' },
    { name: '明緯家中隊', shortName: '明緯', color: 'team-2' },
    // Add or modify teams...
],
```

### Point System

Modify point values in `config.js`:

```javascript
POINTS: {
    CLASS_PER_ATTENDANCE: 50,  // Points per class attendance
},
```

Practice session points are defined per-date in the Google Sheet (row 0).

## Architecture

```
├── index.html          # Main dashboard
├── member.html         # Member detail view
├── team.html           # Team detail view
├── register.html       # Meditation registration form
├── admin.html          # Admin dashboard
├── api/
│   ├── data.js         # GET /api/data - Fetch all data
│   ├── meditation/
│   │   └── submit.js   # POST - Submit meditation records
│   ├── admin/
│   │   ├── sync.js     # POST - Sync from Google Sheets
│   │   ├── members.js  # CRUD - Member management
│   │   └── activities.js # CRUD - Activity management
│   └── _lib/
│       ├── kv.js       # Upstash Redis wrapper
│       └── auth.js     # Admin authentication
```

## Data Flow

1. **Initial Setup**: Admin syncs data from Google Sheets → Database
2. **Member Submissions**: Form saves directly to database
3. **Dashboard**: Reads from database (not sheets)
4. **Updates**: Admin can re-sync to incorporate new Google Sheets data

## Tech Stack

- **Frontend**: Vanilla HTML/CSS/JS with Vite
- **Backend**: Vercel Serverless Functions
- **Database**: Upstash Redis (via @vercel/kv)
- **Deployment**: Vercel

## License

MIT
