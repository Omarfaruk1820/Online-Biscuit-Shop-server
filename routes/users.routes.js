import { Router } from "express";
import { ObjectId } from "mongodb";

import verifyFirebaseToken from "../middleware/verifyFirebaseToken.js";
import verifyToken from "../middleware/verifyToken.js";
import verifyUser from "../middleware/verifyUser.js";
import verifyAdmin from "../middleware/verifyAdmin.js";

const usersRoutes = (usersCollection) => {
  if (!usersCollection) {
    throw new Error("usersRoutes requires usersCollection.");
  }

  const router = Router();

  const VALID_ROLES = ["user", "admin"];
  const VALID_STATUSES = ["active", "blocked"];

  const normalizeString = (value = "") => {
    return typeof value === "string" ? value.trim() : "";
  };

  const normalizeEmail = (email = "") => {
    return normalizeString(email).toLowerCase();
  };

  const normalizeRole = (role = "") => {
    return normalizeString(role).toLowerCase();
  };

  const normalizeStatus = (status = "") => {
    return normalizeString(status).toLowerCase();
  };

  const normalizeProvider = (provider = "") => {
    const value = normalizeString(provider).toLowerCase();

    return value === "google.com" ? "google.com" : "password";
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
    emailVerified: 1,
    role: 1,
    status: 1,
    provider: 1,
    createdAt: 1,
    updatedAt: 1,
    lastLogin: 1,
  };

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

  // ============================================================
  // CREATE / SYNC USER
  // POST /users
  // ============================================================

  router.post("/", verifyFirebaseToken, async (req, res) => {
    try {
      const firebaseUser = req.firebaseUser;

      if (!firebaseUser?.uid) {
        return res.status(401).json({
          success: false,
          message: "Firebase authentication failed.",
        });
      }

      const uid = normalizeString(firebaseUser.uid);
      const email = normalizeEmail(firebaseUser.email);

      if (!uid) {
        return res.status(401).json({
          success: false,
          message: "Firebase user UID is missing.",
        });
      }

      if (!email) {
        return res.status(400).json({
          success: false,
          message: "Firebase account email is missing.",
        });
      }

      const body = req.body || {};

      const clientName = normalizeString(body.name);

      const clientPhoto = normalizeString(body.photoURL || body.photo);

      const firebaseName = normalizeString(
        firebaseUser.name || firebaseUser.displayName,
      );

      const firebasePhoto = normalizeString(
        firebaseUser.picture || firebaseUser.photoURL,
      );

      const name = (
        clientName ||
        firebaseName ||
        email.split("@")[0] ||
        "User"
      ).slice(0, 100);

      const photo = clientPhoto || firebasePhoto;

      const emailVerified = Boolean(
        firebaseUser.email_verified ?? firebaseUser.emailVerified,
      );

      const firebaseProvider =
        firebaseUser.providerData?.[0]?.providerId || "password";

      const provider = normalizeProvider(firebaseProvider);

      const now = new Date();

      const [userByUid, userByEmail] = await Promise.all([
        usersCollection.findOne({ uid }),
        usersCollection.findOne({ email }),
      ]);

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

      const existingUser = userByUid || userByEmail;

      if (existingUser) {
        if (existingUser.uid && normalizeString(existingUser.uid) !== uid) {
          return res.status(409).json({
            success: false,
            message:
              "This email is already linked to another authentication account.",
          });
        }

        const existingStatus = normalizeStatus(existingUser.status);

        if (existingStatus === "blocked") {
          return res.status(403).json({
            success: false,
            message: "Your account has been blocked.",
          });
        }

        const existingRole = VALID_ROLES.includes(
          normalizeRole(existingUser.role),
        )
          ? normalizeRole(existingUser.role)
          : "user";

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
          { _id: existingUser._id },
          { $set: updateData },
        );

        const updatedUser = await usersCollection.findOne(
          { _id: existingUser._id },
          { projection: userProjection },
        );

        return res.status(200).json({
          success: true,
          message: "User synchronized successfully.",
          user: getSafeUser(updatedUser),
        });
      }

      const newUser = {
        uid,
        name,
        email,
        photo,
        emailVerified,
        provider,
        role: "user",
        status: "active",
        createdAt: now,
        updatedAt: now,
        lastLogin: now,
      };

      const result = await usersCollection.insertOne(newUser);

      if (!result.insertedId) {
        return res.status(500).json({
          success: false,
          message: "Unable to create user account.",
        });
      }

      const createdUser = await usersCollection.findOne(
        { _id: result.insertedId },
        { projection: userProjection },
      );

      return res.status(201).json({
        success: true,
        message: "User created successfully.",
        user: getSafeUser(createdUser),
      });
    } catch (error) {
      if (error?.code === 11000) {
        return res.status(409).json({
          success: false,
          message:
            "An account with this authentication identity already exists.",
        });
      }

      console.error("POST /users ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to synchronize user.",
      });
    }
  });

  // ============================================================
  // GET ALL USERS
  // GET /users
  // ADMIN ONLY
  // ============================================================

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
          typeof req.query.sort === "string"
            ? req.query.sort.trim().toLowerCase()
            : "newest";

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
          status: { status: 1 },
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

        const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

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
        console.error("GET /users ERROR:", error);

        return res.status(500).json({
          success: false,
          message: "Failed to fetch users.",
        });
      }
    },
  );

  // ============================================================
  // GET USER BY EMAIL
  // GET /users/:email
  // ============================================================

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
        const currentRole = normalizeRole(req.dbUser?.role);

        if (currentRole !== "admin" && requestedEmail !== currentEmail) {
          return res.status(403).json({
            success: false,
            message: "You are not authorized to access this user.",
          });
        }

        const user = await usersCollection.findOne(
          { email: requestedEmail },
          { projection: userProjection },
        );

        if (!user) {
          return res.status(404).json({
            success: false,
            message: "User not found.",
          });
        }

        return res.status(200).json({
          success: true,
          user: getSafeUser(user),
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

  // ============================================================
  // CHANGE USER ROLE
  // PATCH /users/:id/role
  // ADMIN ONLY
  // ============================================================

  router.patch(
    "/:id/role",
    verifyToken,
    verifyUser(usersCollection),
    verifyAdmin,
    async (req, res) => {
      try {
        const { id } = req.params;
        const role = normalizeRole(req.body?.role);

        if (!isValidObjectId(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid user ID.",
          });
        }

        if (!VALID_ROLES.includes(role)) {
          return res.status(400).json({
            success: false,
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
            message: "User not found.",
          });
        }

        const currentEmail = normalizeEmail(req.dbUser?.email);
        const targetEmail = normalizeEmail(targetUser.email);

        if (currentEmail && currentEmail === targetEmail) {
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

        const updatedUser = await usersCollection.findOne(
          { _id: targetId },
          { projection: userProjection },
        );

        return res.status(200).json({
          success: true,
          message: `User role changed to ${role}.`,
          modifiedCount: result.modifiedCount,
          user: getSafeUser(updatedUser),
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

  // ============================================================
  // CHANGE USER STATUS
  // PATCH /users/:id/status
  // ADMIN ONLY
  // ============================================================

  router.patch(
    "/:id/status",
    verifyToken,
    verifyUser(usersCollection),
    verifyAdmin,
    async (req, res) => {
      try {
        const { id } = req.params;
        const status = normalizeStatus(req.body?.status);

        if (!isValidObjectId(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid user ID.",
          });
        }

        if (!VALID_STATUSES.includes(status)) {
          return res.status(400).json({
            success: false,
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
            message: "User not found.",
          });
        }

        const currentEmail = normalizeEmail(req.dbUser?.email);
        const targetEmail = normalizeEmail(targetUser.email);

        if (currentEmail && currentEmail === targetEmail) {
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

        const updatedUser = await usersCollection.findOne(
          { _id: targetId },
          { projection: userProjection },
        );

        return res.status(200).json({
          success: true,
          message: `User status changed to ${status}.`,
          modifiedCount: result.modifiedCount,
          user: getSafeUser(updatedUser),
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

  // ============================================================
  // DELETE USER
  // DELETE /users/:id
  // ADMIN ONLY
  // ============================================================

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
        const targetEmail = normalizeEmail(targetUser.email);

        if (currentEmail && currentEmail === targetEmail) {
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
