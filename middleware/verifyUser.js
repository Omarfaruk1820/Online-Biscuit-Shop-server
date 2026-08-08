// middleware/verifyUser.js

const verifyUser = (usersCollection) => {
  if (!usersCollection) {
    throw new Error("usersCollection is required in verifyUser middleware.");
  }

  return async (req, res, next) => {
    try {
      const email = req.user?.email;

      if (!email || typeof email !== "string") {
        return res.status(401).json({
          success: false,
          message: "Unauthorized access.",
        });
      }

      const normalizedEmail = email.trim().toLowerCase();

      const user = await usersCollection.findOne({
        email: normalizedEmail,
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

      req.dbUser = user;

      return next();
    } catch (error) {
      console.error("VERIFY USER ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to verify user.",
      });
    }
  };
};

export default verifyUser;
