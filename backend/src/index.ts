import express from "express";
import cors from "cors";
import { transformHandler } from "./transform.js";

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors({ origin: true }));
app.use(express.json());

app.post("/api/transform", transformHandler);

app.listen(PORT, () => {
  console.log(`LearnEase backend running at http://localhost:${PORT}`);
});
