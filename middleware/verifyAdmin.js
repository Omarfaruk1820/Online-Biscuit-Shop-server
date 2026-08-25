// ============================================================
// VERIFY ADMIN
// ============================================================

const verifyAdmin = (req, res, next) => {
  try {
    const user = req.dbUser;

    // --------------------------------------------------------
    // Database user unavailable
    // --------------------------------------------------------

    if (!user) {
      return res.status(401).json({
        success: false,
        code: "auth/user-unavailable",
        message: "Unauthorized: User information is unavailable.",
      });
    }

    // --------------------------------------------------------
    // Account status
    // --------------------------------------------------------

    if (user.status === "blocked") {
      return res.status(403).json({
        success: false,
        code: "user/blocked",
        message: "Forbidden: Your account has been blocked.",
      });
    }

    if (user.status && user.status !== "active") {
      return res.status(403).json({
        success: false,
        code: "user/inactive",
        message: "Forbidden: Your account is not active.",
      });
    }

    // --------------------------------------------------------
    // Role
    // --------------------------------------------------------

    if (user.role !== "admin") {
      return res.status(403).json({
        success: false,
        code: "auth/admin-required",
        message: "Forbidden: Admin access required.",
      });
    }

    next();
  } catch (error) {
    console.error(
      "VERIFY ADMIN ERROR:",
      error?.stack || error?.message || error,
    );

    return res.status(500).json({
      success: false,
      code: "auth/admin-verification-failed",
      message: "Failed to verify admin access.",
    });
  }
};

export default verifyAdmin;
