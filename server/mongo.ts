import type { Collection, MongoClient } from "mongodb";
import type { AppState } from "../app/domain";

export interface StateDocument {
  userId: string;
  state: AppState;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}

let indexEnsured = false;

function connectionUri() {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) throw new Error("MONGODB_URI_NOT_CONFIGURED");
  return uri;
}

async function createClient() {
  const uri = connectionUri();
  const { MongoClient: RuntimeMongoClient, ServerApiVersion } = await import("mongodb");
  const client = new RuntimeMongoClient(uri, {
    appName: "weascend",
    maxPoolSize: 1,
    minPoolSize: 0,
    serverSelectionTimeoutMS: 5_000,
    socketTimeoutMS: 8_000,
    serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
  });
  return client.connect();
}

export async function withStateCollection<T>(
  action: (collection: Collection<StateDocument>) => Promise<T>,
): Promise<T> {
  const client: MongoClient = await createClient();
  try {
    const database = client.db(process.env.MONGODB_DB?.trim() || "ascend");
    const collection = database.collection<StateDocument>("user_states");
    if (!indexEnsured) {
      await collection.createIndex({ userId: 1 }, { unique: true, name: "unique_user_state" });
      indexEnsured = true;
    }
    return await action(collection);
  } finally {
    await client.close();
  }
}
