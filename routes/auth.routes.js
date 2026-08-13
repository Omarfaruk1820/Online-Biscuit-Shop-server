import { Router } from "express";

import createToken from "../middleware/createToken.js";
import verifyToken from "../middleware/verifyToken.js";
import verifyUser from "../middleware/verifyUser.js";
import verifyFirebaseToken from "../middleware/verifyFirebaseToken.js";

import cookieOptions from "../utils/cookieOptions.js";

const authRoutes = (usersCollection) => {
  // ============================================================
  // VALIDATE DEPENDENCY
  // ============================================================

  if (!usersCollection) {
    throw new Error("authRoutes: usersCollection is required.");
  }

  // ============================================================
  // ROUTER
  // ============================================================

  const router = Router();

  // ============================================================
  // HELPERS
  // ============================================================

  const normalizeEmail = (email = "") => {
    if (typeof email !== "string") {
      return "";
    }

    return email.trim().toLowerCase();
  };

  const normalizeStatus = (status = "") => {
    if (typeof status !== "string" || !status.trim()) {
      return "active";
    }

    return status.trim().toLowerCase();
  };

  // ============================================================
  // POST /auth/jwt
  //
  // Firebase token -> MongoDB user -> Application JWT cookie
  // ============================================================

  router.post("/jwt", verifyFirebaseToken, async (req, res) => {
    try {
      // ----------------------------------------------------------
      // VERIFIED FIREBASE USER
      // ----------------------------------------------------------

      const firebaseUser = req.firebaseUser;

      if (!firebaseUser) {
        return res.status(401).json({
          success: false,
          message: "Firebase authentication failed.",
        });
      }

      // ----------------------------------------------------------
      // EMAIL
      // ----------------------------------------------------------

      const email = normalizeEmail(firebaseUser.email);

      if (!email) {
        return res.status(401).json({
          success: false,
          message: "Authenticated Firebase email is invalid.",
        });
      }

      // ----------------------------------------------------------
      // EMAIL VERIFICATION
      // ----------------------------------------------------------

      if (firebaseUser.email_verified === false) {
        return res.status(403).json({
          success: false,
          message: "Please verify your email address before continuing.",
        });
      }

      // ----------------------------------------------------------
      // FIND USER
      // ----------------------------------------------------------

      const user = await usersCollection.findOne(
        {
          email,
        },
        {
          projection: {
            _id: 1,
            name: 1,
            email: 1,
            photo: 1,
            role: 1,
            provider: 1,
            status: 1,
            emailVerified: 1,
            createdAt: 1,
            updatedAt: 1,
            lastLogin: 1,
          },
        },
      );

      // ----------------------------------------------------------
      // USER NOT FOUND
      // ----------------------------------------------------------

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User account was not found.",
        });
      }

      // ----------------------------------------------------------
      // DATABASE EMAIL
      // ----------------------------------------------------------

      const databaseEmail = normalizeEmail(user.email);

      if (!databaseEmail) {
        console.error(
          "POST /auth/jwt: User email is missing or invalid in database.",
        );

        return res.status(500).json({
          success: false,
          message: "User account has invalid authentication data.",
        });
      }

      // ----------------------------------------------------------
      // IDENTITY CHECK
      // ----------------------------------------------------------

      if (databaseEmail !== email) {
        console.error(
          "POST /auth/jwt: Firebase email and database email do not match.",
        );

        return res.status(403).json({
          success: false,
          message: "Authentication identity does not match the user account.",
        });
      }

      // ----------------------------------------------------------
      // ACCOUNT STATUS
      // ----------------------------------------------------------

      const status = normalizeStatus(user.status);

      if (status === "blocked") {
        return res.status(403).json({
          success: false,
          message: "Your account has been blocked.",
        });
      }

      // ----------------------------------------------------------
      // CREATE APPLICATION JWT
      // ----------------------------------------------------------

      let token;

      try {
        token = createToken({
          email: databaseEmail,
        });
      } catch (tokenError) {
        console.error(
          "POST /auth/jwt: Token creation failed:",
          tokenError?.message || tokenError,
        );

        return res.status(500).json({
          success: false,
          message: "Failed to create authentication token.",
        });
      }

      // ----------------------------------------------------------
      // TOKEN VALIDATION
      // ----------------------------------------------------------

      if (typeof token !== "string" || !token.trim()) {
        return res.status(500).json({
          success: false,
          message: "Failed to create authentication token.",
        });
      }

      // ----------------------------------------------------------
      // HTTP-ONLY COOKIE
      // ----------------------------------------------------------

      res.cookie("token", token, cookieOptions);

      // ----------------------------------------------------------
      // RESPONSE
      // ----------------------------------------------------------

      return res.status(200).json({
        success: true,
        message: "Authentication successful.",

        user: {
          _id: user._id,

          name: user.name || "",

          email: databaseEmail,

          photo: user.photo || "",

          role: user.role || "user",

          provider: user.provider || "password",

          status,

          emailVerified:
            Boolean(user.emailVerified) || Boolean(firebaseUser.email_verified),
        },
      });
    } catch (error) {
      console.error("POST /auth/jwt ERROR:", error?.stack || error);

      return res.status(500).json({
        success: false,
        message: "Failed to authenticate user.",
      });
    }
  });

  // ============================================================
  // POST /auth/logout
  // ============================================================

  router.post("/logout", (req, res) => {
    try {
      res.clearCookie("token", {
        ...cookieOptions,
        maxAge: 0,
      });

      return res.status(200).json({
        success: true,
        message: "Logout successful.",
      });
    } catch (error) {
      console.error("POST /auth/logout ERROR:", error?.stack || error);

      return res.status(500).json({
        success: false,
        message: "Logout failed.",
      });
    }
  });

  // ============================================================
  // GET /auth/me
  // ============================================================

  router.get(
    "/me",
    verifyToken,
    verifyUser(usersCollection),
    async (req, res) => {
      try {
        // --------------------------------------------------------
        // VERIFIED DATABASE USER
        // --------------------------------------------------------

        const user = req.dbUser;

        if (!user) {
          return res.status(401).json({
            success: false,
            message: "Authenticated user is unavailable.",
          });
        }

        // --------------------------------------------------------
        // ACCOUNT STATUS
        // --------------------------------------------------------

        const status = normalizeStatus(user.status);

        if (status === "blocked") {
          return res.status(403).json({
            success: false,
            message: "Your account has been blocked.",
          });
        }

        // --------------------------------------------------------
        // EMAIL
        // --------------------------------------------------------

        const email = normalizeEmail(user.email);

        if (!email) {
          return res.status(500).json({
            success: false,
            message: "Authenticated user has invalid email data.",
          });
        }

        // --------------------------------------------------------
        // RESPONSE
        // --------------------------------------------------------

        return res.status(200).json({
          success: true,

          user: {
            _id: user._id,

            name: user.name || "",

            email,

            photo: user.photo || "",

            role: user.role || "user",

            provider: user.provider || "password",

            status,

            emailVerified: Boolean(user.emailVerified),

            createdAt: user.createdAt || null,

            updatedAt: user.updatedAt || null,

            lastLogin: user.lastLogin || null,
          },
        });
      } catch (error) {
        console.error("GET /auth/me ERROR:", error?.stack || error);

        return res.status(500).json({
          success: false,
          message: "Failed to fetch authenticated user.",
        });
      }
    },
  );

  return router;
};

export default authRoutes;
