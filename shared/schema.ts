import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// User table for authentication
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  sector: varchar("sector", { length: 20 }).notNull(),
  role: varchar("role", { length: 20 }).notNull().default("admin"),
  created_at: timestamp("created_at").defaultNow(),
});

// Session storage for database connections
export const sessions = pgTable("sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  user_id: varchar("user_id").notNull().references(() => users.id),
  db_connection: text("db_connection"), // JSON string of connection details
  schema_data: text("schema_data"), // JSON string of extracted schema
  created_at: timestamp("created_at").defaultNow(),
  expires_at: timestamp("expires_at").notNull(),
});

// Chat history
export const chat_messages = pgTable("chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  user_id: varchar("user_id").notNull().references(() => users.id),
  session_id: varchar("session_id").references(() => sessions.id),
  message_type: varchar("message_type", { length: 20 }).notNull(), // 'user' or 'assistant'
  content: text("content").notNull(),
  query_result: text("query_result"), // JSON string of query results
  created_at: timestamp("created_at").defaultNow(),
});

// KPI templates/suggestions
export const kpi_suggestions = pgTable("kpi_suggestions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  sector: varchar("sector", { length: 20 }).notNull(),
  query_template: text("query_template").notNull(),
  created_at: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  sector: true,
  role: true,
});

export const insertSessionSchema = createInsertSchema(sessions).pick({
  user_id: true,
  db_connection: true,
  schema_data: true,
  expires_at: true,
});

export const insertChatMessageSchema = createInsertSchema(chat_messages).pick({
  user_id: true,
  session_id: true,
  message_type: true,
  content: true,
  query_result: true,
});

export const insertKPISuggestionSchema = createInsertSchema(kpi_suggestions).pick({
  name: true,
  description: true,
  sector: true,
  query_template: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessions.$inferSelect;

export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessage = typeof chat_messages.$inferSelect;

export type InsertKPISuggestion = z.infer<typeof insertKPISuggestionSchema>;
export type KPISuggestion = typeof kpi_suggestions.$inferSelect;
