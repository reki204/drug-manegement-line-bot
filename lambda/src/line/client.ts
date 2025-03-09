import { env } from "hono/adapter";
import * as line from "@line/bot-sdk";
import { Bindings } from "../types/Bindings";

export const createLineClient = (c: any) => {
  const { CHANNEL_ACCESS_TOKEN } = env<Bindings>(c);

  return new line.messagingApi.MessagingApiClient({
    channelAccessToken: CHANNEL_ACCESS_TOKEN,
  });
};
