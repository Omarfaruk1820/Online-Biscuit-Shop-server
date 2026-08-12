import dotenv from "dotenv";

dotenv.config();

const requiredEnvVariables = [
  "DB_NAME",
  "DB_USERNAME",
  "DB_PASS",
  "JWT_SECRET",
];

for (const variable of requiredEnvVariables) {
  if (!process.env[variable]?.trim()) {
    throw new Error(`${variable} is missing from environment variables.`);
  }
}

export default process.env;
