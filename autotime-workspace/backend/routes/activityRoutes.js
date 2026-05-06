
const express = require('express');
const router = express.Router();
const { aggregateSessions } = require('../services/sessionService');
const RawEvent = require('../models/RawEvent'); // Assume Mongoose Model
const BillingSession = require('../models/BillingSession');

router.post('/log-activity', async (req, res) => {
    try {
        const eventData = req.body; // Incoming from C# Agent
        
        // 1. Save raw data for audit trail
        const newEvent = await RawEvent.create(eventData);

        // 2. Optional: Trigger aggregation here or on a schedule (cron)
        // For the prototype, we recalculate the latest user sessions
        const recentRaw = await RawEvent.find({ userId: eventData.userId })
                                        .sort({ startTime: 1 })
                                        .limit(100);
        
        const sessions = aggregateSessions(recentRaw);

        // 3. Update the BillingSessions collection (upsert logic)
        // In a real system, you'd only update the specific changed day
        await BillingSession.deleteMany({ userId: eventData.userId });
        await BillingSession.insertMany(sessions);

        res.status(200).json({ message: "Activity logged and sessionized" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;