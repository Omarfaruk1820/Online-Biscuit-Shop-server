import jwt from "jsonwebtoken";

const verifyToken = (req, res, next) => {
  try {
    const token = req.cookies?.token;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. Authentication token is missing.",
      });
    }

    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
      console.error("VERIFY TOKEN: JWT_SECRET is missing.");

      return res.status(500).json({
        success: false,
        message: "Authentication configuration error.",
      });
    }

    const decoded = jwt.verify(token, jwtSecret, {
      algorithms: ["HS256"],
      issuer: "BiscuitShop",
      audience: "BiscuitShopClient",
    });

    const email =
      typeof decoded?.email === "string"
        ? decoded.email.trim().toLowerCase()
        : "";

    if (!email) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. Invalid authentication token.",
      });
    }

    if (decoded?.type !== "access") {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. Invalid token type.",
      });
    }

    req.user = {
      email,
    };

    return next();
  } catch (error) {
    console.error("VERIFY TOKEN ERROR:", {
      name: error?.name,
      message: error?.message,
    });

    if (error?.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Authentication token has expired.",
      });
    }

    if (error?.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        message: "Invalid authentication token.",
      });
    }

    return res.status(401).json({
      success: false,
      message: "Authentication failed.",
    });
  }
};

export default verifyToken;
