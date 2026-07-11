// ======================================================
// Imports
// ======================================================

import { Router } from "express";
import { ObjectId } from "mongodb";
import PDFDocument from "pdfkit";

// ======================================================
// Shop Information
// ======================================================

const SHOP_INFO = {
  name: "Biscuit Shop",

  slogan: "Fresh Biscuits Every Day",

  address: "Dhaka, Bangladesh",

  phone: "+8801700000000",

  email: "support@biscuitshop.com",

  website: "https://biscuitshop.com",

  currency: "BDT",

  shippingCharge: 0,

  tax: 0,
};

// ======================================================
// Helper Functions
// ======================================================

// Format Money

const formatMoney = (amount = 0) =>
  Number(amount).toFixed(2);

// Invoice Number

const generateInvoiceNumber = (order) => {
  const date = new Date(order.createdAt);

  const y = date.getFullYear();

  const m = String(date.getMonth() + 1).padStart(2, "0");

  const d = String(date.getDate()).padStart(2, "0");

  return `INV-${y}${m}${d}-${order._id
    .toString()
    .slice(-6)
    .toUpperCase()}`;
};

// Order Number

const generateOrderNumber = (order) => {
  const date = new Date(order.createdAt);

  const y = date.getFullYear();

  const m = String(date.getMonth() + 1).padStart(2, "0");

  const d = String(date.getDate()).padStart(2, "0");

  return `ORD-${y}${m}${d}-${order._id
    .toString()
    .slice(-6)
    .toUpperCase()}`;
};

// Total Quantity

const getTotalQuantity = (items = []) =>
  items.reduce((sum, item) => sum + item.quantity, 0);

// Sub Total

const getSubTotal = (items = []) =>
  Number(
    items
      .reduce((sum, item) => sum + item.subtotal, 0)
      .toFixed(2),
  );

// Grand Total

const getGrandTotal = (
  subtotal,
  shipping = 0,
  tax = 0,
  discount = 0,
) =>
  Number(
    (subtotal + shipping + tax - discount).toFixed(2),
  );

// ======================================================
// GET
// /orders/invoice/:id
// ======================================================

router.get(
  "/invoice/:id",
  verifyToken,
  async (req, res) => {
    try {
      const { id } = req.params;

      const email = req.user.email;

      // -----------------------------
      // Validation
      // -----------------------------

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid Order ID.",
        });
      }

      // -----------------------------
      // Find Order
      // -----------------------------

      const order = await ordersCollection.findOne({
        _id: new ObjectId(id),
        email,
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found.",
        });
      }

      // -----------------------------
      // Summary
      // -----------------------------

      const totalQuantity = getTotalQuantity(
        order.items,
      );

      const subtotal = getSubTotal(order.items);

      const shippingCharge =
        SHOP_INFO.shippingCharge;

      const tax = SHOP_INFO.tax;

      const discount = 0;

      const grandTotal = getGrandTotal(
        subtotal,
        shippingCharge,
        tax,
        discount,
      );

      // -----------------------------
      // Invoice Object
      // -----------------------------

      const invoice = {
        invoiceNumber:
          generateInvoiceNumber(order),

        orderNumber:
          generateOrderNumber(order),

        orderId: order._id,

        orderDate: order.createdAt,

        shop: SHOP_INFO,

        customer: {
          name: order.customer.name,

          email: order.email,

          phone: order.customer.phone,

          address: order.customer.address,

          city: order.customer.city,

          zip: order.customer.zip,
        },

        payment: {
          method:
            order.customer.paymentMethod ??
            "COD",

          status:
            order.paymentStatus ?? "unpaid",
        },

        shipping: {
          status: order.status,

          shippingCharge,
        },

        items: order.items.map((item) => ({
          productId: item.productId,

          sku: item.sku || "",

          name: item.name,

          image: item.image,

          quantity: item.quantity,

          unitPrice: item.price,

          discount: item.discount,

          finalPrice:
            item.finalPrice ??
            item.price -
              (item.price * item.discount) /
                100,

          subtotal: item.subtotal,
        })),

        summary: {
          totalItems: order.items.length,

          totalQuantity,

          subtotal,

          shippingCharge,

          tax,

          discount,

          grandTotal,
        },
      };

      // -----------------------------
      // Response
      // -----------------------------

      return res.status(200).json({
        success: true,

        invoice,
      });
    } catch (error) {
      console.error(
        "GET INVOICE ERROR:",
        error,
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to generate invoice.",
      });
    }
  },
);
// ======================================================
// GET
// /orders/invoice/pdf/:id
// Production Ready (Part A)
// ======================================================

router.get(
  "/invoice/pdf/:id",
  verifyToken,
  async (req, res) => {
    try {
      const { id } = req.params;
      const email = req.user.email;

      // =============================================
      // Validation
      // =============================================

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid order id.",
        });
      }

      // =============================================
      // Find Order
      // =============================================

      const order = await ordersCollection.findOne({
        _id: new ObjectId(id),
        email,
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found.",
        });
      }

      // =============================================
      // Build Invoice Data
      // =============================================

      const totalQuantity = getTotalQuantity(order.items);

      const subtotal = getSubTotal(order.items);

      const shippingCharge = SHOP_INFO.shippingCharge;

      const tax = SHOP_INFO.tax;

      const discount = 0;

      const grandTotal = getGrandTotal(
        subtotal,
        shippingCharge,
        tax,
        discount,
      );

      const invoice = {
        invoiceNumber: generateInvoiceNumber(order),

        orderNumber: generateOrderNumber(order),

        orderDate: order.createdAt,

        shop: SHOP_INFO,

        customer: {
          name: order.customer.name,

          email: order.email,

          phone: order.customer.phone,

          address: order.customer.address,

          city: order.customer.city,

          zip: order.customer.zip,
        },

        payment: {
          method:
            order.customer.paymentMethod || "COD",

          status:
            order.paymentStatus || "unpaid",
        },

        shipping: {
          status: order.status,
        },

        items: order.items,

        summary: {
          totalItems: order.items.length,

          totalQuantity,

          subtotal,

          shippingCharge,

          tax,

          discount,

          grandTotal,
        },
      };

      // =============================================
      // Create PDF Document
      // =============================================

      const doc = new PDFDocument({
        size: "A4",
        margin: 50,
        info: {
          Title: `Invoice-${invoice.invoiceNumber}`,
          Author: SHOP_INFO.name,
          Subject: "Customer Invoice",
          Keywords: "invoice,ecommerce,pdf",
          Creator: SHOP_INFO.name,
        },
      });

      // =============================================
      // Response Headers
      // =============================================

      res.setHeader(
        "Content-Type",
        "application/pdf",
      );

      res.setHeader(
        "Content-Disposition",
        `attachment; filename=${invoice.invoiceNumber}.pdf`,
      );

      // Stream PDF directly to browser
      doc.pipe(res);

      // =============================================
      // Store Current Position
      // =============================================

      let y = 50;

      // =============================================
      // PDF Layout Starts From Part 3
      // =============================================

      /*
          Part 3 এ এখানে থাকবে—

          Company Header
          Invoice Header
          Customer Information
          Products Table
          Summary
          Payment Info
          Footer
          Signature
          QR Code (optional)

          শেষে:

          doc.end();
      */

    } catch (error) {
      console.error("PDF INVOICE ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to generate invoice PDF.",
      });
    }
  },
);

// ======================================================
// PDF LAYOUT
// PART 3A
// Company Header + Invoice Information
// ======================================================

// ------------------------------------------------------
// Company Name
// ------------------------------------------------------

doc
  .fillColor("#0F172A")
  .font("Helvetica-Bold")
  .fontSize(26)
  .text(SHOP_INFO.name, 50, y);

// Company Slogan

doc
  .fillColor("#64748B")
  .font("Helvetica")
  .fontSize(11)
  .text(SHOP_INFO.slogan, 50, y + 30);

// ------------------------------------------------------
// Company Information
// ------------------------------------------------------

doc
  .fillColor("#374151")
  .fontSize(10)
  .text(`Address : ${SHOP_INFO.address}`, 50, y + 55)
  .text(`Phone   : ${SHOP_INFO.phone}`, 50, y + 72)
  .text(`Email   : ${SHOP_INFO.email}`, 50, y + 89)
  .text(`Website : ${SHOP_INFO.website}`, 50, y + 106);

// ------------------------------------------------------
// Invoice Title
// ------------------------------------------------------

doc
  .fillColor("#2563EB")
  .font("Helvetica-Bold")
  .fontSize(28)
  .text("INVOICE", 390, y, {
    width: 160,
    align: "right",
  });

// ------------------------------------------------------
// Invoice Information
// ------------------------------------------------------

doc
  .fillColor("#111827")
  .font("Helvetica")
  .fontSize(10);

doc.text(
  `Invoice No : ${invoice.invoiceNumber}`,
  350,
  y + 45,
);

doc.text(
  `Order No   : ${invoice.orderNumber}`,
  350,
  y + 62,
);

doc.text(
  `Order ID   : ${order._id}`,
  350,
  y + 79,
);

doc.text(
  `Order Date : ${new Date(
    invoice.orderDate,
  ).toLocaleString()}`,
  350,
  y + 96,
);

// ------------------------------------------------------
// Horizontal Line
// ------------------------------------------------------

doc
  .moveTo(50, 180)
  .lineTo(545, 180)
  .strokeColor("#D1D5DB")
  .stroke();

// ======================================================
// Customer Information
// ======================================================

y = 195;

doc
  .fillColor("#111827")
  .font("Helvetica-Bold")
  .fontSize(14)
  .text("Bill To", 50, y);

doc
  .font("Helvetica")
  .fontSize(10)
  .fillColor("#374151");

doc.text(
  `Name : ${invoice.customer.name}`,
  50,
  y + 28,
);

doc.text(
  `Email : ${invoice.customer.email}`,
  50,
  y + 46,
);

doc.text(
  `Phone : ${invoice.customer.phone}`,
  50,
  y + 64,
);

doc.text(
  `Address : ${invoice.customer.address}`,
  50,
  y + 82,
);

doc.text(
  `City : ${invoice.customer.city}`,
  50,
  y + 100,
);

doc.text(
  `ZIP : ${invoice.customer.zip}`,
  50,
  y + 118,
);

// ======================================================
// Payment Information
// ======================================================

doc
  .fillColor("#111827")
  .font("Helvetica-Bold")
  .fontSize(14)
  .text("Payment Information", 340, y);

doc
  .font("Helvetica")
  .fontSize(10)
  .fillColor("#374151");

doc.text(
  `Method : ${invoice.payment.method.toUpperCase()}`,
  340,
  y + 28,
);

doc.text(
  `Payment Status : ${invoice.payment.status.toUpperCase()}`,
  340,
  y + 46,
);

doc.text(
  `Shipping Status : ${invoice.shipping.status.toUpperCase()}`,
  340,
  y + 64,
);

doc.text(
  `Currency : ${SHOP_INFO.currency}`,
  340,
  y + 82,
);

// ======================================================
// Divider Before Product Table
// ======================================================

doc
  .moveTo(50, 350)
  .lineTo(545, 350)
  .strokeColor("#D1D5DB")
  .stroke();

y = 365;

// ======================================================
// Product Table Starts From Part 3B
// ======================================================
// ======================================================
// PRODUCT TABLE HEADER
// ======================================================

const TABLE = {
  sku: 50,
  product: 95,
  qty: 275,
  unit: 325,
  discount: 395,
  final: 455,
  total: 520,
};

// Table Header Background

doc
  .roundedRect(50, y, 495, 24, 3)
  .fill("#1E3A8A");

doc
  .fillColor("#FFFFFF")
  .font("Helvetica-Bold")
  .fontSize(10);

doc.text("SKU", TABLE.sku + 5, y + 7);

doc.text("Product", TABLE.product + 5, y + 7);

doc.text("Qty", TABLE.qty + 5, y + 7);

doc.text("Unit", TABLE.unit + 5, y + 7);

doc.text("Disc%", TABLE.discount + 5, y + 7);

doc.text("Final", TABLE.final + 5, y + 7);

doc.text("Total", TABLE.total + 5, y + 7);

y += 32;

// ======================================================
// PRODUCT ROWS
// ======================================================

doc.font("Helvetica");

invoice.items.forEach((item, index) => {

  // --------------------------------------------
  // Auto Page Break
  // --------------------------------------------

  if (y > 720) {

    doc.addPage();

    y = 60;

    doc
      .roundedRect(50, y, 495, 24, 3)
      .fill("#1E3A8A");

    doc
      .fillColor("#FFFFFF")
      .font("Helvetica-Bold")
      .fontSize(10);

    doc.text("SKU", TABLE.sku + 5, y + 7);

    doc.text("Product", TABLE.product + 5, y + 7);

    doc.text("Qty", TABLE.qty + 5, y + 7);

    doc.text("Unit", TABLE.unit + 5, y + 7);

    doc.text("Disc%", TABLE.discount + 5, y + 7);

    doc.text("Final", TABLE.final + 5, y + 7);

    doc.text("Total", TABLE.total + 5, y + 7);

    y += 32;
  }

  // --------------------------------------------
  // Zebra Row
  // --------------------------------------------

  if (index % 2 === 0) {

    doc
      .roundedRect(50, y - 3, 495, 24, 0)
      .fill("#F9FAFB");
  }

  doc
    .fillColor("#111827")
    .font("Helvetica")
    .fontSize(9);

  // SKU

  doc.text(
    item.sku || "-",
    TABLE.sku + 5,
    y + 5,
    {
      width: 40,
    },
  );

  // Product Name

  doc.text(
    item.name,
    TABLE.product + 5,
    y + 5,
    {
      width: 160,
      ellipsis: true,
    },
  );

  // Quantity

  doc.text(
    String(item.quantity),
    TABLE.qty + 8,
    y + 5,
  );

  // Unit Price

  doc.text(
    `${formatMoney(item.price)}`,
    TABLE.unit + 5,
    y + 5,
  );

  // Discount

  doc.text(
    `${item.discount}%`,
    TABLE.discount + 5,
    y + 5,
  );

  // Final Price

  doc.text(
    `${formatMoney(item.finalPrice)}`,
    TABLE.final + 5,
    y + 5,
  );

  // Line Total

  doc
    .font("Helvetica-Bold")
    .text(
      `${formatMoney(item.subtotal)}`,
      TABLE.total + 2,
      y + 5,
    );

  // Divider

  doc
    .moveTo(50, y + 22)
    .lineTo(545, y + 22)
    .strokeColor("#E5E7EB")
    .stroke();

  y += 24;
});

// ======================================================
// TABLE END
// ======================================================

y += 20;
// ======================================================
// PART 3C
// ORDER SUMMARY
// ======================================================

// যদি টেবিলের পরে জায়গা কম থাকে তাহলে নতুন পেজ

if (y > 620) {
  doc.addPage();
  y = 60;
}

// --------------------------------------------
// Summary Title
// --------------------------------------------

doc
  .fillColor("#111827")
  .font("Helvetica-Bold")
  .fontSize(14)
  .text("Order Summary", 330, y);

y += 25;

// --------------------------------------------
// Summary Box
// --------------------------------------------

doc
  .roundedRect(320, y, 225, 145, 5)
  .lineWidth(1)
  .strokeColor("#D1D5DB")
  .stroke();

let sy = y + 15;

// Total Items

doc
  .font("Helvetica")
  .fontSize(10)
  .fillColor("#374151");

doc.text("Total Items", 335, sy);

doc.text(
  String(invoice.summary.totalItems),
  520,
  sy,
  {
    width: 20,
    align: "right",
  },
);

sy += 22;

// Quantity

doc.text("Total Quantity", 335, sy);

doc.text(
  String(invoice.summary.totalQuantity),
  520,
  sy,
  {
    width: 20,
    align: "right",
  },
);

sy += 22;

// Subtotal

doc.text("Subtotal", 335, sy);

doc.text(
  `${SHOP_INFO.currency} ${formatMoney(invoice.summary.subtotal)}`,
  420,
  sy,
  {
    width: 110,
    align: "right",
  },
);

sy += 22;

// Shipping

doc.text("Shipping", 335, sy);

doc.text(
  `${SHOP_INFO.currency} ${formatMoney(invoice.summary.shippingCharge)}`,
  420,
  sy,
  {
    width: 110,
    align: "right",
  },
);

sy += 22;

// Tax

doc.text("VAT / Tax", 335, sy);

doc.text(
  `${SHOP_INFO.currency} ${formatMoney(invoice.summary.tax)}`,
  420,
  sy,
  {
    width: 110,
    align: "right",
  },
);

sy += 22;

// Discount

doc.text("Discount", 335, sy);

doc.text(
  `${SHOP_INFO.currency} ${formatMoney(invoice.summary.discount)}`,
  420,
  sy,
  {
    width: 110,
    align: "right",
  },
);

sy += 24;

// Divider

doc
  .moveTo(330, sy)
  .lineTo(535, sy)
  .strokeColor("#CBD5E1")
  .stroke();

sy += 10;

// Grand Total

doc
  .fillColor("#111827")
  .font("Helvetica-Bold")
  .fontSize(12);

doc.text("Grand Total", 335, sy);

doc.text(
  `${SHOP_INFO.currency} ${formatMoney(invoice.summary.grandTotal)}`,
  410,
  sy,
  {
    width: 120,
    align: "right",
  },
);

// ======================================================
// PAYMENT & SHIPPING STATUS
// ======================================================

y += 170;

doc
  .fillColor("#111827")
  .font("Helvetica-Bold")
  .fontSize(13)
  .text("Payment Information", 50, y);

y += 22;

doc
  .font("Helvetica")
  .fontSize(10)
  .fillColor("#374151");

doc.text(
  `Payment Method : ${invoice.payment.method.toUpperCase()}`,
);

doc.moveDown(0.5);

doc.text(
  `Payment Status : ${invoice.payment.status.toUpperCase()}`,
);

doc.moveDown(0.5);

doc.text(
  `Shipping Status : ${invoice.shipping.status.toUpperCase()}`,
);

// ======================================================
// THANK YOU
// ======================================================

y += 85;

doc
  .moveTo(50, y)
  .lineTo(545, y)
  .strokeColor("#D1D5DB")
  .stroke();

y += 20;

doc
  .fillColor("#0F172A")
  .font("Helvetica-Bold")
  .fontSize(16)
  .text(
    "Thank you for shopping with us!",
    {
      align: "center",
    },
  );

doc.moveDown(0.6);

doc
  .font("Helvetica")
  .fontSize(10)
  .fillColor("#6B7280")
  .text(
    "We appreciate your business and hope to serve you again.",
    {
      align: "center",
    },
  );

// ======================================================
// SUPPORT INFORMATION
// ======================================================

doc.moveDown(1.5);

doc
  .fillColor("#111827")
  .font("Helvetica-Bold")
  .fontSize(11)
  .text("Support Information");

doc.moveDown(0.5);

doc
  .font("Helvetica")
  .fontSize(10)
  .fillColor("#374151");

doc.text(`Shop Name : ${SHOP_INFO.name}`);

doc.text(`Phone : ${SHOP_INFO.phone}`);

doc.text(`Email : ${SHOP_INFO.email}`);

doc.text(`Website : ${SHOP_INFO.website}`);

doc.text(`Address : ${SHOP_INFO.address}`);

// ======================================================
// SIGNATURE
// ======================================================

const signatureY = 735;

doc
  .moveTo(400, signatureY)
  .lineTo(540, signatureY)
  .strokeColor("#000000")
  .stroke();

doc
  .font("Helvetica")
  .fontSize(9)
  .fillColor("#374151")
  .text(
    "Authorized Signature",
    410,
    signatureY + 5,
  );

// ======================================================
// FOOTER
// ======================================================

doc
  .fontSize(8)
  .fillColor("#9CA3AF")
  .text(
    `© ${new Date().getFullYear()} ${SHOP_INFO.name}. All Rights Reserved.`,
    50,
    810,
    {
      align: "center",
      width: 495,
    },
  );

// ======================================================
// FINISH PDF
// ======================================================

doc.end();
