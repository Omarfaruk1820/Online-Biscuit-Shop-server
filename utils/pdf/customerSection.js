// utils/invoice/customerSection.js

const drawCustomerSection = (doc, invoice, y = 195) => {
  // ======================================================
  // CUSTOMER TITLE
  // ======================================================

  doc
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .fontSize(14)
    .text("Bill To", 50, y);

  // ======================================================
  // CUSTOMER INFORMATION
  // ======================================================

  doc.fillColor("#374151").font("Helvetica").fontSize(10);

  doc.text(`Name : ${invoice.customer.name || "N/A"}`, 50, y + 28);

  doc.text(`Email : ${invoice.customer.email || "N/A"}`, 50, y + 46);

  doc.text(`Phone : ${invoice.customer.phone || "N/A"}`, 50, y + 64);

  doc.text(`Address : ${invoice.customer.address || "N/A"}`, 50, y + 82, {
    width: 230,
  });

  doc.text(`City : ${invoice.customer.city || "-"}`, 50, y + 108);

  doc.text(`ZIP : ${invoice.customer.zip || "-"}`, 50, y + 126);

  // ======================================================
  // PAYMENT TITLE
  // ======================================================

  doc
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .fontSize(14)
    .text("Payment Information", 335, y);

  // ======================================================
  // PAYMENT INFORMATION
  // ======================================================

  doc.fillColor("#374151").font("Helvetica").fontSize(10);

  doc.text(
    `Payment Method : ${String(invoice.payment.method || "COD").toUpperCase()}`,
    335,
    y + 28,
  );

  doc.text(
    `Payment Status : ${String(
      invoice.payment.status || "UNPAID",
    ).toUpperCase()}`,
    335,
    y + 46,
  );

  doc.text(
    `Shipping Status : ${String(
      invoice.shipping.status || "PENDING",
    ).toUpperCase()}`,
    335,
    y + 64,
  );

  doc.text(`Currency : ${invoice.shop.currency || "BDT"}`, 335, y + 82);

  if (invoice.shipping.shippingCharge !== undefined) {
    doc.text(
      `Shipping Charge : ${invoice.shop.currency} ${Number(
        invoice.shipping.shippingCharge,
      ).toFixed(2)}`,
      335,
      y + 100,
    );
  }

  // ======================================================
  // DIVIDER
  // ======================================================

  const nextY = 350;

  doc
    .moveTo(50, nextY)
    .lineTo(545, nextY)
    .strokeColor("#D1D5DB")
    .lineWidth(1)
    .stroke();

  // ======================================================
  // RETURN NEXT Y POSITION
  // ======================================================

  return 365;
};

export default drawCustomerSection;
