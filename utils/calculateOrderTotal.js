/**
 * Calculate Order Total
 *
 * Calculates the total amount of an order using
 * each item's quantity and final price.
 *
 * @param {Array} items
 * @returns {number}
 */

const calculateOrderTotal = (items = []) => {
  if (!Array.isArray(items) || items.length === 0) {
    return 0;
  }

  const total = items.reduce((sum, item) => {
    const quantity = Number(item?.quantity);
    const finalPrice = Number(item?.finalPrice);

    if (
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      !Number.isFinite(finalPrice) ||
      finalPrice < 0
    ) {
      return sum;
    }

    return sum + quantity * finalPrice;
  }, 0);

  return Number(total.toFixed(2));
};

export default calculateOrderTotal;
