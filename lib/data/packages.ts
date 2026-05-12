import { getPool } from "@/lib/db/sql";

export const SERVICE_NAMES: Record<number, string> = {
  33: "Thiết yếu",
  34: "Chuyên nghiệp",
  35: "Cao cấp",
};

export const SERVICE_IDS = [33, 34, 35] as const;

const PACKAGE_SERVICE_MAP: Record<number, { serviceId: number; serviceName: string }> = {
  55: { serviceId: 33, serviceName: "Thiết yếu" },
  43: { serviceId: 33, serviceName: "Thiết yếu" },
  44: { serviceId: 33, serviceName: "Thiết yếu" },
  45: { serviceId: 33, serviceName: "Thiết yếu" },
  95: { serviceId: 34, serviceName: "Chuyên nghiệp" },
  96: { serviceId: 34, serviceName: "Chuyên nghiệp" },
  97: { serviceId: 34, serviceName: "Chuyên nghiệp" },
  98: { serviceId: 34, serviceName: "Chuyên nghiệp" },
  57: { serviceId: 35, serviceName: "Cao cấp" },
  49: { serviceId: 35, serviceName: "Cao cấp" },
  50: { serviceId: 35, serviceName: "Cao cấp" },
  51: { serviceId: 35, serviceName: "Cao cấp" },
};

export type ServicePackage = {
  packageId: number;
  serviceId: number;
  serviceName: string;
  months: number;
  amount: number;
  packageName: string | null;
};

type PackageRow = {
  PackageID: number;
  Months: number;
  Amount: number;
  PackageName: string | null;
};

export async function listPackages(): Promise<ServicePackage[]> {
  try {
    const pool = await getPool();
    const res = await pool.request().execute<PackageRow>("usp_ListPackages");
    return res.recordset.map((r) => {
      const group = PACKAGE_SERVICE_MAP[r.PackageID];
      return {
        packageId: r.PackageID,
        serviceId: group?.serviceId ?? 33,
        serviceName: group?.serviceName ?? "Thiết yếu",
        months: r.Months,
        amount: r.Amount,
        packageName: r.PackageName,
      };
    });
  } catch (err) {
    console.error("[listPackages]", err);
    return [];
  }
}
