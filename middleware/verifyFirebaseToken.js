import "../config/firebaseAdmin.js";

import { getAuth } from "firebase-admin/auth";

// ============================================================
// VERIFY FIREBASE ID TOKEN
// ============================================================

const verifyFirebaseToken = async (req, res, next) => {
  try {
    // ----------------------------------------------------------
    // Authorization Header
    // ----------------------------------------------------------

    const authorization = req.headers.authorization;

    if (
      typeof authorization !== "string" ||
      !authorization.startsWith("Bearer ")
    ) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. Firebase authentication token is missing.",
      });
    }

    // ----------------------------------------------------------
    // Extract Firebase ID Token
    // ----------------------------------------------------------

    const idToken = authorization.slice(7).trim();

    if (!idToken) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. Firebase authentication token is missing.",
      });
    }

    // ----------------------------------------------------------
    // Verify Firebase ID Token
    // ----------------------------------------------------------

    const decodedToken = await getAuth().verifyIdToken(idToken);

    // ----------------------------------------------------------
    // Validate Firebase UID
    // ----------------------------------------------------------

    if (!decodedToken?.uid) {
      return res.status(401).json({
        success: false,
        message: "Invalid Firebase authentication token.",
      });
    }

    // ----------------------------------------------------------
    // Attach Firebase User
    // ----------------------------------------------------------

    req.firebaseUser = decodedToken;

    return next();
  } catch (error) {
    console.error("VERIFY FIREBASE TOKEN ERROR:", {
      code: error?.code,
      message: error?.message,
    });

    // ----------------------------------------------------------
    // Firebase Token Errors
    // ----------------------------------------------------------

    switch (error?.code) {
      case "auth/id-token-expired":
        return res.status(401).json({
          success: false,
          message: "Firebase authentication token has expired.",
        });

      case "auth/id-token-revoked":
        return res.status(401).json({
          success: false,
          message: "Firebase authentication token has been revoked.",
        });

      case "auth/argument-error":
        return res.status(401).json({
          success: false,
          message: "Invalid Firebase authentication token.",
        });

      default:
        return res.status(401).json({
          success: false,
          message: "Invalid or expired Firebase authentication token.",
        });
    }
  }
};

export default verifyFirebaseToken;
