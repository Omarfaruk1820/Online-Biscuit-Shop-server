import { initializeApp, getApps, cert } from "firebase-admin/app";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const serviceAccount = require("./serviceAccountKey.json");

const firebaseApp = getApps().length
  ? getApps()[0]
  : initializeApp({
      credential: cert(serviceAccount),
    });

export default firebaseApp;
