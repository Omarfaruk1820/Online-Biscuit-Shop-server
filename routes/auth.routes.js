import { Router } from "express";

import createToken from "../middleware/createToken.js";
import verifyToken from "../middleware/verifyToken.js";
import verifyUser from "../middleware/verifyUser.js";

import cookieOptions from "../utils/cookieOptions.js";

const authRoutes = (usersCollection) => {
  const router = Router();

  // ==========================================
  // POST /auth/jwt
  // Create JWT Cookie
  // ==========================================

  router.post("/jwt", async (req, res) => {
    try {
      const { email } = req.body;

      if (!email || typeof email !== "string") {
        return res.status(400).json({
          success: false,
          message: "Valid email is required.",
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
          message: "Your account has been blocked.",
        });
      }

      const token = createToken({
        email: normalizedEmail,
      });

      res.cookie("token", token, cookieOptions);

      return res.status(200).json({
        success: true,
        message: "Login successful.",
        role: user.role,
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          photo: user.photo,
          role: user.role,
        },
      });
    } catch (error) {
      console.error("POST /auth/jwt:", error);

      return res.status(500).json({
        success: false,
        message: "Internal server error.",
      });
    }
  });

  // ==========================================
  // POST /auth/logout
  // ==========================================

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
      console.error("POST /auth/logout:", error);

      return res.status(500).json({
        success: false,
        message: "Logout failed.",
      });
    }
  });

  // ==========================================
  // GET /auth/me
  // Logged In User
  // ==========================================

  router.get(
    "/me",
    verifyToken,
    verifyUser(usersCollection),
    async (req, res) => {
      try {
        const user = req.dbUser;

        return res.status(200).json({
          success: true,
          user: {
            _id: user._id,
            name: user.name,
            email: user.email,
            photo: user.photo,
            role: user.role,
            provider: user.provider,
            status: user.status,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
            lastLogin: user.lastLogin,
          },
        });
      } catch (error) {
        console.error("GET /auth/me:", error);

        return res.status(500).json({
          success: false,
          message: "Failed to fetch user.",
        });
      }
    },
  );

  return router;
};

export default authRoutes;
