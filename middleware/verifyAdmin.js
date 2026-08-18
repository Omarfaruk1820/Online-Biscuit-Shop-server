// ============================================================
// VERIFY ADMIN
// ============================================================

const verifyAdmin = (req, res, next) => {
  try {
    if (!req.dbUser) {
      return res.status(401).json({
        success: false,
        message: "Authenticated user information is unavailable.",
      });
    }

    const role =
      typeof req.dbUser.role === "string"
        ? req.dbUser.role.trim().toLowerCase()
        : "user";

    if (role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Access denied. Admin only route.",
      });
    }

    return next();
  } catch (error) {
    console.error(
      "VERIFY ADMIN ERROR:",
      error?.stack || error?.message || error,
    );

    return res.status(500).json({
      success: false,
      message: "Failed to verify administrator access.",
    });
  }
};

export default verifyAdmin;
