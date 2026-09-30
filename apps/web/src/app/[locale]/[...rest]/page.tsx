import { notFound } from "next/navigation";

// Missing routes intentionally enter an error boundary rather than a page shell.
export const instant = false;

export default function UnknownPage() {
  notFound();
}
