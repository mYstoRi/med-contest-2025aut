# 禪定積分賽 | Meditation Competition Dashboard

A real-time visualization dashboard for tracking meditation competition progress across teams. Built for Buddhist club meditation competitions.

## Features

- 🏆 **Team Leaderboard** - Animated score visualization with rankings
- 📊 **Member Stats** - Individual progress tracking per team member
- ✨ **Recent Activity Feed** - Live updates of meditation sessions
- 📝 **Meditation Registration** - Form for members to log their sessions
- 🔄 **Admin Panel** - Manage teams, members, and activities
- 🌓 **Dark/Light Mode** - User-configurable theme

## Quick Start

### 1. Fork & Clone

```bash
git clone https://github.com/YOUR-USERNAME/med-contest.git
cd med-contest
npm install
```

### 2. Deploy to Vercel

1. Push to GitHub
2. Import to [Vercel](https://vercel.com)
3. Add environment variables (see below)
4. Deploy!

### 3. Set Up Upstash Redis

The app uses Upstash Redis for data persistence:

1. Go to [Upstash Console](https://console.upstash.com/)
2. Create a new Redis database (free tier works fine)
3. Copy the REST API credentials

### 4. Configure Environment Variables

In Vercel dashboard → Settings → Environment Variables, add:

| Variable | Description |
|----------|-------------|
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST Token |
| `ADMIN_PASSWORD` | Password for admin panel |

### 5. Initial Setup

1. Go to `/admin.html` and login
2. **Create Teams**: Manage Teams tab → Add your teams (name, short name, color)
3. **Add Members**: Manual Records tab → Add members to teams
4. *(Optional)* Import from Google Sheets if migrating (see below)

### 6. Start Using!

1. Members submit meditation via `/register.html`
2. Scores appear automatically on the dashboard
3. Admin manages data at `/admin.html`

## Local Development

```bash
# Create .env.local with your environment variables
echo "UPSTASH_REDIS_REST_URL=your_url" >> .env.local
echo "UPSTASH_REDIS_REST_TOKEN=your_token" >> .env.local
echo "ADMIN_PASSWORD=your_password" >> .env.local

# Start development server
npm run dev
```

## Admin Panel Features

| Tab | Description |
|-----|-------------|
| **Data Sync** | Import from Google Sheets (Merge or Overwrite) |
| **Manual Records** | Add/edit meditation, practice, class activities |
| **Members List** | View all members, reassign teams, delete |
| **Manage Teams** | Create/edit/delete teams with custom colors |

### Sync Modes

- **Merge**: Adds new data from sheets, keeps existing manual entries
- **Overwrite**: Clears ALL manual data and imports fresh from sheets

## Point System

| Activity | Points |
|----------|--------|
| Meditation | 1 point per minute |
| Practice (共修) | Configurable per session in sheets |
| Class (會館課) | 50 points per attendance |

## Architecture

```
├── index.html          # Main dashboard
├── member.html         # Member detail view
├── team.html           # Team detail view
├── register.html       # Meditation registration form
├── admin.html          # Admin dashboard
├── api/
│   ├── data.js         # GET /api/data - Fetch all data (database only)
│   ├── meditation/
│   │   └── submit.js   # POST - Submit meditation records
│   ├── admin/
│   │   ├── teams.js    # CRUD - Team management
│   │   ├── members.js  # CRUD - Member management
│   │   ├── activities.js # CRUD - Activity management
│   │   └── sync.js     # POST - Import from Google Sheets
│   └── _lib/
│       ├── kv.js       # Upstash Redis wrapper
│       └── auth.js     # Admin authentication
```

## How It Works

1. **Members register meditation** via `/register.html` form
2. **Data is saved to database** (Upstash Redis)
3. **Dashboard reads from database** and displays scores
4. **Admin can manage** teams, members, and activities at `/admin.html`

No external spreadsheets or forms needed after initial setup!

## Tech Stack

- **Frontend**: Vanilla HTML/CSS/JS with Vite
- **Backend**: Vercel Serverless Functions
- **Database**: Upstash Redis (via @upstash/redis)
- **Deployment**: Vercel

## Google Sheets Import (Optional)

If migrating from an existing Google Sheets setup:

1. Prepare your Sheet with these tabs:
   - `禪定登記` - Meditation data
   - `共修登記` - Practice data  
   - `會館課登記` - Class data
2. Update `SHEET_ID` in `api/admin/sync.js` with your Sheet ID
3. Go to Admin Panel → 資料同步
4. Choose **Merge** (keep existing) or **Overwrite** (fresh start)
5. Click sync button

## License

MIT
