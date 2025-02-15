const express = require('express');
const fs = require('fs');
const { checkAdminAuth,authenticateJWT } = require('./middleware');
const { readJsonFile, writeJsonFile, validateApiKeys, validateTrackersEvents } = require('./utils');
const { totalMessages, invalidMessages,trackersData } = require('./mqttHandler');

const router = express.Router();

// In-memory objects for storing API keys and tracker events
let apiKeysData = readJsonFile(process.env.LOCAL_DB_EVENTS_APIKEYS_FILE_PATH) || [];
let trackersEventsData = readJsonFile(process.env.LOCAL_DB_TRACKERS_EVENTS_FILE_PATH) || {};

/**
 * Function to refresh in-memory data after updates.
 */
function refreshLocalDB() {
    apiKeysData = readJsonFile(process.env.LOCAL_DB_EVENTS_APIKEYS_FILE_PATH) || [];
    trackersEventsData = readJsonFile(process.env.LOCAL_DB_TRACKERS_EVENTS_FILE_PATH) || {};
}

/**
 * Admin GET endpoint to retrieve events API keys.
 */
router.get('/admin/files/events_apikeys', checkAdminAuth, (req, res) => {
    if (apiKeysData) {
        return res.json(apiKeysData);
    } else {
        return res.status(500).json({ error: 'Failed to read events API keys.' });
    }
});

/**
 * Admin GET endpoint to retrieve tracker event configurations.
 */
router.get('/admin/files/trackers_events', checkAdminAuth, (req, res) => {
    if (trackersEventsData) {
        return res.json(trackersEventsData);
    } else {
        return res.status(500).json({ error: 'Failed to read tracker event configurations.' });
    }
});

/**
 * Admin POST endpoint to update events API keys.
 */
router.post('/admin/files/events_apikeys', checkAdminAuth, (req, res) => {
    const newApiKeys = req.body;

    if (!validateApiKeys(newApiKeys)) {
        return res.status(400).json({ error: 'Invalid events API keys format.' });
    }

    if (writeJsonFile(process.env.LOCAL_DB_EVENTS_APIKEYS_FILE_PATH, newApiKeys)) {
        refreshLocalDB(); // Refresh in-memory storage
        return res.status(200).json({ message: 'Events API keys updated successfully.' });
    } else {
        return res.status(500).json({ error: 'Failed to update events API keys.' });
    }
});

/**
 * Admin POST endpoint to update tracker event mappings.
 */
router.post('/admin/files/trackers_events', checkAdminAuth, (req, res) => {
    const newTrackersEvents = req.body;

    if (!validateTrackersEvents(newTrackersEvents)) {
        return res.status(400).json({ error: 'Invalid trackers events format.' });
    }

    if (writeJsonFile(process.env.LOCAL_DB_TRACKERS_EVENTS_FILE_PATH, newTrackersEvents)) {
        refreshLocalDB(); // Refresh in-memory storage
        return res.status(200).json({ message: 'Tracker event mappings updated successfully.' });
    } else {
        return res.status(500).json({ error: 'Failed to update tracker event mappings.' });
    }
});



router.get('/admin/health',(req, res) => {
return res.status(200).send('OK');

});

const jwt = require('jsonwebtoken');

router.post('/admin/login', (req, res) => {
    const { username, password } = req.body;

    // Hardcoded user for example (use a real user database)
    if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
        const token = jwt.sign({ username }, process.env.JWT_SECRET, { expiresIn: '12h' });
        return res.json({ token });
    }

    res.status(401).json({ error: 'Invalid credentials' });
});


// Example of a protected route
router.get('/admin/secure-data-test-get', authenticateJWT, (req, res) => {
    res.json({ message: 'Secure admin data accessed', user: req.user });
});



router.get('/admin/trackerstat', authenticateJWT, (req, res) => {
    res.json({
        totalMessages,
        invalidMessages,
        activeTrackers: Object.keys(trackersData).length
    });
});



router.get('/admin/trackerdata', authenticateJWT, (req, res) => {
    const allTrackers = Object.entries(trackersData).map(([tracker_uid, trackerData]) => ({
        tracker_uid: tracker_uid, // Use the key as tracker_uid
        data: trackerData.data || null,
        timestamp: trackerData.timestamp || null
    }));

    return res.status(200).json(allTrackers);
});



//APIKEY MANAGEMENT
const crypto = require('crypto');

/**
 * New JWT-authenticated route to retrieve existing API keys.
 * This endpoint returns the API keys stored in the file.
 */
router.get('/admin/apikeys', authenticateJWT, (req, res) => {
  if (Array.isArray(apiKeysData)) {
    return res.status(200).json(apiKeysData);
  } else {
    return res.status(500).json({ error: 'API keys data is not properly formatted.' });
  }
});

/**
 * POST /admin/apikeys - Generate a new API key for a given event.
 * Adds generatedAt timestamp and sets valid=true.
 * Also invalidates any existing active key for the same event.
 */
router.post('/admin/apikeys', authenticateJWT, (req, res) => {
    const { event } = req.body;
    if (!event) {
        return res.status(400).json({ error: 'Event name is required.' });
    }
    // Ensure apiKeysData is an array
    if (!Array.isArray(apiKeysData)) {
        apiKeysData = [];
    }
    // Invalidate any existing active keys for the same event
    apiKeysData.forEach(key => {
        if (key.event === event && key.valid === true) {
            key.valid = false;
        }
    });
    // Generate new API key with generation date and valid flag true
    const apiKey = crypto.randomBytes(16).toString('hex');
    const id = crypto.randomBytes(4).toString('hex');
    const generatedAt = new Date().toISOString();
    const newKey = { id, event, apiKey, generatedAt, valid: true };

    // Append new key and write to file
    apiKeysData.push(newKey);
    if (writeJsonFile(process.env.LOCAL_DB_EVENTS_APIKEYS_FILE_PATH, apiKeysData)) {
        refreshLocalDB();
        return res.status(200).json(newKey);
    } else {
        return res.status(500).json({ error: 'Failed to write new API key to file.' });
    }
});



/**
 * PUT /admin/apikeys/:id/invalidate - Invalidate (not delete) an API key.
 */
router.put('/admin/apikeys/:id/invalidate', authenticateJWT, (req, res) => {
    const { id } = req.params;
    if (!Array.isArray(apiKeysData)) {
        apiKeysData = [];
    }
    let keyFound = false;
    apiKeysData = apiKeysData.map(key => {
        if (key.id === id && key.valid === true) {
            keyFound = true;
            return { ...key, valid: false };
        }
        return key;
    });
    if (!keyFound) {
        return res.status(404).json({ error: 'Active API key not found.' });
    }
    if (writeJsonFile(process.env.LOCAL_DB_EVENTS_APIKEYS_FILE_PATH, apiKeysData)) {
        refreshLocalDB();
        return res.status(200).json({ message: 'API key invalidated successfully.' });
    } else {
        return res.status(500).json({ error: 'Failed to update API key.' });
    }
});



/*DEVICES PAGE*/

/**
 * JWT-authenticated GET endpoint to retrieve all device assignments.
 * Returns a JSON object mapping device IDs to events.
 */
router.get('/admin/devices', authenticateJWT, (req, res) => {
	refreshLocalDB();    
	return res.status(200).json(trackersEventsData);
});

/**
 * JWT-authenticated PUT endpoint to update a single device's assignment.
 * Expects a JSON body with an "event" property.
 */
router.put('/admin/devices/:deviceId', authenticateJWT, (req, res) => {
    const deviceId = req.params.deviceId;
    const { event } = req.body;
    if (!event) {
        return res.status(400).json({ error: 'Event is required for assignment.' });
    }
    refreshLocalDB();
    let devicesData = trackersEventsData;
    devicesData[deviceId] = event;

    if (writeJsonFile(process.env.LOCAL_DB_TRACKERS_EVENTS_FILE_PATH, devicesData)) {
        return res.status(200).json({ message: 'Device assignment updated successfully.' });
    } else {
        return res.status(500).json({ error: 'Failed to update device assignment.' });
    }
});


/**
 * POST: Bulk update device assignments.
 * URL: /admin/devices/bulk
 * Expects a JSON body with a mapping of device IDs to event names, for example:
 * {
 *   "tonw-0000": "newEvent1",
 *   "tonw-0001": "newEvent2"
 * }
 */
router.post('/admin/devices/bulk', authenticateJWT, (req, res) => {
    const newAssignments = req.body;
    
    // Validate that the payload is an object (and not an array)
    if (typeof newAssignments !== 'object' || Array.isArray(newAssignments)) {
        return res.status(400).json({ error: 'Invalid data format. Expected an object mapping device IDs to events.' });
    }
    
    // Load the existing devices data (as an object mapping device IDs to events)
    let devicesData = readJsonFile(process.env.LOCAL_DB_TRACKERS_EVENTS_FILE_PATH) || {};
    
    // Merge the new assignments into the existing mapping
    devicesData = { ...devicesData, ...newAssignments };
    
    // Write the updated devices data back to the file
    if (writeJsonFile(process.env.LOCAL_DB_TRACKERS_EVENTS_FILE_PATH, devicesData)) {
        return res.status(200).json({ message: 'Bulk update successful.', devices: devicesData });
    } else {
        return res.status(500).json({ error: 'Failed to update device assignments.' });
    }
});




module.exports = { router, refreshLocalDB, apiKeysData, trackersEventsData };





