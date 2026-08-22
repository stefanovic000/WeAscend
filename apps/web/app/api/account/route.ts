import { authenticateRequest } from "../../../server/auth";
import { withCollections } from "../../../server/mongo";

export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" },
  });
}

function requestToken(request: Request) {
  return /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization")?.trim() ?? "")?.[1]?.trim() || "";
}

export async function DELETE(request: Request) {
  const auth = await authenticateRequest(request);
  if (auth.status === "unauthenticated") return json({ code: auth.code }, 401);
  if (auth.status === "forbidden") return json({ code: auth.code }, 403);

  const token = requestToken(request);
  const apiKey = process.env.FIREBASE_API_KEY?.trim() || "";
  const now = new Date();

  try {
    await withCollections(async ({ states, users, aiUsage }) => {
      await users.updateOne(
        { userId: auth.user.id },
        { $set: { status: "deleting", updatedAt: now } },
      );
      await Promise.all([
        states.deleteOne({ userId: auth.user.id }),
        aiUsage.deleteMany({ userId: auth.user.id }),
      ]);
    });

    if (token && apiKey) {
      const firebaseResponse = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${encodeURIComponent(apiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: token }),
      });
      if (!firebaseResponse.ok) return json({ code: "account_reauthentication_required" }, 409);
    } else if (process.env.NODE_ENV === "production") {
      return json({ code: "account_deletion_not_configured" }, 503);
    }

    await withCollections(async ({ users }) => users.deleteOne({ userId: auth.user.id }));
    return json({ deleted: true });
  } catch (error) {
    console.error("Account deletion failed", error instanceof Error ? `${error.name}: ${error.message}` : error);
    return json({ code: "account_deletion_failed" }, 503);
  }
}
