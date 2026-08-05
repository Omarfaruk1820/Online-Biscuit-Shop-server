import { Router } from "express";
import { ObjectId } from "mongodb";
import calculateOrderSummary from "../utils/calculateOrderSummary.js";

const cartsRoutes = (
  cartsCollection,
  productsCollection,
  verifyToken,
  verifyAdmin,
) => {
  const router = Router();

  // ==========================================================
  // Part 1
  // GET /carts
  // Get Logged-in User's Cart
  // ==========================================================

  router.get("/", verifyToken, async (req, res) => {
    try {
      const email = req.user?.email;

      // -----------------------------------
      // Authorization
      // -----------------------------------

      if (!email) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized.",
        });
      }

      // -----------------------------------
      // Fetch User Cart
      // -----------------------------------

      const cart = await cartsCollection
        .find({ email })
        .project({
          email: 0,
        })
        .sort({
          createdAt: -1,
        })
        .toArray();

      // -----------------------------------
      // Empty Cart
      // -----------------------------------

      if (!cart.length) {
        return res.status(200).json({
          success: true,
          count: 0,
          data: [],
          summary: {
            totalItems: 0,
            totalQuantity: 0,
            subtotal: 0,
            discount: 0,
            shipping: 0,
            tax: 0,
            grandTotal: 0,
          },
        });
      }

      // -----------------------------------
      // Cart Summary
      // -----------------------------------

      const summary = cart.reduce(
        (acc, item) => {
          const quantity = Number(item.quantity || 0);
          const price = Number(item.price || 0);
          const finalPrice = Number(item.finalPrice || price);

          acc.totalItems += 1;

          acc.totalQuantity += quantity;

          acc.subtotal += Number(item.subtotal || 0);

          acc.discount += Number(((price - finalPrice) * quantity).toFixed(2));

          return acc;
        },
        {
          totalItems: 0,
          totalQuantity: 0,
          subtotal: 0,
          discount: 0,
        },
      );

      summary.subtotal = Number(summary.subtotal.toFixed(2));

      summary.discount = Number(summary.discount.toFixed(2));

      // -----------------------------------
      // Shipping
      // -----------------------------------

      summary.shipping = summary.subtotal >= 1000 ? 0 : 60;

      // -----------------------------------
      // Tax
      // -----------------------------------

      summary.tax = 0;

      // -----------------------------------
      // Grand Total
      // -----------------------------------

      summary.grandTotal = Number(
        (summary.subtotal + summary.shipping + summary.tax).toFixed(2),
      );

      // -----------------------------------
      // Response
      // -----------------------------------

      return res.status(200).json({
        success: true,

        count: cart.length,

        data: cart,

        summary,
      });
    } catch (error) {
      console.error("GET CART ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to load cart.",
      });
    }
  });

  router.post("/", verifyToken, async (req, res) => {
    try {
      // --------------------------------------------------
      // Authorization
      // --------------------------------------------------

      const email = req.user?.email;

      if (!email) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized.",
        });
      }

      // --------------------------------------------------
      // Request Body
      // --------------------------------------------------

      const { productId, quantity } = req.body;

      if (!productId) {
        return res.status(400).json({
          success: false,
          message: "Product ID is required.",
        });
      }

      if (!ObjectId.isValid(productId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid product ID.",
        });
      }

      // --------------------------------------------------
      // Quantity Validation
      // --------------------------------------------------

      const qty = Number(quantity);

      if (!Number.isInteger(qty) || qty < 1 || qty > 99) {
        return res.status(400).json({
          success: false,
          message: "Quantity must be between 1 and 99.",
        });
      }

      const productObjectId = new ObjectId(productId);

      // --------------------------------------------------
      // Load Latest Product
      // --------------------------------------------------

      const product = await productsCollection.findOne(
        {
          _id: productObjectId,
        },
        {
          projection: {
            sku: 1,
            name: 1,
            image: 1,
            brand: 1,
            category: 1,
            weight: 1,
            price: 1,
            discount: 1,
            stock: 1,
          },
        },
      );

      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Product not found.",
        });
      }

      // --------------------------------------------------
      // Product Snapshot
      // --------------------------------------------------

      const productName =
        typeof product.name === "string"
          ? product.name.trim()
          : "Unknown Product";

      const productImage =
        typeof product.image === "string" ? product.image.trim() : "";

      const productBrand =
        typeof product.brand === "string" ? product.brand.trim() : "";

      const productCategory =
        typeof product.category === "string" ? product.category.trim() : "";

      const productWeight = product.weight ?? "";

      // --------------------------------------------------
      // Price Validation
      // --------------------------------------------------

      const price = Number(product.price);

      if (!Number.isFinite(price) || price < 0) {
        return res.status(400).json({
          success: false,
          message: `Invalid price for "${productName}".`,
        });
      }

      // --------------------------------------------------
      // Discount Validation
      // --------------------------------------------------

      const discount = Math.max(
        0,
        Math.min(Number(product.discount) || 0, 100),
      );

      // --------------------------------------------------
      // Stock Validation
      // --------------------------------------------------

      const stock = Number(product.stock);

      if (!Number.isFinite(stock) || stock < 0) {
        return res.status(400).json({
          success: false,
          message: `Invalid stock for "${productName}".`,
        });
      }

      if (stock === 0) {
        return res.status(400).json({
          success: false,
          message: `"${productName}" is currently out of stock.`,
        });
      }

      if (qty > stock) {
        return res.status(400).json({
          success: false,
          message: `Only ${stock} item(s) available for "${productName}".`,
        });
      }

      // --------------------------------------------------
      // Final Price Calculation
      // --------------------------------------------------

      const finalPrice = Number((price - (price * discount) / 100).toFixed(2));

      const subtotal = Number((qty * finalPrice).toFixed(2));

      const now = new Date();

      // ==================================================
      // Part 2 Starts Here
      // Existing Cart Item
      // Update Existing Cart
      // Create New Cart Item
      // ==================================================
      // --------------------------------------------------
      // Existing Cart Item
      // --------------------------------------------------

      const existingItem = await cartsCollection.findOne({
        email,
        productId: productObjectId,
      });

      // --------------------------------------------------
      // Update Existing Cart
      // --------------------------------------------------

      if (existingItem) {
        const existingQuantity = Number(existingItem.quantity) || 0;

        const newQuantity = existingQuantity + qty;

        // Quantity Limit

        if (newQuantity > 99) {
          return res.status(400).json({
            success: false,
            message: "Maximum quantity per product is 99.",
          });
        }

        // Stock Validation

        if (newQuantity > stock) {
          return res.status(400).json({
            success: false,
            message: `Only ${stock} item(s) available for "${productName}".`,
          });
        }

        // Recalculate Subtotal

        const subtotal = Number((newQuantity * finalPrice).toFixed(2));

        // Update Cart

        const updateResult = await cartsCollection.updateOne(
          {
            _id: existingItem._id,
          },
          {
            $set: {
              name: productName,

              image: productImage,

              brand: productBrand,

              category: productCategory,

              weight: productWeight,

              price,

              discount,

              finalPrice,

              quantity: newQuantity,

              subtotal,

              updatedAt: now,
            },
          },
        );

        // Update Failed

        if (!updateResult.modifiedCount) {
          return res.status(500).json({
            success: false,
            message: "Failed to update cart.",
          });
        }

        // Success Response

        return res.status(200).json({
          success: true,
          message: "Cart updated successfully.",

          data: {
            productId,

            quantity: newQuantity,

            finalPrice,

            subtotal,
          },
        });
      }

      // ==================================================
      // Part 3 Starts Here
      // Create New Cart Item
      // Insert Database
      // Success Response
      // ==================================================
      // --------------------------------------------------
      // Create New Cart Item
      // --------------------------------------------------

      const cartItem = {
        email,

        productId: productObjectId,

        sku: product.sku ?? "",

        name: productName,

        image: productImage,

        brand: productBrand,

        category: productCategory,

        weight: productWeight,

        price,

        discount,

        finalPrice,

        quantity: qty,

        subtotal,

        createdAt: now,

        updatedAt: now,
      };

      // --------------------------------------------------
      // Insert Cart Item
      // --------------------------------------------------

      const insertResult = await cartsCollection.insertOne(cartItem);

      if (!insertResult.acknowledged) {
        return res.status(500).json({
          success: false,
          message: "Failed to add product to cart.",
        });
      }

      // --------------------------------------------------
      // Success Response
      // --------------------------------------------------

      return res.status(201).json({
        success: true,
        message: "Product added to cart successfully.",

        data: {
          _id: insertResult.insertedId,

          productId,

          quantity: qty,

          finalPrice,

          subtotal,
        },
      });
    } catch (error) {
      console.error("ADD TO CART ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Internal server error.",
      });
    }
  });

  // ==========================================================
  // Part 3
  // PATCH /carts/:id
  // Update Cart Quantity
  // ==========================================================

  router.patch("/:id", verifyToken, async (req, res) => {
    try {
      const email = req.user?.email;
      const { id } = req.params;
      const { quantity } = req.body;

      // -----------------------------------
      // Authorization
      // -----------------------------------

      if (!email) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized.",
        });
      }

      // -----------------------------------
      // Validate Cart ID
      // -----------------------------------

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid cart ID.",
        });
      }

      // -----------------------------------
      // Validate Quantity
      // -----------------------------------

      const qty = Math.max(1, Math.min(Number(quantity) || 1, 99));

      // -----------------------------------
      // Find Cart Item
      // -----------------------------------

      const cartItem = await cartsCollection.findOne({
        _id: new ObjectId(id),
        email,
      });

      if (!cartItem) {
        return res.status(404).json({
          success: false,
          message: "Cart item not found.",
        });
      }

      // -----------------------------------
      // Get Latest Product
      // -----------------------------------

      const product = await productsCollection.findOne(
        {
          _id: cartItem.productId,
        },
        {
          projection: {
            name: 1,
            image: 1,
            brand: 1,
            category: 1,
            weight: 1,
            price: 1,
            discount: 1,
            stock: 1,
          },
        },
      );

      if (!product) {
        return res.status(404).json({
          success: false,
          message: "This product no longer exists.",
        });
      }

      // -----------------------------------
      // Stock Validation
      // -----------------------------------

      const stock = Number(product.stock || 0);

      if (stock <= 0) {
        return res.status(400).json({
          success: false,
          message: `${product.name} is out of stock.`,
        });
      }

      if (qty > stock) {
        return res.status(400).json({
          success: false,
          message: `Only ${stock} item(s) available.`,
        });
      }

      // -----------------------------------
      // Calculate Latest Price
      // -----------------------------------

      const price = Number(product.price || 0);

      const discount = Number(product.discount || 0);

      const finalPrice = Number((price - (price * discount) / 100).toFixed(2));

      const subtotal = Number((finalPrice * qty).toFixed(2));

      // -----------------------------------
      // Update Cart Item
      // -----------------------------------

      await cartsCollection.updateOne(
        {
          _id: cartItem._id,
        },
        {
          $set: {
            name: product.name,
            image: product.image || "",
            brand: product.brand || "",
            category: product.category || "",
            weight: product.weight || "",

            price,
            discount,
            finalPrice,

            quantity: qty,
            subtotal,

            updatedAt: new Date(),
          },
        },
      );

      // -----------------------------------
      // Return Updated Cart Item
      // -----------------------------------

      const updatedCart = await cartsCollection.findOne({
        _id: cartItem._id,
      });

      return res.status(200).json({
        success: true,
        message: "Cart updated successfully.",
        data: updatedCart,
      });
    } catch (error) {
      console.error("UPDATE CART ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to update cart.",
      });
    }
  });
  // ==========================================================
  // Part 4
  // DELETE /carts/:id
  // Remove One Cart Item
  // ==========================================================

  router.delete("/:id", verifyToken, async (req, res) => {
    try {
      // -----------------------------------
      // Authorization
      // -----------------------------------

      const email = req.user?.email;

      if (!email) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized.",
        });
      }

      // -----------------------------------
      // Validate Cart ID
      // -----------------------------------

      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid cart ID.",
        });
      }

      const cartId = new ObjectId(id);

      // -----------------------------------
      // Find Cart Item
      // -----------------------------------

      const cartItem = await cartsCollection.findOne({
        _id: cartId,
        email,
      });

      if (!cartItem) {
        return res.status(404).json({
          success: false,
          message: "Cart item not found.",
        });
      }

      // -----------------------------------
      // Delete Cart Item
      // -----------------------------------

      const deleteResult = await cartsCollection.deleteOne({
        _id: cartId,
        email,
      });

      if (!deleteResult.deletedCount) {
        return res.status(500).json({
          success: false,
          message: "Failed to remove cart item.",
        });
      }

      // -----------------------------------
      // Success Response
      // -----------------------------------

      return res.status(200).json({
        success: true,
        message: "Cart item removed successfully.",
        data: {
          id: cartItem._id,
          productId: cartItem.productId,
          name: cartItem.name,
        },
      });
    } catch (error) {
      console.error("DELETE CART ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Internal server error.",
      });
    }
  });
  // ==========================================================
  // Part 5
  // DELETE /carts
  // Clear Entire Cart
  // ==========================================================

  router.delete("/", verifyToken, async (req, res) => {
    try {
      // -----------------------------------
      // Authorization
      // -----------------------------------

      const email = req.user?.email;

      if (!email) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized.",
        });
      }

      // -----------------------------------
      // Clear Cart
      // -----------------------------------

      const result = await cartsCollection.deleteMany({
        email,
      });

      // -----------------------------------
      // Empty Cart
      // -----------------------------------

      if (result.deletedCount === 0) {
        return res.status(200).json({
          success: true,
          message: "Your cart is already empty.",
          data: {
            deletedCount: 0,
          },
        });
      }

      // -----------------------------------
      // Success Response
      // -----------------------------------

      return res.status(200).json({
        success: true,
        message: "Cart cleared successfully.",
        data: {
          deletedCount: result.deletedCount,
        },
      });
    } catch (error) {
      console.error("CLEAR CART ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Internal server error.",
      });
    }
  });
  // ==========================================================
  // Part 6
  // GET /carts/count
  // Get Cart Item Count
  // ==========================================================

  router.get("/count", verifyToken, async (req, res) => {
    try {
      // -----------------------------------
      // Authorization
      // -----------------------------------

      const email = req.user?.email;

      if (!email) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized.",
        });
      }

      // -----------------------------------
      // Cart Count
      // -----------------------------------

      const [summary] = await cartsCollection
        .aggregate([
          {
            $match: {
              email,
            },
          },
          {
            $group: {
              _id: null,

              totalItems: {
                $sum: 1,
              },

              totalQuantity: {
                $sum: {
                  $ifNull: ["$quantity", 0],
                },
              },
            },
          },
        ])
        .toArray();

      const totalItems = Number(summary?.totalItems || 0);

      const totalQuantity = Number(summary?.totalQuantity || 0);

      // -----------------------------------
      // Success Response
      // -----------------------------------

      return res.status(200).json({
        success: true,
        message: "Cart count fetched successfully.",
        data: {
          totalItems,
          totalQuantity,
        },
      });
    } catch (error) {
      console.error("GET CART COUNT ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to get cart count.",
      });
    }
  });

  // ==========================================================
  // Part 7
  // GET /carts/summary
  // Get Cart Summary
  // ==========================================================

  router.get("/summary", verifyToken, async (req, res) => {
    try {
      // ---------------------------------------
      // Authorization
      // ---------------------------------------

      const email = req.user?.email;

      if (!email) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized.",
        });
      }

      // ---------------------------------------
      // Load Cart Items
      // ---------------------------------------

      const cartItems = await cartsCollection
        .find(
          { email },
          {
            projection: {
              quantity: 1,
              subtotal: 1,
              discountAmount: 1,
            },
          },
        )
        .toArray();

      // ---------------------------------------
      // Calculate Summary
      // ---------------------------------------

      const summary = calculateOrderSummary(
        cartItems.map((item) => ({
          quantity: Number(item.quantity) || 0,
          subtotal: Number(item.subtotal) || 0,
          discountAmount: Number(item.discountAmount) || 0,
        })),
      );

      // ---------------------------------------
      // Response
      // ---------------------------------------

      return res.status(200).json({
        success: true,
        data: summary,
      });
    } catch (error) {
      console.error("GET CART SUMMARY ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to load cart summary.",
      });
    }
  });

  router.post("/validate", verifyToken, async (req, res) => {
    try {
      // -----------------------------------
      // Authorization
      // -----------------------------------

      const email = req.user?.email;

      if (!email) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized.",
        });
      }

      // -----------------------------------
      // Load Cart
      // -----------------------------------

      const cartItems = await cartsCollection
        .find({ email })
        .sort({ createdAt: 1 })
        .toArray();

      if (!cartItems.length) {
        return res.status(400).json({
          success: false,
          message: "Your cart is empty.",
        });
      }

      // -----------------------------------
      // Duplicate Product Check
      // -----------------------------------

      const ids = cartItems.map((item) => item.productId.toString());

      if (new Set(ids).size !== ids.length) {
        return res.status(400).json({
          success: false,
          message: "Duplicate products found in cart.",
        });
      }

      const validatedItems = [];
      const errors = [];

      // -----------------------------------
      // Validate Items
      // -----------------------------------

      for (const cart of cartItems) {
        if (!cart.productId) {
          errors.push({
            productId: null,
            message: "Invalid product.",
          });
          continue;
        }

        const product = await productsCollection.findOne(
          { _id: new ObjectId(cart.productId) },
          {
            projection: {
              sku: 1,
              name: 1,
              image: 1,
              brand: 1,
              category: 1,
              weight: 1,
              price: 1,
              discount: 1,
              stock: 1,
            },
          },
        );

        if (!product) {
          errors.push({
            productId: cart.productId,
            message: `"${cart.name}" no longer exists.`,
          });
          continue;
        }

        const quantity = Number(cart.quantity);

        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
          errors.push({
            productId: cart.productId,
            message: `Invalid quantity for "${product.name}".`,
          });
          continue;
        }

        const stock = Number(product.stock);

        if (!Number.isFinite(stock) || stock < 0) {
          errors.push({
            productId: cart.productId,
            message: `Invalid stock for "${product.name}".`,
          });
          continue;
        }

        if (stock === 0) {
          errors.push({
            productId: cart.productId,
            message: `"${product.name}" is out of stock.`,
          });
          continue;
        }

        if (quantity > stock) {
          errors.push({
            productId: cart.productId,
            message: `Only ${stock} item(s) available for "${product.name}".`,
          });
          continue;
        }

        const price = Number(product.price);

        if (!Number.isFinite(price) || price < 0) {
          errors.push({
            productId: cart.productId,
            message: `Invalid price for "${product.name}".`,
          });
          continue;
        }

        const discount = Math.max(
          0,
          Math.min(Number(product.discount) || 0, 100),
        );

        const finalPrice = Number(
          (price - (price * discount) / 100).toFixed(2),
        );

        const subtotal = Number((finalPrice * quantity).toFixed(2));

        const discountAmount = Number(
          ((price - finalPrice) * quantity).toFixed(2),
        );

        validatedItems.push({
          productId: product._id,
          sku: product.sku ?? "",
          name: String(product.name).trim(),
          image: typeof product.image === "string" ? product.image.trim() : "",
          brand: typeof product.brand === "string" ? product.brand.trim() : "",
          category:
            typeof product.category === "string" ? product.category.trim() : "",
          weight: product.weight ?? null,
          quantity,
          price,
          discount,
          finalPrice,
          subtotal,
          discountAmount,
        });
      }

      // -----------------------------------
      // Validation Failed
      // -----------------------------------

      if (errors.length) {
        return res.status(400).json({
          success: false,
          message: "Cart validation failed.",
          errors,
        });
      }

      // -----------------------------------
      // Order Summary
      // -----------------------------------

      const summary = calculateOrderSummary(validatedItems);

      // -----------------------------------
      // Success
      // -----------------------------------

      return res.status(200).json({
        success: true,
        message: "Cart validated successfully.",
        data: {
          items: validatedItems,
          ...summary,
        },
      });
    } catch (error) {
      console.error("VALIDATE CART ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to validate cart.",
      });
    }
  });

  return router;
};
export default cartsRoutes;
