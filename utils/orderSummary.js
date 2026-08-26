const FREE_SHIPPING_THRESHOLD = 1000;
const SHIPPING_CHARGE = 60;
const TAX_RATE = 0;

const round = (value) => {
  const number = Number(value);

  return Number.isFinite(number) ? Number(number.toFixed(2)) : 0;
};

const calculateOrderSummary = (items = []) => {
  // ============================================================
  // EMPTY ITEMS
  // ============================================================

  if (!Array.isArray(items) || items.length === 0) {
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

  // ============================================================
  // INITIAL VALUES
  // ============================================================

  let totalItems = 0;
  let totalQuantity = 0;
  let subtotal = 0;
  let totalDiscount = 0;

  // ============================================================
  // CALCULATE ITEM TOTALS
  // ============================================================

  for (const item of items) {
    const quantity = Number(item?.quantity);

    if (!Number.isInteger(quantity) || quantity < 1) {
      continue;
    }

    const price = Number(item?.price);

    const finalPrice = Number(item?.finalPrice ?? price);

    if (
      !Number.isFinite(price) ||
      price < 0 ||
      !Number.isFinite(finalPrice) ||
      finalPrice < 0
    ) {
      continue;
    }

    totalItems += 1;

    totalQuantity += quantity;

    subtotal += finalPrice * quantity;

    totalDiscount += Math.max(0, price - finalPrice) * quantity;
  }

  // ============================================================
  // ROUND MONEY VALUES
  // ============================================================

  subtotal = round(subtotal);

  totalDiscount = round(totalDiscount);

  // ============================================================
  // SHIPPING
  // ============================================================

  let shipping = 0;

  if (subtotal > 0 && subtotal < FREE_SHIPPING_THRESHOLD) {
    shipping = SHIPPING_CHARGE;
  }

  shipping = round(shipping);

  // ============================================================
  // TAX
  // ============================================================

  const tax = round((subtotal * TAX_RATE) / 100);

  // ============================================================
  // GRAND TOTAL
  // ============================================================

  const grandTotal = round(subtotal + shipping + tax);

  // ============================================================
  // RETURN SUMMARY
  // ============================================================

  return {
    totalItems,

    totalQuantity,

    subtotal,

    totalDiscount,

    shipping,

    tax,

    grandTotal,
  };
};

export default calculateOrderSummary;
