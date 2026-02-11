import "dotenv/config";
import express from "express";
import cors from "cors";
// @ts-ignore
import { transformHandler } from "./transform.ts";
// @ts-ignore
import { initDB } from "./db/database.ts";

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors({ origin: true }));
app.use(express.json());

app.post("/api/transform", transformHandler);

initDB();
app.listen(PORT, () => {
  console.log(`LearnEase backend running at http://localhost:${PORT}`);
});
