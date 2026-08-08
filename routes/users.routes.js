import { Router } from "express";
import { ObjectId } from "mongodb";

import verifyToken from "../middleware/verifyToken.js";
import verifyUser from "../middleware/verifyUser.js";
import verifyAdmin from "../middleware/verifyAdmin.js";

const usersRoutes = (usersCollection) => {
  const router = Router();

  // =========================
  // Helpers
  // =========================

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
    name: 1,
    email: 1,
    photo: 1,
    role: 1,
    status: 1,
    provider: 1,
    emailVerified: 1,
    createdAt: 1,
    updatedAt: 1,
    lastLogin: 1,
  };

  // =========================
  // POST /users
  // Register / Google Upsert
  // =========================

  router.post("/", async (req, res) => {
    try {
      const {
        name = "",
        email,
        photo = "",
        provider = "password",
        emailVerified = false,
      } = req.body || {};

      const normalizedEmail = normalizeEmail(email);

      if (!normalizedEmail) {
        return res.status(400).json({
          success: false,
          message: "Valid email is required.",
        });
      }

      if (!["password", "google.com"].includes(provider)) {
        return res.status(400).json({
          success: false,
          message: "Invalid authentication provider.",
        });
      }

      const now = new Date();

      const result = await usersCollection.updateOne(
        { email: normalizedEmail },
        {
          $set: {
            name: typeof name === "string" ? name.trim() : "",
            photo: typeof photo === "string" ? photo.trim() : "",
            provider,
            emailVerified: Boolean(emailVerified),
            updatedAt: now,
            lastLogin: now,
          },
          $setOnInsert: {
            email: normalizedEmail,
            role: "user",
            status: "active",
            createdAt: now,
          },
        },
        { upsert: true },
      );

      return res.status(result.upsertedCount ? 201 : 200).json({
        success: true,
        message: result.upsertedCount
          ? "User created successfully."
          : "User updated successfully.",
      });
    } catch (error) {
      console.error("POST /users ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to save user.",
      });
    }
  });

  // =========================
  // GET /users
  // Admin User List
  // =========================

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
          typeof req.query.sort === "string" ? req.query.sort : "newest";

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

        const sortMap = {
          newest: { createdAt: -1 },
          oldest: { createdAt: 1 },
          name: { name: 1 },
          email: { email: 1 },
          role: { role: 1 },
        };

        const sortOption = sortMap[sort] || sortMap.newest;

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
        console.error("GET /users ERROR:", error);

        return res.status(500).json({
          success: false,
          message: "Failed to fetch users.",
        });
      }
    },
  );

  // =========================
  // GET /users/:email
  // =========================

  router.get(
    "/:email",
    verifyToken,
    verifyUser(usersCollection),
    async (req, res) => {
      try {
        const email = normalizeEmail(req.params.email);

        if (!email) {
          return res.status(400).json({
            success: false,
            message: "Valid email is required.",
          });
        }

        const user = await usersCollection.findOne(
          { email },
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
        console.error("GET /users/:email ERROR:", error);

        return res.status(500).json({
          success: false,
          message: "Failed to fetch user.",
        });
      }
    },
  );

  // =========================
  // PATCH /users/:id/role
  // =========================

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
          { _id: targetId },
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
        console.error("PATCH /users/:id/role ERROR:", error);

        return res.status(500).json({
          success: false,
          message: "Failed to update user role.",
        });
      }
    },
  );

  // =========================
  // PATCH /users/:id/status
  // =========================

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
          { _id: targetId },
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
        console.error("PATCH /users/:id/status ERROR:", error);

        return res.status(500).json({
          success: false,
          message: "Failed to update user status.",
        });
      }
    },
  );

  // =========================
  // DELETE /users/:id
  // =========================

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
        console.error("DELETE /users/:id ERROR:", error);

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
