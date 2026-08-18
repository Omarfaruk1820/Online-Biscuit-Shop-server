import { firebaseAdminAuth } from "../config/firebaseAdmin.js";

const verifyFirebaseToken = async (req, res, next) => {
  try {
    const authorization = req.headers.authorization || "";

    if (!authorization.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. Firebase authentication token is missing.",
      });
    }

    const token = authorization.substring(7).trim();

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. Firebase authentication token is missing.",
      });
    }

    req.firebaseUser = await firebaseAdminAuth.verifyIdToken(token);

    next();
  } catch (error) {
    console.error(
      "VERIFY FIREBASE TOKEN ERROR:",
      error?.code || error?.message || error,
    );

    return res.status(401).json({
      success: false,
      message: "Invalid or expired Firebase authentication token.",
    });
  }
};

export default verifyFirebaseToken;
