const verifyAdmin = (req, res, next) => {
  try {
    if (!req.dbUser) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: User information unavailable.",
      });
    }

    if (req.dbUser.status === "blocked") {
      return res.status(403).json({
        success: false,
        message: "Forbidden: Your account is blocked.",
      });
    }

    if (req.dbUser.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Forbidden: Admin access required.",
      });
    }

    next();
  } catch (error) {
    console.error("VERIFY ADMIN ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to verify admin access.",
    });
  }
};

export default verifyAdmin;
