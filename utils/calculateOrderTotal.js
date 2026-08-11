const calculateOrderTotal = (items = []) => {
  if (!Array.isArray(items) || items.length === 0) {
    return 0;
  }

  const total = items.reduce((sum, item) => {
    const subtotal = Number(item?.subtotal);

    if (!Number.isFinite(subtotal) || subtotal < 0) {
      return sum;
    }

    return sum + subtotal;
  }, 0);

  return Number(total.toFixed(2));
};

export default calculateOrderTotal;
