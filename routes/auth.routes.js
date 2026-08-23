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

  console.log("AUTH ROUTES INITIALIZED");

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
    const role = normalizeString(value).toLowerCase();

    if (role === "admin") {
      return "admin";
    }

    return "user";
  };

  const normalizeStatus = (value = "active") => {
    const status = normalizeString(value).toLowerCase();

    if (status === "blocked") {
      return "blocked";
    }

    if (status === "active") {
      return "active";
    }

    return "inactive";
  };

  const normalizeProvider = (value = "password") => {
    const provider = normalizeString(value).toLowerCase();

    if (provider === "google" || provider === "google.com") {
      return "google.com";
    }

    return "password";
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
  // FIND USER BY FIREBASE IDENTITY
  // ==========================================================

  const findUserByFirebaseIdentity = async ({ uid, email }) => {
    let user = null;

    // --------------------------------------------------------
    // Find by Firebase UID
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
    // Fallback: find by email
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
  // ACCOUNT STATUS
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
  // REGISTER
  // POST /auth/register
  //
  // Firebase Bearer Token
  // ==========================================================

  router.post("/register", verifyFirebaseToken, async (req, res) => {
    try {
      const firebaseUser = req.firebaseUser;

      if (!firebaseUser?.uid) {
        return res.status(401).json({
          success: false,
          code: "auth/firebase-authentication-failed",
          message: "Firebase authentication failed.",
        });
      }

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
      // Find existing account
      // ----------------------------------------------------

      const existingUser = await findUserByFirebaseIdentity({
        uid,
        email,
      });

      // ====================================================
      // EXISTING USER
      // ====================================================

      if (existingUser) {
        const existingEmail = normalizeEmail(existingUser.email);

        const existingUid = normalizeString(existingUser.uid);

        if (existingEmail && existingEmail !== email) {
          return res.status(409).json({
            success: false,
            code: "user/email-conflict",
            message: "This Firebase account is linked to another email.",
          });
        }

        if (existingUid && existingUid !== uid) {
          return res.status(409).json({
            success: false,
            code: "user/uid-conflict",
            message: "This email is already linked to another account.",
          });
        }

        const statusError = checkAccountStatus(existingUser);

        if (statusError) {
          return res.status(403).json(statusError);
        }

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
      // CREATE NEW USER
      // ====================================================

      const now = new Date();

      const newUser = {
        uid,

        name,

        email,

        photo,

        emailVerified,

        role: "user",

        status: "active",

        provider,

        createdAt: now,

        updatedAt: now,

        lastLogin: null,
      };

      const result = await usersCollection.insertOne(newUser);

      if (!result?.acknowledged) {
        return res.status(500).json({
          success: false,
          code: "user/create-failed",
          message: "Failed to create user account.",
        });
      }

      const createdUser = {
        ...newUser,

        _id: result.insertedId,
      };

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
  // CREATE APPLICATION SESSION
  // POST /auth/jwt
  //
  // Firebase Bearer Token
  // ==========================================================

  router.post("/jwt", verifyFirebaseToken, async (req, res) => {
    try {
      const firebaseUser = req.firebaseUser;

      if (!firebaseUser?.uid) {
        return res.status(401).json({
          success: false,
          code: "auth/firebase-authentication-failed",
          message: "Firebase authentication failed.",
        });
      }

      const { uid, email, emailVerified, provider } =
        getFirebaseUserData(firebaseUser);

      if (!uid || !email) {
        return res.status(401).json({
          success: false,
          code: "auth/firebase-user-invalid",
          message: "Firebase user information is invalid.",
        });
      }

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

      if (user.uid && normalizeString(user.uid) !== uid) {
        return res.status(403).json({
          success: false,
          code: "auth/uid-mismatch",
          message: "Authentication identity does not match the user account.",
        });
      }

      const statusError = checkAccountStatus(user);

      if (statusError) {
        return res.status(403).json(statusError);
      }

      const now = new Date();

      const updateData = {
        uid,

        email,

        emailVerified,

        provider,

        lastLogin: now,

        updatedAt: now,
      };

      const firebaseName = normalizeString(
        firebaseUser?.name || firebaseUser?.displayName || "",
      );

      if (firebaseName) {
        updateData.name = firebaseName.slice(0, 100);
      }

      const firebasePhoto = normalizeString(
        firebaseUser?.picture || firebaseUser?.photoURL || "",
      );

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

      // ----------------------------------------------------
      // Create application JWT
      // ----------------------------------------------------

      const token = createToken({
        email: databaseEmail,
      });

      res.cookie("token", token, cookieOptions);

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
  // CURRENT USER
  // GET /auth/me
  //
  // Application JWT Cookie
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

        const statusError = checkAccountStatus(user);

        if (statusError) {
          return res.status(403).json(statusError);
        }

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
  // UPDATE PROFILE
  // PATCH /auth/profile
  //
  // IMPORTANT:
  // AuthProvider sends Firebase ID token.
  //
  // Therefore this route MUST use:
  // verifyFirebaseToken
  //
  // NOT:
  // verifyToken
  // ==========================================================

  // ==========================================================
  // UPDATE PROFILE
  // PATCH /auth/profile
  // ==========================================================

  router.patch("/profile", verifyFirebaseToken, async (req, res) => {
    try {
      // --------------------------------------------------------
      // FIREBASE USER
      // --------------------------------------------------------

      const firebaseUser = req.firebaseUser;

      if (!firebaseUser?.uid) {
        return res.status(401).json({
          success: false,
          code: "auth/firebase-authentication-failed",
          message: "Firebase authentication failed.",
        });
      }

      // --------------------------------------------------------
      // FIREBASE IDENTITY
      // --------------------------------------------------------

      const firebaseUid = normalizeString(firebaseUser.uid);
      const firebaseEmail = normalizeEmail(firebaseUser.email);

      if (!firebaseUid) {
        return res.status(401).json({
          success: false,
          code: "auth/firebase-uid-missing",
          message: "Firebase UID is missing.",
        });
      }

      if (!firebaseEmail) {
        return res.status(401).json({
          success: false,
          code: "auth/firebase-email-missing",
          message: "Firebase account email is missing.",
        });
      }

      // --------------------------------------------------------
      // FIND DATABASE USER
      // --------------------------------------------------------

      const currentUser = await findUserByFirebaseIdentity({
        uid: firebaseUid,
        email: firebaseEmail,
      });

      if (!currentUser) {
        return res.status(404).json({
          success: false,
          code: "user/not-found",
          message: "User account was not found.",
        });
      }

      // --------------------------------------------------------
      // VERIFY UID
      // --------------------------------------------------------

      const databaseUid = normalizeString(currentUser.uid);

      if (databaseUid && databaseUid !== firebaseUid) {
        return res.status(403).json({
          success: false,
          code: "auth/uid-mismatch",
          message: "Firebase identity does not match the user account.",
        });
      }

      // --------------------------------------------------------
      // VERIFY EMAIL
      // --------------------------------------------------------

      const databaseEmail = normalizeEmail(currentUser.email);

      if (databaseEmail && databaseEmail !== firebaseEmail) {
        return res.status(403).json({
          success: false,
          code: "auth/email-mismatch",
          message: "Firebase email does not match the user account.",
        });
      }

      // --------------------------------------------------------
      // CHECK ACCOUNT STATUS
      // --------------------------------------------------------

      const statusError = checkAccountStatus(currentUser);

      if (statusError) {
        return res.status(403).json(statusError);
      }

      // --------------------------------------------------------
      // REQUEST BODY
      // --------------------------------------------------------

      const rawName = req.body?.name;
      const rawPhoto = req.body?.photo;

      // --------------------------------------------------------
      // VALIDATE NAME TYPE
      // --------------------------------------------------------

      if (rawName !== undefined && typeof rawName !== "string") {
        return res.status(400).json({
          success: false,
          code: "profile/invalid-name",
          message: "Name must be a valid string.",
        });
      }

      // --------------------------------------------------------
      // VALIDATE PHOTO TYPE
      // --------------------------------------------------------

      if (
        rawPhoto !== undefined &&
        rawPhoto !== null &&
        typeof rawPhoto !== "string"
      ) {
        return res.status(400).json({
          success: false,
          code: "profile/invalid-photo",
          message: "Photo must be a valid URL string.",
        });
      }

      // --------------------------------------------------------
      // NORMALIZE VALUES
      // --------------------------------------------------------

      const name =
        rawName !== undefined
          ? normalizeString(rawName)
          : normalizeString(currentUser.name);

      const photo =
        rawPhoto !== undefined
          ? normalizeString(rawPhoto)
          : normalizeString(currentUser.photo);

      // --------------------------------------------------------
      // NAME VALIDATION
      // --------------------------------------------------------

      if (!name) {
        return res.status(400).json({
          success: false,
          code: "profile/name-required",
          message: "Name is required.",
        });
      }

      if (name.length < 2) {
        return res.status(400).json({
          success: false,
          code: "profile/name-too-short",
          message: "Name must contain at least 2 characters.",
        });
      }

      if (name.length > 100) {
        return res.status(400).json({
          success: false,
          code: "profile/name-too-long",
          message: "Name cannot exceed 100 characters.",
        });
      }

      // --------------------------------------------------------
      // PHOTO URL VALIDATION
      // --------------------------------------------------------

      if (photo) {
        try {
          const photoUrl = new URL(photo);

          if (photoUrl.protocol !== "http:" && photoUrl.protocol !== "https:") {
            throw new Error("Invalid photo URL protocol.");
          }
        } catch {
          return res.status(400).json({
            success: false,
            code: "profile/invalid-photo-url",
            message: "Please provide a valid HTTP or HTTPS photo URL.",
          });
        }
      }

      // --------------------------------------------------------
      // UPDATE TIMESTAMP
      // --------------------------------------------------------

      const now = new Date();

      // --------------------------------------------------------
      // UPDATE DATABASE
      // --------------------------------------------------------

      const updateResult = await usersCollection.updateOne(
        {
          _id: currentUser._id,
        },
        {
          $set: {
            name,
            photo,
            updatedAt: now,
          },
        },
      );

      // --------------------------------------------------------
      // DATABASE OPERATION CHECK
      // --------------------------------------------------------

      if (!updateResult?.acknowledged) {
        return res.status(500).json({
          success: false,
          code: "profile/update-failed",
          message: "Failed to update your profile.",
        });
      }

      // --------------------------------------------------------
      // USER MATCH CHECK
      // --------------------------------------------------------

      if (updateResult.matchedCount === 0) {
        return res.status(404).json({
          success: false,
          code: "user/not-found",
          message: "User account could not be found.",
        });
      }

      // --------------------------------------------------------
      // LOAD UPDATED USER
      // --------------------------------------------------------

      const updatedUser = await usersCollection.findOne(
        {
          _id: currentUser._id,
        },
        {
          projection: userProjection,
        },
      );

      if (!updatedUser) {
        return res.status(500).json({
          success: false,
          code: "profile/update-load-failed",
          message:
            "Profile was updated but the updated user could not be loaded.",
        });
      }

      // --------------------------------------------------------
      // SUCCESS
      // --------------------------------------------------------

      return res.status(200).json({
        success: true,
        code: "profile/updated",
        message: "Profile updated successfully.",
        user: getSafeUser(updatedUser),
      });
    } catch (error) {
      console.error(
        "PATCH /auth/profile ERROR:",
        error?.stack || error?.message || error,
      );

      return res.status(500).json({
        success: false,
        code: "profile/update-failed",
        message: "Failed to update your profile.",
      });
    }
  });

  // ==========================================================
  // LOGOUT
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
  // ROUTER DEBUG
  // ==========================================================

  console.log("AUTH ROUTES READY: /register /jwt /me /profile /logout");

  // ==========================================================
  // RETURN ROUTER
  // ==========================================================

  return router;
};

export default authRoutes;
