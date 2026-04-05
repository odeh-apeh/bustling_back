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
// config/db.js
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.INTERNAL_DATABASE_URL, 
    ssl: process.env.NODE_ENV === 'production' ? {
        rejectUnauthorized: false
    } : false,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
});

// Test connection
pool.connect((err, client, release) => {
    if (err) {
        console.error('❌ PostgreSQL connection error:', err.stack);
    } else {
        console.log('✅ PostgreSQL connected successfully');
        release();
    }
});

// Debug wrapper for queries
const debugQuery = async (text, params) => {
    console.log('🔍 SQL Query:', text?.substring(0, 200));
    console.log('📋 Params:', params);
    
    try {
        const start = Date.now();
        const result = await pool.query(text, params);
        const duration = Date.now() - start;
        if (duration > 1000) {
            console.log(`⚠️ Slow query (${duration}ms)`);
        }
        return result;
    } catch (error) {
        console.error('❌ SQL Error:', error.message);
        console.error('❌ Failed Query:', text);
        throw error;
    }
};

// ✅ FIXED: Add getConnection method for transactions
const getConnection = async () => {
    const client = await pool.connect();
    return {
        query: (text, params) => client.query(text, params),
        release: () => client.release(),
        // Transaction helpers
        beginTransaction: async () => {
            await client.query('BEGIN');
        },
        commit: async () => {
            await client.query('COMMIT');
        },
        rollback: async () => {
            await client.query('ROLLBACK');
        }
    };
};

module.exports = {
    query: debugQuery,
    execute: debugQuery,
    pool: pool,
    getConnection: getConnection,  // ✅ This is the fix - add this method
    // For backward compatibility with code expecting db.connect()
    connect: getConnection  // ✅ Alias for getConnection
};