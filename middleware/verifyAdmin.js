// middleware/verifyAdmin.js

const verifyAdmin = (req, res, next) => {
  try {
    // Ensure verifyToken + database user middleware has already run
    if (!req.dbUser) {
      return res.status(401).json({
        success: false,
        message: "User information not found.",
      });
    }

    // Check user role
    if (req.dbUser.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Access denied. Admin only route.",
      });
    }

    next();
  } catch (error) {
    console.error("verifyAdmin middleware error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error.",
    });
  }
};

export default verifyAdmin;
