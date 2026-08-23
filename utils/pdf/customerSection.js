// utils/pdf/customerSection.js

const COLORS = {
  dark: "#111827",
  text: "#374151",
  muted: "#64748B",
  border: "#D1D5DB",
  light: "#F8FAFC",
  primary: "#2563EB",
};

const PAGE = {
  left: 50,
  right: 545,
  width: 495,
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

  if (!normalized) {
    return fallback;
  }

  return normalized.replace(/\b\w/g, (character) => character.toUpperCase());
};

const drawCustomerSection = (doc, invoice, startY = 195) => {
  const customer = invoice?.customer || {};
  const payment = invoice?.payment || {};
  const shipping = invoice?.shipping || {};
  const shop = invoice?.shop || {};

  const currency = safeText(shop.currency, "BDT");

  let y = startY;

  // ============================================================
  // BILL TO
  // ============================================================

  doc
    .fillColor(COLORS.dark)
    .font("Helvetica-Bold")
    .fontSize(13)
    .text("Bill To", PAGE.left, y);

  // ============================================================
  // CUSTOMER DETAILS
  // ============================================================

  let customerY = y + 24;

  const customerDetails = [
    ["Name", safeText(customer.name, "N/A")],
    ["Email", safeText(customer.email, "N/A")],
    ["Phone", safeText(customer.phone, "N/A")],
    ["Address", safeText(customer.address, "N/A")],
    ["City", safeText(customer.city, "-")],
    ["ZIP", safeText(customer.zip, "-")],
  ];

  customerDetails.forEach(([label, value]) => {
    doc
      .fillColor(COLORS.muted)
      .font("Helvetica")
      .fontSize(9)
      .text(`${label}:`, PAGE.left, customerY, {
        width: 55,
      });

    doc
      .fillColor(COLORS.text)
      .font("Helvetica")
      .fontSize(9)
      .text(value, PAGE.left + 55, customerY, {
        width: 205,
        ellipsis: true,
      });

    customerY += 17;
  });

  // ============================================================
  // PAYMENT INFORMATION
  // ============================================================

  const paymentX = 325;

  doc
    .fillColor(COLORS.dark)
    .font("Helvetica-Bold")
    .fontSize(13)
    .text("Payment Information", paymentX, y);

  let paymentY = y + 24;

  const paymentMethod =
    payment.method || invoice?.paymentMethod || "cash_on_delivery";

  const paymentStatus = payment.status || invoice?.paymentStatus || "pending";

  const shippingStatus = shipping.status || invoice?.status || "pending";

  const shippingCharge =
    shipping.shippingCharge !== undefined
      ? shipping.shippingCharge
      : invoice?.shippingCharge !== undefined
        ? invoice.shippingCharge
        : invoice?.summary?.shippingCharge;

  const paymentDetails = [
    ["Method", formatStatus(paymentMethod, "Cash on Delivery")],
    ["Payment Status", formatStatus(paymentStatus)],
    ["Order Status", formatStatus(shippingStatus)],
    ["Currency", currency],
  ];

  if (shippingCharge !== undefined) {
    paymentDetails.push([
      "Shipping Charge",
      formatMoney(currency, shippingCharge),
    ]);
  }

  paymentDetails.forEach(([label, value]) => {
    doc
      .fillColor(COLORS.muted)
      .font("Helvetica")
      .fontSize(9)
      .text(`${label}:`, paymentX, paymentY, {
        width: 85,
      });

    doc
      .fillColor(COLORS.text)
      .font("Helvetica")
      .fontSize(9)
      .text(value, paymentX + 85, paymentY, {
        width: 135,
        align: "right",
        ellipsis: true,
      });

    paymentY += 18;
  });

  // ============================================================
  // SECTION CONTAINER
  // ============================================================

  const boxTop = y - 8;

  const boxBottom = Math.max(customerY, paymentY) + 8;

  const boxHeight = boxBottom - boxTop;

  doc
    .roundedRect(PAGE.left, boxTop, PAGE.width, boxHeight, 6)
    .lineWidth(1)
    .strokeColor(COLORS.border)
    .stroke();

  // Redraw section titles over the border
  doc
    .fillColor(COLORS.dark)
    .font("Helvetica-Bold")
    .fontSize(13)
    .text("Bill To", PAGE.left + 12, y);

  doc
    .fillColor(COLORS.dark)
    .font("Helvetica-Bold")
    .fontSize(13)
    .text("Payment Information", paymentX, y);

  // ============================================================
  // VERTICAL DIVIDER
  // ============================================================

  doc
    .moveTo(300, boxTop + 12)
    .lineTo(300, boxBottom - 12)
    .strokeColor(COLORS.border)
    .lineWidth(0.7)
    .stroke();

  // ============================================================
  // RETURN NEXT Y POSITION
  // ============================================================

  return boxBottom + 18;
};

export default drawCustomerSection;
