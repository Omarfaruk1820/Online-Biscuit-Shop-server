// utils/invoice/helpers.js

export const formatMoney = (amount = 0) => {
  return Number(amount).toFixed(2);
};

// ======================================================
// Invoice Number
// ======================================================

export const generateInvoiceNumber = (order) => {
  const date = new Date(order.createdAt);

  const year = date.getFullYear();

  const month = String(date.getMonth() + 1).padStart(2, "0");

  const day = String(date.getDate()).padStart(2, "0");

  return `INV-${year}${month}${day}-${order._id
    .toString()
    .slice(-6)
    .toUpperCase()}`;
};

// ======================================================
// Order Number
// ======================================================

export const generateOrderNumber = (order) => {
  const date = new Date(order.createdAt);

  const year = date.getFullYear();

  const month = String(date.getMonth() + 1).padStart(2, "0");

  const day = String(date.getDate()).padStart(2, "0");

  return `ORD-${year}${month}${day}-${order._id
    .toString()
    .slice(-6)
    .toUpperCase()}`;
};

// ======================================================
// Total Quantity
// ======================================================

export const getTotalQuantity = (items = []) => {
  return items.reduce((sum, item) => sum + (item.quantity || 0), 0);
};

// ======================================================
// Total Items
// ======================================================

export const getTotalItems = (items = []) => {
  return items.length;
};

// ======================================================
// Subtotal
// ======================================================

export const getSubTotal = (items = []) => {
  return Number(
    items
      .reduce((sum, item) => {
        return sum + Number(item.subtotal || 0);
      }, 0)
      .toFixed(2),
  );
};

// ======================================================
// Grand Total
// ======================================================

export const getGrandTotal = (
  subtotal,
  shipping = 0,
  tax = 0,
  discount = 0,
) => {
  return Number((subtotal + shipping + tax - discount).toFixed(2));
};
