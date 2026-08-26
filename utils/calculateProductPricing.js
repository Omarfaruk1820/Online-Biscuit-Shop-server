const round = (value) => {
  const number = Number(value);

  return Number.isFinite(number) ? Number(number.toFixed(2)) : 0;
};

const calculateProductPricing = (product = {}) => {
  // ============================================================
  // PRICE
  // ============================================================

  const price = Number(product?.price);

  if (!Number.isFinite(price) || price < 0) {
    throw new Error("Invalid product price.");
  }

  // ============================================================
  // DISCOUNT
  // ============================================================

  const rawDiscount = Number(product?.discount ?? 0);

  if (!Number.isFinite(rawDiscount) || rawDiscount < 0 || rawDiscount > 100) {
    throw new Error("Invalid product discount.");
  }

  const discount = round(rawDiscount);

  // ============================================================
  // DISCOUNT AMOUNT PER UNIT
  // ============================================================

  const discountAmount = round((price * discount) / 100);

  // ============================================================
  // FINAL PRICE PER UNIT
  // ============================================================

  const finalPrice = round(price - discountAmount);

  // ============================================================
  // FINAL SAFETY
  // ============================================================

  if (!Number.isFinite(finalPrice) || finalPrice < 0) {
    throw new Error("Invalid final product price.");
  }

  return {
    price: round(price),

    discount,

    discountAmount,

    finalPrice,
  };
};

export default calculateProductPricing;
