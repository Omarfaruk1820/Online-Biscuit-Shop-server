// =======================================================
// summarySection.js
// Order Summary + Payment Summary
// =======================================================

const drawSummarySection = (doc, invoice, startY) => {
  let y = startY + 25;

  // =====================================================
  // AUTO PAGE BREAK
  // =====================================================

  if (y > 560) {
    doc.addPage();
    y = 60;
  }

  // =====================================================
  // ORDER SUMMARY TITLE
  // =====================================================

  doc
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .fontSize(16)
    .text("Order Summary", 320, y);

  y += 28;

  // =====================================================
  // SUMMARY BOX
  // =====================================================

  doc
    .roundedRect(315, y, 230, 185, 6)
    .lineWidth(1)
    .strokeColor("#D1D5DB")
    .stroke();

  let sy = y + 18;

  doc.font("Helvetica").fontSize(10).fillColor("#374151");

  //-------------------------------------------------------
  // Total Items
  //-------------------------------------------------------

  doc.text("Total Items", 330, sy);

  doc.text(String(invoice.summary.totalItems), 505, sy, {
    width: 30,
    align: "right",
  });

  sy += 22;

  //-------------------------------------------------------
  // Total Quantity
  //-------------------------------------------------------

  doc.text("Total Quantity", 330, sy);

  doc.text(String(invoice.summary.totalQuantity), 505, sy, {
    width: 30,
    align: "right",
  });

  sy += 22;

  //-------------------------------------------------------
  // Subtotal
  //-------------------------------------------------------

  doc.text("Subtotal", 330, sy);

  doc.text(
    `${invoice.shop.currency} ${Number(invoice.summary.subtotal).toFixed(2)}`,
    420,
    sy,
    {
      width: 115,
      align: "right",
    },
  );

  sy += 22;

  //-------------------------------------------------------
  // Shipping
  //-------------------------------------------------------

  doc.text("Shipping", 330, sy);

  doc.text(
    `${invoice.shop.currency} ${Number(invoice.summary.shippingCharge).toFixed(
      2,
    )}`,
    420,
    sy,
    {
      width: 115,
      align: "right",
    },
  );

  sy += 22;

  //-------------------------------------------------------
  // Tax
  //-------------------------------------------------------

  doc.text("VAT / Tax", 330, sy);

  doc.text(
    `${invoice.shop.currency} ${Number(invoice.summary.tax).toFixed(2)}`,
    420,
    sy,
    {
      width: 115,
      align: "right",
    },
  );

  sy += 22;

  //-------------------------------------------------------
  // Discount
  //-------------------------------------------------------

  doc.text("Discount", 330, sy);

  doc.text(
    `${invoice.shop.currency} ${Number(invoice.summary.discount).toFixed(2)}`,
    420,
    sy,
    {
      width: 115,
      align: "right",
    },
  );

  sy += 26;

  //-------------------------------------------------------
  // Divider
  //-------------------------------------------------------

  doc.moveTo(325, sy).lineTo(535, sy).strokeColor("#CBD5E1").stroke();

  sy += 12;

  //-------------------------------------------------------
  // Grand Total
  //-------------------------------------------------------

  doc.font("Helvetica-Bold").fontSize(12).fillColor("#111827");

  doc.text("Grand Total", 330, sy);

  doc.text(
    `${invoice.shop.currency} ${Number(invoice.summary.grandTotal).toFixed(2)}`,
    410,
    sy,
    {
      width: 125,
      align: "right",
    },
  );

  // =====================================================
  // PAYMENT SUMMARY
  // =====================================================

  y += 205;

  if (y > 700) {
    doc.addPage();
    y = 60;
  }

  doc
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .fontSize(14)
    .text("Payment Summary", 50, y);

  y += 24;

  doc.font("Helvetica").fontSize(10).fillColor("#374151");

  //-------------------------------------------------------
  // Payment Method
  //-------------------------------------------------------

  doc.text(`Payment Method : ${String(invoice.payment.method).toUpperCase()}`);

  doc.moveDown(0.5);

  //-------------------------------------------------------
  // Payment Status
  //-------------------------------------------------------

  doc.text(`Payment Status : ${String(invoice.payment.status).toUpperCase()}`);

  doc.moveDown(0.5);

  //-------------------------------------------------------
  // Shipping Status
  //-------------------------------------------------------

  doc.text(
    `Shipping Status : ${String(invoice.shipping.status).toUpperCase()}`,
  );

  doc.moveDown(0.5);

  //-------------------------------------------------------
  // Currency
  //-------------------------------------------------------

  doc.text(`Currency : ${invoice.shop.currency}`);

  // =====================================================
  // RETURN FINAL Y
  // =====================================================

  return y + 80;
};

export default drawSummarySection;
