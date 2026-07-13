import { ObjectId } from "mongodb";
import buildInvoice from "./buildInvoice.js";

const orderService = async (ordersCollection, id, email) => {
  console.log("ORDER SERVICE");

  console.log(id);

  console.log(email);
  if (!ObjectId.isValid(id)) {
    throw new Error("Invalid Order ID");
  }

  const order = await ordersCollection.findOne({
    _id: new ObjectId(id),
    // email,
  });

  if (!order) {
    return null;
  }

  const invoice = buildInvoice(order);

  return {
    order,
    invoice,
  };
};

export default orderService;
