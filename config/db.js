const mysql = require('mysql2');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306, // Ensure this matches Render's Internal Port
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 30000, // 20 seconds to allow for "cold starts"
    ssl: {
        rejectUnauthorized: false // Often required for managed cloud environments
    }
});

module.exports = pool.promise();