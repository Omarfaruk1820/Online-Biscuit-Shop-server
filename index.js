/* ==========================================================
   IMPORTS
========================================================== */

import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import jwt from "jsonwebtoken";
import PDFDocument from "pdfkit";

import { MongoClient, ObjectId, ServerApiVersion } from "mongodb";

/* ==========================================================
   ROUTES
========================================================== */

import authRoutes from "./routes/auth.routes.js";
import usersRoutes from "./routes/users.routes.js";
import cartsRoutes from "./routes/carts.routes.js";
import ordersRoutes from "./routes/orders.routes.js";
import invoiceRoutes from "./routes/invoice.routes.js";

/* ==========================================================
   MIDDLEWARE
========================================================== */

import verifyToken from "./middleware/verifyToken.js";
import verifyUser from "./middleware/verifyUser.js";
import verifyAdmin from "./middleware/verifyAdmin.js";

/* ==========================================================
   EXPRESS APP
========================================================== */

const app = express();

/* ==========================================================
   SECURITY
========================================================== */

// Hide Express Signature Header
app.disable("x-powered-by");

/* ==========================================================
   REQUIRED ENV VARIABLES
========================================================== */

const REQUIRED_ENV = [
  "DB_USERNAME",
  "DB_PASS",
  "DB_NAME",
  "JWT_SECRET",
  "CLIENT_URL",
  "CLIENT_URL_PROD",
];

for (const env of REQUIRED_ENV) {
  if (!process.env[env]) {
    throw new Error(`❌ Missing ENV Variable: ${env}`);
  }
}

/* ==========================================================
   MIDDLEWARE
========================================================== */

app.use(
  express.json({
    limit: "2mb",
  }),
);

app.use(cookieParser());

app.use(
  cors({
    origin: [process.env.CLIENT_URL, process.env.CLIENT_URL_PROD],

    credentials: true,

    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],

    allowedHeaders: ["Content-Type", "Authorization"],

    optionsSuccessStatus: 200,
  }),
);

/* ==========================================================
   DATABASE CONFIGURATION
========================================================== */

const DB_NAME = process.env.DB_NAME;

const uri = `mongodb+srv://${encodeURIComponent(
  process.env.DB_USERNAME,
)}:${encodeURIComponent(
  process.env.DB_PASS,
)}@cluster0.g29mryf.mongodb.net/?retryWrites=true&w=majority`;

/* ==========================================================
   MONGODB CLIENT
========================================================== */

let client;

let db;

let productsCollection;

let usersCollection;

let cartsCollection;

let ordersCollection;

/* ==========================================================
   MONGODB CONNECTION OPTIONS

   ✔ Better Performance
   ✔ Connection Pooling
   ✔ Lower Connection Latency
========================================================== */

const mongoOptions = {
  maxPoolSize: 20,

  minPoolSize: 5,

  maxIdleTimeMS: 30000,

  serverApi: {
    version: ServerApiVersion.v1,

    strict: true,

    deprecationErrors: true,
  },
};
/* ==========================================================
   CONNECT DATABASE
========================================================== */

export const connectDB = async () => {
  try {
    /* ======================================================
       REUSE EXISTING CONNECTION
    ====================================================== */

    if (db) {
      console.log("⚡ MongoDB already connected");
      return db;
    }

    /* ======================================================
       CREATE CLIENT
    ====================================================== */

    client = new MongoClient(uri, mongoOptions);

    /* ======================================================
       CONNECT
    ====================================================== */

    await client.connect();

    db = client.db(DB_NAME);

    /* ======================================================
       COLLECTIONS
    ====================================================== */

    productsCollection = db.collection("products");
    usersCollection = db.collection("users");
    cartsCollection = db.collection("carts");
    ordersCollection = db.collection("orders");

    /* ======================================================
       VERIFY CONNECTION
    ====================================================== */

    await db.command({ ping: 1 });

    console.log("✅ MongoDB Connected Successfully");

    /* ======================================================
       CREATE INDEX IF MISSING
    ====================================================== */

    const createIndexIfMissing = async (
      collection,
      key,
      options = {},
    ) => {
      const indexes = await collection.indexes();

      const exists = indexes.some((index) => {
        return JSON.stringify(index.key) === JSON.stringify(key);
      });

      if (!exists) {
        await collection.createIndex(key, options);

        console.log(
          `✅ Index Created: ${collection.collectionName}`,
          key,
        );
      }
    };

    /* ======================================================
       CREATE INDEXES
    ====================================================== */

    await Promise.allSettled([
      /* ================= USERS ================= */

      createIndexIfMissing(
        usersCollection,
        { email: 1 },
        { unique: true },
      ),

      createIndexIfMissing(
        usersCollection,
        { role: 1 },
      ),

      createIndexIfMissing(
        usersCollection,
        { status: 1 },
      ),

      createIndexIfMissing(
        usersCollection,
        { createdAt: -1 },
      ),

      createIndexIfMissing(
        usersCollection,
        { lastLogin: -1 },
      ),

      /* ================= PRODUCTS ================= */

      createIndexIfMissing(
        productsCollection,
        { category: 1 },
      ),

      createIndexIfMissing(
        productsCollection,
        { brand: 1 },
      ),

      createIndexIfMissing(
        productsCollection,
        { price: 1 },
      ),

      createIndexIfMissing(
        productsCollection,
        { rating: -1 },
      ),

      createIndexIfMissing(
        productsCollection,
        { discount: -1 },
      ),

      createIndexIfMissing(
        productsCollection,
        { stock: 1 },
      ),

      createIndexIfMissing(
        productsCollection,
        { createdAt: -1 },
      ),

      createIndexIfMissing(
        productsCollection,
        { name: "text" },
      ),

      /* ================= CARTS ================= */

      createIndexIfMissing(
        cartsCollection,
        {
          email: 1,
          productId: 1,
        },
        {
          unique: true,
        },
      ),

      createIndexIfMissing(
        cartsCollection,
        {
          email: 1,
          createdAt: -1,
        },
      ),

      /* ================= ORDERS ================= */

      createIndexIfMissing(
        ordersCollection,
        {
          email: 1,
          status: 1,
          createdAt: -1,
        },
      ),

      createIndexIfMissing(
        ordersCollection,
        {
          status: 1,
          createdAt: -1,
        },
      ),

      createIndexIfMissing(
        ordersCollection,
        {
          createdAt: -1,
        },
      ),
    ]);

    console.log("✅ Database Indexes Ready");

    return db;
  } catch (error) {
    console.error("❌ MongoDB Connection Error:", error);
    throw error;
  }
};
/* ==========================================================
DATABASE INITIALIZATION
========================================================== */

await connectDB();

/* ==========================================================
GRACEFUL SHUTDOWN
========================================================== */

const closeDatabase = async (signal) => {
  try {
    console.log(`\n${signal} received. Closing MongoDB connection...`);

    if (client) {
      await client.close();
      console.log("✅ MongoDB connection closed.");
    }

    process.exit(0);
  } catch (error) {
    console.error("❌ Error while closing MongoDB:", error);
    process.exit(1);
  }
};

process.on("SIGINT", () => closeDatabase("SIGINT"));
process.on("SIGTERM", () => closeDatabase("SIGTERM"));

/* ==========================================================
EXPORTS
========================================================== */

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
/* ==========================================================
HEALTH CHECK
========================================================== */

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "🚀 Biscuit Shop API Running",
    timestamp: new Date(),
  });
});

/* ==========================================================
API ROUTES
========================================================== */

// Authentication
app.use("/auth", authRoutes(usersCollection));

// Users
app.use("/users", usersRoutes(usersCollection));

// Cart
app.use(
  "/carts",
  cartsRoutes(cartsCollection, productsCollection, verifyToken),
);

// Orders
app.use(
  "/orders",
  ordersRoutes(
    client,
    ordersCollection,
    cartsCollection,
    productsCollection,
    verifyToken,
    verifyAdmin,
  ),
);

// Invoice
app.use("/invoice", invoiceRoutes(ordersCollection, verifyToken));

/* ==========================================================
404 HANDLER
========================================================== */

app.use("", (req, res) => {
  return res.status(404).json({
    success: false,
    message: "API Route Not Found.",
  });
});

/* ==========================================================
GLOBAL ERROR HANDLER
========================================================== */

app.use((err, req, res, next) => {
  console.error("SERVER ERROR:", err);

  return res.status(err.status || 500).json({
    success: false,
    message:
      process.env.NODE_ENV === "production"
        ? "Internal Server Error."
        : err.message,
  });
});

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

export default app;
