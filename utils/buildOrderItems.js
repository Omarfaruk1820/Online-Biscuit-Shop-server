import { ObjectId } from "mongodb";
import calculateProductPricing from "./calculateProductPricing.js";

const MAX_CART_ITEMS = 100;
const MAX_ITEM_QUANTITY = 99;

const round = (value) => {
  const number = Number(value);

  return Number.isFinite(number) ? Number(number.toFixed(2)) : 0;
};

const normalizeString = (value, maxLength = 500) => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxLength);
};

const getProductName = (product) => {
  const name = normalizeString(product?.name, 200);

  return name || "Unknown Product";
};

const normalizeProductId = (value) => {
  if (value instanceof ObjectId) {
    return value;
  }

  const stringValue = String(value ?? "").trim();

  if (!ObjectId.isValid(stringValue)) {
    return null;
  }

  return new ObjectId(stringValue);
};

const validateQuantity = (quantity, productName) => {
  const parsedQuantity = Number(quantity);

  if (
    !Number.isInteger(parsedQuantity) ||
    parsedQuantity < 1 ||
    parsedQuantity > MAX_ITEM_QUANTITY
  ) {
    throw new Error(`Invalid quantity for "${productName}".`);
  }

  return parsedQuantity;
};

const validateStock = (stock, quantity, productName) => {
  const parsedStock = Number(stock);

  if (!Number.isInteger(parsedStock) || parsedStock < 0) {
    throw new Error(`Invalid stock for "${productName}".`);
  }

  if (parsedStock === 0) {
    throw new Error(`"${productName}" is currently out of stock.`);
  }

  if (quantity > parsedStock) {
    throw new Error(
      `Only ${parsedStock} item(s) available for "${productName}".`,
    );
  }

  return parsedStock;
};

const buildOrderItems = async (cartItems, productsCollection) => {
  // ============================================================
  // VALIDATE INPUT
  // ============================================================

  if (!productsCollection) {
    throw new Error("Products collection is required.");
  }

  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    throw new Error("Cart is empty.");
  }

  if (cartItems.length > MAX_CART_ITEMS) {
    throw new Error(`Cart cannot contain more than ${MAX_CART_ITEMS} items.`);
  }

  // ============================================================
  // CONVERT PRODUCT IDS
  // ============================================================

  const productIds = cartItems.map((cartItem) => {
    const productId = normalizeProductId(cartItem?.productId);

    if (!productId) {
      throw new Error("Invalid product ID.");
    }

    return productId;
  });

  // ============================================================
  // CHECK DUPLICATE PRODUCTS
  // ============================================================

  const uniqueProductIds = new Set(
    productIds.map((productId) => productId.toString()),
  );

  if (uniqueProductIds.size !== productIds.length) {
    throw new Error("Duplicate products found in cart.");
  }

  // ============================================================
  // LOAD LATEST PRODUCT DATA
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
  // PRODUCT MAP
  // ============================================================

  const productMap = new Map(
    products.map((product) => [product._id.toString(), product]),
  );

  // ============================================================
  // ENSURE ALL PRODUCTS EXIST
  // ============================================================

  if (productMap.size !== productIds.length) {
    throw new Error("One or more products no longer exist.");
  }

  // ============================================================
  // BUILD ORDER ITEMS
  // ============================================================

  const orderItems = [];

  for (let index = 0; index < cartItems.length; index += 1) {
    const cartItem = cartItems[index];

    const productId = productIds[index];

    const product = productMap.get(productId.toString());

    if (!product) {
      throw new Error("One or more products no longer exist.");
    }

    const productName = getProductName(product);

    // ----------------------------------------------------------
    // QUANTITY
    // ----------------------------------------------------------

    const quantity = validateQuantity(cartItem?.quantity, productName);

    // ----------------------------------------------------------
    // STOCK
    // ----------------------------------------------------------

    validateStock(product?.stock, quantity, productName);

    // ----------------------------------------------------------
    // PRICING
    // ----------------------------------------------------------

    const pricing = calculateProductPricing(product);

    // ----------------------------------------------------------
    // SUBTOTAL
    // ----------------------------------------------------------

    const subtotal = round(pricing.finalPrice * quantity);

    // ----------------------------------------------------------
    // DISCOUNT AMOUNT
    // ----------------------------------------------------------

    const discountAmount = round(
      (pricing.price - pricing.finalPrice) * quantity,
    );

    // ----------------------------------------------------------
    // FINAL VALIDATION
    // ----------------------------------------------------------

    if (!Number.isFinite(subtotal) || subtotal < 0) {
      throw new Error(`Invalid subtotal for "${productName}".`);
    }

    if (!Number.isFinite(discountAmount) || discountAmount < 0) {
      throw new Error(`Invalid discount amount for "${productName}".`);
    }

    // ----------------------------------------------------------
    // ORDER ITEM SNAPSHOT
    // ----------------------------------------------------------

    orderItems.push({
      productId: product._id,

      sku: normalizeString(product.sku, 100),

      name: productName,

      image: normalizeString(product.image, 1000),

      brand: normalizeString(product.brand, 100),

      category: normalizeString(product.category, 100).toLowerCase(),

      weight: product.weight ?? null,

      quantity,

      price: pricing.price,

      discount: pricing.discount,

      finalPrice: pricing.finalPrice,

      subtotal,

      discountAmount,
    });
  }

  // ============================================================
  // FINAL VALIDATION
  // ============================================================

  if (orderItems.length === 0) {
    throw new Error("No valid products found in cart.");
  }

  return orderItems;
};

export default buildOrderItems;
