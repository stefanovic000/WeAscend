import type { Collection, Db, MongoClient } from "mongodb";
import type { AppState } from "../app/domain";

export interface StateDocument {
  userId: string;
  state: AppState;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserDocument {
  userId: string;
  email: string;
  displayName: string;
  language: "en" | "sr";
  role: "user" | "reviewer" | "admin";
  status: "active" | "deleting";
  createdAt: Date;
  updatedAt: Date;
}

export interface AiUsageDocument {
  userId: string;
  day: string;
  xpEstimateRequests: number;
  bossStepRequests: number;
  lastRequestAt: Date;
  updatedAt: Date;
}

export interface AuthEmailUsageDocument {
  keyHash: string;
  kind: "verification" | "password_reset";
  day: string;
  count: number;
  lastRequestAt: Date;
  expiresAt: Date;
}

export interface WeAscendCollections {
  database: Db;
  states: Collection<StateDocument>;
  users: Collection<UserDocument>;
  aiUsage: Collection<AiUsageDocument>;
  authEmailUsage: Collection<AuthEmailUsageDocument>;
}

let indexesEnsured = false;

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

async function ensureIndexes(collections: WeAscendCollections) {
  if (indexesEnsured) return;
  await Promise.all([
    collections.states.createIndex({ userId: 1 }, { unique: true, name: "unique_user_state_v2" }),
    collections.users.createIndex({ userId: 1 }, { unique: true, name: "unique_user_profile_v2" }),
    collections.aiUsage.createIndex({ userId: 1, day: 1 }, { unique: true, name: "unique_user_ai_day_v2" }),
    collections.authEmailUsage.createIndex(
      { keyHash: 1, kind: 1, day: 1 },
      { unique: true, name: "unique_auth_email_day_v2" },
    ),
    collections.authEmailUsage.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "expire_auth_email_usage_v2" }),
  ]);
  indexesEnsured = true;
}

export async function withCollections<T>(action: (collections: WeAscendCollections) => Promise<T>): Promise<T> {
  const client: MongoClient = await createClient();
  try {
    const database = client.db(process.env.MONGODB_DB?.trim() || "ascend");
    const collections: WeAscendCollections = {
      database,
      states: database.collection<StateDocument>("user_states_v2"),
      users: database.collection<UserDocument>("users_v2"),
      aiUsage: database.collection<AiUsageDocument>("ai_usage_v2"),
      authEmailUsage: database.collection<AuthEmailUsageDocument>("auth_email_usage_v2"),
    };
    await ensureIndexes(collections);
    return await action(collections);
  } finally {
    await client.close();
  }
}

export async function withStateCollection<T>(
  action: (collection: Collection<StateDocument>) => Promise<T>,
): Promise<T> {
  return withCollections(({ states }) => action(states));
}
