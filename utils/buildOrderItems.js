import { ObjectId } from "mongodb";

const MAX_CART_ITEMS = 100;

const buildOrderItems = async (cartItems, productsCollection) => {
  // --------------------------------------------------
  // Validate Cart
  // --------------------------------------------------

  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    throw new Error("Cart is empty.");
  }

  if (cartItems.length > MAX_CART_ITEMS) {
    throw new Error("Cart limit exceeded.");
  }

  // --------------------------------------------------
  // Convert & Validate Product IDs
  // --------------------------------------------------

  const productIds = cartItems.map((cart) => {
    if (!cart.productId) {
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

  // --------------------------------------------------
  // Prevent Duplicate Products
  // --------------------------------------------------

  const uniqueIds = new Set(productIds.map((id) => id.toString()));

  if (uniqueIds.size !== productIds.length) {
    throw new Error("Duplicate products found in cart.");
  }

  // --------------------------------------------------
  // Load Products (Single Query)
  // --------------------------------------------------

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

  const productMap = new Map(
    products.map((product) => [product._id.toString(), product]),
  );

  // --------------------------------------------------
  // Build Order Items
  // --------------------------------------------------

  const items = [];

  for (let i = 0; i < cartItems.length; i++) {
    const cart = cartItems[i];
    const productId = productIds[i];

    const product = productMap.get(productId.toString());

    if (!product) {
      throw new Error("One or more products no longer exist.");
    }

    // Quantity

    const quantity = Number(cart.quantity);

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      throw new Error(`Invalid quantity for "${product.name}".`);
    }

    // Price

    const price = Number(product.price);

    if (!Number.isFinite(price) || price < 0) {
      throw new Error(`Invalid price for "${product.name}".`);
    }

    // Discount

    const discount = Math.max(0, Math.min(Number(product.discount) || 0, 100));

    // Stock

    const stock = Number(product.stock);

    if (!Number.isFinite(stock) || stock < 0) {
      throw new Error(`Invalid stock for "${product.name}".`);
    }

    if (stock === 0) {
      throw new Error(`"${product.name}" is currently out of stock.`);
    }

    if (quantity > stock) {
      throw new Error(`Only ${stock} item(s) available for "${product.name}".`);
    }

    // Price Calculation

    const finalPrice = Number((price - (price * discount) / 100).toFixed(2));

    const subtotal = Number((finalPrice * quantity).toFixed(2));

    // Snapshot

    items.push({
      productId,

      sku: product.sku ?? "",

      name: String(product.name).trim(),

      image: typeof product.image === "string" ? product.image.trim() : "",

      brand: product.brand ?? "",

      category: product.category ?? "",

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
