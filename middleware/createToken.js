import jwt from "jsonwebtoken";

// if (!process.env.JWT_SECRET) {
//   throw new Error("JWT_SECRET is missing.");
// }

const createToken = ({ email }) => {
  return jwt.sign(
    {
      email: email.trim().toLowerCase(),
      type: "access",
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "7d",
      algorithm: "HS256",
      issuer: "BiscuitShop",
      audience: "BiscuitShopClient",
    },
  );
};

export default createToken;
