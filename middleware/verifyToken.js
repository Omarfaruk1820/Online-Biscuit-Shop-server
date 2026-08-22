import jwt from "jsonwebtoken";

// ============================================================
// VERIFY APPLICATION JWT
// ============================================================

const verifyToken = (req, res, next) => {
  try {
    const token = req.cookies?.token;

    console.log("VERIFY TOKEN DEBUG:", {
      hasToken: Boolean(token),
      tokenLength: token?.length || 0,
    });

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication token is missing.",
      });
    }

    const secret = String(process.env.JWT_SECRET || "").trim();

    console.log("JWT SECRET DEBUG:", {
      exists: Boolean(secret),
      length: secret.length,
    });

    if (!secret) {
      console.error("VERIFY TOKEN: JWT_SECRET is missing.");

      return res.status(500).json({
        success: false,
        message: "Authentication configuration error.",
      });
    }

    // ========================================================
    // VERIFY JWT
    // ========================================================

    const decoded = jwt.verify(token, secret, {
      algorithms: ["HS256"],
      issuer: "BiscuitShop",
      audience: "BiscuitShopClient",
    });

    console.log("JWT DECODED DEBUG:", {
      email: decoded?.email,
      type: decoded?.type,
      issuer: decoded?.iss,
      audience: decoded?.aud,
    });

    // ========================================================
    // CHECK TOKEN TYPE
    // ========================================================

    if (decoded?.type !== "access") {
      return res.status(401).json({
        success: false,
        message: "Invalid access token.",
      });
    }

    // ========================================================
    // GET EMAIL
    // ========================================================

    const email =
      typeof decoded?.email === "string"
        ? decoded.email.trim().toLowerCase()
        : "";

    if (!email) {
      return res.status(401).json({
        success: false,
        message: "Invalid authentication token.",
      });
    }

    // ========================================================
    // ATTACH AUTH USER
    // ========================================================

    req.user = {
      email,
    };

    console.log("VERIFY TOKEN SUCCESS:", {
      email: req.user.email,
    });

    return next();
  } catch (error) {
    console.error("VERIFY TOKEN ERROR:", {
      name: error?.name,
      message: error?.message,
      stack: error?.stack,
    });

    // ========================================================
    // TOKEN EXPIRED
    // ========================================================

    if (error?.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Authentication token has expired.",
      });
    }

    // ========================================================
    // INVALID JWT
    // ========================================================

    if (error?.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        message: "Invalid authentication token.",
      });
    }

    // ========================================================
    // OTHER AUTH ERROR
    // ========================================================

    return res.status(401).json({
      success: false,
      message: "Authentication failed.",
    });
  }
};

export default verifyToken;
