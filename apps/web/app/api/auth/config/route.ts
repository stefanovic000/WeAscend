export const dynamic = "force-dynamic";

export async function GET() {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim() || "";
  const config = {
    apiKey: process.env.FIREBASE_API_KEY?.trim() || "",
    authDomain: process.env.FIREBASE_AUTH_DOMAIN?.trim() || (projectId ? `${projectId}.firebaseapp.com` : ""),
    projectId,
    appId: process.env.FIREBASE_APP_ID?.trim() || "",
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID?.trim() || "",
  };
  const configured = Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);

  return Response.json(
    {
      configured,
      developmentBypass: !configured && process.env.NODE_ENV !== "production",
      config: configured ? config : null,
    },
    { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } },
  );
}
