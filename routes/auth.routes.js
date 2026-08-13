import { Router } from "express";

import createToken from "../middleware/createToken.js";
import verifyToken from "../middleware/verifyToken.js";
import verifyUser from "../middleware/verifyUser.js";
import verifyFirebaseToken from "../middleware/verifyFirebaseToken.js";

import cookieOptions from "../utils/cookieOptions.js";

const authRoutes = (usersCollection) => {
  if (!usersCollection) {
    throw new Error("authRoutes: usersCollection is required.");
  }

  const router = Router();

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

  router.post("/jwt", verifyFirebaseToken, async (req, res) => {
    try {
      const firebaseUser = req.firebaseUser;

      if (!firebaseUser) {
        return res.status(401).json({
          success: false,
          message: "Firebase authentication failed.",
        });
      }

      const email = normalizeEmail(firebaseUser.email);

      if (!email) {
        return res.status(401).json({
          success: false,
          message: "Authenticated Firebase email is invalid.",
        });
      }

      if (firebaseUser.email_verified === false) {
        return res.status(403).json({
          success: false,
          message: "Please verify your email address before continuing.",
        });
      }

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

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User account was not found.",
        });
      }

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

      if (databaseEmail !== email) {
        console.error(
          "POST /auth/jwt: Firebase email and database email do not match.",
        );

        return res.status(403).json({
          success: false,
          message: "Authentication identity does not match the user account.",
        });
      }

      const status = normalizeStatus(user.status);

      if (status === "blocked") {
        return res.status(403).json({
          success: false,
          message: "Your account has been blocked.",
        });
      }

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

      if (typeof token !== "string" || !token.trim()) {
        return res.status(500).json({
          success: false,
          message: "Failed to create authentication token.",
        });
      }

      res.cookie("token", token, cookieOptions);

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

  router.get(
    "/me",
    verifyToken,
    verifyUser(usersCollection),
    async (req, res) => {
      try {
        const user = req.dbUser;

        if (!user) {
          return res.status(401).json({
            success: false,
            message: "Authenticated user is unavailable.",
          });
        }

        const status = normalizeStatus(user.status);

        if (status === "blocked") {
          return res.status(403).json({
            success: false,
            message: "Your account has been blocked.",
          });
        }

        const email = normalizeEmail(user.email);

        if (!email) {
          return res.status(500).json({
            success: false,
            message: "Authenticated user has invalid email data.",
          });
        }

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
