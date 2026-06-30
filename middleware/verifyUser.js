// middleware/verifyUser.js

const verifyUser = (usersCollection) => {
  if (!usersCollection) {
    throw new Error("usersCollection is required in verifyUser middleware.");
  }

  return async (req, res, next) => {
    try {
      // verifyToken middleware must run first
      if (!req.user?.email) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized access.",
        });
      }

      const user = await usersCollection.findOne({
        email: req.user.email,
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found.",
        });
      }

      if (user.status === "blocked") {
        return res.status(403).json({
          success: false,
          message: "Your account has been blocked.",
        });
      }

      // Store database user for next middleware
      req.dbUser = user;

      next();
    } catch (error) {
      console.error("verifyUser middleware error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to verify user.",
      });
    }
  };
};

export default verifyUser;
