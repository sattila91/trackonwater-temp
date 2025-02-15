require('dotenv').config();
const express = require('express');
const https = require('https');
const fs = require('fs');
const { mqttClient } = require('./mqttHandler'); 
const apiRoutes = require('./apiRoutes'); 
const { router: adminRoutes, refreshLocalDB } = require('./adminApiRoutes');

const app = express();
app.use(express.json());
app.use(apiRoutes); 
app.use(adminRoutes); 

app.use(express.static('public'));

const port = process.env.PORT || 8080;
const sslEnabled = process.env.SSL_ENABLED === 'true';
const options = sslEnabled ? {
    key: fs.readFileSync(process.env.SSL_KEY_PATH),
    cert: fs.readFileSync(process.env.SSL_CERT_PATH),
} : {};

// Refresh in-memory data when the server starts
refreshLocalDB();

// Start Server
if (sslEnabled) {
    https.createServer(options, app).listen(port, () => console.log(`Server running on https://localhost:${port}`));
} else {
    app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
}
