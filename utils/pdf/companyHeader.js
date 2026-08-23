// utils/pdf/companyHeader.js

const COLORS = {
  primary: "#2563EB",
  dark: "#0F172A",
  text: "#374151",
  muted: "#64748B",
  border: "#D1D5DB",
  light: "#F8FAFC",
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

const formatDate = (value) => {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString("en-BD", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const drawCompanyHeader = (doc, invoice) => {
  const shop = invoice?.shop || {};

  const companyName = safeText(shop.name, "Your Store");
  const slogan = safeText(shop.slogan, "");

  const address = safeText(shop.address);
  const phone = safeText(shop.phone);
  const email = safeText(shop.email);
  const website = safeText(shop.website);

  const invoiceNumber = safeText(invoice?.invoiceNumber, "INV-NOT-AVAILABLE");

  const orderNumber = safeText(invoice?.orderNumber);
  const orderId = safeText(invoice?.orderId);

  const orderDate = formatDate(invoice?.orderDate);

  let y = 50;

  // ============================================================
  // COMPANY NAME
  // ============================================================

  doc
    .fillColor(COLORS.dark)
    .font("Helvetica-Bold")
    .fontSize(25)
    .text(companyName, PAGE.left, y, {
      width: 280,
      ellipsis: true,
    });

  // ============================================================
  // COMPANY SLOGAN
  // ============================================================

  if (slogan) {
    doc
      .fillColor(COLORS.muted)
      .font("Helvetica")
      .fontSize(10)
      .text(slogan, PAGE.left, y + 31, {
        width: 280,
        ellipsis: true,
      });
  }

  // ============================================================
  // COMPANY INFORMATION
  // ============================================================

  let companyInfoY = y + 53;

  const companyLines = [
    `Address: ${address}`,
    `Phone: ${phone}`,
    `Email: ${email}`,
    `Website: ${website}`,
  ];

  doc.fillColor(COLORS.text).font("Helvetica").fontSize(9);

  companyLines.forEach((line) => {
    doc.text(line, PAGE.left, companyInfoY, {
      width: 275,
      ellipsis: true,
    });

    companyInfoY += 15;
  });

  // ============================================================
  // INVOICE TITLE
  // ============================================================

  doc
    .fillColor(COLORS.primary)
    .font("Helvetica-Bold")
    .fontSize(27)
    .text("INVOICE", 360, y, {
      width: 185,
      align: "right",
    });

  // ============================================================
  // INVOICE DETAILS
  // ============================================================

  const detailsX = 325;
  const detailsWidth = 220;

  const invoiceDetails = [
    ["Invoice No", invoiceNumber],
    ["Order No", orderNumber],
    ["Order ID", orderId],
    ["Order Date", orderDate],
  ];

  let detailsY = y + 45;

  invoiceDetails.forEach(([label, value]) => {
    doc
      .fillColor(COLORS.muted)
      .font("Helvetica")
      .fontSize(9)
      .text(`${label}:`, detailsX, detailsY, {
        width: 65,
      });

    doc
      .fillColor(COLORS.text)
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(value, detailsX + 65, detailsY, {
        width: detailsWidth - 65,
        align: "right",
        ellipsis: true,
      });

    detailsY += 17;
  });

  // ============================================================
  // HEADER DIVIDER
  // ============================================================

  const dividerY = Math.max(companyInfoY, detailsY) + 12;

  doc
    .moveTo(PAGE.left, dividerY)
    .lineTo(PAGE.right, dividerY)
    .strokeColor(COLORS.border)
    .lineWidth(1)
    .stroke();

  // ============================================================
  // RETURN NEXT Y POSITION
  // ============================================================

  return dividerY + 18;
};

export default drawCompanyHeader;
