import firebaseAdmin from "../utils/firebaseAdmin.js";

const verifyFirebaseToken = async (req, res, next) => {
  try {
    const authorization = req.headers.authorization || "";

    if (!authorization.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Firebase ID token is required.",
      });
    }

    const idToken = authorization.substring(7).trim();

    if (!idToken) {
      return res.status(401).json({
        success: false,
        message: "Firebase ID token is missing.",
      });
    }

    const decodedToken = await firebaseAdmin.auth().verifyIdToken(idToken);

    req.firebaseUser = decodedToken;

    next();
  } catch (error) {
    console.error("VERIFY FIREBASE TOKEN ERROR:", error?.message || error);

    return res.status(401).json({
      success: false,
      message: "Invalid or expired Firebase authentication token.",
    });
  }
};

export default verifyFirebaseToken;
