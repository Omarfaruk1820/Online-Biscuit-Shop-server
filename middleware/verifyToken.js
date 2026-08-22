const verifyToken = (req, res, next) => {
  try {
    console.log("========== VERIFY TOKEN START ==========");

    console.log("METHOD:", req.method);
    console.log("URL:", req.originalUrl);

    console.log("HEADERS:", {
      origin: req.headers.origin,
      cookie: req.headers.cookie ? "COOKIE_PRESENT" : "COOKIE_MISSING",
      authorization: req.headers.authorization
        ? "AUTHORIZATION_PRESENT"
        : "AUTHORIZATION_MISSING",
    });

    console.log("COOKIES OBJECT:", req.cookies);

    const token = req.cookies?.token;

    console.log("TOKEN:", {
      exists: Boolean(token),
      length: token?.length || 0,
    });

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication token is missing.",
      });
    }

    const secret = String(process.env.JWT_SECRET || "").trim();

    console.log("JWT SECRET:", {
      exists: Boolean(secret),
      length: secret.length,
    });

    if (!secret) {
      return res.status(500).json({
        success: false,
        message: "Authentication configuration error.",
      });
    }

    const decoded = jwt.verify(token, secret, {
      algorithms: ["HS256"],
      issuer: "BiscuitShop",
      audience: "BiscuitShopClient",
    });

    console.log("JWT DECODED:", {
      email: decoded?.email,
      type: decoded?.type,
      issuer: decoded?.iss,
      audience: decoded?.aud,
    });

    if (decoded?.type !== "access") {
      return res.status(401).json({
        success: false,
        message: "Invalid access token.",
      });
    }

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

    req.user = {
      email,
    };

    console.log("VERIFY TOKEN SUCCESS:", {
      email: req.user.email,
    });

    console.log("========== VERIFY TOKEN END ==========");

    return next();
  } catch (error) {
    console.error("========== VERIFY TOKEN ERROR ==========");

    console.error({
      name: error?.name,
      message: error?.message,
      stack: error?.stack,
    });

    return res.status(401).json({
      success: false,
      message: "Authentication failed.",
    });
  }
};

export default verifyToken;
