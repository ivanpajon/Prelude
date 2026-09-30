import { createLocaleProxy } from "./i18n/proxy";

export default createLocaleProxy();

export const config = {
  matcher: ["/((?!api(?:/|$)|_next(?:/|$)|offline(?:/|$)|.*\\..*).*)"],
};
