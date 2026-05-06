import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // mssql/tedious dùng CJS module singleton cho type registry.
  // Nếu Turbopack bundle chúng thành instance riêng, các type reference
  // (TYPES.Int, TYPES.NVarChar, ...) sẽ khác với instance nội bộ của tedious,
  // khiến parameterized queries ném lỗi "parameter.type.validate is not a function".
  // Giải pháp: khai báo external để Next.js dùng Node.js require() trực tiếp.
  serverExternalPackages: ["mssql", "tedious"],

  // Chạy sau IIS reverse proxy: IIS rewrite URL về http://localhost:8668/...
  // làm Host header của Node.js bị "localhost:8668", còn browser gửi
  // Origin: https://partner.fireant.vn. Next.js coi mismatch là CSRF tấn công
  // và reject Server Actions. Whitelist các origin hợp lệ ở đây.
  experimental: {
    serverActions: {
      allowedOrigins: [
        "partner.fireant.vn",
        "dev.partner.fireant.vn",
        "localhost:3000",
        "localhost:8668",
      ],
    },
  },
};

export default nextConfig;
