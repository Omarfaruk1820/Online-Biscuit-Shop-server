import { Router } from "express";
import { ObjectId } from "mongodb";
import calculateOrderSummary from "../utils/orderSummary.js";

const cartsRoutes = (cartsCollection, productsCollection, verifyToken) => {
  const router = Router();

  // =========================================================
  // CONSTANTS
  // =========================================================

  const FREE_SHIPPING_THRESHOLD = 1000;
  const SHIPPING_CHARGE = 60;

  // =========================================================
  // HELPERS
  // =========================================================

  const normalizeEmail = (email = "") => {
    return typeof email === "string" ? email.trim().toLowerCase() : "";
  };

  const isValidObjectId = (id) => {
    return typeof id === "string" && ObjectId.isValid(id);
  };

  const toSafeNumber = (value, fallback = 0) => {
    const number = Number(value);

    return Number.isFinite(number) ? number : fallback;
  };

  const round = (value) => {
    return Number(toSafeNumber(value).toFixed(2));
  };

  const calculateItemValues = (product, quantity) => {
    if (!product) {
      throw new Error("Product not found.");
    }

    const safeQuantity = Number(quantity);

    if (!Number.isInteger(safeQuantity) || safeQuantity < 1) {
      throw new Error("Quantity must be a positive integer.");
    }

    const price = Math.max(0, toSafeNumber(product.price));

    const discount = Math.min(100, Math.max(0, toSafeNumber(product.discount)));

    const finalPrice = round(price - (price * discount) / 100);

    const subtotal = round(finalPrice * safeQuantity);

    return {
      price,
      discount,
      finalPrice,
      subtotal,
    };
  };

  const calculateCartSummary = (cart = []) => {
    if (!Array.isArray(cart) || cart.length === 0) {
      return {
        totalItems: 0,
        totalQuantity: 0,
        subtotal: 0,
        totalDiscount: 0,
        shipping: 0,
        tax: 0,
        grandTotal: 0,
      };
    }

    /*
     * Use the shared order-summary utility.
     *
     * Your calculateOrderSummary.js expects:
     * price
     * finalPrice
     * quantity
     */
    const items = cart.map((item) => ({
      price: Math.max(0, toSafeNumber(item?.price)),

      finalPrice: Math.max(0, toSafeNumber(item?.finalPrice, item?.price)),

      quantity: Number(item?.quantity),
    }));

    const summary = calculateOrderSummary(items);

    const subtotal = round(summary?.subtotal);
    const totalDiscount = round(summary?.totalDiscount);

    /*
     * Keep shipping calculation centralized and safe.
     *
     * If your orderSummary utility already handles
     * shipping, make sure both utilities use exactly
     * the same rules.
     */
    const shipping =
      subtotal >= FREE_SHIPPING_THRESHOLD
        ? 0
        : cart.length > 0
          ? SHIPPING_CHARGE
          : 0;

    const tax = round(summary?.tax);

    const grandTotal = round(subtotal + shipping + tax);

    return {
      totalItems: Number(summary?.totalItems) || 0,

      totalQuantity: Number(summary?.totalQuantity) || 0,

      subtotal,

      totalDiscount,

      shipping,

      tax,

      grandTotal,
    };
  };

  const getAuthenticatedEmail = (req) => {
    return normalizeEmail(req.user?.email);
  };

  // =========================================================
  // GET /carts
  // Get Current User Cart
  // =========================================================

  router.get("/", verifyToken, async (req, res) => {
    console.log(req.user?.email);
    console.log("this is the meail",email)
    console.log('this is the data',data)
    try {
      const email = getAuthenticatedEmail(req);

      if (!email) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized.",
        });
      }

      // =====================================================
      // FETCH CART
      // =====================================================

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

      // =====================================================
      // CALCULATE SUMMARY
      // =====================================================

      const summary = calculateCartSummary(cart);

      // =====================================================
      // SAFE RESPONSE
      // =====================================================

      return res.status(200).json({
        success: true,

        count: cart.length,

        data: cart,

        summary: {
          totalItems: Number(summary.totalItems) || 0,

          totalQuantity: Number(summary.totalQuantity) || 0,

          subtotal: Number(summary.subtotal) || 0,

          totalDiscount: Number(summary.totalDiscount) || 0,

          shipping: Number(summary.shipping) || 0,

          tax: Number(summary.tax) || 0,

          grandTotal: Number(summary.grandTotal) || 0,
        },
      });
    } catch (error) {
      console.error("GET /carts ERROR:", error?.message || error);

      return res.status(500).json({
        success: false,
        message: "Failed to load cart.",
      });
    }
  });

  // =========================================================
  // GET /carts/count
  // Get Current User Cart Item Count
  // =========================================================

  router.get("/count", verifyToken, async (req, res) => {
    try {
      const email = getAuthenticatedEmail(req);

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
        count: Number(count) || 0,
      });
    } catch (error) {
      console.error("GET /carts/count ERROR:", error?.message || error);

      return res.status(500).json({
        success: false,
        message: "Failed to load cart count.",
      });
    }
  });

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
      // GET LATEST PRODUCT FROM DATABASE
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
        typeof product.category === "string" ? product.category.trim() : "";

      const productWeight =
        product.weight !== undefined && product.weight !== null
          ? product.weight
          : "";

      const productSku =
        typeof product.sku === "string" ? product.sku.trim() : "";

      // ============================================================
      // PRICE VALIDATION
      // ============================================================

      const price = Number(product.price);

      if (!Number.isFinite(price) || price < 0) {
        return res.status(400).json({
          success: false,
          message: `Invalid price for "${productName}".`,
        });
      }

      const safePrice = Number(price.toFixed(2));

      // ============================================================
      // DISCOUNT VALIDATION
      // ============================================================

      const discount = Number(product.discount ?? 0);

      if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
        return res.status(400).json({
          success: false,
          message: `Invalid discount for "${productName}".`,
        });
      }

      const safeDiscount = Number(discount.toFixed(2));

      // ============================================================
      // STOCK VALIDATION
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
      // CALCULATE CURRENT FINAL PRICE
      // ============================================================

      const finalPrice = Number(
        (safePrice - (safePrice * safeDiscount) / 100).toFixed(2),
      );

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
            email: 1,
            productId: 1,
            quantity: 1,
          },
        },
      );

      // ============================================================
      // UPDATE EXISTING CART ITEM
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

        // ----------------------------------------------------------
        // MAXIMUM QUANTITY
        // ----------------------------------------------------------

        if (newQuantity > 99) {
          return res.status(400).json({
            success: false,
            message: "Maximum quantity per product is 99.",
          });
        }

        // ----------------------------------------------------------
        // STOCK VALIDATION
        // ----------------------------------------------------------

        if (newQuantity > stock) {
          return res.status(400).json({
            success: false,
            message: `Only ${stock} item(s) available for "${productName}".`,
          });
        }

        // ----------------------------------------------------------
        // CALCULATE NEW SUBTOTAL
        // ----------------------------------------------------------

        const newSubtotal = Number((finalPrice * newQuantity).toFixed(2));

        const now = new Date();

        // ----------------------------------------------------------
        // UPDATE CART
        // ----------------------------------------------------------

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

              price: safePrice,
              discount: safeDiscount,
              finalPrice,

              quantity: newQuantity,
              subtotal: newSubtotal,

              updatedAt: now,
            },
          },
        );

        // ----------------------------------------------------------
        // UPDATE FAILED
        // ----------------------------------------------------------

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

        // ----------------------------------------------------------
        // GET UPDATED CART ITEM
        // ----------------------------------------------------------

        const updatedCartItem = await cartsCollection.findOne({
          _id: existingItem._id,
          email,
        });

        return res.status(200).json({
          success: true,
          message: "Cart updated successfully.",
          data: updatedCartItem,
        });
      }

      // ============================================================
      // CREATE NEW CART ITEM
      // ============================================================

      const now = new Date();

      const subtotal = Number((finalPrice * qty).toFixed(2));

      const cartItem = {
        email,

        productId: productObjectId,

        sku: productSku,
        name: productName,
        image: productImage,
        brand: productBrand,
        category: productCategory,
        weight: productWeight,

        price: safePrice,
        discount: safeDiscount,
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

      const createdCartItem = {
        ...cartItem,
        _id: result.insertedId,
      };

      return res.status(201).json({
        success: true,
        message: "Product added to cart successfully.",
        data: createdCartItem,
      });
    } catch (error) {
      // ============================================================
      // DUPLICATE CART ITEM
      // ============================================================

      if (error?.code === 11000) {
        return res.status(409).json({
          success: false,
          message:
            "This product is already in your cart. Please refresh and try again.",
        });
      }

      // ============================================================
      // SERVER ERROR
      // ============================================================

      console.error("POST /carts ERROR:", error?.message || error);

      return res.status(500).json({
        success: false,
        message: "Failed to add product to cart.",
      });
    }
  });
  // =========================================================
  // PATCH /carts/:id
  // Update Cart Item Quantity
  // =========================================================

  router.patch("/:id", verifyToken, async (req, res) => {
    try {
      // =========================================================
      // AUTHORIZATION
      // =========================================================

      const email = normalizeEmail(req.user?.email);

      if (!email) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized.",
        });
      }

      // =========================================================
      // CART ID
      // =========================================================

      const { id } = req.params;

      if (!isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid cart ID.",
        });
      }

      // =========================================================
      // QUANTITY
      // =========================================================

      const quantity = Number(req.body?.quantity);

      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
        return res.status(400).json({
          success: false,
          message: "Quantity must be between 1 and 99.",
        });
      }

      const cartId = new ObjectId(id);

      // =========================================================
      // FIND CART ITEM
      // =========================================================

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

      // =========================================================
      // VALIDATE PRODUCT ID
      // =========================================================

      if (!cartItem.productId) {
        return res.status(400).json({
          success: false,
          message: "Cart item has an invalid product reference.",
        });
      }

      // =========================================================
      // GET LATEST PRODUCT
      // =========================================================

      const product = await productsCollection.findOne(
        {
          _id: cartItem.productId,
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
          message: "Product no longer exists.",
        });
      }

      // =========================================================
      // PRODUCT NAME
      // =========================================================

      const productName =
        typeof product.name === "string" && product.name.trim()
          ? product.name.trim()
          : "Unknown Product";

      // =========================================================
      // PRICE
      // =========================================================

      const price = Number(product.price);

      if (!Number.isFinite(price) || price < 0) {
        return res.status(400).json({
          success: false,
          message: `Invalid price for "${productName}".`,
        });
      }

      // =========================================================
      // DISCOUNT
      // =========================================================

      const discount = Number(product.discount ?? 0);

      if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
        return res.status(400).json({
          success: false,
          message: `Invalid discount for "${productName}".`,
        });
      }

      // =========================================================
      // STOCK
      // =========================================================

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

      if (quantity > stock) {
        return res.status(400).json({
          success: false,
          message: `Only ${stock} item(s) available for "${productName}".`,
        });
      }

      // =========================================================
      // CALCULATE CURRENT PRICE
      // =========================================================

      const finalPrice = Number((price - (price * discount) / 100).toFixed(2));

      const subtotal = Number((finalPrice * quantity).toFixed(2));

      // =========================================================
      // UPDATE CART ITEM
      // =========================================================

      const now = new Date();

      const result = await cartsCollection.updateOne(
        {
          _id: cartId,
          email,
        },
        {
          $set: {
            sku: typeof product.sku === "string" ? product.sku.trim() : "",

            name: productName,

            image:
              typeof product.image === "string" ? product.image.trim() : "",

            brand:
              typeof product.brand === "string" ? product.brand.trim() : "",

            category:
              typeof product.category === "string"
                ? product.category.trim().toLowerCase()
                : "",

            weight: product.weight ?? "",

            price,
            discount,
            finalPrice,

            quantity,
            subtotal,

            updatedAt: now,
          },
        },
      );

      // =========================================================
      // UPDATE FAILURE
      // =========================================================

      if (!result.acknowledged) {
        return res.status(500).json({
          success: false,
          message: "Failed to update cart.",
        });
      }

      if (result.matchedCount === 0) {
        return res.status(404).json({
          success: false,
          message: "Cart item no longer exists.",
        });
      }

      // =========================================================
      // RETURN UPDATED ITEM
      // =========================================================

      const updatedCartItem = await cartsCollection.findOne({
        _id: cartId,
        email,
      });

      // =========================================================
      // SUCCESS
      // =========================================================

      return res.status(200).json({
        success: true,
        message: "Cart updated successfully.",
        data: updatedCartItem,
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
  // GET /carts/summary
  // Get Current User Cart Summary
  // =========================================================

  router.get("/summary", verifyToken, async (req, res) => {
    try {
      // =========================================================
      // AUTHORIZATION
      // =========================================================

      const email = normalizeEmail(req.user?.email);

      if (!email) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized.",
        });
      }

      // =========================================================
      // GET CART ITEMS
      // =========================================================

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

      // =========================================================
      // CALCULATE SUMMARY
      // =========================================================

      const summary = calculateOrderSummary(cartItems);

      // =========================================================
      // SAFE RESPONSE
      // =========================================================

      const safeSummary = {
        totalItems: Number(summary?.totalItems) || 0,

        totalQuantity: Number(summary?.totalQuantity) || 0,

        subtotal: Number(summary?.subtotal) || 0,

        discount: Number(summary?.totalDiscount) || 0,

        shipping: Number(summary?.shipping) || 0,

        tax: Number(summary?.tax) || 0,

        grandTotal: Number(summary?.grandTotal) || 0,
      };

      // =========================================================
      // SUCCESS
      // =========================================================

      return res.status(200).json({
        success: true,
        data: safeSummary,
      });
    } catch (error) {
      console.error("GET /carts/summary ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to load cart summary.",
      });
    }
  });

  // =========================================================
  // POST /carts/validate
  // Validate Current User Cart Before Checkout
  // =========================================================

  router.post("/validate", verifyToken, async (req, res) => {
    try {
      // =========================================================
      // AUTHORIZATION
      // =========================================================

      const email = normalizeEmail(req.user?.email);

      if (!email) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized.",
        });
      }

      // =========================================================
      // LOAD CART
      // =========================================================

      const cartItems = await cartsCollection
        .find(
          { email },
          {
            projection: {
              _id: 1,
              productId: 1,
              quantity: 1,
              name: 1,
              createdAt: 1,
            },
          },
        )
        .sort({ createdAt: 1 })
        .toArray();

      // =========================================================
      // EMPTY CART
      // =========================================================

      if (cartItems.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Your cart is empty.",
        });
      }

      // =========================================================
      // MAX CART ITEMS SAFETY LIMIT
      // =========================================================

      const MAX_CART_ITEMS = 100;

      if (cartItems.length > MAX_CART_ITEMS) {
        return res.status(400).json({
          success: false,
          message: `Cart cannot contain more than ${MAX_CART_ITEMS} products.`,
        });
      }

      // =========================================================
      // VALIDATE PRODUCT IDS
      // =========================================================

      const productIds = [];
      const productIdSet = new Set();
      const errors = [];

      for (const cartItem of cartItems) {
        if (!cartItem?.productId) {
          errors.push({
            cartId: cartItem?._id || null,
            productId: null,
            message: "Product ID is missing.",
          });

          continue;
        }

        let productObjectId;

        try {
          if (cartItem.productId instanceof ObjectId) {
            productObjectId = cartItem.productId;
          } else if (ObjectId.isValid(String(cartItem.productId))) {
            productObjectId = new ObjectId(String(cartItem.productId));
          } else {
            throw new Error("Invalid ObjectId");
          }
        } catch {
          errors.push({
            cartId: cartItem?._id || null,
            productId: String(cartItem.productId),
            message: "Invalid product ID.",
          });

          continue;
        }

        const productKey = productObjectId.toString();

        // =======================================================
        // DUPLICATE PRODUCT
        // =======================================================

        if (productIdSet.has(productKey)) {
          errors.push({
            cartId: cartItem?._id || null,
            productId: productObjectId,
            message: "Duplicate product found in cart.",
          });

          continue;
        }

        productIdSet.add(productKey);
        productIds.push(productObjectId);
      }

      // =========================================================
      // INVALID PRODUCT IDS
      // =========================================================

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

      // =========================================================
      // LOAD CURRENT PRODUCTS
      // =========================================================

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

      // =========================================================
      // PRODUCT MAP
      // =========================================================

      const productMap = new Map(
        products.map((product) => [product._id.toString(), product]),
      );

      // =========================================================
      // VALIDATED ITEMS
      // =========================================================

      const validatedItems = [];

      for (const cartItem of cartItems) {
        const productId = cartItem.productId;

        const productKey =
          productId instanceof ObjectId
            ? productId.toString()
            : String(productId);

        const product = productMap.get(productKey);

        // =======================================================
        // PRODUCT NOT FOUND
        // =======================================================

        if (!product) {
          errors.push({
            cartId: cartItem?._id || null,
            productId: productId || null,
            message: `"${cartItem?.name || "Product"}" no longer exists.`,
          });

          continue;
        }

        // =======================================================
        // PRODUCT NAME
        // =======================================================

        const productName =
          typeof product.name === "string" && product.name.trim()
            ? product.name.trim()
            : "Unknown Product";

        // =======================================================
        // QUANTITY
        // =======================================================

        const quantity = Number(cartItem.quantity);

        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
          errors.push({
            cartId: cartItem?._id || null,
            productId: product._id,
            message: `Invalid quantity for "${productName}".`,
          });

          continue;
        }

        // =======================================================
        // PRICE
        // =======================================================

        const price = Number(product.price);

        if (!Number.isFinite(price) || price < 0) {
          errors.push({
            cartId: cartItem?._id || null,
            productId: product._id,
            message: `Invalid price for "${productName}".`,
          });

          continue;
        }

        // =======================================================
        // DISCOUNT
        // =======================================================

        const rawDiscount = Number(product.discount ?? 0);

        if (
          !Number.isFinite(rawDiscount) ||
          rawDiscount < 0 ||
          rawDiscount > 100
        ) {
          errors.push({
            cartId: cartItem?._id || null,
            productId: product._id,
            message: `Invalid discount for "${productName}".`,
          });

          continue;
        }

        const discount = Number(
          Math.min(Math.max(rawDiscount, 0), 100).toFixed(2),
        );

        // =======================================================
        // STOCK
        // =======================================================

        const stock = Number(product.stock);

        if (!Number.isInteger(stock) || stock < 0) {
          errors.push({
            cartId: cartItem?._id || null,
            productId: product._id,
            message: `Invalid stock for "${productName}".`,
          });

          continue;
        }

        if (stock === 0) {
          errors.push({
            cartId: cartItem?._id || null,
            productId: product._id,
            message: `"${productName}" is currently out of stock.`,
          });

          continue;
        }

        if (quantity > stock) {
          errors.push({
            cartId: cartItem?._id || null,
            productId: product._id,
            message: `Only ${stock} item(s) available for "${productName}".`,
          });

          continue;
        }

        // =======================================================
        // FINAL PRICE
        // =======================================================

        const finalPrice = Number(
          Math.max(0, price - (price * discount) / 100).toFixed(2),
        );

        // =======================================================
        // SUBTOTAL
        // =======================================================

        const subtotal = Number((finalPrice * quantity).toFixed(2));

        // =======================================================
        // DISCOUNT AMOUNT
        // =======================================================

        const discountAmount = Number(
          ((price - finalPrice) * quantity).toFixed(2),
        );

        // =======================================================
        // VALIDATED ITEM
        // =======================================================

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

      // =========================================================
      // VALIDATION FAILED
      // =========================================================

      if (errors.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Cart validation failed.",
          errors,
        });
      }

      // =========================================================
      // SAFETY CHECK
      // =========================================================

      if (validatedItems.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No valid products found in your cart.",
        });
      }

      // =========================================================
      // CALCULATE ORDER SUMMARY
      // =========================================================

      const calculatedSummary = calculateOrderSummary(validatedItems);

      const summary = {
        totalItems: Number(calculatedSummary?.totalItems) || 0,

        totalQuantity: Number(calculatedSummary?.totalQuantity) || 0,

        subtotal: Number(calculatedSummary?.subtotal) || 0,

        discount: Number(calculatedSummary?.totalDiscount) || 0,

        shipping: Number(calculatedSummary?.shipping) || 0,

        tax: Number(calculatedSummary?.tax) || 0,

        grandTotal: Number(calculatedSummary?.grandTotal) || 0,
      };

      // =========================================================
      // SUCCESS
      // =========================================================

      return res.status(200).json({
        success: true,
        message: "Cart validated successfully.",
        data: {
          items: validatedItems,
          ...summary,
        },
      });
    } catch (error) {
      console.error("POST /carts/validate ERROR:", error?.message || error);

      return res.status(500).json({
        success: false,
        message: "Failed to validate cart.",
      });
    }
  });

  return router;
};

export default cartsRoutes;
