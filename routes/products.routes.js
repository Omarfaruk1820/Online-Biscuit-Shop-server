import express from "express";
import { ObjectId } from "mongodb";

// ============================================================
// HELPERS
// ============================================================

const normalizeString = (value = "") => {
  return typeof value === "string" ? value.trim() : String(value).trim();
};

const normalizeEmail = (value = "") => {
  return typeof value === "string"
    ? value.trim().toLowerCase()
    : String(value).trim().toLowerCase();
};

const normalizeCategory = (value = "") => {
  return normalizeString(value).toLowerCase();
};

const escapeRegex = (value = "") => {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const cleanImage = (value = "") => {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/[\[\]()]/g, "").trim();
};

const toNumber = (value, fallback = 0) => {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
};

// ============================================================
// PRODUCTS ROUTES
// ============================================================

const productsRoutes = (
  productsCollection,
  usersCollection,
  verifyToken,
  verifyUser,
  verifyAdmin,
) => {
  console.log("Products Routes Loaded");

  const router = express.Router();

  // ==========================================================
  // DEPENDENCY VALIDATION
  // ==========================================================

  if (!productsCollection) {
    throw new Error("productsCollection is required in productsRoutes.");
  }

  if (!usersCollection) {
    throw new Error("usersCollection is required in productsRoutes.");
  }

  if (typeof verifyToken !== "function") {
    throw new Error("verifyToken middleware is required in productsRoutes.");
  }

  if (typeof verifyUser !== "function") {
    throw new Error("verifyUser middleware is required in productsRoutes.");
  }

  if (typeof verifyAdmin !== "function") {
    throw new Error("verifyAdmin middleware is required in productsRoutes.");
  }

  // ==========================================================
  // GET ALL PRODUCTS
  // GET /products
  // GET /products?page=1&limit=8
  // GET /products?search=chips
  // GET /products?category=cookies
  // ==========================================================

  router.get("/", async (req, res) => {
    try {
      console.log("GET /products");

      const parsedPage = Number.parseInt(req.query.page, 10);

      const parsedLimit = Number.parseInt(req.query.limit, 10);

      const page =
        Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;

      const limit =
        Number.isInteger(parsedLimit) && parsedLimit > 0
          ? Math.min(parsedLimit, 20)
          : 8;

      const skip = (page - 1) * limit;

      const search =
        typeof req.query.search === "string" ? req.query.search.trim() : "";

      const category =
        typeof req.query.category === "string"
          ? normalizeCategory(req.query.category)
          : "";

      const query = {};

      // --------------------------------------------------------
      // SEARCH
      // --------------------------------------------------------

      if (search) {
        query.name = {
          $regex: escapeRegex(search),
          $options: "i",
        };
      }

      // --------------------------------------------------------
      // CATEGORY
      // --------------------------------------------------------

      if (category) {
        query.category = category;
      }

      // --------------------------------------------------------
      // DATABASE
      // --------------------------------------------------------

      const [products, total] = await Promise.all([
        productsCollection
          .find(query)
          .sort({
            _id: -1,
          })
          .skip(skip)
          .limit(limit)
          .toArray(),

        productsCollection.countDocuments(query),
      ]);

      const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

      return res.status(200).json({
        success: true,
        data: products,

        pagination: {
          page,
          limit,
          total,
          totalPages,

          hasNextPage: totalPages > 0 && page < totalPages,

          hasPrevPage: page > 1,
        },
      });
    } catch (error) {
      console.error("GET /products ERROR:", error?.stack || error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch products.",
      });
    }
  });

  // ==========================================================
  // GET SINGLE PRODUCT
  // GET /products/:id
  // ==========================================================

  router.get("/:id", async (req, res) => {
    try {
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid product ID.",
        });
      }

      const product = await productsCollection.findOne({
        _id: new ObjectId(id),
      });

      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Product not found.",
        });
      }

      return res.status(200).json({
        success: true,
        data: product,
      });
    } catch (error) {
      console.error("GET /products/:id ERROR:", error?.stack || error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch product.",
      });
    }
  });

  // ==========================================================
  // CREATE PRODUCT
  // POST /products
  // ==========================================================

  router.post(
    "/",
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
        } = req.body || {};

        // ------------------------------------------------------
        // NAME
        // ------------------------------------------------------

        const productName = normalizeString(name);

        if (!productName) {
          return res.status(400).json({
            success: false,
            message: "Product name is required.",
          });
        }

        // ------------------------------------------------------
        // PRICE
        // ------------------------------------------------------

        const productPrice = toNumber(price, NaN);

        if (!Number.isFinite(productPrice) || productPrice < 0) {
          return res.status(400).json({
            success: false,
            message: "Valid product price is required.",
          });
        }

        // ------------------------------------------------------
        // STOCK
        // ------------------------------------------------------

        const productStock = toNumber(stock, NaN);

        if (
          !Number.isFinite(productStock) ||
          productStock < 0 ||
          !Number.isInteger(productStock)
        ) {
          return res.status(400).json({
            success: false,
            message: "Stock must be a valid non-negative integer.",
          });
        }

        // ------------------------------------------------------
        // RATING
        // ------------------------------------------------------

        const productRating = toNumber(rating, 4.5);

        if (
          !Number.isFinite(productRating) ||
          productRating < 0 ||
          productRating > 5
        ) {
          return res.status(400).json({
            success: false,
            message: "Rating must be between 0 and 5.",
          });
        }

        // ------------------------------------------------------
        // REVIEWS
        // ------------------------------------------------------

        const productReviews = toNumber(reviews, 0);

        if (
          !Number.isFinite(productReviews) ||
          productReviews < 0 ||
          !Number.isInteger(productReviews)
        ) {
          return res.status(400).json({
            success: false,
            message: "Reviews must be a valid non-negative integer.",
          });
        }

        // ------------------------------------------------------
        // DISCOUNT
        // ------------------------------------------------------

        const productDiscount = toNumber(discount, 0);

        if (
          !Number.isFinite(productDiscount) ||
          productDiscount < 0 ||
          productDiscount > 100
        ) {
          return res.status(400).json({
            success: false,
            message: "Discount must be between 0 and 100.",
          });
        }

        // ------------------------------------------------------
        // CATEGORY
        // ------------------------------------------------------

        const productCategory = normalizeCategory(category) || "cookies";

        // ------------------------------------------------------
        // PRODUCT DOCUMENT
        // ------------------------------------------------------

        const now = new Date();

        const newProduct = {
          name: productName,

          price: Number(productPrice.toFixed(2)),

          stock: productStock,

          image: cleanImage(image),

          rating: Number(productRating.toFixed(1)),

          reviews: productReviews,

          category: productCategory,

          brand: normalizeString(brand),

          weight: normalizeString(weight),

          description: normalizeString(description),

          ingredients: normalizeString(ingredients),

          expiry: normalizeString(expiry),

          discount: Number(productDiscount.toFixed(2)),

          createdBy: normalizeEmail(req.user?.email),

          createdAt: now,

          updatedAt: now,
        };

        // ------------------------------------------------------
        // INSERT
        // ------------------------------------------------------

        const result = await productsCollection.insertOne(newProduct);

        return res.status(201).json({
          success: true,
          message: "Product created successfully.",

          data: {
            _id: result.insertedId,
            ...newProduct,
          },
        });
      } catch (error) {
        console.error("POST /products ERROR:", error?.stack || error);

        return res.status(500).json({
          success: false,
          message: "Failed to create product.",
        });
      }
    },
  );

  // ==========================================================
  // UPDATE PRODUCT
  // PATCH /products/:id
  // ==========================================================

  router.patch(
    "/:id",
    verifyToken,
    verifyUser(usersCollection),
    verifyAdmin,
    async (req, res) => {
      try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid product ID.",
          });
        }

        const allowedFields = [
          "name",
          "price",
          "stock",
          "image",
          "rating",
          "category",
          "reviews",
          "brand",
          "weight",
          "description",
          "ingredients",
          "expiry",
          "discount",
        ];

        const updates = {};

        // ------------------------------------------------------
        // PICK ALLOWED FIELDS
        // ------------------------------------------------------

        for (const field of allowedFields) {
          if (req.body?.[field] !== undefined) {
            updates[field] = req.body[field];
          }
        }

        // ------------------------------------------------------
        // NAME
        // ------------------------------------------------------

        if (updates.name !== undefined) {
          updates.name = normalizeString(updates.name);

          if (!updates.name) {
            return res.status(400).json({
              success: false,
              message: "Product name cannot be empty.",
            });
          }
        }

        // ------------------------------------------------------
        // PRICE
        // ------------------------------------------------------

        if (updates.price !== undefined) {
          updates.price = toNumber(updates.price, NaN);

          if (!Number.isFinite(updates.price) || updates.price < 0) {
            return res.status(400).json({
              success: false,
              message: "Invalid price.",
            });
          }

          updates.price = Number(updates.price.toFixed(2));
        }

        // ------------------------------------------------------
        // STOCK
        // ------------------------------------------------------

        if (updates.stock !== undefined) {
          updates.stock = toNumber(updates.stock, NaN);

          if (
            !Number.isFinite(updates.stock) ||
            updates.stock < 0 ||
            !Number.isInteger(updates.stock)
          ) {
            return res.status(400).json({
              success: false,
              message: "Stock must be a valid non-negative integer.",
            });
          }
        }

        // ------------------------------------------------------
        // RATING
        // ------------------------------------------------------

        if (updates.rating !== undefined) {
          updates.rating = toNumber(updates.rating, NaN);

          if (
            !Number.isFinite(updates.rating) ||
            updates.rating < 0 ||
            updates.rating > 5
          ) {
            return res.status(400).json({
              success: false,
              message: "Rating must be between 0 and 5.",
            });
          }

          updates.rating = Number(updates.rating.toFixed(1));
        }

        // ------------------------------------------------------
        // REVIEWS
        // ------------------------------------------------------

        if (updates.reviews !== undefined) {
          updates.reviews = toNumber(updates.reviews, NaN);

          if (
            !Number.isFinite(updates.reviews) ||
            updates.reviews < 0 ||
            !Number.isInteger(updates.reviews)
          ) {
            return res.status(400).json({
              success: false,
              message: "Reviews must be a valid non-negative integer.",
            });
          }
        }

        // ------------------------------------------------------
        // DISCOUNT
        // ------------------------------------------------------

        if (updates.discount !== undefined) {
          updates.discount = toNumber(updates.discount, NaN);

          if (
            !Number.isFinite(updates.discount) ||
            updates.discount < 0 ||
            updates.discount > 100
          ) {
            return res.status(400).json({
              success: false,
              message: "Discount must be between 0 and 100.",
            });
          }

          updates.discount = Number(updates.discount.toFixed(2));
        }

        // ------------------------------------------------------
        // IMAGE
        // ------------------------------------------------------

        if (updates.image !== undefined) {
          updates.image = cleanImage(updates.image);
        }

        // ------------------------------------------------------
        // CATEGORY
        // ------------------------------------------------------

        if (updates.category !== undefined) {
          updates.category = normalizeCategory(updates.category);

          if (!updates.category) {
            return res.status(400).json({
              success: false,
              message: "Product category cannot be empty.",
            });
          }
        }

        // ------------------------------------------------------
        // TEXT FIELDS
        // ------------------------------------------------------

        for (const field of [
          "brand",
          "weight",
          "description",
          "ingredients",
          "expiry",
        ]) {
          if (updates[field] !== undefined) {
            updates[field] = normalizeString(updates[field]);
          }
        }

        // ------------------------------------------------------
        // NO UPDATE
        // ------------------------------------------------------

        if (Object.keys(updates).length === 0) {
          return res.status(400).json({
            success: false,
            message: "No valid fields provided for update.",
          });
        }

        updates.updatedAt = new Date();

        // ------------------------------------------------------
        // UPDATE DATABASE
        // ------------------------------------------------------

        const result = await productsCollection.updateOne(
          {
            _id: new ObjectId(id),
          },
          {
            $set: updates,
          },
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "Product not found.",
          });
        }

        return res.status(200).json({
          success: true,
          message: "Product updated successfully.",
          modifiedCount: result.modifiedCount,
        });
      } catch (error) {
        console.error("PATCH /products/:id ERROR:", error?.stack || error);

        return res.status(500).json({
          success: false,
          message: "Failed to update product.",
        });
      }
    },
  );

  // ==========================================================
  // DELETE PRODUCT
  // DELETE /products/:id
  // ==========================================================

  router.delete(
    "/:id",
    verifyToken,
    verifyUser(usersCollection),
    verifyAdmin,
    async (req, res) => {
      try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid product ID.",
          });
        }

        const result = await productsCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "Product not found.",
          });
        }

        return res.status(200).json({
          success: true,
          message: "Product deleted successfully.",
        });
      } catch (error) {
        console.error("DELETE /products/:id ERROR:", error?.stack || error);

        return res.status(500).json({
          success: false,
          message: "Failed to delete product.",
        });
      }
    },
  );

  return router;
};

export default productsRoutes;
