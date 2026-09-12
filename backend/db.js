const { Pool } = require("pg");
require("dotenv").config(); // Carrega o .env local (em produção as variáveis já vêm do ambiente)

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Necessário para conexões em nuvem como o Supabase
    },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

module.exports = pool;