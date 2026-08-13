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
// EXPRESS APP
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
// ENV VALUES
// ============================================================

const DB_USERNAME = process.env.DB_USERNAME.trim();
const DB_PASS = process.env.DB_PASS;
const DB_NAME = process.env.DB_NAME.trim();

const CLIENT_URL = process.env.CLIENT_URL.trim();
const CLIENT_URL_PROD = process.env.CLIENT_URL_PROD.trim();

// ============================================================
// CORS
// ============================================================

const normalizeOrigin = (origin = "") => {
  if (typeof origin !== "string") {
    return "";
  }

  return origin.trim().replace(/\/$/, "");
};

const allowedOrigins = [CLIENT_URL, CLIENT_URL_PROD]
  .map(normalizeOrigin)
  .filter(Boolean);

console.log("Environment:", NODE_ENV);
console.log("Allowed CORS origins:", allowedOrigins);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow server-to-server / health-check requests
      if (!origin) {
        return callback(null, true);
      }

      const normalizedOrigin = normalizeOrigin(origin);

      if (allowedOrigins.includes(normalizedOrigin)) {
        return callback(null, true);
      }

      console.warn("CORS blocked:", origin);

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

app.use(
  express.urlencoded({
    extended: true,
    limit: "2mb",
  }),
);

app.use(cookieParser());

// ============================================================
// MONGODB CONNECTION
// ============================================================

const MONGO_URI =
  `mongodb+srv://${encodeURIComponent(DB_USERNAME)}` +
  `:${encodeURIComponent(DB_PASS)}` +
  `@cluster0.g29mryf.mongodb.net/` +
  `?retryWrites=true&w=majority`;

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
// CONNECT DATABASE
// ============================================================

const connectDB = async () => {
  // Already connected
  if (db) {
    return db;
  }

  // Connection already running
  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = (async () => {
    try {
      console.log("Connecting to MongoDB...");

      if (!client) {
        client = new MongoClient(MONGO_URI, mongoOptions);
      }

      await client.connect();

      const database = client.db(DB_NAME);

      // Verify connection
      await database.command({
        ping: 1,
      });

      db = database;

      productsCollection = db.collection("products");
      usersCollection = db.collection("users");
      cartsCollection = db.collection("carts");
      ordersCollection = db.collection("orders");

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
// MOUNT ROUTES
// ============================================================

const mountRoutes = () => {
  if (routesMounted) {
    return;
  }

  if (
    !productsCollection ||
    !usersCollection ||
    !cartsCollection ||
    !ordersCollection
  ) {
    throw new Error(
      "Cannot mount routes because MongoDB collections are unavailable.",
    );
  }

  // ----------------------------------------------------------
  // AUTH
  // ----------------------------------------------------------

  app.use("/auth", authRoutes(usersCollection));

  // ----------------------------------------------------------
  // USERS
  // ----------------------------------------------------------

  app.use("/users", usersRoutes(usersCollection));

  // ----------------------------------------------------------
  // PRODUCTS
  // ----------------------------------------------------------

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

  // ----------------------------------------------------------
  // CARTS
  // ----------------------------------------------------------

  app.use(
    "/carts",
    cartsRoutes(cartsCollection, productsCollection, verifyToken),
  );

  // ----------------------------------------------------------
  // ORDERS
  // ----------------------------------------------------------

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

  // ----------------------------------------------------------
  // ADMIN
  // ----------------------------------------------------------

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

  // ----------------------------------------------------------
  // INVOICE
  // ----------------------------------------------------------

  app.use("/invoice", invoiceRoutes(ordersCollection, verifyToken));

  routesMounted = true;

  console.log("Application routes mounted successfully.");
};

// ============================================================
// INITIALIZATION
// ============================================================

let initializationPromise = null;

const initializeApplication = async () => {
  if (routesMounted) {
    return;
  }

  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    try {
      await connectDB();

      mountRoutes();
    } catch (error) {
      console.error("APPLICATION INITIALIZATION ERROR:", error?.stack || error);

      throw error;
    } finally {
      initializationPromise = null;
    }
  })();

  return initializationPromise;
};

// ============================================================
// HEALTH CHECK
// ============================================================

app.get("/", async (req, res) => {
  try {
    await initializeApplication();

    return res.status(200).json({
      success: true,
      message: "Biscuit Shop API Running",
      environment: NODE_ENV,
      database: db ? "connected" : "disconnected",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("GET / HEALTH CHECK ERROR:", error?.stack || error);

    return res.status(500).json({
      success: false,
      message: "Server initialization failed.",
    });
  }
});

// ============================================================
// INITIALIZATION MIDDLEWARE
// ============================================================

app.use(async (req, res, next) => {
  try {
    await initializeApplication();

    return next();
  } catch (error) {
    console.error("REQUEST INITIALIZATION ERROR:", error?.stack || error);

    return res.status(500).json({
      success: false,
      message: "Server initialization failed.",
    });
  }
});

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
    switch (statusCode) {
      case 400:
        message = "Bad Request.";
        break;

      case 401:
        message = "Unauthorized.";
        break;

      case 403:
        message = "Forbidden.";
        break;

      case 404:
        message = "Not Found.";
        break;

      default:
        message = "Internal Server Error.";
    }
  }

  return res.status(statusCode).json({
    success: false,
    message,
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
