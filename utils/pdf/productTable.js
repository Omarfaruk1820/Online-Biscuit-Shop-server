const TABLE = {
  image: 50,
  sku: 95,
  product: 145,
  qty: 315,
  unit: 355,
  discount: 425,
  final: 475,
  total: 505,
};

const TABLE_START_X = 40;
const TABLE_WIDTH = 515;

const HEADER_HEIGHT = 28;
const ROW_HEIGHT = 60;

const PAGE_TOP = 50;
const PAGE_BOTTOM = 720;

const drawTableHeader = (doc, y) => {
  doc
    .roundedRect(TABLE_START_X, y, TABLE_WIDTH, HEADER_HEIGHT, 4)
    .fill("#1E40AF");

  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(10);

  doc.text("Image", TABLE.image + 2, y + 8);
  doc.text("SKU", TABLE.sku, y + 8);
  doc.text("Product", TABLE.product, y + 8);
  doc.text("Qty", TABLE.qty, y + 8);
  doc.text("Unit", TABLE.unit, y + 8);
  doc.text("Disc%", TABLE.discount, y + 8);
  doc.text("Final", TABLE.final, y + 8);

  doc.text("Total", TABLE.total, y + 8, {
    width: 40,
    align: "right",
  });

  return y + HEADER_HEIGHT + 8;
};

const drawProductTable = (doc, invoice, startY = 365) => {
  let y = drawTableHeader(doc, startY);

  invoice.items.forEach((item, index) => {
    // Page Break
    if (y + ROW_HEIGHT > PAGE_BOTTOM) {
      doc.addPage();
      y = drawTableHeader(doc, PAGE_TOP);
    }

    // Zebra Row
    if (index % 2 === 0) {
      doc
        .roundedRect(TABLE_START_X, y - 2, TABLE_WIDTH, ROW_HEIGHT, 0)
        .fill("#F8FAFC");
    }

    doc.fillColor("#111827");

    // Image Box
    doc
      .roundedRect(TABLE.image, y + 4, 34, 34, 3)
      .lineWidth(0.5)
      .strokeColor("#CBD5E1")
      .stroke();

    // SKU
    doc
      .fillColor("#6B7280")
      .font("Helvetica")
      .fontSize(8)
      .text(item.sku || "-", TABLE.sku, y + 16, {
        width: 40,
      });

    // Product Name
    doc
      .fillColor("#111827")
      .font("Helvetica-Bold")
      .fontSize(10)
      .text(item.name || "Unknown Product", TABLE.product, y + 8, {
        width: 150,
        ellipsis: true,
      });

    // Quantity
    doc
      .font("Helvetica")
      .fontSize(9)
      .text(String(item.quantity ?? 0), TABLE.qty, y + 16);

    // Unit Price
    doc.text(
      `${invoice.shop.currency} ${Number(
        item.unitPrice ?? item.price ?? 0,
      ).toFixed(2)}`,
      TABLE.unit,
      y + 16,
    );

    // Discount
    doc.text(`${Number(item.discount ?? 0)}%`, TABLE.discount, y + 16);

    // Final Price
    doc.text(
      `${invoice.shop.currency} ${Number(item.finalPrice ?? 0).toFixed(2)}`,
      TABLE.final,
      y + 16,
    );

    // Line Total
    doc
      .font("Helvetica-Bold")
      .text(
        `${invoice.shop.currency} ${Number(item.subtotal ?? 0).toFixed(2)}`,
        TABLE.total,
        y + 16,
        {
          width: 40,
          align: "right",
        },
      );

    // Divider
    doc
      .moveTo(TABLE_START_X, y + ROW_HEIGHT - 2)
      .lineTo(TABLE_START_X + TABLE_WIDTH, y + ROW_HEIGHT - 2)
      .strokeColor("#E5E7EB")
      .lineWidth(0.5)
      .stroke();

    y += ROW_HEIGHT;
  });

  return y;
};

export default drawProductTable;
