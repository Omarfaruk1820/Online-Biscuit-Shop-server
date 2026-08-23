// utils/pdf/productTable.js

const COLORS = {
  header: "#1E40AF",
  dark: "#111827",
  text: "#374151",
  muted: "#64748B",
  border: "#E5E7EB",
  zebra: "#F8FAFC",
  white: "#FFFFFF",
};

const TABLE = {
  x: 40,
  width: 515,

  sku: 50,
  product: 115,
  qty: 305,
  unit: 345,
  discount: 405,
  final: 455,
  total: 500,
};

const HEADER_HEIGHT = 28;
const ROW_MIN_HEIGHT = 48;

const PAGE = {
  top: 50,
  bottom: 720,
};

const safeText = (value, fallback = "-") => {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();

  return text || fallback;
};

const safeNumber = (value, fallback = 0) => {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
};

const formatMoney = (currency, value) => {
  return `${currency} ${safeNumber(value).toFixed(2)}`;
};

const calculateRowHeight = (doc, item) => {
  const productName = safeText(item?.name, "Unknown Product");

  const sku = safeText(item?.sku);

  doc.font("Helvetica-Bold").fontSize(9);

  const productHeight = doc.heightOfString(productName, {
    width: 180,
    lineGap: 1,
  });

  doc.font("Helvetica").fontSize(8);

  const skuHeight = doc.heightOfString(sku, {
    width: 55,
    lineGap: 1,
  });

  return Math.max(ROW_MIN_HEIGHT, productHeight, skuHeight) + 16;
};

const drawTableHeader = (doc, y) => {
  doc
    .roundedRect(TABLE.x, y, TABLE.width, HEADER_HEIGHT, 4)
    .fill(COLORS.header);

  doc.fillColor(COLORS.white).font("Helvetica-Bold").fontSize(8);

  doc.text("SKU", TABLE.sku, y + 9, {
    width: 55,
  });

  doc.text("Product", TABLE.product, y + 9, {
    width: 180,
  });

  doc.text("Qty", TABLE.qty, y + 9, {
    width: 35,
    align: "center",
  });

  doc.text("Unit", TABLE.unit, y + 9, {
    width: 50,
    align: "right",
  });

  doc.text("Disc.", TABLE.discount, y + 9, {
    width: 40,
    align: "right",
  });

  doc.text("Final", TABLE.final, y + 9, {
    width: 45,
    align: "right",
  });

  doc.text("Total", TABLE.total, y + 9, {
    width: 50,
    align: "right",
  });

  return y + HEADER_HEIGHT + 5;
};

const drawProductRow = (doc, invoice, item, index, y, rowHeight) => {
  const currency = safeText(invoice?.shop?.currency, "BDT");

  const productName = safeText(item?.name, "Unknown Product");

  const sku = safeText(item?.sku);

  const quantity = safeNumber(item?.quantity, 0);

  const unitPrice = safeNumber(item?.unitPrice ?? item?.price, 0);

  const discount = safeNumber(item?.discount, 0);

  const finalPrice = safeNumber(item?.finalPrice, unitPrice);

  const subtotal = safeNumber(item?.subtotal, finalPrice * quantity);

  // ============================================================
  // ROW BACKGROUND
  // ============================================================

  if (index % 2 === 0) {
    doc.rect(TABLE.x, y, TABLE.width, rowHeight).fill(COLORS.zebra);
  }

  // ============================================================
  // SKU
  // ============================================================

  doc
    .fillColor(COLORS.muted)
    .font("Helvetica")
    .fontSize(8)
    .text(sku, TABLE.sku, y + 10, {
      width: 55,
      height: rowHeight - 15,
      ellipsis: true,
    });

  // ============================================================
  // PRODUCT
  // ============================================================

  doc
    .fillColor(COLORS.dark)
    .font("Helvetica-Bold")
    .fontSize(9)
    .text(productName, TABLE.product, y + 8, {
      width: 180,
      height: rowHeight - 12,
      ellipsis: true,
      lineGap: 1,
    });

  // ============================================================
  // QUANTITY
  // ============================================================

  doc
    .fillColor(COLORS.text)
    .font("Helvetica")
    .fontSize(9)
    .text(String(quantity), TABLE.qty, y + 17, {
      width: 35,
      align: "center",
    });

  // ============================================================
  // UNIT PRICE
  // ============================================================

  doc.text(formatMoney(currency, unitPrice), TABLE.unit, y + 17, {
    width: 50,
    align: "right",
  });

  // ============================================================
  // DISCOUNT
  // ============================================================

  doc.text(`${discount.toFixed(2)}%`, TABLE.discount, y + 17, {
    width: 40,
    align: "right",
  });

  // ============================================================
  // FINAL PRICE
  // ============================================================

  doc.text(formatMoney(currency, finalPrice), TABLE.final, y + 17, {
    width: 45,
    align: "right",
  });

  // ============================================================
  // LINE TOTAL
  // ============================================================

  doc
    .font("Helvetica-Bold")
    .text(formatMoney(currency, subtotal), TABLE.total, y + 17, {
      width: 50,
      align: "right",
    });

  // ============================================================
  // ROW DIVIDER
  // ============================================================

  doc
    .moveTo(TABLE.x, y + rowHeight)
    .lineTo(TABLE.x + TABLE.width, y + rowHeight)
    .strokeColor(COLORS.border)
    .lineWidth(0.6)
    .stroke();
};

const drawProductTable = (doc, invoice, startY) => {
  const items = Array.isArray(invoice?.items) ? invoice.items : [];

  let y = startY;

  // ============================================================
  // EMPTY ITEMS
  // ============================================================

  if (items.length === 0) {
    doc
      .roundedRect(TABLE.x, y, TABLE.width, 55, 5)
      .lineWidth(1)
      .strokeColor(COLORS.border)
      .stroke();

    doc
      .fillColor(COLORS.muted)
      .font("Helvetica")
      .fontSize(10)
      .text("No products were found for this order.", TABLE.x, y + 21, {
        width: TABLE.width,
        align: "center",
      });

    return y + 70;
  }

  // ============================================================
  // TABLE HEADER
  // ============================================================

  y = drawTableHeader(doc, y);

  // ============================================================
  // PRODUCT ROWS
  // ============================================================

  items.forEach((item, index) => {
    const rowHeight = calculateRowHeight(doc, item);

    // ----------------------------------------------------------
    // PAGE BREAK
    // ----------------------------------------------------------

    if (y + rowHeight > PAGE.bottom) {
      doc.addPage();

      y = PAGE.top;

      y = drawTableHeader(doc, y);
    }

    // ----------------------------------------------------------
    // DRAW ROW
    // ----------------------------------------------------------

    drawProductRow(doc, invoice, item, index, y, rowHeight);

    y += rowHeight;
  });

  return y + 8;
};

export default drawProductTable;
