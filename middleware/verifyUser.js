// ============================================================
// VERIFY DATABASE USER
// ============================================================

const verifyUser = (usersCollection) => {
  if (!usersCollection) {
    throw new Error("verifyUser requires usersCollection.");
  }

  return async (req, res, next) => {
    try {
      const uid = String(req.user?.uid || "").trim();

      const email = String(req.user?.email || "")
        .trim()
        .toLowerCase();

      // ------------------------------------------------------
      // Firebase identity missing
      // ------------------------------------------------------

      if (!uid && !email) {
        return res.status(401).json({
          success: false,
          code: "auth/user-identity-missing",
          message: "Unauthorized: User identity is unavailable.",
        });
      }

      // ------------------------------------------------------
      // Find MongoDB user
      // ------------------------------------------------------

      let dbUser = null;

      if (uid) {
        dbUser = await usersCollection.findOne({
          uid,
        });
      }

      if (!dbUser && email) {
        dbUser = await usersCollection.findOne({
          email,
        });
      }

      // ------------------------------------------------------
      // User does not exist
      // ------------------------------------------------------

      if (!dbUser) {
        return res.status(404).json({
          success: false,
          code: "user/not-found",
          message: "User account was not found.",
        });
      }

      // ------------------------------------------------------
      // UID consistency
      // ------------------------------------------------------

      if (dbUser.uid && String(dbUser.uid).trim() !== uid) {
        return res.status(403).json({
          success: false,
          code: "auth/uid-mismatch",
          message: "Firebase identity does not match the user account.",
        });
      }

      // ------------------------------------------------------
      // Email consistency
      // ------------------------------------------------------

      if (dbUser.email && String(dbUser.email).trim().toLowerCase() !== email) {
        return res.status(403).json({
          success: false,
          code: "auth/email-mismatch",
          message: "Firebase email does not match the user account.",
        });
      }

      // ------------------------------------------------------
      // Account status
      // ------------------------------------------------------

      if (dbUser.status === "blocked") {
        return res.status(403).json({
          success: false,
          code: "user/blocked",
          message: "Your account has been blocked.",
        });
      }

      if (dbUser.status && dbUser.status !== "active") {
        return res.status(403).json({
          success: false,
          code: "user/inactive",
          message: "Your account is not active.",
        });
      }

      // ------------------------------------------------------
      // Attach database user
      // ------------------------------------------------------

      req.dbUser = dbUser;

      next();
    } catch (error) {
      console.error(
        "VERIFY USER ERROR:",
        error?.stack || error?.message || error,
      );

      return res.status(500).json({
        success: false,
        code: "user/verification-failed",
        message: "Failed to verify user account.",
      });
    }
  };
};

export default verifyUser;
