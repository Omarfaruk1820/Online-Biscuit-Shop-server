import { Router } from "express";
import { ObjectId } from "mongodb";
import { randomUUID } from "crypto";

import verifyToken from "../middleware/verifyToken.js";
import verifyUser from "../middleware/verifyUser.js";
import verifyAdmin from "../middleware/verifyAdmin.js";
import calculateOrderSummary from "../utils/orderSummary.js";

const ordersRoutes = (
  client,
  ordersCollection,
  cartsCollection,
  productsCollection,
  usersCollection,
) => {
  const router = Router();

  // ============================================================
  // CONSTANTS
  // ============================================================

  const ORDER_STATUSES = [
    "pending",
    "confirmed",
    "processing",
    "shipped",
    "delivered",
    "cancelled",
  ];

  const PAYMENT_STATUSES = ["pending", "paid", "failed", "refunded", "unpaid"];

  const ALLOWED_STATUSES = ["all", ...ORDER_STATUSES];

  const SORT_OPTIONS = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    highest: { grandTotal: -1 },
    lowest: { grandTotal: 1 },
  };

  const STATUS_TRANSITIONS = {
    pending: ["confirmed", "cancelled"],
    confirmed: ["processing", "cancelled"],
    processing: ["shipped", "cancelled"],
    shipped: ["delivered"],
    delivered: [],
    cancelled: [],
  };

  const STATUS_NOTES = {
    pending: "Order placed successfully.",
    confirmed: "Order has been confirmed.",
    processing: "Order is being prepared.",
    shipped: "Order has been shipped.",
    delivered: "Order has been delivered.",
    cancelled: "Order has been cancelled.",
  };

  const CUSTOMER_CANCELLABLE_STATUSES = ["pending", "confirmed", "processing"];

  const MAX_PAGE_LIMIT = 100;
  const MAX_CART_QUANTITY = 99;

  const PRODUCT_PROJECTION = {
    sku: 1,
    name: 1,
    image: 1,
    brand: 1,
    category: 1,
    weight: 1,
    price: 1,
    discount: 1,
    stock: 1,
  };

  // ============================================================
  // HELPERS
  // ============================================================

  const normalizeString = (value = "", maxLength = 200) => {
    if (typeof value !== "string") {
      return "";
    }

    return value.trim().slice(0, maxLength);
  };

  const normalizeEmail = (email = "") => {
    return normalizeString(email, 200).toLowerCase();
  };

  const round = (value) => {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return 0;
    }

    return Number(number.toFixed(2));
  };

  const toObjectId = (value) => {
    if (value instanceof ObjectId) {
      return value;
    }

    if (!value) {
      return null;
    }

    const stringValue = String(value);

    if (!ObjectId.isValid(stringValue)) {
      return null;
    }

    return new ObjectId(stringValue);
  };

  const isValidObjectId = (value) => {
    return Boolean(toObjectId(value));
  };

  const createRouteError = (message, statusCode = 500) => {
    const error = new Error(message);
    error.statusCode = statusCode;

    return error;
  };

  const getErrorStatusCode = (error) => {
    if (
      Number.isInteger(error?.statusCode) &&
      error.statusCode >= 400 &&
      error.statusCode <= 599
    ) {
      return error.statusCode;
    }

    if (error?.code === 11000) {
      return 409;
    }

    return 500;
  };

  // ============================================================
  // PAGINATION
  // ============================================================

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

    return {
      page,
      limit,
      skip: (page - 1) * limit,
    };
  };

  // ============================================================
  // FILTERS
  // ============================================================

  const getStatus = (value) => {
    const status =
      typeof value === "string" ? value.trim().toLowerCase() : "all";

    return ALLOWED_STATUSES.includes(status) ? status : "all";
  };

  const getSort = (value) => {
    const sort =
      typeof value === "string" ? value.trim().toLowerCase() : "newest";

    return Object.prototype.hasOwnProperty.call(SORT_OPTIONS, sort)
      ? sort
      : "newest";
  };

  const getPaymentStatus = (value) => {
    const status = typeof value === "string" ? value.trim().toLowerCase() : "";

    return PAYMENT_STATUSES.includes(status) ? status : "";
  };

  // Support both frontend "cod" and database "cash_on_delivery".
  const getPaymentMethod = (value) => {
    const method = typeof value === "string" ? value.trim().toLowerCase() : "";

    if (method === "cod") {
      return "cash_on_delivery";
    }

    if (method === "cash_on_delivery") {
      return "cash_on_delivery";
    }

    return "";
  };

  // ============================================================
  // ORDER NUMBER
  // ============================================================

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
          projection: { _id: 1 },
          session,
        },
      );

      if (!existingOrder) {
        return orderNumber;
      }
    }

    throw createRouteError("Failed to generate a unique order number.", 500);
  };

  // ============================================================
  // CUSTOMER
  // ============================================================

  const normalizeCustomer = (customer = {}) => {
    return {
      name: normalizeString(customer.name, 100),
      phone: normalizeString(customer.phone, 30),
      address: normalizeString(customer.address, 500),
      city: normalizeString(customer.city, 100),
      area: normalizeString(customer.area, 100),
      note: normalizeString(customer.note, 300),
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

    if (!customer.city) {
      return "Customer city is required.";
    }

    if (!customer.area) {
      return "Customer area is required.";
    }

    return null;
  };

  // ============================================================
  // PRODUCT
  // ============================================================

  const getProductName = (product) => {
    return product?.name?.trim() || "Unknown Product";
  };

  const calculateProductPricing = (product) => {
    const productName = getProductName(product);

    const price = Number(product?.price);

    if (!Number.isFinite(price) || price < 0) {
      throw createRouteError(`Invalid price for "${productName}".`, 400);
    }

    const discount = Number(product?.discount ?? 0);

    if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
      throw createRouteError(`Invalid discount for "${productName}".`, 400);
    }

    const safePrice = round(price);
    const safeDiscount = round(discount);

    const finalPrice = round(safePrice - (safePrice * safeDiscount) / 100);

    return {
      price: safePrice,
      discount: safeDiscount,
      finalPrice,
    };
  };

  const validateProductStock = (product, quantity) => {
    const productName = getProductName(product);
    const stock = Number(product?.stock);

    if (!Number.isInteger(stock) || stock < 0) {
      throw createRouteError(`Invalid stock for "${productName}".`, 400);
    }

    if (stock === 0) {
      throw createRouteError(`"${productName}" is out of stock.`, 400);
    }

    if (quantity > stock) {
      throw createRouteError(
        `Only ${stock} item(s) available for "${productName}".`,
        409,
      );
    }
  };

  // ============================================================
  // ORDER ITEMS
  // ============================================================

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
  // SEARCH
  // ============================================================

  const createSearchQuery = (search) => {
    if (!search) {
      return {};
    }

    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    return {
      $or: [
        {
          email: {
            $regex: escaped,
            $options: "i",
          },
        },
        {
          orderNumber: {
            $regex: escaped,
            $options: "i",
          },
        },
        {
          "customer.name": {
            $regex: escaped,
            $options: "i",
          },
        },
        {
          "customer.phone": {
            $regex: escaped,
            $options: "i",
          },
        },
      ],
    };
  };

  // ============================================================
  // STATUS
  // ============================================================

  const getTransitionError = (currentStatus, nextStatus) => {
    const allowedStatuses = STATUS_TRANSITIONS[currentStatus] || [];

    if (!allowedStatuses.includes(nextStatus)) {
      return `Order cannot move from "${currentStatus}" to "${nextStatus}".`;
    }

    return null;
  };

  // ============================================================
  // CREATE ORDER
  // POST /orders
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

      const paymentMethod = getPaymentMethod(req.body?.paymentMethod);

      if (!paymentMethod) {
        return res.status(400).json({
          success: false,
          message: "Invalid payment method.",
        });
      }

      let createdOrder = null;

      await session.withTransaction(async () => {
        // ------------------------------------------------------
        // LOAD CART
        // ------------------------------------------------------

        const cartItems = await cartsCollection
          .find(
            { email },
            {
              projection: {
                productId: 1,
                quantity: 1,
                createdAt: 1,
              },
              session,
            },
          )
          .sort({ createdAt: 1 })
          .toArray();

        if (!cartItems.length) {
          throw createRouteError("Your cart is empty.", 400);
        }

        if (cartItems.length > MAX_CART_QUANTITY) {
          throw createRouteError("Cart contains too many products.", 400);
        }

        // ------------------------------------------------------
        // CART DATA
        // ------------------------------------------------------

        const productIds = [];
        const cartMap = new Map();

        for (const cartItem of cartItems) {
          const productId = toObjectId(cartItem.productId);

          if (!productId) {
            throw createRouteError(
              "A cart item contains an invalid product ID.",
              400,
            );
          }

          const key = productId.toString();

          if (cartMap.has(key)) {
            throw createRouteError("Duplicate product found in cart.", 400);
          }

          const quantity = Number(cartItem.quantity);

          if (
            !Number.isInteger(quantity) ||
            quantity < 1 ||
            quantity > MAX_CART_QUANTITY
          ) {
            throw createRouteError("Invalid cart quantity.", 400);
          }

          cartMap.set(key, {
            productId,
            quantity,
          });

          productIds.push(productId);
        }

        // ------------------------------------------------------
        // LOAD PRODUCTS
        // ------------------------------------------------------

        const products = await productsCollection
          .find(
            {
              _id: {
                $in: productIds,
              },
            },
            {
              projection: PRODUCT_PROJECTION,
              session,
            },
          )
          .toArray();

        const productMap = new Map(
          products.map((product) => [product._id.toString(), product]),
        );

        // ------------------------------------------------------
        // BUILD ORDER ITEMS
        // ------------------------------------------------------

        const orderItems = [];

        for (const productId of productIds) {
          const key = productId.toString();

          const cartItem = cartMap.get(key);
          const product = productMap.get(key);

          if (!product) {
            throw createRouteError(
              "One or more products in your cart no longer exist.",
              400,
            );
          }

          validateProductStock(product, cartItem.quantity);

          const pricing = calculateProductPricing(product);

          const subtotal = round(pricing.finalPrice * cartItem.quantity);

          const discountAmount = round(
            (pricing.price - pricing.finalPrice) * cartItem.quantity,
          );

          orderItems.push({
            productId: product._id,
            sku: normalizeString(product.sku, 100),
            name: getProductName(product),
            image: normalizeString(product.image, 1000),
            brand: normalizeString(product.brand, 100),
            category: normalizeString(product.category, 100),
            weight: product.weight ?? null,
            quantity: cartItem.quantity,
            price: pricing.price,
            discount: pricing.discount,
            finalPrice: pricing.finalPrice,
            subtotal,
            discountAmount,
          });
        }

        // ------------------------------------------------------
        // SUMMARY
        // ------------------------------------------------------

        const calculatedSummary = calculateOrderSummary(orderItems);

        const summary = {
          totalItems: Number(calculatedSummary.totalItems) || 0,

          totalQuantity: Number(calculatedSummary.totalQuantity) || 0,

          subtotal: round(calculatedSummary.subtotal),

          totalDiscount: round(calculatedSummary.totalDiscount),

          shipping: round(calculatedSummary.shipping),

          tax: round(calculatedSummary.tax),

          grandTotal: round(calculatedSummary.grandTotal),
        };

        // ------------------------------------------------------
        // ORDER NUMBER
        // ------------------------------------------------------

        const orderNumber = await createUniqueOrderNumber(session);

        // ------------------------------------------------------
        // DECREASE STOCK
        // ------------------------------------------------------

        for (const item of orderItems) {
          const result = await productsCollection.updateOne(
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

          if (!result.acknowledged || result.modifiedCount !== 1) {
            throw createRouteError(
              `"${item.name}" is no longer available in the requested quantity.`,
              409,
            );
          }
        }

        // ------------------------------------------------------
        // CREATE ORDER
        // ------------------------------------------------------

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
              note: STATUS_NOTES.pending,
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
          throw createRouteError("Failed to create order.", 500);
        }

        // ------------------------------------------------------
        // CLEAR CART
        // ------------------------------------------------------

        const deleteResult = await cartsCollection.deleteMany(
          { email },
          { session },
        );

        if (!deleteResult.acknowledged) {
          throw createRouteError("Failed to clear cart.", 500);
        }

        createdOrder = {
          _id: insertResult.insertedId,
          ...orderDocument,
        };
      });

      return res.status(201).json({
        success: true,
        message: "Order placed successfully.",
        data: createdOrder,
      });
    } catch (error) {
      console.error("POST /orders ERROR:", error?.stack || error);

      const statusCode = getErrorStatusCode(error);

      return res.status(statusCode).json({
        success: false,
        message:
          error?.code === 11000
            ? "Duplicate order number."
            : error?.message || "Failed to place order.",
      });
    } finally {
      await session.endSession();
    }
  });

  // ============================================================
  // ADMIN - GET ALL ORDERS
  // GET /orders
  // ============================================================

router.get(
  "/",
  verifyToken,
  verifyUser(usersCollection),
  verifyAdmin,
  async (req, res) => {
    try {
      const { page, limit, skip } = getPagination(req.query);

      const search =
        typeof req.query.search === "string"
          ? req.query.search.trim().slice(0, 100)
          : "";

      const status = getStatus(req.query.status);
      const sort = getSort(req.query.sort);
      const paymentStatus = getPaymentStatus(req.query.paymentStatus);

      const query = {};

      if (status !== "all") {
        query.status = status;
      }

      if (paymentStatus) {
        query.paymentStatus = paymentStatus;
      }

      const searchQuery = createSearchQuery(search);

      if (Object.keys(searchQuery).length > 0) {
        Object.assign(query, searchQuery);
      }

      const projection = {
        items: 0,
        timeline: 0,
      };

      const [orders, totalOrders] = await Promise.all([
        ordersCollection
          .find(query, { projection })
          .sort(SORT_OPTIONS[sort])
          .skip(skip)
          .limit(limit)
          .toArray(),

        ordersCollection.countDocuments(query),
      ]);

      const totalPages =
        totalOrders > 0 ? Math.ceil(totalOrders / limit) : 0;

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
          paymentStatus,
        },
      });
    } catch (error) {
      console.error(
        "GET /orders ERROR:",
        error?.stack || error?.message || error,
      );

      return res.status(500).json({
        success: false,
        message: "Failed to fetch orders.",
      });
    }
  },
);

  // ============================================================
  // ADMIN - ORDER STATS
  // GET /orders/stats
  // ============================================================

router.get(
  "/stats",
  verifyToken,
  verifyUser(usersCollection),
  verifyAdmin,
  async (req, res) => {
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

      const totalRevenue = round(
        revenueResult?.[0]?.totalRevenue,
      );

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
      console.error(
        "GET /orders/stats ERROR:",
        error?.stack || error?.message || error,
      );

      return res.status(500).json({
        success: false,
        message: "Failed to fetch order statistics.",
      });
    }
  },
);

  // ============================================================
  // ADMIN - GET SINGLE ORDER
  // GET /orders/:id
  // ============================================================

  router.get(
    "/:id",
    verifyToken,
    verifyUser(usersCollection),
    verifyAdmin,
    async (req, res) => {
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

            summary: {
              totalItems: Number(order.totalItems) || 0,

              totalQuantity: Number(order.totalQuantity) || 0,

              subtotal: round(order.subtotal),

              totalDiscount: round(order.totalDiscount),

              shipping: round(order.shipping),
              tax: round(order.tax),

              grandTotal: round(order.grandTotal),
            },
          },
        });
      } catch (error) {
        console.error("GET /orders/:id ERROR:", error?.stack || error);

        return res.status(500).json({
          success: false,
          message: "Failed to fetch order.",
        });
      }
    },
  );

  // ============================================================
  // ADMIN - UPDATE ORDER STATUS
  // PATCH /orders/status/:id
  // ============================================================

  router.patch(
    "/status/:id",
    verifyToken,
    verifyUser(usersCollection),
    verifyAdmin,
    async (req, res) => {
      const session = client.startSession();

      try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid order ID.",
          });
        }

        const nextStatus =
          typeof req.body?.status === "string"
            ? req.body.status.trim().toLowerCase()
            : "";

        if (!ORDER_STATUSES.includes(nextStatus)) {
          return res.status(400).json({
            success: false,
            message: "Invalid order status.",
          });
        }

        const customNote = normalizeString(req.body?.note, 300);

        const orderId = new ObjectId(id);

        let updatedOrder = null;

        await session.withTransaction(async () => {
          const order = await ordersCollection.findOne(
            { _id: orderId },
            { session },
          );

          if (!order) {
            throw createRouteError("Order not found.", 404);
          }

          if (order.status === nextStatus) {
            throw createRouteError(`Order is already "${nextStatus}".`, 400);
          }

          const transitionError = getTransitionError(order.status, nextStatus);

          if (transitionError) {
            throw createRouteError(transitionError, 400);
          }

          const now = new Date();

          const timelineEntry = {
            status: nextStatus,
            note: customNote || STATUS_NOTES[nextStatus],
            createdAt: now,
          };

          const updateResult = await ordersCollection.updateOne(
            {
              _id: orderId,
              status: order.status,
            },
            {
              $set: {
                status: nextStatus,
                updatedAt: now,
              },

              $push: {
                timeline: timelineEntry,
              },
            },
            { session },
          );

          if (updateResult.modifiedCount !== 1) {
            throw createRouteError("Order status could not be updated.", 409);
          }

          updatedOrder = {
            ...order,
            status: nextStatus,
            updatedAt: now,

            timeline: [
              ...(Array.isArray(order.timeline) ? order.timeline : []),

              timelineEntry,
            ],
          };
        });

        return res.status(200).json({
          success: true,
          message: "Order status updated successfully.",

          data: {
            _id: updatedOrder._id,
            orderNumber: updatedOrder.orderNumber,
            status: updatedOrder.status,
            paymentStatus: updatedOrder.paymentStatus,
            timeline: updatedOrder.timeline,
            updatedAt: updatedOrder.updatedAt,
          },
        });
      } catch (error) {
        console.error("PATCH /orders/status/:id ERROR:", error?.stack || error);

        return res.status(getErrorStatusCode(error)).json({
          success: false,
          message: error?.message || "Failed to update order status.",
        });
      } finally {
        await session.endSession();
      }
    },
  );

  // ============================================================
  // ADMIN - UPDATE PAYMENT STATUS
  // PATCH /orders/payment-status/:id
  // ============================================================

  router.patch(
    "/payment-status/:id",
    verifyToken,
    verifyUser(usersCollection),
    verifyAdmin,
    async (req, res) => {
      try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid order ID.",
          });
        }

        const paymentStatus = getPaymentStatus(req.body?.paymentStatus);

        if (!paymentStatus) {
          return res.status(400).json({
            success: false,
            message: "Invalid payment status.",
          });
        }

        const orderId = new ObjectId(id);

        const now = new Date();

        const updateResult = await ordersCollection.updateOne(
          { _id: orderId },
          {
            $set: {
              paymentStatus,
              updatedAt: now,
            },
          },
        );

        if (updateResult.matchedCount !== 1) {
          return res.status(404).json({
            success: false,
            message: "Order not found.",
          });
        }

        const updatedOrder = await ordersCollection.findOne(
          { _id: orderId },
          {
            projection: {
              orderNumber: 1,
              paymentStatus: 1,
              status: 1,
              updatedAt: 1,
            },
          },
        );

        return res.status(200).json({
          success: true,
          message: "Payment status updated successfully.",
          data: updatedOrder,
        });
      } catch (error) {
        console.error(
          "PATCH /orders/payment-status/:id ERROR:",
          error?.stack || error,
        );

        return res.status(500).json({
          success: false,
          message: "Failed to update payment status.",
        });
      }
    },
  );

  // ============================================================
  // CUSTOMER - GET MY ORDERS
  // GET /orders/my
  // ============================================================

  router.get(
    "/my",
    verifyToken,
    verifyUser(usersCollection),
    async (req, res) => {
      try {
        const email = normalizeEmail(req.dbUser?.email || req.user?.email);

        if (!email) {
          return res.status(401).json({
            success: false,
            message: "Unauthorized.",
          });
        }

        const { page, limit, skip } = getPagination(req.query);

        const status = getStatus(req.query.status);

        const sort = getSort(req.query.sort);

        const query = { email };

        if (status !== "all") {
          query.status = status;
        }

        const projection = {
          items: 0,
          timeline: 0,
        };

        const [orders, totalOrders] = await Promise.all([
          ordersCollection
            .find(query, { projection })
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
        console.error("GET /orders/my ERROR:", error?.stack || error);

        return res.status(500).json({
          success: false,
          message: "Failed to fetch your orders.",
        });
      }
    },
  );

  // ============================================================
  // CUSTOMER - GET MY SINGLE ORDER
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

          summary: {
            totalItems: Number(order.totalItems) || 0,

            totalQuantity: Number(order.totalQuantity) || 0,

            subtotal: round(order.subtotal),

            totalDiscount: round(order.totalDiscount),

            shipping: round(order.shipping),
            tax: round(order.tax),

            grandTotal: round(order.grandTotal),
          },
        },
      });
    } catch (error) {
      console.error("GET /orders/my/:id ERROR:", error?.stack || error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch order.",
      });
    }
  });

  // ============================================================
  // CUSTOMER - CANCEL ORDER
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
          { session },
        );

        if (!order) {
          throw createRouteError("Order not found.", 404);
        }

        if (!CUSTOMER_CANCELLABLE_STATUSES.includes(order.status)) {
          throw createRouteError("This order can no longer be cancelled.", 400);
        }

        const now = new Date();

        const timelineEntry = {
          status: "cancelled",
          note: "Order cancelled by customer.",
          createdAt: now,
        };

        const updateResult = await ordersCollection.updateOne(
          {
            _id: orderId,
            email,
            status: {
              $in: CUSTOMER_CANCELLABLE_STATUSES,
            },
          },
          {
            $set: {
              status: "cancelled",
              updatedAt: now,
            },

            $push: {
              timeline: timelineEntry,
            },
          },
          { session },
        );

        if (updateResult.modifiedCount !== 1) {
          throw createRouteError("Order could not be cancelled.", 409);
        }

        // Restore stock.
        const items = Array.isArray(order.items) ? order.items : [];

        for (const item of items) {
          const quantity = Number(item?.quantity);

          const productId = toObjectId(item?.productId);

          if (!Number.isInteger(quantity) || quantity < 1 || !productId) {
            continue;
          }

          await productsCollection.updateOne(
            {
              _id: productId,
            },
            {
              $inc: {
                stock: quantity,
              },

              $set: {
                updatedAt: now,
              },
            },
            { session },
          );
        }

        cancelledOrder = {
          ...order,
          status: "cancelled",
          updatedAt: now,

          timeline: [
            ...(Array.isArray(order.timeline) ? order.timeline : []),

            timelineEntry,
          ],
        };
      });

      return res.status(200).json({
        success: true,
        message: "Order cancelled successfully.",

        data: {
          _id: cancelledOrder._id,
          orderNumber: cancelledOrder.orderNumber,
          status: cancelledOrder.status,
          paymentStatus: cancelledOrder.paymentStatus,
          timeline: cancelledOrder.timeline,
          updatedAt: cancelledOrder.updatedAt,
        },
      });
    } catch (error) {
      console.error("PATCH /orders/cancel/:id ERROR:", error?.stack || error);

      return res.status(getErrorStatusCode(error)).json({
        success: false,
        message: error?.message || "Failed to cancel order.",
      });
    } finally {
      await session.endSession();
    }
  });

  return router;
};

export default ordersRoutes;
