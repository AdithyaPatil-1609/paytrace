"use client";
/**
 * The top bar "Add phone" dropdown: choose iPhone (Shortcut + token) or
 * Android (the Paytrace app + pairing code). Both stay mounted so switching
 * or closing the menu never loses a token or code that is shown only once.
 */
import { useState } from "react";
import { BarMenu, PhoneIcon } from "@/web/components/chrome/bar-menu";
import { IphoneConnect } from "@/web/components/account/iphone-connect";
import { PhonePairing } from "@/web/components/account/phone-pairing";

type Kind = "iphone" | "android";

export function AddPhoneMenu({ iphoneConnected, onChange }: { iphoneConnected: boolean; onChange: () => void }) {
  const [kind, setKind] = useState<Kind | null>(null);
  const choice = (value: Kind, text: string) => <button type="button" className="phone-choice-option" aria-pressed={kind === value} onClick={() => setKind(value)}>{text}</button>;
  return <BarMenu label="Add phone" icon={PhoneIcon} title="Send bank SMS from your iPhone or Android phone">
    <p className="account-eyebrow">ADD A PHONE</p>
    <p className="account-note">Which phone gets your bank SMS?</p>
    <div className="phone-choice" role="group" aria-label="Phone type">
      {choice("iphone", "iPhone")}
      {choice("android", "Android")}
    </div>
    <div className="phone-choice-body" hidden={kind !== "iphone"}><IphoneConnect connected={iphoneConnected} onChange={onChange}/></div>
    <div className="phone-choice-body" hidden={kind !== "android"}><PhonePairing/></div>
  </BarMenu>;
}
