/**
 * ============================================================
 * Calculate Order Summary
 * ============================================================
 *
 * Calculates:
 * - totalItems
 * - totalQuantity
 * - subtotal
 * - totalDiscount
 * - shipping
 * - tax
 * - grandTotal
 */

const FREE_SHIPPING_THRESHOLD = 1000;
const SHIPPING_CHARGE = 60;
const TAX_RATE = 0;

const round = (value) => {
  return Number((Number(value) || 0).toFixed(2));
};

const calculateOrderSummary = (items = []) => {
  // ============================================================
  // EMPTY ORDER
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
  // TOTALS
  // ============================================================

  let totalItems = 0;
  let totalQuantity = 0;
  let subtotal = 0;
  let totalDiscount = 0;

  // ============================================================
  // CALCULATE ITEMS
  // ============================================================

  for (const item of items) {
    const quantity = Number(item?.quantity);

    if (!Number.isInteger(quantity) || quantity < 1) {
      continue;
    }

    const price = Math.max(0, Number(item?.price) || 0);

    const finalPrice = Math.max(0, Number(item?.finalPrice) || price);

    totalItems += 1;

    totalQuantity += quantity;

    subtotal += finalPrice * quantity;

    totalDiscount += Math.max(0, price - finalPrice) * quantity;
  }

  // ============================================================
  // ROUND VALUES
  // ============================================================

  subtotal = round(subtotal);

  totalDiscount = round(totalDiscount);

  // ============================================================
  // SHIPPING
  // ============================================================

  const shipping = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_CHARGE;

  // ============================================================
  // TAX
  // ============================================================

  const tax = round((subtotal * TAX_RATE) / 100);

  // ============================================================
  // GRAND TOTAL
  // ============================================================

  const grandTotal = round(subtotal + shipping + tax);

  // ============================================================
  // RETURN
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
