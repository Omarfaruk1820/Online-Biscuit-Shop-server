import admin from "firebase-admin";

const verifyToken = async (req, res, next) => {
  try {
    const authorization = req.headers.authorization || "";

    if (!authorization.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: Authorization token not found.",
      });
    }

    const token = authorization.split("Bearer ")[1]?.trim();

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: Token not found.",
      });
    }

    const decodedToken = await admin.auth().verifyIdToken(token);

    if (!decodedToken?.email) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: Authenticated email unavailable.",
      });
    }

    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email.toLowerCase(),
      name: decodedToken.name || "",
      picture: decodedToken.picture || "",
      emailVerified: decodedToken.email_verified === true,
    };

    next();
  } catch (error) {
    console.error("VERIFY TOKEN ERROR:", error);

    return res.status(401).json({
      success: false,
      message: "Unauthorized: Invalid or expired Firebase token.",
    });
  }
};

export default verifyToken;
