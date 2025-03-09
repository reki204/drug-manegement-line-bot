import { Hono } from "hono";
import { addMedication } from "../services/medicationService";

const router = new Hono();

router.post("/addMedication", async (c) => {
  const { userId, name, scheduleTimes, intervalHours } = await c.req.json();
  if (!userId || !name) {
    return c.json({ error: "Missing required fields" }, 400);
  }
  await addMedication(userId, name, scheduleTimes, intervalHours);
  return c.json({ message: `${name} を追加しました！` });
});

export default router;
