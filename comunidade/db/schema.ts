import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
export const records = sqliteTable('church_records', {
 id:text('id').primaryKey(),owner:text('owner').notNull(),kind:text('kind').notNull(),payload:text('payload').notNull(),version:integer('version').notNull().default(1),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),
},t=>[index('records_owner_kind').on(t.owner,t.kind)]);
export const access = sqliteTable('church_access', {
 userId:text('user_id').primaryKey(),churchOwner:text('church_owner').notNull(),email:text('email').notNull(),name:text('name').notNull(),role:text('role').notNull(),ministry:text('ministry').notNull().default(''),memberId:text('member_id'),active:integer('active',{mode:'boolean'}).notNull().default(true),version:integer('version').notNull().default(1),createdAt:text('created_at').notNull(),
},t=>[index('access_church').on(t.churchOwner),uniqueIndex('access_church_email').on(t.churchOwner,t.email),uniqueIndex('access_church_member').on(t.churchOwner,t.memberId)]);
export const invitations = sqliteTable('church_invitations', {
 id:text('id').primaryKey(),churchOwner:text('church_owner').notNull(),email:text('email').notNull(),role:text('role').notNull(),ministry:text('ministry').notNull().default(''),memberId:text('member_id'),tokenHash:text('token_hash').notNull(),expiresAt:text('expires_at').notNull(),createdAt:text('created_at').notNull(),revokedAt:text('revoked_at'),acceptedAt:text('accepted_at'),acceptedBy:text('accepted_by'),
},t=>[uniqueIndex('invitation_hash').on(t.tokenHash),index('invitation_church').on(t.churchOwner)]);
