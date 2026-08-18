import { Router } from "express";

import createToken from "../middleware/createToken.js";
import verifyToken from "../middleware/verifyToken.js";
import verifyUser from "../middleware/verifyUser.js";
import verifyFirebaseToken from "../middleware/verifyFirebaseToken.js";

import cookieOptions from "../utils/cookieOptions.js";

// ============================================================
// AUTH ROUTES
// ============================================================

const authRoutes = (usersCollection) => {
  if (!usersCollection) {
    throw new Error("authRoutes requires usersCollection.");
  }

  const router = Router();

  // ==========================================================
  // HELPERS
  // ==========================================================

  const normalizeEmail = (email = "") => {
    return typeof email === "string" ? email.trim().toLowerCase() : "";
  };

  const normalizeStatus = (status = "active") => {
    return typeof status === "string" && status.trim()
      ? status.trim().toLowerCase()
      : "active";
  };

  // ==========================================================
  // SAFE USER RESPONSE
  // ==========================================================

  const getSafeUser = (user) => {
    if (!user) {
      return null;
    }

    return {
      _id: user._id || null,

      uid: user.uid || "",

      name: typeof user.name === "string" ? user.name.trim() : "",

      email: normalizeEmail(user.email),

      photo: typeof user.photo === "string" ? user.photo.trim() : "",

      role:
        typeof user.role === "string" ? user.role.trim().toLowerCase() : "user",

      provider:
        typeof user.provider === "string" ? user.provider.trim() : "password",

      status: normalizeStatus(user.status),

      createdAt: user.createdAt || null,

      updatedAt: user.updatedAt || null,

      lastLogin: user.lastLogin || null,
    };
  };

  // ==========================================================
  // USER PROJECTION
  // ==========================================================

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

  // ==========================================================
  // POST /auth/jwt
  // ==========================================================
  //
  // Firebase ID Token
  //        ↓
  // verifyFirebaseToken
  //        ↓
  // Firebase user
  //        ↓
  // MongoDB user
  //        ↓
  // Application JWT
  //        ↓
  // HTTP-only cookie
  //
  // ==========================================================

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

      // ------------------------------------------------------
      // Find by Firebase UID first
      // ------------------------------------------------------

      let user = await usersCollection.findOne(
        {
          uid: firebaseUid,
        },
        {
          projection: userProjection,
        },
      );

      // ------------------------------------------------------
      // Fallback to email
      // ------------------------------------------------------

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

      // ------------------------------------------------------
      // User must exist
      // ------------------------------------------------------

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User account was not found.",
        });
      }

      const databaseEmail = normalizeEmail(user.email);

      if (!databaseEmail) {
        return res.status(500).json({
          success: false,
          message: "User account has invalid email data.",
        });
      }

      // ------------------------------------------------------
      // Firebase email vs database email
      // ------------------------------------------------------

      if (databaseEmail !== firebaseEmail) {
        return res.status(403).json({
          success: false,
          message: "Authentication email does not match the user account.",
        });
      }

      // ------------------------------------------------------
      // Firebase UID consistency
      // ------------------------------------------------------

      if (user.uid && String(user.uid).trim() !== firebaseUid) {
        return res.status(403).json({
          success: false,
          message: "Authentication identity does not match the user account.",
        });
      }

      // ------------------------------------------------------
      // Attach Firebase UID to legacy user
      // ------------------------------------------------------

      const now = new Date();

      if (!user.uid) {
        await usersCollection.updateOne(
          {
            _id: user._id,

            $or: [
              {
                uid: {
                  $exists: false,
                },
              },
              {
                uid: null,
              },
              {
                uid: "",
              },
            ],
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

      // ------------------------------------------------------
      // Account status
      // ------------------------------------------------------

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

      // ------------------------------------------------------
      // Update last login
      // ------------------------------------------------------

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

      // ------------------------------------------------------
      // Create application JWT
      // ------------------------------------------------------

      const token = createToken({
        email: databaseEmail,
      });

      // ------------------------------------------------------
      // Set HTTP-only cookie
      // ------------------------------------------------------

      res.cookie("token", token, cookieOptions);

      // ------------------------------------------------------
      // Response
      // ------------------------------------------------------

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

  // ==========================================================
  // GET /auth/me
  // ==========================================================

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

        return res.status(200).json({
          success: true,
          user: getSafeUser(user),
        });
      } catch (error) {
        console.error(
          "GET /auth/me ERROR:",
          error?.stack || error?.message || error,
        );

        return res.status(500).json({
          success: false,
          message: "Failed to fetch authenticated user.",
        });
      }
    },
  );

  // ==========================================================
  // POST /auth/logout
  // ==========================================================

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
      console.error(
        "POST /auth/logout ERROR:",
        error?.stack || error?.message || error,
      );

      return res.status(500).json({
        success: false,
        message: "Logout failed.",
      });
    }
  });

  return router;
};

export default authRoutes;
