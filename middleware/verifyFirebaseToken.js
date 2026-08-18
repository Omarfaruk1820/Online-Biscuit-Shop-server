import "../config/firebaseAdmin.js";
import { getAuth } from "firebase-admin/auth";

const verifyFirebaseToken = async (req, res, next) => {
  try {
    const authorization = req.headers.authorization;

    if (!authorization?.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. Firebase authentication token is missing.",
      });
    }

    const idToken = authorization.slice(7).trim();

    if (!idToken) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. Firebase authentication token is missing.",
      });
    }

    const decodedToken = await getAuth().verifyIdToken(idToken);

    req.firebaseUser = decodedToken;

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