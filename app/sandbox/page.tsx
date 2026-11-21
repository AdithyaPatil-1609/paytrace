/** /sandbox: the sandbox is now part of the demo. Old links land there. */
import { redirect } from "next/navigation";

export default function SandboxPage() {
  redirect("/demo");
}
