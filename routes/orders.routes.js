// routes/orders.routes.js

import { Router } from "express";
import { ObjectId } from "mongodb";
import { randomUUID } from "crypto";

import calculateOrderSummary from "../utils/orderSummary.js";

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

  const ORDER_STATUSES = [
    "pending",
    "confirmed",
    "processing",
    "shipped",
    "delivered",
    "cancelled",
  ];

  const ALLOWED_SORTS = ["newest", "oldest", "highest", "lowest"];

  const SORT_OPTIONS = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    highest: { grandTotal: -1 },
    lowest: { grandTotal: 1 },
  };

  const MAX_PAGE_LIMIT = 100;
  const MAX_CART_QUANTITY = 99;

  // ============================================================
  // HELPERS
  // ============================================================

  const normalizeEmail = (email = "") => {
    return typeof email === "string" ? email.trim().toLowerCase() : "";
  };

  const normalizeString = (value = "", maxLength = 200) => {
    if (typeof value !== "string") {
      return "";
    }

    return value.trim().slice(0, maxLength);
  };

  const isValidObjectId = (id) => {
    return typeof id === "string" && ObjectId.isValid(id);
  };

  const round = (value) => {
    const number = Number(value);

    return Number.isFinite(number) ? Number(number.toFixed(2)) : 0;
  };

  const getPagination = (query = {}) => {
    let page = Number.parseInt(query.page, 10);
    let limit = Number.parseInt(query.limit, 10);

    if (!Number.isInteger(page) || page < 1) {
      page = 1;
    }

    if (!Number.isInteger(limit) || limit < 1) {
      limit = 10;
    }

    limit = Math.min(limit, MAX_PAGE_LIMIT);

    const skip = (page - 1) * limit;

    return {
      page,
      limit,
      skip,
    };
  };

  const getStatus = (value) => {
    const status =
      typeof value === "string" ? value.trim().toLowerCase() : "all";

    return ALLOWED_STATUSES.includes(status) ? status : "all";
  };

  const getSort = (value) => {
    const sort =
      typeof value === "string" ? value.trim().toLowerCase() : "newest";

    return ALLOWED_SORTS.includes(sort) ? sort : "newest";
  };

  const createOrderNumber = () => {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();

    return `ORD-${timestamp}-${random}`;
  };

  const createUniqueOrderNumber = async (session) => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const orderNumber = createOrderNumber();

      const existingOrder = await ordersCollection.findOne(
        { orderNumber },
        {
          projection: {
            _id: 1,
          },
          session,
        },
      );

      if (!existingOrder) {
        return orderNumber;
      }
    }

    throw new Error("Failed to generate unique order number.");
  };

  const createSearchQuery = (search) => {
    if (!search) {
      return {};
    }

    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    return {
      $or: [
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
      ],
    };
  };

  const normalizeCustomer = (customer = {}) => {
    return {
      name: normalizeString(customer.name, 100),
      phone: normalizeString(customer.phone, 30),
      address: normalizeString(customer.address, 500),
      city: normalizeString(customer.city, 100),
      area: normalizeString(customer.area, 100),
      note: normalizeString(customer.note, 500),
    };
  };

  const validateCustomer = (customer) => {
    if (!customer || typeof customer !== "object") {
      return "Customer information is required.";
    }

    if (!customer.name) {
      return "Customer name is required.";
    }

    if (customer.name.length < 2) {
      return "Customer name must be at least 2 characters.";
    }

    if (!customer.phone) {
      return "Customer phone number is required.";
    }

    if (customer.phone.length < 7) {
      return "Please provide a valid phone number.";
    }

    if (!customer.address) {
      return "Customer address is required.";
    }

    if (customer.address.length < 5) {
      return "Customer address is too short.";
    }

    return null;
  };

  const normalizePaymentMethod = (value) => {
    const paymentMethod =
      typeof value === "string" ? value.trim().toLowerCase() : "";

    return paymentMethod === "cash_on_delivery" ? paymentMethod : "";
  };

  const createOrderSummary = (order) => {
    return {
      totalItems: Number.isFinite(Number(order?.totalItems))
        ? Number(order.totalItems)
        : 0,

      totalQuantity: Number.isFinite(Number(order?.totalQuantity))
        ? Number(order.totalQuantity)
        : 0,

      subtotal: round(order?.subtotal),

      totalDiscount: round(order?.totalDiscount ?? order?.discount),

      shipping: round(order?.shipping),

      tax: round(order?.tax),

      grandTotal: round(order?.grandTotal ?? order?.total),
    };
  };

  const normalizeOrderItems = (items = []) => {
    if (!Array.isArray(items)) {
      return [];
    }

    return items.map((item) => ({
      productId: item.productId,

      sku: normalizeString(item.sku, 100),

      name: normalizeString(item.name, 200),

      image: normalizeString(item.image, 1000),

      brand: normalizeString(item.brand, 100),

      category: normalizeString(item.category, 100),

      weight: item.weight ?? null,

      quantity: Number(item.quantity) || 0,

      price: round(item.price),

      discount: round(item.discount),

      finalPrice: round(item.finalPrice),

      subtotal: round(item.subtotal),

      discountAmount: round(item.discountAmount),
    }));
  };

  // ============================================================
  // POST /orders
  // CREATE ORDER
  // ============================================================

  router.post("/", verifyToken, async (req, res) => {
    const session = client.startSession();

    try {
      const email = normalizeEmail(req.user?.email);

      if (!email) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized.",
        });
      }

      const customer = normalizeCustomer(req.body?.customer);

      const customerError = validateCustomer(customer);

      if (customerError) {
        return res.status(400).json({
          success: false,
          message: customerError,
        });
      }

      const paymentMethod = normalizePaymentMethod(req.body?.paymentMethod);

      if (!paymentMethod) {
        return res.status(400).json({
          success: false,
          message: "Invalid payment method.",
        });
      }

      let createdOrder = null;

      await session.withTransaction(async () => {
        // ======================================================
        // LOAD CART INSIDE TRANSACTION
        // ======================================================

        const cartItems = await cartsCollection
          .find(
            { email },
            {
              projection: {
                _id: 1,
                productId: 1,
                quantity: 1,
              },
              session,
            },
          )
          .sort({ createdAt: 1 })
          .toArray();

        if (cartItems.length === 0) {
          const error = new Error("Your cart is empty.");

          error.statusCode = 400;

          throw error;
        }

        // ======================================================
        // VALIDATE CART ITEMS
        // ======================================================

        const productIds = [];
        const cartProductMap = new Map();

        for (const cartItem of cartItems) {
          if (!cartItem.productId) {
            const error = new Error("A cart item has a missing product ID.");

            error.statusCode = 400;

            throw error;
          }

          let productObjectId;

          try {
            productObjectId =
              cartItem.productId instanceof ObjectId
                ? cartItem.productId
                : new ObjectId(String(cartItem.productId));
          } catch {
            const error = new Error(
              "A cart item contains an invalid product ID.",
            );

            error.statusCode = 400;

            throw error;
          }

          const productKey = productObjectId.toString();

          if (cartProductMap.has(productKey)) {
            const error = new Error("Duplicate product found in cart.");

            error.statusCode = 400;

            throw error;
          }

          const quantity = Number(cartItem.quantity);

          if (
            !Number.isInteger(quantity) ||
            quantity < 1 ||
            quantity > MAX_CART_QUANTITY
          ) {
            const error = new Error("Invalid cart quantity.");

            error.statusCode = 400;

            throw error;
          }

          cartProductMap.set(productKey, {
            ...cartItem,
            productId: productObjectId,
            quantity,
          });

          productIds.push(productObjectId);
        }

        // ======================================================
        // LOAD LATEST PRODUCTS
        // ======================================================

        const products = await productsCollection
          .find(
            {
              _id: {
                $in: productIds,
              },
            },
            {
              projection: {
                sku: 1,
                name: 1,
                image: 1,
                brand: 1,
                category: 1,
                weight: 1,
                price: 1,
                discount: 1,
                stock: 1,
              },
              session,
            },
          )
          .toArray();

        const productMap = new Map(
          products.map((product) => [product._id.toString(), product]),
        );

        // ======================================================
        // BUILD FRESH ORDER ITEMS
        // NEVER TRUST CART PRICE
        // ======================================================

        const orderItems = [];

        for (const productId of productIds) {
          const productKey = productId.toString();

          const cartItem = cartProductMap.get(productKey);

          const product = productMap.get(productKey);

          if (!product) {
            const error = new Error(
              "One or more products in your cart no longer exist.",
            );

            error.statusCode = 400;

            throw error;
          }

          const productName =
            typeof product.name === "string" && product.name.trim()
              ? product.name.trim()
              : "Unknown Product";

          const price = Number(product.price);

          if (!Number.isFinite(price) || price < 0) {
            const error = new Error(`Invalid price for "${productName}".`);

            error.statusCode = 400;

            throw error;
          }

          const rawDiscount = Number(product.discount ?? 0);

          if (
            !Number.isFinite(rawDiscount) ||
            rawDiscount < 0 ||
            rawDiscount > 100
          ) {
            const error = new Error(`Invalid discount for "${productName}".`);

            error.statusCode = 400;

            throw error;
          }

          const discount = rawDiscount;

          const stock = Number(product.stock);

          if (!Number.isInteger(stock) || stock < 0) {
            const error = new Error(`Invalid stock for "${productName}".`);

            error.statusCode = 400;

            throw error;
          }

          if (stock === 0) {
            const error = new Error(`"${productName}" is out of stock.`);

            error.statusCode = 400;

            throw error;
          }

          if (cartItem.quantity > stock) {
            const error = new Error(
              `Only ${stock} item(s) available for "${productName}".`,
            );

            error.statusCode = 400;

            throw error;
          }

          const finalPrice = round(price - (price * discount) / 100);

          const subtotal = round(finalPrice * cartItem.quantity);

          const discountAmount = round(
            (price - finalPrice) * cartItem.quantity,
          );

          orderItems.push({
            productId: product._id,

            sku: typeof product.sku === "string" ? product.sku.trim() : "",

            name: productName,

            image:
              typeof product.image === "string" ? product.image.trim() : "",

            brand:
              typeof product.brand === "string" ? product.brand.trim() : "",

            category:
              typeof product.category === "string"
                ? product.category.trim().toLowerCase()
                : "",

            weight: product.weight ?? null,

            quantity: cartItem.quantity,

            price: round(price),

            discount: round(discount),

            finalPrice,

            subtotal,

            discountAmount,
          });
        }

        // ======================================================
        // ORDER SUMMARY
        // ======================================================

        const calculatedSummary = calculateOrderSummary(orderItems);

        const summary = {
          totalItems: Number(calculatedSummary.totalItems) || 0,

          totalQuantity: Number(calculatedSummary.totalQuantity) || 0,

          subtotal: Number(calculatedSummary.subtotal) || 0,

          totalDiscount: Number(calculatedSummary.totalDiscount) || 0,

          shipping: Number(calculatedSummary.shipping) || 0,

          tax: Number(calculatedSummary.tax) || 0,

          grandTotal: Number(calculatedSummary.grandTotal) || 0,
        };

        // ======================================================
        // CREATE UNIQUE ORDER NUMBER
        // ======================================================

        const orderNumber = await createUniqueOrderNumber(session);

        // ======================================================
        // UPDATE PRODUCT STOCK
        //
        // Atomic condition:
        // stock >= requested quantity
        // ======================================================

        for (const item of orderItems) {
          const stockResult = await productsCollection.updateOne(
            {
              _id: item.productId,
              stock: {
                $gte: item.quantity,
              },
            },
            {
              $inc: {
                stock: -item.quantity,
              },
              $set: {
                updatedAt: new Date(),
              },
            },
            {
              session,
            },
          );

          if (!stockResult.acknowledged || stockResult.modifiedCount !== 1) {
            const error = new Error(
              `"${item.name}" is no longer available in the requested quantity.`,
            );

            error.statusCode = 409;

            throw error;
          }
        }

        // ======================================================
        // CREATE ORDER DOCUMENT
        // ======================================================

        const now = new Date();

        const orderDocument = {
          orderNumber,

          email,

          customer,

          items: normalizeOrderItems(orderItems),

          totalItems: summary.totalItems,

          totalQuantity: summary.totalQuantity,

          subtotal: summary.subtotal,

          totalDiscount: summary.totalDiscount,

          shipping: summary.shipping,

          tax: summary.tax,

          grandTotal: summary.grandTotal,

          paymentMethod,

          paymentStatus: "pending",

          status: "pending",

          timeline: [
            {
              status: "pending",
              note: "Order placed successfully.",
              createdAt: now,
            },
          ],

          createdAt: now,

          updatedAt: now,
        };

        const insertResult = await ordersCollection.insertOne(orderDocument, {
          session,
        });

        if (!insertResult.acknowledged || !insertResult.insertedId) {
          const error = new Error("Failed to create order.");

          error.statusCode = 500;

          throw error;
        }

        // ======================================================
        // CLEAR USER CART
        // ======================================================

        const deleteResult = await cartsCollection.deleteMany(
          { email },
          { session },
        );

        if (!deleteResult.acknowledged) {
          const error = new Error("Failed to clear cart after creating order.");

          error.statusCode = 500;

          throw error;
        }

        createdOrder = {
          _id: insertResult.insertedId,
          orderNumber,
          ...orderDocument,
        };
      });

      // ========================================================
      // SUCCESS
      // ========================================================

      return res.status(201).json({
        success: true,
        message: "Order placed successfully.",
        data: {
          _id: createdOrder._id,
          orderNumber: createdOrder.orderNumber,

          status: createdOrder.status,

          paymentMethod: createdOrder.paymentMethod,

          paymentStatus: createdOrder.paymentStatus,

          customer: createdOrder.customer,

          items: createdOrder.items,

          totalItems: createdOrder.totalItems,

          totalQuantity: createdOrder.totalQuantity,

          subtotal: createdOrder.subtotal,

          totalDiscount: createdOrder.totalDiscount,

          shipping: createdOrder.shipping,

          tax: createdOrder.tax,

          grandTotal: createdOrder.grandTotal,

          createdAt: createdOrder.createdAt,
        },
      });
    } catch (error) {
      console.error("POST /orders ERROR:", error);

      const statusCode =
        Number.isInteger(error?.statusCode) &&
        error.statusCode >= 400 &&
        error.statusCode < 600
          ? error.statusCode
          : error?.code === 11000
            ? 409
            : 500;

      return res.status(statusCode).json({
        success: false,
        message:
          error?.code === 11000
            ? "Order could not be created because of a duplicate order number."
            : error?.message || "Failed to place order.",
      });
    } finally {
      await session.endSession();
    }
  });

  // ============================================================
  // ADMIN: GET ALL ORDERS
  // GET /orders
  // ============================================================

  router.get("/", verifyToken, verifyAdmin, async (req, res) => {
    try {
      const { page, limit, skip } = getPagination(req.query);

      const search =
        typeof req.query.search === "string"
          ? req.query.search.trim().slice(0, 100)
          : "";

      const status = getStatus(req.query.status);

      const sort = getSort(req.query.sort);

      const query = {};

      if (status !== "all") {
        query.status = status;
      }

      Object.assign(query, createSearchQuery(search));

      const projection = {
        items: 0,
        timeline: 0,
      };

      const [orders, totalOrders] = await Promise.all([
        ordersCollection
          .find(query, {
            projection,
          })
          .sort(SORT_OPTIONS[sort])
          .skip(skip)
          .limit(limit)
          .toArray(),

        ordersCollection.countDocuments(query),
      ]);

      const totalPages = totalOrders > 0 ? Math.ceil(totalOrders / limit) : 0;

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
  // ADMIN: GET ORDER DETAILS
  // GET /orders/:id
  // ============================================================

  router.get("/:id", verifyToken, verifyAdmin, async (req, res) => {
    try {
      const { id } = req.params;

      if (!isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid order ID.",
        });
      }

      const order = await ordersCollection.findOne({
        _id: new ObjectId(id),
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found.",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Order fetched successfully.",

        data: {
          ...order,
          summary: createOrderSummary(order),
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
      const email = normalizeEmail(req.user?.email);

      if (!email) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized.",
        });
      }

      const { page, limit, skip } = getPagination(req.query);

      const status = getStatus(req.query.status);

      const sort = getSort(req.query.sort);

      const query = {
        email,
      };

      if (status !== "all") {
        query.status = status;
      }

      const projection = {
        items: 0,
        timeline: 0,
      };

      const [orders, totalOrders] = await Promise.all([
        ordersCollection
          .find(query, {
            projection,
          })
          .sort(SORT_OPTIONS[sort])
          .skip(skip)
          .limit(limit)
          .toArray(),

        ordersCollection.countDocuments(query),
      ]);

      const totalPages = totalOrders > 0 ? Math.ceil(totalOrders / limit) : 0;

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
  // USER: GET MY ORDER DETAILS
  // GET /orders/my/:id
  // ============================================================

  router.get("/my/:id", verifyToken, async (req, res) => {
    try {
      const email = normalizeEmail(req.user?.email);

      if (!email) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized.",
        });
      }

      const { id } = req.params;

      if (!isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid order ID.",
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

      return res.status(200).json({
        success: true,
        message: "Order fetched successfully.",

        data: {
          ...order,
          summary: createOrderSummary(order),
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
  // USER: CANCEL MY ORDER
  // PATCH /orders/cancel/:id
  // ============================================================

  router.patch("/cancel/:id", verifyToken, async (req, res) => {
    const session = client.startSession();

    try {
      const email = normalizeEmail(req.user?.email);

      if (!email) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized.",
        });
      }

      const { id } = req.params;

      if (!isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid order ID.",
        });
      }

      const orderId = new ObjectId(id);

      let cancelledOrder = null;

      await session.withTransaction(async () => {
        const order = await ordersCollection.findOne(
          {
            _id: orderId,
            email,
          },
          {
            session,
          },
        );

        if (!order) {
          const error = new Error("Order not found.");

          error.statusCode = 404;

          throw error;
        }

        if (order.status === "cancelled") {
          const error = new Error("Order is already cancelled.");

          error.statusCode = 400;

          throw error;
        }

        if (["shipped", "delivered"].includes(order.status)) {
          const error = new Error("This order can no longer be cancelled.");

          error.statusCode = 400;

          throw error;
        }

        const items = Array.isArray(order.items) ? order.items : [];

        // ==================================================
        // RESTORE STOCK
        // ==================================================

        for (const item of items) {
          const quantity = Number(item?.quantity);

          if (!Number.isInteger(quantity) || quantity < 1) {
            continue;
          }

          if (!item?.productId || !ObjectId.isValid(item.productId)) {
            continue;
          }

          await productsCollection.updateOne(
            {
              _id:
                item.productId instanceof ObjectId
                  ? item.productId
                  : new ObjectId(String(item.productId)),
            },
            {
              $inc: {
                stock: quantity,
              },
              $set: {
                updatedAt: new Date(),
              },
            },
            {
              session,
            },
          );
        }

        const now = new Date();

        const result = await ordersCollection.updateOne(
          {
            _id: orderId,
            email,
            status: {
              $in: ["pending", "confirmed", "processing"],
            },
          },
          {
            $set: {
              status: "cancelled",

              updatedAt: now,
            },

            $push: {
              timeline: {
                status: "cancelled",
                note: "Order cancelled by customer.",
                createdAt: now,
              },
            },
          },
          {
            session,
          },
        );

        if (result.modifiedCount !== 1) {
          const error = new Error("Order could not be cancelled.");

          error.statusCode = 409;

          throw error;
        }

        cancelledOrder = {
          ...order,
          status: "cancelled",
          updatedAt: now,
        };
      });

      return res.status(200).json({
        success: true,
        message: "Order cancelled successfully.",

        data: {
          _id: cancelledOrder._id,

          orderNumber: cancelledOrder.orderNumber,

          status: cancelledOrder.status,

          updatedAt: cancelledOrder.updatedAt,
        },
      });
    } catch (error) {
      console.error("PATCH /orders/cancel/:id ERROR:", error);

      const statusCode = Number.isInteger(error?.statusCode)
        ? error.statusCode
        : 500;

      return res.status(statusCode).json({
        success: false,
        message: error?.message || "Failed to cancel order.",
      });
    } finally {
      await session.endSession();
    }
  });

  // ============================================================
  // ADMIN: ORDER STATISTICS
  // GET /orders/stats
  // ============================================================

  router.get("/stats", verifyToken, verifyAdmin, async (req, res) => {
    try {
      const [
        totalOrders,
        pendingOrders,
        confirmedOrders,
        processingOrders,
        shippedOrders,
        deliveredOrders,
        cancelledOrders,
        revenueResult,
      ] = await Promise.all([
        ordersCollection.countDocuments({}),

        ordersCollection.countDocuments({
          status: "pending",
        }),

        ordersCollection.countDocuments({
          status: "confirmed",
        }),

        ordersCollection.countDocuments({
          status: "processing",
        }),

        ordersCollection.countDocuments({
          status: "shipped",
        }),

        ordersCollection.countDocuments({
          status: "delivered",
        }),

        ordersCollection.countDocuments({
          status: "cancelled",
        }),

        ordersCollection
          .aggregate([
            {
              $match: {
                status: {
                  $ne: "cancelled",
                },
              },
            },

            {
              $group: {
                _id: null,
                totalRevenue: {
                  $sum: {
                    $ifNull: ["$grandTotal", 0],
                  },
                },
              },
            },
          ])
          .toArray(),
      ]);

      const totalRevenue = round(revenueResult?.[0]?.totalRevenue);

      return res.status(200).json({
        success: true,
        message: "Order statistics fetched successfully.",

        data: {
          totalOrders,
          pendingOrders,
          confirmedOrders,
          processingOrders,
          shippedOrders,
          deliveredOrders,
          cancelledOrders,
          totalRevenue,
        },
      });
    } catch (error) {
      console.error("GET /orders/stats ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch order statistics.",
      });
    }
  });

  // ============================================================
  // RETURN ROUTER
  // ============================================================

  return router;
};

export default ordersRoutes;
