import { Router } from "express";
import { ObjectId } from "mongodb";

import buildOrderItems from "../utils/buildOrderItems.js";
import calculateOrderTotal from "../utils/calculateOrderTotal.js";
import isValidStatus from "../utils/isValidStatus.js";
import calculateOrderSummary from "../utils/calculateOrderSummary.js";

const ordersRoutes = (
  client,
  ordersCollection,
  cartsCollection,
  productsCollection,
  verifyToken,
  verifyAdmin,
) => {
  const router = Router();

  // ==========================================================
  // Part 2
  // GET /orders
  // Admin Order List
  // ==========================================================
  // ==========================================================

 router.get("/", verifyToken, verifyAdmin, async (req, res) => {
  try {
    // -------------------------------------
    // Query Parameters
    // -------------------------------------

    let {
      page = "1",
      limit = "10",
      search = "",
      status = "all",
      sort = "newest",
    } = req.query;

    page = Math.max(parseInt(page, 10) || 1, 1);
    limit = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);

    const skip = (page - 1) * limit;

    search = String(search).trim().slice(0, 100);

    // -------------------------------------
    // Validate Filters
    // -------------------------------------

    const allowedStatuses = [
      "all",
      "pending",
      "confirmed",
      "processing",
      "shipped",
      "delivered",
      "cancelled",
    ];

    status = allowedStatuses.includes(status)
      ? status
      : "all";

    const allowedSorts = [
      "newest",
      "oldest",
      "highest",
      "lowest",
    ];

    sort = allowedSorts.includes(sort)
      ? sort
      : "newest";

    // -------------------------------------
    // Mongo Query
    // -------------------------------------

    const query = {};

    if (status !== "all") {
      query.status = status;
    }

    if (search) {
      const escapedSearch = search.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );

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

    // -------------------------------------
    // Sort Options
    // -------------------------------------

    const sortOptions = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      highest: { grandTotal: -1 },
      lowest: { grandTotal: 1 },
    };

    // -------------------------------------
    // Database Query
    // -------------------------------------

    const [orders, totalOrders] = await Promise.all([
      ordersCollection
        .find(query)
        .project({
          items: 0,
          timeline: 0,
        })
        .sort(sortOptions[sort])
        .skip(skip)
        .limit(limit)
        .toArray(),

      ordersCollection.countDocuments(query),
    ]);

    const totalPages = Math.ceil(totalOrders / limit);

    // -------------------------------------
    // Response
    // -------------------------------------

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
    console.error("GET ORDERS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch orders.",
    });
  }
});

  // ==========================================================
  // Part 3
  // GET /orders/:id
  // Admin Single Order
  // ==========================================================
  // ==========================================================

 router.get("/:id", verifyToken, verifyAdmin, async (req, res) => {
  try {
    // --------------------------------------------------
    // Validate Order ID
    // --------------------------------------------------

    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID.",
      });
    }

    // --------------------------------------------------
    // Find Order
    // --------------------------------------------------

    const order = await ordersCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found.",
      });
    }

    // --------------------------------------------------
    // Response
    // --------------------------------------------------

    return res.status(200).json({
      success: true,
      message: "Order fetched successfully.",

      data: {
        ...order,

        summary: {
          totalItems: Number(order.totalItems || 0),
          totalQuantity: Number(order.totalQuantity || 0),

          subtotal: Number(order.subtotal || 0),

          totalDiscount: Number(order.totalDiscount || 0),

          shipping: Number(order.shipping || 0),

          tax: Number(order.tax || 0),

          grandTotal: Number(order.grandTotal || 0),
        },
      },
    });
  } catch (error) {
    console.error("GET ORDER ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch order.",
    });
  }
});

  // ==========================================================
  // Part 4
  // GET /orders/my
  // Logged-in User Orders
  // ==========================================================
  // ==========================================================


  router.get("/my", verifyToken, async (req, res) => {
    try {
      // --------------------------------------------------
      // User
      // --------------------------------------------------

      const email = req.user.email;

      // --------------------------------------------------
      // Query Parameters
      // --------------------------------------------------

      let {
        page = "1",
        limit = "10",
        status = "all",
        sort = "newest",
      } = req.query;

      page = Math.max(parseInt(page, 10) || 1, 1);
      limit = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);

      const skip = (page - 1) * limit;

      // --------------------------------------------------
      // Validate Filters
      // --------------------------------------------------

      const allowedStatuses = [
        "all",
        "pending",
        "confirmed",
        "processing",
        "shipped",
        "delivered",
        "cancelled",
      ];

      if (!allowedStatuses.includes(status)) {
        status = "all";
      }

      const allowedSorts = ["newest", "oldest", "highest", "lowest"];

      if (!allowedSorts.includes(sort)) {
        sort = "newest";
      }

      // --------------------------------------------------
      // Query
      // --------------------------------------------------

      const query = {
        email,
      };

      if (status !== "all") {
        query.status = status;
      }

      // --------------------------------------------------
      // Sorting
      // --------------------------------------------------

      const sortOptions = {
        newest: { createdAt: -1 },
        oldest: { createdAt: 1 },
        highest: { total: -1 },
        lowest: { total: 1 },
      };

      // --------------------------------------------------
      // Database
      // --------------------------------------------------

      const [orders, totalOrders] = await Promise.all([
        ordersCollection
          .find(query)
          .sort(sortOptions[sort])
          .skip(skip)
          .limit(limit)
          .toArray(),

        ordersCollection.countDocuments(query),
      ]);

      // --------------------------------------------------
      // Response Data
      // --------------------------------------------------

      const data = orders.map((order) => {
        const items = Array.isArray(order.items) ? order.items : [];

        const totalItems = items.length;

        const totalQuantity = items.reduce((sum, item) => {
          const quantity = Number(item?.quantity);

          return Number.isInteger(quantity) ? sum + quantity : sum;
        }, 0);

        return {
          ...order,

          summary: {
            totalItems,
            totalQuantity,
            totalAmount: Number(order.total) || 0,
          },
        };
      });

      // --------------------------------------------------
      // Response
      // --------------------------------------------------

      return res.status(200).json({
        success: true,

        data,

        pagination: {
          page,
          limit,
          totalOrders,
          totalPages: Math.ceil(totalOrders / limit),
        },

        filters: {
          status,
          sort,
        },
      });
    } catch (error) {
      console.error("GET MY ORDERS ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch your orders.",
      });
    }
  });

  // ==========================================================
  // Part 5
  // GET /orders/my/:id
  // Logged-in User Single Order
  // ==========================================================

  router.get("/my/:id", verifyToken, async (req, res) => {
    try {
      // --------------------------------------------------
      // User & Order ID
      // --------------------------------------------------

      const email = req.user.email;
      const { id } = req.params;

      // --------------------------------------------------
      // Validate Order ID
      // --------------------------------------------------

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid order ID.",
        });
      }

      const orderId = new ObjectId(id);

      // --------------------------------------------------
      // Find User Order
      // --------------------------------------------------

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

      // --------------------------------------------------
      // Calculate Summary
      // --------------------------------------------------

      const items = Array.isArray(order.items) ? order.items : [];

      const totalItems = items.length;

      const totalQuantity = items.reduce((sum, item) => {
        const quantity = Number(item?.quantity);

        return Number.isInteger(quantity) ? sum + quantity : sum;
      }, 0);

      const summary = {
        totalItems,
        totalQuantity,
        totalAmount: Number(order.total) || 0,
      };

      // --------------------------------------------------
      // Response
      // --------------------------------------------------

      return res.status(200).json({
        success: true,

        data: {
          ...order,
          summary,
        },
      });
    } catch (error) {
      console.error("GET MY ORDER ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch order.",
      });
    }
  });

  // ==========================================================
  // Part 6
  // POST /orders
  // Create New Order
  // ==========================================================

router.post("/", verifyToken, async (req, res) => {
  const session = client.startSession();

  try {
    // ----------------------------------
    // Authorization
    // ----------------------------------

    const email = req.user?.email;

    if (!email) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized.",
      });
    }

    // ----------------------------------
    // Request Body
    // ----------------------------------

    const {
      customer,
      paymentMethod = "cash_on_delivery",
    } = req.body;

    // ----------------------------------
    // Validate Payment Method
    // ----------------------------------

    const allowedMethods = [
      "cash_on_delivery",
      "online",
    ];

    if (!allowedMethods.includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment method.",
      });
    }

    // ----------------------------------
    // Validate Customer
    // ----------------------------------

    if (!customer) {
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

    // ----------------------------------
    // Load Cart
    // ----------------------------------

    const cartItems = await cartsCollection.find({ email }).toArray();

    if (cartItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Your cart is empty.",
      });
    }

    // ----------------------------------
    // Build Order Items
    // ----------------------------------

    const items = await buildOrderItems(
      cartItems,
      productsCollection
    );

    if (items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid products found.",
      });
    }

    // ----------------------------------
    // Calculate Summary
    // ----------------------------------

    const summary = calculateOrderSummary(items);

    const now = new Date();

    // ----------------------------------
    // Order Document
    // ----------------------------------

    const order = {
      orderNumber: `ORD-${Date.now()}`,

      email,

      customer: customerSnapshot,

      items,

      ...summary,

      currency: "BDT",

      paymentMethod,

      paymentStatus: "unpaid",

      status: "pending",

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

    // ----------------------------------
    // Transaction
    // ----------------------------------

    await session.withTransaction(async () => {
      const result = await ordersCollection.insertOne(order, {
        session,
      });

      insertedId = result.insertedId;

      await cartsCollection.deleteMany(
        { email },
        { session }
      );
    });

    // ----------------------------------
    // Success Response
    // ----------------------------------

    return res.status(201).json({
      success: true,
      message: "Order placed successfully.",

      orderId: insertedId,

      order: {
        _id: insertedId,

        orderNumber: order.orderNumber,

        ...summary,

        paymentMethod: order.paymentMethod,

        paymentStatus: order.paymentStatus,

        status: order.status,

        createdAt: order.createdAt,
      },
    });
  } catch (error) {
    console.error("CREATE ORDER ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to place order.",
    });
  } finally {
    await session.endSession();
  }
});

  // ==========================================================
  // Part 7
  // PATCH /orders/cancel/:id
  // User Cancel Order
  // ==========================================================

  router.patch("/cancel/:id", verifyToken, async (req, res) => {
    try {
      // --------------------------------------------------
      // User & Order ID
      // --------------------------------------------------

      const email = req.user.email;
      const { id } = req.params;
      const { reason = "" } = req.body;

      // --------------------------------------------------
      // Validate Order ID
      // --------------------------------------------------

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid order ID.",
        });
      }

      const orderId = new ObjectId(id);

      // --------------------------------------------------
      // Find User Order
      // --------------------------------------------------

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

      // --------------------------------------------------
      // Validate Order Status
      // --------------------------------------------------

      if (order.status !== "pending") {
        return res.status(400).json({
          success: false,
          message: `Only pending orders can be cancelled.`,
        });
      }

      const now = new Date();

      // --------------------------------------------------
      // Cancel Order
      // --------------------------------------------------

      const updateResult = await ordersCollection.updateOne(
        {
          _id: orderId,
          email,
          status: "pending",
        },
        {
          $set: {
            status: "cancelled",
            updatedAt: now,
            cancelledAt: now,
            cancellationReason: String(reason).trim(),
          },

          $push: {
            timeline: {
              status: "cancelled",
              createdAt: now,
            },
          },
        },
      );

      if (updateResult.modifiedCount === 0) {
        return res.status(409).json({
          success: false,
          message: "Order could not be cancelled.",
        });
      }

      // --------------------------------------------------
      // Return Updated Order
      // --------------------------------------------------

      const updatedOrder = await ordersCollection.findOne({
        _id: orderId,
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

  // ==========================================================
  // Part 8
  // PATCH /orders/status/:id
  // Admin Update Status
  // ==========================================================

  router.patch("/status/:id", verifyToken, verifyAdmin, async (req, res) => {
    try {
      // --------------------------------------------------
      // Parameters
      // --------------------------------------------------

      const { id } = req.params;
      const { status } = req.body;

      // --------------------------------------------------
      // Validate Order ID
      // --------------------------------------------------

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

      // --------------------------------------------------
      // Find Order
      // --------------------------------------------------

      const order = await ordersCollection.findOne({
        _id: orderId,
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found.",
        });
      }

      // --------------------------------------------------
      // Prevent Duplicate Update
      // --------------------------------------------------

      if (order.status === status) {
        return res.status(400).json({
          success: false,
          message: `Order is already "${status}".`,
        });
      }

      // --------------------------------------------------
      // Validate Status Transition
      // --------------------------------------------------

      const allowedTransitions = {
        pending: ["confirmed", "cancelled"],
        confirmed: ["processing", "cancelled"],
        processing: ["shipped"],
        shipped: ["delivered"],
        delivered: [],
        cancelled: [],
      };

      if (!allowedTransitions[order.status]?.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Cannot change order status from "${order.status}" to "${status}".`,
        });
      }

      const now = new Date();

      // --------------------------------------------------
      // Update Fields
      // --------------------------------------------------

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
      }

      // --------------------------------------------------
      // Update Order
      // --------------------------------------------------

      const result = await ordersCollection.updateOne(
        {
          _id: orderId,
          status: order.status,
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
          message: "Order status could not be updated.",
        });
      }

      // --------------------------------------------------
      // Return Updated Order
      // --------------------------------------------------

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
  // ==========================================================
  // Part 9
  // GET /orders/stats
  // Dashboard Statistics
  // ==========================================================

  router.get("/stats", verifyToken, verifyAdmin, async (req, res) => {
    try {
      // --------------------------------------------------
      // Dashboard Statistics
      // --------------------------------------------------

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
                    "$total",
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
                    "$totalQuantity",
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
      };

      const averageOrderValue =
        data.totalOrders > 0
          ? Number((data.totalRevenue / data.totalOrders).toFixed(2))
          : 0;

      // --------------------------------------------------
      // Response
      // --------------------------------------------------

      return res.status(200).json({
        success: true,

        data: {
          totalOrders: data.totalOrders,

          totalRevenue: Number(data.totalRevenue || 0),

          totalProductsSold: Number(data.totalProductsSold || 0),

          averageOrderValue,

          orders: {
            pending: data.pendingOrders,
            confirmed: data.confirmedOrders,
            processing: data.processingOrders,
            shipped: data.shippedOrders,
            delivered: data.deliveredOrders,
            cancelled: data.cancelledOrders,
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
