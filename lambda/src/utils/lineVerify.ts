/**
 * LINEのVerify APIを使ってIDトークンを検証し、ユーザーID(sub)を返す
 * @param idToken IDトークン
 * @returns ユーザーID
 */
export const verifyLineIdToken = async (
  idToken: string
): Promise<string | null> => {
  try {
    const verifyEndpoint = "https://api.line.me/oauth2/v2.1/verify";

    const requestBody = new URLSearchParams({
      id_token: idToken,
      client_id: process.env.CHANNEL_ID!,
    });

    const response = await fetch(verifyEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: requestBody,
    });

    if (!response.ok) {
      console.error("LINE Verify API returned non-OK status:", response.status);
      return null;
    }

    const data = await response.json();

    if (data.error) {
      console.error("LINE Verify API error:", data);
      return null;
    }

    return data.sub;
  } catch (error) {
    console.error("Failed to verify ID token via LINE Verify API:", error);
    return null;
  }
};
