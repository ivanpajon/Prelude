import type { Locale } from "@repo/i18n";
import type { Messages } from "@repo/i18n/messages";
// demo:start

import type { getWidgetMessages } from "@repo/i18n/widget";

// demo:end

declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: Messages &
      // demo:start
      ReturnType<typeof getWidgetMessages> &
      // demo:end
      unknown;
  }
}
