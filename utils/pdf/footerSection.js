// ==========================================================
// footerSection.js
// Thank You + Support + Terms + Signature + Footer
// ==========================================================

const drawFooterSection = (doc, invoice, startY = 0) => {
  let y = startY + 20;

  // ==========================================================
  // AUTO PAGE BREAK
  // ==========================================================

  if (y > 560) {
    doc.addPage();
    y = 60;
  }

  // ==========================================================
  // TOP DIVIDER
  // ==========================================================

  doc.moveTo(50, y).lineTo(545, y).strokeColor("#D1D5DB").lineWidth(1).stroke();

  y += 22;

  // ==========================================================
  // THANK YOU
  // ==========================================================

  doc
    .fillColor("#0F172A")
    .font("Helvetica-Bold")
    .fontSize(18)
    .text("Thank You For Your Purchase!", {
      align: "center",
    });

  y = doc.y + 6;

  doc
    .fillColor("#6B7280")
    .font("Helvetica")
    .fontSize(10)
    .text(
      "We truly appreciate your business. We hope to serve you again soon.",
      {
        align: "center",
      },
    );

  y = doc.y + 25;

  // ==========================================================
  // SUPPORT INFORMATION
  // ==========================================================

  doc
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .fontSize(12)
    .text("Support Information", 50, y);

  y += 20;

  doc.fillColor("#374151").font("Helvetica").fontSize(10);

  doc.text(`Shop Name : ${invoice.shop.name}`, 50, y);

  y += 18;

  doc.text(`Phone : ${invoice.shop.phone}`, 50, y);

  y += 18;

  doc.text(`Email : ${invoice.shop.email}`, 50, y);

  y += 18;

  doc.text(`Website : ${invoice.shop.website}`, 50, y);

  y += 18;

  doc.text(`Address : ${invoice.shop.address}`, 50, y);

  // ==========================================================
  // TERMS & CONDITIONS
  // ==========================================================

  y += 35;

  doc
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .fontSize(12)
    .text("Terms & Conditions", 50, y);

  y += 18;

  doc
    .fillColor("#6B7280")
    .font("Helvetica")
    .fontSize(9)
    .text(
      "• Goods sold are non-refundable unless damaged.\n" +
        "• Please keep this invoice for warranty claims.\n" +
        "• Product warranty depends on the manufacturer's policy.\n" +
        "• For any support, contact our customer service.",
      50,
      y,
      {
        width: 300,
        lineGap: 4,
      },
    );

  // ==========================================================
  // SIGNATURE
  // ==========================================================

  const signatureY = Math.max(doc.y + 30, 700);

  doc
    .moveTo(385, signatureY)
    .lineTo(540, signatureY)
    .strokeColor("#111827")
    .lineWidth(1)
    .stroke();

  doc
    .fillColor("#374151")
    .font("Helvetica")
    .fontSize(9)
    .text("Authorized Signature", 405, signatureY + 6);

  // ==========================================================
  // FOOTER LINE
  // ==========================================================

  doc
    .moveTo(50, 790)
    .lineTo(545, 790)
    .strokeColor("#E5E7EB")
    .lineWidth(1)
    .stroke();

  // ==========================================================
  // FOOTER TEXT
  // ==========================================================

  doc
    .fillColor("#9CA3AF")
    .font("Helvetica")
    .fontSize(8)
    .text(
      `© ${new Date().getFullYear()} ${invoice.shop.name}. All Rights Reserved.`,
      50,
      802,
      {
        width: 495,
        align: "center",
      },
    );

  return doc.y;
};

export default drawFooterSection;
