import { getPool } from "@/lib/db/sql";

export const COURSE_SERVICE_ID = 39;

export const SERVICE_NAMES: Record<number, string> = {
  33: "Thiết yếu",
  34: "Chuyên nghiệp",
  35: "Cao cấp",
  [COURSE_SERVICE_ID]: "Khóa học",
};

export const SERVICE_IDS = [33, 34, 35, COURSE_SERVICE_ID] as const;

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
  isCourse: boolean;
};

type PackageRow = {
  PackageID: number;
  ServiceID: number | null;
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
      const serviceId = group?.serviceId ?? r.ServiceID ?? 33;
      return {
        packageId: r.PackageID,
        serviceId,
        serviceName: group?.serviceName ?? SERVICE_NAMES[serviceId] ?? "Thiết yếu",
        months: r.Months,
        amount: r.Amount,
        packageName: r.PackageName,
        isCourse: serviceId === COURSE_SERVICE_ID,
      };
    });
  } catch (err) {
    console.error("[listPackages]", err);
    return [];
  }
}
