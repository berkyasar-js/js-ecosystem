import {
  LayoutDashboard, Inbox, CheckSquare, MessageSquare, Contact, FolderKanban, SquareKanban, GitBranch, Gauge, Wallet, Palette, Share2, Film,
  MessagesSquare, Send, Presentation, Megaphone, CalendarDays, Users, UserPlus, Building2, Landmark, ScanFace, ChartColumn, Workflow, Plug,
  ShieldCheck, Settings, Store, UserCircle, LayoutGrid, type LucideIcon,
} from 'lucide-react';

export const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard, inbox: Inbox, mywork: CheckSquare, messages: MessageSquare, crm: Contact, projects: FolderKanban, tasks: SquareKanban,
  flow: GitBranch, resources: Gauge, finance: Wallet, studio: Palette, social: Share2, media: Film, review: MessagesSquare, transfer: Send,
  present: Presentation, marketing: Megaphone, events: CalendarDays, people: Users, hire: UserPlus, portal: Building2, board: Landmark, twins: ScanFace,
  insights: ChartColumn, automation: Workflow, connect: Plug, approvals: ShieldCheck, admin: Settings, marketplace: Store, profile: UserCircle, apps: LayoutGrid,
};
