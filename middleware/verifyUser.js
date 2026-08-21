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

      console.log("VERIFY USER DEBUG:", {
        email,
        collectionType: typeof usersCollection,
        hasFindOne: typeof usersCollection?.findOne === "function",
      });

      if (!email) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized access.",
        });
      }

      const user = await usersCollection.findOne({
        email,
      });

      console.log("VERIFY USER DATABASE RESULT:", {
        found: Boolean(user),
        email: user?.email,
        uid: user?.uid,
        status: user?.status,
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User account was not found.",
        });
      }

      const status =
        typeof user.status === "string" && user.status.trim()
          ? user.status.trim().toLowerCase()
          : "active";

      if (status === "blocked") {
        return res.status(403).json({
          success: false,
          message: "Your account has been blocked.",
        });
      }

      if (status !== "active") {
        return res.status(403).json({
          success: false,
          message: "Your account is not active.",
        });
      }

      req.dbUser = {
        ...user,
        status,
      };

      console.log("VERIFY USER SUCCESS:", {
        email: req.dbUser.email,
        role: req.dbUser.role,
        status: req.dbUser.status,
      });

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
