/**
 * Calculate Order Summary
 *
 * Generates a complete order summary from validated order items.
 *
 * @param {Array} items
 * @returns {{
 *   subtotal: number,
 *   totalDiscount: number,
 *   shipping: number,
 *   tax: number,
 *   grandTotal: number
 * }}
 */

const FREE_SHIPPING_THRESHOLD = 1000;
const SHIPPING_CHARGE = 60;
const TAX = 0;

const calculateOrderTotal = (items = []) => {
  // ---------------------------------------
  // Empty Items
  // ---------------------------------------

  if (!Array.isArray(items) || items.length === 0) {
    return {
      subtotal: 0,
      totalDiscount: 0,
      shipping: 0,
      tax: TAX,
      grandTotal: 0,
    };
  }

  // ---------------------------------------
  // Calculate Totals
  // ---------------------------------------

  let subtotal = 0;
  let totalDiscount = 0;

  for (const item of items) {
    const quantity = Number(item?.quantity);
    const price = Number(item?.price);
    const finalPrice = Number(item?.finalPrice);
    const itemSubtotal = Number(item?.subtotal);

    // Skip invalid item
    if (
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      !Number.isFinite(price) ||
      price < 0 ||
      !Number.isFinite(finalPrice) ||
      finalPrice < 0 ||
      !Number.isFinite(itemSubtotal) ||
      itemSubtotal < 0
    ) {
      continue;
    }

    subtotal += itemSubtotal;

    totalDiscount += (price - finalPrice) * quantity;
  }

  subtotal = Number(subtotal.toFixed(2));

  totalDiscount = Number(totalDiscount.toFixed(2));

  // ---------------------------------------
  // Shipping
  // ---------------------------------------

  const shipping = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_CHARGE;

  // ---------------------------------------
  // Grand Total
  // ---------------------------------------

  const grandTotal = Number((subtotal + shipping + TAX).toFixed(2));

  // ---------------------------------------
  // Return Summary
  // ---------------------------------------

  return {
    subtotal,
    totalDiscount,
    shipping,
    tax: TAX,
    grandTotal,
  };
};

export default calculateOrderTotal;
