// middleware/verifyUser.js

const verifyUser = (usersCollection) => {
  if (!usersCollection) {
    throw new Error("usersCollection is required in verifyUser middleware.");
  }

  return async (req, res, next) => {
    try {
      // ======================================================
      // GET AUTHENTICATED EMAIL
      // ======================================================

      const email = req.user?.email;

      if (typeof email !== "string" || !email.trim()) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized access.",
        });
      }

      // ======================================================
      // NORMALIZE EMAIL
      // ======================================================

      const normalizedEmail = email.trim().toLowerCase();

      // ======================================================
      // FIND USER
      // ======================================================

      const user = await usersCollection.findOne({
        email: normalizedEmail,
      });

      // ======================================================
      // USER NOT FOUND
      // ======================================================

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found.",
        });
      }

      // ======================================================
      // ACCOUNT STATUS
      // ======================================================

      if (user.status === "blocked") {
        return res.status(403).json({
          success: false,
          message: "Your account has been blocked.",
        });
      }

      // ======================================================
      // NORMALIZE APPLICATION USER
      // ======================================================

      req.dbUser = user;

      // ======================================================
      // CONTINUE
      // ======================================================

      return next();
    } catch (error) {
      console.error("VERIFY USER ERROR:", error?.message || error);

      return res.status(500).json({
        success: false,
        message: "Failed to verify user.",
      });
    }
  };
};

export default verifyUser;
