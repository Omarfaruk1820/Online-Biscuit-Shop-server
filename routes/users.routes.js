import { Router } from "express";
import { ObjectId } from "mongodb";

import verifyToken from "../middleware/verifyToken.js";
import verifyUser from "../middleware/verifyUser.js";
import verifyAdmin from "../middleware/verifyAdmin.js";

const usersRoutes = (usersCollection) => {
  const router = Router();

  const normalizeEmail = (email = "") => email.trim().toLowerCase();

  const isValidObjectId = (id) => ObjectId.isValid(id);

 router.post("/", async (req, res) => {
  try {
    const {
      name = "",
      email,
      photo = "",
      provider = "password",
      emailVerified = false,
    } = req.body;

    // =====================================
    // Validate Email
    // =====================================

    if (!email || typeof email !== "string") {
      return res.status(400).json({
        success: false,
        message: "Valid email is required.",
      });
    }

    const normalizedEmail = normalizeEmail(email);

    const now = new Date();

    // =====================================
    // Upsert User
    // =====================================

    const result = await usersCollection.updateOne(
      {
        email: normalizedEmail,
      },
      {
        $set: {
          name: (name || "").trim(),
          photo: photo || "",
          provider:
            provider === "google.com"
              ? "google.com"
              : "password",
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
      {
        upsert: true,
      }
    );

    return res.status(
      result.upsertedCount ? 201 : 200
    ).json({
      success: true,

      message: result.upsertedCount
        ? "User created successfully."
        : "User updated successfully.",
    });
  } catch (error) {
    console.error("POST /users:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to save user.",
    });
  }
});

 router.get(
  "/",
  verifyToken,
  verifyAdmin,
  async (req, res) => {
    try {
      // =====================================
      // Pagination
      // =====================================

      let page = Number.parseInt(req.query.page, 10) || 1;
      let limit = Number.parseInt(req.query.limit, 10) || 10;

      page = Math.max(page, 1);
      limit = Math.min(Math.max(limit, 1), 50);

      const skip = (page - 1) * limit;

      // =====================================
      // Search
      // =====================================

      const search = req.query.search?.trim() || "";

      const query = {};

      if (search) {
        query.$or = [
          {
            name: {
              $regex: search,
              $options: "i",
            },
          },
          {
            email: {
              $regex: search,
              $options: "i",
            },
          },
        ];
      }

      // =====================================
      // Sort
      // =====================================

      const sortMap = {
        newest: { createdAt: -1 },
        oldest: { createdAt: 1 },
        name: { name: 1 },
        email: { email: 1 },
        role: { role: 1 },
      };

      const sortOption =
        sortMap[req.query.sort] || sortMap.newest;

      // =====================================
      // Query
      // =====================================

      const [users, total] = await Promise.all([
        usersCollection
          .find(query)
          .project({
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
          })
          .sort(sortOption)
          .skip(skip)
          .limit(limit)
          .toArray(),

        usersCollection.countDocuments(query),
      ]);

      return res.status(200).json({
        success: true,

        page,

        limit,

        total,

        totalPages: Math.ceil(total / limit),

        hasNextPage: page * limit < total,

        hasPrevPage: page > 1,

        data: users,
      });
    } catch (error) {
      console.error("GET /users:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch users.",
      });
    }
  }
);

 router.get(
  "/:email",
  verifyToken,
  verifyUser(usersCollection),
  async (req, res) => {
    try {
      // =====================================
      // Normalize & Validate Email
      // =====================================

      const email = normalizeEmail(req.params.email);

      if (!email) {
        return res.status(400).json({
          success: false,
          message: "Valid email is required.",
        });
      }

      // =====================================
      // Find User
      // =====================================

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
            status: 1,
            provider: 1,
            emailVerified: 1,
            createdAt: 1,
            updatedAt: 1,
            lastLogin: 1,
          },
        }
      );

      // =====================================
      // Not Found
      // =====================================

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found.",
        });
      }

      // =====================================
      // Response
      // =====================================

      return res.status(200).json({
        success: true,
        data: user,
      });
    } catch (error) {
      console.error("GET /users/:email:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch user.",
      });
    }
  }
);

  router.patch(
    "/:id/role",
    verifyToken,
    verifyUser(usersCollection),
    verifyAdmin,
    async (req, res) => {
      try {
        const { id } = req.params;
        const { role } = req.body;

        if (!isValidObjectId(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid user id.",
          });
        }

        const allowedRoles = ["user", "admin"];

        if (!allowedRoles.includes(role)) {
          return res.status(400).json({
            success: false,
            message: "Invalid role.",
          });
        }

        const targetUser = await usersCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!targetUser) {
          return res.status(404).json({
            success: false,
            message: "User not found.",
          });
        }

        // Prevent changing own role
        if (targetUser.email === req.dbUser.email) {
          return res.status(403).json({
            success: false,
            message: "You cannot change your own role.",
          });
        }

        await usersCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              role,
              updatedAt: new Date(),
            },
          },
        );

        return res.status(200).json({
          success: true,
          message: "User role updated successfully.",
        });
      } catch (error) {
        console.error("PATCH /users/:id/role:", error);

        return res.status(500).json({
          success: false,
          message: "Failed to update user role.",
        });
      }
    },
  );

  router.patch(
    "/:id/status",
    verifyToken,
    verifyUser(usersCollection),
    verifyAdmin,
    async (req, res) => {
      try {
        const { id } = req.params;
        const { status } = req.body;

        if (!isValidObjectId(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid user id.",
          });
        }

        const allowedStatus = ["active", "blocked"];

        if (!allowedStatus.includes(status)) {
          return res.status(400).json({
            success: false,
            message: "Invalid status.",
          });
        }

        const targetUser = await usersCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!targetUser) {
          return res.status(404).json({
            success: false,
            message: "User not found.",
          });
        }

        // Prevent blocking own account
        if (targetUser.email === req.dbUser.email) {
          return res.status(403).json({
            success: false,
            message: "You cannot block your own account.",
          });
        }

        await usersCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              status,
              updatedAt: new Date(),
            },
          },
        );

        return res.status(200).json({
          success: true,
          message: `User ${status} successfully.`,
        });
      } catch (error) {
        console.error("PATCH /users/:id/status:", error);

        return res.status(500).json({
          success: false,
          message: "Failed to update user status.",
        });
      }
    },
  );

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
            message: "Invalid user id.",
          });
        }

        const targetUser = await usersCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!targetUser) {
          return res.status(404).json({
            success: false,
            message: "User not found.",
          });
        }

        // Prevent deleting own account
        if (targetUser.email === req.dbUser.email) {
          return res.status(403).json({
            success: false,
            message: "You cannot delete your own account.",
          });
        }

        await usersCollection.deleteOne({
          _id: new ObjectId(id),
        });

        return res.status(200).json({
          success: true,
          message: "User deleted successfully.",
        });
      } catch (error) {
        console.error("DELETE /users/:id:", error);

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
