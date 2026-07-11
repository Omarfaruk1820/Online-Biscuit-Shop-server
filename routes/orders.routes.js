import { Router } from "express";
import { ObjectId } from "mongodb";

import PDFDocument from "pdfkit";

const ordersRoutes = (
  client,
  ordersCollection,
  cartsCollection,
  productsCollection,
  verifyToken,
  verifyAdmin,
) => {
  const router = Router();
  router.get("/", verifyToken, verifyAdmin, async (req, res) => {
    try {
      let { status = "all", page = 1, limit = 10, search = "" } = req.query;

      page = Math.max(1, parseInt(page));
      limit = Math.min(50, Math.max(1, parseInt(limit)));

      const skip = (page - 1) * limit;

      const query = {};

      if (status !== "all") {
        query.status = status;
      }

      if (search.trim()) {
        query.$or = [
          {
            email: {
              $regex: search,
              $options: "i",
            },
          },
          {
            "customer.phone": {
              $regex: search,
              $options: "i",
            },
          },
          {
            "customer.name": {
              $regex: search,
              $options: "i",
            },
          },
        ];
      }

      const [orders, total] = await Promise.all([
        ordersCollection
          .find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .toArray(),

        ordersCollection.countDocuments(query),
      ]);

      res.status(200).json({
        success: true,
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        data: orders,
      });
    } catch (error) {
      console.error("GET ORDERS:", error);

      res.status(500).json({
        success: false,
        message: "Failed to fetch orders",
      });
    }
  });

  router.get("/my", verifyToken, async (req, res) => {
    try {
      const email = req.user.email;
      const { status = "all" } = req.query;

      const query = { email };

      if (status !== "all") {
        query.status = status;
      }

      const orders = await ordersCollection
        .find(query)
        .sort({ createdAt: -1 })
        .toArray();

      res.json({
        success: true,
        count: orders.length,
        data: orders,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: "Failed to fetch user orders",
      });
    }
  });

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

  const formatMoney = (amount = 0) => Number(amount).toFixed(2);

  // Invoice Number

  const generateInvoiceNumber = (order) => {
    const date = new Date(order.createdAt);

    const y = date.getFullYear();

    const m = String(date.getMonth() + 1).padStart(2, "0");

    const d = String(date.getDate()).padStart(2, "0");

    return `INV-${y}${m}${d}-${order._id.toString().slice(-6).toUpperCase()}`;
  };

  // Order Number

  const generateOrderNumber = (order) => {
    const date = new Date(order.createdAt);

    const y = date.getFullYear();

    const m = String(date.getMonth() + 1).padStart(2, "0");

    const d = String(date.getDate()).padStart(2, "0");

    return `ORD-${y}${m}${d}-${order._id.toString().slice(-6).toUpperCase()}`;
  };

  // Total Quantity

  const getTotalQuantity = (items = []) =>
    items.reduce((sum, item) => sum + item.quantity, 0);

  // Sub Total

  const getSubTotal = (items = []) =>
    Number(items.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2));

  // Grand Total

  const getGrandTotal = (subtotal, shipping = 0, tax = 0, discount = 0) =>
    Number((subtotal + shipping + tax - discount).toFixed(2));

  router.get("/invoice/pdf/:id", verifyToken, async (req, res) => {
    try {
      // ======================================================
      // Request Information
      // ======================================================

      const { id } = req.params;
      const email = req.user.email;

      // ======================================================
      // Validate ObjectId
      // ======================================================

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid order id.",
        });
      }

      // ======================================================
      // Find Order
      // ======================================================

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

      // ======================================================
      // Calculate Summary
      // ======================================================

      const totalItems = order.items.length;

      const totalQuantity = getTotalQuantity(order.items);

      const subtotal = getSubTotal(order.items);

      const shippingCharge = SHOP_INFO.shippingCharge ?? 0;

      const tax = SHOP_INFO.tax ?? 0;

      const discount = 0;

      const grandTotal = getGrandTotal(subtotal, shippingCharge, tax, discount);

      // ======================================================
      // Build Invoice Object
      // ======================================================

      const invoice = {
        invoiceNumber: generateInvoiceNumber(order),

        orderNumber: generateOrderNumber(order),

        orderId: order._id.toString(),

        orderDate: order.createdAt,

        shop: {
          ...SHOP_INFO,
        },

        customer: {
          name: order.customer?.name || "N/A",

          email: order.email,

          phone: order.customer?.phone || "N/A",

          address: order.customer?.address || "N/A",

          city: order.customer?.city || "",

          zip: order.customer?.zip || "",
        },

        payment: {
          method: order.customer?.paymentMethod || "COD",

          status: order.paymentStatus || "unpaid",
        },

        shipping: {
          status: order.status || "pending",
        },

        items: order.items,

        summary: {
          totalItems,

          totalQuantity,

          subtotal,

          shippingCharge,

          tax,

          discount,

          grandTotal,
        },
      };

      // ======================================================
      // Create PDF Document
      // ======================================================

      const doc = new PDFDocument({
        size: "A4",

        margin: 50,

        bufferPages: true,

        info: {
          Title: `Invoice-${invoice.invoiceNumber}`,

          Author: SHOP_INFO.name,

          Subject: "Customer Invoice",

          Creator: SHOP_INFO.name,

          Producer: SHOP_INFO.name,

          Keywords: "invoice,ecommerce,pdf",
        },
      });

      // ======================================================
      // Response Headers
      // ======================================================

      res.setHeader("Content-Type", "application/pdf");

      res.setHeader(
        "Content-Disposition",
        `attachment; filename=${invoice.invoiceNumber}.pdf`,
      );

      res.setHeader("Cache-Control", "no-store");

      // ======================================================
      // Pipe PDF
      // ======================================================

      doc.pipe(res);

      // ======================================================
      // PDF Cursor
      // ======================================================

      let y = 50;

      // ======================================================
      // PART 2 STARTS HERE
      // Company Header
      // Invoice Information
      // Customer Information
      // ======================================================
      // ======================================================
      // COMPANY HEADER
      // ======================================================

      doc
        .fillColor("#0F172A")
        .font("Helvetica-Bold")
        .fontSize(26)
        .text(invoice.shop.name, 50, y);

      doc
        .fillColor("#64748B")
        .font("Helvetica")
        .fontSize(11)
        .text(invoice.shop.slogan || "", 50, y + 30);

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
      // INVOICE INFORMATION
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
      // CUSTOMER INFORMATION
      // ======================================================

      y = 195;

      doc
        .fillColor("#111827")
        .font("Helvetica-Bold")
        .fontSize(14)
        .text("Bill To", 50, y);

      doc.fillColor("#374151").font("Helvetica").fontSize(10);

      doc.text(`Name : ${invoice.customer.name}`, 50, y + 28);

      doc.text(`Email : ${invoice.customer.email}`, 50, y + 46);

      doc.text(`Phone : ${invoice.customer.phone}`, 50, y + 64);

      doc.text(`Address : ${invoice.customer.address}`, 50, y + 82);

      doc.text(`City : ${invoice.customer.city}`, 50, y + 100);

      doc.text(`ZIP : ${invoice.customer.zip}`, 50, y + 118);

      // ======================================================
      // PAYMENT INFORMATION
      // ======================================================

      doc
        .fillColor("#111827")
        .font("Helvetica-Bold")
        .fontSize(14)
        .text("Payment Information", 335, y);

      doc.fillColor("#374151").font("Helvetica").fontSize(10);

      doc.text(
        `Payment Method : ${String(invoice.payment.method).toUpperCase()}`,
        335,
        y + 28,
      );

      doc.text(
        `Payment Status : ${String(invoice.payment.status).toUpperCase()}`,
        335,
        y + 46,
      );

      doc.text(
        `Shipping Status : ${String(invoice.shipping.status).toUpperCase()}`,
        335,
        y + 64,
      );

      doc.text(`Currency : ${invoice.shop.currency}`, 335, y + 82);

      // ======================================================
      // DIVIDER BEFORE PRODUCT TABLE
      // ======================================================

      doc
        .moveTo(50, 350)
        .lineTo(545, 350)
        .strokeColor("#D1D5DB")
        .lineWidth(1)
        .stroke();

      y = 365;

      // ======================================================
      // PART 3 STARTS HERE
      // Product Table
      // ======================================================
      // ======================================================
      // PRODUCT TABLE
      // ======================================================

      const TABLE = {
        sku: 50,
        product: 95,
        qty: 275,
        unit: 325,
        discount: 390,
        final: 445,
        total: 505,
      };

      // ======================================================
      // TABLE HEADER
      // ======================================================

      const drawTableHeader = () => {
        doc.roundedRect(50, y, 495, 26, 3).fill("#1E3A8A");

        doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(10);

        doc.text("SKU", TABLE.sku + 5, y + 8);

        doc.text("Product", TABLE.product + 5, y + 8);

        doc.text("Qty", TABLE.qty + 5, y + 8);

        doc.text("Unit", TABLE.unit + 5, y + 8);

        doc.text("Disc%", TABLE.discount + 5, y + 8);

        doc.text("Final", TABLE.final + 5, y + 8);

        doc.text("Total", TABLE.total + 5, y + 8);

        y += 34;
      };

      drawTableHeader();

      // ======================================================
      // PRODUCT ROWS
      // ======================================================

      doc.font("Helvetica");

      invoice.items.forEach((item, index) => {
        // ============================================
        // PAGE BREAK
        // ============================================

        if (y > 730) {
          doc.addPage();

          y = 50;

          drawTableHeader();
        }

        // ============================================
        // ZEBRA ROW
        // ============================================

        if (index % 2 === 0) {
          doc.roundedRect(50, y - 2, 495, 24, 0).fill("#F9FAFB");
        }

        doc.fillColor("#111827").font("Helvetica").fontSize(9);

        // SKU

        doc.text(item.sku || "-", TABLE.sku + 5, y + 6, {
          width: 40,
        });

        // PRODUCT NAME

        doc.text(item.name, TABLE.product + 5, y + 6, {
          width: 165,
          ellipsis: true,
        });

        // QUANTITY

        doc.text(String(item.quantity), TABLE.qty + 8, y + 6);

        // UNIT PRICE

        doc.text(formatMoney(item.price), TABLE.unit + 5, y + 6);

        // DISCOUNT

        doc.text(`${item.discount}%`, TABLE.discount + 5, y + 6);

        // FINAL UNIT PRICE

        doc.text(formatMoney(item.finalPrice), TABLE.final + 5, y + 6);

        // LINE TOTAL

        doc
          .font("Helvetica-Bold")
          .text(formatMoney(item.subtotal), TABLE.total, y + 6, {
            width: 40,
            align: "right",
          });

        // ROW DIVIDER

        doc
          .moveTo(50, y + 22)
          .lineTo(545, y + 22)
          .strokeColor("#E5E7EB")
          .lineWidth(0.5)
          .stroke();

        y += 24;
      });

      // ======================================================
      // SPACE AFTER TABLE
      // ======================================================

      y += 25;

      // যদি Summary-এর জন্য নিচে জায়গা কম থাকে
      if (y > 620) {
        doc.addPage();
        y = 60;
      }

      // ======================================================
      // PART 4 STARTS HERE
      // Order Summary + Footer + doc.end()
      // ======================================================

      // ======================================================
      // ORDER SUMMARY
      // ======================================================

      doc
        .fillColor("#111827")
        .font("Helvetica-Bold")
        .fontSize(14)
        .text("Order Summary", 320, y);

      y += 28;

      doc
        .roundedRect(315, y, 230, 170, 5)
        .lineWidth(1)
        .strokeColor("#D1D5DB")
        .stroke();

      let sy = y + 15;

      doc.font("Helvetica").fontSize(10).fillColor("#374151");

      doc.text("Total Items", 330, sy);

      doc.text(String(invoice.summary.totalItems), 500, sy, {
        width: 35,
        align: "right",
      });

      sy += 22;

      doc.text("Total Quantity", 330, sy);

      doc.text(String(invoice.summary.totalQuantity), 500, sy, {
        width: 35,
        align: "right",
      });

      sy += 22;

      doc.text("Subtotal", 330, sy);

      doc.text(
        `${invoice.shop.currency} ${formatMoney(invoice.summary.subtotal)}`,
        430,
        sy,
        {
          width: 105,
          align: "right",
        },
      );

      sy += 22;

      doc.text("Shipping", 330, sy);

      doc.text(
        `${invoice.shop.currency} ${formatMoney(invoice.summary.shippingCharge)}`,
        430,
        sy,
        {
          width: 105,
          align: "right",
        },
      );

      sy += 22;

      doc.text("VAT / Tax", 330, sy);

      doc.text(
        `${invoice.shop.currency} ${formatMoney(invoice.summary.tax)}`,
        430,
        sy,
        {
          width: 105,
          align: "right",
        },
      );

      sy += 22;

      doc.text("Discount", 330, sy);

      doc.text(
        `${invoice.shop.currency} ${formatMoney(invoice.summary.discount)}`,
        430,
        sy,
        {
          width: 105,
          align: "right",
        },
      );

      sy += 24;

      doc.moveTo(325, sy).lineTo(535, sy).strokeColor("#CBD5E1").stroke();

      sy += 10;

      doc.fillColor("#111827").font("Helvetica-Bold").fontSize(12);

      doc.text("Grand Total", 330, sy);

      doc.text(
        `${invoice.shop.currency} ${formatMoney(invoice.summary.grandTotal)}`,
        420,
        sy,
        {
          width: 115,
          align: "right",
        },
      );

      // ======================================================
      // PAYMENT SUMMARY
      // ======================================================

      y += 195;

      if (y > 650) {
        doc.addPage();
        y = 60;
      }

      doc
        .fillColor("#111827")
        .font("Helvetica-Bold")
        .fontSize(13)
        .text("Payment Information", 50, y);

      y += 22;

      doc.font("Helvetica").fontSize(10).fillColor("#374151");

      doc.text(`Payment Method : ${invoice.payment.method.toUpperCase()}`);

      doc.moveDown(0.5);

      doc.text(`Payment Status : ${invoice.payment.status.toUpperCase()}`);

      doc.moveDown(0.5);

      doc.text(`Shipping Status : ${invoice.shipping.status.toUpperCase()}`);

      // ======================================================
      // THANK YOU
      // ======================================================

      y += 85;

      doc.moveTo(50, y).lineTo(545, y).strokeColor("#D1D5DB").stroke();

      y += 18;

      doc
        .fillColor("#0F172A")
        .font("Helvetica-Bold")
        .fontSize(16)
        .text("Thank you for shopping with us!", {
          align: "center",
        });

      doc.moveDown(0.6);

      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor("#6B7280")
        .text("We appreciate your business and hope to serve you again.", {
          align: "center",
        });

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

      doc.font("Helvetica").fontSize(10).fillColor("#374151");

      doc.text(`Shop Name : ${invoice.shop.name}`);
      doc.text(`Phone : ${invoice.shop.phone}`);
      doc.text(`Email : ${invoice.shop.email}`);
      doc.text(`Website : ${invoice.shop.website}`);
      doc.text(`Address : ${invoice.shop.address}`);

      // ======================================================
      // SIGNATURE
      // ======================================================

      const signatureY = 735;

      doc
        .moveTo(390, signatureY)
        .lineTo(540, signatureY)
        .strokeColor("#000000")
        .stroke();

      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor("#374151")
        .text("Authorized Signature", 405, signatureY + 6);

      // ======================================================
      // FOOTER
      // ======================================================

      doc
        .fontSize(8)
        .fillColor("#9CA3AF")
        .text(
          `© ${new Date().getFullYear()} ${invoice.shop.name}. All Rights Reserved.`,
          50,
          810,
          {
            width: 495,
            align: "center",
          },
        );

      // ======================================================
      // FINISH PDF
      // ======================================================

      doc.end();
    } catch (error) {
      console.error("PDF INVOICE ERROR:", error);

      if (!res.headersSent) {
        return res.status(500).json({
          success: false,
          message: "Failed to generate invoice PDF.",
        });
      }
    }
  });
  router.get("/invoice/:id", verifyToken, async (req, res) => {
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

      const totalQuantity = getTotalQuantity(order.items);

      const subtotal = getSubTotal(order.items);

      const shippingCharge = SHOP_INFO.shippingCharge;

      const tax = SHOP_INFO.tax;

      const discount = 0;

      const grandTotal = getGrandTotal(subtotal, shippingCharge, tax, discount);

      // -----------------------------
      // Invoice Object
      // -----------------------------

      const invoice = {
        invoiceNumber: generateInvoiceNumber(order),

        orderNumber: generateOrderNumber(order),

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
          method: order.customer.paymentMethod ?? "COD",

          status: order.paymentStatus ?? "unpaid",
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
            item.finalPrice ?? item.price - (item.price * item.discount) / 100,

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
      console.error("GET INVOICE ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to generate invoice.",
      });
    }
  });

  router.post("/", verifyToken, async (req, res) => {
    const session = client.startSession();

    try {
      const email = req.user.email;

      const { customer } = req.body;

      if (!customer?.name || !customer?.phone || !customer?.address) {
        return res.status(400).json({
          success: false,
          message: "Customer information required",
        });
      }

      const cartItems = await cartsCollection.find({ email }).toArray();

      if (!cartItems.length) {
        return res.status(400).json({
          success: false,
          message: "Cart is empty",
        });
      }

      const items = [];

      for (const cart of cartItems) {
        const product = await productsCollection.findOne({
          _id: new ObjectId(cart.productId),
        });

        if (!product) continue;

        const discount = product.discount || 0;

        const finalPrice = product.price - (product.price * discount) / 100;

        items.push({
          productId: product._id,

          sku: product.sku || "",

          name: product.name,

          image: product.image,

          quantity: cart.quantity,

          price: product.price,

          discount: discount,

          finalPrice,

          subtotal: Number((finalPrice * cart.quantity).toFixed(2)),
        });
      }

      if (!items.length) {
        return res.status(400).json({
          success: false,
          message: "No valid products found",
        });
      }

      const total = items.reduce((sum, item) => sum + item.subtotal, 0);

      await session.withTransaction(async () => {
        await ordersCollection.insertOne(
          {
            email,
            customer,

            items,

            total: Number(total.toFixed(2)),

            status: "pending",
            paymentStatus: "unpaid",

            createdAt: new Date(),
            updatedAt: new Date(),
          },
          { session },
        );

        await cartsCollection.deleteMany({ email }, { session });
      });

      res.status(201).json({
        success: true,
        message: "Order placed successfully",
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: "Order failed",
      });
    } finally {
      await session.endSession();
    }
  });

  router.patch("/cancel/:id", verifyToken, async (req, res) => {
    try {
      const { id } = req.params;
      const email = req.user.email;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid order id",
        });
      }

      const order = await ordersCollection.findOne({
        _id: new ObjectId(id),
        email,
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      if (order.status !== "pending") {
        return res.status(400).json({
          success: false,
          message: "Only pending orders can be cancelled",
        });
      }

      await ordersCollection.updateOne(
        {
          _id: new ObjectId(id),
        },
        {
          $set: {
            status: "cancelled",
            updatedAt: new Date(),
          },
        },
      );

      res.json({
        success: true,
        message: "Order cancelled successfully",
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: "Cancel failed",
      });
    }
  });

  router.patch("/status/:id", verifyToken, verifyAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid order id",
        });
      }

      const allowedStatuses = [
        "pending",
        "paid",
        "processing",
        "shipped",
        "delivered",
        "cancelled",
      ];

      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid status",
        });
      }

      const result = await ordersCollection.updateOne(
        {
          _id: new ObjectId(id),
        },
        {
          $set: {
            status,
            updatedAt: new Date(),
          },
        },
      );

      if (!result.matchedCount) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      res.json({
        success: true,
        message: "Order status updated",
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: "Status update failed",
      });
    }
  });

  return router;
};

export default ordersRoutes;
