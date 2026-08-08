import express from "express";
import { ObjectId } from "mongodb";
import verifyUser from "../middleware/verifyUser.js";
const normalizeString = (value = "") => String(value).trim();

const normalizeEmail = (value = "") => String(value).trim().toLowerCase();

const escapeRegex = (value = "") =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const cleanImage = (value = "") => {
  if (typeof value !== "string") return "";

  return value.replace(/[\[\]\(\)]/g, "").trim();
};

const toNumber = (value, fallback = 0) => {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
};

const productsRoutes = (
  productsCollection,
  usersCollection,
  verifyToken,
  verifyAdmin,
) => {
  const router = express.Router();

  /* =========================================================
     GET ALL PRODUCTS
     GET /products?page=1&limit=8&search=&category=
  ========================================================= */

  router.get("/", async (req, res) => {
    try {
      if (!productsCollection) {
        return res.status(503).json({
          success: false,
          message: "Database is not connected.",
        });
      }

      const parsedPage = Number.parseInt(req.query.page, 10);
      const parsedLimit = Number.parseInt(req.query.limit, 10);

      const page =
        Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

      const limit =
        Number.isFinite(parsedLimit) && parsedLimit > 0
          ? Math.min(parsedLimit, 20)
          : 8;

      const skip = (page - 1) * limit;

      const search =
        typeof req.query.search === "string" ? req.query.search.trim() : "";

      const category =
        typeof req.query.category === "string"
          ? req.query.category.trim().toLowerCase()
          : "";

      const query = {};

      if (search) {
        query.name = {
          $regex: escapeRegex(search),
          $options: "i",
        };
      }

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

      const totalPages = Math.ceil(total / limit);

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
      console.error("GET /products ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch products.",
      });
    }
  });

  /* =========================================================
     GET SINGLE PRODUCT
     GET /products/:id
  ========================================================= */

  router.get("/:id", async (req, res) => {
    try {
      if (!productsCollection) {
        return res.status(503).json({
          success: false,
          message: "Database is not connected.",
        });
      }

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
      console.error("GET /products/:id ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch product.",
      });
    }
  });

  /* =========================================================
     CREATE PRODUCT
     POST /products
  ========================================================= */

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
        } = req.body;

        const productName = normalizeString(name);

        if (!productName) {
          return res.status(400).json({
            success: false,
            message: "Product name is required.",
          });
        }

        const productPrice = toNumber(price, NaN);

        if (!Number.isFinite(productPrice) || productPrice < 0) {
          return res.status(400).json({
            success: false,
            message: "Valid product price is required.",
          });
        }

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

        const productRating = toNumber(rating, 4.5);
        const productReviews = toNumber(reviews, 0);
        const productDiscount = toNumber(discount, 0);

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

        const now = new Date();

        const newProduct = {
          name: productName,
          price: Number(productPrice.toFixed(2)),
          stock: productStock,

          image: cleanImage(image),

          rating: Number(productRating.toFixed(1)),
          reviews: productReviews,

          category: normalizeString(category).toLowerCase() || "cookies",

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
        console.error("POST /products ERROR:", error);

        return res.status(500).json({
          success: false,
          message: "Failed to create product.",
        });
      }
    },
  );

  /* =========================================================
     UPDATE PRODUCT
     PATCH /products/:id
  ========================================================= */

  router.patch(
    "/:id",
    verifyToken,
    verifyUser(productsCollection),
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

        for (const field of allowedFields) {
          if (req.body[field] !== undefined) {
            updates[field] = req.body[field];
          }
        }

        if (updates.name !== undefined) {
          updates.name = normalizeString(updates.name);

          if (!updates.name) {
            return res.status(400).json({
              success: false,
              message: "Product name cannot be empty.",
            });
          }
        }

        if (updates.price !== undefined) {
          updates.price = toNumber(updates.price, NaN);

          if (!Number.isFinite(updates.price) || updates.price < 0) {
            return res.status(400).json({
              success: false,
              message: "Invalid price.",
            });
          }
        }

        if (updates.stock !== undefined) {
          updates.stock = toNumber(updates.stock, NaN);

          if (!Number.isFinite(updates.stock) || updates.stock < 0) {
            return res.status(400).json({
              success: false,
              message: "Invalid stock.",
            });
          }
        }

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
        }

        if (updates.reviews !== undefined) {
          updates.reviews = toNumber(updates.reviews, NaN);

          if (!Number.isFinite(updates.reviews) || updates.reviews < 0) {
            return res.status(400).json({
              success: false,
              message: "Invalid reviews value.",
            });
          }
        }

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
        }

        if (updates.image !== undefined) {
          updates.image = cleanImage(updates.image);
        }

        if (updates.category !== undefined) {
          updates.category = normalizeString(updates.category).toLowerCase();
        }

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

        if (Object.keys(updates).length === 0) {
          return res.status(400).json({
            success: false,
            message: "No valid fields provided for update.",
          });
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
        console.error("PATCH /products/:id ERROR:", error);

        return res.status(500).json({
          success: false,
          message: "Failed to update product.",
        });
      }
    },
  );

  /* =========================================================
     DELETE PRODUCT
     DELETE /products/:id
  ========================================================= */

  router.delete(
    "/:id",
    verifyToken,
    verifyUser(productsCollection),
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
        console.error("DELETE /products/:id ERROR:", error);

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
