import pg, { Pool } from "pg";

// Timestamps in DB are stored as TIMESTAMP WITHOUT TIME ZONE in Moscow local time.
// The pg library converts them using the OS timezone (UTC+2), shifting the time.
// By overriding the type parser we append +03:00 (Moscow) so the returned string
// is a proper ISO timestamp that JS/frontend can parse correctly.
pg.types.setTypeParser(1114, (val: string) => {
  // val looks like "2026-07-03 13:05:12"
  return val ? val.replace(" ", "T") + "+03:00" : val;
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export default pool;
