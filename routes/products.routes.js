import express from "express";
import { ObjectId } from "mongodb";

// ============================================================
// HELPERS
// ============================================================

const normalizeString = (value = "") => {
  return String(value ?? "").trim();
};

const normalizeEmail = (value = "") => {
  return normalizeString(value).toLowerCase();
};

const normalizeCategory = (value = "") => {
  return normalizeString(value).toLowerCase();
};

const cleanImage = (value = "") => {
  return normalizeString(value).replace(/[\[\]()]/g, "");
};

const escapeRegex = (value = "") => {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const toNumber = (value, fallback = NaN) => {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
};

const roundNumber = (value, decimals = 2) => {
  return Number(Number(value).toFixed(decimals));
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
  const router = express.Router();

  // ==========================================================
  // DEPENDENCY VALIDATION
  // ==========================================================

  if (!productsCollection) {
    throw new Error("productsCollection is required.");
  }

  if (!usersCollection) {
    throw new Error("usersCollection is required.");
  }

  if (typeof verifyToken !== "function") {
    throw new Error("verifyToken middleware is required.");
  }

  if (typeof verifyUser !== "function") {
    throw new Error("verifyUser middleware is required.");
  }

  if (typeof verifyAdmin !== "function") {
    throw new Error("verifyAdmin middleware is required.");
  }

  // ==========================================================
  // GET ALL PRODUCTS
  // GET /products
  // ==========================================================

  router.get("/", async (req, res) => {
    try {
      const pageValue = Number.parseInt(req.query.page, 10);
      const limitValue = Number.parseInt(req.query.limit, 10);

      const page = Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 1;

      const limit =
        Number.isInteger(limitValue) && limitValue > 0
          ? Math.min(limitValue, 20)
          : 8;

      const skip = (page - 1) * limit;

      const search =
        typeof req.query.search === "string" ? req.query.search.trim() : "";

      const category =
        typeof req.query.category === "string"
          ? normalizeCategory(req.query.category)
          : "";

      const query = {};

      // Search by product name
      if (search) {
        query.name = {
          $regex: escapeRegex(search),
          $options: "i",
        };
      }

      // Filter by category
      if (category) {
        query.category = category;
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

      const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

      return res.status(200).json({
        success: true,
        data: products,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      });
    } catch (error) {
      console.error("GET /products error:", error?.stack || error);

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
      console.error("GET /products/:id error:", error?.stack || error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch product.",
      });
    }
  });

  // ==========================================================
  // CREATE PRODUCT
  // POST /products
  // ADMIN ONLY
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

        const productPrice = toNumber(price);

        if (!Number.isFinite(productPrice) || productPrice < 0) {
          return res.status(400).json({
            success: false,
            message: "Valid product price is required.",
          });
        }

        // ------------------------------------------------------
        // STOCK
        // ------------------------------------------------------

        const productStock = toNumber(stock);

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

        const productRating = toNumber(rating);

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

        const productReviews = toNumber(reviews);

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

        const productDiscount = toNumber(discount);

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
        // DATE
        // ------------------------------------------------------

        const now = new Date();

        // ------------------------------------------------------
        // PRODUCT
        // ------------------------------------------------------

        const newProduct = {
          name: productName,
          price: roundNumber(productPrice, 2),
          stock: productStock,
          image: cleanImage(image),
          rating: roundNumber(productRating, 1),
          category: productCategory,
          reviews: productReviews,
          brand: normalizeString(brand),
          weight: normalizeString(weight),
          description: normalizeString(description),
          ingredients: normalizeString(ingredients),
          expiry: normalizeString(expiry),
          discount: roundNumber(productDiscount, 2),

          createdBy: normalizeEmail(req.user?.email),

          createdAt: now,
          updatedAt: now,
        };

        // ------------------------------------------------------
        // INSERT
        // ------------------------------------------------------

        const result = await productsCollection.insertOne(newProduct);

        // ------------------------------------------------------
        // RESPONSE
        // ------------------------------------------------------

        return res.status(201).json({
          success: true,
          message: "Product created successfully.",
          data: {
            _id: result.insertedId,
            ...newProduct,
          },
        });
      } catch (error) {
        console.error("POST /products error:", error?.stack || error);

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
  // ADMIN ONLY
  // ==========================================================

  router.patch(
    "/:id",
    verifyToken,
    verifyUser(usersCollection),
    verifyAdmin,
    async (req, res) => {
      try {
        const { id } = req.params;

        // ------------------------------------------------------
        // VALIDATE ID
        // ------------------------------------------------------

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid product ID.",
          });
        }

        // ------------------------------------------------------
        // ALLOWED FIELDS
        // ------------------------------------------------------

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

        allowedFields.forEach((field) => {
          if (req.body?.[field] !== undefined) {
            updates[field] = req.body[field];
          }
        });

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
          updates.price = toNumber(updates.price);

          if (!Number.isFinite(updates.price) || updates.price < 0) {
            return res.status(400).json({
              success: false,
              message: "Invalid price.",
            });
          }

          updates.price = roundNumber(updates.price, 2);
        }

        // ------------------------------------------------------
        // STOCK
        // ------------------------------------------------------

        if (updates.stock !== undefined) {
          updates.stock = toNumber(updates.stock);

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
          updates.rating = toNumber(updates.rating);

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

          updates.rating = roundNumber(updates.rating, 1);
        }

        // ------------------------------------------------------
        // REVIEWS
        // ------------------------------------------------------

        if (updates.reviews !== undefined) {
          updates.reviews = toNumber(updates.reviews);

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
          updates.discount = toNumber(updates.discount);

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

          updates.discount = roundNumber(updates.discount, 2);
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

        const textFields = [
          "brand",
          "weight",
          "description",
          "ingredients",
          "expiry",
        ];

        textFields.forEach((field) => {
          if (updates[field] !== undefined) {
            updates[field] = normalizeString(updates[field]);
          }
        });

        // ------------------------------------------------------
        // CHECK UPDATE
        // ------------------------------------------------------

        if (Object.keys(updates).length === 0) {
          return res.status(400).json({
            success: false,
            message: "No valid fields provided for update.",
          });
        }

        updates.updatedAt = new Date();

        // ------------------------------------------------------
        // UPDATE
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

        // ------------------------------------------------------
        // RESPONSE
        // ------------------------------------------------------

        return res.status(200).json({
          success: true,
          message: "Product updated successfully.",
          modifiedCount: result.modifiedCount,
        });
      } catch (error) {
        console.error("PATCH /products/:id error:", error?.stack || error);

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
  // ADMIN ONLY
  // ==========================================================

  router.delete(
    "/:id",
    verifyToken,
    verifyUser(usersCollection),
    verifyAdmin,
    async (req, res) => {
      try {
        const { id } = req.params;

        // ------------------------------------------------------
        // VALIDATE ID
        // ------------------------------------------------------

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid product ID.",
          });
        }

        // ------------------------------------------------------
        // DELETE
        // ------------------------------------------------------

        const result = await productsCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "Product not found.",
          });
        }

        // ------------------------------------------------------
        // RESPONSE
        // ------------------------------------------------------

        return res.status(200).json({
          success: true,
          message: "Product deleted successfully.",
        });
      } catch (error) {
        console.error("DELETE /products/:id error:", error?.stack || error);

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
