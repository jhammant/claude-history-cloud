import { z } from 'zod';

export const RegisterSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const KnowledgeEntrySchema = z.object({
  type: z.string().min(1).max(20),
  project: z.string().max(255).optional(),
  sessionId: z.string().max(255).optional(),
  timestamp: z.number().int(),
  summary: z.string().min(1).max(5000),
  details: z.string().max(50000).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  relatedFiles: z.array(z.string().max(500)).max(50).optional(),
});

export const KnowledgeUpdateSchema = z.object({
  summary: z.string().min(1).max(5000).optional(),
  details: z.string().max(50000).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  relatedFiles: z.array(z.string().max(500)).max(50).optional(),
});

export const SessionSummarySchema = z.object({
  sessionId: z.string().min(1).max(255),
  project: z.string().max(255).optional(),
  summary: z.record(z.unknown()),
});

export const PushKnowledgeSchema = z.object({
  entries: z.array(KnowledgeEntrySchema).min(1).max(500),
  teamId: z.string().uuid().optional(),
});

export const PushSessionsSchema = z.object({
  summaries: z.array(SessionSummarySchema).min(1).max(200),
  teamId: z.string().uuid().optional(),
});

export const CreateTeamSchema = z.object({
  name: z.string().min(1).max(255),
});

export const InviteSchema = z.object({
  email: z.string().email(),
});

export const SearchSchema = z.object({
  q: z.string().min(1).max(500),
  project: z.string().max(255).optional(),
  type: z.string().max(20).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export function parseBody<T>(schema: z.ZodSchema<T>, body: unknown): T {
  return schema.parse(body);
}

export function parseQuery<T>(schema: z.ZodSchema<T>, query: unknown): T {
  return schema.parse(query);
}
