import { Router } from "express";
import { ObjectId } from "mongodb";

import verifyToken from "../middleware/verifyToken.js";
import verifyUser from "../middleware/verifyUser.js";
import verifyAdmin from "../middleware/verifyAdmin.js";

// ============================================================
// USERS ROUTES
// ============================================================

const usersRoutes = (usersCollection) => {
  if (!usersCollection) {
    throw new Error("usersRoutes requires usersCollection.");
  }

  const router = Router();

  // ==========================================================
  // CONSTANTS
  // ==========================================================

  const VALID_ROLES = ["user", "admin"];
  const VALID_STATUSES = ["active", "blocked"];

  // ==========================================================
  // HELPERS
  // ==========================================================

  const normalizeString = (value = "") => {
    return typeof value === "string" ? value.trim() : "";
  };

  const normalizeEmail = (value = "") => {
    return normalizeString(value).toLowerCase();
  };

  const normalizeRole = (value = "") => {
    return normalizeString(value).toLowerCase();
  };

  const normalizeStatus = (value = "") => {
    return normalizeString(value).toLowerCase();
  };

  const normalizeProvider = (value = "") => {
    const provider = normalizeString(value).toLowerCase();

    if (provider === "google" || provider === "google.com") {
      return "google.com";
    }

    return "password";
  };

  const isValidObjectId = (id) => {
    return typeof id === "string" && ObjectId.isValid(id);
  };

  const escapeRegex = (value = "") => {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

    const role = normalizeRole(user.role);
    const status = normalizeStatus(user.status);

    return {
      _id: user._id || null,

      uid: normalizeString(user.uid),

      name: normalizeString(user.name),

      email: normalizeEmail(user.email),

      photo: normalizeString(user.photo),

      emailVerified: Boolean(user.emailVerified),

      role: VALID_ROLES.includes(role) ? role : "user",

      status: VALID_STATUSES.includes(status) ? status : "active",

      provider: normalizeProvider(user.provider),

      createdAt: user.createdAt || null,

      updatedAt: user.updatedAt || null,

      lastLogin: user.lastLogin || null,
    };
  };

  // ==========================================================
  // POST /
  // CREATE / SYNC CURRENT FIREBASE USER
  //
  // POST /users
  // ==========================================================

  router.post("/", verifyToken, async (req, res) => {
    try {
      const firebaseUser = req.user;

      if (!firebaseUser?.uid) {
        return res.status(401).json({
          success: false,
          code: "auth/user-identity-missing",
          message: "Firebase user identity is unavailable.",
        });
      }

      // --------------------------------------------------------
      // FIREBASE IDENTITY
      // --------------------------------------------------------

      const uid = normalizeString(firebaseUser.uid);

      const email = normalizeEmail(firebaseUser.email);

      if (!uid) {
        return res.status(401).json({
          success: false,
          code: "auth/firebase-uid-missing",
          message: "Firebase user UID is missing.",
        });
      }

      if (!email) {
        return res.status(401).json({
          success: false,
          code: "auth/firebase-email-missing",
          message: "Firebase account email is missing.",
        });
      }

      // --------------------------------------------------------
      // REQUEST DATA
      // --------------------------------------------------------

      const body = req.body || {};

      const clientName = normalizeString(body.name);

      const clientPhoto = normalizeString(body.photo || body.photoURL);

      const firebaseName = normalizeString(firebaseUser.name);

      const firebasePhoto = normalizeString(firebaseUser.picture);

      const name = (
        clientName ||
        firebaseName ||
        email.split("@")[0] ||
        "User"
      ).slice(0, 100);

      const photo = clientPhoto || firebasePhoto;

      const emailVerified = Boolean(firebaseUser.emailVerified);

      const provider = normalizeProvider(
        body.provider || firebaseUser.provider || "password",
      );

      const now = new Date();

      // --------------------------------------------------------
      // FIND EXISTING USER
      // --------------------------------------------------------

      const [userByUid, userByEmail] = await Promise.all([
        usersCollection.findOne({
          uid,
        }),

        usersCollection.findOne({
          email,
        }),
      ]);

      // --------------------------------------------------------
      // UID / EMAIL CONFLICT
      // --------------------------------------------------------

      if (
        userByUid &&
        userByEmail &&
        String(userByUid._id) !== String(userByEmail._id)
      ) {
        return res.status(409).json({
          success: false,
          code: "user/identity-conflict",
          message:
            "Authentication identity conflict. UID and email belong to different accounts.",
        });
      }

      const existingUser = userByUid || userByEmail;

      // ========================================================
      // EXISTING USER
      // ========================================================

      if (existingUser) {
        const existingUid = normalizeString(existingUser.uid);

        const existingEmail = normalizeEmail(existingUser.email);

        // ------------------------------------------------------
        // UID CONFLICT
        // ------------------------------------------------------

        if (existingUid && existingUid !== uid) {
          return res.status(409).json({
            success: false,
            code: "user/uid-conflict",
            message:
              "This email is already linked to another authentication account.",
          });
        }

        // ------------------------------------------------------
        // EMAIL CONFLICT
        // ------------------------------------------------------

        if (existingEmail && existingEmail !== email) {
          return res.status(409).json({
            success: false,
            code: "user/email-conflict",
            message: "This authentication account is linked to another email.",
          });
        }

        // ------------------------------------------------------
        // ACCOUNT STATUS
        // ------------------------------------------------------

        const existingStatus = normalizeStatus(existingUser.status);

        if (existingStatus === "blocked") {
          return res.status(403).json({
            success: false,
            code: "user/blocked",
            message: "Your account has been blocked.",
          });
        }

        // ------------------------------------------------------
        // PRESERVE ROLE
        // ------------------------------------------------------

        const existingRole = VALID_ROLES.includes(
          normalizeRole(existingUser.role),
        )
          ? normalizeRole(existingUser.role)
          : "user";

        // ------------------------------------------------------
        // UPDATE USER
        // ------------------------------------------------------

        const updateData = {
          uid,
          email,
          emailVerified,
          provider,
          role: existingRole,
          status: "active",
          updatedAt: now,
          lastLogin: now,
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

        // ------------------------------------------------------
        // LOAD UPDATED USER
        // ------------------------------------------------------

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
            message: "Unable to load synchronized user.",
          });
        }

        return res.status(200).json({
          success: true,
          code: "user/synchronized",
          message: "User synchronized successfully.",
          user: getSafeUser(updatedUser),
        });
      }

      // ========================================================
      // CREATE NEW USER
      // ========================================================

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

        lastLogin: now,
      };

      const result = await usersCollection.insertOne(newUser);

      if (!result?.acknowledged || !result?.insertedId) {
        return res.status(500).json({
          success: false,
          code: "user/create-failed",
          message: "Unable to create user account.",
        });
      }

      const createdUser = await usersCollection.findOne(
        {
          _id: result.insertedId,
        },
        {
          projection: userProjection,
        },
      );

      if (!createdUser) {
        return res.status(500).json({
          success: false,
          code: "user/load-failed",
          message: "User was created but could not be loaded.",
        });
      }

      return res.status(201).json({
        success: true,
        code: "user/created",
        message: "User created successfully.",
        user: getSafeUser(createdUser),
      });
    } catch (error) {
      console.error(
        "POST /users ERROR:",
        error?.stack || error?.message || error,
      );

      if (error?.code === 11000) {
        return res.status(409).json({
          success: false,
          code: "user/duplicate",
          message:
            "An account with this authentication identity already exists.",
        });
      }

      return res.status(500).json({
        success: false,
        code: "user/sync-failed",
        message: "Failed to synchronize user.",
      });
    }
  });

  // ==========================================================
  // GET /
  // ADMIN: GET USERS
  //
  // GET /users?page=1&limit=10&search=&sort=newest
  // ==========================================================

  router.get(
    "/",
    verifyToken,
    verifyUser(usersCollection),
    verifyAdmin,
    async (req, res) => {
      try {
        // ------------------------------------------------------
        // PAGINATION
        // ------------------------------------------------------

        let page = Number.parseInt(req.query.page, 10);

        let limit = Number.parseInt(req.query.limit, 10);

        page = Number.isFinite(page) && page > 0 ? page : 1;

        limit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 50) : 10;

        const skip = (page - 1) * limit;

        // ------------------------------------------------------
        // SEARCH
        // ------------------------------------------------------

        const search =
          typeof req.query.search === "string" ? req.query.search.trim() : "";

        const query = {};

        if (search) {
          const safeSearch = escapeRegex(search);

          query.$or = [
            {
              name: {
                $regex: safeSearch,
                $options: "i",
              },
            },
            {
              email: {
                $regex: safeSearch,
                $options: "i",
              },
            },
          ];
        }

        // ------------------------------------------------------
        // SORT
        // ------------------------------------------------------

        const sort =
          typeof req.query.sort === "string"
            ? req.query.sort.trim().toLowerCase()
            : "newest";

        const sortMap = {
          newest: {
            createdAt: -1,
          },

          oldest: {
            createdAt: 1,
          },

          name: {
            name: 1,
          },

          email: {
            email: 1,
          },

          role: {
            role: 1,
          },

          status: {
            status: 1,
          },
        };

        const sortOption = sortMap[sort] || sortMap.newest;

        // ------------------------------------------------------
        // DATABASE QUERY
        // ------------------------------------------------------

        const [users, total] = await Promise.all([
          usersCollection
            .find(query)
            .project(userProjection)
            .sort(sortOption)
            .skip(skip)
            .limit(limit)
            .toArray(),

          usersCollection.countDocuments(query),
        ]);

        const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

        // ------------------------------------------------------
        // RESPONSE
        // ------------------------------------------------------

        return res.status(200).json({
          success: true,

          data: users.map(getSafeUser),

          pagination: {
            page,
            limit,
            total,
            totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
          },
        });
      } catch (error) {
        console.error(
          "GET /users ERROR:",
          error?.stack || error?.message || error,
        );

        return res.status(500).json({
          success: false,
          code: "users/fetch-failed",
          message: "Failed to fetch users.",
        });
      }
    },
  );

  // ==========================================================
  // GET /:email
  // GET SINGLE USER
  //
  // Admin can access any user.
  // Normal user can access only their own account.
  // ==========================================================

  router.get(
    "/:email",
    verifyToken,
    verifyUser(usersCollection),
    async (req, res) => {
      try {
        const requestedEmail = normalizeEmail(req.params.email);

        if (!requestedEmail) {
          return res.status(400).json({
            success: false,
            code: "user/invalid-email",
            message: "Valid email is required.",
          });
        }

        const currentEmail = normalizeEmail(req.dbUser?.email);

        const currentRole = normalizeRole(req.dbUser?.role);

        // ------------------------------------------------------
        // AUTHORIZATION
        // ------------------------------------------------------

        if (currentRole !== "admin" && requestedEmail !== currentEmail) {
          return res.status(403).json({
            success: false,
            code: "user/access-denied",
            message: "You are not authorized to access this user.",
          });
        }

        // ------------------------------------------------------
        // FIND USER
        // ------------------------------------------------------

        const user = await usersCollection.findOne(
          {
            email: requestedEmail,
          },
          {
            projection: userProjection,
          },
        );

        if (!user) {
          return res.status(404).json({
            success: false,
            code: "user/not-found",
            message: "User not found.",
          });
        }

        return res.status(200).json({
          success: true,
          code: "user/found",
          user: getSafeUser(user),
        });
      } catch (error) {
        console.error(
          "GET /users/:email ERROR:",
          error?.stack || error?.message || error,
        );

        return res.status(500).json({
          success: false,
          code: "user/fetch-failed",
          message: "Failed to fetch user.",
        });
      }
    },
  );

  // ==========================================================
  // PATCH /:id/role
  // ADMIN: CHANGE USER ROLE
  // ==========================================================

  router.patch(
    "/:id/role",
    verifyToken,
    verifyUser(usersCollection),
    verifyAdmin,
    async (req, res) => {
      try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
          return res.status(400).json({
            success: false,
            code: "user/invalid-id",
            message: "Invalid user ID.",
          });
        }

        const role = normalizeRole(req.body?.role);

        if (!VALID_ROLES.includes(role)) {
          return res.status(400).json({
            success: false,
            code: "user/invalid-role",
            message: "Invalid role. Use user or admin.",
          });
        }

        const targetId = new ObjectId(id);

        const targetUser = await usersCollection.findOne({
          _id: targetId,
        });

        if (!targetUser) {
          return res.status(404).json({
            success: false,
            code: "user/not-found",
            message: "User not found.",
          });
        }

        // ------------------------------------------------------
        // PREVENT SELF ROLE CHANGE
        // ------------------------------------------------------

        const currentUid = normalizeString(req.dbUser?.uid);

        const targetUid = normalizeString(targetUser.uid);

        if (currentUid && targetUid && currentUid === targetUid) {
          return res.status(403).json({
            success: false,
            code: "user/self-role-change",
            message: "You cannot change your own role.",
          });
        }

        const result = await usersCollection.updateOne(
          {
            _id: targetId,
          },
          {
            $set: {
              role,
              updatedAt: new Date(),
            },
          },
        );

        const updatedUser = await usersCollection.findOne(
          {
            _id: targetId,
          },
          {
            projection: userProjection,
          },
        );

        if (!updatedUser) {
          return res.status(500).json({
            success: false,
            code: "user/load-failed",
            message: "Unable to load updated user.",
          });
        }

        return res.status(200).json({
          success: true,
          code: "user/role-updated",
          message: `User role changed to ${role}.`,
          modifiedCount: result.modifiedCount,
          user: getSafeUser(updatedUser),
        });
      } catch (error) {
        console.error(
          "PATCH /users/:id/role ERROR:",
          error?.stack || error?.message || error,
        );

        return res.status(500).json({
          success: false,
          code: "user/role-update-failed",
          message: "Failed to update user role.",
        });
      }
    },
  );

  // ==========================================================
  // PATCH /:id/status
  // ADMIN: CHANGE USER STATUS
  // ==========================================================

  router.patch(
    "/:id/status",
    verifyToken,
    verifyUser(usersCollection),
    verifyAdmin,
    async (req, res) => {
      try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
          return res.status(400).json({
            success: false,
            code: "user/invalid-id",
            message: "Invalid user ID.",
          });
        }

        const status = normalizeStatus(req.body?.status);

        if (!VALID_STATUSES.includes(status)) {
          return res.status(400).json({
            success: false,
            code: "user/invalid-status",
            message: "Invalid status. Use active or blocked.",
          });
        }

        const targetId = new ObjectId(id);

        const targetUser = await usersCollection.findOne({
          _id: targetId,
        });

        if (!targetUser) {
          return res.status(404).json({
            success: false,
            code: "user/not-found",
            message: "User not found.",
          });
        }

        // ------------------------------------------------------
        // PREVENT SELF STATUS CHANGE
        // ------------------------------------------------------

        const currentUid = normalizeString(req.dbUser?.uid);

        const targetUid = normalizeString(targetUser.uid);

        if (currentUid && targetUid && currentUid === targetUid) {
          return res.status(403).json({
            success: false,
            code: "user/self-status-change",
            message: "You cannot change your own status.",
          });
        }

        const result = await usersCollection.updateOne(
          {
            _id: targetId,
          },
          {
            $set: {
              status,
              updatedAt: new Date(),
            },
          },
        );

        const updatedUser = await usersCollection.findOne(
          {
            _id: targetId,
          },
          {
            projection: userProjection,
          },
        );

        if (!updatedUser) {
          return res.status(500).json({
            success: false,
            code: "user/load-failed",
            message: "Unable to load updated user.",
          });
        }

        return res.status(200).json({
          success: true,
          code: "user/status-updated",
          message: `User status changed to ${status}.`,
          modifiedCount: result.modifiedCount,
          user: getSafeUser(updatedUser),
        });
      } catch (error) {
        console.error(
          "PATCH /users/:id/status ERROR:",
          error?.stack || error?.message || error,
        );

        return res.status(500).json({
          success: false,
          code: "user/status-update-failed",
          message: "Failed to update user status.",
        });
      }
    },
  );

  // ==========================================================
  // DELETE /:id
  // ADMIN: DELETE USER
  // ==========================================================

  router.delete(
    "/:id",
    verifyToken,
    verifyUser(usersCollection),
    verifyAdmin,
    async (req, res) => {
      try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
          return res.status(400).json({
            success: false,
            code: "user/invalid-id",
            message: "Invalid user ID.",
          });
        }

        const targetId = new ObjectId(id);

        const targetUser = await usersCollection.findOne({
          _id: targetId,
        });

        if (!targetUser) {
          return res.status(404).json({
            success: false,
            code: "user/not-found",
            message: "User not found.",
          });
        }

        // ------------------------------------------------------
        // PREVENT SELF DELETE
        // ------------------------------------------------------

        const currentUid = normalizeString(req.dbUser?.uid);

        const targetUid = normalizeString(targetUser.uid);

        if (currentUid && targetUid && currentUid === targetUid) {
          return res.status(403).json({
            success: false,
            code: "user/self-delete",
            message: "You cannot delete your own account.",
          });
        }

        // ------------------------------------------------------
        // DELETE USER
        // ------------------------------------------------------

        const result = await usersCollection.deleteOne({
          _id: targetId,
        });

        if (result.deletedCount === 0) {
          return res.status(404).json({
            success: false,
            code: "user/delete-failed",
            message: "User was not deleted.",
          });
        }

        return res.status(200).json({
          success: true,
          code: "user/deleted",
          deletedCount: result.deletedCount,
          message: "User deleted successfully.",
        });
      } catch (error) {
        console.error(
          "DELETE /users/:id ERROR:",
          error?.stack || error?.message || error,
        );

        return res.status(500).json({
          success: false,
          code: "user/delete-failed",
          message: "Failed to delete user.",
        });
      }
    },
  );

  // ==========================================================
  // RETURN ROUTER
  // ==========================================================

  return router;
};

export default usersRoutes;
