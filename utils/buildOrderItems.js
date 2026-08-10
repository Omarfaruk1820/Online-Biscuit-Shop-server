import { ObjectId } from "mongodb";

const MAX_CART_ITEMS = 100;

const buildOrderItems = async (cartItems, productsCollection) => {
  // ============================================================
  // VALIDATE CART
  // ============================================================

  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    throw new Error("Cart is empty.");
  }

  if (cartItems.length > MAX_CART_ITEMS) {
    throw new Error("Cart limit exceeded.");
  }

  // ============================================================
  // CONVERT PRODUCT IDS
  // ============================================================

  const productIds = cartItems.map((cart) => {
    if (!cart?.productId) {
      throw new Error("Product ID is missing.");
    }

    try {
      return cart.productId instanceof ObjectId
        ? cart.productId
        : new ObjectId(cart.productId);
    } catch {
      throw new Error("Invalid product ID.");
    }
  });

  // ============================================================
  // PREVENT DUPLICATE PRODUCTS
  // ============================================================

  const uniqueIds = new Set(
    productIds.map((productId) => productId.toString()),
  );

  if (uniqueIds.size !== productIds.length) {
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
  // BUILD ORDER ITEMS
  // ============================================================

  const items = [];

  for (let index = 0; index < cartItems.length; index++) {
    const cart = cartItems[index];
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

    const quantity = Number(cart.quantity);

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
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

    const discount = Math.max(0, Math.min(Number(product.discount) || 0, 100));

    // ==========================================================
    // STOCK
    // ==========================================================

    const stock = Number(product.stock);

    if (!Number.isFinite(stock) || stock < 0) {
      throw new Error(`Invalid stock for "${productName}".`);
    }

    if (stock <= 0) {
      throw new Error(`"${productName}" is currently out of stock.`);
    }

    if (quantity > stock) {
      throw new Error(`Only ${stock} item(s) available for "${productName}".`);
    }

    // ==========================================================
    // PRICE CALCULATION
    // ==========================================================

    const finalPrice = Number((price - (price * discount) / 100).toFixed(2));

    const subtotal = Number((finalPrice * quantity).toFixed(2));

    // ==========================================================
    // ORDER SNAPSHOT
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
    });
  }

  return items;
};

export default buildOrderItems;
