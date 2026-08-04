import { ObjectId } from "mongodb";
import buildInvoice from "./buildInvoice.js";

const orderService = async (ordersCollection, id, email) => {
  // Validate Order ID
  if (!ObjectId.isValid(id)) {
    throw new Error("Invalid Order ID");
  }

  // Validate User Email
  if (!email) {
    throw new Error("Unauthorized");
  }

  // Find only the logged-in user's order
  const order = await ordersCollection.findOne({
    _id: new ObjectId(id),
    email,
  });

  // Order not found
  if (!order) {
    return null;
  }

  // Build invoice
  const invoice = buildInvoice(order);

  return {
    order,
    invoice,
  };
};

export default orderService;
