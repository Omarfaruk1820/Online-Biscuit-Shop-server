import { Router } from "express";
import { ObjectId } from "mongodb";
import PDFDocument from "pdfkit";

// Invoice Builder
import buildInvoice from "../utils/buildInvoice.js";
import orderService from "../utils/orderService.js";
// PDF Sections
import drawCompanyHeader from "../utils/pdf/companyHeader.js";
import drawCustomerSection from "../utils/pdf/customerSection.js";
import drawProductTable from "../utils/pdf/productTable.js";
import drawSummarySection from "../utils/pdf/summarySection.js";
import drawFooterSection from "../utils/pdf/footerSection.js";

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

      page = Number(page) || 1;
      limit = Number(limit) || 10;

      page = Math.max(page, 1);
      limit = Math.min(limit, 50);

      const skip = (page - 1) * limit;

      const keyword = search.trim();

      const query = {};

      if (status !== "all") {
        query.status = status;
      }

      if (keyword) {
        query.$or = [
          {
            email: {
              $regex: keyword,
              $options: "i",
            },
          },
          {
            "customer.name": {
              $regex: keyword,
              $options: "i",
            },
          },
          {
            "customer.phone": {
              $regex: keyword,
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

      res.json({
        success: true,
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        data: orders,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: "Failed to fetch orders",
      });
    }
  });

  router.get("/my", verifyToken, async (req, res) => {
    try {
      const email = req.user.email;

      const status = req.query.status || "all";

      const query = {
        email,
      };

      if (status !== "all") {
        query.status = status;
      }

      const orders = await ordersCollection
        .find(query)
        .sort({
          createdAt: -1,
        })
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
  router.get("/invoice/:id", verifyToken, async (req, res) => {
     console.log("===== INVOICE ROUTE HIT =====");
    try {
      const { id } = req.params;
      const email = req.user.email;

      console.log("PARAM ID:", req.params.id);
      console.log("LOGIN EMAIL:", req.user.email);

      const data = await orderService(ordersCollection, id, email);

      if (!data) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      res.json({
        success: true,
        invoice: data.invoice,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: "Failed to load invoice",
      });
    }
  });
  router.get("/invoice/pdf/:id", verifyToken, async (req, res) => {
    try {
      const { id } = req.params;
      const email = req.user.email;

      const data = await orderService(ordersCollection, id, email);

      if (!data) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      const { invoice } = data;

      const doc = new PDFDocument({
        size: "A4",
        margin: 50,
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

      drawFooterSection(doc, invoice);

      doc.end();
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: "Failed to generate invoice PDF",
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
          message: "Customer information is required.",
        });
      }

      const cartItems = await cartsCollection.find({ email }).toArray();

      if (!cartItems.length) {
        return res.status(400).json({
          success: false,
          message: "Cart is empty.",
        });
      }

      const items = await buildOrderItems(cartItems, productsCollection);

      if (!items.length) {
        return res.status(400).json({
          success: false,
          message: "No valid products found.",
        });
      }

      const total = calculateOrderTotal(items);

      await session.withTransaction(async () => {
        await ordersCollection.insertOne(
          {
            email,
            customer,
            items,
            total,
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
        message: "Order placed successfully.",
      });
    } catch (error) {
      console.error("CREATE ORDER:", error);

      res.status(500).json({
        success: false,
        message: "Failed to place order.",
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
          message: "Invalid order id.",
        });
      }

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

      if (order.status !== "pending") {
        return res.status(400).json({
          success: false,
          message: "Only pending orders can be cancelled.",
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
        message: "Order cancelled successfully.",
      });
    } catch (error) {
      console.error("CANCEL ORDER:", error);

      res.status(500).json({
        success: false,
        message: "Failed to cancel order.",
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
          message: "Invalid order id.",
        });
      }

      if (!isValidStatus(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid status.",
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
          message: "Order not found.",
        });
      }

      res.json({
        success: true,
        message: "Order status updated successfully.",
      });
    } catch (error) {
      console.error("UPDATE STATUS:", error);

      res.status(500).json({
        success: false,
        message: "Failed to update order status.",
      });
    }
  });

  return router;
};

export default ordersRoutes;
