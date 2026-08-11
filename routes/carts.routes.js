import { Router } from "express";
import { ObjectId } from "mongodb";

const cartsRoutes = (cartsCollection, productsCollection, verifyToken) => {
  const router = Router();

  // =========================================================
  // HELPERS
  // =========================================================

  const normalizeEmail = (email = "") => {
    return typeof email === "string" ? email.trim().toLowerCase() : "";
  };

  const isValidObjectId = (id) => {
    return typeof id === "string" && ObjectId.isValid(id);
  };

  const calculateItemValues = (product, quantity) => {
    const price = Number(product.price);

    const discount = Math.max(0, Math.min(Number(product.discount) || 0, 100));

    const finalPrice = Number((price - (price * discount) / 100).toFixed(2));

    const subtotal = Number((quantity * finalPrice).toFixed(2));

    return {
      price,
      discount,
      finalPrice,
      subtotal,
    };
  };

  const calculateSummary = (cart) => {
    let totalItems = 0;
    let totalQuantity = 0;
    let subtotal = 0;
    let discount = 0;

    for (const item of cart) {
      const quantity = Number(item.quantity) || 0;
      const price = Number(item.price) || 0;
      const finalPrice = Number(item.finalPrice) || price;

      totalItems += 1;
      totalQuantity += quantity;

      subtotal += Number(item.subtotal) || 0;

      discount += (price - finalPrice) * quantity;
    }

    subtotal = Number(subtotal.toFixed(2));
    discount = Number(discount.toFixed(2));

    // Free shipping over ৳1000
    const shipping = subtotal >= 1000 ? 0 : 60;

    // Currently no tax
    const tax = 0;

    const grandTotal = Number((subtotal + shipping + tax).toFixed(2));

    return {
      totalItems,
      totalQuantity,
      subtotal,
      discount: Number(discount.toFixed(2)),
      shipping,
      tax,
      grandTotal,
    };
  };

  // =========================================================
  // GET /carts
  // Get Current User Cart
  router.get("/", verifyToken, async (req, res) => {
    try {
      // ============================================================
      // AUTHENTICATED USER EMAIL
      // ============================================================

      const email = normalizeEmail(req.user?.email);

      if (!email) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized.",
        });
      }

      // ============================================================
      // FETCH USER CART
      // ============================================================

      const cart = await cartsCollection
        .find(
          { email },
          {
            projection: {
              email: 0,
            },
          },
        )
        .sort({
          createdAt: -1,
        })
        .toArray();

      // ============================================================
      // CALCULATE CART SUMMARY
      // ============================================================

      const summary = calculateSummary(cart);

      // ============================================================
      // SAFE SUMMARY
      // ============================================================

      const safeSummary = {
        totalItems: Number(summary?.totalItems) || 0,

        totalQuantity: Number(summary?.totalQuantity) || 0,

        subtotal: Number(summary?.subtotal) || 0,

        discount: Number(summary?.discount) || 0,

        shipping: Number(summary?.shipping) || 0,

        tax: Number(summary?.tax) || 0,

        grandTotal: Number(summary?.grandTotal) || 0,
      };

      // ============================================================
      // SUCCESS
      // ============================================================

      return res.status(200).json({
        success: true,

        count: cart.length,

        data: cart,

        summary: safeSummary,
      });
    } catch (error) {
      // ============================================================
      // SERVER ERROR
      // ============================================================

      console.error("GET /carts ERROR:", error?.message || error);

      return res.status(500).json({
        success: false,
        message: "Failed to load cart.",
      });
    }
  });

  // =========================================================
  // GET /carts/count
  // Fast Cart Count
  // =========================================================

  router.get("/count", verifyToken, async (req, res) => {
    try {
      const email = normalizeEmail(req.user?.email);

      if (!email) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized.",
        });
      }

      const count = await cartsCollection.countDocuments({
        email,
      });

      return res.status(200).json({
        success: true,
        count,
      });
    } catch (error) {
      console.error("GET /carts/count ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to load cart count.",
      });
    }
  });

  // =========================================================
  // POST /carts
  // Add Product To Cart
  // =========================================================

  router.post("/", verifyToken, async (req, res) => {
    try {
      // ============================================================
      // AUTHORIZATION
      // ============================================================

      const email = normalizeEmail(req.user?.email);

      if (!email) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized.",
        });
      }

      // ============================================================
      // REQUEST BODY
      // ============================================================

      const { productId, quantity } = req.body || {};

      if (!productId) {
        return res.status(400).json({
          success: false,
          message: "Product ID is required.",
        });
      }

      if (!isValidObjectId(productId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid product ID.",
        });
      }

      const qty = Number(quantity);

      if (!Number.isInteger(qty) || qty < 1 || qty > 99) {
        return res.status(400).json({
          success: false,
          message: "Quantity must be between 1 and 99.",
        });
      }

      const productObjectId = new ObjectId(productId);

      // ============================================================
      // GET LATEST PRODUCT
      // ============================================================

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

      // ============================================================
      // PRODUCT INFORMATION
      // ============================================================

      const productName =
        typeof product.name === "string" && product.name.trim()
          ? product.name.trim()
          : "Unknown Product";

      const productImage =
        typeof product.image === "string" ? product.image.trim() : "";

      const productBrand =
        typeof product.brand === "string" ? product.brand.trim() : "";

      const productCategory =
        typeof product.category === "string"
          ? product.category.trim().toLowerCase()
          : "";

      const productWeight = product.weight ?? "";

      const productSku =
        typeof product.sku === "string" ? product.sku.trim() : "";

      // ============================================================
      // PRICE
      // ============================================================

      const price = Number(product.price);

      if (!Number.isFinite(price) || price < 0) {
        return res.status(400).json({
          success: false,
          message: `Invalid price for "${productName}".`,
        });
      }

      // ============================================================
      // DISCOUNT
      // ============================================================

      const discount = Number(product.discount ?? 0);

      if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
        return res.status(400).json({
          success: false,
          message: `Invalid discount for "${productName}".`,
        });
      }

      // ============================================================
      // STOCK
      // ============================================================

      const stock = Number(product.stock);

      if (!Number.isInteger(stock) || stock < 0) {
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

      // ============================================================
      // CALCULATE FINAL PRICE
      // ============================================================

      const finalPrice = Number((price - (price * discount) / 100).toFixed(2));

      const subtotal = Number((finalPrice * qty).toFixed(2));

      // ============================================================
      // CHECK EXISTING CART ITEM
      // ============================================================

      const existingItem = await cartsCollection.findOne(
        {
          email,
          productId: productObjectId,
        },
        {
          projection: {
            _id: 1,
            quantity: 1,
          },
        },
      );

      // ============================================================
      // EXISTING ITEM
      // ============================================================

      if (existingItem) {
        const existingQuantity = Number(existingItem.quantity);

        if (!Number.isInteger(existingQuantity) || existingQuantity < 1) {
          return res.status(409).json({
            success: false,
            message: "Invalid existing cart quantity.",
          });
        }

        const newQuantity = existingQuantity + qty;

        // Maximum cart quantity
        if (newQuantity > 99) {
          return res.status(400).json({
            success: false,
            message: "Maximum quantity per product is 99.",
          });
        }

        // Stock validation
        if (newQuantity > stock) {
          return res.status(400).json({
            success: false,
            message: `Only ${stock} item(s) available for "${productName}".`,
          });
        }

        const newSubtotal = Number((finalPrice * newQuantity).toFixed(2));

        const now = new Date();

        const result = await cartsCollection.updateOne(
          {
            _id: existingItem._id,
            email,
            productId: productObjectId,
          },
          {
            $set: {
              sku: productSku,
              name: productName,
              image: productImage,
              brand: productBrand,
              category: productCategory,
              weight: productWeight,

              price,
              discount,
              finalPrice,

              quantity: newQuantity,
              subtotal: newSubtotal,

              updatedAt: now,
            },
          },
        );

        if (!result.acknowledged) {
          return res.status(500).json({
            success: false,
            message: "Failed to update cart.",
          });
        }

        if (result.matchedCount === 0) {
          return res.status(409).json({
            success: false,
            message: "Cart changed while updating. Please try again.",
          });
        }

        return res.status(200).json({
          success: true,
          message: "Cart updated successfully.",
          data: {
            _id: existingItem._id,
            productId,
            quantity: newQuantity,
            price,
            discount,
            finalPrice,
            subtotal: newSubtotal,
          },
        });
      }

      // ============================================================
      // CREATE NEW CART ITEM
      // ============================================================

      const now = new Date();

      const cartItem = {
        email,

        productId: productObjectId,

        sku: productSku,
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

      // ============================================================
      // INSERT CART ITEM
      // ============================================================

      const result = await cartsCollection.insertOne(cartItem);

      if (!result.acknowledged) {
        return res.status(500).json({
          success: false,
          message: "Failed to add product to cart.",
        });
      }

      // ============================================================
      // SUCCESS
      // ============================================================

      return res.status(201).json({
        success: true,
        message: "Product added to cart successfully.",
        data: {
          _id: result.insertedId,
          productId,
          quantity: qty,
          price,
          discount,
          finalPrice,
          subtotal,
        },
      });
    } catch (error) {
      // ============================================================
      // DUPLICATE CART ITEM
      // ============================================================

      if (error?.code === 11000) {
        return res.status(409).json({
          success: false,
          message: "This product is already in your cart. Please try again.",
        });
      }

      // ============================================================
      // SERVER ERROR
      // ============================================================

      console.error("POST /carts ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to add product to cart.",
      });
    }
  });

  // =========================================================
  // PATCH /carts/:id
  // Update Cart Quantity
  // =========================================================

  router.patch("/:id", verifyToken, async (req, res) => {
    try {
      const email = normalizeEmail(req.user?.email);

      if (!email) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized.",
        });
      }

      const { id } = req.params;

      if (!isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid cart ID.",
        });
      }

      const quantity = Number(req.body?.quantity);

      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
        return res.status(400).json({
          success: false,
          message: "Quantity must be between 1 and 99.",
        });
      }

      const cartId = new ObjectId(id);

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

      // =====================================================
      // Verify Current Product Stock
      // =====================================================

      const product = await productsCollection.findOne(
        {
          _id: cartItem.productId,
        },
        {
          projection: {
            name: 1,
            price: 1,
            discount: 1,
            stock: 1,
          },
        },
      );

      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Product no longer exists.",
        });
      }

      const stock = Number(product.stock);

      if (!Number.isFinite(stock) || stock < 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid product stock.",
        });
      }

      if (quantity > stock) {
        return res.status(400).json({
          success: false,
          message: `Only ${stock} item(s) available.`,
        });
      }

      const { price, discount, finalPrice, subtotal } = calculateItemValues(
        product,
        quantity,
      );

      const result = await cartsCollection.updateOne(
        {
          _id: cartId,
          email,
        },
        {
          $set: {
            price,
            discount,
            finalPrice,
            quantity,
            subtotal,
            updatedAt: new Date(),
          },
        },
      );

      return res.status(200).json({
        success: true,
        modifiedCount: result.modifiedCount,
        message: "Cart updated successfully.",
        data: {
          _id: cartId,
          quantity,
          finalPrice,
          subtotal,
        },
      });
    } catch (error) {
      console.error("PATCH /carts/:id ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to update cart.",
      });
    }
  });

  // =========================================================
  // DELETE /carts/:id
  // Remove Single Cart Item
  // =========================================================

  router.delete("/:id", verifyToken, async (req, res) => {
    try {
      const email = normalizeEmail(req.user?.email);

      if (!email) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized.",
        });
      }

      const { id } = req.params;

      if (!isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid cart ID.",
        });
      }

      const result = await cartsCollection.deleteOne({
        _id: new ObjectId(id),
        email,
      });

      if (!result.deletedCount) {
        return res.status(404).json({
          success: false,
          message: "Cart item not found.",
        });
      }

      return res.status(200).json({
        success: true,
        deletedCount: result.deletedCount,
        message: "Cart item removed successfully.",
      });
    } catch (error) {
      console.error("DELETE /carts/:id ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to remove cart item.",
      });
    }
  });

  // =========================================================
  // DELETE /carts
  // Clear Current User Cart
  // =========================================================

  router.delete("/", verifyToken, async (req, res) => {
    try {
      const email = normalizeEmail(req.user?.email);

      if (!email) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized.",
        });
      }

      const result = await cartsCollection.deleteMany({
        email,
      });

      return res.status(200).json({
        success: true,
        deletedCount: result.deletedCount,
        message: "Cart cleared successfully.",
      });
    } catch (error) {
      console.error("DELETE /carts ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to clear cart.",
      });
    }
  });

  router.get("/summary", verifyToken, async (req, res) => {
    try {
      // ============================================================
      // AUTHORIZATION
      // ============================================================

      const email = normalizeEmail(req.user?.email);

      if (!email) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized.",
        });
      }

      // ============================================================
      // LOAD ONLY REQUIRED CART FIELDS
      // ============================================================

      const cartItems = await cartsCollection
        .find(
          { email },
          {
            projection: {
              price: 1,
              finalPrice: 1,
              quantity: 1,
            },
          },
        )
        .toArray();

      // ============================================================
      // EMPTY CART
      // ============================================================

      if (cartItems.length === 0) {
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

      // ============================================================
      // NORMALIZE CART ITEMS
      // ============================================================

      const items = cartItems.map((item) => {
        const price = Math.max(0, Number(item?.price) || 0);

        const finalPrice = Math.max(0, Number(item?.finalPrice) || price);

        const quantity = Math.max(1, Number(item?.quantity) || 1);

        return {
          price,
          finalPrice,
          quantity,
        };
      });

      // ============================================================
      // CALCULATE SUMMARY
      // ============================================================

      const calculatedSummary = calculateOrderSummary(items);

      // ============================================================
      // KEEP API RESPONSE CONSISTENT
      // ============================================================

      const summary = {
        totalItems: Number(calculatedSummary.totalItems) || 0,

        totalQuantity: Number(calculatedSummary.totalQuantity) || 0,

        subtotal: Number(calculatedSummary.subtotal) || 0,

        discount: Number(calculatedSummary.totalDiscount) || 0,

        shipping: Number(calculatedSummary.shipping) || 0,

        tax: Number(calculatedSummary.tax) || 0,

        grandTotal: Number(calculatedSummary.grandTotal) || 0,
      };

      // ============================================================
      // SUCCESS
      // ============================================================

      return res.status(200).json({
        success: true,
        data: summary,
      });
    } catch (error) {
      console.error("GET /carts/summary ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to load cart summary.",
      });
    }
  });
  router.post("/validate", verifyToken, async (req, res) => {
    try {
      // ============================================================
      // AUTHORIZATION
      // ============================================================

      const email = normalizeEmail(req.user?.email);

      if (!email) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized.",
        });
      }

      // ============================================================
      // LOAD CART
      // ============================================================

      const cartItems = await cartsCollection
        .find(
          { email },
          {
            projection: {
              _id: 1,
              productId: 1,
              quantity: 1,
              name: 1,
            },
          },
        )
        .sort({ createdAt: 1 })
        .toArray();

      // ============================================================
      // EMPTY CART
      // ============================================================

      if (cartItems.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Your cart is empty.",
        });
      }

      // ============================================================
      // VALIDATE PRODUCT IDS
      // ============================================================

      const productIds = [];
      const productIdMap = new Map();
      const errors = [];

      for (const cart of cartItems) {
        if (!cart.productId) {
          errors.push({
            cartId: cart._id,
            productId: null,
            message: "Product ID is missing.",
          });

          continue;
        }

        let productObjectId;

        try {
          productObjectId =
            cart.productId instanceof ObjectId
              ? cart.productId
              : new ObjectId(String(cart.productId));
        } catch {
          errors.push({
            cartId: cart._id,
            productId: String(cart.productId),
            message: "Invalid product ID.",
          });

          continue;
        }

        const productKey = productObjectId.toString();

        // Prevent duplicate products
        if (productIdMap.has(productKey)) {
          errors.push({
            cartId: cart._id,
            productId: productKey,
            message: "Duplicate product found in cart.",
          });

          continue;
        }

        productIdMap.set(productKey, cart);
        productIds.push(productObjectId);
      }

      // ============================================================
      // INVALID CART PRODUCT IDS
      // ============================================================

      if (errors.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Cart validation failed.",
          errors,
        });
      }

      if (productIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No valid products found in your cart.",
        });
      }

      // ============================================================
      // LOAD PRODUCTS IN ONE QUERY
      // ============================================================

      const products = await productsCollection
        .find(
          {
            _id: {
              $in: productIds,
            },
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
        )
        .toArray();

      // ============================================================
      // FAST PRODUCT LOOKUP
      // ============================================================

      const productMap = new Map(
        products.map((product) => [product._id.toString(), product]),
      );

      // ============================================================
      // VALIDATE CART ITEMS
      // ============================================================

      const validatedItems = [];

      for (const cart of cartItems) {
        const productKey = cart.productId?.toString();

        const product = productMap.get(productKey);

        // ----------------------------------------------------------
        // PRODUCT NOT FOUND
        // ----------------------------------------------------------

        if (!product) {
          errors.push({
            cartId: cart._id,
            productId: productKey,
            message: `"${cart.name || "Product"}" no longer exists.`,
          });

          continue;
        }

        // ----------------------------------------------------------
        // PRODUCT NAME
        // ----------------------------------------------------------

        const productName =
          typeof product.name === "string" && product.name.trim()
            ? product.name.trim()
            : "Unknown Product";

        // ----------------------------------------------------------
        // QUANTITY
        // ----------------------------------------------------------

        const quantity = Number(cart.quantity);

        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
          errors.push({
            cartId: cart._id,
            productId: product._id,
            message: `Invalid quantity for "${productName}".`,
          });

          continue;
        }

        // ----------------------------------------------------------
        // STOCK
        // ----------------------------------------------------------

        const stock = Number(product.stock);

        if (!Number.isFinite(stock) || stock < 0) {
          errors.push({
            cartId: cart._id,
            productId: product._id,
            message: `Invalid stock for "${productName}".`,
          });

          continue;
        }

        if (stock === 0) {
          errors.push({
            cartId: cart._id,
            productId: product._id,
            message: `"${productName}" is out of stock.`,
          });

          continue;
        }

        if (quantity > stock) {
          errors.push({
            cartId: cart._id,
            productId: product._id,
            message: `Only ${stock} item(s) available for "${productName}".`,
          });

          continue;
        }

        // ----------------------------------------------------------
        // PRICE
        // ----------------------------------------------------------

        const price = Number(product.price);

        if (!Number.isFinite(price) || price < 0) {
          errors.push({
            cartId: cart._id,
            productId: product._id,
            message: `Invalid price for "${productName}".`,
          });

          continue;
        }

        // ----------------------------------------------------------
        // DISCOUNT
        // ----------------------------------------------------------

        const rawDiscount = Number(product.discount);

        const discount = Number.isFinite(rawDiscount)
          ? Math.max(0, Math.min(rawDiscount, 100))
          : 0;

        // ----------------------------------------------------------
        // FINAL PRICE
        // ----------------------------------------------------------

        const finalPrice = Number(
          (price - (price * discount) / 100).toFixed(2),
        );

        // ----------------------------------------------------------
        // SUBTOTAL
        // ----------------------------------------------------------

        const subtotal = Number((finalPrice * quantity).toFixed(2));

        // ----------------------------------------------------------
        // DISCOUNT AMOUNT
        // ----------------------------------------------------------

        const discountAmount = Number(
          ((price - finalPrice) * quantity).toFixed(2),
        );

        // ----------------------------------------------------------
        // VALIDATED ITEM
        // ----------------------------------------------------------

        validatedItems.push({
          productId: product._id,

          sku: typeof product.sku === "string" ? product.sku.trim() : "",

          name: productName,

          image: typeof product.image === "string" ? product.image.trim() : "",

          brand: typeof product.brand === "string" ? product.brand.trim() : "",

          category:
            typeof product.category === "string"
              ? product.category.trim().toLowerCase()
              : "",

          weight: product.weight ?? null,

          quantity,

          price,

          discount,

          finalPrice,

          subtotal,

          discountAmount,
        });
      }

      // ============================================================
      // VALIDATION FAILED
      // ============================================================

      if (errors.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Cart validation failed.",
          errors,
        });
      }

      // ============================================================
      // SAFETY CHECK
      // ============================================================

      if (validatedItems.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No valid products found in your cart.",
        });
      }

      // ============================================================
      // ORDER SUMMARY
      // ============================================================

      const calculatedSummary = calculateOrderSummary(validatedItems);

      const summary = {
        totalItems: Number(calculatedSummary.totalItems) || 0,

        totalQuantity: Number(calculatedSummary.totalQuantity) || 0,

        subtotal: Number(calculatedSummary.subtotal) || 0,

        discount: Number(calculatedSummary.totalDiscount) || 0,

        shipping: Number(calculatedSummary.shipping) || 0,

        tax: Number(calculatedSummary.tax) || 0,

        grandTotal: Number(calculatedSummary.grandTotal) || 0,
      };

      // ============================================================
      // SUCCESS
      // ============================================================

      return res.status(200).json({
        success: true,
        message: "Cart validated successfully.",
        data: {
          items: validatedItems,
          ...summary,
        },
      });
    } catch (error) {
      console.error("POST /carts/validate ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to validate cart.",
      });
    }
  });

  return router;
};

export default cartsRoutes;
