import { Hono } from "hono";
import { logger } from "hono/logger";
import medications from "../src/api/medications";

const app = new Hono();

app.use("*", logger());
app.route("/", medications);

export default app;
