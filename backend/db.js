const { Pool } = require("pg");
const dns = require("node:dns");

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn("DATABASE_URL is not set. Backend routes will fail until it is configured.");
}

const ssl = process.env.DB_SSL === "false" ? false : { rejectUnauthorized: false };

async function createPool() {
  if (!connectionString) {
    return new Pool({ connectionString, ssl });
  }

  // Render often has unreliable IPv6 egress; some Supabase hostnames resolve to IPv6 first.
  // Resolve an IPv4 address and connect using the IPv4 literal to force IPv4.
  try {
    const url = new URL(connectionString);
    const hostname = url.hostname;

    const addresses = await dns.promises.resolve4(hostname);
    const ipv4Host = addresses?.[0];

    if (!ipv4Host) {
      throw new Error("No IPv4 address found for database host.");
    }

    return new Pool({
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      host: ipv4Host,
      port: Number(url.port || 5432),
      database: url.pathname.replace(/^\//, "") || "postgres",
      ssl:
        ssl && typeof ssl === "object"
          ? { ...ssl, servername: hostname }
          : ssl,
    });
  } catch (_error) {
    // Fallback to the default behavior (may still work in environments with IPv6).
    return new Pool({
      connectionString,
      ssl,
      family: process.env.DB_FAMILY ? Number(process.env.DB_FAMILY) : 4,
    });
  }
}

const poolPromise = createPool();

async function query(text, params = []) {
  const pool = await poolPromise;
  return pool.query(text, params);
}

async function withTransaction(work) {
  const pool = await poolPromise;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  pool: poolPromise,
  query,
  withTransaction,
};
