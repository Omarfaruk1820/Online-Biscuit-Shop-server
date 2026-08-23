import { Router } from "express";
import PDFDocument from "pdfkit";

import orderService from "../utils/orderService.js";

import drawCompanyHeader from "../utils/pdf/companyHeader.js";
import drawCustomerSection from "../utils/pdf/customerSection.js";
import drawProductTable from "../utils/pdf/productTable.js";
import drawSummarySection from "../utils/pdf/summarySection.js";
import drawFooterSection from "../utils/pdf/footerSection.js";

// ============================================================
// CONFIG
// ============================================================

const PDF_CONFIG = {
  size: "A4",
  margin: 50,
};

// ============================================================
// HELPERS
// ============================================================

const normalizeString = (value) => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
};

const normalizeEmail = (value) => {
  return normalizeString(value).toLowerCase();
};

const sanitizeFilename = (value) => {
  const filename = normalizeString(value);

  if (!filename) {
    return "invoice";
  }

  return (
    filename
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 150) || "invoice"
  );
};

const sendError = (res, status, code, message) => {
  return res.status(status).json({
    success: false,
    code,
    message,
  });
};

// ============================================================
// LOAD INVOICE
// ============================================================

const getInvoice = async (ordersCollection, orderId, email) => {
  const cleanOrderId = normalizeString(orderId);
  const cleanEmail = normalizeEmail(email);

  if (!cleanOrderId) {
    const error = new Error("Invalid Order ID");
    error.code = "invoice/invalid-order-id";
    throw error;
  }

  if (!cleanEmail) {
    const error = new Error("Unauthorized");
    error.code = "auth/unauthorized";
    throw error;
  }

  const result = await orderService(ordersCollection, cleanOrderId, cleanEmail);

  if (!result?.invoice) {
    const error = new Error("Order not found");
    error.code = "invoice/not-found";
    throw error;
  }

  return result.invoice;
};

// ============================================================
// CREATE PDF
// ============================================================

const createInvoicePdf = (invoice) => {
  const invoiceNumber = sanitizeFilename(invoice?.invoiceNumber) || "invoice";

  const shopName = normalizeString(invoice?.shop?.name) || "Biscuit Shop";

  return new PDFDocument({
    ...PDF_CONFIG,

    info: {
      Title: invoiceNumber,
      Author: shopName,
      Subject: "Customer Invoice",
      Creator: shopName,
      Producer: "Biscuit Shop Invoice System",
    },
  });
};

// ============================================================
// RENDER PDF
// ============================================================

const renderInvoicePdf = (doc, invoice) => {
  let y = drawCompanyHeader(doc, invoice);

  y = drawCustomerSection(doc, invoice, y);

  y = drawProductTable(doc, invoice, y);

  y = drawSummarySection(doc, invoice, y);

  drawFooterSection(doc, invoice, y);
};

// ============================================================
// SEND PDF
// ============================================================

const sendInvoicePdf = (res, invoice, mode = "inline") => {
  const invoiceNumber = sanitizeFilename(invoice?.invoiceNumber) || "invoice";

  const shopName = normalizeString(invoice?.shop?.name) || "Biscuit Shop";

  const doc = createInvoicePdf(invoice);

  const disposition = mode === "attachment" ? "attachment" : "inline";

  res.setHeader("Content-Type", "application/pdf");

  res.setHeader(
    "Content-Disposition",
    `${disposition}; filename="${invoiceNumber}.pdf"`,
  );

  res.setHeader("Cache-Control", "private, no-store, max-age=0");

  res.setHeader("Pragma", "no-cache");

  res.setHeader("X-Content-Type-Options", "nosniff");

  doc.on("error", (error) => {
    console.error(
      "INVOICE PDF STREAM ERROR:",
      error?.stack || error?.message || error,
    );

    if (!res.headersSent) {
      res.status(500).end();
      return;
    }

    if (!res.writableEnded) {
      res.end();
    }
  });

  doc.pipe(res);

  renderInvoicePdf(doc, invoice);

  doc.end();
};

// ============================================================
// ERROR HANDLER
// ============================================================

const handleInvoiceError = (res, error, fallbackMessage) => {
  console.error(
    "INVOICE ROUTE ERROR:",
    error?.stack || error?.message || error,
  );

  if (res.headersSent) {
    if (!res.writableEnded) {
      res.end();
    }

    return;
  }

  switch (error?.message) {
    case "Invalid Order ID":
      return sendError(
        res,
        400,
        "invoice/invalid-order-id",
        "Invalid order ID.",
      );

    case "Unauthorized":
      return sendError(res, 401, "auth/unauthorized", "Unauthorized access.");

    case "Order not found":
      return sendError(res, 404, "invoice/not-found", "Invoice was not found.");

    default:
      return sendError(res, 500, "invoice/server-error", fallbackMessage);
  }
};

// ============================================================
// ROUTES
// ============================================================

const invoiceRoutes = (ordersCollection, verifyToken) => {
  const router = Router();

  // ==========================================================
  // GET INVOICE PDF - DOWNLOAD
  //
  // GET /invoices/pdf/:id
  // ==========================================================

  router.get("/pdf/:id", verifyToken, async (req, res) => {
    try {
      const orderId = normalizeString(req.params.id);

      const email = normalizeEmail(req.user?.email);

      const invoice = await getInvoice(ordersCollection, orderId, email);

      return sendInvoicePdf(res, invoice, "attachment");
    } catch (error) {
      return handleInvoiceError(res, error, "Failed to generate invoice PDF.");
    }
  });

  // ==========================================================
  // GET INVOICE PDF - VIEW
  //
  // GET /invoices/view/:id
  // ==========================================================

  router.get("/view/:id", verifyToken, async (req, res) => {
    try {
      const orderId = normalizeString(req.params.id);

      const email = normalizeEmail(req.user?.email);

      const invoice = await getInvoice(ordersCollection, orderId, email);

      return sendInvoicePdf(res, invoice, "inline");
    } catch (error) {
      return handleInvoiceError(res, error, "Failed to open invoice.");
    }
  });

  // ==========================================================
  // GET INVOICE DATA
  //
  // GET /invoices/:id
  // ==========================================================

  router.get("/:id", verifyToken, async (req, res) => {
    try {
      const orderId = normalizeString(req.params.id);

      const email = normalizeEmail(req.user?.email);

      const invoice = await getInvoice(ordersCollection, orderId, email);

      return res.status(200).json({
        success: true,
        code: "invoice/loaded",
        message: "Invoice loaded successfully.",
        invoice,
      });
    } catch (error) {
      return handleInvoiceError(res, error, "Failed to load invoice.");
    }
  });

  return router;
};

export default invoiceRoutes;
