// utils/invoice/companyHeader.js

const drawCompanyHeader = (doc, invoice) => {
  let y = 50;

  // ======================================================
  // COMPANY NAME
  // ======================================================

  doc
    .fillColor("#0F172A")
    .font("Helvetica-Bold")
    .fontSize(26)
    .text(invoice.shop.name, 50, y);

  // ======================================================
  // COMPANY SLOGAN
  // ======================================================

  doc
    .fillColor("#64748B")
    .font("Helvetica")
    .fontSize(11)
    .text(invoice.shop.slogan || "", 50, y + 30);

  // ======================================================
  // COMPANY INFORMATION
  // ======================================================

  doc
    .fillColor("#374151")
    .font("Helvetica")
    .fontSize(10)
    .text(`Address : ${invoice.shop.address}`, 50, y + 55)
    .text(`Phone   : ${invoice.shop.phone}`, 50, y + 72)
    .text(`Email   : ${invoice.shop.email}`, 50, y + 89)
    .text(`Website : ${invoice.shop.website}`, 50, y + 106);

  // ======================================================
  // INVOICE TITLE
  // ======================================================

  doc
    .fillColor("#2563EB")
    .font("Helvetica-Bold")
    .fontSize(28)
    .text("INVOICE", 380, y, {
      width: 165,
      align: "right",
    });

  // ======================================================
  // INVOICE DETAILS
  // ======================================================

  doc.fillColor("#111827").font("Helvetica").fontSize(10);

  doc.text(`Invoice No : ${invoice.invoiceNumber}`, 340, y + 45);

  doc.text(`Order No   : ${invoice.orderNumber}`, 340, y + 62);

  doc.text(`Order ID   : ${invoice.orderId}`, 340, y + 79);

  doc.text(
    `Order Date : ${new Date(invoice.orderDate).toLocaleString()}`,
    340,
    y + 96,
  );

  // ======================================================
  // DIVIDER
  // ======================================================

  doc
    .moveTo(50, 180)
    .lineTo(545, 180)
    .strokeColor("#D1D5DB")
    .lineWidth(1)
    .stroke();

  // ======================================================
  // RETURN NEXT Y POSITION
  // ======================================================

  return 195;
};

export default drawCompanyHeader;
