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
      // Toàn bộ stored procedure ghi thời gian bằng GETDATE(), tức giờ local của
      // SQL Server (UTC+7). Mặc định tedious dùng useUTC: true nên nó hiểu các
      // cột datetime đó là UTC, khiến mọi mốc thời gian hiển thị dôi thêm 7 giờ
      // và JS Date ghi xuống lại bị trừ 7 giờ so với GETDATE().
      useUTC: false,
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
  _sqlPoolKey?: string;
};

export async function getPool(): Promise<mssql.ConnectionPool> {
  const config = parseUrl(process.env.DATABASE_URL!);
  // Pool được cache trên globalThis nên nó sống sót qua hot-reload. Kèm theo dấu
  // vân tay của config để khi sửa connection option (useUTC, encrypt, ...) thì
  // pool cũ bị bỏ đi thay vì âm thầm chạy tiếp với cấu hình cũ.
  const key = JSON.stringify(config);

  if (globalForPool._sqlPool?.connected && globalForPool._sqlPoolKey === key) {
    return globalForPool._sqlPool;
  }

  const stale = globalForPool._sqlPool;
  if (stale) {
    globalForPool._sqlPool = undefined;
    stale.close().catch(() => {});
  }

  const pool = new mssql.ConnectionPool(config);
  await pool.connect();

  if (process.env.NODE_ENV !== "production") {
    globalForPool._sqlPool = pool;
    globalForPool._sqlPoolKey = key;
  }

  return pool;
}

export { mssql as sql };
