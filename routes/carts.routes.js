import { Router } from "express";
import { ObjectId } from "mongodb";

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
      // Request Body
      // -----------------------------------

      const { productId, quantity = 1 } = req.body;

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

      const qty = Math.max(1, Math.min(Number(quantity) || 1, 99));

      const productObjectId = new ObjectId(productId);

      // -----------------------------------
      // Get Latest Product
      // -----------------------------------

      const product = await productsCollection.findOne(
        { _id: productObjectId },
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
          message: "Product not found.",
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

      // -----------------------------------
      // Latest Price
      // -----------------------------------

      const price = Number(product.price || 0);

      const discount = Number(product.discount || 0);

      const finalPrice = Number((price - (price * discount) / 100).toFixed(2));

      // -----------------------------------
      // Existing Cart Item
      // -----------------------------------

      const existingItem = await cartsCollection.findOne({
        email,
        productId: productObjectId,
      });

      if (existingItem) {
        const newQuantity = Math.min(existingItem.quantity + qty, 99);

        if (newQuantity > stock) {
          return res.status(400).json({
            success: false,
            message: `Only ${stock} item(s) available.`,
          });
        }

        const subtotal = Number((newQuantity * finalPrice).toFixed(2));

        await cartsCollection.updateOne(
          { _id: existingItem._id },
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

              quantity: newQuantity,
              subtotal,

              updatedAt: new Date(),
            },
          },
        );

        return res.status(200).json({
          success: true,
          message: "Cart updated successfully.",
        });
      }

      // -----------------------------------
      // New Quantity Validation
      // -----------------------------------

      if (qty > stock) {
        return res.status(400).json({
          success: false,
          message: `Only ${stock} item(s) available.`,
        });
      }

      // -----------------------------------
      // Create Cart Item
      // -----------------------------------

      const cartItem = {
        email,

        productId: productObjectId,

        name: product.name,

        image: product.image || "",

        brand: product.brand || "",

        category: product.category || "",

        weight: product.weight || "",

        price,

        discount,

        finalPrice,

        quantity: qty,

        subtotal: Number((qty * finalPrice).toFixed(2)),

        createdAt: new Date(),

        updatedAt: new Date(),
      };

      const result = await cartsCollection.insertOne(cartItem);

      return res.status(201).json({
        success: true,
        message: "Product added to cart successfully.",
        insertedId: result.insertedId,
      });
    } catch (error) {
      console.error("ADD TO CART ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to add product to cart.",
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
      const email = req.user?.email;
      const { id } = req.params;

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

      await cartsCollection.deleteOne({
        _id: cartId,
      });

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
        message: "Failed to remove cart item.",
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
      // Check Cart
      // -----------------------------------

      const cartCount = await cartsCollection.countDocuments({
        email,
      });

      if (cartCount === 0) {
        return res.status(200).json({
          success: true,
          message: "Your cart is already empty.",
          deletedCount: 0,
        });
      }

      // -----------------------------------
      // Clear Cart
      // -----------------------------------

      const { deletedCount } = await cartsCollection.deleteMany({
        email,
      });

      // -----------------------------------
      // Success Response
      // -----------------------------------

      return res.status(200).json({
        success: true,
        message: "Cart cleared successfully.",
        data: {
          deletedCount,
        },
      });
    } catch (error) {
      console.error("CLEAR CART ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to clear cart.",
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
      // Aggregate Cart Count
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

      // -----------------------------------
      // Success Response
      // -----------------------------------

      return res.status(200).json({
        success: true,
        data: {
          totalItems: summary?.totalItems || 0,
          totalQuantity: summary?.totalQuantity || 0,
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
      // Cart Summary
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

              subtotal: {
                $sum: {
                  $ifNull: ["$subtotal", 0],
                },
              },

              discount: {
                $sum: {
                  $multiply: [
                    {
                      $subtract: [
                        {
                          $ifNull: ["$price", 0],
                        },
                        {
                          $ifNull: ["$finalPrice", 0],
                        },
                      ],
                    },
                    {
                      $ifNull: ["$quantity", 0],
                    },
                  ],
                },
              },
            },
          },
        ])
        .toArray();

      // -----------------------------------
      // Empty Cart
      // -----------------------------------

      if (!summary) {
        return res.status(200).json({
          success: true,
          data: {
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
      // Format Numbers
      // -----------------------------------

      const subtotal = Number(summary.subtotal.toFixed(2));

      const discount = Number(summary.discount.toFixed(2));

      // -----------------------------------
      // Shipping
      // -----------------------------------

      const shipping = subtotal >= 1000 ? 0 : 60;

      // -----------------------------------
      // Tax
      // -----------------------------------

      const tax = 0;

      // -----------------------------------
      // Grand Total
      // -----------------------------------

      const grandTotal = Number((subtotal + shipping + tax).toFixed(2));

      // -----------------------------------
      // Success Response
      // -----------------------------------

      return res.status(200).json({
        success: true,
        data: {
          totalItems: summary.totalItems,
          totalQuantity: summary.totalQuantity,
          subtotal,
          discount,
          shipping,
          tax,
          grandTotal,
        },
      });
    } catch (error) {
      console.error("GET CART SUMMARY ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to load cart summary.",
      });
    }
  });

  // ==========================================================
  // Part 8
  // POST /carts/validate
  // Validate Cart Before Checkout
  // ==========================================================

  router.post("/validate", verifyToken, async (req, res) => {
    console.log("VALIDATE API HIT");
    try {
      const email = req.user?.email;

      if (!email) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized.",
        });
      }

      // -----------------------------------
      // Get User Cart
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

      const validatedItems = [];
      const errors = [];

      // -----------------------------------
      // Validate Every Cart Item
      // -----------------------------------

      for (const cart of cartItems) {
        if (!cart.productId) {
          errors.push({
            productId: null,
            message: "Invalid product.",
          });

          continue;
        }

        let productId;

        try {
          productId =
            cart.productId instanceof ObjectId
              ? cart.productId
              : new ObjectId(cart.productId);
        } catch {
          errors.push({
            productId: cart.productId,
            message: "Invalid product ID.",
          });

          continue;
        }

        const product = await productsCollection.findOne(
          { _id: productId },
          {
            projection: {
              name: 1,
              image: 1,
              brand: 1,
              category: 1,
              price: 1,
              discount: 1,
              stock: 1,
            },
          },
        );

        // -----------------------------------
        // Product Deleted
        // -----------------------------------

        if (!product) {
          errors.push({
            productId,
            message: `"${cart.name}" no longer exists.`,
          });

          continue;
        }

        // -----------------------------------
        // Quantity
        // -----------------------------------

        const quantity = Math.max(1, Math.min(Number(cart.quantity) || 1, 99));

        // -----------------------------------
        // Stock Validation
        // -----------------------------------

        const stock = Number(product.stock || 0);

        if (stock <= 0) {
          errors.push({
            productId,
            message: `${product.name} is out of stock.`,
          });

          continue;
        }

        if (quantity > stock) {
          errors.push({
            productId,
            message: `Only ${stock} item(s) available for ${product.name}.`,
          });

          continue;
        }

        // -----------------------------------
        // Latest Price
        // -----------------------------------

        const price = Number(product.price || 0);

        const discount = Number(product.discount || 0);

        const finalPrice = Number(
          (price - (price * discount) / 100).toFixed(2),
        );

        const subtotal = Number((finalPrice * quantity).toFixed(2));

        const discountAmount = Number(
          ((price - finalPrice) * quantity).toFixed(2),
        );

        validatedItems.push({
          productId,

          name: product.name,

          image: product.image || "",

          brand: product.brand || "",

          category: product.category || "",

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

      const totalItems = validatedItems.length;

      const totalQuantity = validatedItems.reduce(
        (sum, item) => sum + item.quantity,
        0,
      );

      const subtotal = Number(
        validatedItems.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2),
      );

      const totalDiscount = Number(
        validatedItems
          .reduce((sum, item) => sum + item.discountAmount, 0)
          .toFixed(2),
      );

      const shipping = subtotal >= 1000 ? 0 : 60;

      const tax = 0;

      const grandTotal = Number((subtotal + shipping + tax).toFixed(2));

      // -----------------------------------
      // Success Response
      // -----------------------------------

      return res.status(200).json({
        success: true,
        message: "Cart validated successfully.",

        data: {
          items: validatedItems,

          totalItems,

          totalQuantity,

          subtotal,

          totalDiscount,

          shipping,

          tax,

          grandTotal,
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
