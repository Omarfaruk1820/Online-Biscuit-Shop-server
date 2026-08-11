import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { MongoClient, ServerApiVersion } from "mongodb";

// ============================================================
// ROUTES
// ============================================================

import authRoutes from "./routes/auth.routes.js";
import usersRoutes from "./routes/users.routes.js";
import productsRoutes from "./routes/products.routes.js";
import cartsRoutes from "./routes/carts.routes.js";
import ordersRoutes from "./routes/orders.routes.js";
import invoiceRoutes from "./routes/invoice.routes.js";
import adminRoutes from "./routes/admin.routes.js";

// ============================================================
// MIDDLEWARE
// ============================================================

import verifyToken from "./middleware/verifyToken.js";
import verifyUser from "./middleware/verifyUser.js";
import verifyAdmin from "./middleware/verifyAdmin.js";

// ============================================================
// APP
// ============================================================

const app = express();

app.disable("x-powered-by");

// ============================================================
// ENVIRONMENT VARIABLES
// ============================================================

const requiredEnv = [
  "DB_USERNAME",
  "DB_PASS",
  "DB_NAME",
  "JWT_SECRET",
  "CLIENT_URL",
  "CLIENT_URL_PROD",
];

for (const key of requiredEnv) {
  if (!process.env[key]?.trim()) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

// ============================================================
// ENV VALUES
// ============================================================

const DB_USERNAME = process.env.DB_USERNAME.trim();
const DB_PASS = process.env.DB_PASS;
const DB_NAME = process.env.DB_NAME.trim();

const CLIENT_URL = process.env.CLIENT_URL.trim();
const CLIENT_URL_PROD = process.env.CLIENT_URL_PROD.trim();

const NODE_ENV = process.env.NODE_ENV?.trim() || "development";

// ============================================================
// ALLOWED CORS ORIGINS
// ============================================================

const allowedOrigins = [CLIENT_URL, CLIENT_URL_PROD].filter(Boolean);

// ============================================================
// CORS
// ============================================================

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests without Origin.
      // Useful for server-to-server requests, health checks, etc.
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.error("CORS BLOCKED:", origin);

      const error = new Error("Not allowed by CORS");
      error.status = 403;

      return callback(error);
    },

    credentials: true,

    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],

    allowedHeaders: ["Content-Type", "Authorization"],

    optionsSuccessStatus: 204,
  }),
);

// ============================================================
// BODY PARSER
// ============================================================

app.use(
  express.json({
    limit: "2mb",
  }),
);

// ============================================================
// COOKIE PARSER
// ============================================================

app.use(cookieParser());

// ============================================================
// MONGODB
// ============================================================

const uri = `mongodb+srv://${encodeURIComponent(
  DB_USERNAME,
)}:${encodeURIComponent(
  DB_PASS,
)}@cluster0.g29mryf.mongodb.net/?retryWrites=true&w=majority`;

// ============================================================
// MONGODB CLIENT
// ============================================================

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

let client = null;
let db = null;

let productsCollection = null;
let usersCollection = null;
let cartsCollection = null;
let ordersCollection = null;

// ============================================================
// CREATE INDEX IF MISSING
// ============================================================

const createIndexIfMissing = async (collection, key, options = {}) => {
  try {
    const indexes = await collection.indexes();

    const exists = indexes.some(
      (index) => JSON.stringify(index.key) === JSON.stringify(key),
    );

    if (exists) {
      return;
    }

    await collection.createIndex(key, options);

    console.log(`Index created: ${collection.collectionName}`, key);
  } catch (error) {
    console.error(
      `Index creation failed: ${collection.collectionName}`,
      error?.message || error,
    );
  }
};

// ============================================================
// CREATE DATABASE INDEXES
// ============================================================

const createDatabaseIndexes = async () => {
  await Promise.all([
    // ========================================================
    // USERS
    // ========================================================

    createIndexIfMissing(usersCollection, { email: 1 }, { unique: true }),

    createIndexIfMissing(usersCollection, { role: 1 }),

    createIndexIfMissing(usersCollection, { status: 1 }),

    createIndexIfMissing(usersCollection, { createdAt: -1 }),

    createIndexIfMissing(usersCollection, { lastLogin: -1 }),

    // ========================================================
    // PRODUCTS
    // ========================================================

    createIndexIfMissing(productsCollection, { category: 1 }),

    createIndexIfMissing(productsCollection, { brand: 1 }),

    createIndexIfMissing(productsCollection, { price: 1 }),

    createIndexIfMissing(productsCollection, { rating: -1 }),

    createIndexIfMissing(productsCollection, { discount: -1 }),

    createIndexIfMissing(productsCollection, { stock: 1 }),

    createIndexIfMissing(productsCollection, { createdAt: -1 }),

    // ========================================================
    // CARTS
    // ========================================================

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

    createIndexIfMissing(cartsCollection, {
      email: 1,
      createdAt: -1,
    }),

    // ========================================================
    // ORDERS
    // ========================================================

    createIndexIfMissing(ordersCollection, {
      email: 1,
      status: 1,
      createdAt: -1,
    }),

    createIndexIfMissing(ordersCollection, {
      status: 1,
      createdAt: -1,
    }),

    createIndexIfMissing(ordersCollection, {
      createdAt: -1,
    }),

    createIndexIfMissing(
      ordersCollection,
      {
        orderNumber: 1,
      },
      {
        unique: true,
        sparse: true,
      },
    ),
  ]);

  console.log("Database indexes ready.");
};

// ============================================================
// CONNECT DATABASE
// ============================================================

export const connectDB = async () => {
  try {
    // Reuse existing connection.
    if (db) {
      return db;
    }

    // Create MongoClient only once.
    if (!client) {
      client = new MongoClient(uri, mongoOptions);
    }

    // Connect.
    await client.connect();

    // Select database.
    db = client.db(DB_NAME);

    // ========================================================
    // COLLECTIONS
    // ========================================================

    productsCollection = db.collection("products");

    usersCollection = db.collection("users");

    cartsCollection = db.collection("carts");

    ordersCollection = db.collection("orders");

    // ========================================================
    // DATABASE PING
    // ========================================================

    await db.command({
      ping: 1,
    });

    console.log("MongoDB Connected Successfully.");

    // ========================================================
    // INDEXES
    // ========================================================

    await createDatabaseIndexes();

    return db;
  } catch (error) {
    console.error("MongoDB Connection Error:", error);

    // Reset state so a later connection attempt
    // can retry correctly.
    db = null;

    throw error;
  }
};

// ============================================================
// INITIAL DATABASE CONNECTION
// ============================================================

await connectDB();

// ============================================================
// HEALTH CHECK
// ============================================================

app.get("/", (req, res) => {
  return res.status(200).json({
    success: true,
    message: "Biscuit Shop API Running",
    environment: NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================
// AUTH ROUTES
// ============================================================

app.use("/auth", authRoutes(usersCollection));

// ============================================================
// USER ROUTES
// ============================================================

app.use("/users", usersRoutes(usersCollection));

// ============================================================
// PRODUCT ROUTES
// ============================================================

app.use(
  "/products",
  productsRoutes(productsCollection, verifyToken, verifyUser, verifyAdmin),
);

// ============================================================
// CART ROUTES
// ============================================================

app.use(
  "/carts",
  cartsRoutes(cartsCollection, productsCollection, verifyToken),
);

// ============================================================
// ORDER ROUTES
// ============================================================

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

// ============================================================
// ADMIN ROUTES
// ============================================================

app.use(
  "/admin",
  adminRoutes(
    usersCollection,
    productsCollection,
    ordersCollection,
    verifyToken,
    verifyAdmin,
  ),
);

// ============================================================
// INVOICE ROUTES
// ============================================================

app.use("/invoice", invoiceRoutes(ordersCollection, verifyToken));

// ============================================================
// 404 HANDLER
// ============================================================

app.use((req, res) => {
  return res.status(404).json({
    success: false,
    message: "API Route Not Found.",
    path: req.originalUrl,
  });
});

// ============================================================
// GLOBAL ERROR HANDLER
// ============================================================

app.use((err, req, res, next) => {
  console.error("SERVER ERROR:", err);

  const statusCode =
    Number.isInteger(err?.status) && err.status >= 400 && err.status < 600
      ? err.status
      : 500;

  const message =
    NODE_ENV === "production"
      ? statusCode === 403
        ? "Forbidden."
        : "Internal Server Error."
      : err?.message || "Internal Server Error.";

  return res.status(statusCode).json({
    success: false,
    message,
  });
});

// ============================================================
// GRACEFUL SHUTDOWN
// ============================================================

const closeDatabase = async (signal) => {
  try {
    console.log(`${signal} received. Closing MongoDB connection...`);

    if (client) {
      await client.close();

      client = null;
      db = null;

      console.log("MongoDB connection closed.");
    }

    process.exit(0);
  } catch (error) {
    console.error("Error while closing MongoDB:", error);

    process.exit(1);
  }
};

// ============================================================
// PROCESS SIGNALS
// ============================================================

process.once("SIGINT", () => closeDatabase("SIGINT"));

process.once("SIGTERM", () => closeDatabase("SIGTERM"));

// ============================================================
// EXPORTS
// ============================================================

export {
  app,
  client,
  db,
  productsCollection,
  usersCollection,
  cartsCollection,
  ordersCollection,
};

export default app;
