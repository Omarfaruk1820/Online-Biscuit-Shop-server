import dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";

import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import PDFDocument from "pdfkit";

import usersRoutes from "./routes/users.routes.js";
import authRoutes from "./routes/auth.routes.js";

import { MongoClient, ServerApiVersion, ObjectId } from "mongodb";

const app = express();

/* ======================================
   MIDDLEWARE
====================================== */
import verifyToken from "./middleware/verifyToken.js";
import verifyUser from "./middleware/verifyUser.js";
import verifyAdmin from "./middleware/verifyAdmin.js";

app.use(express.json());

app.use(cookieParser());

app.use(
  cors({
    origin: [
      process.env.CLIENT_URL,
      process.env.CLIENT_URL_PROD,
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);





const requiredEnv = ["DB_USERNAME", "DB_PASS", "JWT_SECRET"];

requiredEnv.forEach((env) => {
  if (!process.env[env]) {
    throw new Error(`❌ Missing ENV Variable: ${env}`);
  }
});

/* ======================================
   DATABASE CONFIG
====================================== */

const DB_NAME = process.env.DB_NAME || "biscuit_shop_db";

const uri = `mongodb+srv://${encodeURIComponent(
  process.env.DB_USERNAME,
)}:${encodeURIComponent(
  process.env.DB_PASS,
)}@cluster0.g29mryf.mongodb.net/?retryWrites=true&w=majority`;

/* ======================================
   DATABASE VARIABLES
====================================== */

let client;
let db;

let productsCollection;
let usersCollection;
let cartsCollection;
let ordersCollection;

/* ======================================
   CONNECT DATABASE
====================================== */

export const connectDB = async () => {
  try {
    if (db) {
      console.log("⚡ MongoDB already connected");
      return db;
    }

    client = new MongoClient(uri, {
      serverApi: {
        version: ServerApiVersion.v1,
        deprecationErrors: true,
      },
    });

    await client.connect();

    db = client.db(DB_NAME);

    productsCollection = db.collection("products");
    usersCollection = db.collection("users");
    cartsCollection = db.collection("carts");
    ordersCollection = db.collection("orders");

    await db.command({ ping: 1 });

    console.log("✅ MongoDB Connected Successfully");

  
    await usersCollection.createIndex({ email: 1 }, { unique: true });

    // PRODUCTS
    await productsCollection.createIndex({
      category: 1,
    });

    // CARTS
    await cartsCollection.createIndex(
      {
        email: 1,
        productId: 1,
      },
      {
        unique: true,
      },
    );

    // ORDERS
    await ordersCollection.createIndex({
      createdAt: -1,
    });

    await ordersCollection.createIndex({
      email: 1,
    });

    await ordersCollection.createIndex({
      status: 1,
    });

    console.log("✅ Database Indexes Ready");

    return db;
  } catch (error) {
    console.error("❌ MongoDB Connection Error:", error);
    throw error;
  }
};

/* ======================================
   INITIALIZE DATABASE
====================================== */

await connectDB();

/* ======================================
   GRACEFUL SHUTDOWN
====================================== */

process.on("SIGINT", async () => {
  try {
    console.log("🔴 Closing MongoDB Connection...");
    await client?.close();
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
});

/* ======================================
   EXPORTS
====================================== */

export {
  app,
  client,
  db,
  productsCollection,
  usersCollection,
  cartsCollection,
  ordersCollection,
  ObjectId,
  jwt,
  PDFDocument,
};

app.use("/auth", authRoutes(usersCollection));
app.use("/users", usersRoutes(usersCollection));




// ====================== PRODUCTS ======================
app.get("/products", async (req, res) => {
  try {
    if (!productsCollection) {
      return res.status(500).json({
        success: false,
        message: "Database not connected",
      });
    }

    let { page = 1, limit = 8, search = "", category = "" } = req.query;

    page = Math.max(1, Number(page) || 1);
    limit = Math.min(20, Math.max(1, Number(limit) || 8));

    const skip = (page - 1) * limit;

    const query = {};

    if (search?.trim()) {
      query.name = {
        $regex: search.trim(),
        $options: "i",
      };
    }

    if (category?.trim()) {
      query.category = category.trim().toLowerCase();
    }

    const [products, total] = await Promise.all([
      productsCollection
        .find(query)
        .sort({ _id: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),

      productsCollection.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      data: products,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("GET PRODUCTS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch products",
    });
  }
});
app.get("/products/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Product ID",
      });
    }

    const product = await productsCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product Not Found",
      });
    }

    return res.status(200).json({
      success: true,
      data: product,
    });
  } catch (error) {
    console.error("GET PRODUCT ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed To Fetch Product",
    });
  }
});
app.post(
  "/products",

  verifyToken,

  verifyUser(usersCollection),

  verifyAdmin,
  async (req, res) => {
    try {
      const {
        name,
        price,
        stock = 0,
        image = "",
        rating = 4.5,
        category = "cookies",
        reviews = 0,
        brand = "",
        weight = "",
        description = "",
        ingredients = "",
        expiry = "",
        discount = 0,
      } = req.body;

      if (!name?.trim()) {
        return res.status(400).json({
          success: false,
          message: "Product Name Required",
        });
      }

      if (isNaN(price)) {
        return res.status(400).json({
          success: false,
          message: "Invalid Price",
        });
      }

      const newProduct = {
        name: name.trim(),
        price: Number(price),
        stock: Number(stock),
        // image: image.trim(),
        image:
          typeof product.image === "string"
            ? product.image.replace(/[\[\]\(\)]/g, "").trim()
            : "",
        rating: Number(rating),
        category: category.toLowerCase(),
        reviews: Number(reviews),
        brand: brand.trim(),
        weight,
        description,
        ingredients,
        expiry,
        discount: Number(discount),
        createdBy: req.user.email,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await productsCollection.insertOne(newProduct);

      return res.status(201).json({
        success: true,
        insertedId: result.insertedId,
        message: "Product Created Successfully",
      });
    } catch (error) {
      console.error("CREATE PRODUCT ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Failed To Create Product",
      });
    }
  },
);
app.patch("/products/:id", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Product ID",
      });
    }

    const { _id, createdAt, createdBy, ...updates } = req.body;

    if (updates.price !== undefined) {
      updates.price = Number(updates.price);
    }

    if (updates.stock !== undefined) {
      updates.stock = Number(updates.stock);
    }

    if (updates.rating !== undefined) {
      updates.rating = Number(updates.rating);
    }

    if (updates.discount !== undefined) {
      updates.discount = Number(updates.discount);
    }

    updates.updatedAt = new Date();

    const result = await productsCollection.updateOne(
      {
        _id: new ObjectId(id),
      },
      {
        $set: updates,
      },
    );

    return res.status(200).json({
      success: true,
      modifiedCount: result.modifiedCount,
      message: "Product Updated Successfully",
    });
  } catch (error) {
    console.error("UPDATE PRODUCT ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Update Failed",
    });
  }
});
app.delete("/products/:id", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Product ID",
      });
    }

    const existing = await productsCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Product Not Found",
      });
    }

    await productsCollection.deleteOne({
      _id: new ObjectId(id),
    });

    return res.status(200).json({
      success: true,
      message: "Product Deleted Successfully",
    });
  } catch (error) {
    console.error("DELETE PRODUCT ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Delete Failed",
    });
  }
});

// ====================== GET CART ======================
app.post("/carts", verifyToken, async (req, res) => {
  try {
    const email = req.user?.email;

    if (!email) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const { productId, quantity = 1 } = req.body;

    if (!productId || !ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product id",
      });
    }

    const qty = Math.max(1, Math.min(99, Number(quantity) || 1));

    const product = await productsCollection.findOne(
      {
        _id: new ObjectId(productId),
      },
      {
        projection: {
          name: 1,
          image: 1,
          price: 1,
          discount: 1,
        },
      },
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const price = Number(product.price || 0);
    const discount = Number(product.discount || 0);

    const finalPrice = Number((price - (price * discount) / 100).toFixed(2));

    const existing = await cartsCollection.findOne({
      email,
      productId: new ObjectId(productId),
    });

    if (existing) {
      const newQuantity = Number(existing.quantity) + qty;

      await cartsCollection.updateOne(
        { _id: existing._id },
        {
          $set: {
            quantity: newQuantity,
            subtotal: Number((newQuantity * finalPrice).toFixed(2)),
            updatedAt: new Date(),
          },
        },
      );

      return res.status(200).json({
        success: true,
        message: "Cart updated",
      });
    }

    const cartItem = {
      email,
      productId: new ObjectId(productId),

      quantity: qty,

      name: product.name,
      // image: product.image,
      image:
        typeof product.image === "string"
          ? product.image.replace(/[\[\]\(\)]/g, "").trim()
          : "",

      price,
      discount,
      finalPrice,

      subtotal: Number((qty * finalPrice).toFixed(2)),

      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await cartsCollection.insertOne(cartItem);

    return res.status(201).json({
      success: true,
      insertedId: result.insertedId,
      message: "Added to cart",
    });
  } catch (error) {
    console.error("POST CART ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to add cart",
    });
  }
});
app.get("/carts", verifyToken, async (req, res) => {
  try {
    const email = req.user?.email;

    if (!email) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const carts = await cartsCollection
      .find({ email })
      .project({
        email: 0,
      })
      .sort({
        createdAt: -1,
      })
      .toArray();

    const summary = carts.reduce(
      (acc, item) => {
        acc.totalItems += 1;
        acc.totalQuantity += Number(item.quantity || 0);
        acc.totalPrice += Number(item.subtotal || 0);

        return acc;
      },
      {
        totalItems: 0,
        totalQuantity: 0,
        totalPrice: 0,
      },
    );

    summary.totalPrice = Number(summary.totalPrice.toFixed(2));

    return res.status(200).json({
      success: true,
      data: carts,
      summary,
    });
  } catch (error) {
    console.error("GET CART ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch cart",
    });
  }
});

app.patch("/carts/:id", verifyToken, async (req, res) => {
  try {
    const email = req.user?.email;
    const { id } = req.params;

    const quantity = Number(req.body.quantity);

    if (!email) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid cart id",
      });
    }

    if (isNaN(quantity) || quantity < 1 || quantity > 99) {
      return res.status(400).json({
        success: false,
        message: "Invalid quantity",
      });
    }

    const cart = await cartsCollection.findOne(
      {
        _id: new ObjectId(id),
        email,
      },
      {
        projection: {
          finalPrice: 1,
        },
      },
    );

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    const subtotal = Number((cart.finalPrice * quantity).toFixed(2));

    await cartsCollection.updateOne(
      {
        _id: new ObjectId(id),
        email,
      },
      {
        $set: {
          quantity,
          subtotal,
          updatedAt: new Date(),
        },
      },
    );

    return res.status(200).json({
      success: true,
      message: "Cart updated",
    });
  } catch (error) {
    console.error("PATCH CART ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update cart",
    });
  }
});
app.delete("/carts/:id", verifyToken, async (req, res) => {
  try {
    const email = req.user?.email;
    const { id } = req.params;

    if (!email) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid cart id",
      });
    }

    const result = await cartsCollection.deleteOne({
      _id: new ObjectId(id),
      email,
    });

    if (!result.deletedCount) {
      return res.status(404).json({
        success: false,
        message: "Cart item not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Item removed successfully",
    });
  } catch (error) {
    console.error("DELETE CART ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete cart item",
    });
  }
});

//Orders apis
// ======================================================
// GET ALL ORDERS (ADMIN)
// ======================================================
app.get("/orders", verifyToken, verifyAdmin, async (req, res) => {
  try {
    let { status = "all", page = 1, limit = 10, search = "" } = req.query;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 10));
    const skip = (pageNum - 1) * limitNum;

    const query = {};

    if (status !== "all") {
      query.status = status;
    }

    if (search?.trim()) {
      query.$or = [
        {
          email: {
            $regex: search.trim(),
            $options: "i",
          },
        },
        {
          "customer.phone": {
            $regex: search.trim(),
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
        .limit(limitNum)
        .toArray(),

      ordersCollection.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      page: pageNum,
      total,
      totalPages: Math.ceil(total / limitNum),
      data: orders,
    });
  } catch (error) {
    console.error("GET ORDERS ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch orders",
    });
  }
});

// ======================================================
// MY ORDERS
// ======================================================
app.get("/orders/my", verifyToken, async (req, res) => {
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

    res.status(200).json({
      success: true,
      count: orders.length,
      data: orders,
    });
  } catch (error) {
    console.error("MY ORDERS ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch user orders",
    });
  }
});

// ======================================================
// PLACE ORDER
// ======================================================
app.post("/orders", verifyToken, async (req, res) => {
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

    const itemsWithProducts = await Promise.all(
      cartItems.map(async (item) => {
        const product = await productsCollection.findOne({
          _id: new ObjectId(item.productId),
        });

        if (!product) return null;

        const discountedPrice =
          product.price - (product.price * (product.discount || 0)) / 100;

        return {
          productId: product._id,
          name: product.name,
          image: product.image,
          quantity: item.quantity,
          price: product.price,
          discount: product.discount || 0,
          subtotal: Number((discountedPrice * item.quantity).toFixed(2)),
        };
      }),
    );

    const safeItems = itemsWithProducts.filter(Boolean);

    if (!safeItems.length) {
      return res.status(400).json({
        success: false,
        message: "No valid products found",
      });
    }

    const total = safeItems.reduce((sum, item) => sum + item.subtotal, 0);

    await session.withTransaction(async () => {
      await ordersCollection.insertOne(
        {
          email,
          customer,

          items: safeItems,

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
    console.error("ORDER ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Order failed",
    });
  } finally {
    await session.endSession();
  }
});

// ======================================================
// CANCEL ORDER
// ======================================================
app.patch("/orders/cancel/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const email = req.user.email;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID",
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
        email,
      },
      {
        $set: {
          status: "cancelled",
          updatedAt: new Date(),
        },
      },
    );

    res.status(200).json({
      success: true,
      message: "Order cancelled successfully",
    });
  } catch (error) {
    console.error("CANCEL ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Cancel failed",
    });
  }
});

// ======================================================
// SINGLE INVOICE JSON
// ======================================================
app.get("/orders/invoice/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const email = req.user.email;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID",
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

    res.status(200).json({
      success: true,
      invoice: {
        invoiceId: order._id,
        customer: order.customer,
        items: order.items,
        total: order.total,
        status: order.status,
        date: order.createdAt,
      },
    });
  } catch (error) {
    console.error("INVOICE ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Failed to generate invoice",
    });
  }
});

// ======================================================
// UPDATE ORDER STATUS (ADMIN)
// ======================================================
app.patch("/orders/status/:id", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID",
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

    res.status(200).json({
      success: true,
      message: "Order status updated",
    });
  } catch (error) {
    console.error("STATUS UPDATE ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Status update failed",
    });
  }
});
// ====================== MONTHLY SALES ======================
// ======================================================
// MONTHLY SALES ANALYTICS
// ======================================================
app.get(
  "/admin/analytics/monthly-sales",
  verifyToken,
  verifyAdmin,
  async (req, res) => {
    try {
      const result = await ordersCollection
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
              _id: {
                year: {
                  $year: "$createdAt",
                },
                month: {
                  $month: "$createdAt",
                },
              },
              sales: {
                $sum: "$total",
              },
            },
          },
          {
            $sort: {
              "_id.year": 1,
              "_id.month": 1,
            },
          },
          {
            $project: {
              _id: 0,
              month: {
                $concat: [
                  { $toString: "$_id.year" },
                  "-",
                  {
                    $cond: [
                      { $lt: ["$_id.month", 10] },
                      {
                        $concat: ["0", { $toString: "$_id.month" }],
                      },
                      { $toString: "$_id.month" },
                    ],
                  },
                ],
              },
              sales: {
                $round: ["$sales", 2],
              },
            },
          },
        ])
        .toArray();

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error("MONTHLY SALES ERROR:", error);

      res.status(500).json({
        success: false,
        message: "Monthly analytics failed",
      });
    }
  },
);

// ======================================================
// TOP SELLING PRODUCTS
// ======================================================
app.get(
  "/admin/analytics/top-products",
  verifyToken,
  verifyAdmin,
  async (req, res) => {
    try {
      const result = await ordersCollection
        .aggregate([
          {
            $match: {
              status: {
                $ne: "cancelled",
              },
            },
          },
          {
            $unwind: "$items",
          },
          {
            $group: {
              _id: "$items.name",
              sold: {
                $sum: "$items.quantity",
              },
              revenue: {
                $sum: "$items.subtotal",
              },
            },
          },
          {
            $sort: {
              sold: -1,
            },
          },
          {
            $limit: 5,
          },
          {
            $project: {
              _id: 0,
              name: "$_id",
              sold: 1,
              revenue: {
                $round: ["$revenue", 2],
              },
            },
          },
        ])
        .toArray();

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error("TOP PRODUCTS ERROR:", error);

      res.status(500).json({
        success: false,
        message: "Top products analytics failed",
      });
    }
  },
);

// ======================================================
// ADMIN DASHBOARD STATS
// ======================================================
app.get(
  "/admin/dashboard-stats",
  verifyToken,
  verifyAdmin,
  async (req, res) => {
    try {
      const [totalUsers, totalProducts, totalOrders, revenueResult] =
        await Promise.all([
          usersCollection.countDocuments(),
          productsCollection.countDocuments(),
          ordersCollection.countDocuments(),
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
                    $sum: "$total",
                  },
                },
              },
            ])
            .toArray(),
        ]);

      const totalRevenue = revenueResult[0]?.totalRevenue || 0;

      res.status(200).json({
        success: true,
        stats: {
          totalUsers,
          totalProducts,
          totalOrders,
          totalRevenue: Number(totalRevenue.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("DASHBOARD STATS ERROR:", error);

      res.status(500).json({
        success: false,
        message: "Failed to load dashboard stats",
      });
    }
  },
);

// ======================================================
// RECENT ORDERS
// ======================================================
app.get("/admin/recent-orders", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const orders = await ordersCollection
      .find({})
      .sort({
        createdAt: -1,
      })
      .limit(10)
      .toArray();

    res.status(200).json({
      success: true,
      data: orders,
    });
  } catch (error) {
    console.error("RECENT ORDERS ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch recent orders",
    });
  }
});

// ======================================================
// ROOT ROUTE
// ======================================================
app.get("/", (req, res) => {
  res.status(200).send("🍪 Biscuit Shop Server Running...");
});

// ======================================================
// EXPORT APP
// ======================================================
export default app;
