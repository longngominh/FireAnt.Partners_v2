# FireAnt Partners V2

Hệ thống quản lý đối tác FireAnt — bản viết lại trên Next.js 16, thay thế bản
AngularJS + ASP.NET MVC 5 cũ.

## Stack

| Phần            | Công nghệ                                                |
| --------------- | -------------------------------------------------------- |
| Framework       | Next.js 16 (App Router, Turbopack), React 19             |
| Ngôn ngữ        | TypeScript 5                                             |
| UI              | Tailwind CSS v4 + shadcn/ui (Radix), Sonner, Lucide      |
| Charts          | Recharts                                                 |
| Auth            | Auth.js v5 (Credentials + JWT)                           |
| Database        | SQL Server (DB chính FireAnt) qua Prisma 6               |
| Validation      | Zod                                                      |
| Short-link / QR | nanoid + qrcode (self-hosted, thay Firebase Dynamic Links) |

## Tính năng MVP

- Dashboard Bento Grid với "Thực nhận" làm hero tile + chart 6 tháng
- Tạo link thanh toán: form tối giản, preview hoa hồng live, dialog QR + Quick Copy
- Danh sách coupon: bảng có visual hierarchy "Thực nhận" + status badge xanh/đỏ
- Danh sách khách hàng (read-only)
- Admin: quản lý đối tác + xem hiệu suất từng đối tác
- Auth.js Credentials + RBAC (Partner / Admin)
- Short-link tự host: `/p/{code}` redirect 302 sang trang checkout

## Cấu trúc

```
app/
  (auth)/login/         — Đăng nhập
  (app)/                — Layout có sidebar + topbar
    dashboard/          — Bento Grid + charts
    payment/            — Danh sách coupon
    payment/create/     — Form tạo link + Dialog preview
    customers/          — Khách hàng (read-only)
    admin/partners/     — Quản lý đối tác (admin only)
  api/auth/[...nextauth]/  — Auth.js handler
  p/[code]/             — Short-link redirect

components/
  ui/                   — shadcn cherry-pick
  layout/               — Sidebar, Topbar, UserMenu
  features/             — Component theo domain
    auth/, payment/, dashboard/, admin/, customers/
  shared/               — Pagination, etc.

lib/
  auth/                 — Server actions cho auth
  admin/                — Server actions cho admin
  payment/              — Server actions cho payment
  data/                 — Data layer (mock + sẽ swap qua Prisma sau)
  validations/          — Zod schemas
  utils/                — currency, qr, shortcode
  db/prisma.ts          — Prisma client singleton

prisma/schema.prisma    — Placeholder; chạy `pnpm db:pull` để introspect
scripts/setup-account.ts — CLI tạo admin/partner đầu tiên
auth.config.ts          — Auth.js config (edge-safe, dùng cho proxy/middleware)
auth.ts                 — Auth.js full instance (Credentials provider + bcrypt)
proxy.ts                — Auth proxy (Next.js 16 thay middleware.ts)
```

## Setup

### 1. Cài deps

```powershell
pnpm install
```

### 2. Cấu hình môi trường

Copy `.env.example` → `.env` và điền:

- `NEXT_PUBLIC_APP_URL` — base URL của app (ví dụ `https://partners.fireant.vn`).
  Dùng để sinh short-link trong QR.
- `AUTH_SECRET` — secret cho Auth.js (`openssl rand -base64 32`).
- `DATABASE_URL` — connection string SQL Server tới DB chính FireAnt.
  Format Prisma:
  `sqlserver://HOST:PORT;database=DB;user=USER;password=PASS;encrypt=true;trustServerCertificate=true`

### 3. Database

```powershell
# Bước 1: introspect schema từ DB chính
pnpm db:pull

# Bước 2: thêm lại model PartnerV2Auth vào schema.prisma sau khi pull
#         (xem template trong prisma/schema.prisma trước khi chạy db:pull)

# Bước 3: tạo bảng PartnerV2Auth (an toàn, chỉ thêm bảng mới)
pnpm db:push

# Bước 4: generate client
pnpm db:generate
```

> **Quan trọng:** Sau khi `db:pull`, các model như `Coupon`, `Partner`,
> `Customer`, `Order` sẽ được sinh ra theo schema thật. Lúc đó cần thay
> `lib/data/mock.ts` import bằng Prisma queries (xem TODO trong từng file
> `lib/data/*.ts`).

### 4. Tạo tài khoản admin đầu tiên

```powershell
pnpm setup:account --email admin@fireant.vn --password "ChangeMe123!" --role admin
```

Tạo partner:

```powershell
pnpm setup:account --email partner@fireant.vn --password "ChangeMe123!" --role partner --partner-id "PARTNER_GUID_FROM_MAIN_DB"
```

### 5. Chạy

```powershell
pnpm dev      # http://localhost:3000
pnpm build    # production build
pnpm start    # serve build
pnpm lint     # ESLint
```

## So với hệ thống cũ

| Vấn đề ở bản cũ                                  | Cách V2 xử lý                                |
| ------------------------------------------------ | -------------------------------------------- |
| Firebase Dynamic Links (deprecated 8/2025)       | Self-host `/p/{code}` + nanoid + QRCode      |
| Hard-code Firebase API key trong source          | Không còn dependency vào Firebase            |
| CSRF validation bị comment out                   | Auth.js + Server Actions enforce CSRF        |
| AngularJS 1.x EOL                                | React 19 + Next.js 16                        |
| ECharts (heavyweight)                            | Recharts (đủ nhu cầu, gọn hơn)               |
| ASP.NET Identity cookie                          | Auth.js JWT, edge-compatible                 |

## Còn cần làm trước khi production

- [ ] `pnpm db:pull` introspect SQL Server schema thật, swap mock → Prisma
- [ ] Verify công thức tính hoa hồng (`underDiscountRate`/`aboveDiscountRate`/
      `revenueReference`) với owner hệ thống cũ
- [ ] Thêm rate-limit cho `/p/[code]` (chống abuse)
- [ ] Setup deploy (Vercel hoặc self-host Node — quyết định sau)
- [ ] Logging + error tracking (Sentry hoặc tương đương)
- [ ] Audit log cho hành động admin
