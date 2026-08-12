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

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET is missing.");

      return res.status(500).json({
        success: false,
        message: "Authentication configuration error.",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
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
    console.error("VERIFY TOKEN ERROR:", error?.message || error);

    if (error?.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Authentication token has expired.",
      });
    }

    return res.status(401).json({
      success: false,
      message: "Invalid authentication token.",
    });
  }
};

export default verifyToken;
