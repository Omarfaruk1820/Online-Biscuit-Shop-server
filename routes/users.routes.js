import { Router } from "express";
import verifyToken from "../middleware/verifyToken.js";
import verifyUser from "../middleware/verifyUser.js";
import verifyAdmin from "../middleware/verifyAdmin.js";
import cookieOptions from "../utils/cookieOptions.js";

const usersRoutes = (usersCollection) => {
  const router = Router();

  // ==========================
  // Save / Update User
  // ==========================

  router.post("/", async (req, res) => {
    try {
      const user = req.body;

      if (!user?.email) {
        return res.status(400).json({
          success: false,
          message: "Email is required.",
        });
      }

      const email = user.email.trim().toLowerCase();

      const filter = { email };

      const updateDoc = {
        $set: {
          name: user.name || "",
          email,
          photo: user.photo || "",
          provider: user.provider || "password",
          lastLogin: new Date(),
          updatedAt: new Date(),
        },
        $setOnInsert: {
          role: "user",
          status: "active",
          createdAt: new Date(),
        },
      };

      await usersCollection.updateOne(filter, updateDoc, {
        upsert: true,
      });

      return res.status(200).json({
        success: true,
        message: "User saved successfully.",
      });
    } catch (error) {
      console.error("POST /users:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to save user.",
      });
    }
  });

  // ==========================
  // JWT Login
  // ==========================

  router.post("/jwt", async (req, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({
          success: false,
          message: "Email is required.",
        });
      }

      const normalizedEmail = email.trim().toLowerCase();

      const user = await usersCollection.findOne({
        email: normalizedEmail,
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found.",
        });
      }

      if (user.status === "blocked") {
        return res.status(403).json({
          success: false,
          message: "Account blocked.",
        });
      }

      const token = createToken({
        email: normalizedEmail,
      });

      res.cookie("token", token, cookieOptions);

      return res.status(200).json({
        success: true,
        role: user.role,
        user: {
          name: user.name,
          email: user.email,
          role: user.role,
          photo: user.photo,
        },
      });
    } catch (error) {
      console.error("POST /users/jwt:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to generate token.",
      });
    }
  });

  // ==========================
  // Logout
  // ==========================

  router.post("/logout", (req, res) => {
    res.clearCookie("token", cookieOptions);

    return res.status(200).json({
      success: true,
      message: "Logout successful.",
    });
  });

  // ==========================
  // Get Single User
  // ==========================

  router.get("/:email", async (req, res) => {
    try {
      const email = req.params.email.trim().toLowerCase();

      const user = await usersCollection.findOne(
        { email },
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
      console.error(error);

      return res.status(500).json({
        success: false,
        message: "Server error.",
      });
    }
  });

  // ==========================
  // Get All Users
  // ==========================
  // "/",
  // verifyToken,
  // verifyAdmin(usersCollection),

  router.get(
    "/users",

    verifyToken,

    verifyUser(usersCollection),

    verifyAdmin,
    async (req, res) => {
      try {
        let { page = 1, limit = 10, search = "" } = req.query;

        page = Math.max(1, Number(page));
        limit = Math.min(50, Math.max(1, Number(limit)));

        const skip = (page - 1) * limit;

        const query = {};

        if (search.trim()) {
          query.email = {
            $regex: search.trim(),
            $options: "i",
          };
        }

        const users = await usersCollection
          .find(query)
          .project({
            password: 0,
          })
          .sort({
            createdAt: -1,
          })
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
        console.error(error);

        return res.status(500).json({
          success: false,
          message: "Failed to fetch users.",
        });
      }
    },
  );

  return router;
};

export default usersRoutes;
