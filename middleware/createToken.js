import jwt from "jsonwebtoken";

const createToken = ({ email }) => {
  if (typeof email !== "string" || !email.trim()) {
    throw new Error("Valid email is required to create token.");
  }

  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is missing.");
  }

  const normalizedEmail = email.trim().toLowerCase();

  return jwt.sign(
    {
      email: normalizedEmail,
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
