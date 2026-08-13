import "./config/env.js";

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import { MongoClient, ServerApiVersion } from "mongodb";

import "./utils/firebaseAdmin.js";

import authRoutes from "./routes/auth.routes.js";
import usersRoutes from "./routes/users.routes.js";
import productsRoutes from "./routes/products.routes.js";
import cartsRoutes from "./routes/carts.routes.js";
import ordersRoutes from "./routes/orders.routes.js";
import invoiceRoutes from "./routes/invoice.routes.js";
import adminRoutes from "./routes/admin.routes.js";

import verifyToken from "./middleware/verifyToken.js";
import verifyUser from "./middleware/verifyUser.js";
import verifyAdmin from "./middleware/verifyAdmin.js";

// ============================================================
// APP
// ============================================================

const app = express();

app.disable("x-powered-by");

// ============================================================
// ENVIRONMENT
// ============================================================

const NODE_ENV = String(process.env.NODE_ENV || "development")
  .trim()
  .toLowerCase();

const isProduction = NODE_ENV === "production";

const PORT = Number(process.env.PORT) || 5000;

// ============================================================
// REQUIRED ENVIRONMENT VARIABLES
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
  const value = process.env[key];

  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

// ============================================================
// ENVIRONMENT VALUES
// ============================================================

const DB_USERNAME = process.env.DB_USERNAME.trim();
const DB_PASS = process.env.DB_PASS;
const DB_NAME = process.env.DB_NAME.trim();

const CLIENT_URL = process.env.CLIENT_URL.trim();
const CLIENT_URL_PROD = process.env.CLIENT_URL_PROD.trim();

// ============================================================
// CORS ORIGIN NORMALIZER
// ============================================================

const normalizeOrigin = (origin = "") => {
  if (typeof origin !== "string") {
    return "";
  }

  return origin.trim().replace(/\/$/, "");
};

// ============================================================
// ALLOWED CORS ORIGINS
// ============================================================

const allowedOrigins = [CLIENT_URL, CLIENT_URL_PROD]
  .map(normalizeOrigin)
  .filter(Boolean);

console.log("Allowed CORS origins:", allowedOrigins);

// ============================================================
// CORS
// ============================================================

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests without Origin.
      //
      // Examples:
      // - Postman
      // - server-to-server requests
      // - health checks
      if (!origin) {
        return callback(null, true);
      }

      const normalizedOrigin = normalizeOrigin(origin);

      if (allowedOrigins.includes(normalizedOrigin)) {
        return callback(null, true);
      }

      console.warn("CORS blocked:", origin);

      // Do not throw here.
      return callback(null, false);
    },

    credentials: true,

    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],

    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],

    optionsSuccessStatus: 204,
  }),
);

// ============================================================
// BODY PARSERS
// ============================================================

app.use(
  express.json({
    limit: "2mb",
  }),
);

app.use(cookieParser());

// ============================================================
// MONGODB URI
// ============================================================

const MONGO_URI =
  `mongodb+srv://${encodeURIComponent(DB_USERNAME)}` +
  `:${encodeURIComponent(DB_PASS)}` +
  `@cluster0.g29mryf.mongodb.net/` +
  `?retryWrites=true&w=majority`;

// ============================================================
// MONGODB OPTIONS
// ============================================================

const mongoOptions = {
  maxPoolSize: 10,
  minPoolSize: 0,
  maxIdleTimeMS: 30000,

  serverSelectionTimeoutMS: 10000,

  connectTimeoutMS: 10000,

  socketTimeoutMS: 45000,

  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
};

// ============================================================
// MONGODB STATE
// ============================================================

let client = null;
let db = null;

let productsCollection = null;
let usersCollection = null;
let cartsCollection = null;
let ordersCollection = null;

let connectionPromise = null;

// ============================================================
// CONNECT DATABASE
// ============================================================

export const connectDB = async () => {
  // Already connected
  if (db) {
    return db;
  }

  // Connection already in progress
  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = (async () => {
    try {
      if (!client) {
        client = new MongoClient(MONGO_URI, mongoOptions);
      }

      await client.connect();

      db = client.db(DB_NAME);

      productsCollection = db.collection("products");
      usersCollection = db.collection("users");
      cartsCollection = db.collection("carts");
      ordersCollection = db.collection("orders");

      await db.command({
        ping: 1,
      });

      console.log("MongoDB connected successfully.");

      return db;
    } catch (error) {
      console.error("MongoDB connection error:", error?.stack || error);

      db = null;

      productsCollection = null;
      usersCollection = null;
      cartsCollection = null;
      ordersCollection = null;

      if (client) {
        try {
          await client.close();
        } catch (closeError) {
          console.error(
            "MongoDB cleanup error:",
            closeError?.message || closeError,
          );
        }
      }

      client = null;

      throw error;
    } finally {
      connectionPromise = null;
    }
  })();

  return connectionPromise;
};

// ============================================================
// INITIALIZE DATABASE BEFORE ROUTES
// ============================================================
//
// IMPORTANT:
//
// Route factories such as:
//
// authRoutes(usersCollection)
//
// need the MongoDB collections immediately.
//
// Therefore database connection MUST happen before
// registering those routes.
//
// This fixes:
//
// "usersCollection is required in authRoutes."
//
// ============================================================

await connectDB();

// ============================================================
// DATABASE SAFETY CHECK
// ============================================================

if (
  !client ||
  !db ||
  !productsCollection ||
  !usersCollection ||
  !cartsCollection ||
  !ordersCollection
) {
  throw new Error(
    "Database initialization failed: required collections are unavailable.",
  );
}

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
  productsRoutes(
    productsCollection,
    usersCollection,
    verifyToken,
    verifyUser,
    verifyAdmin,
  ),
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
    message: "API route not found.",
    path: req.originalUrl,
  });
});

// ============================================================
// GLOBAL ERROR HANDLER
// ============================================================

app.use((err, req, res, next) => {
  console.error("GLOBAL SERVER ERROR:", err?.stack || err);

  const statusCode =
    Number.isInteger(err?.status) && err.status >= 400 && err.status < 600
      ? err.status
      : 500;

  let message = "Internal Server Error.";

  if (!isProduction) {
    message = err?.message || "Internal Server Error.";
  } else {
    if (statusCode === 400) {
      message = "Bad Request.";
    } else if (statusCode === 401) {
      message = "Unauthorized.";
    } else if (statusCode === 403) {
      message = "Forbidden.";
    } else if (statusCode === 404) {
      message = "Not Found.";
    }
  }

  return res.status(statusCode).json({
    success: false,
    message,
  });
});

// ============================================================
// LOCAL DEVELOPMENT SERVER
// ============================================================

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Biscuit Shop API running on http://localhost:${PORT}`);
  });
}

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
