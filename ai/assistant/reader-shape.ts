/**
 * The fixed shape of the AI reader's reply (card U1). Qwen is forced into this
 * shape by Ollama's structured output, and every reply is checked again here
 * with Zod before anything uses it. One shape for SMS, email and iPhone text.
 */
import { z } from "zod";

/** Every kind of message the reader can name. "other" means not a payment we track. */
export const MESSAGE_KINDS = [
  "debit",
  "credit",
  "mandate_created",
  "mandate_cancelled",
  "mandate_paused",
  "upcoming_debit",
  "price_change",
  "trial_ending",
  "subscription_started",
  "renewal",
  "refund",
  "failed_debit",
  "other"
] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

const text = (max: number) => z.string().trim().min(1).max(max).nullable();

export const ReaderFieldsSchema = z
  .object({
    is_financial: z.boolean(),
    kind: z.enum(MESSAGE_KINDS),
    merchant: text(80),
    /** The amount exactly as the message writes it, e.g. "Rs 1,499.00". Never a number the AI worked out. */
    amount_text: text(40),
    /** The date exactly as the message writes it, e.g. "21-11-26". */
    date_text: text(40),
    reference: text(80),
    account_last4: z.string().regex(/^\d{4}$/).nullable(),
    upi_id: text(80)
  })
  .strict();

export type ReaderFields = z.infer<typeof ReaderFieldsSchema>;

/** The same shape as JSON Schema, handed to Ollama's `format` so Qwen can only reply in it. */
export const READER_JSON_SCHEMA = z.toJSONSchema(ReaderFieldsSchema, { target: "draft-7" });
