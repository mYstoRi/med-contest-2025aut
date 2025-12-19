// API endpoint for submitting meditation records
// POST /api/meditation/submit

export default async function handler(req, res) {
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
        if (typeof duration !== 'number' || duration < 1 || duration > 480) {
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

        // Build the record
        const record = {
            timestamp: timestamp || new Date().toISOString(),
            name,
            date,
            duration,
            timeOfDay,
            thoughts: thoughts || '',
            shareConsent,
            submittedAt: new Date().toISOString()
        };

        // Log the submission (for now, just console.log)
        // TODO: Store in database/Google Sheets
        console.log('📝 New meditation record:', record);

        // For now, just return success
        // In the future, this would store to a database or append to Google Sheets
        return res.status(200).json({
            success: true,
            message: 'Meditation record submitted successfully',
            record: {
                name: record.name,
                date: record.date,
                duration: record.duration,
                timeOfDay: record.timeOfDay
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
