const verifyUser = (usersCollection) => {
  return async (req, res, next) => {
    try {
      const email = req.user?.email?.trim().toLowerCase();

      if (!email) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized: User email unavailable.",
        });
      }

      const dbUser = await usersCollection.findOne({
        email,
      });

      if (!dbUser) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized: User not found.",
        });
      }

      req.dbUser = dbUser;

      next();
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
