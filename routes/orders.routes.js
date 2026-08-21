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
  console.log("ORDERS ROUTES INITIALIZED:", {
    ordersCollection: typeof ordersCollection,
    cartsCollection: typeof cartsCollection,
    productsCollection: typeof productsCollection,
    usersCollection: typeof usersCollection,
  });

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

  const ALLOWED_STATUSES = ["all", ...ORDER_STATUSES];

  const ALLOWED_SORTS = ["newest", "oldest", "highest", "lowest"];

  const SORT_OPTIONS = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    highest: { grandTotal: -1 },
    lowest: { grandTotal: 1 },
  };

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

  const normalizeEmail = (email = "") => {
    return typeof email === "string" ? email.trim().toLowerCase() : "";
  };

  const normalizeString = (value = "", maxLength = 200) => {
    if (typeof value !== "string") {
      return "";
    }

    return value.trim().slice(0, maxLength);
  };

  const round = (value) => {
    const number = Number(value);

    return Number.isFinite(number) ? Number(number.toFixed(2)) : 0;
  };

  const isValidObjectId = (id) => {
    return typeof id === "string" && ObjectId.isValid(id);
  };

  const toObjectId = (value) => {
    if (value instanceof ObjectId) {
      return value;
    }

    if (!ObjectId.isValid(String(value))) {
      return null;
    }

    return new ObjectId(String(value));
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

    return {
      page,
      limit,
      skip: (page - 1) * limit,
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

      const existing = await ordersCollection.findOne(
        { orderNumber },
        {
          projection: {
            _id: 1,
          },
          session,
        },
      );

      if (!existing) {
        return orderNumber;
      }
    }

    throw new Error("Failed to generate unique order number.");
  };

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

  const normalizePaymentMethod = (value) => {
    const paymentMethod =
      typeof value === "string" ? value.trim().toLowerCase() : "";

    return paymentMethod === "cash_on_delivery" ? paymentMethod : "";
  };

  const getProductName = (product) => {
    return typeof product?.name === "string" && product.name.trim()
      ? product.name.trim()
      : "Unknown Product";
  };

  const getProductSku = (product) => {
    return typeof product?.sku === "string" ? product.sku.trim() : "";
  };

  const getProductImage = (product) => {
    return typeof product?.image === "string" ? product.image.trim() : "";
  };

  const getProductBrand = (product) => {
    return typeof product?.brand === "string" ? product.brand.trim() : "";
  };

  const getProductCategory = (product) => {
    return typeof product?.category === "string"
      ? product.category.trim().toLowerCase()
      : "";
  };

  const calculateProductPricing = (product) => {
    const productName = getProductName(product);

    const price = Number(product?.price);

    if (!Number.isFinite(price) || price < 0) {
      throw new Error(`Invalid price for "${productName}".`);
    }

    const discount = Number(product?.discount ?? 0);

    if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
      throw new Error(`Invalid discount for "${productName}".`);
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
      throw new Error(`Invalid stock for "${productName}".`);
    }

    if (stock === 0) {
      throw new Error(`"${productName}" is out of stock.`);
    }

    if (quantity > stock) {
      throw new Error(`Only ${stock} item(s) available for "${productName}".`);
    }
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

  const createOrderSummary = (order) => {
    return {
      totalItems: Number(order?.totalItems) || 0,

      totalQuantity: Number(order?.totalQuantity) || 0,

      subtotal: round(order?.subtotal),

      totalDiscount: round(order?.totalDiscount ?? order?.discount),

      shipping: round(order?.shipping),

      tax: round(order?.tax),

      grandTotal: round(order?.grandTotal ?? order?.total),
    };
  };

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

        {
          orderNumber: {
            $regex: escaped,
            $options: "i",
          },
        },
      ],
    };
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

      const paymentMethod = normalizePaymentMethod(req.body?.paymentMethod);

      if (!paymentMethod) {
        return res.status(400).json({
          success: false,
          message: "Invalid payment method.",
        });
      }

      let createdOrder = null;

      await session.withTransaction(async () => {
        // ==================================================
        // LOAD CART
        // ==================================================

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
              session,
            },
          )
          .sort({
            createdAt: 1,
          })
          .toArray();

        if (cartItems.length === 0) {
          const error = new Error("Your cart is empty.");

          error.statusCode = 400;
          throw error;
        }

        if (cartItems.length > MAX_CART_QUANTITY) {
          const error = new Error("Cart contains too many products.");

          error.statusCode = 400;
          throw error;
        }

        // ==================================================
        // PREPARE PRODUCT IDS
        // ==================================================

        const productIds = [];
        const cartMap = new Map();

        for (const cartItem of cartItems) {
          const productId = toObjectId(cartItem.productId);

          if (!productId) {
            const error = new Error(
              "A cart item contains an invalid product ID.",
            );

            error.statusCode = 400;
            throw error;
          }

          const key = productId.toString();

          if (cartMap.has(key)) {
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

          cartMap.set(key, {
            productId,
            quantity,
          });

          productIds.push(productId);
        }

        // ==================================================
        // LOAD CURRENT PRODUCTS
        // ==================================================

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

        // ==================================================
        // BUILD ORDER ITEMS
        // ==================================================

        const orderItems = [];

        for (const productId of productIds) {
          const key = productId.toString();

          const cartItem = cartMap.get(key);

          const product = productMap.get(key);

          if (!product) {
            const error = new Error(
              "One or more products in your cart no longer exist.",
            );

            error.statusCode = 400;
            throw error;
          }

          validateProductStock(product, cartItem.quantity);

          const pricing = calculateProductPricing(product);

          const subtotal = round(pricing.finalPrice * cartItem.quantity);

          const discountAmount = round(
            (pricing.price - pricing.finalPrice) * cartItem.quantity,
          );

          orderItems.push({
            productId: product._id,

            sku: getProductSku(product),

            name: getProductName(product),

            image: getProductImage(product),

            brand: getProductBrand(product),

            category: getProductCategory(product),

            weight: product.weight ?? null,

            quantity: cartItem.quantity,

            price: pricing.price,

            discount: pricing.discount,

            finalPrice: pricing.finalPrice,

            subtotal,

            discountAmount,
          });
        }

        // ==================================================
        // CALCULATE SUMMARY
        // ==================================================

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

        // ==================================================
        // ORDER NUMBER
        // ==================================================

        const orderNumber = await createUniqueOrderNumber(session);

        // ==================================================
        // DECREASE PRODUCT STOCK
        // ==================================================

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
            const error = new Error(
              `"${item.name}" is no longer available in the requested quantity.`,
            );

            error.statusCode = 409;
            throw error;
          }
        }

        // ==================================================
        // CREATE ORDER
        // ==================================================

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

        const result = await ordersCollection.insertOne(orderDocument, {
          session,
        });

        if (!result.acknowledged || !result.insertedId) {
          const error = new Error("Failed to create order.");

          error.statusCode = 500;
          throw error;
        }

        // ==================================================
        // CLEAR CART
        // ==================================================

        const deleteResult = await cartsCollection.deleteMany(
          { email },
          {
            session,
          },
        );

        if (!deleteResult.acknowledged) {
          const error = new Error("Failed to clear cart.");

          error.statusCode = 500;
          throw error;
        }

        createdOrder = {
          _id: result.insertedId,

          ...orderDocument,
        };
      });

      // ======================================================
      // SUCCESS
      // ======================================================

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
      console.error("POST /orders ERROR:", error?.stack || error);

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
      console.error("GET /orders ERROR:", error?.stack || error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch orders.",
      });
    }
  });

  // ============================================================
  // ADMIN: ORDER STATS
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
      console.error("GET /orders/stats ERROR:", error?.stack || error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch order statistics.",
      });
    }
  });

  // ============================================================
  // USER: GET MY ORDERS
  // GET /orders/my
  // ============================================================

  router.get(
    "/my",
    verifyToken,
    verifyUser(usersCollection),
    async (req, res) => {
      try {
        const email = normalizeEmail(req.dbUser?.email);

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
      console.error("GET /orders/my/:id ERROR:", error?.stack || error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch order.",
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
      console.error("GET /orders/:id ERROR:", error?.stack || error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch order.",
      });
    }
  });

  // ============================================================
  // USER: CANCEL ORDER
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

        // --------------------------------------------------
        // RESTORE STOCK
        // --------------------------------------------------

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
      console.error("PATCH /orders/cancel/:id ERROR:", error?.stack || error);

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

  return router;
};

export default ordersRoutes;
