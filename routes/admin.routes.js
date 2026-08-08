import { Router } from "express";

const adminRoutes = (
  ordersCollection,
  usersCollection,
  productsCollection,
  verifyToken,
  verifyAdmin,
) => {
  const router = Router();

  // ======================================================
  // MONTHLY SALES
  // GET /admin/analytics/monthly-sales
  // ======================================================

  router.get(
    "/analytics/monthly-sales",
    verifyToken,
    verifyAdmin,
    async (req, res) => {
      try {
        const result = await ordersCollection
          .aggregate([
            {
              $match: {
                status: { $ne: "cancelled" },
              },
            },
            {
              $group: {
                _id: {
                  year: { $year: "$createdAt" },
                  month: { $month: "$createdAt" },
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
                    { $toString: "$_id.year" },
                    "-",
                    {
                      $cond: [
                        { $lt: ["$_id.month", 10] },
                        {
                          $concat: ["0", { $toString: "$_id.month" }],
                        },
                        { $toString: "$_id.month" },
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
        console.error("MONTHLY SALES ERROR:", error);

        return res.status(500).json({
          success: false,
          message: "Failed to load monthly sales.",
        });
      }
    },
  );

  // ======================================================
  // TOP PRODUCTS
  // GET /admin/analytics/top-products
  // ======================================================

  router.get(
    "/analytics/top-products",
    verifyToken,
    verifyAdmin,
    async (req, res) => {
      try {
        const result = await ordersCollection
          .aggregate([
            {
              $match: {
                status: { $ne: "cancelled" },
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
        console.error("TOP PRODUCTS ERROR:", error);

        return res.status(500).json({
          success: false,
          message: "Failed to load top products.",
        });
      }
    },
  );

  // ======================================================
  // DASHBOARD STATS
  // GET /admin/dashboard-stats
  // ======================================================

  router.get("/dashboard-stats", verifyToken, verifyAdmin, async (req, res) => {
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
                  status: { $ne: "cancelled" },
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
      console.error("DASHBOARD STATS ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to load dashboard stats.",
      });
    }
  });

  // ======================================================
  // RECENT ORDERS
  // GET /admin/recent-orders
  // ======================================================

  router.get("/recent-orders", verifyToken, verifyAdmin, async (req, res) => {
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
      console.error("RECENT ORDERS ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch recent orders.",
      });
    }
  });

  return router;
};

export default adminRoutes;
