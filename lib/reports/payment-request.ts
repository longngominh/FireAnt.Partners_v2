import { readFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import {
  COLLABORATOR_COMMISSION_BANDS,
  explainCommission,
  explainPerformanceBonus,
  FIXED_SALARY,
  FLAT_RATE,
  FLAT_RATE_THRESHOLD,
  hasPerformanceBonus,
  PARTNER_TYPE_LABELS,
  PARTNER_TYPES,
  PERFORMANCE_BONUSES,
  SALES_EMPLOYEE_COMMISSION_BANDS,
  type PartnerType,
} from "@/lib/commission";
import { monthRange, parseMonthKey, type MonthKey } from "@/lib/utils/month";

export type PaymentRequestOrder = {
  orderId: number;
  orderDate: Date;
  couponCode: string | null;
  customerUserName: string | null;
  packageName: string | null;
  amount: number;
};

export type PaymentRequestRow = {
  fullName: string;
  username: string;
  partnerType: PartnerType;
  revenue: number;
  commission: number;
  bonus: number;
  bankAccountNumber: string;
  bankName: string;
  /** Đơn đã thanh toán trong tháng — sheet "Bảng kê đơn hàng". */
  orders: PaymentRequestOrder[];
};

export type PaymentRequestInput = {
  month: MonthKey;
  requesterName: string;
  department: string;
  city: string;
  issuedAt: Date;
  rows: PaymentRequestRow[];
};

const FONT = "Times New Roman";
const MONEY_FORMAT = "#,##0";
const PERCENT_FORMAT = "0.0%";
const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" },
};
const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFEFEFEF" },
};

const EXPLANATION_SHEET = "Cách tính";
const ORDERS_SHEET = "Bảng kê đơn hàng";

// A Họ tên | B Tk FireAnt | C Doanh số | D Hoa hồng | E Thưởng | F Thanh toán (= D + E)
// G Số tài khoản | H Ngân hàng | I Nội dung CK
// Cột Thanh toán KHÔNG gồm lương cứng của NVKD — lương cứng trả qua bảng lương riêng,
// nên không dùng remuneration.total (cột "Tổng doanh thu" trên bảng kê).
const COLUMN_WIDTHS = [28.53, 30, 27.47, 16.82, 16.29, 18.5, 20.18, 21.53, 25.82];
const FIRST_MONEY_COLUMN = 3;
const LAST_MONEY_COLUMN = 6;
const LAST_COLUMN = 9;
// Cột đặt khối ngày lập / chữ ký "Người đề nghị" (cột Ngân hàng).
const SIGNATURE_COLUMN = 8;

// KHÔNG đặt row.height. Excel đọc thuộc tính ht của file do exceljs sinh ra rồi
// nhân với tỉ lệ DPI của màn hình (máy 225% cho ra ~0.45 lần), làm mọi dòng bị
// bẹp. Bỏ trống ht thì Excel tự fit theo cỡ chữ và ra đúng chiều cao.

// Vị trí các khối phía dưới, đếm từ dòng "Tổng" (đúng như file mẫu).
const OFFSET_AFTER_TOTAL = {
  sheetNote: 1,
  amountInWords: 3,
  issuedAt: 5,
  signatureLabels: 6,
  requesterName: 12,
};

function dmy(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${date.getFullYear()}`;
}

/** Ghi dạng chuỗi: exceljs đổi Date sang serial theo UTC nên giờ VN sẽ lệch 7 tiếng. */
function dmyHm(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${dmy(date)} ${hours}:${minutes}`;
}

const VND = new Intl.NumberFormat("vi-VN");
function money(value: number): string {
  return `${VND.format(Math.round(value))} đ`;
}

function percent(rate: number): string {
  return `${(rate * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
}

function transferNote(month: MonthKey): string {
  const { year, month: monthNumber } = parseMonthKey(month);
  return `Hoa hồng CTV T${monthNumber}/${year}`;
}

function partnerLabel(row: PaymentRequestRow): string {
  return `${row.fullName} (${row.username})`;
}

/** Trả về data URL base64 — exceljs khai báo global `Buffer extends ArrayBuffer`, đưa
 *  Buffer của Node vào addImage() sẽ không khớp kiểu. */
async function readLogo(): Promise<string | null> {
  try {
    const file = await readFile(path.join(process.cwd(), "public", "report-logo.png"));
    return `data:image/png;base64,${file.toString("base64")}`;
  } catch {
    // Thiếu logo không đáng để hỏng cả file — vẫn xuất bảng bình thường.
    return null;
  }
}

type CellStyle = {
  bold?: boolean;
  italic?: boolean;
  size?: number;
  align?: ExcelJS.Alignment["horizontal"];
  wrap?: boolean;
  numFmt?: string;
  border?: boolean;
  fill?: boolean;
};

function styleCell(cell: ExcelJS.Cell, style: CellStyle = {}): void {
  cell.font = { name: FONT, size: style.size ?? 12, bold: style.bold, italic: style.italic };
  if (style.align || style.wrap) {
    cell.alignment = { horizontal: style.align, vertical: "middle", wrapText: style.wrap };
  }
  if (style.numFmt) cell.numFmt = style.numFmt;
  if (style.border) cell.border = THIN_BORDER;
  if (style.fill) cell.fill = HEADER_FILL;
}

function writeHeaderRow(sheet: ExcelJS.Worksheet, rowNumber: number, labels: string[]): void {
  const row = sheet.getRow(rowNumber);
  labels.forEach((label, index) => {
    const cell = row.getCell(index + 1);
    cell.value = label;
    styleCell(cell, { bold: true, align: "center", wrap: true, border: true, fill: true });
  });
}

// ---------------------------------------------------------------------------
// Sheet 1 — Giấy đề nghị thanh toán
// ---------------------------------------------------------------------------

async function buildRequestSheet(
  workbook: ExcelJS.Workbook,
  input: PaymentRequestInput,
): Promise<void> {
  const { month, rows, requesterName, department, city, issuedAt } = input;
  const { year, month: monthNumber } = parseMonthKey(month);
  const { start, end } = monthRange(month);
  const lastDay = new Date(end.getTime() - 1);

  const sheet = workbook.addWorksheet(`T${monthNumber}-${year}`);
  COLUMN_WIDTHS.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });

  const logo = await readLogo();
  if (logo) {
    const imageId = workbook.addImage({ base64: logo, extension: "png" });
    sheet.addImage(imageId, {
      tl: { col: 0.15, row: 0.05 },
      ext: { width: 202, height: 51 },
      editAs: "oneCell",
    });
  }

  sheet.mergeCells("A3:I4");
  const title = sheet.getCell("A3");
  title.value = "GIẤY ĐỀ NGHỊ THANH TOÁN";
  title.font = { name: FONT, size: 19, bold: true };
  title.alignment = { horizontal: "center", vertical: "middle" };

  sheet.getCell("A5").value = "Tên tôi là";
  sheet.getCell("B5").value = requesterName;
  sheet.mergeCells("D5:I5");

  sheet.getCell("A6").value = "Bộ phận công tác";
  sheet.getCell("B6").value = department;
  sheet.mergeCells("D6:I6");

  sheet.mergeCells("A7:I7");
  sheet.getCell("A7").value = {
    richText: [
      {
        font: { name: FONT, size: 12 },
        text: `Chi tiết doanh thu và hoa hồng của CTV từ ngày ${dmy(start)} đến ${dmy(lastDay)} theo `,
      },
      { font: { name: FONT, size: 12, bold: true }, text: "partner.fireant.vn" },
      { font: { name: FONT, size: 12 }, text: " như sau:" },
    ],
  };
  for (const address of ["A5", "B5", "A6", "B6"]) {
    sheet.getCell(address).font = { name: FONT, size: 12 };
  }

  const headerRowNumber = 9;
  const headerRow = sheet.getRow(headerRowNumber);
  headerRow.values = [
    "Họ tên",
    "Tk FireAnt",
    `Doanh số từ ${dmy(start)} đến ${dmy(lastDay)}`,
    "Hoa hồng",
    "Thưởng",
    "Thanh toán",
    "Số tài khoản",
    "Ngân hàng",
    "Nội dung CK",
  ];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    if (colNumber > LAST_COLUMN) return;
    cell.font = { name: FONT, size: 12, bold: true };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = THIN_BORDER;
  });

  const firstDataRow = headerRowNumber + 1;
  const note = transferNote(month);

  rows.forEach((row, index) => {
    const rowNumber = firstDataRow + index;
    const sheetRow = sheet.getRow(rowNumber);
    sheetRow.getCell(1).value = row.fullName;
    sheetRow.getCell(2).value = row.username;
    sheetRow.getCell(3).value = row.revenue;
    sheetRow.getCell(4).value = row.commission;
    sheetRow.getCell(5).value = row.bonus;
    sheetRow.getCell(6).value = {
      formula: `D${rowNumber}+E${rowNumber}`,
      result: row.commission + row.bonus,
    };
    // Ghi số tài khoản dạng text để không mất số 0 đứng đầu.
    sheetRow.getCell(7).value = row.bankAccountNumber;
    sheetRow.getCell(8).value = row.bankName;
    sheetRow.getCell(9).value = note;

    for (let col = 1; col <= LAST_COLUMN; col += 1) {
      const cell = sheetRow.getCell(col);
      cell.font = { name: FONT, size: 12 };
      cell.border = THIN_BORDER;
      if (col >= FIRST_MONEY_COLUMN && col <= LAST_MONEY_COLUMN) {
        cell.numFmt = MONEY_FORMAT;
        cell.alignment = { horizontal: "right" };
      } else if (col === 2 || col === 7) {
        cell.alignment = { horizontal: "left" };
      }
    }
  });

  const lastDataRow = firstDataRow + Math.max(rows.length, 1) - 1;
  const totalRowNumber = lastDataRow + 1;
  const totalRow = sheet.getRow(totalRowNumber);
  const totalRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);
  const totalCommission = rows.reduce((sum, row) => sum + row.commission, 0);
  const totalBonus = rows.reduce((sum, row) => sum + row.bonus, 0);
  const totalPayable = totalCommission + totalBonus;

  totalRow.getCell(1).value = "Tổng";
  totalRow.getCell(3).value = {
    formula: `SUM(C${firstDataRow}:C${lastDataRow})`,
    result: totalRevenue,
  };
  totalRow.getCell(4).value = {
    formula: `SUM(D${firstDataRow}:D${lastDataRow})`,
    result: totalCommission,
  };
  totalRow.getCell(5).value = {
    formula: `SUM(E${firstDataRow}:E${lastDataRow})`,
    result: totalBonus,
  };
  totalRow.getCell(6).value = {
    formula: `SUM(F${firstDataRow}:F${lastDataRow})`,
    result: totalPayable,
  };
  for (let col = 1; col <= LAST_COLUMN; col += 1) {
    const cell = totalRow.getCell(col);
    cell.font = { name: FONT, size: 12, bold: true };
    cell.border = THIN_BORDER;
    if (col === 1) cell.alignment = { horizontal: "center" };
    if (col >= FIRST_MONEY_COLUMN && col <= LAST_MONEY_COLUMN) {
      cell.numFmt = MONEY_FORMAT;
      cell.alignment = { horizontal: "right" };
    }
  }

  const noteRow = sheet.getRow(totalRowNumber + OFFSET_AFTER_TOTAL.sheetNote);
  sheet.mergeCells(noteRow.number, 1, noteRow.number, LAST_COLUMN);
  noteRow.getCell(1).value =
    `Cách tính hoa hồng, thưởng theo bậc của từng CTV xem sheet "${EXPLANATION_SHEET}"; ` +
    `chi tiết đơn hàng đã thanh toán xem sheet "${ORDERS_SHEET}".`;
  styleCell(noteRow.getCell(1), { italic: true, size: 11 });

  const amountRow = sheet.getRow(totalRowNumber + OFFSET_AFTER_TOTAL.amountInWords);
  amountRow.getCell(1).value = "Đề nghị thanh toán số tiền";
  amountRow.getCell(1).font = { name: FONT, size: 12, bold: true };
  amountRow.getCell(6).value = { formula: `F${totalRowNumber}`, result: totalPayable };
  amountRow.getCell(6).font = { name: FONT, size: 12, bold: true };
  amountRow.getCell(6).numFmt = MONEY_FORMAT;
  amountRow.getCell(6).alignment = { horizontal: "right" };
  amountRow.getCell(7).value = "đ";
  amountRow.getCell(7).font = { name: FONT, size: 12, bold: true };

  const issuedRow = sheet.getRow(totalRowNumber + OFFSET_AFTER_TOTAL.issuedAt);
  const issuedCell = issuedRow.getCell(SIGNATURE_COLUMN);
  issuedCell.value =
    `${city}, ngày ${String(issuedAt.getDate()).padStart(2, "0")} tháng ` +
    `${String(issuedAt.getMonth() + 1).padStart(2, "0")} năm ${issuedAt.getFullYear()}`;
  issuedCell.font = { name: FONT, size: 12, bold: true };
  issuedCell.alignment = { horizontal: "center" };

  const signatureRow = sheet.getRow(totalRowNumber + OFFSET_AFTER_TOTAL.signatureLabels);
  signatureRow.getCell(3).value = "Tổng giám đốc duyệt";
  signatureRow.getCell(3).font = { name: FONT, size: 12, bold: true };
  signatureRow.getCell(3).alignment = { horizontal: "center" };
  signatureRow.getCell(SIGNATURE_COLUMN).value = "Người đề nghị";
  signatureRow.getCell(SIGNATURE_COLUMN).font = { name: FONT, size: 12, bold: true };
  signatureRow.getCell(SIGNATURE_COLUMN).alignment = { horizontal: "center" };

  const nameRow = sheet.getRow(totalRowNumber + OFFSET_AFTER_TOTAL.requesterName);
  nameRow.getCell(SIGNATURE_COLUMN).value = requesterName;
  nameRow.getCell(SIGNATURE_COLUMN).font = { name: FONT, size: 12 };
  nameRow.getCell(SIGNATURE_COLUMN).alignment = { horizontal: "center" };
}

// ---------------------------------------------------------------------------
// Sheet 2 — Giải thích cách tính hoa hồng & thưởng theo bậc
// ---------------------------------------------------------------------------

// A Bậc | B Từ | C Đến | D Tỷ lệ | E Doanh số trong bậc | F Hoa hồng
const EXPLANATION_WIDTHS = [30, 18, 18, 10, 22, 18];
const EXPLANATION_LAST_COLUMN = 6;

function bandUpperLabel(to: number): string | number {
  return Number.isFinite(to) ? to : "trở lên";
}

function buildExplanationSheet(workbook: ExcelJS.Workbook, input: PaymentRequestInput): void {
  const { month, rows } = input;
  const { year, month: monthNumber } = parseMonthKey(month);
  const sheet = workbook.addWorksheet(EXPLANATION_SHEET);
  EXPLANATION_WIDTHS.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });

  let rowNumber = 1;
  const mergeAcross = (r: number) => sheet.mergeCells(r, 1, r, EXPLANATION_LAST_COLUMN);

  mergeAcross(rowNumber);
  sheet.getCell(rowNumber, 1).value =
    `CÁCH TÍNH HOA HỒNG & THƯỞNG THEO BẬC — THÁNG ${monthNumber}/${year}`;
  styleCell(sheet.getCell(rowNumber, 1), { bold: true, size: 14, align: "center" });
  rowNumber += 2;

  const principles = [
    "1. Hoa hồng tính lũy tiến từng phần: doanh số tháng được chia vào các bậc, phần " +
      "doanh số nằm trong mỗi bậc nhân với tỷ lệ của bậc đó rồi cộng lại. Doanh số " +
      "tích lũy reset về 0 vào đầu mỗi tháng.",
    "2. Không có khoản thưởng bán tốt riêng: mức thưởng đã gộp vào tỷ lệ của các bậc " +
      `cao (${PARTNER_TYPE_LABELS.sales_employee.toLowerCase()} từ bậc ${money(90_000_000)}, ` +
      `${PARTNER_TYPE_LABELS.collaborator.toLowerCase()} từ bậc ${money(130_000_000)}). ` +
      "Bảng bậc ở cuối sheet.",
    `3. Doanh số từ ${money(FLAT_RATE_THRESHOLD)} trở lên: không chia bậc, tổng thu nhập ` +
      `tháng = ${percent(FLAT_RATE)} doanh số. ${PARTNER_TYPE_LABELS.collaborator}: toàn bộ là ` +
      `hoa hồng. ${PARTNER_TYPE_LABELS.sales_employee}: hoa hồng = ${percent(FLAT_RATE)} doanh số ` +
      `− lương cứng ${money(FIXED_SALARY.sales_employee)}.`,
    `4. Lương cứng ${money(FIXED_SALARY.sales_employee)} của ` +
      `${PARTNER_TYPE_LABELS.sales_employee.toLowerCase()} trả qua bảng lương, không nằm ` +
      "trong giấy đề nghị này. Số thanh toán = Hoa hồng + Thưởng (nếu có).",
  ];
  for (const text of principles) {
    mergeAcross(rowNumber);
    sheet.getCell(rowNumber, 1).value = text;
    styleCell(sheet.getCell(rowNumber, 1), { wrap: true, align: "left" });
    // Dòng dài phải đặt height vì Excel không tự fit ô đã merge.
    sheet.getRow(rowNumber).height = 34;
    rowNumber += 1;
  }
  rowNumber += 1;

  rows.forEach((row, index) => {
    mergeAcross(rowNumber);
    sheet.getCell(rowNumber, 1).value =
      `${index + 1}. ${partnerLabel(row)} — ${PARTNER_TYPE_LABELS[row.partnerType]} — ` +
      `Doanh số tháng: ${money(row.revenue)}`;
    styleCell(sheet.getCell(rowNumber, 1), { bold: true, align: "left", fill: true });
    rowNumber += 1;

    writeHeaderRow(sheet, rowNumber, [
      "Bậc doanh số",
      "Từ",
      "Đến",
      "Tỷ lệ",
      "Doanh số trong bậc",
      "Hoa hồng",
    ]);
    rowNumber += 1;

    const hasBonus = hasPerformanceBonus(row.partnerType);
    const writeBandRow = (
      label: string,
      from: number,
      to: number,
      rate: number,
      amount: number,
      commission: number,
    ) => {
      const r = sheet.getRow(rowNumber);
      r.getCell(1).value = label;
      r.getCell(2).value = from;
      r.getCell(3).value = bandUpperLabel(to);
      r.getCell(4).value = rate;
      r.getCell(5).value = amount;
      r.getCell(6).value = commission;
      styleCell(r.getCell(1), { border: true });
      styleCell(r.getCell(2), { border: true, numFmt: MONEY_FORMAT, align: "right" });
      styleCell(r.getCell(3), { border: true, numFmt: MONEY_FORMAT, align: "right" });
      styleCell(r.getCell(4), { border: true, numFmt: PERCENT_FORMAT, align: "right" });
      styleCell(r.getCell(5), { border: true, numFmt: MONEY_FORMAT, align: "right" });
      styleCell(r.getCell(6), { border: true, numFmt: MONEY_FORMAT, align: "right" });
      rowNumber += 1;
    };

    const firstBandRow = rowNumber;
    if (row.revenue >= FLAT_RATE_THRESHOLD && !hasBonus) {
      // Đạt ngưỡng: không chia bậc, toàn bộ doanh số hưởng 18%; NVKD trừ lương cứng
      // (trả qua bảng lương) để ra hoa hồng thực nhận.
      const flatTotal = Math.floor(row.revenue * FLAT_RATE);
      writeBandRow(
        `Từ ${money(FLAT_RATE_THRESHOLD)} trở lên`,
        0,
        Infinity,
        FLAT_RATE,
        row.revenue,
        flatTotal,
      );
      const baseSalary = FIXED_SALARY[row.partnerType];
      if (baseSalary > 0) {
        const r = sheet.getRow(rowNumber);
        sheet.mergeCells(rowNumber, 1, rowNumber, 5);
        r.getCell(1).value = "Trừ lương cứng (đã trả qua bảng lương)";
        r.getCell(6).value = row.commission - flatTotal;
        styleCell(r.getCell(1), { border: true, align: "left" });
        styleCell(r.getCell(6), { border: true, numFmt: MONEY_FORMAT, align: "right" });
        rowNumber += 1;
      }
    } else {
      const parts = explainCommission(row.revenue, row.partnerType);
      // Bậc cuối lấy phần dư để tổng các bậc khớp tuyệt đối với hoa hồng đã tính.
      let allocated = 0;
      parts.forEach((part, partIndex) => {
        const isLast = partIndex === parts.length - 1;
        const commission = isLast ? row.commission - allocated : Math.floor(part.commission);
        allocated += commission;
        writeBandRow(`Bậc ${partIndex + 1}`, part.from, part.to, part.rate, part.amount, commission);
      });
    }
    const lastBandRow = rowNumber - 1;
    const hasBandRows = lastBandRow >= firstBandRow;

    const commissionRow = sheet.getRow(rowNumber);
    sheet.mergeCells(rowNumber, 1, rowNumber, 4);
    commissionRow.getCell(1).value = "Tổng hoa hồng";
    commissionRow.getCell(5).value = hasBandRows
      ? { formula: `SUM(E${firstBandRow}:E${lastBandRow})`, result: row.revenue }
      : row.revenue;
    commissionRow.getCell(6).value = hasBandRows
      ? { formula: `SUM(F${firstBandRow}:F${lastBandRow})`, result: row.commission }
      : row.commission;
    for (let col = 1; col <= EXPLANATION_LAST_COLUMN; col += 1) {
      styleCell(commissionRow.getCell(col), {
        bold: true,
        border: true,
        numFmt: col >= 5 ? MONEY_FORMAT : undefined,
        align: col >= 5 ? "right" : "left",
      });
    }
    const commissionRowNumber = rowNumber;
    rowNumber += 1;

    let bonusRowNumber: number | null = null;
    if (hasBonus) {
      bonusRowNumber = rowNumber;
      const bonusRow = sheet.getRow(rowNumber);
      sheet.mergeCells(rowNumber, 1, rowNumber, 5);
      bonusRow.getCell(1).value = `Thưởng: ${describeBonus(row)}`;
      bonusRow.getCell(6).value = row.bonus;
      styleCell(bonusRow.getCell(1), { border: true, wrap: true, align: "left" });
      styleCell(bonusRow.getCell(6), { bold: true, border: true, numFmt: MONEY_FORMAT, align: "right" });
      rowNumber += 1;
    }

    const payRow = sheet.getRow(rowNumber);
    sheet.mergeCells(rowNumber, 1, rowNumber, 5);
    payRow.getCell(1).value = hasBonus
      ? "Thanh toán = Hoa hồng + Thưởng"
      : "Thanh toán = Hoa hồng (đã gồm thưởng trong tỷ lệ bậc)";
    payRow.getCell(6).value = {
      formula:
        bonusRowNumber !== null
          ? `F${commissionRowNumber}+F${bonusRowNumber}`
          : `F${commissionRowNumber}`,
      result: row.commission + row.bonus,
    };
    styleCell(payRow.getCell(1), { bold: true, border: true, align: "left", fill: true });
    styleCell(payRow.getCell(6), { bold: true, border: true, numFmt: MONEY_FORMAT, align: "right", fill: true });
    rowNumber += 2;
  });

  // Bảng bậc tham chiếu.
  mergeAcross(rowNumber);
  sheet.getCell(rowNumber, 1).value = "BẢNG BẬC HOA HỒNG (áp dụng lũy tiến từng phần)";
  styleCell(sheet.getCell(rowNumber, 1), { bold: true, align: "left" });
  rowNumber += 1;
  writeHeaderRow(sheet, rowNumber, [
    "Bậc",
    "Từ",
    "Đến",
    `Tỷ lệ ${PARTNER_TYPE_LABELS.collaborator}`,
    `Tỷ lệ ${PARTNER_TYPE_LABELS.sales_employee}`,
  ]);
  rowNumber += 1;
  const writeRateRow = (
    label: string,
    from: number,
    to: number,
    collaboratorRate: number,
    salesRate: number,
  ) => {
    const r = sheet.getRow(rowNumber);
    r.getCell(1).value = label;
    r.getCell(2).value = from;
    r.getCell(3).value = bandUpperLabel(to);
    r.getCell(4).value = collaboratorRate;
    r.getCell(5).value = salesRate;
    styleCell(r.getCell(1), { border: true });
    styleCell(r.getCell(2), { border: true, numFmt: MONEY_FORMAT, align: "right" });
    styleCell(r.getCell(3), { border: true, numFmt: MONEY_FORMAT, align: "right" });
    styleCell(r.getCell(4), { border: true, numFmt: PERCENT_FORMAT, align: "right" });
    styleCell(r.getCell(5), { border: true, numFmt: PERCENT_FORMAT, align: "right" });
    rowNumber += 1;
  };
  COLLABORATOR_COMMISSION_BANDS.forEach((band, index) => {
    // Bậc cuối để mở trong engine, nhưng từ 250tr trở lên áp quy tắc 18% nên
    // bảng tham chiếu cắt bậc tại ngưỡng đó và thêm dòng riêng bên dưới.
    writeRateRow(
      `Bậc ${index + 1}`,
      band.from,
      Math.min(band.to, FLAT_RATE_THRESHOLD),
      band.rate,
      SALES_EMPLOYEE_COMMISSION_BANDS[index]?.rate ?? 0,
    );
  });
  writeRateRow(
    `Từ ${money(FLAT_RATE_THRESHOLD)} trở lên (*)`,
    FLAT_RATE_THRESHOLD,
    Infinity,
    FLAT_RATE,
    FLAT_RATE,
  );
  mergeAcross(rowNumber);
  sheet.getCell(rowNumber, 1).value =
    `(*) Không chia bậc: tổng thu nhập tháng = ${percent(FLAT_RATE)} toàn bộ doanh số ` +
    `(${PARTNER_TYPE_LABELS.sales_employee.toLowerCase()}: hoa hồng = ${percent(FLAT_RATE)} ` +
    `doanh số − lương cứng ${money(FIXED_SALARY.sales_employee)}).`;
  styleCell(sheet.getCell(rowNumber, 1), { italic: true, size: 11, align: "left" });
  rowNumber += 2;

  const bonusTypes = PARTNER_TYPES.filter(hasPerformanceBonus);
  if (bonusTypes.length > 0) {
    mergeAcross(rowNumber);
    sheet.getCell(rowNumber, 1).value =
      `MỐC THƯỞNG BÁN TỐT (theo doanh số tháng đạt được — chỉ áp dụng cho ` +
      `${bonusTypes.map((type) => PARTNER_TYPE_LABELS[type].toLowerCase()).join(", ")})`;
    styleCell(sheet.getCell(rowNumber, 1), { bold: true, align: "left" });
    rowNumber += 1;
    writeHeaderRow(sheet, rowNumber, [
      "Doanh số tháng đạt từ",
      ...bonusTypes.map((type) => `Thưởng ${PARTNER_TYPE_LABELS[type]}`),
    ]);
    rowNumber += 1;
    const thresholds = [
      ...new Set(bonusTypes.flatMap((type) => PERFORMANCE_BONUSES[type].map((t) => t.revenue))),
    ].sort((a, b) => a - b);
    for (const threshold of thresholds) {
      const r = sheet.getRow(rowNumber);
      r.getCell(1).value = threshold;
      bonusTypes.forEach((type, index) => {
        r.getCell(index + 2).value =
          PERFORMANCE_BONUSES[type].find((tier) => tier.revenue === threshold)?.bonus ?? 0;
      });
      for (let col = 1; col <= bonusTypes.length + 1; col += 1) {
        styleCell(r.getCell(col), { border: true, numFmt: MONEY_FORMAT, align: "right" });
      }
      rowNumber += 1;
    }
  }
}

function describeBonus(row: PaymentRequestRow): string {
  const { revenue, partnerType, commission, bonus } = row;
  if (revenue >= FLAT_RATE_THRESHOLD) {
    const total = Math.floor(revenue * FLAT_RATE);
    const salaryNote =
      FIXED_SALARY[partnerType] > 0 ? ` − lương cứng ${money(FIXED_SALARY[partnerType])}` : "";
    return (
      `doanh số ${money(revenue)} đạt ${money(FLAT_RATE_THRESHOLD)} nên tổng thu nhập = ` +
      `${percent(FLAT_RATE)} × doanh số = ${money(total)}; thưởng = ${money(total)} − hoa hồng ` +
      `${money(commission)}${salaryNote} = ${money(bonus)}.`
    );
  }
  const { reached, next } = explainPerformanceBonus(revenue, partnerType);
  if (reached) {
    const nextNote = next
      ? ` Mốc kế tiếp: ${money(next.revenue)} → thưởng ${money(next.bonus)}.`
      : "";
    return (
      `doanh số ${money(revenue)} đạt mốc ${money(reached.revenue)} → thưởng ` +
      `${money(reached.bonus)}.${nextNote}`
    );
  }
  return next
    ? `doanh số ${money(revenue)} chưa đạt mốc thưởng thấp nhất ${money(next.revenue)} ` +
        `(thưởng ${money(next.bonus)}).`
    : "không có mốc thưởng áp dụng.";
}

// ---------------------------------------------------------------------------
// Sheet 3 — Bảng kê đơn hàng đã thanh toán
// ---------------------------------------------------------------------------

// A STT | B Cộng tác viên | C Tk FireAnt | D Mã đơn | E Ngày thanh toán | F Khách hàng
// G Gói | H Mã coupon | I Doanh thu
const ORDER_WIDTHS = [6, 28, 22, 12, 18, 24, 30, 22, 16];
const ORDER_LAST_COLUMN = 9;
const ORDER_MONEY_COLUMN = 9;
const ORDER_LABEL_SPAN = ORDER_MONEY_COLUMN - 1;

function buildOrdersSheet(workbook: ExcelJS.Workbook, input: PaymentRequestInput): void {
  const { month, rows } = input;
  const { start, end } = monthRange(month);
  const lastDay = new Date(end.getTime() - 1);
  const sheet = workbook.addWorksheet(ORDERS_SHEET);
  ORDER_WIDTHS.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });

  sheet.mergeCells(1, 1, 1, ORDER_LAST_COLUMN);
  sheet.getCell(1, 1).value =
    `BẢNG KÊ ĐƠN HÀNG ĐÃ THANH TOÁN TỪ ${dmy(start)} ĐẾN ${dmy(lastDay)}`;
  styleCell(sheet.getCell(1, 1), { bold: true, size: 14, align: "center" });

  sheet.mergeCells(2, 1, 2, ORDER_LAST_COLUMN);
  sheet.getCell(2, 1).value =
    "Mỗi coupon tính một đơn đã thanh toán mới nhất, quy về tháng theo ngày thanh toán. " +
    "Doanh thu là số thực thu của đơn (đơn nâng cấp chỉ tính phần chênh lệch khách đã trả).";
  styleCell(sheet.getCell(2, 1), { italic: true, size: 11, wrap: true, align: "left" });
  sheet.getRow(2).height = 30;

  const headerRowNumber = 4;
  writeHeaderRow(sheet, headerRowNumber, [
    "STT",
    "Cộng tác viên",
    "Tk FireAnt",
    "Mã đơn",
    "Ngày thanh toán",
    "Khách hàng",
    "Gói",
    "Mã coupon",
    "Doanh thu",
  ]);
  sheet.views = [{ state: "frozen", ySplit: headerRowNumber }];

  let rowNumber = headerRowNumber + 1;
  const subtotalRows: number[] = [];

  rows.forEach((row, index) => {
    const groupRow = sheet.getRow(rowNumber);
    sheet.mergeCells(rowNumber, 1, rowNumber, ORDER_LAST_COLUMN);
    groupRow.getCell(1).value =
      `${index + 1}. ${partnerLabel(row)} — ${row.orders.length} đơn`;
    styleCell(groupRow.getCell(1), { bold: true, align: "left", fill: true, border: true });
    rowNumber += 1;

    const firstOrderRow = rowNumber;
    row.orders.forEach((order, orderIndex) => {
      const r = sheet.getRow(rowNumber);
      r.getCell(1).value = orderIndex + 1;
      r.getCell(2).value = row.fullName;
      r.getCell(3).value = row.username;
      r.getCell(4).value = order.orderId;
      r.getCell(5).value = dmyHm(order.orderDate);
      r.getCell(6).value = order.customerUserName ?? "";
      r.getCell(7).value = order.packageName ?? "";
      r.getCell(8).value = order.couponCode ?? "";
      r.getCell(ORDER_MONEY_COLUMN).value = order.amount;
      for (let col = 1; col <= ORDER_LAST_COLUMN; col += 1) {
        const isMoney = col === ORDER_MONEY_COLUMN;
        styleCell(r.getCell(col), {
          border: true,
          numFmt: isMoney ? MONEY_FORMAT : undefined,
          align: isMoney ? "right" : col === 1 || col === 4 || col === 5 ? "center" : "left",
        });
      }
      rowNumber += 1;
    });
    const lastOrderRow = rowNumber - 1;

    const subtotal = sheet.getRow(rowNumber);
    sheet.mergeCells(rowNumber, 1, rowNumber, ORDER_LABEL_SPAN);
    subtotal.getCell(1).value = `Cộng ${row.fullName}`;
    const orderRevenue = row.orders.reduce((sum, order) => sum + order.amount, 0);
    subtotal.getCell(ORDER_MONEY_COLUMN).value =
      row.orders.length > 0
        ? { formula: `SUM(I${firstOrderRow}:I${lastOrderRow})`, result: orderRevenue }
        : 0;
    for (let col = 1; col <= ORDER_LAST_COLUMN; col += 1) {
      const isMoney = col === ORDER_MONEY_COLUMN;
      styleCell(subtotal.getCell(col), {
        bold: true,
        border: true,
        numFmt: isMoney ? MONEY_FORMAT : undefined,
        align: isMoney ? "right" : "left",
      });
    }
    subtotalRows.push(rowNumber);
    rowNumber += 1;

    // Cảnh báo khi bảng kê đơn không khớp doanh số trên giấy đề nghị.
    if (orderRevenue !== row.revenue) {
      sheet.mergeCells(rowNumber, 1, rowNumber, ORDER_LAST_COLUMN);
      sheet.getCell(rowNumber, 1).value =
        `Lưu ý: tổng đơn ${money(orderRevenue)} khác doanh số trên giấy đề nghị ` +
        `${money(row.revenue)}.`;
      styleCell(sheet.getCell(rowNumber, 1), { italic: true, size: 11, align: "left" });
      rowNumber += 1;
    }
    rowNumber += 1;
  });

  const grand = sheet.getRow(rowNumber);
  sheet.mergeCells(rowNumber, 1, rowNumber, ORDER_LABEL_SPAN);
  grand.getCell(1).value = `TỔNG CỘNG — ${rows.reduce((sum, row) => sum + row.orders.length, 0)} đơn`;
  grand.getCell(ORDER_MONEY_COLUMN).value = {
    formula: subtotalRows.length > 0 ? subtotalRows.map((r) => `I${r}`).join("+") : "0",
    result: rows.reduce((sum, row) => sum + row.orders.reduce((s, order) => s + order.amount, 0), 0),
  };
  for (let col = 1; col <= ORDER_LAST_COLUMN; col += 1) {
    const isMoney = col === ORDER_MONEY_COLUMN;
    styleCell(grand.getCell(col), {
      bold: true,
      border: true,
      fill: true,
      numFmt: isMoney ? MONEY_FORMAT : undefined,
      align: isMoney ? "right" : "left",
    });
  }
}

// ---------------------------------------------------------------------------

export async function buildPaymentRequestWorkbook(
  input: PaymentRequestInput,
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "FireAnt Partners";
  workbook.created = input.issuedAt;

  await buildRequestSheet(workbook, input);
  buildExplanationSheet(workbook, input);
  buildOrdersSheet(workbook, input);

  // writeBuffer() trả Node Buffer (view trên pool chung) — copy sang ArrayBuffer
  // riêng để dùng trực tiếp làm body của Response.
  const written = (await workbook.xlsx.writeBuffer()) as unknown as Uint8Array;
  const bytes = new Uint8Array(written.byteLength);
  bytes.set(written);
  return bytes.buffer;
}

export function paymentRequestFilename(month: MonthKey): string {
  const { start, end } = monthRange(month);
  const lastDay = new Date(end.getTime() - 1);
  return `De nghi TT CTV ${dmy(start)} - ${dmy(lastDay)}.xlsx`.replace(/\//g, ".");
}
