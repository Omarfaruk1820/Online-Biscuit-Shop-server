// ======================================================
// routes/users.routes.js
// Part 1
// Imports, Router, Helper Functions, POST /users
// ======================================================

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

      // ------------------------------
      // Email Validation
      // ------------------------------

      if (!email || typeof email !== "string") {
        return res.status(400).json({
          success: false,
          message: "Valid email is required.",
        });
      }

      const normalizedEmail = normalizeEmail(email);



      const existingUser = await usersCollection.findOne({
        email: normalizedEmail,
      });

      // ------------------------------
      // Existing User → Update
      // ------------------------------

      if (existingUser) {
        await usersCollection.updateOne(
          { email: normalizedEmail },
          {
            $set: {
              name: name.trim(),
              photo,
              provider,
              emailVerified,
              lastLogin: new Date(),
              updatedAt: new Date(),
            },
          },
        );

        return res.status(200).json({
          success: true,
          message: "User updated successfully.",
        });
      }

      // ------------------------------
      // New User → Insert
      // ------------------------------

      const newUser = {
        name: name.trim(),
        email: normalizedEmail,
        photo,
        provider,
        emailVerified,

        role: "user",
        status: "active",

        createdAt: new Date(),
        updatedAt: new Date(),
        lastLogin: new Date(),
      };

      const result = await usersCollection.insertOne(newUser);

      return res.status(201).json({
        success: true,
        message: "User created successfully.",
        insertedId: result.insertedId,
      });
    } catch (error) {
      console.error("POST /users:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to save user.",
      });
    }
  });

  // ======================================================
  // Part 2 starts below...
  // ======================================================
  // ======================================================
  // GET /users
  // Admin Only
  // Pagination + Search + Sorting
  // ======================================================

  router.get(
    "/",
    verifyToken,
    // verifyUser(usersCollection),
    // verifyAdmin,
    async (req, res) => {
      try {
        let { page = 1, limit = 10, search = "", sort = "newest" } = req.query;

        page = Number(page);
        limit = Number(limit);

        if (Number.isNaN(page) || page < 1) page = 1;
        if (Number.isNaN(limit) || limit < 1) limit = 10;

        limit = Math.min(limit, 50);

        const skip = (page - 1) * limit;

        const query = {};

        // ==========================================
        // Search
        // ==========================================

        if (typeof search === "string" && search.trim()) {
          const keyword = search.trim();

          query.$or = [
            {
              name: {
                $regex: keyword,
                $options: "i",
              },
            },
            {
              email: {
                $regex: keyword,
                $options: "i",
              },
            },
          ];
        }

        // ==========================================
        // Sorting
        // ==========================================

        let sortOption = {
          createdAt: -1,
        };

        switch (sort) {
          case "oldest":
            sortOption = {
              createdAt: 1,
            };
            break;

          case "name":
            sortOption = {
              name: 1,
            };
            break;

          case "email":
            sortOption = {
              email: 1,
            };
            break;

          case "role":
            sortOption = {
              role: 1,
            };
            break;

          default:
            sortOption = {
              createdAt: -1,
            };
        }

        // ==========================================
        // Get Users
        // ==========================================

        const users = await usersCollection
          .find(query)
          .project({
            password: 0,
          })
          .sort(sortOption)
          .skip(skip)
          .limit(limit)
          .toArray();

        const total = await usersCollection.countDocuments(query);

        return res.status(200).json({
          success: true,

          page,

          limit,

          total,

          totalPages: Math.ceil(total / limit),

          data: users,
        });
      } catch (error) {
        console.error("GET /users:", error);

        return res.status(500).json({
          success: false,
          message: "Failed to fetch users.",
        });
      }
    },
  );

  // ======================================================
  // GET /users/:email
  // Get Single User
  // ======================================================

  router.get(
    "/:email",
    verifyToken,
    verifyUser(usersCollection),
    async (req, res) => {
      try {
        const email = normalizeEmail(req.params.email);

        const user = await usersCollection.findOne(
          {
            email,
          },
          {
            projection: {
              password: 0,
            },
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
        console.error("GET /users/:email:", error);

        return res.status(500).json({
          success: false,
          message: "Failed to fetch user.",
        });
      }
    },
  );

  // ======================================================
  // Part 3 starts below...
  // ======================================================
  // ======================================================
  // PATCH /users/:id/role
  // Admin Only
  // Change User Role
  // ======================================================

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

  // ======================================================
  // PATCH /users/:id/status
  // Admin Only
  // Block / Unblock User
  // ======================================================

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

  // ======================================================
  // DELETE /users/:id
  // Admin Only
  // Delete User
  // ======================================================

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

  // ======================================================
  // Export Router
  // ======================================================

  return router;
};

export default usersRoutes;
