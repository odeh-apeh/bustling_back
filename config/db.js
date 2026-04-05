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

// config/db.js
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.INTERNAL_DATABASE_URL, 
    ssl: {
        rejectUnauthorized: false
    }
});

// Debug wrapper to log queries (optional)
const debugQuery = async (text, params) => {
    console.log('🔍 SQL Query:', text);
    console.log('📋 Params:', params);
    try {
        const result = await pool.query(text, params);
        return result;
    } catch (error) {
        console.error('❌ SQL Error:', error.message);
        console.error('❌ Failed Query:', text);
        throw error;
    }
};

module.exports = {
    query: (text, params) => debugQuery(text, params),
    execute: (text, params) => debugQuery(text, params),
    pool: pool, // ✅ EXPOSE THE POOL for session store
    getConnection: async () => {
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