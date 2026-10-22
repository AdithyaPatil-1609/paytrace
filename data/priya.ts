import { detectCommitments } from "@/lib/engine";
import { loadFixtures } from "@/lib/fixtures";

/**
 * Priya's commitments, detected from the CSV fixture rather than written by
 * hand. Nothing in this file names a merchant: change a row in data/raw and
 * this list changes with it.
 */
export const priyaCommitments = detectCommitments(loadFixtures());
