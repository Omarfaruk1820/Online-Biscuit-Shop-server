import { Router } from "express";

import verifyToken from "../middleware/verifyToken.js";
import verifyUser from "../middleware/verifyUser.js";

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
    return normalizeString(value).toLowerCase() === "admin" ? "admin" : "user";
  };

  const normalizeStatus = (value = "active") => {
    const status = normalizeString(value).toLowerCase();

    if (status === "blocked") {
      return "blocked";
    }

    if (status === "inactive") {
      return "inactive";
    }

    return "active";
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

  const getFirebaseUserData = (req) => {
    const firebaseUser = req.user || {};
    const body = req.body || {};

    const uid = normalizeString(firebaseUser.uid);

    const email = normalizeEmail(firebaseUser.email);

    const name =
      normalizeString(firebaseUser.name) || normalizeString(body.name);

    const photo =
      normalizeString(firebaseUser.picture) ||
      normalizeString(body.photo) ||
      normalizeString(body.photoURL);

    const emailVerified = firebaseUser.emailVerified === true;

    const provider = normalizeProvider(firebaseUser.provider);

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
    // UID first
    // --------------------------------------------------------

    if (uid) {
      user = await usersCollection.findOne(
        { uid },
        {
          projection: userProjection,
        },
      );
    }

    // --------------------------------------------------------
    // Email fallback
    // --------------------------------------------------------

    if (!user && email) {
      user = await usersCollection.findOne(
        { email },
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

  const getAccountStatusError = (user) => {
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
  // REGISTER / SYNC USER
  // ==========================================================

  router.post("/register", verifyToken, async (req, res) => {
    try {
      const { uid, email, name, photo, emailVerified, provider } =
        getFirebaseUserData(req);

      // ----------------------------------------------------
      // Firebase identity validation
      // ----------------------------------------------------

      if (!uid) {
        return res.status(401).json({
          success: false,
          code: "auth/uid-missing",
          message: "Firebase UID is unavailable.",
        });
      }

      if (!email) {
        return res.status(401).json({
          success: false,
          code: "auth/email-missing",
          message: "Firebase email is unavailable.",
        });
      }

      // ----------------------------------------------------
      // Find existing user
      // ----------------------------------------------------

      const existingUser = await findUserByFirebaseIdentity({
        uid,
        email,
      });

      // ====================================================
      // EXISTING USER
      // ====================================================

      if (existingUser) {
        const existingUid = normalizeString(existingUser.uid);

        const existingEmail = normalizeEmail(existingUser.email);

        // --------------------------------------------------
        // Identity conflict
        // --------------------------------------------------

        if (existingUid && existingUid !== uid) {
          return res.status(409).json({
            success: false,
            code: "user/uid-conflict",
            message: "This email is already linked to another account.",
          });
        }

        if (existingEmail && existingEmail !== email) {
          return res.status(409).json({
            success: false,
            code: "user/email-conflict",
            message: "This Firebase account is linked to another email.",
          });
        }

        // --------------------------------------------------
        // Account status
        // --------------------------------------------------

        const statusError = getAccountStatusError(existingUser);

        if (statusError) {
          return res.status(403).json(statusError);
        }

        // --------------------------------------------------
        // Synchronize Firebase data
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
        // Load updated user
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
        message: "Failed to synchronize user account.",
      });
    }
  });

  // ==========================================================
  // CURRENT USER
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

        const statusError = getAccountStatusError(user);

        if (statusError) {
          return res.status(403).json(statusError);
        }

        return res.status(200).json({
          success: true,
          code: "auth/session-active",
          message: "Authenticated user loaded successfully.",
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
  // ==========================================================

  router.patch(
    "/profile",
    verifyToken,
    verifyUser(usersCollection),
    async (req, res) => {
      try {
        const currentUser = req.dbUser;

        if (!currentUser) {
          return res.status(401).json({
            success: false,
            code: "auth/user-unavailable",
            message: "Authenticated user is unavailable.",
          });
        }

        // ----------------------------------------------------
        // Request body
        // ----------------------------------------------------

        const rawName = req.body?.name;
        const rawPhoto = req.body?.photo;

        // ----------------------------------------------------
        // Validate name type
        // ----------------------------------------------------

        if (rawName !== undefined && typeof rawName !== "string") {
          return res.status(400).json({
            success: false,
            code: "profile/invalid-name",
            message: "Name must be a valid string.",
          });
        }

        // ----------------------------------------------------
        // Validate photo type
        // ----------------------------------------------------

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

        // ----------------------------------------------------
        // Normalize
        // ----------------------------------------------------

        const name =
          rawName !== undefined
            ? normalizeString(rawName)
            : normalizeString(currentUser.name);

        const photo =
          rawPhoto !== undefined
            ? normalizeString(rawPhoto)
            : normalizeString(currentUser.photo);

        // ----------------------------------------------------
        // Name validation
        // ----------------------------------------------------

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

        // ----------------------------------------------------
        // Photo URL validation
        // ----------------------------------------------------

        if (photo) {
          try {
            const photoUrl = new URL(photo);

            if (
              photoUrl.protocol !== "http:" &&
              photoUrl.protocol !== "https:"
            ) {
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

        // ----------------------------------------------------
        // Update
        // ----------------------------------------------------

        const now = new Date();

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

        if (!updateResult?.acknowledged) {
          return res.status(500).json({
            success: false,
            code: "profile/update-failed",
            message: "Failed to update your profile.",
          });
        }

        if (updateResult.matchedCount === 0) {
          return res.status(404).json({
            success: false,
            code: "user/not-found",
            message: "User account could not be found.",
          });
        }

        // ----------------------------------------------------
        // Load updated user
        // ----------------------------------------------------

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
    },
  );

  // ==========================================================
  // LOGOUT
  // ==========================================================

  router.post("/logout", (req, res) => {
    return res.status(200).json({
      success: true,
      code: "auth/logout-success",
      message: "Logout successful.",
    });
  });

  // ==========================================================
  // READY
  // ==========================================================

  console.log("AUTH ROUTES READY: /register /me /profile /logout");

  return router;
};

export default authRoutes;
