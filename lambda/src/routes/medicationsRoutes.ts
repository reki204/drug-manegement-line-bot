import { Hono } from "hono";
import { addMedication } from "../services/medicationService";
import { verifyLineIdToken } from "../utils/lineVerify";

const router = new Hono();

router.post("/", async (c) => {
  // AuthorizationヘッダーからIDトークンを取得
  const authHeader = c.req.header("Authorization");
  if (!authHeader) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const idToken = authHeader.replace("Bearer ", "");

  // IDトークン検証
  const userId = await verifyLineIdToken(idToken);
  if (!userId) {
    return c.json({ error: "Invalid token" }, 401);
  }

  const { name, scheduleTimes, intervalHours } = await c.req.json();
  if (!name) {
    return c.json({ error: "Missing required fields" }, 400);
  }

  try {
    await addMedication(userId, name, scheduleTimes || [], intervalHours || 0);

    return c.json({ message: `${name} を追加しました！` });
  } catch (error) {
    console.error("Error adding medication:", error);
    return c.json({ error: "薬の追加に失敗しました" }, 500);
  }
});

export default router;
