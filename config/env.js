import dotenv from "dotenv";

dotenv.config();

const requiredEnvVariables = [
  "DB_NAME",
  "DB_USERNAME",
  "DB_PASS",
  "JWT_SECRET",
  "CLIENT_URL",
  "CLIENT_URL_PROD",
];

const missingEnvVariables = requiredEnvVariables.filter((variable) => {
  const value = process.env[variable];

  return typeof value !== "string" || !value.trim();
});

if (missingEnvVariables.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missingEnvVariables.join(", ")}`,
  );
}

export default process.env;
