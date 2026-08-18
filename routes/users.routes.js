import { Router } from "express";
import { ObjectId } from "mongodb";

import verifyFirebaseToken from "../middleware/verifyFirebaseToken.js";
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
  // HELPERS
  // ==========================================================

  const normalizeEmail = (email = "") => {
    return typeof email === "string" ? email.trim().toLowerCase() : "";
  };

  const isValidObjectId = (id) => {
    return typeof id === "string" && ObjectId.isValid(id);
  };

  const escapeRegex = (value = "") => {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  };

  const userProjection = {
    _id: 1,
    uid: 1,
    name: 1,
    email: 1,
    photo: 1,
    role: 1,
    status: 1,
    provider: 1,
    createdAt: 1,
    updatedAt: 1,
    lastLogin: 1,
  };

  // ==========================================================
  // POST /users
  //
  // Firebase authenticated user
  //        ↓
  // MongoDB create/update
  //
  // ==========================================================

  router.post("/", verifyFirebaseToken, async (req, res) => {
    try {
      // ========================================================
      // FIREBASE USER
      // ========================================================

      const firebaseUser = req.firebaseUser;

      if (!firebaseUser?.uid) {
        return res.status(401).json({
          success: false,
          message: "Firebase authentication failed.",
        });
      }

      const uid = String(firebaseUser.uid).trim();

      const email = normalizeEmail(firebaseUser.email);

      if (!email) {
        return res.status(400).json({
          success: false,
          message: "Firebase account email is missing.",
        });
      }

      // ========================================================
      // CLIENT PROFILE DATA
      // ========================================================

      const { name = "", photo = "" } = req.body || {};

      const cleanName =
        typeof name === "string" ? name.trim().slice(0, 100) : "";

      const cleanPhoto = typeof photo === "string" ? photo.trim() : "";

      // ========================================================
      // PROVIDER
      // ========================================================
      // Firebase verified identity is the source of truth.
      // Never trust provider sent by the client.

      const firebaseProvider =
        firebaseUser.providerData?.[0]?.providerId || "password";

      const allowedProviders = ["password", "google.com"];

      const provider = allowedProviders.includes(firebaseProvider)
        ? firebaseProvider
        : "password";

      // ========================================================
      // TIMESTAMP
      // ========================================================

      const now = new Date();

      // ========================================================
      // FIND USER BY UID
      // ========================================================

      const userByUid = await usersCollection.findOne({
        uid,
      });

      // ========================================================
      // FIND USER BY EMAIL
      // ========================================================

      const userByEmail = await usersCollection.findOne({
        email,
      });

      // ========================================================
      // IDENTITY CONFLICT
      // ========================================================
      // UID and email must belong to the same MongoDB user.

      if (
        userByUid &&
        userByEmail &&
        String(userByUid._id) !== String(userByEmail._id)
      ) {
        return res.status(409).json({
          success: false,
          message:
            "Authentication identity conflict. UID and email belong to different accounts.",
        });
      }

      // ========================================================
      // EXISTING USER
      // ========================================================

      const existingUser = userByUid || userByEmail;

      if (existingUser) {
        // ------------------------------------------------------
        // Existing UID belongs to another account
        // ------------------------------------------------------

        if (existingUser.uid && String(existingUser.uid).trim() !== uid) {
          return res.status(409).json({
            success: false,
            message:
              "This email is already linked to another authentication account.",
          });
        }

        // ------------------------------------------------------
        // Existing account status
        // ------------------------------------------------------

        const status =
          typeof existingUser.status === "string" && existingUser.status.trim()
            ? existingUser.status.trim().toLowerCase()
            : "active";

        if (status === "blocked") {
          return res.status(403).json({
            success: false,
            message: "Your account has been blocked.",
          });
        }

        // ------------------------------------------------------
        // Update user
        // ------------------------------------------------------

        const updateData = {
          uid,
          email,
          provider,
          updatedAt: now,
          lastLogin: now,
        };

        // Only update profile fields when values are available.

        if (cleanName) {
          updateData.name = cleanName;
        }

        if (cleanPhoto) {
          updateData.photo = cleanPhoto;
        }

        await usersCollection.updateOne(
          {
            _id: existingUser._id,
          },
          {
            $set: updateData,
          },
        );

        return res.status(200).json({
          success: true,
          message: "User synchronized successfully.",
        });
      }

      // ========================================================
      // CREATE NEW USER
      // ========================================================

      const newUser = {
        uid,

        name: cleanName,

        email,

        photo: cleanPhoto,

        provider,

        role: "user",

        status: "active",

        createdAt: now,

        updatedAt: now,

        lastLogin: now,
      };

      await usersCollection.insertOne(newUser);

      // ========================================================
      // SUCCESS
      // ========================================================

      return res.status(201).json({
        success: true,
        message: "User created successfully.",
      });
    } catch (error) {
      // ========================================================
      // DUPLICATE KEY
      // ========================================================

      if (error?.code === 11000) {
        return res.status(409).json({
          success: false,
          message:
            "An account with this authentication identity already exists.",
        });
      }

      // ========================================================
      // SERVER ERROR
      // ========================================================

      console.error(
        "POST /users ERROR:",
        error?.stack || error?.message || error,
      );

      return res.status(500).json({
        success: false,
        message: "Failed to synchronize user.",
      });
    }
  });

  // ==========================================================
  // GET /users
  // ADMIN ONLY
  // ==========================================================

  router.get(
    "/",
    verifyToken,
    verifyUser(usersCollection),
    verifyAdmin,
    async (req, res) => {
      try {
        let page = Number.parseInt(req.query.page, 10);

        let limit = Number.parseInt(req.query.limit, 10);

        page = Number.isFinite(page) && page > 0 ? page : 1;

        limit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 50) : 10;

        const skip = (page - 1) * limit;

        const search =
          typeof req.query.search === "string" ? req.query.search.trim() : "";

        const sort =
          typeof req.query.sort === "string" ? req.query.sort.trim() : "newest";

        const query = {};

        // ------------------------------------------------------
        // Search
        // ------------------------------------------------------

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
        // Sorting
        // ------------------------------------------------------

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
        // Query
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

        const totalPages = Math.ceil(total / limit);

        return res.status(200).json({
          success: true,

          data: users,

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
          message: "Failed to fetch users.",
        });
      }
    },
  );

  // ==========================================================
  // GET /users/:email
  //
  // Authenticated user can only access own profile.
  // Admin can access any user.
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
            message: "Valid email is required.",
          });
        }

        const currentEmail = normalizeEmail(req.dbUser?.email);

        const currentRole =
          typeof req.dbUser?.role === "string"
            ? req.dbUser.role.trim().toLowerCase()
            : "user";

        // ------------------------------------------------------
        // Non-admin can only access own account
        // ------------------------------------------------------

        if (currentRole !== "admin" && requestedEmail !== currentEmail) {
          return res.status(403).json({
            success: false,
            message: "You are not authorized to access this user.",
          });
        }

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
            message: "User not found.",
          });
        }

        return res.status(200).json({
          success: true,
          data: user,
        });
      } catch (error) {
        console.error(
          "GET /users/:email ERROR:",
          error?.stack || error?.message || error,
        );

        return res.status(500).json({
          success: false,
          message: "Failed to fetch user.",
        });
      }
    },
  );

  // ==========================================================
  // PATCH /users/:id/role
  // ADMIN ONLY
  // ==========================================================

  router.patch(
    "/:id/role",
    verifyToken,
    verifyUser(usersCollection),
    verifyAdmin,
    async (req, res) => {
      try {
        const { id } = req.params;

        const { role } = req.body || {};

        if (!isValidObjectId(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid user ID.",
          });
        }

        if (!["user", "admin"].includes(role)) {
          return res.status(400).json({
            success: false,
            message: "Invalid role.",
          });
        }

        const targetId = new ObjectId(id);

        const targetUser = await usersCollection.findOne({
          _id: targetId,
        });

        if (!targetUser) {
          return res.status(404).json({
            success: false,
            message: "User not found.",
          });
        }

        const currentEmail = normalizeEmail(req.dbUser?.email);

        if (currentEmail && normalizeEmail(targetUser.email) === currentEmail) {
          return res.status(403).json({
            success: false,
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

        return res.status(200).json({
          success: true,
          modifiedCount: result.modifiedCount,
          message: "User role updated successfully.",
        });
      } catch (error) {
        console.error(
          "PATCH /users/:id/role ERROR:",
          error?.stack || error?.message || error,
        );

        return res.status(500).json({
          success: false,
          message: "Failed to update user role.",
        });
      }
    },
  );

  // ==========================================================
  // PATCH /users/:id/status
  // ADMIN ONLY
  // ==========================================================

  router.patch(
    "/:id/status",
    verifyToken,
    verifyUser(usersCollection),
    verifyAdmin,
    async (req, res) => {
      try {
        const { id } = req.params;

        const { status } = req.body || {};

        if (!isValidObjectId(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid user ID.",
          });
        }

        if (!["active", "blocked"].includes(status)) {
          return res.status(400).json({
            success: false,
            message: "Invalid status.",
          });
        }

        const targetId = new ObjectId(id);

        const targetUser = await usersCollection.findOne({
          _id: targetId,
        });

        if (!targetUser) {
          return res.status(404).json({
            success: false,
            message: "User not found.",
          });
        }

        const currentEmail = normalizeEmail(req.dbUser?.email);

        if (currentEmail && normalizeEmail(targetUser.email) === currentEmail) {
          return res.status(403).json({
            success: false,
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

        return res.status(200).json({
          success: true,
          modifiedCount: result.modifiedCount,
          message: `User ${status} successfully.`,
        });
      } catch (error) {
        console.error(
          "PATCH /users/:id/status ERROR:",
          error?.stack || error?.message || error,
        );

        return res.status(500).json({
          success: false,
          message: "Failed to update user status.",
        });
      }
    },
  );

  // ==========================================================
  // DELETE /users/:id
  // ADMIN ONLY
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
            message: "User not found.",
          });
        }

        const currentEmail = normalizeEmail(req.dbUser?.email);

        if (currentEmail && normalizeEmail(targetUser.email) === currentEmail) {
          return res.status(403).json({
            success: false,
            message: "You cannot delete your own account.",
          });
        }

        const result = await usersCollection.deleteOne({
          _id: targetId,
        });

        if (result.deletedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "User was not deleted.",
          });
        }

        return res.status(200).json({
          success: true,

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
          message: "Failed to delete user.",
        });
      }
    },
  );

  return router;
};

export default usersRoutes;
