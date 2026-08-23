import "../config/env.js";

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { MongoClient, ServerApiVersion } from "mongodb";

// ============================================================
// ROUTES
// ============================================================

import authRoutes from "../routes/auth.routes.js";
import usersRoutes from "../routes/users.routes.js";
import productsRoutes from "../routes/products.routes.js";
import cartsRoutes from "../routes/carts.routes.js";
import ordersRoutes from "../routes/orders.routes.js";
import invoicesRoutes from "../routes/invoices.routes.js";
import adminRoutes from "../routes/admin.routes.js";

// ============================================================
// MIDDLEWARE
// ============================================================

import verifyToken from "../middleware/verifyToken.js";
import verifyUser from "../middleware/verifyUser.js";
import verifyAdmin from "../middleware/verifyAdmin.js";

// ============================================================
// APP
// ============================================================

const app = express();

app.disable("x-powered-by");

// ============================================================
// ENVIRONMENT
// ============================================================

const NODE_ENV = String(
  process.env.NODE_ENV || process.env.VERCEL_ENV || "development",
)
  .trim()
  .toLowerCase();

const isProduction = NODE_ENV === "production";

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

const missingEnv = requiredEnv.filter((key) => {
  const value = process.env[key];

  return typeof value !== "string" || !value.trim();
});

if (missingEnv.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missingEnv.join(", ")}`,
  );
}

// ============================================================
// ENVIRONMENT VALUES
// ============================================================

const DB_USERNAME = String(process.env.DB_USERNAME).trim();

const DB_PASS = String(process.env.DB_PASS);

const DB_NAME = String(process.env.DB_NAME).trim();

const CLIENT_URL = String(process.env.CLIENT_URL).trim().replace(/\/+$/, "");

const CLIENT_URL_PROD = String(process.env.CLIENT_URL_PROD)
  .trim()
  .replace(/\/+$/, "");

// ============================================================
// MONGODB URI
// ============================================================

const MONGO_URI =
  String(process.env.MONGODB_URI || "").trim() ||
  `mongodb+srv://${encodeURIComponent(DB_USERNAME)}:${encodeURIComponent(
    DB_PASS,
  )}@cluster0.g29mryf.mongodb.net/?retryWrites=true&w=majority`;

// ============================================================
// CORS
// ============================================================

const normalizeOrigin = (origin = "") => {
  if (typeof origin !== "string") {
    return "";
  }

  return origin.trim().replace(/\/+$/, "");
};

const allowedOrigins = new Set(
  [
    CLIENT_URL,
    CLIENT_URL_PROD,
    "http://localhost:5173",
    "http://localhost:5174",
  ]
    .filter(Boolean)
    .map(normalizeOrigin),
);

if (!isProduction) {
  console.log("Allowed CORS origins:", [...allowedOrigins]);
}

app.use(
  cors({
    origin(origin, callback) {
      // Requests without Origin header
      // Example: server-to-server / health checks
      if (!origin) {
        return callback(null, true);
      }

      const normalizedOrigin = normalizeOrigin(origin);

      if (allowedOrigins.has(normalizedOrigin)) {
        return callback(null, true);
      }

      console.warn(`CORS blocked request from: ${normalizedOrigin}`);

      const error = new Error("CORS_NOT_ALLOWED");

      return callback(error);
    },

    credentials: true,

    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],

    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
    ],

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

app.use(
  express.urlencoded({
    extended: true,
    limit: "2mb",
  }),
);

// ============================================================
// COOKIE PARSER
// ============================================================

app.use(cookieParser());

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
// DATABASE STATE
// ============================================================

let client = null;
let db = null;

let productsCollection = null;
let usersCollection = null;
let cartsCollection = null;
let ordersCollection = null;

let connectionPromise = null;
let routesMounted = false;

// ============================================================
// CONNECT TO MONGODB
// ============================================================

const connectDB = async () => {
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
      if (!isProduction) {
        console.log("Connecting to MongoDB...");
      }

      // Create MongoClient only once
      if (!client) {
        client = new MongoClient(MONGO_URI, mongoOptions);
      }

      await client.connect();

      const database = client.db(DB_NAME);

      await database.command({
        ping: 1,
      });

      db = database;

      // Collections
      productsCollection = db.collection("products");
      usersCollection = db.collection("users");
      cartsCollection = db.collection("carts");
      ordersCollection = db.collection("orders");

      if (!isProduction) {
        console.log("MongoDB connected successfully.");
        console.log(`Database: ${DB_NAME}`);
      }

      return db;
    } catch (error) {
      console.error("MongoDB connection failed:", error?.stack || error);

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
            "MongoDB close error:",
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
// MOUNT ROUTES
// ============================================================

const mountRoutes = () => {
  // Prevent duplicate mounting
  if (routesMounted) {
    return;
  }

  // Make sure database is ready
  if (
    !productsCollection ||
    !usersCollection ||
    !cartsCollection ||
    !ordersCollection
  ) {
    throw new Error(
      "MongoDB collections are unavailable. Routes cannot be mounted.",
    );
  }

  // ==========================================================
  // AUTH
  // ==========================================================

  app.use("/auth", authRoutes(usersCollection));

  // ==========================================================
  // USERS
  // ==========================================================

  app.use("/users", usersRoutes(usersCollection));

  // ==========================================================
  // PRODUCTS
  // ==========================================================

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

  // ==========================================================
  // CARTS
  // ==========================================================
  app.use(
    "/carts",
    cartsRoutes(cartsCollection, productsCollection, verifyToken),
  );

  // ==========================================================
  // ORDERS
  // ==========================================================

  app.use(
    "/orders",
    ordersRoutes(
      client,
      ordersCollection,
      cartsCollection,
      productsCollection,
      usersCollection,
    ),
  );

  // ==========================================================
  // ADMIN
  // ==========================================================

  app.use(
    "/admin",
    adminRoutes(
      ordersCollection,
      usersCollection,
      productsCollection,
      verifyToken,
      verifyAdmin,
    ),
  );

  // ==========================================================
  // INVOICE
  // ==========================================================

  app.use("/invoices", invoicesRoutes(ordersCollection, verifyToken));

  routesMounted = true;

  if (!isProduction) {
    console.log("All application routes mounted.");
  }
};

// ============================================================
// ROOT HEALTH CHECK
// ============================================================

app.get("/", (req, res) => {
  return res.status(200).json({
    success: true,
    message: "Biscuit Shop API Running",
    environment: NODE_ENV,
    database: db ? "connected" : "disconnected",
    routesMounted,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================
// API STATUS
// ============================================================

app.get("/api-status", (req, res) => {
  return res.status(200).json({
    success: true,
    message: "API is working.",
    environment: NODE_ENV,
    database: db ? "connected" : "disconnected",
    routesMounted,

    routes: [
      "/auth",
      "/users",
      "/products",
      "/carts",
      "/orders",
      "/admin",
      "/invoice",
    ],
  });
});

// ============================================================
// DATABASE INITIALIZATION
// ============================================================

try {
  await connectDB();

  // Routes must be mounted before 404 handler
  mountRoutes();
} catch (error) {
  console.error("INITIAL APPLICATION STARTUP FAILED:", error?.stack || error);

  throw error;
}

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

  // ==========================================================
  // CORS ERROR
  // ==========================================================

  if (err?.message === "CORS_NOT_ALLOWED") {
    return res.status(403).json({
      success: false,
      message: "CORS policy blocked this request.",
    });
  }

  // ==========================================================
  // STATUS CODE
  // ==========================================================

  const statusCode =
    Number.isInteger(err?.status) && err.status >= 400 && err.status < 600
      ? err.status
      : 500;

  // ==========================================================
  // PRODUCTION ERROR
  // ==========================================================

  if (isProduction) {
    const productionMessages = {
      400: "Bad Request.",
      401: "Unauthorized.",
      403: "Forbidden.",
      404: "Not Found.",
      500: "Internal Server Error.",
      503: "Service Unavailable.",
    };

    return res.status(statusCode).json({
      success: false,
      message: productionMessages[statusCode] || "Internal Server Error.",
    });
  }

  // ==========================================================
  // DEVELOPMENT ERROR
  // ==========================================================

  return res.status(statusCode).json({
    success: false,
    message: err?.message || "Internal Server Error.",
  });
});

// ============================================================
// EXPORTS
// ============================================================

export {
  app,
  connectDB,
  client,
  db,
  productsCollection,
  usersCollection,
  cartsCollection,
  ordersCollection,
};

export default app;
