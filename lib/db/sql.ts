import mssql from "mssql";

/**
 * Parse Prisma-style SQL Server URL:
 * sqlserver://HOST:PORT;database=DB;user=USER;password=PASS;encrypt=true;trustServerCertificate=true
 */
function parseUrl(url: string): mssql.config {
  const withoutProtocol = url.replace(/^sqlserver:\/\//, "");
  const [hostPart, ...rest] = withoutProtocol.split(";");
  const [server, portStr] = hostPart.split(":");

  const params: Record<string, string> = {};
  for (const part of rest) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    params[part.slice(0, eq).toLowerCase()] = part.slice(eq + 1);
  }

  return {
    server,
    port: portStr ? parseInt(portStr, 10) : 1433,
    database: params.database,
    user: params.user,
    password: params.password,
    options: {
      encrypt: params.encrypt !== "false",
      trustServerCertificate: params.trustservercertificate !== "false",
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30_000,
    },
  };
}

const globalForPool = globalThis as unknown as {
  _sqlPool?: mssql.ConnectionPool;
};

export async function getPool(): Promise<mssql.ConnectionPool> {
  if (globalForPool._sqlPool?.connected) return globalForPool._sqlPool;

  const config = parseUrl(process.env.DATABASE_URL!);
  const pool = new mssql.ConnectionPool(config);
  await pool.connect();

  if (process.env.NODE_ENV !== "production") {
    globalForPool._sqlPool = pool;
  }

  return pool;
}

export { mssql as sql };
