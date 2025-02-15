require('dotenv').config();

/**
 * Middleware to check admin authentication.
 * Verifies if the request contains a valid X-API-Key.
 */
function checkAdminAuth(req, res, next) {
    const adminKey = req.headers['x-api-key'];
    
    if (!adminKey) {
        return res.status(401).json({ error: 'Missing API key' });
    }

    if (adminKey === process.env.ADMIN_APKEY) {
        return next();
    } else {
        return res.status(403).json({ error: 'Unauthorized' });
    }
}

/**
 * Middleware to check event authentication.
 * Validates API key against the stored event keys.
 */
function checkEventAuth(req, res, next) {
    const eventKey = req.headers['x-api-key'];
    const eventid = req.params.eventid;

    if (!eventKey) {
        return res.status(401).json({ error: 'Missing API key' });
    }

    // Read API keys from file (expected to be an array of objects)
    const apiKeysData = require('./utils').readJsonFile(process.env.LOCAL_DB_EVENTS_APIKEYS_FILE_PATH) || [];
    
    // Find an active API key for the event that matches the provided key
    const validKey = apiKeysData.find(key => 
        key.event === eventid &&
        key.apiKey === eventKey &&
        key.valid === true
    );
    
    if (validKey) {
        return next();
    } else {
        return res.status(403).json({ error: 'Unauthorized for event' });
    }
}




const jwt = require('jsonwebtoken');

function authenticateJWT(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1]; // Get token from header
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
}


module.exports = {
    checkAdminAuth,
    checkEventAuth,
    authenticateJWT
};
