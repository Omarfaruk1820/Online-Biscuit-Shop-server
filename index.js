import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import { MongoClient, ServerApiVersion, ObjectId } from "mongodb";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// ====================== MIDDLEWARE ======================
const requiredEnv = ["DB_USERNAME", "DB_PASS", "JWT_SECRET", "CLIENT_URL"];

requiredEnv.forEach((key) => {
  if (!process.env[key]) {
    throw new Error(`❌ Missing env variable: ${key}`);
  }
});

// ====================== MIDDLEWARE ======================
app.use(express.json());
app.use(cookieParser());

// ✅ PRODUCTION SAFE CORS
app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  }),
);

const DB_NAME = process.env.DB_NAME || "biscuit_shop_db";

// ================= URI =================
const uri = `mongodb+srv://${encodeURIComponent(
  process.env.DB_USERNAME,
)}:${encodeURIComponent(
  process.env.DB_PASS,
)}@cluster0.g29mryf.mongodb.net/${DB_NAME}?retryWrites=true&w=majority`;

// ================= SINGLETON =================
let client;
let db;
let isConnected = false;

// ================= COLLECTIONS =================
export let productsCollection;
export let usersCollection;
export let ordersCollection;
export let cartsCollection;

// ================= CONNECT DB =================
export async function connectDB() {
  try {
    if (isConnected && db) {
      console.log("⚡ MongoDB already connected");
      return db;
    }

    client = new MongoClient(uri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
      maxPoolSize: 20,
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000,
    });

    await client.connect();

    db = client.db(DB_NAME);

    // ================= COLLECTIONS =================

    productsCollection = db.collection("products");
    usersCollection = db.collection("users");
    ordersCollection = db.collection("orders");
    cartsCollection = db.collection("carts");

    // ================= HEALTH CHECK =================
    await db.command({ ping: 1 });

    isConnected = true;

    console.log("✅ MongoDB Connected Successfully");

    return db;
  } catch (error) {
    console.error("❌ MongoDB Connection Error:", error);

    isConnected = false;
    db = null;

    process.exit(1);
  }
}

// ====================== JWT HELPERS ======================

export const createToken = (user) => {
  return jwt.sign(
    {
      email: user.email,
      role: user.role,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "7d",
    },
  );
};

const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;

  //   console.log("TOKEN:", token); // 🔍 debug

  if (!token) {
    return res.status(403).json({ message: "No token" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ message: "Invalid token" });
    }

    req.user = decoded;
    next();
  });
};

export const verifyAdmin = async (req, res, next) => {
  try {
    if (!req.user?.email) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized user",
      });
    }

    const { db } = await connectDB();

    const user = await db
      .collection("users")
      .findOne({ email: req.user.email }, { projection: { role: 1 } });

    if (!user) {
      return res.status(403).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin only access",
      });
    }

    next();
  } catch (error) {
    console.error("verifyAdmin error:", error);

    return res.status(500).json({
      success: false,
      message: "Admin verification failed",
    });
  }
};

// ====================== ROUTES ======================

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "🍪 Biscuit API Running",
  });
});

// ====================== AUTH ======================

// Login / Issue JWT

app.post("/jwt", (req, res) => {
  const { email } = req.body;

  const token = jwt.sign({ email }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });

  res.cookie("token", token, {
    httpOnly: true,
    secure: false, // ❗ localhost → false
    sameSite: "lax", // ❗ VERY IMPORTANT
  });

  res.send({ success: true });
});

// Logout
app.post("/logout", (req, res) => {
  try {
    const isProd = process.env.NODE_ENV === "production";

    res.clearCookie("token", {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "none" : "lax",
    });

    res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("Logout error:", error);

    res.status(500).json({
      success: false,
      message: "Logout failed",
    });
  }
});

// ====================== PRODUCTS ======================

// GET ALL PRODUCTS (public)
app.get("/products", async (req, res) => {
  try {
    const { page = 1, limit = 8, search = "" } = req.query;

    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);

    if (!productsCollection) {
      return res.status(500).json({
        success: false,
        message: "Database not initialized",
      });
    }

    // 🔍 search support
    const query = search
      ? {
          name: { $regex: search, $options: "i" },
        }
      : {};

    const products = await productsCollection
      .find(query)
      .skip((pageNumber - 1) * limitNumber)
      .limit(limitNumber)
      .toArray();

    const total = await productsCollection.countDocuments(query);

    res.json({
      success: true,
      data: products,
      pagination: {
        total,
        page: pageNumber,
        limit: limitNumber,
        totalPages: Math.ceil(total / limitNumber),
      },
    });
  } catch (error) {
    console.error("GET /products error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch products",
    });
  }
});

app.get("/products/my", verifyToken, async (req, res) => {
  try {
    const email = req.user?.email;

    if (!email) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized user (no email in token)",
      });
    }

    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 6);

    const pageNum = Math.max(1, page);
    const limitNum = Math.min(50, Math.max(1, limit));
    const skip = (pageNum - 1) * limitNum;

    const query = { createdBy: email };

    const [products, total] = await Promise.all([
      productsCollection
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .toArray(),

      productsCollection.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
      data: products,
    });
  } catch (error) {
    console.error("PRODUCT MY ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Server error while fetching products",
    });
  }
});

app.get("/products/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // ================= VALIDATION =================
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID format",
      });
    }

    // ================= DB CHECK =================
    if (!productsCollection) {
      return res.status(500).json({
        success: false,
        message: "Database not initialized",
      });
    }

    // ================= FETCH =================
    const product = await productsCollection.findOne({
      _id: new ObjectId(id),
    });

    // ================= NOT FOUND =================
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // ================= SUCCESS =================
    res.status(200).json({
      success: true,
      data: product,
    });
  } catch (error) {
    console.error("GET /products/:id ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch product",
    });
  }
});

app.post("/products", verifyToken, verifyAdmin, async (req, res) => {
  try {
    if (!req.user?.email) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const {
      name,
      price,
      stock = 0,
      image = "",
      rating = 4.5,
      category = "biscuit",
      reviews = 0,
      brand = "",
      weight = "",
      description = "",
      ingredients = "",
      expiry = "",
      discount = 0,
    } = req.body;

    if (!name || price == null) {
      return res.status(400).json({
        success: false,
        message: "Name and price required",
      });
    }

    const product = {
      name: name.trim(),
      price: Number(price),
      stock: Number(stock),
      image: image.trim(),
      rating: Number(rating),
      category,
      reviews: Number(reviews),
      brand: brand.trim(),
      weight: weight.trim(),
      description: description.trim(),
      ingredients: ingredients.trim(),
      expiry,
      discount: Number(discount),

      createdBy: req.user.email,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await productsCollection.insertOne(product);

    return res.status(201).json({
      success: true,
      message: "Product created successfully",
      data: result,
    });
  } catch (error) {
    console.error("PRODUCT POST ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});
// GET SINGLE PRODUCT

// ADD PRODUCT (admin)

app.post("/users", async (req, res) => {
  try {
    const user = req.body;

    if (!user?.email) {
      return res.status(400).send({ message: "Email required" });
    }

    const filter = { email: user.email };

    const updateDoc = {
      $set: {
        name: user.name,
        email: user.email,
        photo: user.photo || "",
        provider: user.provider || "password",
        lastLogin: new Date(),
      },
      $setOnInsert: {
        role: "user",
        createdAt: new Date(),
      },
    };

    const options = { upsert: true };

    const result = await usersCollection.updateOne(filter, updateDoc, options);

    res.status(200).json({
      success: true,
      message: "User saved successfully",
      data: result,
    });
  } catch (error) {
    console.error("POST /users error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

app.patch("/users/role/:id", async (req, res) => {
  try {
    const id = req.params.id;

    // ================= VALIDATION =================
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    if (!usersCollection) {
      return res.status(500).json({
        success: false,
        message: "Database not initialized",
      });
    }

    // ================= FIND USER =================
    const user = await usersCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // ================= TOGGLE ROLE =================
    const newRole = user.role === "admin" ? "user" : "admin";

    const result = await usersCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          role: newRole,
          updatedAt: new Date(),
        },
      },
    );

    res.status(200).json({
      success: true,
      message: `User role changed to ${newRole}`,
      data: result,
      newRole,
    });
  } catch (error) {
    console.error("PATCH /users/role ERROR:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

app.get("/users", verifyToken, async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "" } = req.query;

    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);

    const query = search
      ? {
          email: { $regex: search, $options: "i" },
        }
      : {};

    const users = await usersCollection
      .find(query)
      .sort({ createdAt: -1 })
      .skip((pageNumber - 1) * limitNumber)
      .limit(limitNumber)
      .toArray();

    const total = await usersCollection.countDocuments(query);

    res.status(200).json({
      success: true,
      data: users,
      pagination: {
        total,
        page: pageNumber,
        limit: limitNumber,
        totalPages: Math.ceil(total / limitNumber),
      },
    });
  } catch (error) {
    console.error("GET /users error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch users",
    });
  }
});

//======================CART======================
// app.post("/carts", verifyToken, async (req, res) => {
//   try {
//     const { db } = await connectDB();
//     const { productId, quantity = 1 } = req.body;

//     if (!productId) {
//       return res.status(400).json({
//         success: false,
//         message: "Product ID required",
//       });
//     }

//     if (!ObjectId.isValid(productId)) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid product ID",
//       });
//     }

//     const product = await db
//       .collection("products")
//       .findOne({ _id: new ObjectId(productId) });

//     if (!product) {
//       return res.status(404).json({
//         success: false,
//         message: "Product not found",
//       });
//     }

//     const cartItem = {
//       email: req.user.email,
//       productId: new ObjectId(productId),
//       name: product.name,
//       price: product.price,
//       image: product.image,
//       discount: product.discount || 0,
//       quantity: Number(quantity),
//       createdAt: new Date(),
//     };

//     const result = await db.collection("carts").insertOne(cartItem);

//     res.status(201).json({
//       success: true,
//       message: "Added to cart",
//       data: result,
//     });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({
//       success: false,
//       message: "Failed to add to cart",
//     });
//   }
// });
app.get("/carts", verifyToken, async (req, res) => {
  try {
    const email = req.user.email;

    const cart = await cartsCollection.find({ email }).toArray();

    let totalItems = 0;
    let totalQuantity = 0;
    let totalPrice = 0;

    const formattedCart = cart.map((item) => {
      const price = item.price - (item.price * (item.discount || 0)) / 100;
      const subtotal = price * item.quantity;

      totalItems += 1;
      totalQuantity += item.quantity;
      totalPrice += subtotal;

      return {
        ...item,
        finalPrice: Number(price.toFixed(2)),
        subtotal: Number(subtotal.toFixed(2)),
      };
    });

    res.send({
      success: true,
      data: formattedCart,
      summary: {
        totalItems,
        totalQuantity,
        totalPrice: Number(totalPrice.toFixed(2)),
      },
    });
  } catch (err) {
    res.status(500).send({
      success: false,
      message: err.message,
    });
  }
});

app.post("/carts", verifyToken, async (req, res) => {
  try {
    const email = req.user.email;
    const { productId, quantity = 1 } = req.body;

    if (!ObjectId.isValid(productId)) {
      return res.status(400).send({
        success: false,
        message: "Invalid product ID",
      });
    }

    const product = await productsCollection.findOne({
      _id: new ObjectId(productId),
    });

    if (!product) {
      return res.status(404).send({
        success: false,
        message: "Product not found",
      });
    }

    const qty = Number(quantity);
    if (isNaN(qty) || qty <= 0) {
      return res.status(400).send({
        success: false,
        message: "Invalid quantity",
      });
    }

    const existing = await cartsCollection.findOne({
      email,
      productId: new ObjectId(productId),
    });

    if (existing) {
      await cartsCollection.updateOne(
        { _id: existing._id },
        {
          $inc: { quantity: qty },
          $set: { updatedAt: new Date() },
        },
      );

      return res.send({
        success: true,
        message: "Cart updated",
      });
    }

    await cartsCollection.insertOne({
      email,
      productId: new ObjectId(productId),
      name: product.name,
      price: Number(product.price),
      discount: Number(product.discount || 0),
      image: product.image,
      quantity: qty,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    res.status(201).send({
      success: true,
      message: "Added to cart",
    });
  } catch (err) {
    res.status(500).send({
      success: false,
      message: err.message,
    });
  }
});

app.delete("/carts/:id", verifyToken, async (req, res) => {
  try {
    const email = req.user.email;
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        success: false,
        message: "Invalid cart ID",
      });
    }

    const result = await cartsCollection.deleteOne({
      _id: new ObjectId(id),
      email,
    });

    res.send({
      success: true,
      message: "Item removed",
      deletedCount: result.deletedCount,
    });
  } catch (err) {
    res.status(500).send({
      success: false,
      message: err.message,
    });
  }
});
app.get("/orders", verifyToken, async (req, res) => {
  try {
    if (!ordersCollection) {
      return res.status(500).send({
        success: false,
        message: "DB not initialized. connectDB missing",
      });
    }

    let { status = "all", page = 1, limit = 10, search = "" } = req.query;

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(50, Math.max(1, Number(limit)));
    const skip = (pageNum - 1) * limitNum;

    const query = {};

    // ✅ STATUS FILTER
    if (status !== "all") {
      query.status = status;
    }

    // ✅ SEARCH SAFE
    if (search && search.trim() !== "") {
      const safe = search.trim();

      query.$or = [
        { email: { $regex: safe, $options: "i" } },
        { "customer.phone": { $regex: safe, $options: "i" } },
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

    res.status(200).send({
      success: true,
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
      data: orders,
    });
  } catch (error) {
    console.error("❌ GET /orders error:", error);

    res.status(500).send({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
});

app.post("/orders", verifyToken, async (req, res) => {
  const session = client.startSession();

  try {
    const email = req.user?.email;
    const { customer } = req.body;

    // ================= VALIDATION =================
    if (!customer?.name || !customer?.phone || !customer?.address) {
      return res.status(400).send({
        success: false,
        message: "Customer information required",
      });
    }

    // ================= GET CART =================
    const cartItems = await cartsCollection.find({ email }).toArray();

    if (!cartItems.length) {
      return res.status(400).send({
        success: false,
        message: "Cart is empty",
      });
    }

    // ================= FETCH PRODUCTS SAFELY =================
    const itemsWithProducts = await Promise.all(
      cartItems.map(async (item) => {
        if (!ObjectId.isValid(item.productId)) return null;

        const product = await productsCollection.findOne({
          _id: new ObjectId(item.productId),
        });

        if (!product) return null;

        const price =
          product.price - (product.price * (product.discount || 0)) / 100;

        const subtotal = price * item.quantity;

        return {
          productId: product._id,
          name: product.name,
          price: product.price,
          discount: product.discount || 0,
          image: product.image,
          quantity: item.quantity,
          subtotal: Number(subtotal.toFixed(2)),
        };
      }),
    );

    // ================= CLEAN ITEMS =================
    const safeItems = itemsWithProducts.filter(Boolean);

    if (!safeItems.length) {
      return res.status(400).send({
        success: false,
        message: "No valid products in cart",
      });
    }

    const total = safeItems.reduce((acc, item) => acc + item.subtotal, 0);

    // ================= TRANSACTION =================
    await session.withTransaction(async () => {
      await ordersCollection.insertOne(
        {
          email,
          customer,
          items: safeItems,
          total: Number(total.toFixed(2)),
          status: "pending",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        { session },
      );

      await cartsCollection.deleteMany({ email }, { session });
    });

    res.status(201).send({
      success: true,
      message: "Order placed successfully",
    });
  } catch (error) {
    console.error("ORDER ERROR:", error);

    res.status(500).send({
      success: false,
      message: error.message || "Order failed",
    });
  } finally {
    await session.endSession();
  }
});

app.patch("/orders/cancel/:id", verifyToken, async (req, res) => {
  try {
    const email = req.user?.email;
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        success: false,
        message: "Invalid order ID",
      });
    }

    const order = await ordersCollection.findOne({
      _id: new ObjectId(id),
      email,
    });

    if (!order) {
      return res.status(404).send({
        success: false,
        message: "Order not found",
      });
    }

    if (order.status !== "pending") {
      return res.status(400).send({
        success: false,
        message: "Only pending orders can be cancelled",
      });
    }

    await ordersCollection.updateOne(
      { _id: new ObjectId(id), email },
      {
        $set: {
          status: "cancelled",
          updatedAt: new Date(),
        },
      },
    );

    res.send({
      success: true,
      message: "Order cancelled",
    });
  } catch (error) {
    console.error(error);

    res.status(500).send({
      success: false,
      message: "Cancel failed",
    });
  }
});

app.get("/orders/my", verifyToken, async (req, res) => {
  try {
    const email = req.user?.email;

    if (!email) {
      return res.status(401).send({
        success: false,
        message: "Unauthorized",
      });
    }

    const { status = "all" } = req.query;

    const query = { email };

    if (status !== "all") {
      query.status = status;
    }

    const orders = await ordersCollection
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).send({
      success: true,
      count: orders.length,
      data: orders,
    });
  } catch (error) {
    console.error(error);

    res.status(500).send({
      success: false,
      message: "Failed to fetch orders",
    });
  }
});

// ====================== START ======================
connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("DB connection failed:", err);
  });

export default app;
