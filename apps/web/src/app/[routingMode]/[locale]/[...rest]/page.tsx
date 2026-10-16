import { notFound } from "next/navigation";

// This terminal catch-all has no page shell: notFound() renders the localized
// boundary. Exempt only this route from static-shell and instant validation.
export const instant = false;

// notFound() throws inside the Suspense boundary of ./loading.tsx, after the
// shell is sent, so Next.js keeps this page's metadata. Reuse the 404 title.
export { generateMetadata } from "../not-found";

export default function UnknownPage() {
  notFound();
}
