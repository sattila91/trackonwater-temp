const mqtt = require('mqtt');
const crypto = require('crypto');
require('dotenv').config();

// Store incoming tracker data
let trackersData = {};
let totalMessages = 0;
let invalidMessages = 0;

// MQTT Broker Configuration
const brokerUrl = `mqtt://${process.env.MQTT_URL}`;
const brokerPort = process.env.MQTT_PORT || 1883; // Default to 1883
const secretKey = process.env.HMAC_SECRET_KEY; // Ensure this is securely stored and not exposed

// Connect to MQTT broker
const mqttClient = mqtt.connect(brokerUrl, {
    port: brokerPort,
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD
});

mqttClient.on('connect', () => {
    console.log(' Connected to MQTT broker');

    // Subscribe to the topic where trackers publish data
    mqttClient.subscribe(process.env.MQTT_TOPIC, (err) => {
        if (!err) {
            console.log(' Subscribed to topic:', process.env.MQTT_TOPIC);
        } else {
            console.error(' Failed to subscribe:', err);
        }
    });
});

/**
 * Function to compute HMAC-SHA256
 * @param {string} message - The original message payload
 * @param {string} key - The secret key
 * @returns {string} HMAC hash in hex format
 */
function generateHMAC(message, key) {


    return crypto.createHmac('sha256', key).update(message).digest('hex');
}

/**
 * Validate timestamp (rejects messages older than 24 hours).
 */
function isValidTimestamp(timestamp) {
    const timestampms = new Date(timestamp).getTime();
    const now = Date.now();
    const maxAge = 100 * 24 * 60 * 60 * 1000;  // 24 hours in milliseconds
    console.log("timestamps:", now, timestampms);
    
    return Math.abs(now - timestampms) <= maxAge;
}

/**
 * Function to validate incoming MQTT messages
 * - Ensures the HMAC signature is correct
 * - Checks if the timestamp is valid (within 24 hours)
 */
mqttClient.on('message', (topic, message) => {
    try {
        const receivedPayload = JSON.parse(message.toString());
        const { tracker_uid, data, hmac, timestamp } = receivedPayload;

        // Validate required fields
        if (!tracker_uid || !data || !hmac || !timestamp) {
            console.warn('Missing required fields in MQTT message');
            invalidMessages++;
            return;
        }

        // Verify timestamp validity (ensure it is within 24 hours)
        if (!isValidTimestamp(timestamp)) {
            console.warn(` Timestamp invalid for ${tracker_uid}. Possible replay attack.`);
            invalidMessages++;
            return;
        }

        // Recreate the message string (same format as sent by the tracker)
        const reconstructedMessage = JSON.stringify({ tracker_uid, data, timestamp });

        // Compute HMAC with the shared secret key
        const computedHMAC = generateHMAC(reconstructedMessage, secretKey);
	console.log("reconstructedMessage:",reconstructedMessage);
	console.log("HMAC hash:",computedHMAC);

        // Compare received HMAC with computed HMAC
        if (computedHMAC !== hmac) {
            console.warn(` HMAC Mismatch for ${tracker_uid}. Message might be tampered with!`);
            invalidMessages++;
            return;
        }

        // If everything is valid, update tracker data
        if (!trackersData[tracker_uid]) {
            trackersData[tracker_uid] = { data, timestamp: timestamp, messageCount: 0, servertime : Date.now() };
        } else {
            // Calculate time difference between messages
            //const previousTimestamp = new Date(trackersData[tracker_uid].timestamp).getTime();
	    const previousTimestamp = trackersData[tracker_uid].servertime;
            const currentTimestamp =  Date.now();
            const timeDifference = (currentTimestamp - previousTimestamp) / 1000; // in seconds

            console.log(` Time between last two messages for ${tracker_uid}: ${timeDifference} seconds`);
	    trackersData[tracker_uid].servertime = currentTimestamp;
            trackersData[tracker_uid].timestamp = timestamp ;
            trackersData[tracker_uid].messageCount++;
        }

        totalMessages++;
        console.log(` Message ${totalMessages} from ${tracker_uid} validated and stored.`);

    } catch (error) {
        console.error(' Failed to process MQTT message:', error);
        invalidMessages++;
    }
});

// Export MQTT client and tracker data for use in other files
module.exports = { totalMessages, mqttClient, trackersData ,invalidMessages};
