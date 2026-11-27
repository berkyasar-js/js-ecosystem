import {
  LayoutDashboard, Inbox, CheckSquare, MessageSquare, Contact, FolderKanban, SquareKanban, GitBranch, Gauge, Wallet, Palette, Share2, Film,
  MessagesSquare, Send, Presentation, Megaphone, CalendarDays, Users, UserPlus, Building2, Landmark, ScanFace, ChartColumn, Workflow, Plug,
  ShieldCheck, Settings, Store, UserCircle, LayoutGrid, Bot, Sparkles, BotMessageSquare,
} from 'lucide-react';
import { atelier, type AppIcon } from './atelier-icon';

/** Ana gezinme alanları Atelier sprite ikonlarını kullanır (ATELIER, öncelikli); kalan modüller lucide ile devam eder. */
const LUCIDE: Record<string, AppIcon> = {
  dashboard: LayoutDashboard, inbox: Inbox, mywork: CheckSquare, messages: MessageSquare, crm: Contact, projects: FolderKanban, tasks: SquareKanban,
  flow: GitBranch, resources: Gauge, finance: Wallet, studio: Palette, social: Share2, media: Film, review: MessagesSquare, transfer: Send,
  present: Presentation, marketing: Megaphone, events: CalendarDays, people: Users, hire: UserPlus, portal: Building2, board: Landmark, twins: ScanFace,
  insights: ChartColumn, automation: Workflow, connect: Plug, approvals: ShieldCheck, admin: Settings, marketplace: Store, profile: UserCircle, apps: LayoutGrid, agency: Bot, aihub: Sparkles, myagents: BotMessageSquare,
};
const ATELIER: Record<string, AppIcon> = {
  dashboard: atelier('overview'), inbox: atelier('inbox'), projects: atelier('projects'), crm: atelier('clients'), studio: atelier('production'),
  people: atelier('team'), finance: atelier('finance'), messages: atelier('messages'), apps: atelier('apps'), approvals: atelier('approval'), insights: atelier('chart'),
};
export const ICONS: Record<string, AppIcon> = { ...LUCIDE, ...ATELIER };
