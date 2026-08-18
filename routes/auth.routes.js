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

  // ============================================================
  // HELPERS
  // ============================================================

  const normalizeEmail = (email = "") => {
    return typeof email === "string" ? email.trim().toLowerCase() : "";
  };

  const normalizeStatus = (status = "active") => {
    if (typeof status !== "string") {
      return "active";
    }

    return status.trim().toLowerCase() || "active";
  };

  const getSafeUser = (user) => {
    if (!user) {
      return null;
    }

    return {
      _id: user._id || null,
      uid: user.uid || "",
      name: user.name || "",
      email: normalizeEmail(user.email),
      photo: user.photo || "",
      role: user.role || "user",
      provider: user.provider || "password",
      status: normalizeStatus(user.status),
      createdAt: user.createdAt || null,
      updatedAt: user.updatedAt || null,
      lastLogin: user.lastLogin || null,
    };
  };

  const userProjection = {
    _id: 1,
    uid: 1,
    name: 1,
    email: 1,
    photo: 1,
    role: 1,
    provider: 1,
    status: 1,
    createdAt: 1,
    updatedAt: 1,
    lastLogin: 1,
  };

  // ============================================================
  // POST /auth/jwt
  // ============================================================
  //
  // Firebase ID Token
  //       ↓
  // verifyFirebaseToken
  //       ↓
  // Firebase User
  //       ↓
  // MongoDB User
  //       ↓
  // Application JWT
  //       ↓
  // HTTP-only Cookie
  //
  // No email verification check
  // ============================================================

  router.post("/jwt", verifyFirebaseToken, async (req, res) => {
    try {
      const firebaseUser = req.firebaseUser;

      if (!firebaseUser?.uid) {
        return res.status(401).json({
          success: false,
          message: "Firebase authentication failed.",
        });
      }

      const firebaseUid = String(firebaseUser.uid).trim();
      const firebaseEmail = normalizeEmail(firebaseUser.email);

      if (!firebaseEmail) {
        return res.status(401).json({
          success: false,
          message: "Firebase account email is missing.",
        });
      }

      // ----------------------------------------------------------
      // Find user by Firebase UID
      // ----------------------------------------------------------

      let user = await usersCollection.findOne(
        {
          uid: firebaseUid,
        },
        {
          projection: userProjection,
        },
      );

      // ----------------------------------------------------------
      // Fallback: find user by email
      // ----------------------------------------------------------

      if (!user) {
        user = await usersCollection.findOne(
          {
            email: firebaseEmail,
          },
          {
            projection: userProjection,
          },
        );
      }

      // ----------------------------------------------------------
      // User not found
      // ----------------------------------------------------------

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User account was not found.",
        });
      }

      // ----------------------------------------------------------
      // Database email
      // ----------------------------------------------------------

      const databaseEmail = normalizeEmail(user.email);

      if (!databaseEmail) {
        return res.status(500).json({
          success: false,
          message: "User account has invalid authentication data.",
        });
      }

      // ----------------------------------------------------------
      // Email identity check
      // ----------------------------------------------------------

      if (databaseEmail !== firebaseEmail) {
        return res.status(403).json({
          success: false,
          message: "Authentication email does not match the user account.",
        });
      }

      // ----------------------------------------------------------
      // Firebase UID check
      // ----------------------------------------------------------

      if (user.uid && String(user.uid).trim() !== firebaseUid) {
        return res.status(403).json({
          success: false,
          message: "Authentication identity does not match.",
        });
      }

      // ----------------------------------------------------------
      // Attach Firebase UID if old user has no UID
      // ----------------------------------------------------------

      if (!user.uid) {
        const now = new Date();

        await usersCollection.updateOne(
          {
            _id: user._id,
            $or: [{ uid: { $exists: false } }, { uid: null }, { uid: "" }],
          },
          {
            $set: {
              uid: firebaseUid,
              updatedAt: now,
            },
          },
        );

        user.uid = firebaseUid;
        user.updatedAt = now;
      }

      // ----------------------------------------------------------
      // Account status
      // ----------------------------------------------------------

      const status = normalizeStatus(user.status);

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

      // ----------------------------------------------------------
      // Update last login
      // ----------------------------------------------------------

      const now = new Date();

      await usersCollection.updateOne(
        {
          _id: user._id,
        },
        {
          $set: {
            lastLogin: now,
            updatedAt: now,
          },
        },
      );

      user = {
        ...user,
        uid: firebaseUid,
        lastLogin: now,
        updatedAt: now,
      };

      // ----------------------------------------------------------
      // Create application JWT
      // ----------------------------------------------------------

      const token = createToken({
        email: databaseEmail,
      });

      if (!token) {
        return res.status(500).json({
          success: false,
          message: "Authentication token was not created.",
        });
      }

      // ----------------------------------------------------------
      // Set HTTP-only cookie
      // ----------------------------------------------------------

      res.cookie("token", token, cookieOptions);

      // ----------------------------------------------------------
      // Response
      // ----------------------------------------------------------

      return res.status(200).json({
        success: true,
        message: "Authentication successful.",
        user: getSafeUser(user),
      });
    } catch (error) {
      console.error(
        "POST /auth/jwt ERROR:",
        error?.stack || error?.message || error,
      );

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
      console.error("POST /auth/logout ERROR:", error);

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

        if (status !== "active") {
          return res.status(403).json({
            success: false,
            message: "Your account is not active.",
          });
        }

        return res.status(200).json({
          success: true,
          user: getSafeUser(user),
        });
      } catch (error) {
        console.error("GET /auth/me ERROR:", error);

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
