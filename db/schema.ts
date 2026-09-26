import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const learningStates=sqliteTable('learning_states',{userId:text('user_id').primaryKey(),revision:integer('revision').notNull().default(0),document:text('document').notNull(),updatedAt:text('updated_at').notNull()});
