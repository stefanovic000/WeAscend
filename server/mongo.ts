import { MongoClient, ServerApiVersion, type Collection } from "mongodb";
import type { AppState } from "../app/domain";

export interface StateDocument {
  userId: string;
  state: AppState;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}

let clientPromise: Promise<MongoClient> | null = null;
let indexesPromise: Promise<string> | null = null;

function connectionUri() {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) throw new Error("MONGODB_URI_NOT_CONFIGURED");
  return uri;
}

async function getClient() {
  if (!clientPromise) {
    const client = new MongoClient(connectionUri(), {
      appName: "ascend-solo-progress",
      maxPoolSize: 4,
      minPoolSize: 0,
      serverSelectionTimeoutMS: 6000,
      socketTimeoutMS: 12000,
      serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
    });
    clientPromise = client.connect().catch(error => {
      clientPromise = null;
      throw error;
    });
  }
  return clientPromise;
}

export async function getStateCollection(): Promise<Collection<StateDocument>> {
  const client = await getClient();
  const database = client.db(process.env.MONGODB_DB?.trim() || "ascend");
  const collection = database.collection<StateDocument>("user_states");
  indexesPromise ??= collection.createIndex({ userId: 1 }, { unique: true, name: "unique_user_state" });
  await indexesPromise;
  return collection;
}
