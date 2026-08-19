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

  const normalizeString = (value = "") => {
    return typeof value === "string" ? value.trim() : "";
  };

  const normalizeRole = (role = "user") => {
    const value = normalizeString(role).toLowerCase();

    return value === "admin" ? "admin" : "user";
  };

  const normalizeStatus = (status = "active") => {
    const value = normalizeString(status).toLowerCase();

    return value === "blocked" ? "blocked" : "active";
  };

  const normalizeProvider = (provider = "password") => {
    const value = normalizeString(provider).toLowerCase();

    return value === "google.com" ? "google.com" : "password";
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
    emailVerified: 1,
    role: 1,
    status: 1,
    provider: 1,
    createdAt: 1,
    updatedAt: 1,
    lastLogin: 1,
  };

  // ==========================================================
  // SAFE USER
  // ==========================================================

  const getSafeUser = (user) => {
    if (!user) {
      return null;
    }

    return {
      _id: user._id || null,

      uid: normalizeString(user.uid),

      name: normalizeString(user.name),

      email: normalizeEmail(user.email),

      photo: normalizeString(user.photo),

      emailVerified: Boolean(user.emailVerified),

      role: normalizeRole(user.role),

      status: normalizeStatus(user.status),

      provider: normalizeProvider(user.provider),

      createdAt: user.createdAt || null,

      updatedAt: user.updatedAt || null,

      lastLogin: user.lastLogin || null,
    };
  };

  // ==========================================================
  // POST /auth/jwt
  //
  // Firebase ID Token
  //       ↓
  // verifyFirebaseToken
  //       ↓
  // Firebase user
  //       ↓
  // MongoDB user
  //       ↓
  // Application JWT
  //       ↓
  // HTTP-only cookie
  //
  // ==========================================================

  router.post("/jwt", verifyFirebaseToken, async (req, res) => {
    try {
      // ======================================================
      // FIREBASE USER
      // ======================================================

      const firebaseUser = req.firebaseUser;

      if (!firebaseUser?.uid) {
        return res.status(401).json({
          success: false,
          message: "Firebase authentication failed.",
        });
      }

      const firebaseUid = normalizeString(firebaseUser.uid);

      const firebaseEmail = normalizeEmail(firebaseUser.email);

      if (!firebaseUid) {
        return res.status(401).json({
          success: false,
          message: "Firebase user UID is missing.",
        });
      }

      if (!firebaseEmail) {
        return res.status(401).json({
          success: false,
          message: "Firebase account email is missing.",
        });
      }

      // ======================================================
      // EMAIL VERIFICATION
      // ======================================================

      const emailVerified = Boolean(
        firebaseUser.email_verified ?? firebaseUser.emailVerified,
      );

      // ======================================================
      // PROVIDER
      // ======================================================

      const firebaseProvider =
        firebaseUser.providerData?.[0]?.providerId || "password";

      const provider = normalizeProvider(firebaseProvider);

      // ======================================================
      // PASSWORD ACCOUNT VERIFICATION
      // ======================================================

      if (provider === "password" && !emailVerified) {
        return res.status(403).json({
          success: false,
          code: "auth/email-not-verified",
          message: "Please verify your email address before logging in.",
        });
      }

      // ======================================================
      // FIND USER BY UID
      // ======================================================

      let user = await usersCollection.findOne(
        {
          uid: firebaseUid,
        },
        {
          projection: userProjection,
        },
      );

      // ======================================================
      // FALLBACK: FIND BY EMAIL
      // ======================================================

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

      // ======================================================
      // USER MUST EXIST
      // ======================================================

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User account was not found.",
        });
      }

      // ======================================================
      // DATABASE EMAIL
      // ======================================================

      const databaseEmail = normalizeEmail(user.email);

      if (!databaseEmail) {
        return res.status(500).json({
          success: false,
          message: "User account has invalid email data.",
        });
      }

      // ======================================================
      // EMAIL CONSISTENCY
      // ======================================================

      if (databaseEmail !== firebaseEmail) {
        return res.status(403).json({
          success: false,
          message: "Authentication email does not match the user account.",
        });
      }

      // ======================================================
      // UID CONSISTENCY
      // ======================================================

      if (user.uid && normalizeString(user.uid) !== firebaseUid) {
        return res.status(403).json({
          success: false,
          message: "Authentication identity does not match the user account.",
        });
      }

      // ======================================================
      // ACCOUNT STATUS
      // ======================================================

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

      // ======================================================
      // UPDATE USER LOGIN DATA
      // ======================================================

      const now = new Date();

      const updateData = {
        uid: firebaseUid,

        email: firebaseEmail,

        emailVerified,

        provider,

        lastLogin: now,

        updatedAt: now,
      };

      // ======================================================
      // UPDATE FIREBASE PROFILE IF AVAILABLE
      // ======================================================

      const firebaseName = normalizeString(
        firebaseUser.name || firebaseUser.displayName || "",
      );

      const firebasePhoto = normalizeString(
        firebaseUser.picture || firebaseUser.photoURL || "",
      );

      if (firebaseName) {
        updateData.name = firebaseName.slice(0, 100);
      }

      if (firebasePhoto) {
        updateData.photo = firebasePhoto;
      }

      await usersCollection.updateOne(
        {
          _id: user._id,
        },
        {
          $set: updateData,
        },
      );

      // ======================================================
      // GET UPDATED USER
      // ======================================================

      const updatedUser = await usersCollection.findOne(
        {
          _id: user._id,
        },
        {
          projection: userProjection,
        },
      );

      if (!updatedUser) {
        return res.status(500).json({
          success: false,
          message: "Unable to load updated user account.",
        });
      }

      // ======================================================
      // CREATE APPLICATION JWT
      // ======================================================

      const token = createToken({
        email: databaseEmail,
      });

      // ======================================================
      // SET HTTP-ONLY COOKIE
      // ======================================================

      res.cookie("token", token, cookieOptions);

      // ======================================================
      // SUCCESS
      // ======================================================

      return res.status(200).json({
        success: true,

        message: "Authentication successful.",

        user: getSafeUser(updatedUser),
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
  //
  // Application JWT cookie
  //       ↓
  // verifyToken
  //       ↓
  // verifyUser
  //       ↓
  // MongoDB user
  //
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

        // ======================================================
        // ACCOUNT STATUS
        // ======================================================

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

        // ======================================================
        // RETURN USER
        // ======================================================

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
