import { ObjectId } from "mongodb";

const findOrder = async (ordersCollection, id, email) => {
  if (!ObjectId.isValid(id)) {
    throw new Error("Invalid order id");
  }

  const order = await ordersCollection.findOne({
    _id: new ObjectId(id),
    email,
  });

  if (!order) {
    throw new Error("Order not found");
  }

  return order;
};

export default findOrder;
