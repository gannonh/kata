"use client";

import {
  Archive,
  ArrowLeft,
  Bug,
  ChevronDown,
  Clock,
  CommandIcon,
  File,
  Inbox,
  Lightbulb,
  MailOpen,
  MessageSquare,
  MoreHorizontal,
  PanelRight,
  Plus,
  Search,
  Send,
  Sparkles,
  Trash2,
  User,
  UserCheck,
  Users,
} from "lucide-react";
import * as React from "react";

import { cn } from "@renderer/lib/cn";

import { LogoImage } from "@renderer/components/shadcnblocks/logo";
import { Avatar, AvatarFallback, AvatarImage } from "@renderer/components/ui/avatar";
import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@renderer/components/ui/command";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@renderer/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@renderer/components/ui/dropdown-menu";
import { ScrollArea } from "@renderer/components/ui/scroll-area";
import {
  Sidebar,
  SidebarContent,
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
  useSidebar,
} from "@renderer/components/ui/sidebar";
import { Textarea } from "@renderer/components/ui/textarea";

type NavItemId =
  | "inbox"
  | "unassigned"
  | "assigned"
  | "drafts"
  | "archived"
  | "spam";

type BucketId = "support" | "bugs" | "features" | "internal";

type TicketStatus = "active" | "pending" | "closed";

type NavItem = {
  id: NavItemId;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  count?: number;
};

type Bucket = {
  id: BucketId;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
};

type User = {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role?: string;
};

type Customer = {
  id: string;
  name: string;
  email: string;
  company: string;
  role: string;
  avatar: string;
  isHighValue: boolean;
};

type Message = {
  id: string;
  sender: User | Customer;
  content: string;
  timestamp: string;
  date: string;
  isStaff: boolean;
};

type Ticket = {
  id: string;
  subject: string;
  preview: string;
  timestamp: string;
  read: boolean;
  customer: Customer;
  assignee?: User;
  status: TicketStatus;
  messages: Message[];
  respondingUser?: User;
};

type PreviousConversation = {
  id: string;
  subject: string;
  timestamp: string;
};

const navItems: NavItem[] = [
  { id: "inbox", label: "Inbox", icon: Inbox, count: 6 },
  { id: "unassigned", label: "Unassigned", icon: MailOpen, count: 10 },
  { id: "assigned", label: "Assigned", icon: UserCheck, count: 3 },
  { id: "drafts", label: "Drafts", icon: File, count: 1 },
  { id: "archived", label: "Archived", icon: Archive },
  { id: "spam", label: "Spam", icon: Trash2 },
];

const buckets: Bucket[] = [
  { id: "support", label: "Support requests", icon: MessageSquare },
  { id: "bugs", label: "Bug reports", icon: Bug },
  { id: "features", label: "Feature requests", icon: Lightbulb },
  { id: "internal", label: "Internal", icon: Users },
];

const staffUsers: User[] = [
  {
    id: "peter",
    name: "Peter Lann",
    email: "peter.lann@cloudstar.com",
    avatar: "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/avatar/avatar2.webp",
    role: "Support Agent",
  },
  {
    id: "alex",
    name: "Alex Chen",
    email: "alex.chen@cloudstar.com",
    avatar: "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/avatar/avatar3.webp",
    role: "Support Agent",
  },
];

const mockCustomers: Customer[] = [
  {
    id: "sarah",
    name: "Sarah Tran",
    email: "sarah.tran@example.com",
    company: "BrightWave Marketing",
    role: "Ops Manager",
    avatar: "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/avatar/avatar1.webp",
    isHighValue: true,
  },
  {
    id: "mike",
    name: "Mike Johnson",
    email: "mike.j@techcorp.io",
    company: "TechCorp",
    role: "Developer",
    avatar: "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/avatar/avatar4.webp",
    isHighValue: false,
  },
];

const mockTickets: Ticket[] = [
  {
    id: "1",
    subject: "Trouble connecting Slack integration",
    preview:
      "Our team is trying to connect Slack with CloudStar, but the authorization process fails with...",
    timestamp: "6h ago",
    read: false,
    customer: mockCustomers[0],
    assignee: staffUsers[0],
    status: "active",
    respondingUser: staffUsers[0],
    messages: [
      {
        id: "m1",
        sender: mockCustomers[0],
        content: `Hi CloudStar Support,

Our team is trying to connect Slack with CloudStar, but the authorization process fails with the following error message: "OAuth token invalid."

We've tried reconnecting a couple of times and even restarted the workspace, but no luck.

Could you help us get this integration working?

Thanks,
Sarah Tran
Ops Manager, BrightWave Marketing`,
        timestamp: "8:03 AM",
        date: "Aug 29",
        isStaff: false,
      },
      {
        id: "m2",
        sender: staffUsers[0],
        content: `Hi Sarah,

Thanks for reaching out — happy to help! That error usually happens when Slack doesn't grant CloudStar the right permissions during the connection step. Here are a few things to try:

1. Make sure you're logged into the correct Slack workspace before starting the connection.
2. When prompted, grant all requested permissions to CloudStar (sometimes "Deny" is clicked accidentally).
3. Try using a private/incognito browser window to rule out cached credentials.

Let me know if that helps or if you're still seeing the error!`,
        timestamp: "12:56 PM",
        date: "Aug 29",
        isStaff: true,
      },
    ],
  },
  {
    id: "2",
    subject: "Missing files in shared workspace",
    preview:
      "Yesterday I uploaded a set of project files to our shared workspace. Today, two of the files are no...",
    timestamp: "6h ago",
    read: false,
    customer: mockCustomers[1],
    status: "active",
    respondingUser: staffUsers[1],
    messages: [],
  },
  {
    id: "3",
    subject: "Billing discrepancy on latest invoice",
    preview:
      "Our invoice for this month shows 10 Pro licenses, but we only have 8 active users. Can you review...",
    timestamp: "8h ago",
    read: true,
    customer: mockCustomers[0],
    status: "pending",
    messages: [],
  },
  {
    id: "4",
    subject: "Can't reset my password",
    preview:
      'I tried to reset my CloudStar password using the "Forgot Password" link, but the reset email never...',
    timestamp: "12h ago",
    read: true,
    customer: mockCustomers[1],
    status: "active",
    messages: [],
  },
  {
    id: "5",
    subject: "Dashboard analytics not updating",
    preview:
      "The analytics dashboard stopped updating yesterday around 3 PM. All charts are stuck at t...",
    timestamp: "1d ago",
    read: true,
    customer: mockCustomers[0],
    status: "closed",
    messages: [],
  },
  {
    id: "6",
    subject: "Request for HIPAA compliance details",
    preview:
      "Before we move forward with onboarding, our legal team would like documentation on CloudSt...",
    timestamp: "2w ago",
    read: true,
    customer: mockCustomers[1],
    status: "pending",
    messages: [],
  },
];

const previousConversations: PreviousConversation[] = [
  {
    id: "prev1",
    subject: "Trouble connecting Slack integration",
    timestamp: "6h ago",
  },
  {
    id: "prev2",
    subject: "API token expiry",
    timestamp: "2w ago",
  },
];

function getInitials(name: string) {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "U"
  );
}

function getStatusColor(status: TicketStatus) {
  switch (status) {
    case "active":
      return "bg-emerald-500";
    case "pending":
      return "bg-amber-500";
    case "closed":
      return "bg-muted-foreground";
    default:
      return "bg-muted-foreground";
  }
}

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  activeNavItem: NavItemId;
  activeBucket: BucketId | null;
  onNavItemChange: (id: NavItemId) => void;
  onBucketChange: (id: BucketId | null) => void;
  onSearchClick: () => void;
}

function AppSidebar({
  activeNavItem,
  activeBucket,
  onNavItemChange,
  onBucketChange,
  onSearchClick,
  className,
  ...props
}: AppSidebarProps) {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";
  return (
    <Sidebar
      collapsible="offcanvas"
      variant="inset"
      className={cn(className)}
      {...props}
    >
      <SidebarHeader
        className={cn("flex h-14 flex-row items-center justify-between")}
      >
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <div className="flex w-full items-center group-data-[collapsible=icon]:justify-center">
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="flex h-auto items-center gap-3 p-0! hover:bg-transparent"
                  >
                    <LogoImage
                      src="https://deifkwefumgah.cloudfront.net/shadcnblocks/block/block-1.svg"
                      alt="Zerostatic Studio"
                      className="h-8 w-8 rounded-sm bg-muted p-1"
                    />
                    {!isCollapsed && (
                      <>
                        <span className="font-semibold">Shadcnblocks</span>
                        <ChevronDown className="size-3 text-muted-foreground" />
                      </>
                    )}
                  </Button>
                </DropdownMenuTrigger>
              </div>
              <DropdownMenuContent className="w-56" align="start">
                <DropdownMenuLabel>Workspace</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem>Workspace settings</DropdownMenuItem>
                  <DropdownMenuItem>Invite teammates</DropdownMenuItem>
                  <DropdownMenuItem>Billing</DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem>Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
        <Button variant="ghost" size="icon" className="size-7">
          <MoreHorizontal className="size-4" />
        </Button>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="py-2">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={onSearchClick} className="px-2">
                  <Search className="size-4" />
                  <span>Search</span>
                  <kbd className="ml-auto hidden items-center justify-center rounded-md font-mono font-medium text-muted-foreground/70 sm:flex">
                    <CommandIcon
                      className="size-3 font-medium"
                      strokeWidth={1.5}
                    />
                    <span>K</span>
                  </kbd>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="py-0">
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive =
                  activeNavItem === item.id && activeBucket === null;
                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      onClick={() => {
                        onNavItemChange(item.id);
                        onBucketChange(null);
                      }}
                      isActive={isActive}
                      className="px-2"
                    >
                      <Icon className="size-4" />
                      <span>{item.label}</span>
                      {item.count !== undefined && (
                        <SidebarMenuBadge>{item.count}</SidebarMenuBadge>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Buckets</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {buckets.map((bucket) => {
                const Icon = bucket.icon;
                return (
                  <SidebarMenuItem key={bucket.id}>
                    <SidebarMenuButton
                      onClick={() => onBucketChange(bucket.id)}
                      isActive={activeBucket === bucket.id}
                      className="px-2"
                    >
                      <Icon className="size-4" />
                      <span>{bucket.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

interface TicketListPanelProps {
  tickets: Ticket[];
  selectedTicketId: string | null;
  onTicketSelect: (ticketId: string) => void;
  activeNavItem: NavItemId;
}

function TicketListPanel({
  tickets,
  selectedTicketId,
  onTicketSelect,
  activeNavItem,
}: TicketListPanelProps) {
  const navItem = navItems.find((item) => item.id === activeNavItem);
  const title = navItem?.label ?? "Inbox";

  return (
    <div className="flex h-full w-1/4 max-w-[320px] min-w-[240px] shrink-0 flex-col overflow-hidden border-r bg-background">
      <div className="flex h-14 shrink-0 items-center justify-between border-b px-4">
        <div className="truncate text-base font-medium text-foreground">
          Your {title}
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {tickets.map((ticket) => {
          const isSelected = selectedTicketId === ticket.id;
          return (
            <button
              type="button"
              key={ticket.id}
              onClick={() => onTicketSelect(ticket.id)}
              className={cn(
                "w-full border-b p-4 text-left text-sm leading-tight last:border-b-0 hover:bg-muted/50",
                !ticket.read && "bg-muted/30",
                isSelected && "bg-muted",
              )}
            >
              <div className="min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "truncate text-sm",
                      !ticket.read && "font-semibold",
                    )}
                  >
                    {ticket.subject}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                  {ticket.preview}
                </p>
                {ticket.respondingUser && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Avatar className="size-4">
                      <AvatarImage
                        src={ticket.respondingUser.avatar}
                        alt={ticket.respondingUser.name}
                      />
                      <AvatarFallback className="text-[8px]">
                        {getInitials(ticket.respondingUser.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span>
                      {ticket.respondingUser.name.split(" ")[0]} is
                      responding...
                    </span>
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </ScrollArea>
    </div>
  );
}

interface MessageBubbleProps {
  message: Message;
}

function MessageBubble({ message }: MessageBubbleProps) {
  const sender = message.sender;
  const isCustomer = "company" in sender;

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <Avatar className="mt-0.5 size-10 shrink-0">
          <AvatarImage src={sender.avatar} alt={sender.name} />
          <AvatarFallback className="bg-primary text-xs font-medium text-primary-foreground">
            {getInitials(sender.name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{sender.name}</span>
            {!isCustomer && (
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                Staff
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>From</span>
            <span>{sender.email}</span>
          </div>
          <span className="text-xs text-muted-foreground">
            {message.date}, {message.timestamp}
          </span>
        </div>
      </div>
      <div className="pl-13 text-sm leading-relaxed whitespace-pre-wrap">
        {message.content}
      </div>
    </div>
  );
}

interface ReplyComposerProps {
  recipientEmail: string;
  respondingUser?: User;
}

function ReplyComposer({ recipientEmail, respondingUser }: ReplyComposerProps) {
  return (
    <div className="shrink-0 border-t bg-background px-6 py-4 lg:px-10">
      <div className="mx-auto max-w-3xl rounded-lg border bg-muted/30">
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <ArrowLeft className="size-4 shrink-0 rotate-[135deg] text-muted-foreground" />
          <span className="truncate text-sm text-muted-foreground">
            {recipientEmail}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-6 shrink-0 px-2 text-xs"
          >
            Cc
          </Button>
        </div>
        <Textarea
          placeholder="Write a reply..."
          className="min-h-[80px] resize-none border-0 bg-transparent focus-visible:ring-0 md:min-h-[100px]"
        />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="size-8 shrink-0">
              <Plus className="size-4" />
            </Button>
            <span className="hidden text-xs text-muted-foreground sm:inline">
              Use <kbd className="rounded bg-muted px-1">/</kbd> for shortcuts
            </span>
          </div>
          <div className="flex items-center gap-2">
            {respondingUser && (
              <div className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
                <Avatar className="size-5">
                  <AvatarImage
                    src={respondingUser.avatar}
                    alt={respondingUser.name}
                  />
                  <AvatarFallback className="text-[8px]">
                    {getInitials(respondingUser.name)}
                  </AvatarFallback>
                </Avatar>
                <span>
                  {respondingUser.name.split(" ")[0]} is responding...
                </span>
              </div>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1">
                  Close
                  <ChevronDown className="size-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>Close as resolved</DropdownMenuItem>
                <DropdownMenuItem>Close as spam</DropdownMenuItem>
                <DropdownMenuItem>Close without reply</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" className="gap-1">
              <Send className="size-3" />
              Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface InboxAgentPanelProps {
  ticket: Ticket;
  previousConversations: PreviousConversation[];
}

function InboxAgentPanel({
  ticket,
  previousConversations,
}: InboxAgentPanelProps) {
  const customer = ticket.customer;

  return (
    <div className="flex h-full w-1/4 max-w-[360px] min-w-[280px] shrink-0 flex-col overflow-hidden border-l bg-background">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <Sparkles className="size-4" />
        <span className="font-semibold">Inbox Agent</span>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-6 p-4">
          <section className="space-y-3">
            <div className="flex items-start gap-3">
              <Avatar className="size-10 shrink-0">
                <AvatarImage src={customer.avatar} alt={customer.name} />
                <AvatarFallback className="bg-primary font-medium text-primary-foreground">
                  {getInitials(customer.name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="font-medium">{customer.name}</div>
                <div className="text-sm text-muted-foreground">
                  {customer.role}, {customer.company}
                </div>
                {customer.isHighValue && (
                  <Badge
                    variant="outline"
                    className="mt-1.5 border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
                  >
                    High value customer
                  </Badge>
                )}
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <p className="text-muted-foreground">
                Customer seems calm, but has potential to become frustrated.
                Likely non-technical as she hasn&apos;t read the documentation
                guide on the Slack integration.
              </p>
              <p className="mt-3 text-muted-foreground">
                Peter replied with the necessary details to fix her issue, but
                she has yet to confirm whether or not her issue has been
                resolved.
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <p className="text-sm text-muted-foreground">
              If the customer doesn&apos;t reply within the next 12 hours a
              follow up should be sent:
            </p>
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <p>
                Hi Sarah, just following up to see if you managed to get the
                integration working?
              </p>
              <p className="mt-2">
                If you&apos;re still struggling, I&apos;d be happy to schedule a
                call to make sure we can get you up and running.
              </p>
              <p className="mt-2">Regards, Peter Lann</p>
            </div>
            <Button variant="outline" className="w-full gap-2">
              <Clock className="size-4" />
              Schedule follow up
            </Button>
          </section>

          <section className="space-y-3">
            <p className="text-xs font-medium tracking-wide text-muted-foreground">
              Previous conversations
            </p>
            <div className="space-y-2">
              {previousConversations.map((conv) => (
                <button
                  key={conv.id}
                  type="button"
                  className="flex w-full items-start justify-between gap-2 rounded-md p-2 text-left hover:bg-muted"
                >
                  <span className="line-clamp-2 text-sm">{conv.subject}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {conv.timestamp}
                  </span>
                </button>
              ))}
            </div>
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}

interface TicketCommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tickets: Ticket[];
  onTicketSelect: (ticketId: string) => void;
  onNavItemSelect: (navItemId: NavItemId) => void;
}

function TicketCommandPalette({
  open,
  onOpenChange,
  tickets,
  onTicketSelect,
  onNavItemSelect,
}: TicketCommandPaletteProps) {
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search tickets, customers, or navigate..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Tickets">
          {tickets.slice(0, 5).map((ticket) => (
            <CommandItem
              key={ticket.id}
              onSelect={() => {
                onTicketSelect(ticket.id);
                onOpenChange(false);
              }}
            >
              <MessageSquare className="mr-2 size-4" />
              <span className="truncate">{ticket.subject}</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {ticket.timestamp}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Customers">
          {mockCustomers.map((customer) => (
            <CommandItem key={customer.id}>
              <User className="mr-2 size-4" />
              <span>{customer.name}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {customer.company}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <CommandItem
                key={item.id}
                onSelect={() => {
                  onNavItemSelect(item.id);
                  onOpenChange(false);
                }}
              >
                <Icon className="mr-2 size-4" />
                <span>{item.label}</span>
                {item.count !== undefined && (
                  <Badge variant="secondary" className="ml-auto">
                    {item.count}
                  </Badge>
                )}
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

export function ApplicationShell10() {
  const [activeNavItem, setActiveNavItem] = React.useState<NavItemId>("inbox");
  const [activeBucket, setActiveBucket] = React.useState<BucketId | null>(null);
  const [selectedTicketId, setSelectedTicketId] = React.useState<string | null>(
    mockTickets[0]?.id ?? null,
  );
  const [tickets, setTickets] = React.useState<Ticket[]>(mockTickets);
  const [isAgentPanelOpen, setIsAgentPanelOpen] = React.useState(true);
  const [isCommandOpen, setIsCommandOpen] = React.useState(false);
  const [isMobileTicketListOpen, setIsMobileTicketListOpen] =
    React.useState(false);
  const [isMobileConversationOpen, setIsMobileConversationOpen] =
    React.useState(false);
  const [isMobileAgentOpen, setIsMobileAgentOpen] = React.useState(false);

  const selectedTicket = tickets.find((t) => t.id === selectedTicketId) ?? null;

  // Keyboard shortcut for command palette
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setIsCommandOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const handleTicketSelect = (ticketId: string) => {
    setSelectedTicketId(ticketId);
    setTickets((prev) =>
      prev.map((t) => (t.id === ticketId ? { ...t, read: true } : t)),
    );
    if (window.innerWidth < 768) {
      setIsMobileConversationOpen(true);
    }
  };

  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <AppSidebar
        activeNavItem={activeNavItem}
        activeBucket={activeBucket}
        onNavItemChange={setActiveNavItem}
        onBucketChange={setActiveBucket}
        onSearchClick={() => setIsCommandOpen(true)}
        className="hidden md:flex"
      />

      <div className="flex h-full flex-col overflow-hidden pb-16 md:hidden">
        <div className="flex h-14 shrink-0 items-center justify-between border-b px-4">
          <div className="flex items-center gap-2">
            <LogoImage
              src="https://deifkwefumgah.cloudfront.net/shadcnblocks/block/block-1.svg"
              alt="Shadcnblocks"
              className="h-8 w-8 rounded-sm bg-muted p-1"
            />
            <span className="font-semibold">
              Your{" "}
              {navItems.find((item) => item.id === activeNavItem)?.label ??
                "Inbox"}
            </span>
          </div>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          {tickets.map((ticket) => {
            const isSelected = selectedTicketId === ticket.id;
            return (
              <button
                type="button"
                key={ticket.id}
                onClick={() => handleTicketSelect(ticket.id)}
                className={cn(
                  "w-full border-b p-4 text-left text-sm leading-tight last:border-b-0 hover:bg-muted/50",
                  !ticket.read && "bg-muted/30",
                  isSelected && "bg-muted",
                )}
              >
                <div className="min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "truncate text-sm",
                        !ticket.read && "font-semibold",
                      )}
                    >
                      {ticket.subject}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {ticket.timestamp}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                    {ticket.preview}
                  </p>
                  {ticket.respondingUser && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Avatar className="size-4">
                        <AvatarImage
                          src={ticket.respondingUser.avatar}
                          alt={ticket.respondingUser.name}
                        />
                        <AvatarFallback className="text-[8px]">
                          {getInitials(ticket.respondingUser.name)}
                        </AvatarFallback>
                      </Avatar>
                      <span>
                        {ticket.respondingUser.name.split(" ")[0]} is
                        responding...
                      </span>
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </ScrollArea>
      </div>

      <SidebarInset className="hidden min-h-0 overflow-hidden md:flex">
        <div className="flex h-full w-full">
          <TicketListPanel
            tickets={tickets}
            selectedTicketId={selectedTicketId}
            onTicketSelect={handleTicketSelect}
            activeNavItem={activeNavItem}
          />

          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {selectedTicket ? (
              <>
                <header className="flex h-14 shrink-0 items-center justify-between border-b bg-background px-4">
                  <div className="flex items-center gap-3">
                    <MessageSquare className="size-5" />
                    <span className="font-medium">
                      Re: {selectedTicket.subject}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-1.5">
                          <span
                            className={cn(
                              "size-2 rounded-full",
                              getStatusColor(selectedTicket.status),
                            )}
                          />
                          <span className="capitalize">
                            {selectedTicket.status}
                          </span>
                          <ChevronDown className="size-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>Active</DropdownMenuItem>
                        <DropdownMenuItem>Pending</DropdownMenuItem>
                        <DropdownMenuItem>Closed</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => setIsAgentPanelOpen(!isAgentPanelOpen)}
                    >
                      <PanelRight
                        className={cn(
                          "size-4",
                          isAgentPanelOpen && "text-primary",
                        )}
                      />
                    </Button>
                  </div>
                </header>

                <ScrollArea className="min-h-0 flex-1">
                  <div className="px-6 py-6 lg:px-10">
                    <div className="mx-auto max-w-3xl space-y-8">
                      {selectedTicket.messages.map((message) => (
                        <MessageBubble key={message.id} message={message} />
                      ))}
                    </div>
                  </div>
                </ScrollArea>

                <ReplyComposer
                  recipientEmail={selectedTicket.customer.email}
                  respondingUser={selectedTicket.respondingUser}
                />
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <MessageSquare className="mx-auto size-12 opacity-50" />
                  <p className="mt-2 text-sm">Select a ticket to view</p>
                </div>
              </div>
            )}
          </div>

          {isAgentPanelOpen && selectedTicket && (
            <InboxAgentPanel
              ticket={selectedTicket}
              previousConversations={previousConversations}
            />
          )}
        </div>
      </SidebarInset>

      <TicketCommandPalette
        open={isCommandOpen}
        onOpenChange={setIsCommandOpen}
        tickets={tickets}
        onTicketSelect={handleTicketSelect}
        onNavItemSelect={(navItemId) => {
          setActiveNavItem(navItemId);
          setActiveBucket(null);
        }}
      />

      <Drawer
        open={isMobileTicketListOpen}
        onOpenChange={setIsMobileTicketListOpen}
        dismissible
      >
        <DrawerContent className="h-[85vh] md:hidden">
          <DrawerHeader>
            <DrawerTitle>Tickets</DrawerTitle>
          </DrawerHeader>
          <ScrollArea className="min-h-0 flex-1 px-4">
            {tickets.map((ticket) => (
              <button
                type="button"
                key={ticket.id}
                onClick={() => {
                  handleTicketSelect(ticket.id);
                  setIsMobileTicketListOpen(false);
                }}
                className={cn(
                  "w-full border-b p-4 text-left text-sm",
                  !ticket.read && "bg-muted/30",
                )}
              >
                <div className="min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "truncate",
                        !ticket.read && "font-semibold",
                      )}
                    >
                      {ticket.subject}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {ticket.timestamp}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {ticket.preview}
                  </p>
                </div>
              </button>
            ))}
          </ScrollArea>
        </DrawerContent>
      </Drawer>

      <Drawer
        open={isMobileConversationOpen}
        onOpenChange={setIsMobileConversationOpen}
        dismissible
      >
        <DrawerContent className="h-[90vh] overflow-hidden md:hidden">
          <DrawerHeader className="sr-only">
            <DrawerTitle>Conversation</DrawerTitle>
          </DrawerHeader>
          {selectedTicket && (
            <div className="flex h-full min-h-0 flex-col overflow-hidden">
              <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
                <span className="line-clamp-1 font-medium">
                  {selectedTicket.subject}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  onClick={() => setIsMobileAgentOpen(true)}
                >
                  <Sparkles className="size-4" />
                </Button>
              </div>
              <ScrollArea className="min-h-0 flex-1">
                <div className="space-y-6 p-4">
                  {selectedTicket.messages.map((message) => (
                    <MessageBubble key={message.id} message={message} />
                  ))}
                </div>
              </ScrollArea>
              <div className="shrink-0">
                <ReplyComposer
                  recipientEmail={selectedTicket.customer.email}
                  respondingUser={selectedTicket.respondingUser}
                />
              </div>
            </div>
          )}
        </DrawerContent>
      </Drawer>

      <Drawer
        open={isMobileAgentOpen}
        onOpenChange={setIsMobileAgentOpen}
        dismissible
      >
        <DrawerContent className="h-[85vh] md:hidden">
          <DrawerHeader>
            <DrawerTitle className="flex items-center gap-2">
              <Sparkles className="size-4" />
              Inbox Agent
            </DrawerTitle>
          </DrawerHeader>
          {selectedTicket && (
            <ScrollArea className="min-h-0 flex-1 px-4 pb-6">
              <div className="space-y-6">
                <section className="space-y-3">
                  <div className="flex items-start gap-3">
                    <Avatar className="size-10 shrink-0">
                      <AvatarImage
                        src={selectedTicket.customer.avatar}
                        alt={selectedTicket.customer.name}
                      />
                      <AvatarFallback>
                        {getInitials(selectedTicket.customer.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">
                        {selectedTicket.customer.name}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {selectedTicket.customer.role},{" "}
                        {selectedTicket.customer.company}
                      </div>
                      {selectedTicket.customer.isHighValue && (
                        <Badge
                          variant="outline"
                          className="mt-1.5 border-amber-500 bg-amber-50 text-amber-700"
                        >
                          High value
                        </Badge>
                      )}
                    </div>
                  </div>
                </section>

                <section className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                  <p>
                    Customer seems calm, but has potential to become frustrated.
                  </p>
                </section>

                <section className="space-y-3">
                  <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                    <p>Hi Sarah, just following up...</p>
                  </div>
                  <Button variant="outline" className="w-full gap-2">
                    <Clock className="size-4" />
                    Schedule follow up
                  </Button>
                </section>
              </div>
            </ScrollArea>
          )}
        </DrawerContent>
      </Drawer>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur md:hidden">
        <div className="grid grid-cols-5">
          {[
            {
              id: "inbox",
              label: "Inbox",
              icon: Inbox,
              onClick: () => {
                setActiveNavItem("inbox");
                setIsMobileTicketListOpen(true);
              },
            },
            {
              id: "unassigned",
              label: "Unassigned",
              icon: MailOpen,
              onClick: () => {
                setActiveNavItem("unassigned");
                setIsMobileTicketListOpen(true);
              },
            },
            {
              id: "assigned",
              label: "Assigned",
              icon: UserCheck,
              onClick: () => {
                setActiveNavItem("assigned");
                setIsMobileTicketListOpen(true);
              },
            },
            {
              id: "search",
              label: "Search",
              icon: Search,
              onClick: () => setIsCommandOpen(true),
            },
            {
              id: "more",
              label: "More",
              icon: MoreHorizontal,
              onClick: () => {},
            },
          ].map((item) => {
            const Icon = item.icon;
            const isActive = activeNavItem === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={item.onClick}
                className={cn(
                  "flex flex-col items-center gap-1 py-2 text-xs",
                  isActive
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </SidebarProvider>
  );
}
