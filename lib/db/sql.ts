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
  _sqlPoolPromise?: Promise<mssql.ConnectionPool>;
  _sqlPoolKey?: string;
};

/**
 * Trả về pool dùng chung cho cả process (kể cả production).
 *
 * Trước đây pool chỉ được cache khi NODE_ENV !== "production": trên server thật
 * MỖI lần gọi getPool() lại mở một ConnectionPool mới (TCP + TLS + login) và
 * không bao giờ đóng. Một lần tải /admin gọi getPool() ~36 lần → hàng chục
 * connection mới mỗi request, càng chạy lâu càng chậm.
 *
 * Cache theo Promise (không phải pool đã connect) để nhiều request đến cùng lúc
 * khi pool chưa sẵn sàng cùng chờ một kết nối thay vì mỗi request tự mở một pool.
 */
export async function getPool(): Promise<mssql.ConnectionPool> {
  const config = parseUrl(process.env.DATABASE_URL!);
  // Kèm dấu vân tay của config để khi sửa connection option (useUTC, encrypt, ...)
  // trong dev/hot-reload thì pool cũ bị bỏ đi thay vì âm thầm chạy tiếp với cấu hình cũ.
  const key = JSON.stringify(config);

  if (globalForPool._sqlPoolPromise && globalForPool._sqlPoolKey === key) {
    try {
      const pool = await globalForPool._sqlPoolPromise;
      if (pool.connected) return pool;
    } catch {
      // Kết nối trước đó thất bại → tạo pool mới bên dưới.
    }
  }

  const stale = globalForPool._sqlPoolPromise;
  if (stale) {
    globalForPool._sqlPoolPromise = undefined;
    stale.then((pool) => pool.close()).catch(() => {});
  }

  const poolPromise = new mssql.ConnectionPool(config).connect();
  globalForPool._sqlPoolPromise = poolPromise;
  globalForPool._sqlPoolKey = key;

  try {
    return await poolPromise;
  } catch (err) {
    if (globalForPool._sqlPoolPromise === poolPromise) {
      globalForPool._sqlPoolPromise = undefined;
    }
    throw err;
  }
}

export { mssql as sql };
