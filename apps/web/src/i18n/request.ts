import { isLocale } from "@repo/i18n";
import { getMessages } from "@repo/i18n/messages";
import { notFound } from "next/navigation";
import * as rootParams from "next/root-params";
import { getRequestConfig } from "next-intl/server";

export default getRequestConfig(async ({ locale: explicitLocale }) => {
  const locale = explicitLocale ?? (await rootParams.locale());
  if (!isLocale(locale)) notFound();
  return { locale, messages: getMessages(locale), timeZone: "UTC" };
});
