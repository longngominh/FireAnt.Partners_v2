import { getPool, sql } from "@/lib/db/sql";
import { findFireAntUser } from "@/lib/data/identity";
import { listPackages, type ServicePackage } from "@/lib/data/packages";
import {
  MEMBERSHIP_PREMIUM,
  MEMBERSHIP_PRO,
  isMembershipService,
  tierName,
} from "@/lib/payment/tiers";
import {
  MIN_UPGRADE_AMOUNT,
  amountLeft as calcAmountLeft,
  dayLeft as calcDayLeft,
  keepEndDatePrice,
  packageDays,
  resultEndDate,
  roundVnd,
  tradeInPrice,
  type UpgradePackage,
} from "@/lib/payment/upgrade-math";

export type UpgradeOption = {
  /** "keep" hoặc "pkg:{packageId}" — gửi lên server action khi tạo link */
  key: string;
  kind: "keep" | "trade";
  /** keep: gói dùng làm đơn giá ngày; trade: gói mua trọn */
  packageId: number;
  months: number;
  listAmount: number;
  /** Số tiền khách phải trả, đã làm tròn lên 1.000 */
  price: number;
  available: boolean;
  /** Hạn mới dự kiến (ISO) nếu thanh toán hôm nay; null khi không mua được */
  endDate: string | null;
  badge: "popular" | "best" | null;
};

export type UpgradeTier = {
  serviceId: number;
  name: string;
  options: UpgradeOption[];
};

export type UpgradeCurrent = {
  serviceId: number;
  name: string;
  endDate: string;
  dayLeft: number;
  /** Gói gốc (đơn hàng gần nhất đã duyệt + đã thanh toán) */
  packageId: number;
  packageName: string | null;
  months: number;
  amount: number;
};

export type UpgradeQuote =
  | {
      eligible: false;
      title: string;
      detail: string;
      /** Gợi ý chuyển sang tab mua gói mới */
      suggestPurchase?: boolean;
    }
  | {
      eligible: true;
      userName: string;
      current: UpgradeCurrent;
      amountLeft: number;
      tiers: UpgradeTier[];
    };

type SubscriberRow = {
  ServiceID: number;
  StartDate: Date;
  EndDate: Date;
  IsTrial: boolean;
};

type OldPackageRow = {
  OrderID: number;
  PackageID: number;
  ServiceID: number;
  Months: number;
  Amount: number;
  PackageName: string | null;
};

function ineligible(title: string, detail: string, suggestPurchase = false): UpgradeQuote {
  return { eligible: false, title, detail, suggestPurchase };
}

export function toUpgradePackage(p: ServicePackage): UpgradePackage {
  return {
    packageId: p.packageId,
    serviceId: p.serviceId,
    months: p.months,
    amount: p.amount,
    packageName: p.packageName,
  };
}

/**
 * Báo giá nâng cấp cho một tài khoản FireAnt — mirror logic trang /account/upgrade của
 * Corporate (Upgrade.razor) và điều kiện của service_PrepareUpgradeOrder.
 */
export async function getUpgradeQuote(
  userNameOrEmail: string,
  packages?: ServicePackage[],
): Promise<UpgradeQuote> {
  const input = userNameOrEmail.trim();
  if (!input) {
    return ineligible("Chưa nhập tài khoản", "Vui lòng nhập username hoặc email đăng nhập FireAnt của khách.");
  }

  const user = await findFireAntUser(input);
  if (!user) {
    return ineligible(
      "Không tìm thấy tài khoản FireAnt",
      "Nâng cấp chỉ áp dụng cho tài khoản đã tồn tại và đang có gói hội viên. Kiểm tra lại username/email, hoặc tạo link mua gói mới.",
      true,
    );
  }
  const userName = user.userName;

  const pool = await getPool();
  const result = await pool
    .request()
    .input("UserName", sql.NVarChar(256), userName)
    .query(`
      SELECT TOP (1) ServiceID, StartDate, EndDate, CAST(ISNULL(IsTrial, 0) AS BIT) AS IsTrial
      FROM [EStocks_Data].[dbo].[service_ServiceSubscribers]
      WHERE UserName = @UserName AND ServiceID IN (33, 34, 35)
      ORDER BY EndDate DESC;

      SELECT TOP (1) 1 AS Sponsored
      FROM [EStocks_Data].[dbo].[service_SponsoredUsers]
      WHERE UserName = @UserName;

      SELECT TOP (1) o.OrderID, p.PackageID, p.ServiceID, p.Months, p.Amount, p.PackageName
      FROM [EStocks_Data].[dbo].[service_Orders] o
      INNER JOIN [EStocks_Data].[dbo].[service_Packages] p ON p.PackageID = o.PackageID
      WHERE o.UserName = @UserName
        AND o.[Status] = 1
        AND o.IsPaid = 1
        AND p.ServiceID IN (33, 34, 35)
        AND p.Months > 0
        AND p.Amount > 0
      ORDER BY o.OrderID DESC;
    `);

  const [subRows, sponsoredRows, oldRows] = result.recordsets as unknown as [
    SubscriberRow[],
    { Sponsored: number }[],
    OldPackageRow[],
  ];

  const sub = subRows[0];
  if (!sub) {
    return ineligible(
      "Khách chưa có gói hội viên đang hoạt động",
      "Nâng cấp dành cho hội viên đang dùng gói Thiết yếu hoặc Chuyên nghiệp. Hãy tạo link mua gói mới cho khách.",
      true,
    );
  }
  if (sub.IsTrial) {
    return ineligible(
      "Khách đang dùng gói thử",
      "Tài khoản dùng thử không nâng cấp tự động được. Hãy tạo link mua gói mới ở hạng khách mong muốn.",
      true,
    );
  }
  if (sub.ServiceID >= MEMBERSHIP_PREMIUM) {
    return ineligible(
      "Khách đang ở gói Cao cấp — hạng cao nhất",
      "Không còn hạng nào để nâng cấp. Bạn có thể tạo link gia hạn gói Cao cấp cho khách.",
      true,
    );
  }

  const days = calcDayLeft(sub.EndDate);
  if (days <= 0) {
    return ineligible(
      "Gói của khách đã hết hạn",
      "Nâng cấp chỉ áp dụng khi gói còn thời hạn. Hãy tạo link mua gói mới ở hạng khách mong muốn.",
      true,
    );
  }

  if (sponsoredRows.length > 0) {
    return ineligible(
      "Tài khoản thuộc diện đặc biệt",
      "Tài khoản được tài trợ / dùng thử không hỗ trợ nâng cấp tự động. Vui lòng liên hệ FireAnt để được hỗ trợ.",
    );
  }

  const oldRow = oldRows[0];
  if (!oldRow) {
    return ineligible(
      "Không tìm thấy đơn hàng gốc của gói hiện tại",
      "Gói có thể được cấp thủ công nên hệ thống không tính được giá trị còn lại. Vui lòng liên hệ FireAnt để nâng cấp.",
    );
  }

  const oldPkg: UpgradePackage = {
    packageId: oldRow.PackageID,
    serviceId: oldRow.ServiceID,
    months: oldRow.Months,
    amount: oldRow.Amount,
    packageName: oldRow.PackageName,
  };

  const allPackages = packages ?? (await listPackages());
  const targetServiceIds = [MEMBERSHIP_PRO, MEMBERSHIP_PREMIUM].filter((t) => t > sub.ServiceID);

  const tiers: UpgradeTier[] = [];
  for (const serviceId of targetServiceIds) {
    const pkgs = allPackages
      .filter(
        (p) =>
          p.serviceId === serviceId &&
          !p.isCourse &&
          isMembershipService(p.serviceId) &&
          p.months > 0 &&
          p.amount > 0,
      )
      .map(toUpgradePackage)
      .sort((a, b) => a.months - b.months);
    if (pkgs.length === 0) continue;

    const options: UpgradeOption[] = [];

    // Cách 1 — giữ nguyên hạn: đơn giá lấy theo gói cùng thời hạn với gói cũ,
    // không có thì gói dài nhất (đơn giá ngày thấp nhất — có lợi cho khách).
    const ratePkg =
      pkgs.find((p) => p.months === oldPkg.months) ??
      [...pkgs].sort((a, b) => b.months - a.months)[0];
    const keepRaw = keepEndDatePrice(oldPkg, ratePkg, days);
    if (keepRaw >= MIN_UPGRADE_AMOUNT) {
      const price = roundVnd(keepRaw);
      options.push({
        key: "keep",
        kind: "keep",
        packageId: ratePkg.packageId,
        months: ratePkg.months,
        listAmount: ratePkg.amount,
        price,
        available: true,
        endDate: resultEndDate(price, oldPkg, ratePkg, days).toISOString(),
        badge: "popular",
      });
    }

    // Cách 2 — mua trọn gói mới, trừ giá trị còn lại.
    const trades = pkgs
      .map((p) => {
        const raw = tradeInPrice(oldPkg, p, days);
        const available = raw >= MIN_UPGRADE_AMOUNT;
        return { p, available, price: roundVnd(raw) };
      })
      .sort((a, b) => Number(b.available) - Number(a.available) || a.p.months - b.p.months);

    const best = trades
      .filter((t) => t.available)
      .sort((a, b) => a.p.amount / packageDays(a.p) - b.p.amount / packageDays(b.p))[0];

    for (const t of trades) {
      options.push({
        key: `pkg:${t.p.packageId}`,
        kind: "trade",
        packageId: t.p.packageId,
        months: t.p.months,
        listAmount: t.p.amount,
        price: t.available ? t.price : 0,
        available: t.available,
        endDate: t.available ? resultEndDate(t.price, oldPkg, t.p, days).toISOString() : null,
        badge: t.available && best && best.p.packageId === t.p.packageId ? "best" : null,
      });
    }

    tiers.push({ serviceId, name: tierName(serviceId), options });
  }

  if (tiers.length === 0 || tiers.every((t) => t.options.every((o) => !o.available))) {
    return ineligible(
      "Hiện chưa có phương án nâng cấp phù hợp",
      "Giá trị còn lại của gói hiện tại cao hơn mọi gói nâng cấp đang mở bán. Vui lòng liên hệ FireAnt để được hỗ trợ.",
    );
  }

  return {
    eligible: true,
    userName,
    current: {
      serviceId: sub.ServiceID,
      name: tierName(sub.ServiceID),
      endDate: sub.EndDate.toISOString(),
      dayLeft: days,
      packageId: oldPkg.packageId,
      packageName: oldPkg.packageName,
      months: oldPkg.months,
      amount: oldPkg.amount,
    },
    amountLeft: Math.round(calcAmountLeft(oldPkg, days)),
    tiers,
  };
}

type EstimateRow = {
  Kind: string;
  PackageID: number;
  ServiceID: number;
  Months: number;
  Amount: number;
  EndDate: Date | null;
};

/**
 * Tính lại hạn mới dự kiến cho một coupon nâng cấp đã tạo (trang QR công khai):
 * số ngày còn lại được đọc lại tại thời điểm xem, giống cách SP tính khi nhận tiền.
 */
export async function estimateUpgradeEndDate(params: {
  userName: string;
  fromPackageId: number;
  packageId: number;
  amount: number;
}): Promise<{ endDate: Date | null; currentServiceId: number | null; currentEndDate: Date | null }> {
  const pool = await getPool();
  const res = await pool
    .request()
    .input("UserName", sql.NVarChar(256), params.userName)
    .input("FromPackageID", sql.Int, params.fromPackageId)
    .input("PackageID", sql.Int, params.packageId)
    .query<EstimateRow>(`
      SELECT 'sub' AS Kind, 0 AS PackageID, ServiceID, 0 AS Months, CAST(0 AS FLOAT) AS Amount, EndDate
      FROM [EStocks_Data].[dbo].[service_ServiceSubscribers]
      WHERE UserName = @UserName AND ServiceID IN (33, 34, 35)
      UNION ALL
      SELECT 'pkg', PackageID, ServiceID, Months, Amount, NULL
      FROM [EStocks_Data].[dbo].[service_Packages]
      WHERE PackageID IN (@FromPackageID, @PackageID);
    `);

  const sub = res.recordset.find((r) => r.Kind === "sub");
  const from = res.recordset.find((r) => r.Kind === "pkg" && r.PackageID === params.fromPackageId);
  const to = res.recordset.find((r) => r.Kind === "pkg" && r.PackageID === params.packageId);
  if (!sub?.EndDate || !from || !to || to.Amount <= 0) {
    return {
      endDate: null,
      currentServiceId: sub?.ServiceID ?? null,
      currentEndDate: sub?.EndDate ?? null,
    };
  }

  const days = calcDayLeft(sub.EndDate);
  const oldPkg: UpgradePackage = {
    packageId: from.PackageID,
    serviceId: from.ServiceID,
    months: from.Months,
    amount: from.Amount,
    packageName: null,
  };
  const newPkg: UpgradePackage = {
    packageId: to.PackageID,
    serviceId: to.ServiceID,
    months: to.Months,
    amount: to.Amount,
    packageName: null,
  };
  return {
    endDate: resultEndDate(params.amount, oldPkg, newPkg, days),
    currentServiceId: sub.ServiceID,
    currentEndDate: sub.EndDate,
  };
}
