// backend/config/db.js
const { Pool } = require("pg");

const pool = new Pool({
    user: "postgres",
    host: "localhost",
    database: "admission_system",
    password: "postgres123", // ← use YOUR password
    port: 5432
});

module.exports = pool;
