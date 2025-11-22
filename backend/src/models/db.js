// backend/src/models/db.js
// MySQL(MariaDB) 연결 풀 설정

const mysql = require("mysql2/promise");
require("dotenv").config();

// .env 사용 (없으면 기본값 사용)
const pool = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "heritagedb",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

module.exports = pool;
