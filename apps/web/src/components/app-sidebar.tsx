"use client";

import { isLocale, locales } from "@repo/i18n";
import { Avatar, AvatarFallback } from "@repo/ui/components/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@repo/ui/components/sidebar";
import { toast } from "@repo/ui/components/toast";
import { ChevronsUpDownIcon, LanguagesIcon, SunMoonIcon } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { type ReactNode, useEffect, useId } from "react";
import { Link } from "@/i18n/navigation";
import { useRoutingPreference } from "@/i18n/routing-preference-provider";
import { site, siteIcons } from "@/site";
import { languageNames } from "./language-selector";

export interface AppUser {
  name: string;
  email: string;
}

export interface AppSidebarGroup {
  label: string;
  items: { href: string; label: string; icon: ReactNode; active?: boolean }[];
}

/**
 * The app pages' sidebar, after shadcn's sidebar-08: the logo, the page groups and the API docs.
 * The shell passes the translated labels, so this client component needs no catalog of its own.
 */
export function AppSidebar({
  groups,
  footer,
  user,
  labels,
}: {
  groups: AppSidebarGroup[];
  user: AppUser;
  /** The last menu item, above the account menu. */
  footer: { href: string; label: string; icon: ReactNode };
  labels: {
    home: string;
    navigation: string;
    sidebar: string;
    sidebarDescription: string;
    toggleSidebar: string;
  };
}) {
  // The mobile sheet stays open across client navigations, so a link closes it.
  const { setOpenMobile } = useSidebar();
  const close = () => setOpenMobile(false);
  const id = useId();
  return (
    <Sidebar
      variant="inset"
      collapsible="icon"
      mobileTitle={labels.sidebar}
      mobileDescription={labels.sidebarDescription}
    >
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              render={<Link href="/" aria-label={labels.home} onClick={close} />}
            >
              <Image
                src={siteIcons.icon}
                alt=""
                width={32}
                height={32}
                className="size-8 rounded-lg"
                unoptimized
              />
              <span className="truncate text-sm font-medium">{site.name}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label={labels.navigation} className="flex flex-1 flex-col">
          {groups.map((group, index) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel id={`${id}-${index}`}>{group.label}</SidebarGroupLabel>
              <SidebarMenu aria-labelledby={`${id}-${index}`}>
                {group.items.map(({ href, label, icon, active = false }) => (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton
                      isActive={active}
                      tooltip={label}
                      render={
                        <Link
                          href={href}
                          aria-current={active ? "page" : undefined}
                          onClick={close}
                        />
                      }
                    >
                      {icon}
                      <span>{label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>
          ))}
          <SidebarGroup className="mt-auto">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  size="sm"
                  tooltip={footer.label}
                  // A plain link: the target is outside the localized pages.
                  render={<a href={footer.href} />}
                >
                  {footer.icon}
                  <span>{footer.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        </nav>
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail label={labels.toggleSidebar} />
    </Sidebar>
  );
}

/** The account menu: the language and the theme. Add the profile and sign-out items here. */
function NavUser({ user }: { user: AppUser }) {
  const t = useTranslations("Common");
  const { isMobile } = useSidebar();
  const { theme, setTheme } = useTheme();
  const { locale, pending, failure, changeLocale } = useRoutingPreference();
  useEffect(() => {
    if (failure === "locale") toast.add({ type: "error", title: t("preferenceError") });
  }, [failure, t]);
  const who = (
    <>
      <Avatar className="group-data-[collapsible=icon]:size-6">
        <AvatarFallback aria-hidden="true" className="group-data-[collapsible=icon]:text-xs">
          {user.name.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <span className="grid flex-1 text-left leading-tight">
        <span className="truncate font-medium">{user.name}</span>
        <span className="truncate text-muted-foreground">{user.email}</span>
      </span>
    </>
  );
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              // Collapsed, the button is a circle with a smaller avatar inside, so its highlight
              // shows as a ring around the avatar.
              <SidebarMenuButton
                size="lg"
                className="group-data-[collapsible=icon]:rounded-full group-data-[collapsible=icon]:p-1! aria-expanded:bg-sidebar-accent"
              />
            }
          >
            {who}
            <ChevronsUpDownIcon className="ml-auto" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-56"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="flex items-center gap-2 text-foreground">
                {who}
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            {locales.length > 1 && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <LanguagesIcon aria-hidden="true" />
                  {t("language")}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup
                    value={locale}
                    onValueChange={(selected: string) => {
                      if (!pending && isLocale(selected)) changeLocale(selected);
                    }}
                  >
                    {locales.map((option) => (
                      <DropdownMenuRadioItem key={option} value={option} lang={option}>
                        {languageNames[option]}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <SunMoonIcon aria-hidden="true" />
                {t("theme.label")}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
                  <DropdownMenuRadioItem value="light">{t("theme.light")}</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="dark">{t("theme.dark")}</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="system">{t("theme.system")}</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
