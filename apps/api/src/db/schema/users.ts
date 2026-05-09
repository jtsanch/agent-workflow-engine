import { text, timestamp, uuid } from "drizzle-orm/pg-core";

export const users = {
  id: uuid("id").primaryKey(),
  email: text("email").notNull().unique(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  status: text("status").notNull(),
  role: text("role").notNull(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  lastLoginAt: timestamp("last_login_at")
};
