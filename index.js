import "./config/env.js";

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import firebaseAdmin from "./utils/firebaseAdmin.js";

import { MongoClient, ServerApiVersion } from "mongodb";

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

const app = express();

app.disable("x-powered-by");

const NODE_ENV = process.env.NODE_ENV?.trim() || "development";

const requiredEnv = [
  "DB_USERNAME",
  "DB_PASS",
  "DB_NAME",
  "JWT_SECRET",
  "CLIENT_URL",
  "CLIENT_URL_PROD",
];

for (const key of requiredEnv) {
  if (typeof process.env[key] !== "string" || !process.env[key].trim()) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const DB_USERNAME = process.env.DB_USERNAME.trim();
const DB_PASS = process.env.DB_PASS;
const DB_NAME = process.env.DB_NAME.trim();

const CLIENT_URL = process.env.CLIENT_URL.trim();
const CLIENT_URL_PROD = process.env.CLIENT_URL_PROD.trim();

const allowedOrigins = [
  process.env.CLIENT_URL,
  process.env.CLIENT_URL_PROD,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Postman/server-to-server requests
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`CORS blocked for origin: ${origin}`), false);
    },
    credentials: true,
  }),
);

app.use(
  express.json({
    limit: "2mb",
  }),
);

app.use(cookieParser());

const uri =
  `mongodb+srv://${encodeURIComponent(DB_USERNAME)}` +
  `:${encodeURIComponent(DB_PASS)}` +
  `@cluster0.g29mryf.mongodb.net/` +
  `?retryWrites=true&w=majority`;

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

let isConnecting = false;

const createIndexIfMissing = async (collection, key, options = {}) => {
  if (!collection) {
    throw new Error("Collection is required for index creation.");
  }

  try {
    const indexes = await collection.indexes();

    const exists = indexes.some(
      (index) => JSON.stringify(index.key) === JSON.stringify(key),
    );

    if (exists) {
      return;
    }

    await collection.createIndex(key, options);

    console.log(`MongoDB index created: ${collection.collectionName}`, key);
  } catch (error) {
    console.error(
      `MongoDB index creation failed: ${collection.collectionName}`,
      error?.message || error,
    );

    throw error;
  }
};

const createDatabaseIndexes = async () => {
  if (
    !usersCollection ||
    !productsCollection ||
    !cartsCollection ||
    !ordersCollection
  ) {
    throw new Error("Database collections are not initialized.");
  }

  await Promise.all([
    createIndexIfMissing(usersCollection, { email: 1 }, { unique: true }),

    createIndexIfMissing(usersCollection, { role: 1 }),

    createIndexIfMissing(usersCollection, { status: 1 }),

    createIndexIfMissing(usersCollection, { createdAt: -1 }),

    createIndexIfMissing(usersCollection, { lastLogin: -1 }),

    createIndexIfMissing(productsCollection, { category: 1 }),

    createIndexIfMissing(productsCollection, { brand: 1 }),

    createIndexIfMissing(productsCollection, { price: 1 }),

    createIndexIfMissing(productsCollection, { rating: -1 }),

    createIndexIfMissing(productsCollection, { discount: -1 }),

    createIndexIfMissing(productsCollection, { stock: 1 }),

    createIndexIfMissing(productsCollection, { createdAt: -1 }),

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

  console.log("MongoDB database indexes are ready.");
};

export const connectDB = async () => {
  // Already connected.
  if (db) {
    return db;
  }

  // Prevent duplicate connection attempts.
  if (isConnecting) {
    while (isConnecting) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    if (db) {
      return db;
    }
  }

  isConnecting = true;

  try {
    if (!client) {
      client = new MongoClient(uri, mongoOptions);
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

    await createDatabaseIndexes();

    return db;
  } catch (error) {
    console.error("MongoDB connection error:", error?.message || error);

    db = null;

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
    isConnecting = false;
  }
};

await connectDB();

app.get("/", (req, res) => {
  return res.status(200).json({
    success: true,
    message: "Biscuit Shop API Running",
    environment: NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

app.use("/auth", authRoutes(usersCollection));

app.use("/users", usersRoutes(usersCollection));

app.use(
  "/products",
  productsRoutes(productsCollection, verifyToken, verifyUser, verifyAdmin),
);

app.use(
  "/carts",
  cartsRoutes(cartsCollection, productsCollection, verifyToken),
);

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

app.use("/invoice", invoiceRoutes(ordersCollection, verifyToken));

app.use((req, res) => {
  return res.status(404).json({
    success: false,
    message: "API route not found.",
    path: req.originalUrl,
  });
});

app.use((err, req, res, next) => {
  console.error("GLOBAL SERVER ERROR:", err?.stack || err);

  const statusCode =
    Number.isInteger(err?.status) && err.status >= 400 && err.status < 600
      ? err.status
      : 500;

  let message = "Internal Server Error.";

  if (NODE_ENV !== "production") {
    message = err?.message || "Internal Server Error.";
  } else if (statusCode === 403) {
    message = "Forbidden.";
  } else if (statusCode === 400) {
    message = "Bad Request.";
  } else if (statusCode === 401) {
    message = "Unauthorized.";
  } else if (statusCode === 404) {
    message = "Not Found.";
  }

  return res.status(statusCode).json({
    success: false,
    message,
  });
});

const closeDatabase = async (signal) => {
  console.log(`${signal} received. Closing MongoDB connection...`);

  try {
    if (client) {
      await client.close();

      client = null;
      db = null;

      productsCollection = null;
      usersCollection = null;
      cartsCollection = null;
      ordersCollection = null;

      console.log("MongoDB connection closed successfully.");
    }

    process.exit(0);
  } catch (error) {
    console.error("Error while closing MongoDB:", error?.message || error);

    process.exit(1);
  }
};

process.once("SIGINT", () => {
  void closeDatabase("SIGINT");
});

process.once("SIGTERM", () => {
  void closeDatabase("SIGTERM");
});

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
