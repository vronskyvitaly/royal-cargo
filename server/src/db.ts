import pg, { Pool } from "pg";

// Timestamps are stored as TIMESTAMP WITHOUT TIME ZONE, written via NOW()/DEFAULT NOW().
// The PostgreSQL session timezone is UTC, so those columns actually hold UTC wall-clock
// values (confirmed via `SHOW timezone` / `NOW()::timestamp` on the DB) — not Moscow time,
// despite the value being timezone-less. By overriding the type parser we append +00:00 so
// the returned string is a proper ISO timestamp; the frontend then renders it in
// Europe/Moscow via toLocaleString(..., { timeZone: "Europe/Moscow" }).
pg.types.setTypeParser(1114, (val: string) => {
  // val looks like "2026-07-03 13:05:12"
  return val ? val.replace(" ", "T") + "+00:00" : val;
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export default pool;
