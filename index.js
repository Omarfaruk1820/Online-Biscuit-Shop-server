import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import PDFDocument from "pdfkit";
import { MongoClient, ServerApiVersion, ObjectId } from "mongodb";

dotenv.config();

const app = express();

// ================= MIDDLEWARE =================

app.use(express.json());

app.use(cookieParser());

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://biscuit-shop-kumarkhali.web.app",
    ],
    credentials: true,
  }),
);

// ================= ENV CHECK =================

const requiredEnv = ["DB_USERNAME", "DB_PASS", "JWT_SECRET"];

requiredEnv.forEach((key) => {
  if (!process.env[key]) {
    throw new Error(`❌ Missing env variable: ${key}`);
  }
});

// ================= DATABASE =================

const DB_NAME = process.env.DB_NAME || "biscuit_shop_db";

const uri = `mongodb+srv://${encodeURIComponent(
  process.env.DB_USERNAME,
)}:${encodeURIComponent(
  process.env.DB_PASS,
)}@cluster0.g29mryf.mongodb.net/${DB_NAME}?retryWrites=true&w=majority`;

let client;
let db;

// collections

let productsCollection;
let usersCollection;
let cartsCollection;
let ordersCollection;

// ================= CONNECT DB =================

export async function connectDB() {
  try {
    if (db) {
      console.log("⚡ MongoDB already connected");
      return db;
    }

    client = new MongoClient(uri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
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

    console.log("✅ MongoDB Connected");

    return db;
  } catch (error) {
    console.error("❌ MongoDB Connection Error:", error);
    throw error;
  }
  //     db.carts.deleteMany({
  //   name: null
  // });

  // db.carts.deleteMany({})
  // await cartsCollection.createIndex({ email: 1 });
  // await cartsCollection.createIndex({ email: 1, productId: 1 });
}

// Initialize database connection
connectDB();

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

// ================= JWT =================

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

// ================= VERIFY TOKEN =================

export const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).send({
      success: false,
      message: "Unauthorized",
    });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).send({
        success: false,
        message: "Invalid token",
      });
    }

    req.user = decoded;

    next();
  });
};

// ================= VERIFY ADMIN =================

export const verifyAdmin = async (req, res, next) => {
  try {
    const user = await usersCollection.findOne({
      email: req.user.email,
    });

    if (!user || user.role !== "admin") {
      return res.status(403).send({
        success: false,
        message: "Admin only",
      });
    }

    next();
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Admin verification failed",
    });
  }
};
// ====================== AUTH ROUTES ======================

// Generate JWT + Set Cookie
app.post("/jwt", async (req, res) => {
  try {
    const user = req.body;

    if (!user?.email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const token = createToken({
      email: user.email,
      role: user.role || "user",
    });

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.status(200).json({
      success: true,
      message: "Login successful",
      token,
    });
  } catch (error) {
    console.error("JWT ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Failed to generate token",
    });
  }
});

// Logout + Clear Cookie
app.post("/logout", (req, res) => {
  try {
    res.clearCookie("token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
    });

    res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("LOGOUT ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Logout failed",
    });
  }
});

// ====================== PRODUCTS ======================
app.get("/products", async (req, res) => {
  try {
    let { page = 1, limit = 8, search = "", category = "" } = req.query;

    // =========================
    // SAFE NUMBER CONVERSION
    // =========================
    page = Math.max(1, parseInt(page) || 1);

    // ⚡ limit cap (VERY IMPORTANT for VERCEL)
    limit = Math.min(20, Math.max(1, parseInt(limit) || 8));

    const skip = (page - 1) * limit;

    // =========================
    // BUILD QUERY SAFELY
    // =========================
    const query = {};

    if (search && search.trim()) {
      const cleanSearch = search.trim();

      query.name = {
        $regex: cleanSearch,
        $options: "i",
      };
    }

    if (category && category.trim()) {
      query.category = category.trim().toLowerCase();
    }

    // =========================
    // FETCH DATA (FAST QUERY)
    // =========================
    const products = await productsCollection
      .find(query)
      .sort({ _id: -1 }) // ⚡ FASTER than createdAt (no index dependency)
      .skip(skip)
      .limit(limit)
      .toArray();

    // =========================
    // COUNT (optional optimization)
    // =========================
    const total = await productsCollection.countDocuments(query);

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
    console.error("PRODUCTS API ERROR:", error);

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
        message: "Invalid product ID",
      });
    }

    const product = await productsCollection.findOne(
      { _id: new ObjectId(id) },
      { projection: { __v: 0 } },
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    res.status(200).json({
      success: true,
      data: product,
    });
  } catch (error) {
    console.error("GET /products/:id error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch product",
    });
  }
});

app.post("/products", verifyToken, verifyAdmin, async (req, res) => {
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

    if (!name || price == null) {
      return res.status(400).json({
        success: false,
        message: "Name and price required",
      });
    }

    const newProduct = {
      name: name.trim(),
      price: Number(price),
      stock: Number(stock),
      image: image.trim(),
      rating: Math.min(5, Math.max(0, Number(rating))),
      category: category.toLowerCase(),
      reviews: Number(reviews),
      brand: brand.trim(),
      weight,
      description,
      ingredients,
      expiry,
      discount: Math.min(100, Math.max(0, Number(discount))),
      createdBy: req.user.email,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await productsCollection.insertOne(newProduct);

    res.status(201).json({
      success: true,
      message: "Product created successfully",
      insertedId: result.insertedId,
    });
  } catch (error) {
    console.error("POST /products error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create product",
    });
  }
});
app.patch("/products/:id", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID",
      });
    }

    // ❌ block dangerous fields
    const { _id, createdAt, createdBy, ...safeUpdates } = req.body;

    if (safeUpdates.price) safeUpdates.price = Number(safeUpdates.price);
    if (safeUpdates.stock) safeUpdates.stock = Number(safeUpdates.stock);
    if (safeUpdates.rating) safeUpdates.rating = Number(safeUpdates.rating);

    const result = await productsCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          ...safeUpdates,
          updatedAt: new Date(),
        },
      },
    );

    res.status(200).json({
      success: true,
      message: "Product updated successfully",
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("PATCH /products/:id error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update product",
    });
  }
});

app.delete("/products/:id", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID",
      });
    }

    const result = await productsCollection.deleteOne({
      _id: new ObjectId(id),
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Product deleted successfully",
    });
  } catch (error) {
    console.error("DELETE /products/:id error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete product",
    });
  }
});

// ====================== CREATE USER ======================
app.post("/users", async (req, res) => {
  try {
    const user = req.body;

    if (!user?.email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const filter = {
      email: user.email,
    };

    const updateDoc = {
      $set: {
        name: user.name || "",
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

    const options = {
      upsert: true,
    };

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
// ====================== GET USERS ======================
app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "" } = req.query;

    const pageNumber = Math.max(1, Number(page));
    const limitNumber = Math.min(50, Number(limit));

    const query = search
      ? {
          email: {
            $regex: search,
            $options: "i",
          },
        }
      : {};

    const users = await usersCollection
      .find(query)
      .sort({
        createdAt: -1,
      })
      .skip((pageNumber - 1) * limitNumber)
      .limit(limitNumber)
      .toArray();

    const total = await usersCollection.countDocuments(query);

    res.status(200).json({
      success: true,
      page: pageNumber,
      limit: limitNumber,
      total,
      totalPages: Math.ceil(total / limitNumber),
      data: users,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch users",
    });
  }
});
// ====================== CHANGE USER ROLE ======================
app.patch("/users/role/:id", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    const user = await usersCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Prevent changing own role
    if (user.email === req.user.email) {
      return res.status(400).json({
        success: false,
        message: "You cannot change your own role",
      });
    }

    const newRole = user.role === "admin" ? "user" : "admin";

    const result = await usersCollection.updateOne(
      {
        _id: new ObjectId(id),
      },
      {
        $set: {
          role: newRole,
          updatedAt: new Date(),
        },
      },
    );

    res.status(200).json({
      success: true,
      message: `Role changed to ${newRole}`,
      data: result,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Role update failed",
    });
  }
});
// ====================== DELETE USER ======================
app.delete("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID",
      });
    }

    const user = await usersCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Prevent deleting yourself
    if (user.email === req.user.email) {
      return res.status(400).json({
        success: false,
        message: "You cannot delete yourself",
      });
    }

    const result = await usersCollection.deleteOne({
      _id: new ObjectId(id),
    });

    res.status(200).json({
      success: true,
      message: "User deleted successfully",
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Delete failed",
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

    if (!ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product id",
      });
    }

    const qty = Math.max(1, Math.min(99, Number(quantity) || 1));

    const product = await productsCollection.findOne(
      { _id: new ObjectId(productId) },
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
      const quantity = existing.quantity + qty;

      await cartsCollection.updateOne(
        { _id: existing._id },
        {
          $set: {
            quantity,
            subtotal: Number((quantity * finalPrice).toFixed(2)),
            updatedAt: new Date(),
          },
        },
      );

      return res.json({
        success: true,
        message: "Cart updated",
      });
    }

    const cart = {
      email,
      productId: new ObjectId(productId),

      quantity: qty,

      name: product.name || "Unknown Product",
      image: product.image || "https://via.placeholder.com/300",

      price,
      discount,
      finalPrice,

      subtotal: Number((qty * finalPrice).toFixed(2)),

      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await cartsCollection.insertOne(cart);

    return res.status(201).json({
      success: true,
      insertedId: result.insertedId,
      message: "Added to cart",
    });
  } catch (error) {
    console.error(error);

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
      .find(
        { email },
        {
          projection: {
            email: 0,
          },
        },
      )
      .sort({ createdAt: -1 })
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

    return res.json({
      success: true,
      data: carts,
      summary,
    });
  } catch (error) {
    console.error(error);

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

    if (quantity < 1 || quantity > 99) {
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

    return res.json({
      success: true,
      message: "Cart updated",
    });
  } catch (error) {
    console.error(error);

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

    return res.json({
      success: true,
      message: "Item removed successfully",
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete cart item",
    });
  }
});

//Orders apis
app.get("/orders", verifyToken, verifyAdmin, async (req, res) => {
  try {
    let { status = "all", page = 1, limit = 10, search = "" } = req.query;

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(50, Number(limit));
    const skip = (pageNum - 1) * limitNum;

    const query = {};

    if (status !== "all") {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { email: { $regex: search, $options: "i" } },
        { "customer.phone": { $regex: search, $options: "i" } },
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
app.post("/orders", verifyToken, async (req, res) => {
  const session = client.startSession();

  try {
    const email = req.user.email;
    const { customer } = req.body;

    if (!customer?.name || !customer?.phone || !customer?.address) {
      return res.status(400).json({
        success: false,
        message: "Customer info required",
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
        if (!ObjectId.isValid(item.productId)) return null;

        const product = await productsCollection.findOne({
          _id: new ObjectId(item.productId),
        });

        if (!product) return null;

        const price =
          product.price - (product.price * (product.discount || 0)) / 100;

        return {
          productId: product._id,
          name: product.name,
          price: product.price,
          discount: product.discount || 0,
          image: product.image,
          quantity: item.quantity,
          subtotal: Number((price * item.quantity).toFixed(2)),
        };
      }),
    );

    const safeItems = itemsWithProducts.filter(Boolean);

    if (!safeItems.length) {
      return res.status(400).json({
        success: false,
        message: "No valid products in cart",
      });
    }

    const total = safeItems.reduce((acc, item) => acc + item.subtotal, 0);

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
app.patch("/orders/cancel/:id", verifyToken, async (req, res) => {
  try {
    const email = req.user.email;
    const { id } = req.params;

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
      { _id: new ObjectId(id), email },
      {
        $set: {
          status: "cancelled",
          updatedAt: new Date(),
        },
      },
    );

    res.status(200).json({
      success: true,
      message: "Order cancelled",
    });
  } catch (error) {
    console.error("CANCEL ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Cancel failed",
    });
  }
});

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
app.patch("/orders/status/:id", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowed = [
      "pending",
      "paid",
      "processing",
      "shipped",
      "delivered",
      "cancelled",
    ];

    if (!allowed.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status",
      });
    }

    await ordersCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          status,
          updatedAt: new Date(),
        },
      },
    );

    res.status(200).json({
      success: true,
      message: "Order status updated",
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Status update failed",
    });
  }
});

// ====================== INVOICE PDF ======================
app.get("/orders/invoice/:id/pdf", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const email = req.user.email;

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

    const doc = new PDFDocument({ margin: 40 });

    res.setHeader("Content-Type", "application/pdf");

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=invoice-${id}.pdf`,
    );

    doc.pipe(res);

    // HEADER
    doc.fontSize(20).text("🍪 Biscuit Shop Invoice", {
      align: "center",
    });

    doc.moveDown();

    // CUSTOMER INFO
    doc.fontSize(12).text(`Invoice ID: ${id}`);
    doc.text(`Customer: ${order.customer.name}`);
    doc.text(`Phone: ${order.customer.phone}`);
    doc.text(`Address: ${order.customer.address}`);
    doc.text(`Email: ${order.email}`);

    doc.moveDown();

    // ITEMS
    doc.fontSize(14).text("Items:");

    order.items.forEach((item, index) => {
      doc
        .fontSize(12)
        .text(
          `${index + 1}. ${item.name} - Qty: ${
            item.quantity
          } - Price: ${item.price} - Subtotal: ${item.subtotal}`,
        );
    });

    doc.moveDown();

    // TOTAL
    doc.fontSize(16).text(`TOTAL: ৳ ${order.total}`, {
      align: "right",
    });

    doc.moveDown();

    doc.fontSize(10).text("Thank you for your purchase!", {
      align: "center",
    });

    doc.end();
  } catch (error) {
    console.error("PDF ERROR:", error);

    res.status(500).json({
      success: false,
      message: "PDF generation failed",
    });
  }
});
// ====================== MONTHLY SALES ======================
app.get(
  "/admin/analytics/monthly-sales",
  verifyToken,
  verifyAdmin,
  async (req, res) => {
    try {
      const orders = await ordersCollection.find().toArray();

      const monthly = {};

      orders.forEach((order) => {
        const date = new Date(order.createdAt);
        const month = `${date.getFullYear()}-${date.getMonth() + 1}`;

        if (!monthly[month]) {
          monthly[month] = 0;
        }

        monthly[month] += order.total;
      });

      const result = Object.keys(monthly).map((key) => ({
        month: key,
        sales: monthly[key],
      }));

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
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
      const orders = await ordersCollection.find().toArray();

      const productMap = {};

      orders.forEach((order) => {
        order.items.forEach((item) => {
          if (!productMap[item.name]) {
            productMap[item.name] = 0;
          }
          productMap[item.name] += item.quantity;
        });
      });

      const result = Object.entries(productMap)
        .map(([name, sold]) => ({ name, sold }))
        .sort((a, b) => b.sold - a.sold)
        .slice(0, 5);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Top products failed",
      });
    }
  },
);

app.get("/", (req, res) => {
  res.send("Biscuit Shop Server Running");
});

export default app;
