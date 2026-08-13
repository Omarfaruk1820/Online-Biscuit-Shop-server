import { cert, getApps, initializeApp } from "firebase-admin/app";

const projectId = process.env.FIREBASE_PROJECT_ID?.trim();

const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim().replace(
  /^["']|["']$/g,
  "",
);

const privateKey = process.env.FIREBASE_PRIVATE_KEY?.trim()
  .replace(/^["']|["']$/g, "")
  .replace(/\\n/g, "\n");

if (!projectId) {
  throw new Error("FIREBASE_PROJECT_ID environment variable is missing.");
}

if (!clientEmail) {
  throw new Error("FIREBASE_CLIENT_EMAIL environment variable is missing.");
}

if (!privateKey) {
  throw new Error("FIREBASE_PRIVATE_KEY environment variable is missing.");
}

if (
  !privateKey.includes("-----BEGIN PRIVATE KEY-----") ||
  !privateKey.includes("-----END PRIVATE KEY-----")
) {
  throw new Error(
    "FIREBASE_PRIVATE_KEY is invalid. It must contain a valid PEM private key.",
  );
}

const firebaseApp =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });

export default firebaseApp;
