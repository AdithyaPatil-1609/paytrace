/** /family/accept#invite=…: a person accepts a Family View invite. The token stays after "#" and never reaches the server's logs. */
import { FamilyAccept } from "@/web/components/account/family-access";
import "../../account/account.css";
import "../family.css";

export const metadata = { title: "Accept family invite · Paytrace", robots: { index: false, follow: false } };

export default function FamilyAcceptPage() {
  return <FamilyAccept/>;
}
