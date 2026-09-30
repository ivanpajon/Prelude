import { notFound } from "next/navigation";

// This terminal catch-all has no page shell: notFound() renders the localized
// boundary. Exempt only this route from static-shell and instant validation.
export const instant = false;

export default function UnknownPage() {
  notFound();
}
