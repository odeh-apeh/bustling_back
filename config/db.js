// const mysql = require('mysql2');
// require('dotenv').config();

// const pool = mysql.createPool({
//     host: process.env.DB_HOST,
//     user: process.env.DB_USER,
//     password: process.env.DB_PASSWORD,
//     database: process.env.DB_NAME,
//     port: process.env.DB_PORT || 3306, // Ensure this matches Render's Internal Port
//     waitForConnections: true,
//     connectionLimit: 10,
//     queueLimit: 0,
//     connectTimeout: 30000, // 20 seconds to allow for "cold starts"
//     ssl: {
//         rejectUnauthorized: false // Often required for managed cloud environments
//     }
// });

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.INTERNAL_DATABASE_URL, 
    ssl: {
        rejectUnauthorized: false
    }
});

module.exports = {
    query: (text, params) => pool.query(text, params),  // Add this
    execute: (text, params) => pool.query(text, params), // Keep for backward compatibility
    getConnection: async () => {  // Add this for transaction support
        const client = await pool.connect();
        return {
            query: (text, params) => client.query(text, params),
            release: () => client.release(),
            beginTransaction: async () => client.query('BEGIN'),
            commit: async () => client.query('COMMIT'),
            rollback: async () => client.query('ROLLBACK')
        };
    }
};