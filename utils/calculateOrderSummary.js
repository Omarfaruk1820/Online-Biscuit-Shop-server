/**
 * --------------------------------------------------------
 * Calculate Order Summary
 * --------------------------------------------------------
 * Calculates subtotal, discount, shipping, tax and grand total.
 *
 * @param {Array} items
 * @returns {Object}
 * --------------------------------------------------------
 */

const FREE_SHIPPING_THRESHOLD = 1000;
const SHIPPING_CHARGE = 60;
const TAX_RATE = 0;

const round = (value) => Number((Number(value) || 0).toFixed(2));

const calculateOrderSummary = (items = []) => {
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

  let totalItems = 0;
  let totalQuantity = 0;
  let subtotal = 0;
  let totalDiscount = 0;

  for (const item of items) {
    const quantity = Math.max(1, Number(item?.quantity) || 1);

    const price = Math.max(0, Number(item?.price) || 0);

    const finalPrice = Math.max(0, Number(item?.finalPrice) || price);

    totalItems += 1;

    totalQuantity += quantity;

    subtotal += finalPrice * quantity;

    totalDiscount += (price - finalPrice) * quantity;
  }

  subtotal = round(subtotal);

  totalDiscount = round(totalDiscount);

  const shipping = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_CHARGE;

  const tax = round((subtotal * TAX_RATE) / 100);

  const grandTotal = round(subtotal + shipping + tax);

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
