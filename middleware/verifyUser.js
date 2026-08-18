// ============================================================
// VERIFY DATABASE USER
// ============================================================

const verifyUser = (usersCollection) => {
  if (!usersCollection) {
    throw new Error("verifyUser middleware requires usersCollection.");
  }

  return async (req, res, next) => {
    try {
      const email =
        typeof req.user?.email === "string"
          ? req.user.email.trim().toLowerCase()
          : "";

      if (!email) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized access.",
        });
      }

      // --------------------------------------------------------
      // Find MongoDB user
      // --------------------------------------------------------

      const user = await usersCollection.findOne({
        email,
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User account was not found.",
        });
      }

      // --------------------------------------------------------
      // Normalize status
      // --------------------------------------------------------

      const status =
        typeof user.status === "string" && user.status.trim()
          ? user.status.trim().toLowerCase()
          : "active";

      // --------------------------------------------------------
      // Blocked account
      // --------------------------------------------------------

      if (status === "blocked") {
        return res.status(403).json({
          success: false,
          message: "Your account has been blocked.",
        });
      }

      // --------------------------------------------------------
      // Other inactive status
      // --------------------------------------------------------

      if (status !== "active") {
        return res.status(403).json({
          success: false,
          message: "Your account is not active.",
        });
      }

      // --------------------------------------------------------
      // Attach database user
      // --------------------------------------------------------

      req.dbUser = {
        ...user,
        status,
      };

      return next();
    } catch (error) {
      console.error(
        "VERIFY USER ERROR:",
        error?.stack || error?.message || error,
      );

      return res.status(500).json({
        success: false,
        message: "Failed to verify user.",
      });
    }
  };
};

export default verifyUser;
