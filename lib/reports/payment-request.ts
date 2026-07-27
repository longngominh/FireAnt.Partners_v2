import { readFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import { monthRange, parseMonthKey, type MonthKey } from "@/lib/utils/month";

export type PaymentRequestRow = {
  fullName: string;
  username: string;
  revenue: number;
  commission: number;
  bankAccountNumber: string;
  bankName: string;
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
const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" },
};

// A Họ tên | B Tk FireAnt | C Doanh thu | D Tổng hoa hồng | E Thanh toán
// F Số tài khoản | G Ngân hàng | H Nội dung CK
const COLUMN_WIDTHS = [28.53, 30, 27.47, 16.82, 16.29, 20.18, 21.53, 25.82, 50];
const FIRST_MONEY_COLUMN = 3;
const LAST_MONEY_COLUMN = 5;
const LAST_COLUMN = 8;

// KHÔNG đặt row.height. Excel đọc thuộc tính ht của file do exceljs sinh ra rồi
// nhân với tỉ lệ DPI của màn hình (máy 225% cho ra ~0.45 lần), làm mọi dòng bị
// bẹp. Bỏ trống ht thì Excel tự fit theo cỡ chữ và ra đúng chiều cao.

// Vị trí các khối phía dưới, đếm từ dòng "Tổng" (đúng như file mẫu).
const OFFSET_AFTER_TOTAL = {
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

function transferNote(month: MonthKey): string {
  const { year, month: monthNumber } = parseMonthKey(month);
  return `Hoa hồng CTV T${monthNumber}/${year}`;
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

export async function buildPaymentRequestWorkbook(
  input: PaymentRequestInput,
): Promise<ArrayBuffer> {
  const { month, rows, requesterName, department, city, issuedAt } = input;
  const { year, month: monthNumber } = parseMonthKey(month);
  const { start, end } = monthRange(month);
  const lastDay = new Date(end.getTime() - 1);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "FireAnt Partners";
  workbook.created = issuedAt;

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
  sheet.mergeCells("D5:H5");

  sheet.getCell("A6").value = "Bộ phận công tác";
  sheet.getCell("B6").value = department;
  sheet.mergeCells("D6:H6");

  sheet.mergeCells("A7:H7");
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
    `Doanh thu từ ${dmy(start)} đến ${dmy(lastDay)}`,
    "Tổng hoa hồng",
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
    sheetRow.getCell(5).value = { formula: `D${rowNumber}`, result: row.commission };
    // Ghi số tài khoản dạng text để không mất số 0 đứng đầu.
    sheetRow.getCell(6).value = row.bankAccountNumber;
    sheetRow.getCell(7).value = row.bankName;
    sheetRow.getCell(8).value = note;

    for (let col = 1; col <= LAST_COLUMN; col += 1) {
      const cell = sheetRow.getCell(col);
      cell.font = { name: FONT, size: 12 };
      cell.border = THIN_BORDER;
      if (col >= FIRST_MONEY_COLUMN && col <= LAST_MONEY_COLUMN) {
        cell.numFmt = MONEY_FORMAT;
        cell.alignment = { horizontal: "right" };
      } else if (col === 2 || col === 6) {
        cell.alignment = { horizontal: "left" };
      }
    }
  });

  const lastDataRow = firstDataRow + Math.max(rows.length, 1) - 1;
  const totalRowNumber = lastDataRow + 1;
  const totalRow = sheet.getRow(totalRowNumber);
  const totalRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);
  const totalCommission = rows.reduce((sum, row) => sum + row.commission, 0);

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
    result: totalCommission,
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

  const amountRow = sheet.getRow(totalRowNumber + OFFSET_AFTER_TOTAL.amountInWords);
  amountRow.getCell(1).value = "Đề nghị thanh toán số tiền";
  amountRow.getCell(1).font = { name: FONT, size: 12, bold: true };
  amountRow.getCell(4).value = { formula: `E${totalRowNumber}`, result: totalCommission };
  amountRow.getCell(4).font = { name: FONT, size: 12, bold: true };
  amountRow.getCell(4).numFmt = MONEY_FORMAT;
  amountRow.getCell(4).alignment = { horizontal: "right" };
  amountRow.getCell(5).value = "đ";
  amountRow.getCell(5).font = { name: FONT, size: 12, bold: true };

  const issuedRow = sheet.getRow(totalRowNumber + OFFSET_AFTER_TOTAL.issuedAt);
  issuedRow.getCell(7).value =
    `${city}, ngày ${String(issuedAt.getDate()).padStart(2, "0")} tháng ` +
    `${String(issuedAt.getMonth() + 1).padStart(2, "0")} năm ${issuedAt.getFullYear()}`;
  issuedRow.getCell(7).font = { name: FONT, size: 12, bold: true };
  issuedRow.getCell(7).alignment = { horizontal: "center" };

  const signatureRow = sheet.getRow(totalRowNumber + OFFSET_AFTER_TOTAL.signatureLabels);
  signatureRow.getCell(3).value = "Tổng giám đốc duyệt";
  signatureRow.getCell(3).font = { name: FONT, size: 12, bold: true };
  signatureRow.getCell(3).alignment = { horizontal: "center" };
  signatureRow.getCell(7).value = "Người đề nghị";
  signatureRow.getCell(7).font = { name: FONT, size: 12, bold: true };
  signatureRow.getCell(7).alignment = { horizontal: "center" };

  const nameRow = sheet.getRow(totalRowNumber + OFFSET_AFTER_TOTAL.requesterName);
  nameRow.getCell(7).value = requesterName;
  nameRow.getCell(7).font = { name: FONT, size: 12 };
  nameRow.getCell(7).alignment = { horizontal: "center" };

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
