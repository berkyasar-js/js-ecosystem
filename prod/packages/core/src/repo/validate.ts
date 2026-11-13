import {
  agentPolicySchema, announcementAckSchema, announcementSchema, automationSchema, clientRequestSchema, dealSchema, expenseSchema, leaveSchema, milestoneSchema, projectMemberSchema, proposalSchema,
  requestSchema, reviewCommentSchema, savedViewSchema, surveyResponseSchema, type CollKey,
} from '@jscore/contracts';
import type { ZodTypeAny } from 'zod';

/** Kayıt türüne göre zod doğrulaması (kaydı dönüştürmez; geçersizse ZodError fırlatır). */
const SCHEMAS: Partial<Record<CollKey, ZodTypeAny>> = {
  crm_deals: dealSchema, crm_proposals: proposalSchema, leaves: leaveSchema, expenses: expenseSchema, client_requests: clientRequestSchema,
  survey_responses: surveyResponseSchema, review_comments: reviewCommentSchema, automations: automationSchema,
  saved_views: savedViewSchema, milestones: milestoneSchema, requests: requestSchema, announcements: announcementSchema, announcement_acks: announcementAckSchema,
  project_members: projectMemberSchema, agent_policies: agentPolicySchema,
};
export function validateRecord(kind: CollKey, rec: unknown) { SCHEMAS[kind]?.parse(rec); }
