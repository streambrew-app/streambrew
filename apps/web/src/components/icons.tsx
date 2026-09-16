import type { ChatProvider } from "@streambrew/packages/chat.js";
import type { DonationSource } from "@streambrew/packages/schemas.js";
import * as icons from "lucide-react";

import boostyLogo from "../../assets/chat-providers/boosty.svg";
import kickLogo from "../../assets/chat-providers/kick.svg";
import twitchLogo from "../../assets/chat-providers/twitch.svg";
import vkLogo from "../../assets/chat-providers/vk.svg";
import youtubeLogo from "../../assets/chat-providers/youtube.svg";
import donateStreamLogo from "../../assets/donation-sources/donate_stream.svg";
import donationAlertsLogo from "../../assets/donation-sources/donationalerts.svg";
import streamElementsLogo from "../../assets/donation-sources/streamelements.svg";
import streamlabsLogo from "../../assets/donation-sources/streamlabs.svg";
import tourniquetLogo from "../../assets/donation-sources/tourniquet.svg";

export type IconComponent = icons.LucideIcon;

export const PlatformIcons = {
  youtube: youtubeLogo,
  twitch: twitchLogo,
  kick: kickLogo,
  boosty: boostyLogo,
  vk_video: vkLogo,
} as const satisfies Record<ChatProvider, string>;

export const DonationSourceIcons = {
  donationalerts: donationAlertsLogo,
  donate_stream: donateStreamLogo,
  streamlabs: streamlabsLogo,
  tourniquet: tourniquetLogo,
  streamelements: streamElementsLogo,
} as const satisfies Record<DonationSource, string>;

export const Icons = {
  activity: icons.Activity,
  addVideo: icons.ListPlus,
  addQueue: icons.Plus,
  alerts: icons.Bell,
  audio: icons.Volume2,
  ban: icons.Ban,
  chat: icons.MessagesSquare,
  addSource: icons.Plus,
  bookmark: icons.Bookmark,
  cancel: icons.X,
  checked: icons.Check,
  chevronDown: icons.ChevronDown,
  chevronLeft: icons.ChevronLeft,
  chevronRight: icons.ChevronRight,
  copied: icons.Check,
  copy: icons.Copy,
  connectSource: icons.Plus,
  dashboard: icons.LayoutDashboard,
  dateRange: icons.ChevronDown,
  deadLetter: icons.MailWarning,
  donations: icons.Sparkles,
  disconnectSource: icons.X,
  edit: icons.Pencil,
  externalLink: icons.ExternalLink,
  history: icons.History,
  image: icons.Image,
  filter: icons.SlidersHorizontal,
  greetingAccent: icons.Sparkles,
  help: icons.CircleHelp,
  hideKey: icons.EyeOff,
  integrations: icons.Plug,
  list: icons.List,
  loader: icons.LoaderCircle,
  logout: icons.LogOut,
  moon: icons.Moon,
  moveToQueue: icons.ArrowRightLeft,
  monitor: icons.Monitor,
  multistream: icons.RadioTower,
  manualVideo: icons.UserRoundPlus,
  notWatched: icons.Circle,
  platform: icons.Share2,
  pause: icons.Pause,
  play: icons.Play,
  retry: icons.RotateCcw,
  removeSource: icons.Trash2,
  rotateToken: icons.RefreshCw,
  unread: icons.ArrowDown,
  search: icons.Search,
  save: icons.Save,
  send: icons.Send,
  secure: icons.ShieldCheck,
  settings: icons.Settings,
  showKey: icons.Eye,
  skip: icons.SkipForward,
  submit: icons.Check,
  timeout: icons.TimerOff,
  underDevelopment: icons.Construction,
  testAlert: icons.FlaskConical,
  unban: icons.UserRoundCheck,
  sun: icons.Sun,
  video: icons.Video,
  upload: icons.Upload,
  wallet: icons.Wallet,
  warn: icons.TriangleAlert,
  watched: icons.CheckCircle2,
};
