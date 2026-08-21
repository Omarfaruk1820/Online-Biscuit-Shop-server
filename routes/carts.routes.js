import { Router } from "express";
import { ObjectId } from "mongodb";

import calculateOrderSummary from "../utils/orderSummary.js";

const cartsRoutes = (cartsCollection, productsCollection, verifyToken) => {
  const router = Router();

  // ============================================================
  // CONSTANTS
  // ============================================================

  const MAX_QUANTITY = 99;
  const MAX_CART_ITEMS = 100;

  // ============================================================
  // HELPERS
  // ============================================================

  const normalizeEmail = (email = "") => {
    return typeof email === "string" ? email.trim().toLowerCase() : "";
  };

  const getUserEmail = (req) => {
    return normalizeEmail(req.user?.email);
  };

  const isValidObjectId = (id) => {
    return typeof id === "string" && ObjectId.isValid(id);
  };

  const toObjectId = (value) => {
    if (value instanceof ObjectId) {
      return value;
    }

    if (!ObjectId.isValid(String(value))) {
      return null;
    }

    return new ObjectId(String(value));
  };

  const round = (value) => {
    const number = Number(value);

    return Number.isFinite(number) ? Number(number.toFixed(2)) : 0;
  };

  const getProductName = (product) => {
    return typeof product?.name === "string" && product.name.trim()
      ? product.name.trim()
      : "Unknown Product";
  };

  const getProductImage = (product) => {
    return typeof product?.image === "string" ? product.image.trim() : "";
  };

  const getProductBrand = (product) => {
    return typeof product?.brand === "string" ? product.brand.trim() : "";
  };

  const getProductCategory = (product) => {
    return typeof product?.category === "string"
      ? product.category.trim().toLowerCase()
      : "";
  };

  const getProductSku = (product) => {
    return typeof product?.sku === "string" ? product.sku.trim() : "";
  };

  // ============================================================
  // PRODUCT PROJECTION
  // ============================================================

  const PRODUCT_PROJECTION = {
    sku: 1,
    name: 1,
    image: 1,
    brand: 1,
    category: 1,
    weight: 1,
    price: 1,
    discount: 1,
    stock: 1,
  };

  // ============================================================
  // GET PRODUCT
  // ============================================================

  const getProduct = async (productId) => {
    return productsCollection.findOne(
      {
        _id: productId,
      },
      {
        projection: PRODUCT_PROJECTION,
      },
    );
  };

  // ============================================================
  // CALCULATE PRODUCT PRICE
  // ============================================================

  const calculateProductPrice = (product) => {
    const productName = getProductName(product);

    const price = Number(product?.price);

    if (!Number.isFinite(price) || price < 0) {
      throw new Error(`Invalid price for "${productName}".`);
    }

    const discount = Number(product?.discount ?? 0);

    if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
      throw new Error(`Invalid discount for "${productName}".`);
    }

    const safePrice = round(price);
    const safeDiscount = round(discount);

    const finalPrice = round(safePrice - (safePrice * safeDiscount) / 100);

    return {
      price: safePrice,
      discount: safeDiscount,
      finalPrice,
    };
  };

  // ============================================================
  // VALIDATE STOCK
  // ============================================================

  const validateStock = (product, quantity) => {
    const productName = getProductName(product);

    const stock = Number(product?.stock);

    if (!Number.isInteger(stock) || stock < 0) {
      throw new Error(`Invalid stock for "${productName}".`);
    }

    if (stock === 0) {
      throw new Error(`"${productName}" is currently out of stock.`);
    }

    if (quantity > stock) {
      throw new Error(`Only ${stock} item(s) available for "${productName}".`);
    }

    return stock;
  };

  // ============================================================
  // BUILD CART ITEM
  // ============================================================

  const buildCartItem = ({ email, product, quantity, existingItem = null }) => {
    const { price, discount, finalPrice } = calculateProductPrice(product);

    const subtotal = round(finalPrice * quantity);

    const now = new Date();

    return {
      ...(existingItem
        ? {}
        : {
            email,
            productId: product._id,
            createdAt: now,
          }),

      sku: getProductSku(product),
      name: getProductName(product),
      image: getProductImage(product),
      brand: getProductBrand(product),
      category: getProductCategory(product),
      weight: product?.weight ?? "",

      price,
      discount,
      finalPrice,

      quantity,
      subtotal,

      updatedAt: now,
    };
  };

  // ============================================================
  // GET CART
  // GET /carts
  // ============================================================

  router.get("/", verifyToken, async (req, res) => {
    try {
      const email = getUserEmail(req);

      if (!email) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized.",
        });
      }

      const cartItems = await cartsCollection
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

      const summary = calculateOrderSummary(cartItems);

      return res.status(200).json({
        success: true,
        count: cartItems.length,
        data: cartItems,
        summary: {
          totalItems: Number(summary.totalItems) || 0,

          totalQuantity: Number(summary.totalQuantity) || 0,

          subtotal: round(summary.subtotal),

          totalDiscount: round(summary.totalDiscount),

          shipping: round(summary.shipping),

          tax: round(summary.tax),

          grandTotal: round(summary.grandTotal),
        },
      });
    } catch (error) {
      console.error("GET /carts ERROR:", error?.stack || error);

      return res.status(500).json({
        success: false,
        message: "Failed to load cart.",
      });
    }
  });

  // ============================================================
  // GET CART COUNT
  // GET /carts/count
  // ============================================================

  router.get("/count", verifyToken, async (req, res) => {
    try {
      const email = getUserEmail(req);

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
      console.error("GET /carts/count ERROR:", error?.stack || error);

      return res.status(500).json({
        success: false,
        message: "Failed to load cart count.",
      });
    }
  });

  // ============================================================
  // GET CART SUMMARY
  // GET /carts/summary
  // ============================================================

  router.get("/summary", verifyToken, async (req, res) => {
    try {
      const email = getUserEmail(req);

      if (!email) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized.",
        });
      }

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

      const summary = calculateOrderSummary(cartItems);

      return res.status(200).json({
        success: true,
        data: {
          totalItems: Number(summary.totalItems) || 0,

          totalQuantity: Number(summary.totalQuantity) || 0,

          subtotal: round(summary.subtotal),

          discount: round(summary.totalDiscount),

          shipping: round(summary.shipping),

          tax: round(summary.tax),

          grandTotal: round(summary.grandTotal),
        },
      });
    } catch (error) {
      console.error("GET /carts/summary ERROR:", error?.stack || error);

      return res.status(500).json({
        success: false,
        message: "Failed to load cart summary.",
      });
    }
  });

  // ============================================================
  // ADD TO CART
  // POST /carts
  // ============================================================

  router.post("/", verifyToken, async (req, res) => {
    try {
      const email = getUserEmail(req);

      if (!email) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized.",
        });
      }

      const productId = req.body?.productId;
      const quantity = Number(req.body?.quantity);

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

      if (
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > MAX_QUANTITY
      ) {
        return res.status(400).json({
          success: false,
          message: `Quantity must be between 1 and ${MAX_QUANTITY}.`,
        });
      }

      const productObjectId = new ObjectId(productId);

      const product = await getProduct(productObjectId);

      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Product not found.",
        });
      }

      const existingItem = await cartsCollection.findOne({
        email,
        productId: productObjectId,
      });

      let newQuantity = quantity;

      if (existingItem) {
        const existingQuantity = Number(existingItem.quantity);

        if (!Number.isInteger(existingQuantity) || existingQuantity < 1) {
          return res.status(409).json({
            success: false,
            message: "Invalid existing cart quantity.",
          });
        }

        newQuantity = existingQuantity + quantity;

        if (newQuantity > MAX_QUANTITY) {
          return res.status(400).json({
            success: false,
            message: `Maximum quantity per product is ${MAX_QUANTITY}.`,
          });
        }
      }

      validateStock(product, newQuantity);

      const cartItem = buildCartItem({
        email,
        product,
        quantity: newQuantity,
        existingItem,
      });

      // --------------------------------------------------------
      // UPDATE EXISTING ITEM
      // --------------------------------------------------------

      if (existingItem) {
        const result = await cartsCollection.updateOne(
          {
            _id: existingItem._id,
            email,
            productId: productObjectId,
          },
          {
            $set: cartItem,
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

        const updated = await cartsCollection.findOne({
          _id: existingItem._id,
          email,
        });

        return res.status(200).json({
          success: true,
          message: "Cart updated successfully.",
          data: updated,
        });
      }

      // --------------------------------------------------------
      // CHECK MAX CART ITEMS
      // --------------------------------------------------------

      const cartCount = await cartsCollection.countDocuments({
        email,
      });

      if (cartCount >= MAX_CART_ITEMS) {
        return res.status(400).json({
          success: false,
          message: `Cart cannot contain more than ${MAX_CART_ITEMS} products.`,
        });
      }

      // --------------------------------------------------------
      // INSERT
      // --------------------------------------------------------

      const result = await cartsCollection.insertOne(cartItem);

      if (!result.acknowledged || !result.insertedId) {
        return res.status(500).json({
          success: false,
          message: "Failed to add product to cart.",
        });
      }

      return res.status(201).json({
        success: true,
        message: "Product added to cart successfully.",
        data: {
          ...cartItem,
          _id: result.insertedId,
        },
      });
    } catch (error) {
      if (error?.code === 11000) {
        return res.status(409).json({
          success: false,
          message: "This product is already in your cart.",
        });
      }

      const message = error?.message || "";

      if (
        message.includes("currently out of stock") ||
        message.includes("Only ") ||
        message.includes("Invalid price") ||
        message.includes("Invalid discount") ||
        message.includes("Invalid stock")
      ) {
        return res.status(400).json({
          success: false,
          message,
        });
      }

      console.error("POST /carts ERROR:", error?.stack || error);

      return res.status(500).json({
        success: false,
        message: "Failed to add product to cart.",
      });
    }
  });

  // ============================================================
  // UPDATE CART QUANTITY
  // PATCH /carts/:id
  // ============================================================

  router.patch("/:id", verifyToken, async (req, res) => {
    try {
      const email = getUserEmail(req);

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

      if (
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > MAX_QUANTITY
      ) {
        return res.status(400).json({
          success: false,
          message: `Quantity must be between 1 and ${MAX_QUANTITY}.`,
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

      const productId = toObjectId(cartItem.productId);

      if (!productId) {
        return res.status(400).json({
          success: false,
          message: "Cart item has an invalid product reference.",
        });
      }

      const product = await getProduct(productId);

      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Product no longer exists.",
        });
      }

      validateStock(product, quantity);

      const updatedItem = buildCartItem({
        email,
        product,
        quantity,
        existingItem: cartItem,
      });

      const result = await cartsCollection.updateOne(
        {
          _id: cartId,
          email,
        },
        {
          $set: updatedItem,
        },
      );

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

      const updated = await cartsCollection.findOne({
        _id: cartId,
        email,
      });

      return res.status(200).json({
        success: true,
        message: "Cart updated successfully.",
        data: updated,
      });
    } catch (error) {
      const message = error?.message || "";

      if (
        message.includes("currently out of stock") ||
        message.includes("Only ") ||
        message.includes("Invalid price") ||
        message.includes("Invalid discount") ||
        message.includes("Invalid stock")
      ) {
        return res.status(400).json({
          success: false,
          message,
        });
      }

      console.error("PATCH /carts/:id ERROR:", error?.stack || error);

      return res.status(500).json({
        success: false,
        message: "Failed to update cart.",
      });
    }
  });

  // ============================================================
  // VALIDATE CART
  // POST /carts/validate
  // ============================================================

  router.post("/validate", verifyToken, async (req, res) => {
    try {
      const email = getUserEmail(req);

      if (!email) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized.",
        });
      }

      const cartItems = await cartsCollection
        .find(
          { email },
          {
            projection: {
              _id: 1,
              productId: 1,
              quantity: 1,
              createdAt: 1,
              name: 1,
            },
          },
        )
        .sort({
          createdAt: 1,
        })
        .toArray();

      if (cartItems.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Your cart is empty.",
        });
      }

      if (cartItems.length > MAX_CART_ITEMS) {
        return res.status(400).json({
          success: false,
          message: `Cart cannot contain more than ${MAX_CART_ITEMS} products.`,
        });
      }

      const productIds = [];
      const productIdSet = new Set();
      const errors = [];

      // --------------------------------------------------------
      // VALIDATE CART REFERENCES
      // --------------------------------------------------------

      for (const item of cartItems) {
        const productId = toObjectId(item?.productId);

        if (!productId) {
          errors.push({
            cartId: item?._id || null,
            productId: item?.productId || null,
            message: "Invalid product ID.",
          });

          continue;
        }

        const key = productId.toString();

        if (productIdSet.has(key)) {
          errors.push({
            cartId: item?._id || null,
            productId,
            message: "Duplicate product found in cart.",
          });

          continue;
        }

        productIdSet.add(key);
        productIds.push(productId);
      }

      if (errors.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Cart validation failed.",
          errors,
        });
      }

      // --------------------------------------------------------
      // LOAD CURRENT PRODUCTS
      // --------------------------------------------------------

      const products = await productsCollection
        .find(
          {
            _id: {
              $in: productIds,
            },
          },
          {
            projection: PRODUCT_PROJECTION,
          },
        )
        .toArray();

      const productMap = new Map(
        products.map((product) => [product._id.toString(), product]),
      );

      const validatedItems = [];

      // --------------------------------------------------------
      // VALIDATE EACH ITEM
      // --------------------------------------------------------

      for (const cartItem of cartItems) {
        const productId = toObjectId(cartItem.productId);

        const product = productMap.get(productId.toString());

        if (!product) {
          errors.push({
            cartId: cartItem._id,
            productId,
            message: `"${cartItem?.name || "Product"}" no longer exists.`,
          });

          continue;
        }

        const productName = getProductName(product);

        const quantity = Number(cartItem.quantity);

        if (
          !Number.isInteger(quantity) ||
          quantity < 1 ||
          quantity > MAX_QUANTITY
        ) {
          errors.push({
            cartId: cartItem._id,
            productId: product._id,
            message: `Invalid quantity for "${productName}".`,
          });

          continue;
        }

        try {
          validateStock(product, quantity);
        } catch (error) {
          errors.push({
            cartId: cartItem._id,
            productId: product._id,
            message: error?.message || "Stock validation failed.",
          });

          continue;
        }

        let pricing;

        try {
          pricing = calculateProductPrice(product);
        } catch (error) {
          errors.push({
            cartId: cartItem._id,
            productId: product._id,
            message: error?.message || "Product pricing is invalid.",
          });

          continue;
        }

        const subtotal = round(pricing.finalPrice * quantity);

        const discountAmount = round(
          (pricing.price - pricing.finalPrice) * quantity,
        );

        validatedItems.push({
          cartId: cartItem._id,

          productId: product._id,

          sku: getProductSku(product),

          name: productName,

          image: getProductImage(product),

          brand: getProductBrand(product),

          category: getProductCategory(product),

          weight: product.weight ?? null,

          quantity,

          price: pricing.price,

          discount: pricing.discount,

          finalPrice: pricing.finalPrice,

          subtotal,

          discountAmount,
        });
      }

      if (errors.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Cart validation failed.",
          errors,
        });
      }

      if (validatedItems.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No valid products found in your cart.",
        });
      }

      const calculatedSummary = calculateOrderSummary(validatedItems);

      return res.status(200).json({
        success: true,
        message: "Cart validated successfully.",
        data: {
          items: validatedItems,

          totalItems: Number(calculatedSummary.totalItems) || 0,

          totalQuantity: Number(calculatedSummary.totalQuantity) || 0,

          subtotal: round(calculatedSummary.subtotal),

          discount: round(calculatedSummary.totalDiscount),

          totalDiscount: round(calculatedSummary.totalDiscount),

          shipping: round(calculatedSummary.shipping),

          tax: round(calculatedSummary.tax),

          grandTotal: round(calculatedSummary.grandTotal),
        },
      });
    } catch (error) {
      console.error("POST /carts/validate ERROR:", error?.stack || error);

      return res.status(500).json({
        success: false,
        message: "Failed to validate cart.",
      });
    }
  });

  return router;
};

export default cartsRoutes;
