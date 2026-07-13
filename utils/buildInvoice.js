

import SHOP_INFO from "./shopInfo.js";

import {
  generateInvoiceNumber,
  generateOrderNumber,
  getGrandTotal,
  getSubTotal,
  getTotalItems,
  getTotalQuantity,
} from "./helpers.js";

const buildInvoice = (order) => {
  const totalItems = getTotalItems(order.items);

  const totalQuantity = getTotalQuantity(order.items);

  const subtotal = getSubTotal(order.items);

  const shippingCharge = SHOP_INFO.shippingCharge;

  const tax = SHOP_INFO.tax;

  const discount = 0;

  const grandTotal = getGrandTotal(subtotal, shippingCharge, tax, discount);

  return {
    invoiceNumber: generateInvoiceNumber(order),

    orderNumber: generateOrderNumber(order),

    orderId: order._id.toString(),

    orderDate: order.createdAt,

    shop: SHOP_INFO,

    customer: {
      name: order.customer?.name || "Customer",

      email: order.email,

      phone: order.customer?.phone || "",

      address: order.customer?.address || "",

      city: order.customer?.city || "",

      zip: order.customer?.zip || "",
    },

    payment: {
      method: order.customer?.paymentMethod || "COD",

      status: order.paymentStatus || "Unpaid",
    },

    shipping: {
      status: order.status || "Pending",

      shippingCharge,
    },

    items: (order.items || []).map((item) => ({
      productId: item.productId,

      sku: item.sku || "",

      image: item.image || "",

      name: item.name,

      quantity: Number(item.quantity || 0),

      price: Number(item.price || 0),

      discount: Number(item.discount || 0),

      finalPrice:
        item.finalPrice ??
        Number(item.price || 0) -
          (Number(item.price || 0) * Number(item.discount || 0)) / 100,

      subtotal: Number(item.subtotal || 0),
    })),

    summary: {
      totalItems,

      totalQuantity,

      subtotal,

      shippingCharge,

      tax,

      discount,

      grandTotal,
    },
  };
};

export default buildInvoice;
