import { Router } from "express";
import { ObjectId } from "mongodb";

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

  /**
   * ==========================================================
   * GET MY ORDERS
   * GET /orders/my
   * ==========================================================
   */

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

  /**
   * ==========================================================
   * PLACE ORDER
   * POST /orders
   * ==========================================================
   */

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

  /**
   * ==========================================================
   * CANCEL ORDER
   * PATCH /orders/cancel/:id
   * ==========================================================
   */

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

  /**
   * ==========================================================
   * GET INVOICE
   * GET /orders/invoice/:id
   * ==========================================================
   */

  router.get("/invoice/:id", verifyToken, async (req, res) => {
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

      res.json({
        success: true,
        invoice: {
          invoiceId: order._id,
          customer: order.customer,
          items: order.items,
          total: order.total,
          status: order.status,
          paymentStatus: order.paymentStatus,
          date: order.createdAt,
        },
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: "Failed to generate invoice",
      });
    }
  });

  /**
   * ==========================================================
   * UPDATE ORDER STATUS (ADMIN)
   * PATCH /orders/status/:id
   * ==========================================================
   */

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
