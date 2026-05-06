

/**
 * Aggregates raw events into billable sessions.
 * @param {Array} rawEvents - Sorted events from the database
 * @param {number} thresholdMs - 60 seconds (1 minute) merge window
 */
const aggregateSessions = (rawEvents, thresholdMs = 60000) => {
    if (!rawEvents || rawEvents.length === 0) return [];

    const sessions = [];
    let current = { ...rawEvents[0], durationMs: rawEvents[0].durationMs || 0 };

    for (let i = 1; i < rawEvents.length; i++) {
        const event = rawEvents[i];
        const timeGap = event.startTime - current.endTime;

        // Logic: Same App + Same Matter + Within Time Gap
        if (event.app === current.app && 
            event.matter === current.matter && 
            timeGap <= thresholdMs) {
            
            // Merge
            current.endTime = event.endTime;
            current.durationMs += event.durationMs;
        } else {
            // Push finished session
            sessions.push(calculateBillingUnits(current));
            current = { ...event };
        }
    }
    sessions.push(calculateBillingUnits(current));
    return sessions;
};

// Helper: Convert to 6-minute billing units (Legal standard)
const calculateBillingUnits = (session) => {
    const minutes = session.durationMs / 60000;
    // Round up to nearest 0.1 (or simple units)
    session.billableUnits = Math.ceil(minutes / 6); 
    return session;
};

module.exports = { aggregateSessions };