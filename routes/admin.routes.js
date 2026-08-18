import { Router } from "express";

import verifyUser from "../middleware/verifyUser.js";

const adminRoutes = (
  ordersCollection,
  usersCollection,
  productsCollection,
  verifyToken,
  verifyAdmin,
) => {
  if (!ordersCollection) {
    throw new Error("adminRoutes: ordersCollection is required.");
  }

  if (!usersCollection) {
    throw new Error("adminRoutes: usersCollection is required.");
  }

  if (!productsCollection) {
    throw new Error("adminRoutes: productsCollection is required.");
  }

  if (!verifyToken) {
    throw new Error("adminRoutes: verifyToken middleware is required.");
  }

  if (!verifyAdmin) {
    throw new Error("adminRoutes: verifyAdmin middleware is required.");
  }

  const router = Router();

  // ============================================================
  // ADMIN AUTH MIDDLEWARE
  //
  // JWT Cookie
  //    ↓
  // verifyToken
  //    ↓
  // req.user
  //    ↓
  // verifyUser
  //    ↓
  // req.dbUser
  //    ↓
  // verifyAdmin
  //    ↓
  // Admin Route
  // ============================================================

  const requireAdmin = [verifyToken, verifyUser(usersCollection), verifyAdmin];

  // ============================================================
  // MONTHLY SALES
  // GET /admin/analytics/monthly-sales
  // ============================================================

  router.get("/analytics/monthly-sales", ...requireAdmin, async (req, res) => {
    try {
      const result = await ordersCollection
        .aggregate([
          {
            $match: {
              status: {
                $ne: "cancelled",
              },
            },
          },

          {
            $group: {
              _id: {
                year: {
                  $year: "$createdAt",
                },
                month: {
                  $month: "$createdAt",
                },
              },

              sales: {
                $sum: {
                  $ifNull: ["$grandTotal", 0],
                },
              },
            },
          },

          {
            $sort: {
              "_id.year": 1,
              "_id.month": 1,
            },
          },

          {
            $project: {
              _id: 0,

              month: {
                $concat: [
                  {
                    $toString: "$_id.year",
                  },
                  "-",
                  {
                    $cond: [
                      {
                        $lt: ["$_id.month", 10],
                      },
                      {
                        $concat: [
                          "0",
                          {
                            $toString: "$_id.month",
                          },
                        ],
                      },
                      {
                        $toString: "$_id.month",
                      },
                    ],
                  },
                ],
              },

              sales: {
                $round: ["$sales", 2],
              },
            },
          },
        ])
        .toArray();

      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error(
        "GET /admin/analytics/monthly-sales ERROR:",
        error?.stack || error,
      );

      return res.status(500).json({
        success: false,
        message: "Failed to load monthly sales.",
      });
    }
  });

  // ============================================================
  // TOP PRODUCTS
  // GET /admin/analytics/top-products
  // ============================================================

  router.get("/analytics/top-products", ...requireAdmin, async (req, res) => {
    try {
      const result = await ordersCollection
        .aggregate([
          {
            $match: {
              status: {
                $ne: "cancelled",
              },
            },
          },

          {
            $unwind: "$items",
          },

          {
            $group: {
              _id: "$items.productId",

              name: {
                $first: "$items.name",
              },

              sold: {
                $sum: {
                  $ifNull: ["$items.quantity", 0],
                },
              },

              revenue: {
                $sum: {
                  $ifNull: ["$items.subtotal", 0],
                },
              },
            },
          },

          {
            $sort: {
              sold: -1,
            },
          },

          {
            $limit: 5,
          },

          {
            $project: {
              _id: 0,

              productId: "$_id",

              name: 1,

              sold: 1,

              revenue: {
                $round: ["$revenue", 2],
              },
            },
          },
        ])
        .toArray();

      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error(
        "GET /admin/analytics/top-products ERROR:",
        error?.stack || error,
      );

      return res.status(500).json({
        success: false,
        message: "Failed to load top products.",
      });
    }
  });

  // ============================================================
  // DASHBOARD STATS
  // GET /admin/dashboard-stats
  // ============================================================

  router.get("/dashboard-stats", ...requireAdmin, async (req, res) => {
    try {
      const [totalUsers, totalProducts, totalOrders, revenueResult] =
        await Promise.all([
          usersCollection.countDocuments(),

          productsCollection.countDocuments(),

          ordersCollection.countDocuments(),

          ordersCollection
            .aggregate([
              {
                $match: {
                  status: {
                    $ne: "cancelled",
                  },
                },
              },

              {
                $group: {
                  _id: null,

                  totalRevenue: {
                    $sum: {
                      $ifNull: ["$grandTotal", 0],
                    },
                  },
                },
              },
            ])
            .toArray(),
        ]);

      const totalRevenue = Number(revenueResult[0]?.totalRevenue || 0);

      return res.status(200).json({
        success: true,

        stats: {
          totalUsers,
          totalProducts,
          totalOrders,

          totalRevenue: Number(totalRevenue.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("GET /admin/dashboard-stats ERROR:", error?.stack || error);

      return res.status(500).json({
        success: false,
        message: "Failed to load dashboard stats.",
      });
    }
  });

  // ============================================================
  // RECENT ORDERS
  // GET /admin/recent-orders
  // ============================================================

  router.get("/recent-orders", ...requireAdmin, async (req, res) => {
    try {
      const orders = await ordersCollection
        .find({})
        .project({
          items: 0,
          timeline: 0,
        })
        .sort({
          createdAt: -1,
        })
        .limit(10)
        .toArray();

      return res.status(200).json({
        success: true,
        data: orders,
      });
    } catch (error) {
      console.error("GET /admin/recent-orders ERROR:", error?.stack || error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch recent orders.",
      });
    }
  });

  // ============================================================
  // RETURN ROUTER
  // ============================================================

  return router;
};

export default adminRoutes;
