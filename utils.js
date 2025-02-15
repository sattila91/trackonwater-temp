const fs = require('fs');

/**
 * Reads and parses a JSON file.
 * @param {string} filePath - Path to the JSON file.
 * @returns {Object|null} Parsed JSON data or null if an error occurs.
 */
function readJsonFile(filePath) {
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error(`Error reading file from ${filePath}:`, err);
        return null;
    }
}

/**
 * Writes data to a JSON file.
 * @param {string} filePath - Path to the JSON file.
 * @param {Object} data - JSON data to write.
 * @returns {boolean} True if successful, false otherwise.
 */
function writeJsonFile(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (err) {
        console.error(`Error writing file to ${filePath}:`, err);
        return false;
    }
}


/**
 * Validates API keys JSON structure.
 * Expects an array of objects where each object has:
 *  - id (string)
 *  - event (string)
 *  - apiKey (string)
 *  - generatedAt (string, valid ISO date)
 *  - valid (boolean)
 * @param {Array} data - JSON data to validate.
 * @returns {boolean} True if valid, false otherwise.
 */
function validateApiKeys(data) {
    if (!Array.isArray(data)) return false;
    for (const item of data) {
        if (typeof item !== 'object' || Array.isArray(item)) return false;
        if (typeof item.id !== 'string') return false;
        if (typeof item.event !== 'string') return false;
        if (typeof item.apiKey !== 'string') return false;
        if (typeof item.generatedAt !== 'string' || isNaN(Date.parse(item.generatedAt))) return false;
        if (typeof item.valid !== 'boolean') return false;
    }
    return true;
}


/**
 * Validates trackers events JSON structure.
 * Ensures that all keys and values are strings.
 * @param {Object} data - JSON data to validate.
 * @returns {boolean} True if valid, false otherwise.
 */
function validateTrackersEvents(data) {
    if (typeof data !== 'object' || Array.isArray(data)) return false;

    for (let key in data) {
        if (typeof key !== 'string' || typeof data[key] !== 'string') {
            return false; // Both keys and values should be strings
        }
    }
    return true;
}

/**
 * Checks if a timestamp is within the last 24 hours.
 * @param {number} timestamp - The timestamp to validate.
 * @returns {boolean} True if valid, false otherwise.
 */
function isValidTimestamp(timestamp) {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    return Math.abs(now - timestamp) <= maxAge;
}

module.exports = {
    readJsonFile,
    writeJsonFile,
    validateApiKeys,
    validateTrackersEvents,
    isValidTimestamp
};
