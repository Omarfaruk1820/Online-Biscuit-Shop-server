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

  // ============================================================
  // CONSTANTS
  // ============================================================

  const ALLOWED_STATUSES = [
    "all",
    "pending",
    "confirmed",
    "processing",
    "shipped",
    "delivered",
    "cancelled",
  ];

  const ALLOWED_SORTS = ["newest", "oldest", "highest", "lowest"];

  const ADMIN_SORT_OPTIONS = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    highest: { grandTotal: -1 },
    lowest: { grandTotal: 1 },
  };

  const USER_SORT_OPTIONS = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    highest: { grandTotal: -1 },
    lowest: { grandTotal: 1 },
  };

  // ============================================================
  // HELPER: PAGINATION
  // ============================================================

  const getPagination = (query) => {
    let page = Number.parseInt(query.page, 10);

    let limit = Number.parseInt(query.limit, 10);

    if (!Number.isFinite(page) || page < 1) {
      page = 1;
    }

    if (!Number.isFinite(limit) || limit < 1) {
      limit = 10;
    }

    limit = Math.min(limit, 100);

    const skip = (page - 1) * limit;

    return {
      page,
      limit,
      skip,
    };
  };

  // ============================================================
  // ADMIN: GET ALL ORDERS
  // GET /orders
  // ============================================================

  router.get("/", verifyToken, verifyAdmin, async (req, res) => {
    try {
      // --------------------------------------------------------
      // PAGINATION
      // --------------------------------------------------------

      const { page, limit, skip } = getPagination(req.query);

      // --------------------------------------------------------
      // SEARCH
      // --------------------------------------------------------

      const search =
        typeof req.query.search === "string"
          ? req.query.search.trim().slice(0, 100)
          : "";

      // --------------------------------------------------------
      // STATUS
      // --------------------------------------------------------

      const requestedStatus =
        typeof req.query.status === "string"
          ? req.query.status.trim().toLowerCase()
          : "all";

      const status = ALLOWED_STATUSES.includes(requestedStatus)
        ? requestedStatus
        : "all";

      // --------------------------------------------------------
      // SORT
      // --------------------------------------------------------

      const requestedSort =
        typeof req.query.sort === "string"
          ? req.query.sort.trim().toLowerCase()
          : "newest";

      const sort = ALLOWED_SORTS.includes(requestedSort)
        ? requestedSort
        : "newest";

      // --------------------------------------------------------
      // QUERY
      // --------------------------------------------------------

      const query = {};

      if (status !== "all") {
        query.status = status;
      }

      // --------------------------------------------------------
      // SEARCH
      // --------------------------------------------------------

      if (search) {
        const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

        query.$or = [
          {
            email: {
              $regex: escapedSearch,
              $options: "i",
            },
          },
          {
            "customer.name": {
              $regex: escapedSearch,
              $options: "i",
            },
          },
          {
            "customer.phone": {
              $regex: escapedSearch,
              $options: "i",
            },
          },
          {
            orderNumber: {
              $regex: escapedSearch,
              $options: "i",
            },
          },
        ];
      }

      // --------------------------------------------------------
      // PROJECTION
      //
      // Admin order list does not need large arrays.
      // --------------------------------------------------------

      const projection = {
        items: 0,
        timeline: 0,
      };

      // --------------------------------------------------------
      // DATABASE
      // --------------------------------------------------------

      const [orders, totalOrders] = await Promise.all([
        ordersCollection
          .find(query, {
            projection,
          })
          .sort(ADMIN_SORT_OPTIONS[sort])
          .skip(skip)
          .limit(limit)
          .toArray(),

        ordersCollection.countDocuments(query),
      ]);

      // --------------------------------------------------------
      // PAGINATION INFO
      // --------------------------------------------------------

      const totalPages = totalOrders > 0 ? Math.ceil(totalOrders / limit) : 0;

      // --------------------------------------------------------
      // RESPONSE
      // --------------------------------------------------------

      return res.status(200).json({
        success: true,
        message: "Orders fetched successfully.",

        data: orders,

        pagination: {
          page,
          limit,
          totalOrders,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },

        filters: {
          search,
          status,
          sort,
        },
      });
    } catch (error) {
      console.error("GET /orders ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch orders.",
      });
    }
  });

  // ============================================================
  // ADMIN: GET SINGLE ORDER
  // GET /orders/:id
  // ============================================================

  router.get("/:id", verifyToken, verifyAdmin, async (req, res) => {
    try {
      const { id } = req.params;

      // --------------------------------------------------------
      // VALIDATE ID
      // --------------------------------------------------------

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid order ID.",
        });
      }

      const orderId = new ObjectId(id);

      // --------------------------------------------------------
      // FIND ORDER
      // --------------------------------------------------------

      const order = await ordersCollection.findOne({
        _id: orderId,
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found.",
        });
      }

      // --------------------------------------------------------
      // SUMMARY
      // --------------------------------------------------------

      const summary = {
        totalItems: Number(order.totalItems) || 0,

        totalQuantity: Number(order.totalQuantity) || 0,

        subtotal: Number(order.subtotal) || 0,

        totalDiscount: Number(order.totalDiscount) || 0,

        shipping: Number(order.shipping) || 0,

        tax: Number(order.tax) || 0,

        grandTotal: Number(order.grandTotal) || 0,
      };

      // --------------------------------------------------------
      // RESPONSE
      // --------------------------------------------------------

      return res.status(200).json({
        success: true,
        message: "Order fetched successfully.",

        data: {
          ...order,
          summary,
        },
      });
    } catch (error) {
      console.error("GET /orders/:id ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch order.",
      });
    }
  });

  // ============================================================
  // USER: GET MY ORDERS
  // GET /orders/my
  // ============================================================

  router.get("/my", verifyToken, async (req, res) => {
    try {
      // --------------------------------------------------------
      // USER EMAIL
      // --------------------------------------------------------

      const email = req.user?.email?.trim().toLowerCase();

      if (!email) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized.",
        });
      }

      // --------------------------------------------------------
      // PAGINATION
      // --------------------------------------------------------

      const { page, limit, skip } = getPagination(req.query);

      // --------------------------------------------------------
      // STATUS
      // --------------------------------------------------------

      const requestedStatus =
        typeof req.query.status === "string"
          ? req.query.status.trim().toLowerCase()
          : "all";

      const status = ALLOWED_STATUSES.includes(requestedStatus)
        ? requestedStatus
        : "all";

      // --------------------------------------------------------
      // SORT
      // --------------------------------------------------------

      const requestedSort =
        typeof req.query.sort === "string"
          ? req.query.sort.trim().toLowerCase()
          : "newest";

      const sort = ALLOWED_SORTS.includes(requestedSort)
        ? requestedSort
        : "newest";

      // --------------------------------------------------------
      // QUERY
      // --------------------------------------------------------

      const query = {
        email,
      };

      if (status !== "all") {
        query.status = status;
      }

      // --------------------------------------------------------
      // PROJECTION
      //
      // The order list does not need complete items.
      // This makes the response much smaller.
      // --------------------------------------------------------

      const projection = {
        items: 0,
        timeline: 0,
      };

      // --------------------------------------------------------
      // DATABASE
      // --------------------------------------------------------

      const [orders, totalOrders] = await Promise.all([
        ordersCollection
          .find(query, {
            projection,
          })
          .sort(USER_SORT_OPTIONS[sort])
          .skip(skip)
          .limit(limit)
          .toArray(),

        ordersCollection.countDocuments(query),
      ]);

      // --------------------------------------------------------
      // TOTAL PAGES
      // --------------------------------------------------------

      const totalPages = totalOrders > 0 ? Math.ceil(totalOrders / limit) : 0;

      // --------------------------------------------------------
      // RESPONSE
      // --------------------------------------------------------

      return res.status(200).json({
        success: true,
        message: "Your orders fetched successfully.",

        data: orders,

        pagination: {
          page,
          limit,
          totalOrders,
          totalPages,

          hasNextPage: page < totalPages,

          hasPrevPage: page > 1,
        },

        filters: {
          status,
          sort,
        },
      });
    } catch (error) {
      console.error("GET /orders/my ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch your orders.",
      });
    }
  });

  // ============================================================
  // GET MY ORDER DETAILS
  // GET /orders/my/:id
  // ============================================================

  router.get("/my/:id", verifyToken, async (req, res) => {
    try {
      // --------------------------------------------------------
      // Authorization
      // --------------------------------------------------------

      const email = req.user?.email;

      if (!email) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized.",
        });
      }

      // --------------------------------------------------------
      // Validate Order ID
      // --------------------------------------------------------

      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid order ID.",
        });
      }

      const orderId = new ObjectId(id);

      // --------------------------------------------------------
      // Find User's Order
      // --------------------------------------------------------

      const order = await ordersCollection.findOne({
        _id: orderId,
        email,
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found.",
        });
      }

      // --------------------------------------------------------
      // Normalize Items
      // --------------------------------------------------------

      const items = Array.isArray(order.items) ? order.items : [];

      // --------------------------------------------------------
      // Calculate Item Summary
      // --------------------------------------------------------

      const totalItems = items.length;

      const totalQuantity = items.reduce((sum, item) => {
        const quantity = Number(item?.quantity);

        return Number.isInteger(quantity) && quantity > 0
          ? sum + quantity
          : sum;
      }, 0);

      // --------------------------------------------------------
      // Order Financial Summary
      // --------------------------------------------------------

      const subtotal = Number(order.subtotal) || 0;

      const totalDiscount =
        Number(order.totalDiscount ?? order.discount ?? 0) || 0;

      const shipping = Number(order.shipping) || 0;

      const tax = Number(order.tax) || 0;

      const grandTotal = Number(order.grandTotal ?? order.total ?? 0) || 0;

      // --------------------------------------------------------
      // Response
      // --------------------------------------------------------

      return res.status(200).json({
        success: true,
        message: "Order fetched successfully.",

        data: {
          ...order,

          summary: {
            totalItems,
            totalQuantity,
            subtotal,
            totalDiscount,
            shipping,
            tax,
            grandTotal,
          },
        },
      });
    } catch (error) {
      console.error("GET /orders/my/:id ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch order.",
      });
    }
  });

  // ============================================================
  // CREATE ORDER
  // POST /orders
  // ============================================================

  router.post("/", verifyToken, async (req, res) => {
    const session = client.startSession();

    try {
      // --------------------------------------------------------
      // Authorization
      // --------------------------------------------------------

      const email = req.user?.email;

      if (!email) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized.",
        });
      }

      // --------------------------------------------------------
      // Request Body
      // --------------------------------------------------------

      const { customer, paymentMethod = "cash_on_delivery" } = req.body;

      // --------------------------------------------------------
      // Validate Payment Method
      // --------------------------------------------------------

      const allowedPaymentMethods = ["cash_on_delivery", "online"];

      if (!allowedPaymentMethods.includes(paymentMethod)) {
        return res.status(400).json({
          success: false,
          message: "Invalid payment method.",
        });
      }

      // --------------------------------------------------------
      // Validate Customer
      // --------------------------------------------------------

      if (!customer || typeof customer !== "object") {
        return res.status(400).json({
          success: false,
          message: "Customer information is required.",
        });
      }

      const customerSnapshot = {
        name: String(customer.name || "").trim(),
        phone: String(customer.phone || "").trim(),
        address: String(customer.address || "").trim(),
        city: String(customer.city || "").trim(),
        area: String(customer.area || "").trim(),
        note: String(customer.note || "").trim(),
      };

      // --------------------------------------------------------
      // Required Customer Fields
      // --------------------------------------------------------

      if (
        !customerSnapshot.name ||
        !customerSnapshot.phone ||
        !customerSnapshot.address
      ) {
        return res.status(400).json({
          success: false,
          message: "Name, phone and address are required.",
        });
      }

      // --------------------------------------------------------
      // Load Cart
      // --------------------------------------------------------

      const cartItems = await cartsCollection
        .find(
          { email },
          {
            projection: {
              _id: 1,
              productId: 1,
              quantity: 1,
              createdAt: 1,
            },
          },
        )
        .sort({ createdAt: 1 })
        .toArray();

      // --------------------------------------------------------
      // Empty Cart
      // --------------------------------------------------------

      if (!cartItems.length) {
        return res.status(400).json({
          success: false,
          message: "Your cart is empty.",
        });
      }

      // --------------------------------------------------------
      // Duplicate Product Check
      // --------------------------------------------------------

      const productIds = cartItems
        .filter((item) => item.productId)
        .map((item) => item.productId.toString());

      if (new Set(productIds).size !== productIds.length) {
        return res.status(400).json({
          success: false,
          message: "Duplicate products found in cart.",
        });
      }

      // --------------------------------------------------------
      // Build Fresh Order Items
      // --------------------------------------------------------

      const items = await buildOrderItems(cartItems, productsCollection);

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No valid products found in your cart.",
        });
      }

      // --------------------------------------------------------
      // Calculate Fresh Summary
      // --------------------------------------------------------

      const summary = calculateOrderSummary(items);

      const subtotal = Number(summary.subtotal) || 0;

      const totalDiscount =
        Number(summary.totalDiscount ?? summary.discount ?? 0) || 0;

      const shipping = Number(summary.shipping) || 0;

      const tax = Number(summary.tax) || 0;

      const grandTotal = Number(summary.grandTotal ?? summary.total ?? 0) || 0;

      const totalItems = Number(summary.totalItems) || items.length;

      const totalQuantity =
        Number(summary.totalQuantity) ||
        items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);

      // --------------------------------------------------------
      // Generate Unique Order Number
      // --------------------------------------------------------

      const orderNumber = `ORD-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)
        .toUpperCase()}`;

      const now = new Date();

      // --------------------------------------------------------
      // Create Order Document
      // --------------------------------------------------------

      const order = {
        orderNumber,

        email,

        customer: customerSnapshot,

        items,

        // Summary
        totalItems,
        totalQuantity,
        subtotal,
        totalDiscount,
        shipping,
        tax,
        grandTotal,

        // Payment
        currency: "BDT",
        paymentMethod,
        paymentStatus: "unpaid",

        // Order status
        status: "pending",

        // Timeline
        timeline: [
          {
            status: "pending",
            createdAt: now,
          },
        ],

        createdAt: now,
        updatedAt: now,
      };

      let insertedId;

      // --------------------------------------------------------
      // Transaction
      // --------------------------------------------------------

      await session.withTransaction(
        async () => {
          // ----------------------------------------------
          // Insert Order
          // ----------------------------------------------

          const insertResult = await ordersCollection.insertOne(order, {
            session,
          });

          if (!insertResult.acknowledged) {
            throw new Error("Failed to create order.");
          }

          insertedId = insertResult.insertedId;

          // ----------------------------------------------
          // Clear User Cart
          // ----------------------------------------------

          const deleteResult = await cartsCollection.deleteMany(
            { email },
            { session },
          );

          if (!deleteResult.acknowledged) {
            throw new Error("Failed to clear cart.");
          }
        },
        {
          readConcern: {
            level: "snapshot",
          },

          writeConcern: {
            w: "majority",
          },

          readPreference: "primary",

          maxCommitTimeMS: 10000,
        },
      );

      // --------------------------------------------------------
      // Success Response
      // --------------------------------------------------------

      return res.status(201).json({
        success: true,

        message: "Order placed successfully.",

        orderId: insertedId,

        order: {
          _id: insertedId,

          orderNumber,

          email,

          customer: customerSnapshot,

          totalItems,
          totalQuantity,

          subtotal,
          totalDiscount,
          shipping,
          tax,
          grandTotal,

          currency: "BDT",

          paymentMethod,
          paymentStatus: "unpaid",

          status: "pending",

          createdAt: now,
        },
      });
    } catch (error) {
      console.error("CREATE ORDER ERROR:", error);

      // --------------------------------------------------------
      // Duplicate Key
      // --------------------------------------------------------

      if (error?.code === 11000) {
        return res.status(409).json({
          success: false,
          message: "Order could not be created. Please try again.",
        });
      }

      // --------------------------------------------------------
      // Transaction Error
      // --------------------------------------------------------

      if (error?.errorLabels?.includes("TransientTransactionError")) {
        return res.status(409).json({
          success: false,
          message: "Order transaction was interrupted. Please try again.",
        });
      }

      // --------------------------------------------------------
      // General Error
      // --------------------------------------------------------

      return res.status(500).json({
        success: false,
        message: "Failed to place order.",
      });
    } finally {
      // --------------------------------------------------------
      // Close Session
      // --------------------------------------------------------

      await session.endSession();
    }
  });

  // ======================================================
  // CANCEL USER ORDER
  // ======================================================

  router.patch("/cancel/:id", verifyToken, async (req, res) => {
    try {
      const email = req.user?.email;
      const { id } = req.params;

      const reason =
        typeof req.body?.reason === "string"
          ? req.body.reason.trim().slice(0, 500)
          : "";

      if (!email) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized.",
        });
      }

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid order ID.",
        });
      }

      const orderId = new ObjectId(id);

      const order = await ordersCollection.findOne({
        _id: orderId,
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

      const now = new Date();

      const result = await ordersCollection.updateOne(
        {
          _id: orderId,
          email,
          status: "pending",
        },
        {
          $set: {
            status: "cancelled",
            cancellationReason: reason,
            cancelledAt: now,
            updatedAt: now,
          },
          $push: {
            timeline: {
              status: "cancelled",
              createdAt: now,
            },
          },
        },
      );

      if (result.modifiedCount === 0) {
        return res.status(409).json({
          success: false,
          message: "Order could not be cancelled. Please try again.",
        });
      }

      const updatedOrder = await ordersCollection.findOne({
        _id: orderId,
        email,
      });

      return res.status(200).json({
        success: true,
        message: "Order cancelled successfully.",
        data: updatedOrder,
      });
    } catch (error) {
      console.error("CANCEL ORDER ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to cancel order.",
      });
    }
  });

  // ======================================================
  // ADMIN UPDATE ORDER STATUS
  // ======================================================

  router.patch("/status/:id", verifyToken, verifyAdmin, async (req, res) => {
    try {
      const { id } = req.params;

      const status =
        typeof req.body?.status === "string"
          ? req.body.status.trim().toLowerCase()
          : "";

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid order ID.",
        });
      }

      if (!isValidStatus(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid order status.",
        });
      }

      const orderId = new ObjectId(id);

      const order = await ordersCollection.findOne({
        _id: orderId,
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found.",
        });
      }

      const currentStatus = order.status;

      if (currentStatus === status) {
        return res.status(400).json({
          success: false,
          message: `Order is already "${status}".`,
        });
      }

      const allowedTransitions = {
        pending: ["confirmed", "cancelled"],
        confirmed: ["processing", "cancelled"],
        processing: ["shipped"],
        shipped: ["delivered"],
        delivered: [],
        cancelled: [],
      };

      if (!allowedTransitions[currentStatus]?.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Cannot change order status from "${currentStatus}" to "${status}".`,
        });
      }

      const now = new Date();

      const updateFields = {
        status,
        updatedAt: now,
      };

      switch (status) {
        case "confirmed":
          updateFields.confirmedAt = now;
          break;

        case "processing":
          updateFields.processingAt = now;
          break;

        case "shipped":
          updateFields.shippedAt = now;
          break;

        case "delivered":
          updateFields.deliveredAt = now;
          break;

        case "cancelled":
          updateFields.cancelledAt = now;
          break;

        default:
          break;
      }

      const result = await ordersCollection.updateOne(
        {
          _id: orderId,
          status: currentStatus,
        },
        {
          $set: updateFields,
          $push: {
            timeline: {
              status,
              createdAt: now,
            },
          },
        },
      );

      if (result.modifiedCount === 0) {
        return res.status(409).json({
          success: false,
          message:
            "Order status could not be updated. Please refresh and try again.",
        });
      }

      const updatedOrder = await ordersCollection.findOne({
        _id: orderId,
      });

      return res.status(200).json({
        success: true,
        message: "Order status updated successfully.",
        data: updatedOrder,
      });
    } catch (error) {
      console.error("UPDATE ORDER STATUS ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to update order status.",
      });
    }
  });

  // ======================================================
  // ADMIN ORDER STATISTICS
  // ======================================================

  router.get("/stats", verifyToken, verifyAdmin, async (req, res) => {
    try {
      const [stats] = await ordersCollection
        .aggregate([
          {
            $group: {
              _id: null,

              totalOrders: {
                $sum: 1,
              },

              pendingOrders: {
                $sum: {
                  $cond: [{ $eq: ["$status", "pending"] }, 1, 0],
                },
              },

              confirmedOrders: {
                $sum: {
                  $cond: [{ $eq: ["$status", "confirmed"] }, 1, 0],
                },
              },

              processingOrders: {
                $sum: {
                  $cond: [{ $eq: ["$status", "processing"] }, 1, 0],
                },
              },

              shippedOrders: {
                $sum: {
                  $cond: [{ $eq: ["$status", "shipped"] }, 1, 0],
                },
              },

              deliveredOrders: {
                $sum: {
                  $cond: [{ $eq: ["$status", "delivered"] }, 1, 0],
                },
              },

              cancelledOrders: {
                $sum: {
                  $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0],
                },
              },

              totalRevenue: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ["$paymentStatus", "paid"] },
                        { $eq: ["$status", "delivered"] },
                      ],
                    },
                    {
                      $ifNull: ["$grandTotal", 0],
                    },
                    0,
                  ],
                },
              },

              totalProductsSold: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ["$paymentStatus", "paid"] },
                        { $eq: ["$status", "delivered"] },
                      ],
                    },
                    {
                      $ifNull: ["$totalQuantity", 0],
                    },
                    0,
                  ],
                },
              },

              revenueOrderCount: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ["$paymentStatus", "paid"] },
                        { $eq: ["$status", "delivered"] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
            },
          },
        ])
        .toArray();

      const data = stats || {
        totalOrders: 0,
        pendingOrders: 0,
        confirmedOrders: 0,
        processingOrders: 0,
        shippedOrders: 0,
        deliveredOrders: 0,
        cancelledOrders: 0,
        totalRevenue: 0,
        totalProductsSold: 0,
        revenueOrderCount: 0,
      };

      const totalOrders = Number(data.totalOrders || 0);

      const totalRevenue = Number(Number(data.totalRevenue || 0).toFixed(2));

      const totalProductsSold = Number(data.totalProductsSold || 0);

      const revenueOrderCount = Number(data.revenueOrderCount || 0);

      const averageOrderValue =
        revenueOrderCount > 0
          ? Number((totalRevenue / revenueOrderCount).toFixed(2))
          : 0;

      return res.status(200).json({
        success: true,
        data: {
          totalOrders,
          totalRevenue,
          totalProductsSold,
          averageOrderValue,

          orders: {
            pending: Number(data.pendingOrders || 0),
            confirmed: Number(data.confirmedOrders || 0),
            processing: Number(data.processingOrders || 0),
            shipped: Number(data.shippedOrders || 0),
            delivered: Number(data.deliveredOrders || 0),
            cancelled: Number(data.cancelledOrders || 0),
          },
        },
      });
    } catch (error) {
      console.error("GET ORDER STATS ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to load dashboard statistics.",
      });
    }
  });

  return router;
};

export default ordersRoutes;
