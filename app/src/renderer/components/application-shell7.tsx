'use client';

import { motion } from 'framer-motion';
import {
  AtSign,
  BadgeCheck,
  Bell,
  Bookmark,
  ChevronDown,
  ClipboardCheck,
  Clock,
  CreditCard,
  FileText,
  Folder,
  Hash,
  Inbox,
  Layers,
  LayoutGrid,
  LogOut,
  MessageSquare,
  MessageSquareText,
  MessagesSquare,
  PhoneCall,
  Pin,
  Settings,
  Sparkles,
  UserPlus,
  Users,
} from 'lucide-react';
import * as React from 'react';

import { cn } from '@renderer/lib/cn';

import { LogoImage, LogoText } from '@renderer/components/shadcnblocks/logo';
import { Avatar, AvatarFallback, AvatarImage } from '@renderer/components/ui/avatar';
import { Badge } from '@renderer/components/ui/badge';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@renderer/components/ui/breadcrumb';
import { Button } from '@renderer/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@renderer/components/ui/drawer';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@renderer/components/ui/dropdown-menu';
import { ScrollArea } from '@renderer/components/ui/scroll-area';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@renderer/components/ui/sidebar';
import { TooltipProvider } from '@renderer/components/ui/tooltip';

type ModuleId = 'messages' | 'spaces' | 'threads' | 'calls' | 'files';

type NavItem = {
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  href: string;
  badge?: string;
  active?: boolean;
};

type NavSection = {
  title?: string;
  items: NavItem[];
};

type NavModule = {
  id: ModuleId;
  label: string;
  icon: NavItem['icon'];
  sections: NavSection[];
};

function getItemKey(moduleId: ModuleId, item: NavItem) {
  return `${moduleId}:${item.label}`;
}

function getDefaultItemKey(module: NavModule) {
  const items = module.sections.flatMap((section) => section.items);
  const activeItem = items.find((item) => item.active) ?? items[0];
  return activeItem ? getItemKey(module.id, activeItem) : `${module.id}:`;
}

function getActiveItemLabel(module: NavModule, activeItemKey: string) {
  const items = module.sections.flatMap((section) => section.items);
  const match = items.find(
    (item) => getItemKey(module.id, item) === activeItemKey,
  );
  return match?.label ?? module.sections[0]?.items[0]?.label ?? module.label;
}

function getInitials(name: string) {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'U'
  );
}

const navModules: NavModule[] = [
  {
    id: 'messages',
    label: 'Messages',
    icon: MessagesSquare,
    sections: [
      {
        title: 'Inbox',
        items: [
          { label: 'All messages', icon: Inbox, href: '#', active: true },
          { label: 'Mentions', icon: AtSign, href: '#', badge: '4' },
          { label: 'Notifications', icon: Bell, href: '#', badge: '12' },
          { label: 'Saved', icon: Bookmark, href: '#' },
        ],
      },
      {
        title: 'Views',
        items: [
          { label: 'Unread', icon: Bell, href: '#' },
          { label: 'Scheduled', icon: Clock, href: '#' },
        ],
      },
    ],
  },
  {
    id: 'spaces',
    label: 'Spaces',
    icon: LayoutGrid,
    sections: [
      {
        title: 'Spaces',
        items: [
          { label: 'Product updates', icon: Hash, href: '#', active: true },
          { label: 'Customer success', icon: Users, href: '#', badge: '2' },
          { label: 'Release ops', icon: Layers, href: '#' },
        ],
      },
      {
        title: 'Direct',
        items: [
          { label: 'Kai', icon: Users, href: '#', badge: '1' },
          { label: 'Mina', icon: Users, href: '#' },
          { label: 'Diego', icon: Users, href: '#' },
        ],
      },
    ],
  },
  {
    id: 'threads',
    label: 'Threads',
    icon: MessageSquareText,
    sections: [
      {
        title: 'Threads',
        items: [
          { label: 'Following', icon: Bookmark, href: '#', active: true },
          { label: 'Assigned', icon: Users, href: '#' },
          { label: 'Resolved', icon: MessageSquareText, href: '#' },
        ],
      },
      {
        title: 'Highlights',
        items: [
          { label: 'Mentions', icon: AtSign, href: '#', badge: '3' },
          { label: 'Pinned', icon: Bookmark, href: '#' },
        ],
      },
    ],
  },
  {
    id: 'calls',
    label: 'Calls',
    icon: PhoneCall,
    sections: [
      {
        title: 'Meetings',
        items: [
          { label: 'Upcoming', icon: Clock, href: '#', active: true },
          { label: 'Recordings', icon: FileText, href: '#' },
        ],
      },
      {
        title: 'Devices',
        items: [
          { label: 'Audio & video', icon: PhoneCall, href: '#' },
          { label: 'Notifications', icon: Bell, href: '#' },
        ],
      },
    ],
  },
  {
    id: 'files',
    label: 'Files',
    icon: Folder,
    sections: [
      {
        title: 'Browse',
        items: [
          { label: 'Recent', icon: Clock, href: '#', active: true },
          { label: 'Shared with me', icon: Users, href: '#' },
          { label: 'Uploads', icon: Folder, href: '#' },
          { label: 'Collections', icon: Layers, href: '#' },
        ],
      },
      {
        title: 'Quick filters',
        items: [
          { label: 'Documents', icon: FileText, href: '#' },
          { label: 'Unread comments', icon: Bell, href: '#', badge: '5' },
        ],
      },
    ],
  },
];

const utilities: NavItem[] = [
  { label: 'Notifications', icon: Bell, href: '#' },
  { label: 'Settings', icon: Settings, href: '#' },
];

const data = {
  user: {
    name: 'Avery Chen',
    email: 'avery@pulse.team',
    avatar:
      'https://deifkwefumgah.cloudfront.net/shadcnblocks/block/avatar/avatar10.webp',
  },
  participants: [
    {
      id: 'you',
      name: 'Avery Chen',
      title: 'You',
      status: 'online',
    },
    {
      id: 'riley',
      name: 'Riley Park',
      title: 'Product',
      status: 'online',
    },
    {
      id: 'sam',
      name: 'Sam Rivera',
      title: 'Design',
      status: 'away',
    },
    {
      id: 'noah',
      name: 'Noah Patel',
      title: 'Engineering',
      status: 'offline',
    },
    {
      id: 'maya',
      name: 'Maya Singh',
      title: 'Support',
      status: 'online',
    },
    {
      id: 'jules',
      name: 'Jules Tan',
      title: 'Ops',
      status: 'offline',
    },
  ] as const,
  activity: [
    {
      id: 'a1',
      icon: MessageSquare,
      title: 'New thread started',
      detail: 'Riley posted in Product updates.',
      time: '2m',
    },
    {
      id: 'a2',
      icon: AtSign,
      title: 'You were mentioned',
      detail: 'Sam mentioned you in a draft reply.',
      time: '18m',
    },
    {
      id: 'a3',
      icon: Pin,
      title: 'Pinned a message',
      detail: 'Maya pinned “Release checklist v3”.',
      time: '1h',
    },
    {
      id: 'a4',
      icon: ClipboardCheck,
      title: 'Task completed',
      detail: 'Noah marked “API cleanup” as done.',
      time: 'Today',
    },
    {
      id: 'a5',
      icon: PhoneCall,
      title: 'Call ended',
      detail: 'Weekly sync • 24 minutes.',
      time: 'Yesterday',
    },
    {
      id: 'a6',
      icon: FileText,
      title: 'File uploaded',
      detail: 'Jules shared “incident-notes.pdf”.',
      time: 'Yesterday',
    },
  ] as const,
};

interface ShellBreadcrumbProps {
  className?: string;
  moduleLabel: string;
  itemLabel: string;
}

function ShellBreadcrumb({
  className,
  moduleLabel,
  itemLabel,
}: ShellBreadcrumbProps) {
  return (
    <Breadcrumb className={cn(className)}>
      <BreadcrumbList>
        <BreadcrumbItem className="hidden md:block">
          <BreadcrumbLink href="#">{moduleLabel}</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator className="hidden md:block" />
        <BreadcrumbItem>
          <BreadcrumbPage>{itemLabel}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}

interface ModulePanelProps {
  className?: string;
  module: NavModule;
  activeItemKey: string;
  onSelectItem: (key: string) => void;
}

function ModulePanel({
  className,
  module,
  activeItemKey,
  onSelectItem,
}: ModulePanelProps) {
  return (
    <div className={cn('space-y-4 px-4 py-3 text-sm', className)}>
      {module.sections.map((section, index) => (
        <div className="space-y-2" key={section.title ?? index}>
          {section.title && (
            <SidebarGroupLabel className="mb-1 text-xs font-medium tracking-wide text-muted-foreground">
              {section.title}
            </SidebarGroupLabel>
          )}
          <SidebarMenu>
            {section.items.map((item) => {
              const Icon = item.icon;
              const itemKey = getItemKey(module.id, item);
              return (
                <SidebarMenuItem
                  key={item.label}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <SidebarMenuButton
                    asChild
                    isActive={itemKey === activeItemKey}
                    className="px-2"
                  >
                    <a
                      href={item.href}
                      onClick={(e) => {
                        e.preventDefault();
                        onSelectItem(itemKey);
                      }}
                    >
                      <Icon className="size-4" />
                      {item.badge && (
                        <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>
                      )}
                      <span>{item.label}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </div>
      ))}

      <div className="border-t pt-3">
        <SidebarGroupLabel className="mb-2 text-xs font-medium tracking-wide text-muted-foreground">
          Preferences
        </SidebarGroupLabel>
        <SidebarMenu className="text-sm">
          {utilities.map((item) => {
            const Icon = item.icon;
            return (
              <SidebarMenuItem key={item.label}>
                <SidebarMenuButton
                  asChild
                  className="gap-2.5 px-2 text-muted-foreground hover:text-foreground"
                >
                  <a href={item.href}>
                    <Icon className="size-4" />
                    <span>{item.label}</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </div>
    </div>
  );
}

interface AppSidebarProps extends Omit<
  React.ComponentProps<typeof Sidebar>,
  'className'
> {
  className?: string;
  activeKey: ModuleId;
  activeItemKey: string;
  onNavChange: (key: ModuleId) => void;
  onItemChange: (key: string) => void;
}

function AppSidebar({
  className,
  activeKey,
  activeItemKey,
  onNavChange,
  onItemChange,
  ...props
}: AppSidebarProps) {
  const { state, setOpen, isMobile } = useSidebar();
  const isCollapsed = state === 'collapsed';
  const showFooter = isCollapsed || isMobile;

  const activeModule =
    navModules.find((module) => module.id === activeKey) ?? navModules[0];

  return (
    <TooltipProvider>
      <Sidebar
        collapsible="icon"
        className={cn(
          'overflow-hidden *:data-[sidebar=sidebar]:flex-row',
          className,
        )}
        {...props}
      >
        <Sidebar
          collapsible="none"
          className="w-[calc(var(--sidebar-width-icon)+1px)]! border-r"
        >
          <SidebarHeader className="h-14 border-b">
            <SidebarMenu className="my-auto">
              <SidebarMenuItem>
                <SidebarMenuButton size="lg" asChild className="md:h-8 md:p-0">
                  <a href="#">
                    <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                      <LogoImage
                        src="https://deifkwefumgah.cloudfront.net/shadcnblocks/block/block-3.svg"
                        alt="Zerostatic Studio"
                        className="h-8 w-8 rounded-sm bg-muted p-1"
                      />
                    </div>
                    <LogoText>Pulse</LogoText>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent className="px-1.5 md:px-0">
                <SidebarMenu>
                  {' '}
                  <SidebarMenuItem>
                    <motion.div
                      key={isCollapsed ? 'h-collapsed' : 'h-expanded'}
                      className={cn(
                        isCollapsed
                          ? 'hidden items-center justify-center sm:flex'
                          : 'hidden',
                      )}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.8 }}
                    >
                      <SidebarTrigger />
                    </motion.div>
                  </SidebarMenuItem>
                  {navModules.map((module) => {
                    const Icon = module.icon;
                    return (
                      <SidebarMenuItem key={module.id}>
                        <SidebarMenuButton
                          tooltip={{
                            children: module.label,
                            hidden: isMobile,
                          }}
                          onClick={() => {
                            onNavChange(module.id);
                            setOpen(true);
                          }}
                          isActive={activeKey === module.id}
                          aria-label={module.label}
                          className="px-2.5 md:px-2"
                        >
                          <Icon className="size-4" />
                          <span>{module.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className={cn(showFooter ? 'flex' : 'hidden')}>
            <SidebarGroup className="p-0">
              <SidebarGroupContent className="px-1.5 md:px-0">
                <SidebarMenu>
                  {utilities.map((item) => {
                    const Icon = item.icon;
                    return (
                      <SidebarMenuItem key={item.label}>
                        <SidebarMenuButton
                          asChild
                          tooltip={{
                            children: item.label,
                            hidden: isMobile,
                          }}
                          className="px-2.5 md:px-2"
                          aria-label={item.label}
                        >
                          <a href={item.href}>
                            <Icon className="size-4" />
                            <span>{item.label}</span>
                          </a>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>{' '}
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarFooter>
        </Sidebar>

        <Sidebar collapsible="none" className="hidden flex-1 md:flex">
          <SidebarHeader
            className={cn(
              'flex h-14 border-b px-2',
              isCollapsed
                ? 'flex-row items-center justify-between gap-y-4 md:flex-col md:items-center md:justify-start'
                : 'flex-row items-center justify-between',
            )}
          >
            <SidebarMenu>
              <SidebarMenuItem>
                <DropdownMenu>
                  <div className="flex w-full items-center px-2 group-data-[collapsible=icon]:justify-center">
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        className="flex h-auto items-center gap-3 p-0! hover:bg-transparent"
                      >
                        <LogoImage
                          src="https://deifkwefumgah.cloudfront.net/shadcnblocks/block/block-1.svg"
                          alt="Zerostatic Studio"
                          className="h-8 w-8 rounded-sm bg-muted p-1"
                        />{' '}
                        {!isCollapsed && (
                          <>
                            <span className="font-semibold">Shadcnblocks</span>
                            <ChevronDown className="size-3 text-muted-foreground" />
                          </>
                        )}
                      </Button>
                    </DropdownMenuTrigger>
                  </div>
                  <DropdownMenuContent
                    className="min-w-60 rounded-lg"
                    side="bottom"
                    align="center"
                  >
                    <DropdownMenuGroup>
                      <DropdownMenuItem asChild>
                        <a href="#">
                          Workspace settings
                          <DropdownMenuShortcut>⌥⇧S</DropdownMenuShortcut>
                        </a>
                      </DropdownMenuItem>
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          Invite teammates
                        </DropdownMenuSubTrigger>
                        <DropdownMenuPortal>
                          <DropdownMenuSubContent className="min-w-64 rounded-lg">
                            <DropdownMenuLabel>
                              Invite to Pulse
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="flex items-center gap-2">
                              <div className="flex aspect-square size-6 items-center justify-center rounded bg-blue-500 text-[10px] font-semibold text-white">
                                EM
                              </div>
                              Invite by email
                            </DropdownMenuItem>
                            <DropdownMenuItem className="flex items-center gap-2">
                              <div className="flex aspect-square size-6 items-center justify-center rounded bg-emerald-500 text-[10px] font-semibold text-white">
                                LK
                              </div>
                              Copy invite link
                              <DropdownMenuShortcut>⌘C</DropdownMenuShortcut>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem>Pending invites</DropdownMenuItem>
                            <DropdownMenuItem>Roles & access</DropdownMenuItem>
                          </DropdownMenuSubContent>
                        </DropdownMenuPortal>
                      </DropdownMenuSub>
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />

                    <DropdownMenuItem>
                      Sign out
                      <DropdownMenuShortcut>⌥⇧Q</DropdownMenuShortcut>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarMenuItem>
            </SidebarMenu>
            <motion.div
              key={isCollapsed ? 'h-collapsed' : 'h-expanded'}
              className={cn(
                'flex items-center gap-2',
                isCollapsed ? 'flex-row md:flex-col-reverse' : 'flex-row',
              )}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8 }}
            >
              <SidebarTrigger />
            </motion.div>
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup className="px-0">
              <SidebarGroupContent>
                <ModulePanel
                  module={activeModule}
                  activeItemKey={activeItemKey}
                  onSelectItem={onItemChange}
                />
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>
      </Sidebar>
    </TooltipProvider>
  );
}

interface NavUserProps {
  className?: string;
  user: {
    name: string;
    email: string;
    avatar: string;
  };
}

function NavUser({ className, user }: NavUserProps) {
  const { isMobile } = useSidebar();
  const initials = getInitials(user.name);
  return (
    <SidebarMenu className={cn('w-full', className)}>
      <SidebarMenuItem className="w-full">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="default"
              className="h-10 w-full data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-7 w-7">
                <AvatarImage src={user.avatar} alt={user.name} />
                <AvatarFallback className="bg-sidebar-primary text-xs font-medium text-sidebar-primary-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {user.name}
              </span>
              <ChevronDown className="ml-auto size-4 text-muted-foreground" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? 'bottom' : 'right'}
            align="start"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={user.avatar} alt={user.name} />
                  <AvatarFallback className="bg-sidebar-primary font-medium text-sidebar-primary-foreground">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {user.email}
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem>
                <Sparkles className="mr-2 size-4" />
                Upgrade to Pro
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem>
                <BadgeCheck className="mr-2 size-4" />
                Account
              </DropdownMenuItem>
              <DropdownMenuItem>
                <CreditCard className="mr-2 size-4" />
                Billing
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Bell className="mr-2 size-4" />
                Notifications
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <LogOut className="mr-2 size-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

interface SidebarRightProps extends Omit<
  React.ComponentProps<typeof Sidebar>,
  'className'
> {
  className?: string;
}

export function SidebarRight({ className, ...props }: SidebarRightProps) {
  return (
    <Sidebar
      collapsible="none"
      className={cn('sticky top-0 hidden h-svh border-l lg:flex', className)}
      {...props}
    >
      <SidebarHeader className="flex h-14 items-center border-b border-sidebar-border px-2">
        <NavUser user={data.user} />
      </SidebarHeader>
      <SidebarContent className="p-0">
        <ScrollArea className="h-[calc(100svh-3.5rem)]">
          <div className="space-y-6 p-4">
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <SidebarGroupLabel className="text-xs font-medium tracking-wide text-muted-foreground">
                  Participants
                </SidebarGroupLabel>
                <Button variant="outline" size="sm" className="h-8 gap-2">
                  <UserPlus className="size-4" />
                  Invite
                </Button>
              </div>

              <div className="space-y-1">
                {data.participants.map((participant) => {
                  const statusClassName =
                    participant.status === 'online'
                      ? 'bg-emerald-500'
                      : participant.status === 'away'
                        ? 'bg-amber-500'
                        : 'bg-muted-foreground/50';
                  const initials = getInitials(participant.name);
                  const isYou = participant.id === 'you';

                  return (
                    <button
                      key={participant.id}
                      type="button"
                      className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-sidebar-accent"
                    >
                      <span
                        className={cn(
                          'mt-0.5 size-2 shrink-0 rounded-full',
                          statusClassName,
                        )}
                        aria-hidden="true"
                      />
                      <Avatar className="h-7 w-7">
                        <AvatarFallback className="bg-sidebar-primary text-xs font-medium text-sidebar-primary-foreground">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">
                            {participant.name}
                          </span>
                          {isYou && (
                            <Badge
                              variant="secondary"
                              className="h-5 px-1.5 text-[10px]"
                            >
                              You
                            </Badge>
                          )}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {participant.title}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <SidebarGroupLabel className="text-xs font-medium tracking-wide text-muted-foreground">
                  Activity
                </SidebarGroupLabel>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-muted-foreground hover:text-foreground"
                >
                  View all
                </Button>
              </div>

              <div className="space-y-2">
                {data.activity.map((event) => {
                  const Icon = event.icon;
                  return (
                    <div
                      key={event.id}
                      className="flex gap-3 rounded-md p-2 hover:bg-sidebar-accent/50"
                    >
                      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-accent/50">
                        <Icon className="size-4 text-sidebar-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="truncate text-sm font-medium">
                            {event.title}
                          </div>
                          <div className="shrink-0 text-xs text-muted-foreground">
                            {event.time}
                          </div>
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {event.detail}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </ScrollArea>
      </SidebarContent>
    </Sidebar>
  );
}

interface ApplicationShell7Props {
  className?: string;
}

export function ApplicationShell7({ className }: ApplicationShell7Props) {
  const [activeKey, setActiveKey] = React.useState<ModuleId>(navModules[0].id);
  const [isMobilePanelOpen, setIsMobilePanelOpen] = React.useState(false);
  const [activeItemKey, setActiveItemKey] = React.useState(() =>
    getDefaultItemKey(navModules[0]),
  );

  const activeModule =
    navModules.find((module) => module.id === activeKey) ?? navModules[0];
  const activeItemLabel = getActiveItemLabel(activeModule, activeItemKey);

  React.useEffect(() => {
    setActiveItemKey(getDefaultItemKey(activeModule));
  }, [activeModule]);

  return (
    <SidebarProvider
      style={
        {
          '--sidebar-width': '350px',
        } as React.CSSProperties
      }
      className={cn(className)}
    >
      <div className="hidden md:block">
        <AppSidebar
          activeKey={activeKey}
          activeItemKey={activeItemKey}
          onNavChange={setActiveKey}
          onItemChange={setActiveItemKey}
        />
      </div>

      <SidebarInset>
        <header className="sticky top-0 flex h-14 shrink-0 items-center gap-2 border-b bg-background">
          <div className="flex flex-1 items-center gap-2 px-3">
            <ShellBreadcrumb
              moduleLabel={activeModule.label}
              itemLabel={activeItemLabel}
            />
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4">
          <div className="h-[50vh] w-full rounded-xl bg-muted/50" />
          <div className="h-[100vh] w-full rounded-xl bg-muted/50" />
        </div>
      </SidebarInset>

      <SidebarRight />

      <Drawer
        open={isMobilePanelOpen}
        onOpenChange={setIsMobilePanelOpen}
        dismissible
      >
        <DrawerContent className="md:hidden">
          <DrawerHeader>
            <DrawerTitle>{activeModule.label}</DrawerTitle>
          </DrawerHeader>
          <div className="pb-6">
            <ModulePanel
              module={activeModule}
              activeItemKey={activeItemKey}
              onSelectItem={(key) => {
                setActiveItemKey(key);
                setIsMobilePanelOpen(false);
              }}
            />
          </div>
        </DrawerContent>
      </Drawer>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur md:hidden">
        <div className="grid grid-cols-5">
          {navModules.map((module) => {
            const Icon = module.icon;
            const isActive = module.id === activeKey;
            return (
              <button
                key={module.id}
                type="button"
                onClick={() => {
                  setActiveKey(module.id);
                  setIsMobilePanelOpen(true);
                }}
                className={`flex flex-col items-center gap-1 py-2 text-xs ${
                  isActive
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                aria-label={module.label}
              >
                <Icon className="h-5 w-5" />
                <span>{module.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </SidebarProvider>
  );
}
