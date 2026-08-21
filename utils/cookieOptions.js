// utils/cookieOptions.js

const NODE_ENV = String(
  process.env.NODE_ENV || process.env.VERCEL_ENV || "development",
)
  .trim()
  .toLowerCase();

const isProduction = NODE_ENV === "production";

const cookieOptions = Object.freeze({
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? "none" : "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: "/",
});

export default cookieOptions;
