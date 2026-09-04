/**
 * Công thức báo giá nâng cấp gói hội viên.
 *
 * PHẢI khớp từng phép tính với stored procedure [EStocks_Data].[dbo].[service_Upgrade]
 * (và bản port C# FireAnt.Corporate/Components/Pages/Account/UpgradeMath.cs), vì số tiền
 * báo cho khách sẽ được ghi vào service_Orders.UpgradeAmount và SP quy đổi lại thành
 * số ngày sử dụng khi webhook OnePay báo có tiền:
 *   PackageDay  = Months * 92 / 3                       (chia NGUYÊN)
 *   AmountLeft  = OldAmount * DayLeft / OldPackageDay
 *   NewDayLeft  = (tiền trả + AmountLeft) * NewPackageDay / NewAmount   (cắt INT)
 *   EndDate mới = GETDATE() + NewDayLeft ngày
 */

export type UpgradePackage = {
  packageId: number;
  serviceId: number;
  months: number;
  amount: number;
  packageName: string | null;
};

/** service_Upgrade: @PackageDay INT = Months*92/3 — SQL chia nguyên (gói 1 tháng = 30 ngày). */
export function packageDays(pkg: Pick<UpgradePackage, "months">): number {
  return Math.trunc((pkg.months * 92) / 3);
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Số ngày còn lại — SP dùng DATEDIFF(DAY, GETDATE(), EndDate), chặn dưới 0. */
export function dayLeft(endDate: Date, now: Date = new Date()): number {
  const ms = startOfDay(endDate).getTime() - startOfDay(now).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

/** Giá trị còn lại của gói hiện tại quy đổi ra tiền. */
export function amountLeft(oldPkg: UpgradePackage, days: number): number {
  return (oldPkg.amount * days) / packageDays(oldPkg);
}

/**
 * Cách 1 — GIỮ NGUYÊN HẠN: trả phần chênh đơn giá ngày cho số ngày còn lại.
 * X thỏa mãn (X + AmountLeft) * NewPackageDay / NewAmount = DayLeft.
 */
export function keepEndDatePrice(
  oldPkg: UpgradePackage,
  ratePkg: UpgradePackage,
  days: number,
): number {
  return (ratePkg.amount * days) / packageDays(ratePkg) - amountLeft(oldPkg, days);
}

/** Cách 2 — MUA GÓI MỚI TRỪ GIÁ TRỊ CÒN LẠI: X = giá gói mới − AmountLeft. */
export function tradeInPrice(oldPkg: UpgradePackage, newPkg: UpgradePackage, days: number): number {
  return newPkg.amount - amountLeft(oldPkg, days);
}

/** Làm tròn LÊN bội 1.000đ — số tiền chuyển khoản phải chẵn, phần dư quy thành ngày cho khách. */
export function roundVnd(amount: number): number {
  return Math.ceil(amount / 1000) * 1000;
}

/** Số ngày gói mới mà SP sẽ cấp cho số tiền đã trả (cắt INT như SQL). */
export function resultDays(
  paidAmount: number,
  oldPkg: UpgradePackage,
  newPkg: UpgradePackage,
  days: number,
): number {
  return Math.trunc(((paidAmount + amountLeft(oldPkg, days)) * packageDays(newPkg)) / newPkg.amount);
}

/** Hạn sử dụng mới dự kiến nếu thanh toán hôm nay. */
export function resultEndDate(
  paidAmount: number,
  oldPkg: UpgradePackage,
  newPkg: UpgradePackage,
  days: number,
  now: Date = new Date(),
): Date {
  const d = startOfDay(now);
  d.setDate(d.getDate() + resultDays(paidAmount, oldPkg, newPkg, days));
  return d;
}

/** Ngưỡng tối thiểu để một phương án được coi là mua được (mirror Upgrade.razor: raw >= 1000). */
export const MIN_UPGRADE_AMOUNT = 1000;
