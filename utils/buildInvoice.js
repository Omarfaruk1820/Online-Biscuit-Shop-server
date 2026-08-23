import SHOP_INFO from "./shopInfo.js";

import { generateInvoiceNumber, generateOrderNumber } from "./helpers.js";

// ============================================================
// HELPERS
// ============================================================

const toNumber = (value, fallback = 0) => {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
};

const toStringValue = (value, fallback = "") => {
  if (value === null || value === undefined) {
    return fallback;
  }

  const stringValue = String(value).trim();

  return stringValue || fallback;
};

const normalizePaymentMethod = (value) => {
  return toStringValue(value, "cash_on_delivery");
};

const normalizeStatus = (value, fallback = "pending") => {
  return toStringValue(value, fallback).toLowerCase();
};

// ============================================================
// BUILD INVOICE
// ============================================================

const buildInvoice = (order) => {
  if (!order) {
    throw new Error("Order data is required.");
  }

  // ==========================================================
  // ORDER ITEMS
  // ==========================================================

  const orderItems = Array.isArray(order.items) ? order.items : [];

  // ==========================================================
  // ORDER TOTALS
  // ==========================================================

  const totalItems = toNumber(order.totalItems, orderItems.length);

  const totalQuantity = toNumber(
    order.totalQuantity,
    orderItems.reduce((total, item) => total + toNumber(item?.quantity), 0),
  );

  const subtotal = toNumber(
    order.subtotal,
    orderItems.reduce((total, item) => total + toNumber(item?.subtotal), 0),
  );

  const totalDiscount = toNumber(order.totalDiscount, 0);

  const shippingCharge = toNumber(order.shipping, SHOP_INFO.shippingCharge);

  const tax = toNumber(order.tax, SHOP_INFO.tax);

  const grandTotal = toNumber(
    order.grandTotal,
    subtotal - totalDiscount + shippingCharge + tax,
  );

  // ==========================================================
  // CUSTOMER
  // ==========================================================

  const customer = {
    name: toStringValue(order.customer?.name, "Customer"),

    email: toStringValue(order.customer?.email, order.email),

    phone: toStringValue(order.customer?.phone, ""),

    address: toStringValue(order.customer?.address, ""),

    city: toStringValue(order.customer?.city, ""),

    zip: toStringValue(order.customer?.zip, ""),
  };

  // ==========================================================
  // PAYMENT
  // ==========================================================

  const payment = {
    method: normalizePaymentMethod(order.paymentMethod),

    status: normalizeStatus(order.paymentStatus, "pending"),
  };

  // ==========================================================
  // SHIPPING
  // ==========================================================

  const shipping = {
    status: normalizeStatus(order.status, "pending"),

    shippingCharge,
  };

  // ==========================================================
  // ITEMS
  // ==========================================================

  const items = orderItems.map((item) => {
    const price = toNumber(item?.price);
    const quantity = toNumber(item?.quantity);
    const discount = toNumber(item?.discount);

    const calculatedFinalPrice = price - (price * discount) / 100;

    const finalPrice = toNumber(item?.finalPrice, calculatedFinalPrice);

    const calculatedSubtotal = finalPrice * quantity;

    const itemSubtotal = toNumber(item?.subtotal, calculatedSubtotal);

    return {
      productId: toStringValue(item?.productId, ""),

      sku: toStringValue(item?.sku, ""),

      image: toStringValue(item?.image, ""),

      name: toStringValue(item?.name, "Unknown Product"),

      quantity,

      price,

      unitPrice: price,

      discount,

      finalPrice,

      subtotal: itemSubtotal,
    };
  });

  // ==========================================================
  // SUMMARY
  // ==========================================================

  const summary = {
    totalItems,

    totalQuantity,

    subtotal,

    shippingCharge,

    tax,

    discount: totalDiscount,

    grandTotal,
  };

  // ==========================================================
  // RETURN INVOICE
  // ==========================================================

  return {
    invoiceNumber: generateInvoiceNumber(order),

    orderNumber: toStringValue(order.orderNumber, generateOrderNumber(order)),

    orderId: order._id?.toString() || "",

    orderDate: order.createdAt || new Date(),

    shop: {
      ...SHOP_INFO,
    },

    customer,

    payment,

    shipping,

    items,

    summary,
  };
};

export default buildInvoice;
