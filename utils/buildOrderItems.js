import { ObjectId } from "mongodb";

const MAX_CART_ITEMS = 100;
const MAX_ITEM_QUANTITY = 99;

const round = (value) => {
  return Number(Number(value).toFixed(2));
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
  // CONVERT AND VALIDATE PRODUCT IDS
  // ============================================================

  const productIds = cartItems.map((cartItem) => {
    if (!cartItem?.productId) {
      throw new Error("Product ID is missing.");
    }

    if (cartItem.productId instanceof ObjectId) {
      return cartItem.productId;
    }

    const productId = String(cartItem.productId).trim();

    if (!ObjectId.isValid(productId)) {
      throw new Error("Invalid product ID.");
    }

    return new ObjectId(productId);
  });

  // ============================================================
  // PREVENT DUPLICATE PRODUCTS
  // ============================================================

  const uniqueProductIds = new Set(
    productIds.map((productId) => productId.toString()),
  );

  if (uniqueProductIds.size !== productIds.length) {
    throw new Error("Duplicate products found in cart.");
  }

  // ============================================================
  // LOAD LATEST PRODUCTS
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
  // ENSURE ALL PRODUCTS STILL EXIST
  // ============================================================

  if (productMap.size !== productIds.length) {
    throw new Error("One or more products no longer exist.");
  }

  // ============================================================
  // BUILD ORDER ITEMS
  // ============================================================

  const items = [];

  for (let index = 0; index < cartItems.length; index += 1) {
    const cartItem = cartItems[index];
    const productId = productIds[index];

    const product = productMap.get(productId.toString());

    if (!product) {
      throw new Error("One or more products no longer exist.");
    }

    // ==========================================================
    // PRODUCT NAME
    // ==========================================================

    const productName =
      typeof product.name === "string" && product.name.trim()
        ? product.name.trim()
        : "Unknown Product";

    // ==========================================================
    // QUANTITY
    // ==========================================================

    const quantity = Number(cartItem.quantity);

    if (
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > MAX_ITEM_QUANTITY
    ) {
      throw new Error(`Invalid quantity for "${productName}".`);
    }

    // ==========================================================
    // PRICE
    // ==========================================================

    const price = Number(product.price);

    if (!Number.isFinite(price) || price < 0) {
      throw new Error(`Invalid price for "${productName}".`);
    }

    // ==========================================================
    // DISCOUNT
    // ==========================================================

    const rawDiscount = Number(product.discount ?? 0);

    if (!Number.isFinite(rawDiscount) || rawDiscount < 0 || rawDiscount > 100) {
      throw new Error(`Invalid discount for "${productName}".`);
    }

    const discount = round(rawDiscount);

    // ==========================================================
    // STOCK
    // ==========================================================

    const stock = Number(product.stock);

    if (!Number.isInteger(stock) || stock < 0) {
      throw new Error(`Invalid stock for "${productName}".`);
    }

    if (stock === 0) {
      throw new Error(`"${productName}" is currently out of stock.`);
    }

    if (quantity > stock) {
      throw new Error(`Only ${stock} item(s) available for "${productName}".`);
    }

    // ==========================================================
    // FINAL PRICE
    // ==========================================================

    const finalPrice = round(price - (price * discount) / 100);

    if (!Number.isFinite(finalPrice) || finalPrice < 0) {
      throw new Error(`Invalid final price for "${productName}".`);
    }

    // ==========================================================
    // SUBTOTAL
    // ==========================================================

    const subtotal = round(finalPrice * quantity);

    if (!Number.isFinite(subtotal) || subtotal < 0) {
      throw new Error(`Invalid subtotal for "${productName}".`);
    }

    // ==========================================================
    // DISCOUNT AMOUNT
    // ==========================================================

    const discountAmount = round((price - finalPrice) * quantity);

    // ==========================================================
    // ORDER ITEM SNAPSHOT
    // ==========================================================

    items.push({
      productId,

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
  // FINAL SAFETY CHECK
  // ============================================================

  if (items.length === 0) {
    throw new Error("No valid products found in cart.");
  }

  return items;
};

export default buildOrderItems;
