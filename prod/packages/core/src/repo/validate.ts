import { automationSchema, clientRequestSchema, dealSchema, expenseSchema, leaveSchema, proposalSchema, reviewCommentSchema, surveyResponseSchema, type CollKey } from '@jscore/contracts';
import type { ZodTypeAny } from 'zod';

/** Kayıt türüne göre zod doğrulaması (kaydı dönüştürmez; geçersizse ZodError fırlatır). */
const SCHEMAS: Partial<Record<CollKey, ZodTypeAny>> = {
  crm_deals: dealSchema, crm_proposals: proposalSchema, leaves: leaveSchema, expenses: expenseSchema, client_requests: clientRequestSchema,
  survey_responses: surveyResponseSchema, review_comments: reviewCommentSchema, automations: automationSchema,
};
export function validateRecord(kind: CollKey, rec: unknown) { SCHEMAS[kind]?.parse(rec); }
