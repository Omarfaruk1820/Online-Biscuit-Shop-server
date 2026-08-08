import jwt from "jsonwebtoken";

const verifyToken = (req, res, next) => {
  try {
    console.log("VERIFY TOKEN MIDDLEWARE");

    const token = req.cookies?.token;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. Token is missing.",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded?.email) {
      return res.status(401).json({
        success: false,
        message: "Invalid token.",
      });
    }

    req.user = {
      email: decoded.email,
    };

    next();
  } catch (error) {
    console.error("VERIFY TOKEN ERROR:", error);

    return res.status(403).json({
      success: false,
      message: "Invalid or expired token.",
    });
  }
};

export default verifyToken;
