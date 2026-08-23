// utils/pdf/summarySection.js

const COLORS = {
  dark: "#111827",
  text: "#374151",
  muted: "#64748B",
  border: "#D1D5DB",
  light: "#F8FAFC",
  primary: "#2563EB",
  primaryLight: "#EFF6FF",
  success: "#15803D",
};

const PAGE = {
  left: 50,
  right: 545,
  width: 495,
  bottom: 750,
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

const formatStatus = (value, fallback = "Pending") => {
  const normalized = safeText(value, fallback)
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized.replace(/\b\w/g, (character) => character.toUpperCase());
};

const drawSummaryRow = (doc, label, value, x, y, valueWidth) => {
  doc.fillColor(COLORS.text).font("Helvetica").fontSize(9).text(label, x, y);

  doc
    .fillColor(COLORS.text)
    .font("Helvetica")
    .fontSize(9)
    .text(value, x + 90, y, {
      width: valueWidth,
      align: "right",
    });
};

const drawSummarySection = (doc, invoice, startY) => {
  const summary = invoice?.summary || {};
  const shop = invoice?.shop || {};
  const payment = invoice?.payment || {};
  const shipping = invoice?.shipping || {};

  const currency = safeText(shop.currency, "BDT");

  // ============================================================
  // VALUES
  // ============================================================

  const totalItems = safeNumber(summary.totalItems ?? invoice?.totalItems);

  const totalQuantity = safeNumber(
    summary.totalQuantity ?? invoice?.totalQuantity,
  );

  const subtotal = safeNumber(summary.subtotal ?? invoice?.subtotal);

  const shippingCharge = safeNumber(
    summary.shippingCharge ?? invoice?.shippingCharge ?? invoice?.shipping,
  );

  const tax = safeNumber(summary.tax ?? invoice?.tax);

  const discount = safeNumber(summary.discount ?? invoice?.totalDiscount);

  const grandTotal = safeNumber(summary.grandTotal ?? invoice?.grandTotal);

  // ============================================================
  // POSITION
  // ============================================================

  let y = startY + 20;

  if (y > 560) {
    doc.addPage();
    y = 60;
  }

  // ============================================================
  // ORDER SUMMARY TITLE
  // ============================================================

  doc
    .fillColor(COLORS.dark)
    .font("Helvetica-Bold")
    .fontSize(15)
    .text("Order Summary", 315, y);

  y += 25;

  // ============================================================
  // SUMMARY CARD
  // ============================================================

  const cardX = 315;
  const cardWidth = 230;
  const cardHeight = 215;

  doc.roundedRect(cardX, y, cardWidth, cardHeight, 7).fill(COLORS.light);

  doc
    .roundedRect(cardX, y, cardWidth, cardHeight, 7)
    .lineWidth(1)
    .strokeColor(COLORS.border)
    .stroke();

  let rowY = y + 18;

  // ============================================================
  // ITEM COUNTS
  // ============================================================

  drawSummaryRow(doc, "Total Items", String(totalItems), cardX + 15, rowY, 110);

  rowY += 22;

  drawSummaryRow(
    doc,
    "Total Quantity",
    String(totalQuantity),
    cardX + 15,
    rowY,
    110,
  );

  rowY += 24;

  // ============================================================
  // MONEY VALUES
  // ============================================================

  drawSummaryRow(
    doc,
    "Subtotal",
    formatMoney(currency, subtotal),
    cardX + 15,
    rowY,
    110,
  );

  rowY += 22;

  drawSummaryRow(
    doc,
    "Discount",
    `-${formatMoney(currency, discount)}`,
    cardX + 15,
    rowY,
    110,
  );

  rowY += 22;

  drawSummaryRow(
    doc,
    "Shipping",
    formatMoney(currency, shippingCharge),
    cardX + 15,
    rowY,
    110,
  );

  rowY += 22;

  drawSummaryRow(
    doc,
    "VAT / Tax",
    formatMoney(currency, tax),
    cardX + 15,
    rowY,
    110,
  );

  rowY += 24;

  // ============================================================
  // TOTAL DIVIDER
  // ============================================================

  doc
    .moveTo(cardX + 15, rowY)
    .lineTo(cardX + cardWidth - 15, rowY)
    .strokeColor(COLORS.border)
    .lineWidth(1)
    .stroke();

  rowY += 15;

  // ============================================================
  // GRAND TOTAL
  // ============================================================

  doc
    .fillColor(COLORS.dark)
    .font("Helvetica-Bold")
    .fontSize(11)
    .text("Grand Total", cardX + 15, rowY);

  doc
    .fillColor(COLORS.primary)
    .font("Helvetica-Bold")
    .fontSize(12)
    .text(formatMoney(currency, grandTotal), cardX + 85, rowY, {
      width: 125,
      align: "right",
    });

  // ============================================================
  // PAYMENT SUMMARY
  // ============================================================

  let paymentY = y + cardHeight + 25;

  if (paymentY > PAGE.bottom - 130) {
    doc.addPage();
    paymentY = 60;
  }

  doc
    .fillColor(COLORS.dark)
    .font("Helvetica-Bold")
    .fontSize(14)
    .text("Payment Summary", PAGE.left, paymentY);

  paymentY += 25;

  const paymentMethod =
    payment.method || invoice?.paymentMethod || "cash_on_delivery";

  const paymentStatus = payment.status || invoice?.paymentStatus || "pending";

  const shippingStatus = shipping.status || invoice?.status || "pending";

  // ============================================================
  // PAYMENT CARD
  // ============================================================

  const paymentCardHeight = 90;

  doc
    .roundedRect(PAGE.left, paymentY, PAGE.width, paymentCardHeight, 6)
    .fill(COLORS.primaryLight);

  doc
    .roundedRect(PAGE.left, paymentY, PAGE.width, paymentCardHeight, 6)
    .lineWidth(1)
    .strokeColor("#BFDBFE")
    .stroke();

  // ============================================================
  // PAYMENT DETAILS
  // ============================================================

  const leftX = PAGE.left + 15;
  const rightX = 315;

  let leftY = paymentY + 17;
  let rightY = paymentY + 17;

  // LEFT

  doc
    .fillColor(COLORS.muted)
    .font("Helvetica")
    .fontSize(9)
    .text("Payment Method", leftX, leftY);

  doc
    .fillColor(COLORS.text)
    .font("Helvetica-Bold")
    .fontSize(9)
    .text(formatStatus(paymentMethod), leftX, leftY + 14, {
      width: 210,
    });

  // RIGHT

  doc
    .fillColor(COLORS.muted)
    .font("Helvetica")
    .fontSize(9)
    .text("Payment Status", rightX, rightY);

  doc
    .fillColor(
      String(paymentStatus).toLowerCase() === "paid"
        ? COLORS.success
        : COLORS.text,
    )
    .font("Helvetica-Bold")
    .fontSize(9)
    .text(formatStatus(paymentStatus), rightX, rightY + 14);

  // SECOND ROW

  leftY += 42;
  rightY += 42;

  doc
    .fillColor(COLORS.muted)
    .font("Helvetica")
    .fontSize(9)
    .text("Order Status", leftX, leftY);

  doc
    .fillColor(COLORS.text)
    .font("Helvetica-Bold")
    .fontSize(9)
    .text(formatStatus(shippingStatus), leftX, leftY + 14);

  doc
    .fillColor(COLORS.muted)
    .font("Helvetica")
    .fontSize(9)
    .text("Currency", rightX, rightY);

  doc
    .fillColor(COLORS.text)
    .font("Helvetica-Bold")
    .fontSize(9)
    .text(currency, rightX, rightY + 14);

  // ============================================================
  // RETURN NEXT Y
  // ============================================================

  return paymentY + paymentCardHeight + 25;
};

export default drawSummarySection;
