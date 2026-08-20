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

  const normalizeString = (value = "") => {
    return typeof value === "string" ? value.trim() : "";
  };

  const normalizeEmail = (value = "") => {
    return normalizeString(value).toLowerCase();
  };

  const normalizeRole = (value = "user") => {
    return normalizeString(value).toLowerCase() === "admin" ? "admin" : "user";
  };

  const normalizeStatus = (value = "active") => {
    return normalizeString(value).toLowerCase() === "blocked"
      ? "blocked"
      : "active";
  };

  const normalizeProvider = (value = "password") => {
    const provider = normalizeString(value).toLowerCase();

    return provider === "google.com" ? "google.com" : "password";
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
  // FIREBASE USER DATA
  // ==========================================================

  const getFirebaseUserData = (firebaseUser, body = {}) => {
    const uid = normalizeString(firebaseUser?.uid);

    const email = normalizeEmail(firebaseUser?.email);

    const name = normalizeString(
      firebaseUser?.name || firebaseUser?.displayName || body?.name || "",
    );

    const photo = normalizeString(
      firebaseUser?.picture ||
        firebaseUser?.photoURL ||
        body?.photo ||
        body?.photoURL ||
        "",
    );

    const emailVerified = Boolean(
      firebaseUser?.email_verified ?? firebaseUser?.emailVerified ?? false,
    );

    // Firebase Admin decoded token normally contains:
    //
    // firebase.sign_in_provider
    //
    // Example:
    //
    // password
    // google.com

    const providerId =
      firebaseUser?.firebase?.sign_in_provider ||
      firebaseUser?.providerData?.[0]?.providerId ||
      firebaseUser?.providerId ||
      firebaseUser?.provider ||
      "password";

    const provider = normalizeProvider(providerId);

    return {
      uid,

      email,

      name: name.slice(0, 100),

      photo,

      emailVerified,

      provider,
    };
  };

  // ==========================================================
  // FIND USER
  // ==========================================================

  const findUserByFirebaseIdentity = async ({ uid, email }) => {
    let user = null;

    // --------------------------------------------------------
    // FIRST: FIND BY FIREBASE UID
    // --------------------------------------------------------

    if (uid) {
      user = await usersCollection.findOne(
        {
          uid,
        },
        {
          projection: userProjection,
        },
      );
    }

    // --------------------------------------------------------
    // SECOND: FIND BY EMAIL
    // --------------------------------------------------------

    if (!user && email) {
      user = await usersCollection.findOne(
        {
          email,
        },
        {
          projection: userProjection,
        },
      );
    }

    return user;
  };

  // ==========================================================
  // CHECK ACCOUNT STATUS
  // ==========================================================

  const checkAccountStatus = (user) => {
    if (!user) {
      return null;
    }

    const status = normalizeStatus(user.status);

    if (status === "blocked") {
      return {
        success: false,
        code: "user/blocked",
        message: "Your account has been blocked.",
      };
    }

    if (status !== "active") {
      return {
        success: false,
        code: "user/inactive",
        message: "Your account is not active.",
      };
    }

    return null;
  };

  // ==========================================================
  // POST /auth/register
  //
  // OPTION 2
  //
  // Firebase
  //    ↓
  // MongoDB
  //
  // JWT is NOT created here.
  //
  // AuthProvider will call /auth/jwt immediately after this.
  // ==========================================================

  router.post("/register", verifyFirebaseToken, async (req, res) => {
    try {
      const firebaseUser = req.firebaseUser;

      // ----------------------------------------------------
      // FIREBASE USER CHECK
      // ----------------------------------------------------

      if (!firebaseUser?.uid) {
        return res.status(401).json({
          success: false,
          code: "auth/firebase-authentication-failed",
          message: "Firebase authentication failed.",
        });
      }

      // ----------------------------------------------------
      // FIREBASE DATA
      // ----------------------------------------------------

      const { uid, email, name, photo, emailVerified, provider } =
        getFirebaseUserData(firebaseUser, req.body);

      if (!uid) {
        return res.status(401).json({
          success: false,
          code: "auth/firebase-uid-missing",
          message: "Firebase UID is missing.",
        });
      }

      if (!email) {
        return res.status(401).json({
          success: false,
          code: "auth/firebase-email-missing",
          message: "Firebase account email is missing.",
        });
      }

      // ----------------------------------------------------
      // FIND EXISTING USER
      // ----------------------------------------------------

      const existingUser = await findUserByFirebaseIdentity({
        uid,
        email,
      });

      // ====================================================
      // EXISTING USER
      // ====================================================

      if (existingUser) {
        // --------------------------------------------------
        // EMAIL CONFLICT
        // --------------------------------------------------

        if (
          existingUser.email &&
          normalizeEmail(existingUser.email) !== email
        ) {
          return res.status(409).json({
            success: false,
            code: "user/email-conflict",
            message: "This Firebase account is linked to another email.",
          });
        }

        // --------------------------------------------------
        // UID CONFLICT
        // --------------------------------------------------

        if (existingUser.uid && normalizeString(existingUser.uid) !== uid) {
          return res.status(409).json({
            success: false,
            code: "user/uid-conflict",
            message: "This email is already linked to another account.",
          });
        }

        // --------------------------------------------------
        // ACCOUNT STATUS
        // --------------------------------------------------

        const statusError = checkAccountStatus(existingUser);

        if (statusError) {
          return res.status(403).json(statusError);
        }

        // --------------------------------------------------
        // UPDATE EXISTING USER
        // --------------------------------------------------

        const now = new Date();

        const updateData = {
          uid,

          email,

          emailVerified,

          provider,

          updatedAt: now,
        };

        if (name) {
          updateData.name = name;
        }

        if (photo) {
          updateData.photo = photo;
        }

        await usersCollection.updateOne(
          {
            _id: existingUser._id,
          },
          {
            $set: updateData,
          },
        );

        // --------------------------------------------------
        // GET UPDATED USER
        // --------------------------------------------------

        const updatedUser = await usersCollection.findOne(
          {
            _id: existingUser._id,
          },
          {
            projection: userProjection,
          },
        );

        if (!updatedUser) {
          return res.status(500).json({
            success: false,
            code: "user/load-failed",
            message: "Unable to load user account.",
          });
        }

        return res.status(200).json({
          success: true,
          code: "user/synchronized",
          message: "User account synchronized successfully.",
          user: getSafeUser(updatedUser),
        });
      }

      // ====================================================
      // NEW USER
      // ====================================================

      const now = new Date();

      const newUser = {
        uid,

        name,

        email,

        photo,

        emailVerified,

        // --------------------------------------------------
        // NEVER TRUST FRONTEND ROLE
        // --------------------------------------------------

        role: "user",

        // --------------------------------------------------
        // DEFAULT ACCOUNT STATUS
        // --------------------------------------------------

        status: "active",

        provider,

        createdAt: now,

        updatedAt: now,

        lastLogin: null,
      };

      // ----------------------------------------------------
      // INSERT USER
      // ----------------------------------------------------

      const result = await usersCollection.insertOne(newUser);

      if (!result?.acknowledged) {
        return res.status(500).json({
          success: false,
          code: "user/create-failed",
          message: "Failed to create user account.",
        });
      }

      // ----------------------------------------------------
      // CREATED USER
      // ----------------------------------------------------

      const createdUser = {
        ...newUser,

        _id: result.insertedId,
      };

      // ----------------------------------------------------
      // SUCCESS
      // ----------------------------------------------------

      return res.status(201).json({
        success: true,

        code: "user/created",

        message: "User account created successfully.",

        user: getSafeUser(createdUser),
      });
    } catch (error) {
      console.error(
        "POST /auth/register ERROR:",
        error?.stack || error?.message || error,
      );

      // ----------------------------------------------------
      // DUPLICATE KEY
      // ----------------------------------------------------

      if (error?.code === 11000) {
        return res.status(409).json({
          success: false,
          code: "user/duplicate",
          message: "A user account with this information already exists.",
        });
      }

      return res.status(500).json({
        success: false,
        code: "user/register-failed",
        message: "Failed to create user account.",
      });
    }
  });

  // ==========================================================
  // POST /auth/jwt
  //
  // OPTION 2 IMPORTANT ROUTE
  //
  // Firebase token
  //      ↓
  // Find MongoDB user
  //      ↓
  // Check account
  //      ↓
  // Create JWT
  //      ↓
  // HTTP-only cookie
  //
  // IMPORTANT:
  //
  // EMAIL VERIFICATION IS NOT REQUIRED HERE.
  //
  // This allows:
  //
  // Register
  //    ↓
  // Automatically Logged In
  //    ↓
  // Home
  //
  // ==========================================================

  router.post("/jwt", verifyFirebaseToken, async (req, res) => {
    try {
      const firebaseUser = req.firebaseUser;

      // ----------------------------------------------------
      // FIREBASE USER CHECK
      // ----------------------------------------------------

      if (!firebaseUser?.uid) {
        return res.status(401).json({
          success: false,
          code: "auth/firebase-authentication-failed",
          message: "Firebase authentication failed.",
        });
      }

      // ----------------------------------------------------
      // FIREBASE DATA
      // ----------------------------------------------------

      const { uid, email, emailVerified, provider } =
        getFirebaseUserData(firebaseUser);

      if (!uid) {
        return res.status(401).json({
          success: false,
          code: "auth/firebase-uid-missing",
          message: "Firebase UID is missing.",
        });
      }

      if (!email) {
        return res.status(401).json({
          success: false,
          code: "auth/firebase-email-missing",
          message: "Firebase account email is missing.",
        });
      }

      // ----------------------------------------------------
      // FIND USER
      // ----------------------------------------------------

      const user = await findUserByFirebaseIdentity({
        uid,
        email,
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          code: "user/not-found",
          message: "User account was not found. Please register first.",
        });
      }

      // ----------------------------------------------------
      // EMAIL CHECK
      // ----------------------------------------------------

      const databaseEmail = normalizeEmail(user.email);

      if (!databaseEmail) {
        return res.status(500).json({
          success: false,
          code: "user/invalid-email",
          message: "User account has invalid email data.",
        });
      }

      if (databaseEmail !== email) {
        return res.status(403).json({
          success: false,
          code: "auth/email-mismatch",
          message: "Authentication email does not match the user account.",
        });
      }

      // ----------------------------------------------------
      // UID CHECK
      // ----------------------------------------------------

      if (user.uid && normalizeString(user.uid) !== uid) {
        return res.status(403).json({
          success: false,
          code: "auth/uid-mismatch",
          message: "Authentication identity does not match the user account.",
        });
      }

      // ----------------------------------------------------
      // ACCOUNT STATUS
      // ----------------------------------------------------

      const statusError = checkAccountStatus(user);

      if (statusError) {
        return res.status(403).json(statusError);
      }

      // ----------------------------------------------------
      // UPDATE LOGIN INFORMATION
      //
      // emailVerified can be false here.
      //
      // THIS IS INTENTIONAL FOR OPTION 2.
      // ----------------------------------------------------

      const now = new Date();

      const updateData = {
        uid,

        email,

        emailVerified,

        provider,

        lastLogin: now,

        updatedAt: now,
      };

      // ----------------------------------------------------
      // UPDATE NAME
      // ----------------------------------------------------

      const firebaseName = normalizeString(
        firebaseUser?.name || firebaseUser?.displayName || "",
      );

      if (firebaseName) {
        updateData.name = firebaseName.slice(0, 100);
      }

      // ----------------------------------------------------
      // UPDATE PHOTO
      // ----------------------------------------------------

      const firebasePhoto = normalizeString(
        firebaseUser?.picture || firebaseUser?.photoURL || "",
      );

      if (firebasePhoto) {
        updateData.photo = firebasePhoto;
      }

      // ----------------------------------------------------
      // UPDATE DATABASE
      // ----------------------------------------------------

      await usersCollection.updateOne(
        {
          _id: user._id,
        },
        {
          $set: updateData,
        },
      );

      // ----------------------------------------------------
      // GET UPDATED USER
      // ----------------------------------------------------

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
          code: "user/load-failed",
          message: "Unable to load updated user account.",
        });
      }

      // ====================================================
      // CREATE APPLICATION JWT
      // ====================================================

      const token = createToken({
        email: databaseEmail,
      });

      // ====================================================
      // SAVE JWT IN HTTP-ONLY COOKIE
      // ====================================================

      res.cookie("token", token, cookieOptions);

      // ====================================================
      // SUCCESS
      // ====================================================

      return res.status(200).json({
        success: true,

        code: "auth/session-created",

        message: "Authentication session created successfully.",

        user: getSafeUser(updatedUser),
      });
    } catch (error) {
      console.error(
        "POST /auth/jwt ERROR:",
        error?.stack || error?.message || error,
      );

      return res.status(500).json({
        success: false,
        code: "auth/session-failed",
        message: "Failed to create authentication session.",
      });
    }
  });

  // ==========================================================
  // GET /auth/me
  //
  // JWT COOKIE
  //     ↓
  // verifyToken
  //     ↓
  // verifyUser
  //     ↓
  // Current MongoDB user
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
            code: "auth/user-unavailable",
            message: "Authenticated user is unavailable.",
          });
        }

        // ----------------------------------------------------
        // ACCOUNT STATUS
        // ----------------------------------------------------

        const statusError = checkAccountStatus(user);

        if (statusError) {
          return res.status(403).json(statusError);
        }

        // ----------------------------------------------------
        // SUCCESS
        // ----------------------------------------------------

        return res.status(200).json({
          success: true,

          code: "auth/session-active",

          user: getSafeUser(user),
        });
      } catch (error) {
        console.error(
          "GET /auth/me ERROR:",
          error?.stack || error?.message || error,
        );

        return res.status(500).json({
          success: false,
          code: "auth/me-failed",
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

        code: "auth/logout-success",

        message: "Logout successful.",
      });
    } catch (error) {
      console.error(
        "POST /auth/logout ERROR:",
        error?.stack || error?.message || error,
      );

      return res.status(500).json({
        success: false,

        code: "auth/logout-failed",

        message: "Logout failed.",
      });
    }
  });

  // ==========================================================
  // RETURN ROUTER
  // ==========================================================

  return router;
};

export default authRoutes;
