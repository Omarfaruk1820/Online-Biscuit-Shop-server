import { Router } from "express";
import PDFDocument from "pdfkit";

import orderService from "../utils/orderService.js";

import drawCompanyHeader from "../utils/pdf/companyHeader.js";
import drawCustomerSection from "../utils/pdf/customerSection.js";
import drawProductTable from "../utils/pdf/productTable.js";
import drawSummarySection from "../utils/pdf/summarySection.js";
import drawFooterSection from "../utils/pdf/footerSection.js";

const invoiceRoutes = (ordersCollection, verifyToken) => {
  const router = Router();
  router.get("/invoice/:id", verifyToken, async (req, res) => {
    try {
      const { id } = req.params;
      const email = req.user?.email;

      if (!email) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized access.",
        });
      }

      const data = await orderService(ordersCollection, id, email);

      if (!data) {
        return res.status(404).json({
          success: false,
          message: "Order not found.",
        });
      }

      return res.status(200).json({
        success: true,
        invoice: data.invoice,
      });
    } catch (error) {
      console.error("GET INVOICE ERROR:", error);

      switch (error.message) {
        case "Invalid Order ID":
          return res.status(400).json({
            success: false,
            message: error.message,
          });

        case "Unauthorized":
          return res.status(401).json({
            success: false,
            message: error.message,
          });

        default:
          return res.status(500).json({
            success: false,
            message: "Failed to load invoice.",
          });
      }
    }
  });
  router.get("/invoice/pdf/:id", verifyToken, async (req, res) => {
    try {
      const { id } = req.params;
      const email = req.user?.email;

      if (!email) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized access.",
        });
      }

      const data = await orderService(ordersCollection, id, email);

      if (!data) {
        return res.status(404).json({
          success: false,
          message: "Order not found.",
        });
      }

      const { invoice } = data;

      const doc = new PDFDocument({
        size: "A4",
        margin: 50,
        info: {
          Title: invoice.invoiceNumber,
          Author: invoice.shop.name,
          Subject: "Customer Invoice",
          Creator: invoice.shop.name,
        },
      });

      res.setHeader("Content-Type", "application/pdf");

      res.setHeader(
        "Content-Disposition",
        `attachment; filename=${invoice.invoiceNumber}.pdf`,
      );

      doc.pipe(res);

      let y = drawCompanyHeader(doc, invoice);

      y = drawCustomerSection(doc, invoice, y);

      y = drawProductTable(doc, invoice, y);

      y = drawSummarySection(doc, invoice, y);

      drawFooterSection(doc, invoice, y);

      doc.end();
    } catch (error) {
      console.error("DOWNLOAD PDF ERROR:", error);

      switch (error.message) {
        case "Invalid Order ID":
          return res.status(400).json({
            success: false,
            message: error.message,
          });

        case "Unauthorized":
          return res.status(401).json({
            success: false,
            message: error.message,
          });

        default:
          return res.status(500).json({
            success: false,
            message: "Failed to download invoice.",
          });
      }
    }
  });
  router.get("/invoice/view/:id", verifyToken, async (req, res) => {
    try {
      const { id } = req.params;
      const email = req.user?.email;

      if (!email) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized access.",
        });
      }

      // Build invoice
      const data = await orderService(ordersCollection, id, email);

      if (!data) {
        return res.status(404).json({
          success: false,
          message: "Order not found.",
        });
      }

      const { invoice } = data;

      // Create PDF
      const doc = new PDFDocument({
        size: "A4",
        margin: 50,
        info: {
          Title: invoice.invoiceNumber,
          Author: invoice.shop.name,
          Subject: "Invoice Preview",
          Creator: invoice.shop.name,
        },
      });

      // ===============================
      // Response Headers
      // ===============================

      res.setHeader("Content-Type", "application/pdf");

      // Open inside browser
      res.setHeader(
        "Content-Disposition",
        `inline; filename=${invoice.invoiceNumber}.pdf`,
      );

      // Stream PDF
      doc.pipe(res);

      // Company
      let y = drawCompanyHeader(doc, invoice);

      // Customer
      y = drawCustomerSection(doc, invoice, y);

      // Products
      y = drawProductTable(doc, invoice, y);

      // Summary
      y = drawSummarySection(doc, invoice, y);

      // Footer
      drawFooterSection(doc, invoice, y);

      // Finish
      doc.end();
    } catch (error) {
      console.error("VIEW PDF ERROR:", error);

      switch (error.message) {
        case "Invalid Order ID":
          return res.status(400).json({
            success: false,
            message: error.message,
          });

        case "Unauthorized":
          return res.status(401).json({
            success: false,
            message: error.message,
          });

        default:
          return res.status(500).json({
            success: false,
            message: "Failed to open invoice.",
          });
      }
    }
  });

  return router;
};

export default invoiceRoutes;
