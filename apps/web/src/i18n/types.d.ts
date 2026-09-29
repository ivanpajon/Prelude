import type { Locale } from "@repo/i18n";
import type { Messages } from "@repo/i18n/messages";
import type { getWidgetMessages } from "@repo/i18n/widget";

declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: Messages & ReturnType<typeof getWidgetMessages>;
  }
}
