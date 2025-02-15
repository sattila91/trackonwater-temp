const express = require('express');
const { checkEventAuth } = require('./middleware');
const { totalMessages, invalidMessages,trackersData } = require('./mqttHandler');
const { readJsonFile, writeJsonFile } = require('./utils');

const router = express.Router();

// Load trackersEventsData from file at startup
let trackersEventsData = readJsonFile(process.env.LOCAL_DB_TRACKERS_EVENTS_FILE_PATH) || {};




/**
 * POST: Update tracker data in memory.
 */
router.post('/data/:tracker_uid', (req, res) => {
    const trackerUid = req.params.tracker_uid;
    const trackerData = req.body;

    // Validate tracker_uid format (e.g., "tonw-0000" to "tonw-9999")
    if (!/^tonw-\d{4}$/.test(trackerUid)) {
        return res.status(400).json({ error: 'Invalid tracker_uid format. Expecting tonw-0000 to tonw-9999.' });
    }

    // Validate tracker data
    if (typeof trackerData !== 'object' || Array.isArray(trackerData)) {
        return res.status(400).json({ error: 'Invalid tracker data format. Expecting JSON object.' });
    }

    // Store tracker data in memory
    trackersData[trackerUid] = trackerData;

    return res.status(200).json({ message: `Data for tracker ${trackerUid} updated successfully.` });
});

/**
 * GET: Retrieve all tracker data belonging to an event.
 */
router.get('/data/:eventid', checkEventAuth, (req, res) => {
    const eventid = req.params.eventid;

    // Ensure trackersEventsData is loaded
    if (!trackersEventsData) {
        return res.status(500).json({ error: 'Trackers event mapping data is not loaded.' });
    }

    const trackerUidsForEvent = Object.entries(trackersEventsData)
        .filter(([trackerUid, assignedEventId]) => assignedEventId === eventid)
        //.map(([trackerUid]) => ({
        //    tracker_uid: trackerUid,
        //    data: trackersData[trackerUid] || {} // Return empty object if no data exists
        //}));
        .map(([trackerUid]) => {
            const trackerData = trackersData[trackerUid] || {};
            return {
                tracker_uid: trackerUid,
                data: trackerData.data || null, // Assuming 'data' is a property within trackerData
                timestamp : trackerData.timestamp
            };
        });

    return res.status(200).json(trackerUidsForEvent);
});

module.exports = router;
