/**
 * Try the AI reader (card U1) on one message from the terminal:
 *   npm run ai:read -- "Rs 649.00 debited from A/c XX4417 ..." VM-HDFCBK-S
 * Prints only the fields and the event, never stores anything. Use made-up
 * text here; real messages are tested on the phone, not pasted into logs.
 */
import { readMessage } from "../ai/assistant/message-reader";
import { eventFromFields } from "../server/ingestion/from-reader";

const [text, sender = "VM-HDFCBK-S"] = process.argv.slice(2);
if (!text) {
  console.error('Usage: npm run ai:read -- "<message text>" [sender]');
  process.exit(1);
}

async function main() {
  const message = { text, sender, receivedAt: new Date().toISOString() };
  const started = Date.now();
  const result = await readMessage(message);
  console.log(JSON.stringify(result, null, 2));
  if (result.status === "read") console.log(JSON.stringify(eventFromFields(result.fields, message, "sms"), null, 2));
  console.log(`${Date.now() - started} ms`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
