import { Router } from "express";

import createToken from "../middleware/createToken.js";
import verifyToken from "../middleware/verifyToken.js";
import verifyUser from "../middleware/verifyUser.js";

import cookieOptions from "../utils/cookieOptions.js";

const authRoutes = (usersCollection) => {
  const router = Router();

  // ======================================================
  // POST /auth/jwt
  // Create Application JWT
  // ======================================================

  router.post("/jwt", async (req, res) => {
    try {
      // --------------------------------------------------
      // Validate Request
      // --------------------------------------------------

      const email =
        typeof req.body?.email === "string"
          ? req.body.email.trim().toLowerCase()
          : "";

      if (!email) {
        return res.status(400).json({
          success: false,
          message: "Valid email is required.",
        });
      }

      // --------------------------------------------------
      // Find User
      // --------------------------------------------------

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
            provider: 1,
            status: 1,
            emailVerified: 1,
            createdAt: 1,
            updatedAt: 1,
            lastLogin: 1,
          },
        },
      );

      // --------------------------------------------------
      // User Not Found
      // --------------------------------------------------

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found.",
        });
      }

      // --------------------------------------------------
      // Account Status
      // --------------------------------------------------

      if (user.status === "blocked") {
        return res.status(403).json({
          success: false,
          message: "Your account has been blocked.",
        });
      }

      // --------------------------------------------------
      // Create JWT
      // --------------------------------------------------

      const token = createToken({
        email: user.email,
      });

      if (!token) {
        return res.status(500).json({
          success: false,
          message: "Failed to create authentication token.",
        });
      }

      // --------------------------------------------------
      // Set Secure Cookie
      // --------------------------------------------------

      res.cookie("token", token, cookieOptions);

      // --------------------------------------------------
      // Response
      // --------------------------------------------------

      return res.status(200).json({
        success: true,
        message: "Login successful.",

        user: {
          _id: user._id,
          name: user.name || "",
          email: user.email,
          photo: user.photo || "",
          role: user.role || "user",
          provider: user.provider || "password",
          status: user.status || "active",
        },
      });
    } catch (error) {
      console.error("POST /auth/jwt ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to authenticate user.",
      });
    }
  });

  // ======================================================
  // POST /auth/logout
  // Clear JWT Cookie
  // ======================================================

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
      console.error("POST /auth/logout ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Logout failed.",
      });
    }
  });

  // ======================================================
  // GET /auth/me
  // Get Currently Authenticated User
  // ======================================================

  router.get(
    "/me",
    verifyToken,
    verifyUser(usersCollection),
    async (req, res) => {
      try {
        const user = req.dbUser;

        // ------------------------------------------------
        // Safety Check
        // ------------------------------------------------

        if (!user) {
          return res.status(404).json({
            success: false,
            message: "User not found.",
          });
        }

        // ------------------------------------------------
        // Blocked Account Check
        // ------------------------------------------------

        if (user.status === "blocked") {
          return res.status(403).json({
            success: false,
            message: "Your account has been blocked.",
          });
        }

        // ------------------------------------------------
        // Response
        // ------------------------------------------------

        return res.status(200).json({
          success: true,

          user: {
            _id: user._id,
            name: user.name || "",
            email: user.email,
            photo: user.photo || "",
            role: user.role || "user",
            provider: user.provider || "password",
            status: user.status || "active",
            emailVerified: Boolean(user.emailVerified),
            createdAt: user.createdAt || null,
            updatedAt: user.updatedAt || null,
            lastLogin: user.lastLogin || null,
          },
        });
      } catch (error) {
        console.error("GET /auth/me ERROR:", error);

        return res.status(500).json({
          success: false,
          message: "Failed to fetch authenticated user.",
        });
      }
    },
  );

  // ======================================================
  // RETURN ROUTER
  // ======================================================

  return router;
};

export default authRoutes;
