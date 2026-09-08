/**
 * Đối chiếu bảng kê đơn hàng (listMonthlyPaidOrders) với bảng kê doanh thu tháng
 * (getMonthlyRevenueReport): tổng doanh thu và số đơn theo từng CTV phải khớp.
 * Chỉ đọc. Chạy: npx tsx --tsconfig tsconfig.json scripts/check-monthly-orders.ts [YYYY-MM ...]
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { getMonthlyRevenueReport, listMonthlyPaidOrders } from "@/lib/data/revenue";
import { getPool } from "@/lib/db/sql";
import { currentMonthKey, shiftMonth } from "@/lib/utils/month";

async function main() {
  const months = process.argv.slice(2);
  if (months.length === 0) months.push(shiftMonth(currentMonthKey(), -1), currentMonthKey());

  for (const month of months) {
    const t0 = Date.now();
    const [report, orders] = await Promise.all([
      getMonthlyRevenueReport({ month }),
      listMonthlyPaidOrders(month),
    ]);
    console.log(
      `\n${month}: ${Date.now() - t0}ms — ${report.rows.length} partners, ${orders.length} orders`,
    );

    const byPartner = new Map<number, { n: number; sum: number }>();
    for (const order of orders) {
      const cur = byPartner.get(order.partnerId) ?? { n: 0, sum: 0 };
      cur.n += 1;
      cur.sum += order.amount;
      byPartner.set(order.partnerId, cur);
    }

    let mismatches = 0;
    for (const row of report.rows) {
      const agg = byPartner.get(row.partnerId) ?? { n: 0, sum: 0 };
      if (agg.sum !== row.revenue || agg.n !== row.orderCount) {
        mismatches += 1;
        console.log(
          `  MISMATCH ${row.username}: report revenue=${row.revenue} orders=${row.orderCount}` +
            ` | listing sum=${agg.sum} orders=${agg.n}`,
        );
      }
    }
    const unknown = [...byPartner.keys()].filter(
      (id) => !report.rows.some((row) => row.partnerId === id),
    );
    const missing = orders.filter(
      (o) => !o.customerUserName || !o.packageName || !o.couponCode,
    ).length;
    console.log(
      `  mismatches=${mismatches}, orders of unknown partners=${unknown.length},` +
        ` orders missing customer/package/coupon=${missing}`,
    );
  }

  (await getPool()).close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
